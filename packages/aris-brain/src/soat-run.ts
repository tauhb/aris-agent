/**
 * Chạy soát bộ não (giai đoạn 5, đợt 4a; bản vẽ 5.5): máy soát mỗi ngày từ 06:00, Thủ thư soát sâu Chủ
 * nhật từ 21:00 (trần 0,30 USD mỗi lần, tính riêng), nút "Soát ngay". Các nút xử lý: bỏ qua, nhờ Thủ thư
 * sửa (bản nạp loại "soát"), sửa liên kết, dời trang của phòng đã xoá. Báo tin Telegram sau lần soát sâu.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Entry } from './catalog.js'
import type { VaultGit } from './git.js'
import { linksOf } from './page.js'
import type { Table } from './pipeline.js'
import {
  DEEP_KINDS,
  deepPrompt,
  findingId,
  fixTask,
  machineFindings,
  mergeFindings,
  relink,
  weekKey,
  type Finding,
  type FindingKind,
  type NewFinding,
  type SoatPage,
  type SoatRun,
} from './soat.js'
import type { Space } from './vault.js'

/** Trần tiền một lần Thủ thư soát sâu (USD). */
export const DEEP_CAP_USD = 0.3
export const MACHINE_HOUR = 6
export const DEEP_DAY = 0
export const DEEP_HOUR = 21
const DEEP_TIMEOUT_MS = 15 * 60_000
const DEEP_MAX_PAGES = 30

export interface SoatState {
  soatDay?: string | undefined
  soatWeek?: string | undefined
}

interface SessionPort {
  prompt(
    req: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] },
    signal: AbortSignal,
  ): Promise<unknown>
  rename?(req: { sessionId: string; title: string }): Promise<unknown>
  cancel?(req: { sessionId: string }): unknown
}

export interface SoatDeps {
  ctx: Context
  logger: { warn(...a: unknown[]): void }
  root: string
  git: VaultGit
  hasGit: boolean
  findings: Table<Finding>
  runs: Table<SoatRun>
  state: () => SoatState
  saveState: (patch: SoatState) => Promise<void>
  catalog: {
    all(): Entry[]
    get(path: string): (Entry & { body: string }) | undefined
    byName(space: Space | undefined, name: string): Entry | undefined
  }
  indexFile: (rel: string) => Promise<unknown>
  depts: () => { id: string; name: string }[]
  botName: (id: string) => string
  /** Lượt được nhắc / có tra trong 7 ngày theo bot. */
  lookups: () => Record<string, { nudged: number; followed: number }>
  open: (bot: string) => Promise<string>
  librarian: string
  who: () => string
  ingest: {
    addSoat(i: { space: Space; title: string; task: string }): Promise<{ id: string }>
    rebuildIndex(space: Space): Promise<string>
    appendLog(space: Space, kind: string, text: string): Promise<string>
  }
  notify: (markdown: string) => Promise<unknown>
  today: () => string
}

export class SoatError extends Error {}

