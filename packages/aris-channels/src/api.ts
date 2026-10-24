/**
 * Đường `/api/aris/channels` cho trang 6.3 Kênh và ghép đôi. dsh đã kiểm Host/Origin, cookie
 * đăng nhập và quyền chủ nhân trước khi gọi tới đây. Token bot chỉ đi vào, không bao giờ trả ra.
 *   GET                                   → bot, người đã ghép đôi, nhóm, mã đang hiệu lực, cài đặt
 *   POST { op: 'connect', bot, token }    → kiểm tra token bằng getMe, lưu vào kho khoá
 *   POST { op: 'disconnect', bot }
 *   POST { op: 'code', role }             → mã ghép đôi mới (một lần, 10 phút)
 *   POST { op: 'revoke', userId }
 *   POST { op: 'group', chatId, allowed?, who?, prompt? } | { op: 'group-remove', chatId }
 *   POST { op: 'settings', busy?, guestMode? } | { op: 'voice', bot, on }
 */
import type { ChannelHub } from './hub.js'
import type { ChannelStore } from './store.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export function snapshot(store: ChannelStore, hub: ChannelHub) {
  return {
    bots: store.bots().map((b) => ({
      bot: b.bot,
      username: b.username,
      name: b.name,
      canReadAll: b.canReadAll,
      voice: b.voice,
      home: b.home ?? null,
      error: b.error ?? null,
      running: hub.api(b.bot) !== undefined,
    })),
    people: store.people(),
    groups: store.groups(),
    codes: store.activeCodes(),
    settings: { busy: store.settings().busy, guestMode: store.settings().guestMode },
  }
}

const BOT_RE = /^[a-z0-9-]{1,40}$/

export async function handleApi(
  store: ChannelStore,
  hub: ChannelHub,
  request: Request,
  /** Bot của aris nhận được kênh riêng (có trong đội, không phải bot ngoài); không có là nhận mọi mã. */
  canHaveChannel?: (bot: string) => boolean,
): Promise<Response> {
  if (request.method === 'GET' || request.method === 'HEAD') return json(snapshot(store, hub))
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const bot = typeof body.bot === 'string' && BOT_RE.test(body.bot) ? body.bot : 'aris'
  try {
    switch (body.op) {
      case 'connect': {
        const token = typeof body.token === 'string' ? body.token.trim() : ''
        if (!/^\d+:[\w-]{20,}$/.test(token))
          return json({ error: 'token không đúng dạng của BotFather' }, 400)
        if (canHaveChannel && !canHaveChannel(bot))
          return json({ error: 'bot này không có trong đội, hoặc là bot ngoài (không có kênh riêng)' }, 400)
        await hub.connect(bot, token)
        break
      }
      case 'disconnect':
        await hub.disconnect(bot)
        break
      case 'code': {
        const role = body.role === 'member' ? 'member' : 'owner'
        const code = await store.createCode(role)
        return json({ ...snapshot(store, hub), created: code })
      }
      case 'revoke':
        if (typeof body.userId !== 'number') return json({ error: 'thiếu userId' }, 400)
        await store.revoke(body.userId)
        break
      case 'group': {
        if (typeof body.chatId !== 'number') return json({ error: 'thiếu chatId' }, 400)
        await store.upsertGroup(body.chatId, {
          ...(typeof body.allowed === 'boolean' ? { allowed: body.allowed } : {}),
          ...(body.who === 'allowed' || body.who === 'everyone' ? { who: body.who } : {}),
          ...(typeof body.prompt === 'string' ? { prompt: body.prompt.slice(0, 2000) } : {}),
        })
        break
      }
      case 'group-remove':
        if (typeof body.chatId !== 'number') return json({ error: 'thiếu chatId' }, 400)
        await store.removeGroup(body.chatId)
        break
      case 'settings':
        await store.updateSettings({
          ...(body.busy === 'steer' || body.busy === 'queue' || body.busy === 'interrupt'
            ? { busy: body.busy }
            : {}),
          ...(typeof body.guestMode === 'boolean' ? { guestMode: body.guestMode } : {}),
        })
        break
      case 'voice':
        await store.patchBot(bot, { voice: body.on === true })
        break
      default:
        return json({ error: 'thao tác không hợp lệ' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
  return json(snapshot(store, hub))
}
