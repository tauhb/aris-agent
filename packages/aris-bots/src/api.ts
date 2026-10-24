/**
 * `/api/aris/bots`: bot, phòng ban, đội mẫu; mở phiên chat thẳng với bot. dsh đã kiểm cookie và
 * quyền chủ nhân trước khi gọi tới đây.
 */
import {
  cloneInput,
  exportBot,
  importInput,
  parseBotFile,
  type CopyParts,
  type PortableMemory,
} from './portable.js'
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
  live?: () => unknown
  /** Chi phí hôm nay theo phòng ban (USD), để trang Phòng ban hiện thanh ngân sách. */
  spend?: () => Record<string, number>
  /** Danh mục model đang phục vụ (để chọn model riêng cho bot). */
  catalog?: () => Promise<{ id: string; name: string; models: { id: string; name: string }[] }[]>
  /** Ký ức riêng của bot; không có (plugin ký ức tắt) thì không chép ký ức. */
  memory?: () => MemoryPort | undefined
}

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
    bots: d.store.list(),
    owner: d.store.owner(),
    departments: d.store.departments(),
    spend: d.spend?.() ?? {},
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
    if (q.get('live') && d.live) return json(d.live())
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
      case 'update':
        await d.store.update(String(body.id), body.patch as Partial<BotInput>)
        break
      case 'delete':
        await d.store.remove(String(body.id))
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
    if (err instanceof BotError) return json({ error: err.message }, 400)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
