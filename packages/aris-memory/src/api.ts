/**
 * Đường `/api/aris/memory` cho trang Ký ức (3.1). dsh đã kiểm Host/Origin, cookie và
 * quyền chủ nhân trước khi gọi tới đây.
 *   GET  ?bot=aris                       → lõi, lưu trữ, chờ duyệt, dung lượng hai cuốn
 *   GET  ?pending=all                    → đề xuất chờ duyệt của mọi bot (Hộp duyệt, màn 3.4)
 *   POST { op, id, text? }               → update | demote | promote | forget | approve | discard
 *   POST { op: 'review', id, decision, text?, tier? } → trả lời một đề xuất (save | discard)
 */
import type { Proposals } from './proposals.js'
import { MemoryError, TIERS, type MemoryItem, type MemoryStore, type Tier } from './store.js'
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
  proposals?: Proposals,
): Promise<Response> {
  const url = new URL(request.url)
  const isRead = request.method === 'GET' || request.method === 'HEAD'
  if (isRead && url.searchParams.get('pending') === 'all')
    return json({ pending: proposals?.list() ?? [], doneToday: store.reviewedToday() })
  const bot = url.searchParams.get('bot') ?? 'aris'
  if (!BOT_RE.test(bot)) return json({ error: 'bot không hợp lệ' }, 400)
  if (isRead) return json(snapshot(store, bot, lastReflect()))

  let body: { op?: unknown; id?: unknown; text?: unknown; decision?: unknown; tier?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const id = typeof body.id === 'string' ? body.id : ''
  // Trả lời đề xuất từ Hộp duyệt: không cần biết bot, đề xuất nào cũng được.
  if (body.op === 'review') {
    if (!proposals) return json({ error: 'chưa có hộp đề xuất' }, 400)
    const decision =
      body.decision === 'save' ? 'saved' : body.decision === 'discard' ? 'discarded' : undefined
    if (!decision) return json({ error: 'decision phải là save hoặc discard' }, 400)
    const tier = TIERS.includes(body.tier as Tier) ? (body.tier as Tier) : undefined
    try {
      const item = await proposals.review(id, decision, 'user', {
        text: typeof body.text === 'string' ? body.text : undefined,
        tier,
      })
      return json({ ok: true, item, pending: proposals.list(), doneToday: store.reviewedToday() })
    } catch (err) {
      if (err instanceof MemoryError) return json({ error: err.message, code: err.code }, 409)
      throw err
    }
  }
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
        if (proposals && item.status === 'pending') await proposals.review(id, 'saved', 'user')
        else await store.approve(id)
        break
      case 'discard':
        if (proposals && item.status === 'pending') await proposals.review(id, 'discarded', 'user')
        else await store.forget(id)
        break
      case 'forget':
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
