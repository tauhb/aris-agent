/**
 * `/api/aris/bots`: bot, phòng ban, đội mẫu; mở phiên chat thẳng với bot. dsh đã kiểm cookie và
 * quyền chủ nhân trước khi gọi tới đây.
 */
import { candidateInput, candidateView, discoverMcp, sameServer, type ImportScan } from './mcp-import.js'
import {
  cleanMcp,
  cleanScope,
  isOAuth,
  McpError,
  MCP_ASK,
  viewOf,
  type McpAsk,
  type McpCheck,
  type McpInput,
  type McpRecord,
  type McpStore,
} from './mcp.js'
import {
  cloneInput,
  exportBot,
  importInput,
  parseBotFile,
  type CopyParts,
  type PortableMemory,
} from './portable.js'
import { rewritePrompt, cleanRewrite, type SoulHistory } from './soul.js'
import { BotError, type BotInput, type BotStore, type Template } from './store.js'

/** Ký ức riêng của bot (dịch vụ `arisMemory`), để nhân bản, xuất, nhập. */
export interface MemoryPort {
  notesOf(bot: string): PortableMemory[]
  importNotes(bot: string, items: readonly PortableMemory[]): Promise<number>
}

export interface ApiDeps {
  store: BotStore
  templates: () => Promise<Template[]>
  /** Tạo phiên trong chat riêng, gắn bot, chọn model của bot; trả mã phiên. */
  open: (botId: string) => Promise<string>
  /** Trạng thái trực tiếp và việc gần đây (`?live=1`). */
  live?: () => unknown | Promise<unknown>
  /** Chi phí hôm nay theo phòng ban (USD), để trang Phòng ban hiện thanh ngân sách. */
  spend?: () => Record<string, number>
  /** Danh mục model đang phục vụ (để chọn model riêng cho bot). */
  catalog?: () => Promise<{ id: string; name: string; models: { id: string; name: string }[] }[]>
  /** Ký ức riêng của bot; không có (plugin ký ức tắt) thì không chép ký ức. */
  memory?: () => MemoryPort | undefined
  /** Số liệu cột phải hồ sơ bot (`?profile=<mã bot>`). */
  profile?: (bot: string) => unknown | Promise<unknown>
  /** Phiên gần đây của một bot (`?sessions=<mã bot>`), cho ô chọn phiên ở bảng chat Văn phòng. */
  sessions?: (bot: string) => unknown | Promise<unknown>
  /** Lịch sử tính cách (SOUL) theo phiên bản. */
  souls?: SoulHistory
  /** Gọi model viết lại tính cách (model của Commander, không thì model vừa dùng gần nhất). */
  rewrite?: (prompt: string, signal?: AbortSignal) => Promise<string>
  /** Kết nối nền tảng (MCP) theo bot. */
  mcp?: McpStore
  /** Kết nối thử một máy chủ MCP. */
  checkMcp?: (r: McpRecord) => Promise<McpCheck>
  /** Quét cấu hình MCP của Claude Code và Codex trên máy (thay được khi thử). */
  scanMcp?: () => Promise<ImportScan>
  /** Danh mục connector (GĐ8.5), gửi giao diện. */
  connectors?: () => unknown
  /** Đăng nhập OAuth của kết nối dựng từ danh mục. */
  oauth?: {
    start(r: McpRecord): Promise<{ authUrl: string } | { authorized: true }>
    forget(id: string): Promise<void>
  }
}

/** Kết quả quét giữ trong bộ nhớ 15 phút để bước nhập không phải gửi lại khoá qua giao diện. */
const SCAN_TTL_MS = 15 * 60_000
const scans = new Map<string, { at: number; scan: ImportScan }>()
const MAX_IMPORT = 30

const partsOf = (v: unknown): CopyParts => {
  const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { config: p.config !== false, soul: p.soul !== false, memory: p.memory === true }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

async function snapshot(d: ApiDeps) {
  const templates = await d.templates()
  return {
    // Phiên bản và lần sửa cuối của tính cách (dòng phụ trên thẻ SOUL).
    bots: d.store.list().map((b) => (d.souls ? { ...b, soulMeta: d.souls.meta(b) } : b)),
    owner: d.store.owner(),
    departments: d.store.departments(),
    spend: d.spend?.() ?? {},
    // Model đang phục vụ, để chọn model riêng của bot và model mặc định của phòng.
    catalog: (await d.catalog?.().catch(() => undefined)) ?? [],
    mcp: d.mcp?.list().map(viewOf) ?? [],
    connectors: d.connectors?.() ?? [],
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      bots: t.bots.length,
    })),
  }
}

