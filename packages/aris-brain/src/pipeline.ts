/**
 * Luồng nạp của bộ não (giai đoạn 5, đợt 2a): Hộp thư vào → trích chữ → phân loại → Thủ thư lập bản nạp
 * trên bản nháp (`brain_draft`) → duyệt (tự nạp / duyệt nhanh / duyệt kỹ) → ghép (gộp ba chiều, một
 * commit) → nhật ký, hoàn tác. Tự nạp nhật ký lúc 23:00; `/note` ghi nhanh vào nhật ký hôm nay.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Entry } from './catalog.js'
import { fetchPage, safeUrl, sourceFile, sourceText } from './extract.js'
import { extractNative, fileKind } from './native.js'
import { merge3, type VaultGit } from './git.js'
import {
  checkDraftPath,
  classifyPrompt,
  DIARY_HOUR,
  inboxName,
  isOpen,
  LIBRARIAN_DAILY_USD,
  librarianPrompt,
  logLine,
  nextToPlan,
  OP_KINDS,
  pageSummary,
  parseClassify,
  renderIndex,
  review,
  stampFront,
  staleAction,
  type Batch,
  type Op,
  type OpKind,
} from './ingest.js'
import { parsePage } from './page.js'
import { dayKey, SPACES, type Space } from './vault.js'

/** Tệp gửi vào lớn hơn chừng này thì từ chối. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024
/** Thủ thư lập một bản nạp lâu hơn chừng này thì dừng. */
const PLAN_TIMEOUT_MS = 10 * 60_000
const TICK_MS = 5000

export interface Table<V> {
  get(k: string): V | undefined
  entries(): Iterable<[string, V]>
  put(k: string, v: V): Promise<void>
  delete(k: string): Promise<boolean>
}

export interface IngestState {
  /** Tiền Thủ thư đã dùng trong ngày. */
  spendDay?: string | undefined
  spendUsd?: number | undefined
  /** Ngày đã tự nạp nhật ký, theo không gian. */
  diaryDone?: Record<string, string> | undefined
}

export interface IngestDeps {
  ctx: Context
  logger: { info(...a: unknown[]): void; warn(...a: unknown[]): void }
  root: string
  git: VaultGit
  hasGit: boolean
  batches: Table<Batch>
  state: () => IngestState
  saveState: (s: IngestState) => Promise<void>
  catalog: { all(): Entry[]; get(path: string): (Entry & { body: string }) | undefined }
  indexFile: (rel: string) => Promise<Entry | undefined>
  who: () => string
  depts: () => { id: string; name: string }[]
  librarian: string
  open: (bot: string) => Promise<string>
  /** Mã bot của một phiên (ghi nguồn do bot nào gửi). */
  botOf: (sessionId: string | undefined) => string
  /** Chép lời một tệp ghi âm (dịch vụ nhận giọng nói của dsh); không có thì báo lỗi. */
  transcribe: (audio: Uint8Array) => Promise<string>
}

interface SessionPort {
  prompt(
    req: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] },
    signal: AbortSignal,
  ): Promise<unknown>
  rename?(req: { sessionId: string; title: string }): Promise<unknown>
  cancel?(req: { sessionId: string }): unknown
  modelCatalog?(): Promise<unknown>
}

type AgentLike = { session: { id: string } }

const SPACE_TITLE: Record<Space, string> = { 'ca-nhan': 'Cá nhân', 'cong-ty': 'Công ty' }

export class IngestError extends Error {}

/** Sự kiện cho kênh Telegram: bản nạp đổi trạng thái; nhắc các bản chờ duyệt quá 7 ngày. */
export type IngestEvent =
  { type: 'status'; batch: Batch; prev?: Batch['status'] | undefined } | { type: 'remind'; batches: Batch[] }

