/**
 * `/api/aris/bots`: bot, phòng ban, đội mẫu; mở phiên chat thẳng với bot. dsh đã kiểm cookie và
 * quyền chủ nhân trước khi gọi tới đây.
 */
import { BotError, type BotInput, type BotStore, type Template } from './store.js'

export interface ApiDeps {
  store: BotStore
  templates: () => Promise<Template[]>
  /** Tạo phiên trong chat riêng, gắn bot, chọn model của bot; trả mã phiên. */
  open: (botId: string) => Promise<string>
  /** Danh mục model đang phục vụ (để chọn model riêng cho bot). */
  catalog?: () => Promise<{ id: string; name: string; models: { id: string; name: string }[] }[]>
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
    departments: d.store.departments(),
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
    const session = new URL(request.url).searchParams.get('session')
    if (session) return json({ bot: d.store.botOf(session).id })
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
      case 'department':
        await d.store.upsertDepartment(body.department as { id?: string; name: string; lead?: string | null })
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
        // Bấm bot trên thanh bên: mở lại phiên gần nhất; "Việc mới với …" thì tạo phiên mới.
        const reuse = body.fresh === true ? undefined : d.store.latestOpen(id)
        return json({ sessionId: reuse ?? (await d.open(id)), reused: !!reuse })
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