export async function handleApi(d: ApiDeps, request: Request): Promise<Response> {
  if (request.method === 'GET') {
    // ?session=…: bot của một phiên (đầu khung chat).
    const q = new URL(request.url).searchParams
    const session = q.get('session')
    if (session) return json({ bot: d.store.botOf(session).id })
    if (q.get('live') && d.live) return json(await d.live())
    const profile = q.get('profile')
    if (profile && d.profile) return json(await d.profile(profile))
    const sessions = q.get('sessions')
    if (sessions && d.sessions) return json({ sessions: await d.sessions(sessions) })
    return json(await snapshot(d))
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  try {
    switch (body.op) {
      case 'create':
        await d.store.create(body.bot as BotInput)
        break
      case 'update': {
        const id = String(body.id)
        const prev = d.store.get(id)?.soul ?? ''
        const rec = await d.store.update(id, body.patch as Partial<BotInput>)
        if (d.souls && (body.patch as Partial<BotInput> | undefined)?.soul !== undefined)
          await d.souls.record(rec, prev, rec.soul, body.soulBy === 'aris' ? 'aris' : 'user')
        break
      }
      case 'soul-history': {
        const bot = d.store.get(String(body.id))
        if (!bot) return json({ error: 'Không có bot này.' }, 400)
        const versions = d.souls?.list(bot.id) ?? []
        // Chưa có lịch sử: bản hiện tại là phiên bản 1.
        return json({
          versions: versions.length
            ? versions
            : [{ bot: bot.id, version: 1, soul: bot.soul, at: bot.createdAt, by: 'create' }],
        })
      }
      case 'soul-restore': {
        const bot = d.store.get(String(body.id))
        const v = bot && d.souls?.get(bot.id, Number(body.version))
        if (!bot || !v) return json({ error: 'Không có phiên bản này.' }, 400)
        const rec = await d.store.update(bot.id, { soul: v.soul })
        await d.souls!.record(rec, bot.soul, rec.soul, 'restore', v.version)
        break
      }
      case 'soul-rewrite': {
        const bot = d.store.get(String(body.id))
        if (!bot) return json({ error: 'Không có bot này.' }, 400)
        if (!d.rewrite) return json({ error: 'Chưa gọi được model để viết lại.' }, 400)
        const draft = typeof body.draft === 'string' ? body.draft : bot.soul
        const raw = await d.rewrite(rewritePrompt(bot, draft, String(body.wish ?? '')), request.signal)
        const soul = cleanRewrite(raw)
        if (!soul) return json({ error: 'Aris chưa viết được bản mới, thử lại.' }, 502)
        return json({ soul })
      }
      case 'delete':
        await d.store.remove(String(body.id))
        await d.mcp?.removeBot(String(body.id))
        await d.souls?.removeBot(String(body.id))
        break
      case 'owner':
        await d.store.setOwner(
          body.owner as { name?: string | null; call?: string | null; self?: string | null },
        )
        break
      case 'department':
        // Đổi tên, mô tả, trưởng nhóm, chính sách của phòng có sẵn (hoặc tạo theo mã cho trước).
        await d.store.upsertDepartment(
          body.department as {
            id?: string
            name: string
            lead?: string | null
            about?: string | null
            policy?: unknown
          },
        )
        break
      case 'department-create':
        await d.store.createDepartment(
          body.department as {
            name: string
            about?: string
            bots?: string[]
            lead?: string
            copyPolicyFrom?: string
          },
        )
        break
      case 'department-delete':
        await d.store.deleteDepartment(String(body.id))
        break
      case 'move':
        await d.store.moveBot(String(body.id), body.department ? String(body.department) : null)
        break
      case 'apply-template': {
        const t = (await d.templates()).find((x) => x.id === body.template)
        if (!t) return json({ error: 'Không có đội mẫu này.' }, 400)
        const r = await d.store.applyTemplate(t)
        return json({ ...(await snapshot(d)), result: r })
      }
      case 'open': {
        const id = String(body.id)
        if (!d.store.get(id)) return json({ error: 'Không có bot này.' }, 400)
        if (d.store.get(id)?.external)
          return json({ error: 'Bot ngoài không có phiên chat riêng; giao việc cho bot qua Aris.' }, 400)
        // Bấm bot trên thanh bên: mở lại phiên gần nhất; "Việc mới với …" thì tạo phiên mới.
        const reuse = body.fresh === true ? undefined : d.store.latestOpen(id)
        return json({ sessionId: reuse ?? (await d.open(id)), reused: !!reuse })
      }
      case 'mcp-test': {
        // "Kiểm tra kết nối" trong hộp, chưa lưu: khoá để trống khi sửa thì dùng khoá đã lưu.
        if (!d.mcp || !d.checkMcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        const prev = body.id ? d.mcp.get(String(body.id)) : undefined
        const clean = cleanMcp(body.input as McpInput, prev)
        const temp: McpRecord = {
          ...clean,
          id: 'test',
          bot: String(body.bot ?? prev?.bot ?? ''),
          serverName: prev?.serverName ?? 'test',
          createdAt: new Date().toISOString(),
        }
        return json({ check: await d.checkMcp(temp) })
      }
      case 'mcp-add':
      case 'mcp-update':
      case 'mcp-check': {
        if (!d.mcp || !d.checkMcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        let rec: McpRecord
        if (body.op === 'mcp-add') {
          const bot = d.store.get(String(body.bot))
          if (!bot || bot.external) return json({ error: 'Bot này không thêm kết nối được.' }, 400)
          rec = await d.mcp.add(bot.id, body.input as McpInput)
        } else {
          const prev = d.mcp.get(String(body.id))
          if (!prev) return json({ error: 'Không có kết nối này.' }, 400)
          rec = body.op === 'mcp-update' ? await d.mcp.update(prev.id, body.input as Partial<McpInput>) : prev
        }
        // Bật / tắt không cần kết nối thử lại.
        const onlyToggle =
          body.op === 'mcp-update' && Object.keys((body.input as object) ?? {}).every((k) => k === 'enabled')
        if (!onlyToggle && (body.op !== 'mcp-update' || !rec.check))
          await d.mcp.setCheck(rec.id, await d.checkMcp(rec))
        return json({ ...(await snapshot(d)), connection: rec.id })
      }
      case 'mcp-delete': {
        const prev = d.mcp?.get(String(body.id))
        await d.mcp?.remove(String(body.id))
        // Kết nối OAuth: xoá luôn token trong kho khoá.
        if (prev && isOAuth(prev)) await d.oauth?.forget(prev.id)
        break
      }
      case 'mcp-oauth-start': {
        // "Đăng nhập <hãng>": trả trang đăng nhập để giao diện mở cửa sổ mới.
        if (!d.mcp || !d.oauth) return json({ error: 'Chưa bật đăng nhập OAuth.' }, 400)
        const rec = d.mcp.get(String(body.id))
        if (!rec || !isOAuth(rec)) return json({ error: 'Kết nối này không đăng nhập bằng OAuth.' }, 400)
        const r = await d.oauth.start(rec)
        if ('authorized' in r && d.checkMcp) await d.mcp.setCheck(rec.id, await d.checkMcp(rec))
        return json({ ...(await snapshot(d)), ...r })
      }
      case 'mcp-team-add': {
        // Kết nối dùng chung của đội: khoá nhập một lần, mọi bot trong phạm vi cùng dùng.
        if (!d.mcp || !d.checkMcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        const rec = await d.mcp.addTeam(body.input as McpInput, body.scope as NonNullable<McpRecord['scope']>)
        // Kết nối OAuth chưa có token: chờ người dùng đăng nhập rồi mới kiểm tra.
        if (isOAuth(rec)) await d.mcp.setOAuth(rec.id, { state: 'login', at: new Date().toISOString() })
        else await d.mcp.setCheck(rec.id, await d.checkMcp(rec))
        return json({ ...(await snapshot(d)), connection: rec.id })
      }
      case 'mcp-team-scope': {
        if (!d.mcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        await d.mcp.setScope(String(body.id), body.scope as NonNullable<McpRecord['scope']>)
        break
      }
      case 'mcp-team-bot': {
        // Một bot tắt riêng kết nối dùng chung, hay đặt mức hỏi chặt hơn mức chung.
        if (!d.mcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        const bot = d.store.get(String(body.bot))
        if (!bot) return json({ error: 'Không có bot này.' }, 400)
        const ask =
          body.ask === null
            ? null
            : (MCP_ASK as readonly string[]).includes(String(body.ask))
              ? (body.ask as McpAsk)
              : undefined
        await d.mcp.setBotPref(String(body.id), bot.id, {
          ...(typeof body.off === 'boolean' ? { off: body.off } : {}),
          ...(ask !== undefined ? { ask } : {}),
        })
        break
      }
      case 'mcp-import-scan': {
        // Đọc cấu hình của Claude Code và Codex. Giá trị khoá ở lại trong bộ nhớ, giao diện chỉ thấy tên khoá.
        if (!d.mcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        for (const [k, v] of scans) if (Date.now() - v.at > SCAN_TTL_MS) scans.delete(k)
        const scan = await (d.scanMcp ?? (() => discoverMcp()))()
        const scanId = `scan-${Math.random().toString(16).slice(2, 10)}`
        scans.set(scanId, { at: Date.now(), scan })
        const have = d.mcp.list()
        return json({
          scanId,
          candidates: scan.candidates.map((c) => ({
            ...candidateView(c),
            exists: have.some((r) => sameServer(c, r)),
          })),
          skipped: scan.skipped,
        })
      }
      case 'mcp-import': {
        if (!d.mcp || !d.checkMcp) return json({ error: 'Chưa bật kết nối nền tảng.' }, 400)
        const hit = scans.get(String(body.scanId))
        if (!hit || Date.now() - hit.at > SCAN_TTL_MS)
          return json({ error: 'Kết quả quét đã hết hạn, quét lại.' }, 400)
        const keys = new Set(Array.isArray(body.keys) ? body.keys.map(String) : [])
        const picked = hit.scan.candidates.filter((c) => keys.has(c.key)).slice(0, MAX_IMPORT)
        if (picked.length === 0) return json({ error: 'Chưa chọn máy chủ nào.' }, 400)
        const scope = cleanScope(body.scope as NonNullable<McpRecord['scope']>)
        const ask = (MCP_ASK as readonly string[]).includes(String(body.ask)) ? (body.ask as McpAsk) : 'write'
        const made: McpRecord[] = []
        for (const c of picked) made.push(await d.mcp.addTeam(candidateInput(c, ask), scope, c.source))
        // Kiểm tra song song: máy chủ chạy bằng npx có thể mất vài chục giây lần đầu.
        await Promise.all(
          made.map(async (r) => {
            await d.mcp!.setCheck(r.id, await d.checkMcp!(r))
          }),
        )
        scans.delete(String(body.scanId))
        return json({ ...(await snapshot(d)), imported: made.map((r) => r.id) })
      }
      case 'commander-latest': {
        // Bấm Aris trên thanh bên: phiên gần nhất chưa gắn bot nào trong các ứng viên (mới nhất trước).
        const list = Array.isArray(body.candidates) ? body.candidates.map(String) : []
        return json({ sessionId: list.find((c) => !d.store.tagOf(c)) ?? null })
      }
      case 'clone': {
        // Nhân bản (2.4): bot mới cùng vai trò, tên mới; kênh nhắn tin và lịch sử chat không chép.
        const src = d.store.get(String(body.id))
        if (!src || src.kind === 'commander') return json({ error: 'Không nhân bản được bot này.' }, 400)
        const parts = partsOf(body.parts)
        const input = cloneInput(src, String(body.name ?? ''), parts, (h) => !!d.store.byHandle(h))
        const bot = await d.store.create(input)
        const mem = parts.memory ? d.memory?.() : undefined
        const memory = mem ? await mem.importNotes(bot.id, mem.notesOf(src.id)) : 0
        return json({ ...(await snapshot(d)), created: bot.id, memory })
      }
      case 'export': {
        const src = d.store.get(String(body.id))
        if (!src || src.kind === 'commander') return json({ error: 'Không xuất được bot này.' }, 400)
        const parts = partsOf(body.parts)
        const memory = parts.memory ? d.memory?.()?.notesOf(src.id) : undefined
        const dept = src.department ? d.store.departments().find((x) => x.id === src.department) : undefined
        return json({
          file: exportBot(src, parts, { departmentName: dept?.name, ...(memory ? { memory } : {}) }),
        })
      }
      case 'import': {
        const f = parseBotFile(body.file)
        const input = importInput(
          f,
          (h) => !!d.store.byHandle(h),
          (name) => d.store.departments().find((x) => x.name.toLowerCase() === name.toLowerCase())?.id,
        )
        const bot = await d.store.create(input)
        const mem = f.memory?.length ? d.memory?.() : undefined
        const memory = mem ? await mem.importNotes(bot.id, f.memory!) : 0
        return json({ ...(await snapshot(d)), created: bot.id, memory })
      }
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
    return json(await snapshot(d))
  } catch (err) {
    if (err instanceof BotError || err instanceof McpError) return json({ error: err.message }, 400)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
