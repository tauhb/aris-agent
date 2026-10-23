/**
 * Đường `/api/aris/memory` cho trang Ký ức (3.1). dsh đã kiểm Host/Origin, cookie và
 * quyền chủ nhân trước khi gọi tới đây.
 *   GET  ?bot=aris                       → lõi, lưu trữ, chờ duyệt, dung lượng hai cuốn
 *   POST { op, id, text? }               → update | demote | promote | forget | approve | discard
 */
import { MemoryError, type MemoryItem, type MemoryStore } from './store.js'
import type { ReflectStatus } from './watch.js'

export interface MemorySnapshot {
  bot: string
  usage: { notes: { used: number; cap: number }; owner: { used: number; cap: number } }
  core: MemoryItem[]
  archive: MemoryItem[]
  pending: MemoryItem[]
  /** Lần rút ký ức khi nén gần nhất (từ lúc máy chủ chạy). */
  reflect?: ReflectStatus | undefined
}

export function snapshot(store: MemoryStore, bot: string, reflect?: ReflectStatus): MemorySnapshot {
  return {
    reflect,
    bot,
    usage: { notes: store.usage(bot, 'notes'), owner: store.usage(bot, 'owner') },
    core: store.list(bot, { tier: 'core', status: 'active' }),
    archive: store.list(bot, { tier: 'archive', status: 'active' }),
    pending: store.list(bot, { status: 'pending' }),
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const BOT_RE = /^[a-z0-9-]{1,40}$/

export async function handleApi(
  store: MemoryStore,
  request: Request,
  lastReflect: () => ReflectStatus | undefined = () => undefined,
): Promise<Response> {
  const url = new URL(request.url)
  const bot = url.searchParams.get('bot') ?? 'aris'
  if (!BOT_RE.test(bot)) return json({ error: 'bot không hợp lệ' }, 400)
  if (request.method === 'GET' || request.method === 'HEAD') return json(snapshot(store, bot, lastReflect()))

  let body: { op?: unknown; id?: unknown; text?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const id = typeof body.id === 'string' ? body.id : ''
  const item = store.get(id)
  if (!item || item.bot !== bot) return json({ error: 'không thấy ký ức' }, 404)
  try {
    switch (body.op) {
      case 'update':
        await store.update(id, typeof body.text === 'string' ? body.text : '')
        break
      case 'demote':
        await store.demote(id)
        break
      case 'promote':
        await store.promote(id)
        break
      case 'approve':
        await store.approve(id)
        break
      case 'forget':
      case 'discard':
        await store.forget(id)
        break
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
  } catch (err) {
    if (err instanceof MemoryError) return json({ error: err.message, code: err.code }, 409)
    throw err
  }
  return json(snapshot(store, bot, lastReflect()))
}