export function startIngest(d: IngestDeps) {
  const { ctx, logger, root, git, batches } = d
  const sessions = () => ctx.get('sessionController') as SessionPort | undefined
  const now = () => new Date()
  const iso = () => now().toISOString()
  const all = () => [...batches.entries()].map(([, b]) => b)
  const listeners = new Set<(e: IngestEvent) => void>()
  const emit = (e: IngestEvent) => {
    for (const fn of listeners)
      try {
        fn(e)
      } catch (err) {
        logger.warn('báo sự kiện nạp: %s', String(err))
      }
  }
  const put = async (b: Batch) => {
    const prev = batches.get(b.id)?.status
    const next = { ...b, updatedAt: iso() }
    await batches.put(next.id, next)
    if (prev !== next.status) emit({ type: 'status', batch: next, prev })
    return next
  }
  const newId = () => `n-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
  const commit = async (message: string, paths?: string[]) => {
    if (!d.hasGit) return undefined
    return d.git.commit(message, paths).catch((e: unknown) => {
      d.logger.warn('commit: %s', String(e))
      return undefined
    })
  }

  // --- Tiền của Thủ thư ----------------------------------------------------------------------
  const today = () => dayKey(now())
  const spent = () => (d.state().spendDay === today() ? (d.state().spendUsd ?? 0) : 0)
  // Cộng tiền lần lượt: sự kiện tiền về dồn dập, cộng song song thì ghi đè lên nhau.
  let chain: Promise<void> = Promise.resolve()
  const serial = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(() => undefined)
    return chain
  }
  const addSpend = (usd: number) =>
    serial(async () => {
      const s = d.state()
      await d.saveState({
        ...s,
        spendDay: today(),
        spendUsd: (s.spendDay === today() ? (s.spendUsd ?? 0) : 0) + usd,
      })
    })
  /** Phiên Thủ thư đang lập bản nạp → mã bản nạp. */
  const drafting = new Map<string, { batch: string; done: (reason: string) => void }>()
  let offCost: (() => void) | undefined
  ctx.effect(() => () => offCost?.(), 'aris-brain: tiền Thủ thư')
  const hookCost = () => {
    offCost ??= (
      ctx.get('arisSpend') as { onCost?(fn: (s: string, usd: number) => void): () => void } | undefined
    )?.onCost?.((session, usd) => {
      const t = drafting.get(session)
      if (!t) return
      void serial(async () => {
        const b = batches.get(t.batch)
        if (b) await batches.put(b.id, { ...b, cost: b.cost + usd })
      })
      void addSpend(usd)
    })
  }

  // --- Một lần gọi model rẻ (phân loại) ----------------------------------------------------------
  let model: { at: number; ref?: { provider: string; model: string } } | undefined
  async function flash() {
    if (!model || Date.now() - model.at > 600_000) {
      const c = (await sessions()
        ?.modelCatalog?.()
        .catch(() => undefined)) as
        | {
            default?: { provider?: string; model?: string }
            groups: { id: string; models: { id: string; name?: string }[] }[]
          }
        | undefined
      let ref: { provider: string; model: string } | undefined
      if (c) {
        const home = c.groups.find((g) => g.id === c.default?.provider)
        for (const g of [...(home ? [home] : []), ...c.groups]) {
          const m = g.models.find((x) => /flash/i.test(`${x.id} ${x.name ?? ''}`) && !x.id.endsWith(':batch'))
          if (m) {
            ref = { provider: g.id, model: m.id }
            break
          }
        }
        if (!ref && c.default?.provider && c.default.model)
          ref = { provider: c.default.provider, model: c.default.model }
      }
      model = { at: Date.now(), ...(ref ? { ref } : {}) }
    }
    return model.ref
  }
  async function ask(text: string, maxTokens: number): Promise<string | undefined> {
    const m = await flash()
    const llm = ctx.get('llm') as
      | {
          stream(o: Record<string, unknown>): AsyncIterable<{ type: string; text?: string; usage?: unknown }>
        }
      | undefined
    if (!m || !llm) return undefined
    let raw = ''
    let usage: unknown
    for await (const c of llm.stream({
      provider: m.provider,
      model: m.model,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      maxTokens,
    })) {
      if (c.type === 'text-delta' && c.text) raw += c.text
      else if (c.type === 'usage') usage = c.usage
    }
    if (usage) {
      const usd = await (
        ctx.get('arisSpend') as
          { charge?(p: string, m: string, u: unknown, s: readonly string[]): Promise<number> } | undefined
      )
        ?.charge?.(m.provider, m.model, usage, ['brain'])
        .catch(() => 0)
      if (usd) await addSpend(usd)
    }
    return raw
  }

  // --- Vào ---------------------------------------------------------------------------------------
  const readText = (rel: string) => readFile(join(root, rel), 'utf8').catch(() => '')

  /** Bản chữ đi kèm một tệp gốc (cùng tên, đuôi .md). */
  const companionOf = (path: string) => `${path.slice(0, path.length - extname(path).length)}.md`
  /** Tệp .md là bản chữ của một tệp gốc nằm cạnh. */
  const isCompanion = (path: string) =>
    path.endsWith('.md') &&
    d.catalog.all().some((x) => x.path !== path && x.binary && companionOf(x.path) === path)

  /** Chữ của nguồn: tệp chữ đọc thẳng; tệp khác trích ra bản .md đi kèm (một lần). */
  async function sourceTextOf(b: Batch): Promise<string> {
    const kind = fileKind(b.source.path)
    if (kind === 'chu') return sourceText(await readText(b.source.path))
    if (kind === 'khac') throw new IngestError('Loại tệp này chưa đọc được.')
    const side = companionOf(b.source.path)
    if (existsSync(join(root, side))) return sourceText(await readText(side))
    const abs = join(root, b.source.path)
    const text =
      kind === 'ghi-am'
        ? await d.transcribe(new Uint8Array(await readFile(abs)))
        : await extractNative(abs).catch((e: unknown) => {
            throw new IngestError(`Không đọc được tệp: ${e instanceof Error ? e.message : String(e)}`)
          })
    if (!text.trim()) throw new IngestError('Không thấy chữ nào trong tệp (ảnh mờ, ghi âm trống?).')
    const label =
      kind === 'ghi-am' ? 'Bản chép lời' : kind === 'anh' ? 'Chữ nhận dạng từ ảnh' : 'Chữ trích từ tệp'
    await writeFile(
      join(root, side),
      `---\nloai: ${kind === 'ghi-am' ? 'ghi-am' : kind === 'anh' ? 'anh' : 'tai-lieu'}\ntep-goc: ${JSON.stringify(basename(b.source.path))}\n---\n\n# ${b.source.title}\n\n${label} của [[${basename(b.source.path)}]].\n\n${text.trim()}\n`,
    )
    await d.indexFile(side)
    return text.trim()
  }

  /** Tệp mới trong `hop-thu-vao/` chưa có bản nạp: tạo bản nạp. */
  async function scanInbox() {
    const known = new Set(all().map((b) => b.source.path))
    for (const e of d.catalog.all()) {
      if (e.layer !== 'hop-thu-vao' || known.has(e.path) || basename(e.path).startsWith('.')) continue
      // Bản chữ aris trích ra cho một tệp gốc nằm cạnh nó: không phải nguồn riêng.
      if (isCompanion(e.path)) continue
      const kind = fileKind(e.path)
      const ok = kind !== 'khac'
      const at = iso()
      const id = newId()
      await batches.put(id, {
        id,
        createdAt: at,
        updatedAt: at,
        status: ok ? 'moi' : 'chua-doc',
        source: {
          path: e.path,
          title: e.title,
          kind: kind === 'anh' ? 'anh' : kind === 'ghi-am' ? 'ghi-am' : 'tai-lieu',
          from: 'thu-muc',
        },
        ops: [],
        cost: 0,
        ...(ok ? {} : { note: 'Loại tệp này chưa đọc được (Excel, PowerPoint…). Có thể Chỉ lưu tệp gốc.' }),
      })
    }
  }

  /** Người dùng gửi chữ hay link từ màn 5.2 (hay bot, Telegram ở đợt 2b). */
  /** Một tệp gửi vào (tải lên trên web, Telegram, bot): chép vào Hộp thư vào, tạo bản nạp. */
  async function addFile(input: {
    name: string
    data: Uint8Array
    from: Batch['source']['from']
    by?: string
  }) {
    if (input.data.byteLength > FILE_MAX_BYTES) throw new IngestError('Tệp lớn hơn 25 MB.')
    const at = now()
    const ext = extname(input.name)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
    const stem = basename(input.name, extname(input.name))
    const rel = `hop-thu-vao/${inboxName(at, stem).replace(/\.md$/, '')}${ext}`
    await mkdir(join(root, 'hop-thu-vao'), { recursive: true })
    await writeFile(join(root, rel), input.data)
    await d.indexFile(rel)
    const kind = fileKind(rel)
    const id = newId()
    const b: Batch = {
      id,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
      status: kind === 'khac' ? 'chua-doc' : 'moi',
      source: {
        path: rel,
        title: stem.slice(0, 120) || 'Tệp',
        kind: kind === 'anh' ? 'anh' : kind === 'ghi-am' ? 'ghi-am' : kind === 'chu' ? 'ghi-chu' : 'tai-lieu',
        from: input.from,
        ...(input.by ? { by: input.by } : {}),
      },
      ops: [],
      cost: 0,
      ...(kind === 'khac'
        ? { note: 'Loại tệp này chưa đọc được (Excel, PowerPoint…). Có thể Chỉ lưu tệp gốc.' }
        : {}),
    }
    await batches.put(id, b)
    void tick()
    return b
  }

  async function add(input: {
    text?: string
    url?: string
    title?: string
    from: Batch['source']['from']
    by?: string
  }) {
    const at = now()
    let title = input.title?.trim() || ''
    let text = input.text?.trim() ?? ''
    let url: string | undefined
    const u = input.url ? safeUrl(input.url) : !text.includes('\n') && text ? safeUrl(text) : undefined
    if (input.url && !u) throw new IngestError('Link không hợp lệ (chỉ http, https).')
    if (u) {
      url = u.toString()
      const page = await fetchPage(u).catch((e: unknown) => {
        throw new IngestError(`Không tải được trang: ${e instanceof Error ? e.message : String(e)}`)
      })
      title ||= page.title
      text = page.text
    }
    if (!text) throw new IngestError('Chưa có nội dung.')
    title ||=
      text
        .split('\n')[0]!
        .replace(/^#+\s*/, '')
        .slice(0, 80) || 'Ghi chú'
    const rel = `hop-thu-vao/${inboxName(at, title)}`
    await mkdir(join(root, 'hop-thu-vao'), { recursive: true })
    await writeFile(join(root, rel), sourceFile({ title, text, url, from: input.from, at }))
    await d.indexFile(rel)
    const id = newId()
    const b: Batch = {
      id,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
      status: 'moi',
      source: {
        path: rel,
        title,
        kind: url ? 'link' : 'ghi-chu',
        from: input.from,
        ...(url ? { url } : {}),
        ...(input.by ? { by: input.by } : {}),
      },
      ops: [],
      cost: 0,
    }
    await batches.put(id, b)
    void tick()
    return b
  }

  // --- Lập bản nạp ---------------------------------------------------------------------------------
  let busy = false
  async function tick() {
    if (busy) return
    busy = true
    try {
      await scanInbox()
      for (const b of all())
        if (b.status === 'cho-mai' && spent() < LIBRARIAN_DAILY_USD) await put({ ...b, status: 'moi' })
      if (all().some((b) => b.status === 'dang-lap')) return
      const b = nextToPlan(all())
      if (!b || b.status !== 'moi') return
      if (spent() >= LIBRARIAN_DAILY_USD) {
        await put({
          ...b,
          status: 'cho-mai',
          note: `Thủ thư đã dùng hết ${LIBRARIAN_DAILY_USD.toFixed(2)} USD hôm nay; nạp tiếp từ ngày mai.`,
        })
        return
      }
      await plan(b).catch(async (e: unknown) => {
        logger.warn('lập bản nạp %s: %s', b.id, String(e))
        const cur = batches.get(b.id)
        if (cur) await put({ ...cur, status: 'loi', note: e instanceof Error ? e.message : String(e) })
      })
    } finally {
      busy = false
    }
  }

  async function plan(b0: Batch) {
    let b = b0
    const text = await sourceTextOf(b)
    if (!text.trim()) throw new IngestError('Nguồn trống hay không đọc được.')
    if (!b.space) {
      // Model có bước suy nghĩ ăn vào giới hạn token: để rộng (như bước soạn routine).
      const c = parseClassify(
        (await ask(classifyPrompt(text, b.source.title, d.depts()), 3000)) ?? '',
        d.depts(),
      )
      b = await put({
        ...b,
        space: c?.space ?? 'ca-nhan',
        ...(c?.dept ? { dept: c.dept } : {}),
        ...(c?.summary ? { summary: c.summary } : {}),
        // Tiêu đề do người dùng đặt thì giữ; tiêu đề chỉ là tên tệp hay dòng đầu thì dùng tiêu đề phân loại.
        ...(c?.title &&
        (b.source.from !== 'thu-muc' ||
          /\.[a-z0-9]{2,5}$/i.test(b.source.title) ||
          !/\s/.test(b.source.title))
          ? { source: { ...b.source, title: c.title } }
          : {}),
        sensitive: c?.sensitive ?? false,
        ...(c
          ? {}
          : { note: 'Chưa phân loại được nguồn, tạm xếp vào Cá nhân; đổi không gian ở trên nếu cần.' }),
      })
    }
    const space = b.space!
    const sc = sessions()
    if (!sc) throw new IngestError('Chưa có bộ điều khiển phiên.')
    hookCost()
    const sessionId = await d.open(d.librarian)
    b = await put({ ...b, status: 'dang-lap', ops: [], session: sessionId })
    await sc.rename?.({ sessionId, title: `Nạp · ${b.source.title}` }).catch(() => undefined)
    const ended = new Promise<string>((resolve) => {
      drafting.set(sessionId, { batch: b.id, done: resolve })
      setTimeout(() => {
        sc.cancel?.({ sessionId })
        resolve('timeout')
      }, PLAN_TIMEOUT_MS)
    })
    await sc.prompt(
      {
        requestId: randomUUID(),
        sessionId,
        mode: 'queue',
        content: [
          {
            type: 'text',
            text: librarianPrompt({
              rules: await readText('AGENTS.md'),
              spaceRules: await readText(`${space}/AGENTS.md`),
              index: await readText(`${space}/index.md`),
              space,
              dept: b.dept,
              source: { path: b.source.path, title: b.source.title, text, kind: b.source.kind },
              revise: b.revise,
              today: today(),
            }),
          },
        ],
      },
      AbortSignal.timeout(30_000),
    )
    const reason = await ended
    drafting.delete(sessionId)
    const cur = batches.get(b.id)
    // Người dùng đã đổi ý (chỉ lưu, bỏ, đổi không gian) trong lúc Thủ thư lập: bỏ kết quả lần này.
    if (!cur || cur.status !== 'dang-lap' || cur.session !== sessionId) return
    if (reason !== 'completed') {
      await put({
        ...cur,
        status: 'loi',
        note:
          reason === 'timeout' ? 'Thủ thư lập quá 10 phút, đã dừng.' : `Lượt của Thủ thư kết thúc: ${reason}`,
      })
      return
    }
    await finish(cur)
  }

  /** Lượt Thủ thư xong: đánh dấu cần xem, chọn mức duyệt; tự nạp thì ghép luôn. */
  async function finish(b: Batch) {
    const edited = new Set<string>()
    for (const o of b.ops) if (o.base !== undefined && (await userEdited(o.path))) edited.add(o.path)
    const r = review(b, (p) => edited.has(p))
    const ready = await put({
      ...b,
      ops: r.ops,
      level: r.level,
      status: 'cho-duyet',
      ...(b.ops.length ? {} : { note: 'Thủ thư không thấy gì cần ghi thêm vào wiki. Có thể Chỉ lưu nguồn.' }),
    })
    if (r.level === 'tu-nap' && ready.ops.length)
      await approve(
        ready.id,
        ready.ops.map((_, i) => i),
        true,
      )
  }

  /** Trang từng được người dùng sửa tay (commit "<tên> sửa…"). */
  async function userEdited(path: string): Promise<boolean> {
    if (!d.hasGit) return false
    const who = d.who()
    const list = await git.log(path, 3650).catch(() => [])
    return list.some((c) => c.subject.startsWith(`${who} sửa`))
  }

  ctx.on('session/event', (session, event) => {
    const t = drafting.get(session.id)
    if (!t || event.type !== 'turn/end') return
    t.done((event.data as unknown as { reason?: { kind?: string } }).reason?.kind ?? 'completed')
  })

  // --- Công cụ của Thủ thư: ghi lên bản nháp ----------------------------------------------------------
  ctx.tools.register(
    defineTool({
      name: 'brain_draft',
      description:
        'Chỉ dùng khi đang nạp một nguồn vào bộ não: ghi toàn bộ nội dung mới của một trang wiki lên bản nháp (chưa đổi kho thật; người dùng duyệt rồi mới ghép). Gọi một lần cho mỗi trang; gọi lại cùng đường dẫn là thay bản trước.',
      parameters: {
        duong_dan: {
          type: 'string',
          required: true,
          description: 'Đường dẫn trang, ví dụ ca-nhan/wiki/nguoi/chi-ha.md.',
        },
        noi_dung: {
          type: 'string',
          required: true,
          description: 'Toàn bộ nội dung trang (Markdown, có nhãn đầu trang).',
        },
        loai: {
          type: 'string',
          enum: [...OP_KINDS],
          required: true,
          description: 'moi, bo-sung, lien-ket hay sua-y.',
        },
        tom_tat: { type: 'string', required: true, description: 'Một câu tóm tắt trang, cho mục lục.' },
        canh_bao: { type: 'string', description: 'Có mâu thuẫn hay điều người dùng cần xem: nói rõ.' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const sid = (exec.agent as AgentLike | undefined)?.session.id
        const t = sid ? drafting.get(sid) : undefined
        const b = t ? batches.get(t.batch) : undefined
        if (!b?.space) return 'Không làm được: brain_draft chỉ dùng khi đang nạp một nguồn.'
        const path = String(args.duong_dan ?? '').replace(/^\/+/, '')
        const bad = checkDraftPath(path, b.space)
        if (bad) return `Không làm được: ${bad}`
        if (/\/(index|log)\.md$/.test(path)) return 'Không làm được: index.md và log.md do aris giữ.'
        const kind = OP_KINDS.find((k) => k === args.loai) ?? 'bo-sung'
        const prev = b.ops.find((o) => o.path === path)
        const exists = existsSync(join(root, path))
        const base = prev ? prev.base : exists ? await readText(path) : undefined
        const summary = String(args.tom_tat ?? '')
          .trim()
          .slice(0, 200)
        const next = stampFront(String(args.noi_dung ?? ''), { 'tom-tat': summary, 'cap-nhat': today() })
        const op: Op = {
          path,
          title: parsePage(next, basename(path, '.md')).title,
          kind: base === undefined ? 'moi' : kind === 'moi' ? 'bo-sung' : (kind as OpKind),
          ...(base !== undefined ? { base } : {}),
          next,
          summary,
          ...(String(args.canh_bao ?? '').trim() ? { warn: String(args.canh_bao).trim().slice(0, 400) } : {}),
        }
        await put({ ...b, ops: [...b.ops.filter((o) => o.path !== path), op] })
        return `Đã ghi bản nháp ${path} (${op.kind}). Chưa đổi kho thật.`
      },
    }),
  )

  // --- Bot gửi nguồn vào Hộp thư vào -----------------------------------------------------------------
  ctx.tools.register(
    defineTool({
      name: 'brain_capture',
      description:
        'Gửi một nguồn vào Hộp thư vào của bộ não người dùng để Thủ thư nạp vào wiki (người dùng duyệt): chữ, link web, hay một tệp trong thư mục làm việc của bạn (PDF, Word, ảnh, ghi âm, .md). Dùng khi người dùng nhờ lưu, hay khi bạn có kết quả đáng giữ lâu dài.',
      parameters: {
        noi_dung: { type: 'string', description: 'Chữ cần lưu (Markdown).' },
        link: { type: 'string', description: 'Link web cần lưu (http, https).' },
        tep: { type: 'string', description: 'Đường dẫn tệp trong thư mục làm việc của bạn.' },
        tieu_de: { type: 'string', description: 'Tiêu đề ngắn của nguồn.' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as (AgentLike & { session: { header?: { cwd?: string } } }) | undefined
        const by = d.botOf(agent?.session.id)
        try {
          const file = String(args.tep ?? '').trim()
          if (file) {
            const cwd = agent?.session.header?.cwd
            if (!cwd) return 'Không làm được: phiên không có thư mục làm việc.'
            const abs = resolve(cwd, file)
            const rel = relative(resolve(cwd), abs)
            if (rel.startsWith('..') || isAbsolute(rel))
              return 'Không làm được: chỉ gửi được tệp trong thư mục làm việc của bạn.'
            if (abs.startsWith(resolve(root))) return 'Không làm được: tệp này đã nằm trong bộ não.'
            const b = await addFile({
              name: basename(abs),
              data: new Uint8Array(await readFile(abs)),
              from: 'bot',
              by,
            })
            return `Đã gửi tệp «${b.source.title}» vào Hộp thư vào; Thủ thư sẽ lập bản nạp, người dùng duyệt.`
          }
          const b = await add({
            ...(String(args.noi_dung ?? '').trim() ? { text: String(args.noi_dung) } : {}),
            ...(String(args.link ?? '').trim() ? { url: String(args.link) } : {}),
            ...(String(args.tieu_de ?? '').trim() ? { title: String(args.tieu_de) } : {}),
            from: 'bot',
            by,
          })
          return `Đã gửi «${b.source.title}» vào Hộp thư vào; Thủ thư sẽ lập bản nạp, người dùng duyệt.`
        } catch (e) {
          return `Không làm được: ${e instanceof Error ? e.message : String(e)}`
        }
      },
    }),
  )

  /** Nội dung trang trong bản nháp của phiên đang nạp (để `brain_read` thấy bản mới). */
  function draftRead(sessionId: string | undefined, path: string): string | undefined {
    const t = sessionId ? drafting.get(sessionId) : undefined
    const b = t ? batches.get(t.batch) : undefined
    return b?.ops.find((o) => o.path === path)?.next
  }

  // --- Ghép ---------------------------------------------------------------------------------------
  /** Dời nguồn từ Hộp thư vào sang `nguon/<tháng>/` của không gian; commit riêng. */
  async function storeSource(b: Batch): Promise<Batch> {
    if (!b.source.path.startsWith('hop-thu-vao/') || !b.space) return b
    const month = dayKey(now()).slice(0, 7)
    const file = basename(b.source.path)
    let dest = `${b.space}/nguon/${month}/${file}`
    for (let i = 2; existsSync(join(root, dest)); i++)
      dest = `${b.space}/nguon/${month}/${basename(file, extname(file))}-${i}${extname(file)}`
    await mkdir(dirname(join(root, dest)), { recursive: true })
    if (existsSync(join(root, b.source.path))) await rename(join(root, b.source.path), join(root, dest))
    await d.indexFile(b.source.path)
    await d.indexFile(dest)
    const paths = [b.source.path, dest]
    // Bản chữ đi kèm đi theo tệp gốc.
    const side = companionOf(b.source.path)
    if (side !== b.source.path && existsSync(join(root, side))) {
      const sideDest = companionOf(dest)
      await rename(join(root, side), join(root, sideDest))
      await d.indexFile(side)
      await d.indexFile(sideDest)
      paths.push(side, sideDest)
    }
    const sha = await commit(`Lưu nguồn: ${b.source.title}`, paths)
    return put({ ...b, source: { ...b.source, path: dest }, ...(sha ? { sourceCommit: sha } : {}) })
  }

  /** Viết lại `index.md` của không gian từ nhãn `tom-tat` của các trang wiki. */
  async function rebuildIndex(space: Space) {
    const pages = d.catalog
      .all()
      .filter((e) => e.space === space && e.layer === 'wiki' && e.path.endsWith('.md'))
    const list = []
    for (const p of pages)
      list.push({ path: p.path, name: p.name, title: p.title, summary: pageSummary(await readText(p.path)) })
    const rel = `${space}/index.md`
    await writeFile(
      join(root, rel),
      renderIndex(SPACE_TITLE[space], list, space === 'cong-ty' ? d.depts() : []),
    )
    await d.indexFile(rel)
    return rel
  }

  async function appendLog(space: Space, kind: string, text: string) {
    const rel = `${space}/log.md`
    const cur = await readText(rel)
    await writeFile(join(root, rel), `${cur.replace(/\s*$/, '\n')}${logLine(now(), kind, text)}\n`)
    return rel
  }

  async function approve(id: string, chosen: readonly number[], auto = false) {
    let b = batches.get(id)
    if (!b?.space) throw new IngestError('Không có bản nạp này.')
    if (b.status !== 'cho-duyet') throw new IngestError('Bản nạp không ở trạng thái chờ duyệt.')
    const space = b.space
    b = await storeSource(b)
    const conflicts: string[] = []
    const written: string[] = []
    for (const [i, o] of b.ops.entries()) {
      if (!chosen.includes(i)) continue
      const abs = join(root, o.path)
      const current = existsSync(abs) ? await readText(o.path) : undefined
      let text = o.next
      if (current !== undefined && current !== (o.base ?? '')) {
        const m = await merge3(current, o.base ?? '', o.next)
        if (!m.clean) {
          conflicts.push(o.path)
          continue
        }
        text = m.text
      }
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, text)
      await d.indexFile(o.path)
      written.push(o.path)
    }
    const index = await rebuildIndex(space)
    const name = basename(b.source.path, extname(b.source.path))
    const log = await appendLog(
      space,
      auto ? 'tự nạp' : 'nạp',
      `[[${name}]] → ${written.length} trang${conflicts.length ? `, ${conflicts.length} trang chưa ghép` : ''}`,
    )
    const sha = await commit(`${auto ? 'Tự nạp' : 'Nạp'}: ${b.source.title}`, [...written, index, log])
    return put({
      ...b,
      status: 'da-nap',
      ...(sha ? { commit: sha } : {}),
      ...(conflicts.length
        ? {
            conflicts,
            note: `${conflicts.length} trang đã đổi trong lúc chờ và trùng chỗ, chưa ghép. Bấm Lập lại để Thủ thư làm lại các trang đó.`,
          }
        : {}),
    })
  }

  const notDrafting = (b: Batch) => {
    if (b.status === 'dang-lap') throw new IngestError('Thủ thư đang lập bản nạp này; chờ xong rồi chọn.')
  }

  async function keep(id: string) {
    const b = batches.get(id)
    if (!b || !isOpen(b)) throw new IngestError('Không có bản nạp này.')
    notDrafting(b)
    const stored = await storeSource({ ...b, space: b.space ?? 'ca-nhan' })
    return put({ ...stored, status: 'chi-luu', ops: [] })
  }

  async function drop(id: string) {
    const b = batches.get(id)
    if (!b || !isOpen(b)) throw new IngestError('Không có bản nạp này.')
    notDrafting(b)
    if (b.source.path.startsWith('hop-thu-vao/')) {
      await rm(join(root, b.source.path), { force: true })
      await d.indexFile(b.source.path)
      const side = companionOf(b.source.path)
      if (side !== b.source.path) {
        await rm(join(root, side), { force: true })
        await d.indexFile(side)
      }
      await commit(`Bỏ nguồn: ${b.source.title}`, [b.source.path, companionOf(b.source.path)])
    }
    return put({ ...b, status: 'bo', ops: [] })
  }

  async function redo(id: string, patch: Partial<Batch>) {
    const b = batches.get(id)
    if (!b || !(isOpen(b) || b.status === 'loi' || (b.status === 'da-nap' && b.conflicts?.length)))
      throw new IngestError('Không có bản nạp này.')
    const next: Batch = { ...b, ...patch, status: 'moi', ops: [] }
    delete next.conflicts
    delete next.note
    const saved = await put(next)
    void tick()
    return saved
  }

  async function revert(sha: string) {
    if (!d.hasGit || !/^[0-9a-f]{7,40}$/.test(sha) || !(await git.has(sha)))
      throw new IngestError('Không có thay đổi này.')
    const entry = (await git.log('.', 3650)).find((c) => c.sha.startsWith(sha))
    if (!entry) throw new IngestError('Không có thay đổi này.')
    const space = SPACES.find((s) => entry.files.some((f) => f.path.startsWith(`${s}/`))) ?? 'ca-nhan'
    // log.md chỉ ghi thêm: giữ nguyên bản hiện tại (kể cả dòng của lần bị hoàn tác) rồi thêm dòng mới.
    const logRel = `${space}/log.md`
    const logBefore = await readText(logRel)
    const out = await git
      .revert(entry.sha, `Hoàn tác: ${entry.subject} (${entry.sha.slice(0, 7)})`, async () => {
        await writeFile(join(root, logRel), logBefore)
        return [await appendLog(space, 'hoàn tác', entry.subject)]
      })
      .catch((e: unknown) => {
        throw new IngestError(e instanceof Error ? e.message : String(e))
      })
    for (const f of entry.files) await d.indexFile(f.path)
    const b = all().find((x) => x.commit === entry.sha)
    if (b) await put({ ...b, status: 'hoan-tac' })
    return out
  }

  // --- Nhật ký: ghi nhanh, tự nạp cuối ngày --------------------------------------------------------
  async function note(text: string, space: Space = 'ca-nhan') {
    const at = now()
    const rel = `${space}/nhat-ky/${dayKey(at)}.md`
    const abs = join(root, rel)
    const two = (n: number) => String(n).padStart(2, '0')
    const [y, m, dd] = dayKey(at).split('-')
    const cur = existsSync(abs) ? await readText(rel) : `# Nhật ký ${dd}/${m}/${y}\n`
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(
      abs,
      `${cur.replace(/\s*$/, '\n')}\n## Ghi nhanh · ${two(at.getHours())}:${two(at.getMinutes())}\n\n${text.trim()}\n`,
    )
    await d.indexFile(rel)
    await commit(`${d.who()} ghi nhanh`, [rel])
    return rel
  }

  async function diaryTick() {
    const at = now()
    if (at.getHours() < DIARY_HOUR) return
    const day = dayKey(at)
    const s = d.state()
    for (const space of SPACES) {
      if (s.diaryDone?.[space] === day) continue
      const rel = `${space}/nhat-ky/${day}.md`
      const text = existsSync(join(root, rel)) ? sourceText(await readText(rel)) : ''
      // Nhật ký chỉ có tiêu đề thì thôi.
      if (text.replace(/^#.*$/m, '').trim()) {
        const id = newId()
        const [y, m, dd] = day.split('-')
        await batches.put(id, {
          id,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
          status: 'moi',
          source: { path: rel, title: `Nhật ký ${dd}/${m}/${y}`, kind: 'nhat-ky', from: 'tu-dong' },
          space,
          ops: [],
          cost: 0,
        })
      }
      await d.saveState({ ...d.state(), diaryDone: { ...(d.state().diaryDone ?? {}), [space]: day } })
    }
  }

  async function staleTick() {
    const t = now()
    const waiting = all().filter((b) => staleAction(b, t))
    const remind = waiting.filter((b) => staleAction(b, t) === 'remind')
    for (const b of waiting.filter((x) => staleAction(x, t) === 'expire'))
      await keep(b.id).catch((e: unknown) => logger.warn('tự chỉ lưu %s: %s', b.id, String(e)))
    if (remind.length) {
      emit({ type: 'remind', batches: remind })
      for (const b of remind) await put({ ...b, remindedAt: t.toISOString() })
    }
  }

  ctx.effect(() => {
    // Lượt dở khi khởi động lại: Thủ thư không còn chạy, lập lại.
    void (async () => {
      for (const b of all()) if (b.status === 'dang-lap') await put({ ...b, status: 'moi', ops: [] })
    })()
    const t1 = setInterval(() => void tick(), TICK_MS)
    const t2 = setInterval(
      () => void diaryTick().catch((e: unknown) => logger.warn('tự nạp nhật ký: %s', String(e))),
      60_000,
    )
    const t3 = setInterval(() => void staleTick().catch(() => undefined), 3_600_000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(t3)
    }
  }, 'aris-brain: nạp')

  /** Trang trong bản nháp theo tên (Thủ thư đọc lại trang mới tạo). */
  function draftByName(sessionId: string | undefined, name: string): string | undefined {
    const t = sessionId ? drafting.get(sessionId) : undefined
    const b = t ? batches.get(t.batch) : undefined
    const n = name.replace(/\.md$/i, '')
    return b?.ops.find((o) => basename(o.path, '.md') === n)?.next
  }

  /** Số bản nạp chờ người dùng duyệt. */
  const waiting = () => all().filter((b) => b.status === 'cho-duyet').length

  /** Nghe sự kiện nạp; trả hàm gỡ. */
  function on(fn: (e: IngestEvent) => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }

  return {
    on,
    add,
    addFile,
    approve,
    keep,
    drop,
    redo,
    revert,
    note,
    draftRead,
    draftByName,
    waiting,
    all,
    spent,
    tick,
  }
}