export function startSoat(d: SoatDeps) {
  const { ctx, findings, runs } = d
  const sessions = () => ctx.get('sessionController') as SessionPort | undefined
  const iso = () => new Date().toISOString()
  const all = () => [...findings.entries()].map(([, f]) => f)
  const commit = async (message: string, paths: string[]) =>
    d.hasGit
      ? d.git.commit(message, paths).catch((e: unknown) => {
          d.logger.warn('commit soát: %s', String(e))
          return undefined
        })
      : undefined

  /** Ghi kết quả một lần soát: giữ trạng thái cũ, gỡ phát hiện không còn thấy. */
  async function store(found: readonly NewFinding[], by: 'may' | 'thu-thu') {
    const at = iso()
    const { keep, drop } = mergeFindings(all(), found, by, at)
    for (const f of keep) await findings.put(f.id, f)
    for (const id of drop) await findings.delete(id)
    return keep.filter((f) => f.status === 'mo').length
  }

  /** Trang `.md` của người dùng kèm toàn văn trên đĩa (chỉ mục bỏ nhãn đầu trang). */
  const userPages = async (): Promise<SoatPage[]> => {
    const list = d.catalog
      .all()
      .filter(
        (e) =>
          e.space &&
          !e.binary &&
          e.path.endsWith('.md') &&
          (e.layer === 'wiki' || e.layer === 'nguon' || e.layer === 'nhat-ky'),
      )
    return Promise.all(
      list.map(async (e) => ({
        path: e.path,
        name: e.name,
        title: e.title,
        space: e.space,
        layer: e.layer,
        dept: e.dept,
        group: e.group,
        mtime: e.mtime,
        body: await readFile(join(d.root, e.path), 'utf8').catch(() => d.catalog.get(e.path)?.body ?? ''),
      })),
    )
  }

  // --- Máy soát -----------------------------------------------------------------------------------
  async function machine(): Promise<SoatRun> {
    const run: SoatRun = {
      id: `r-${Date.now().toString(36)}`,
      at: iso(),
      by: 'may',
      status: 'xong',
      found: 0,
      cost: 0,
    }
    try {
      const found = machineFindings({
        pages: await userPages(),
        depts: d.depts().map((x) => x.id),
        lookups: d.lookups(),
        botName: d.botName,
      })
      run.found = await store(found, 'may')
    } catch (e) {
      run.status = 'loi'
      run.error = e instanceof Error ? e.message : String(e)
    }
    await runs.put(run.id, run)
    return run
  }

  // --- Thủ thư soát sâu --------------------------------------------------------------------------
  /** Phiên đang soát sâu → lần soát và các phát hiện Thủ thư ghi. */
  const deepRuns = new Map<string, { run: string; found: NewFinding[]; done: (reason: string) => void }>()
  let offCost: (() => void) | undefined
  ctx.effect(() => () => offCost?.(), 'aris-brain: tiền soát')
  const hookCost = () => {
    offCost ??= (
      ctx.get('arisSpend') as { onCost?(fn: (s: string, usd: number) => void): () => void } | undefined
    )?.onCost?.((session, usd) => {
      const t = deepRuns.get(session)
      const r = t ? runs.get(t.run) : undefined
      if (!t || !r) return
      const cost = r.cost + usd
      void runs.put(r.id, { ...r, cost })
      if (cost > DEEP_CAP_USD) {
        sessions()?.cancel?.({ sessionId: session })
        t.done('cap')
      }
    })
  }

  /** Trang đổi trong 7 ngày và trang nối với chúng (tối đa 30). */
  function deepPages() {
    const pages = d.catalog
      .all()
      .filter(
        (e) =>
          e.space && e.layer === 'wiki' && e.path.endsWith('.md') && !e.binary && !e.name.startsWith('_'),
      )
    const since = Date.now() - 7 * 86_400_000
    const changed = pages.filter((e) => e.mtime >= since).sort((a, b) => b.mtime - a.mtime)
    const pick = new Map(changed.map((e) => [e.path, e]))
    for (const e of changed) {
      for (const n of linksOf(d.catalog.get(e.path)?.body ?? '')) {
        const hit = d.catalog.byName(e.space, n)
        if (hit && hit.layer === 'wiki' && !hit.name.startsWith('_')) pick.set(hit.path, hit)
      }
      if (pick.size >= DEEP_MAX_PAGES) break
    }
    return [...pick.values()].slice(0, DEEP_MAX_PAGES)
  }

  let deepBusy = false
  async function deep(): Promise<SoatRun> {
    if (deepBusy) throw new SoatError('Thủ thư đang soát, chờ xong đã.')
    const sc = sessions()
    if (!sc) throw new SoatError('Chưa có bộ điều khiển phiên.')
    const pages = deepPages()
    const run: SoatRun = {
      id: `r-${Date.now().toString(36)}t`,
      at: iso(),
      by: 'thu-thu',
      status: 'xong',
      found: 0,
      cost: 0,
    }
    if (!pages.length) {
      await runs.put(run.id, run)
      return run
    }
    deepBusy = true
    try {
      hookCost()
      const session = await d.open(d.librarian)
      run.status = 'dang-chay'
      run.session = session
      await runs.put(run.id, run)
      await sc
        .rename?.({ sessionId: session, title: `Soát · tuần ${weekKey(new Date()).slice(-2)}` })
        .catch(() => undefined)
      const found: NewFinding[] = []
      const ended = new Promise<string>((resolve) => {
        deepRuns.set(session, { run: run.id, found, done: resolve })
        setTimeout(() => {
          sc.cancel?.({ sessionId: session })
          resolve('timeout')
        }, DEEP_TIMEOUT_MS)
      })
      await sc.prompt(
        {
          requestId: randomUUID(),
          sessionId: session,
          mode: 'queue',
          content: [{ type: 'text', text: deepPrompt({ pages, today: d.today() }) }],
        },
        AbortSignal.timeout(30_000),
      )
      const reason = await ended
      deepRuns.delete(session)
      const cur = runs.get(run.id) ?? run
      const n = await store(found, 'thu-thu')
      const done: SoatRun = {
        ...cur,
        found: n,
        status: reason === 'completed' ? 'xong' : reason === 'cap' ? 'dung' : 'loi',
        ...(reason === 'completed'
          ? {}
          : {
              error:
                reason === 'cap'
                  ? `Chạm trần ${DEEP_CAP_USD.toFixed(2)} USD, đã dừng.`
                  : `Lượt kết thúc: ${reason}`,
            }),
      }
      await runs.put(run.id, done)
      return done
    } finally {
      deepBusy = false
    }
  }

  ctx.on('session/event', (session, event) => {
    const t = deepRuns.get(session.id)
    if (!t || event.type !== 'turn/end') return
    t.done((event.data as unknown as { reason?: { kind?: string } }).reason?.kind ?? 'completed')
  })

  // Thủ thư ghi phát hiện khi soát sâu.
  ctx.tools.register(
    defineTool({
      name: 'brain_finding',
      description:
        'Chỉ dùng khi đang soát bộ não: ghi một mâu thuẫn giữa các trang hay một nhận định đã cũ, kèm trích nguyên văn.',
      parameters: {
        loai: { type: 'string', enum: ['mau-thuan', 'nhan-dinh-cu'], required: true },
        trang: {
          type: 'string',
          required: true,
          description: 'Tên các trang liên quan, cách nhau dấu phẩy.',
        },
        mo_ta: { type: 'string', required: true, description: 'Một câu: điều gì lệch, nên theo bên nào.' },
        trich: {
          type: 'string',
          description: 'Mỗi dòng một đoạn trích: tên-trang: nguyên văn đoạn liên quan.',
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const sid = (exec.agent as { session: { id: string } } | undefined)?.session.id
        const t = sid ? deepRuns.get(sid) : undefined
        if (!t) return 'Không dùng được ở đây: chỉ dùng khi đang soát bộ não.'
        const names = String(args.trang ?? '')
          .split(/[,\n]/)
          .map((x) => x.trim().replace(/^\[\[|\]\]$/g, ''))
          .filter(Boolean)
        // Trùng tên (trang wiki và bản chữ của nguồn): lấy trang wiki.
        const entries = names
          .map((n) => {
            const hits = d.catalog.all().filter((e) => e.name === n && e.path.endsWith('.md'))
            return hits.find((e) => e.layer === 'wiki') ?? hits[0]
          })
          .filter((e): e is Entry => !!e)
        if (entries.length < 1)
          return 'Không thấy trang nào trong danh sách tên; dùng đúng tên trong [[...]].'
        const kind = (args.loai === 'nhan-dinh-cu' ? 'nhan-dinh-cu' : 'mau-thuan') as FindingKind
        const quotes = String(args.trich ?? '')
          .split('\n')
          .map((l) => /^\s*-?\s*([^:]+):\s*(.+)$/.exec(l))
          .filter((m): m is RegExpExecArray => !!m)
          .map((m) => ({
            page: m[1]!.trim().replace(/^\[\[|\]\]$/g, ''),
            text: m[2]!.trim().replace(/^[«“"]|[»”"]$/g, ''),
          }))
        const paths = entries.map((e) => e.path).sort()
        t.found.push({
          id: findingId(kind, paths.join('|')),
          kind,
          by: 'thu-thu',
          ...(entries[0]!.space ? { space: entries[0]!.space } : {}),
          title: entries.map((e) => e.title).join(' ↔ '),
          pages: entries.map((e) => e.path),
          note: String(args.mo_ta ?? '').slice(0, 600),
          quotes: quotes.slice(0, 6),
        })
        return 'Đã ghi.'
      },
    }),
  )

  /** Lần soát gần nhất của mỗi loại và tin Telegram tuần sau lần soát sâu. */
  async function weekly() {
    const deepRun = await deep()
    await machine()
    const open = all().filter((f) => f.status === 'mo')
    const n = (k: FindingKind) => open.filter((f) => f.kind === k).length
    const parts = [
      n('mau-thuan') && `${n('mau-thuan')} mâu thuẫn`,
      n('nhan-dinh-cu') && `${n('nhan-dinh-cu')} nhận định cũ`,
      n('lien-ket-gay') + n('chua-co-trang') && `${n('lien-ket-gay') + n('chua-co-trang')} liên kết gãy`,
      n('phong-da-xoa') && `${n('phong-da-xoa')} phòng đã xoá còn trang`,
    ].filter(Boolean)
    if (open.length)
      await d
        .notify(
          `🧹 **SOÁT BỘ NÃO · tuần ${weekKey(new Date()).slice(-2)}**\n${parts.join(', ') || `${open.length} điều cần gọn`}${deepRun.cost ? ` · Thủ thư dùng ${deepRun.cost.toFixed(2)} USD` : ''}.\nXem ở Second Brain › Soát bộ não trên web.`,
        )
        .catch(() => undefined)
  }

  // --- Lịch -----------------------------------------------------------------------------------------
  let ticking = false
  async function tick() {
    if (ticking) return
    ticking = true
    try {
      const now = new Date()
      const day = d.today()
      if (now.getHours() >= MACHINE_HOUR && d.state().soatDay !== day) {
        await d.saveState({ soatDay: day })
        await machine()
      }
      const week = weekKey(now)
      if (now.getDay() === DEEP_DAY && now.getHours() >= DEEP_HOUR && d.state().soatWeek !== week) {
        await d.saveState({ soatWeek: week })
        await weekly()
      }
    } catch (e) {
      d.logger.warn('soát: %s', String(e))
    } finally {
      ticking = false
    }
  }
  ctx.effect(() => {
    // Lần soát sâu dở khi khởi động lại.
    void (async () => {
      for (const [, r] of runs.entries())
        if (r.status === 'dang-chay')
          await runs.put(r.id, { ...r, status: 'loi', error: 'aris khởi động lại giữa lúc soát.' })
      // Giữ 60 lần soát gần nhất.
      const old = [...runs.entries()]
        .map(([, r]) => r)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(60)
      for (const r of old) await runs.delete(r.id)
    })()
    const timer = setInterval(() => void tick(), 60_000)
    const first = setTimeout(() => void tick(), 20_000)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, 'aris-brain: soát')

  // --- Nút xử lý ----------------------------------------------------------------------------------
  const get = (id: string) => {
    const f = findings.get(id)
    if (!f) throw new SoatError('Không còn phát hiện này (có thể đã sửa).')
    return f
  }
  const nameOf = (path: string) => d.catalog.get(path)?.name ?? path.split('/').pop()!.replace(/\.md$/, '')

  async function dismiss(id: string) {
    const f = get(id)
    await findings.put(id, { ...f, status: 'bo-qua' })
  }
  async function restore(id: string) {
    const f = get(id)
    await findings.put(id, { ...f, status: 'mo' })
  }

  /** Nhờ Thủ thư sửa: bản nạp loại "soát" vào Hộp thư vào. */
  async function fix(id: string) {
    const f = get(id)
    const space = f.space ?? (f.pages[0]?.startsWith('cong-ty/') ? 'cong-ty' : 'ca-nhan')
    const b = await d.ingest.addSoat({ space, title: f.title, task: fixTask(f, nameOf) })
    await findings.put(id, { ...f, status: 'xu-ly', batch: b.id })
    return b
  }

  /** Sửa liên kết gãy thành một trang có sẵn (sửa ngay, có commit). */
  async function relinkTo(id: string, to: string) {
    const f = get(id)
    if (!f.target || (f.kind !== 'lien-ket-gay' && f.kind !== 'chua-co-trang'))
      throw new SoatError('Phát hiện này không phải liên kết gãy.')
    const dest = d.catalog.byName(f.space, to.trim())
    if (!dest) throw new SoatError('Không có trang này.')
    const changed: string[] = []
    for (const p of f.pages) {
      const body = await readFile(join(d.root, p), 'utf8').catch(() => undefined)
      if (body === undefined) continue
      const r = relink(body, f.target, dest.name)
      if (!r.n) continue
      await writeFile(join(d.root, p), r.text)
      await d.indexFile(p)
      changed.push(p)
    }
    if (!changed.length) throw new SoatError('Không còn chỗ nào trỏ tới trang này.')
    await commit(`${d.who()} sửa liên kết [[${f.target}]] → [[${dest.name}]]`, changed)
    await findings.delete(id)
    return changed.length
  }

  /** Dời trang của phòng đã xoá sang phần chung hay một phòng khác (một commit, hoàn tác được). */
  async function move(id: string, to: string) {
    const f = get(id)
    if (f.kind !== 'phong-da-xoa' || !f.target) throw new SoatError('Phát hiện này không phải phòng đã xoá.')
    const target = to === 'chung' ? 'cong-ty/wiki/chung/' : `cong-ty/wiki/phong-ban/${to}/`
    if (to !== 'chung' && !d.depts().some((x) => x.id === to)) throw new SoatError('Không có phòng này.')
    const from = `cong-ty/wiki/phong-ban/${f.target}/`
    const paths: string[] = []
    for (const p of f.pages) {
      if (!p.startsWith(from) || !existsSync(join(d.root, p))) continue
      let dest = target + p.slice(from.length)
      for (let i = 2; existsSync(join(d.root, dest)); i++) dest = dest.replace(/(-\d+)?\.md$/, `-${i}.md`)
      await mkdir(dirname(join(d.root, dest)), { recursive: true })
      await rename(join(d.root, p), join(d.root, dest))
      await d.indexFile(p)
      await d.indexFile(dest)
      paths.push(p, dest)
    }
    // Trang mô tả phòng đã xoá và thư mục rỗng.
    const card = `${from}_phong-ban.md`
    if (existsSync(join(d.root, card))) {
      await rm(join(d.root, card))
      await d.indexFile(card)
      paths.push(card)
    }
    const left = await readdir(join(d.root, from), { recursive: true }).catch(() => [] as string[])
    if (!left.some((x) => x.endsWith('.md'))) await rm(join(d.root, from), { recursive: true, force: true })
    const label = to === 'chung' ? 'phần chung' : `phòng ${d.depts().find((x) => x.id === to)?.name ?? to}`
    const index = await d.ingest.rebuildIndex('cong-ty')
    const log = await d.ingest.appendLog(
      'cong-ty',
      'dời',
      `${paths.length / 2} trang của phòng ${f.target} sang ${label}`,
    )
    await commit(`${d.who()} dời trang phòng ${f.target} sang ${label}`, [...paths, index, log])
    await findings.delete(id)
    return paths.length
  }

  const running = () => deepBusy
  const list = () => all()
  const recentRuns = () =>
    [...runs.entries()]
      .map(([, r]) => r)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10)

  return {
    machine,
    deep,
    weekly,
    dismiss,
    restore,
    fix,
    relinkTo,
    move,
    running,
    list,
    recentRuns,
    DEEP_KINDS,
  }
}
