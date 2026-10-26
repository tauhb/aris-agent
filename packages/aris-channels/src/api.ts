/**
 * Đường `/api/aris/channels` cho trang 6.3 Kênh và ghép đôi. dsh đã kiểm Host/Origin, cookie
 * đăng nhập và quyền chủ nhân trước khi gọi tới đây. Token bot chỉ đi vào, không bao giờ trả ra.
 *   GET                                   → bot, người đã ghép đôi, nhóm, mã đang hiệu lực, cài đặt
 *   POST { op: 'connect', bot, token }    → kiểm tra token bằng getMe, lưu vào kho khoá
 *   POST { op: 'disconnect', bot }
 *   POST { op: 'code', role, channel? }   → mã ghép đôi mới của một kênh (mặc định telegram; một lần, 10 phút)
 *   POST { op: 'revoke', userId }
 *   POST { op: 'group', chatId, allowed?, who?, prompt? } | { op: 'group-remove', chatId }
 *   POST { op: 'settings', busy?, guestMode? } | { op: 'voice', bot, on }
 *   Lark (App Secret chỉ đi vào, không bao giờ trả ra):
 *   POST { op: 'connect-lark', bot, appId, appSecret, domain } → kiểm khoá bằng lời gọi lấy thông tin bot, lưu vào kho khoá
 *   POST { op: 'disconnect-lark', bot } | { op: 'revoke-lark', openId }
 *   POST { op: 'lark-group', chatId, allowed?, who?, prompt? } | { op: 'lark-group-remove', chatId }
 *   (mã ghép đôi Lark: op 'code' với channel 'lark')
 */
import { CHANNEL_KINDS, type ChannelKind } from './domain.js'
import type { ChannelHub } from './hub.js'
import type { LarkChannel } from './lark/channel.js'
import type { LarkCliInfo } from './lark/cli.js'
import type { ChannelStore } from './store.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** Phần Lark của ảnh chụp trạng thái cho trang Kênh. */
export function larkSnapshot(store: ChannelStore, lark: LarkChannel | undefined, cli: LarkCliInfo | null) {
  return {
    apps:
      lark?.status() ??
      store.larkApps().map((a) => ({
        bot: a.bot,
        appId: a.appId ?? '',
        name: a.name,
        domain: a.domain ?? 'lark',
        state: a.error ? 'error' : 'connecting',
        error: a.error ?? null,
        running: false,
      })),
    people: store.larkPeople().map((p) => ({
      openId: p.openId ?? '',
      name: p.name,
      role: p.role,
      pairedAt: p.pairedAt,
    })),
    groups: store.larkGroups().map((g) => ({
      chatId: g.chatRef ?? '',
      title: g.title,
      allowed: g.allowed,
      who: g.who,
      ...(g.prompt ? { prompt: g.prompt } : {}),
    })),
    /** `lark-cli` có trên máy (dò, chỉ chạy `--version`); null khi không có. */
    cli,
  }
}

export function snapshot(
  store: ChannelStore,
  hub: ChannelHub,
  extra: { lark?: LarkChannel | undefined; larkCli?: LarkCliInfo | null } = {},
) {
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
    lark: larkSnapshot(store, extra.lark, extra.larkCli ?? null),
  }
}

const BOT_RE = /^[a-z0-9-]{1,40}$/

export async function handleApi(
  store: ChannelStore,
  hub: ChannelHub,
  request: Request,
  /** Bot của aris nhận được kênh riêng (có trong đội, không phải bot ngoài); không có là nhận mọi mã. */
  canHaveChannel?: (bot: string) => boolean,
  /** Kênh Lark (không có thì các thao tác Lark báo lỗi) và hàm dò `lark-cli`. */
  lark?: LarkChannel,
  probeLarkCli?: () => Promise<LarkCliInfo | null>,
): Promise<Response> {
  const snap = async () => snapshot(store, hub, { lark, larkCli: (await probeLarkCli?.()) ?? null })
  if (request.method === 'GET' || request.method === 'HEAD') return json(await snap())
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
        const channel = CHANNEL_KINDS.find((k) => k === body.channel) satisfies ChannelKind | undefined
        if (body.channel !== undefined && !channel) return json({ error: 'kênh không hợp lệ' }, 400)
        const code = await store.createCode(role, channel ?? 'telegram')
        return json({ ...(await snap()), created: code })
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
      case 'connect-lark': {
        if (!lark) return json({ error: 'kênh Lark chưa bật' }, 400)
        if (canHaveChannel && !canHaveChannel(bot))
          return json({ error: 'bot này không có trong đội, hoặc là bot ngoài (không có kênh riêng)' }, 400)
        const appId = typeof body.appId === 'string' ? body.appId.trim() : ''
        const appSecret = typeof body.appSecret === 'string' ? body.appSecret.trim() : ''
        if (!appId || !appSecret) return json({ error: 'thiếu App ID hoặc App Secret' }, 400)
        await lark.connect(bot, { appId, appSecret, domain: body.domain === 'feishu' ? 'feishu' : 'lark' })
        break
      }
      case 'disconnect-lark':
        if (!lark) return json({ error: 'kênh Lark chưa bật' }, 400)
        await lark.disconnect(bot)
        break
      case 'revoke-lark':
        if (typeof body.openId !== 'string' || !body.openId) return json({ error: 'thiếu openId' }, 400)
        await store.revokeLark(body.openId)
        break
      case 'lark-group': {
        if (typeof body.chatId !== 'string' || !body.chatId) return json({ error: 'thiếu chatId' }, 400)
        await store.upsertLarkGroup(body.chatId, {
          ...(typeof body.allowed === 'boolean' ? { allowed: body.allowed } : {}),
          ...(body.who === 'allowed' || body.who === 'everyone' ? { who: body.who } : {}),
          ...(typeof body.prompt === 'string' ? { prompt: body.prompt.slice(0, 2000) } : {}),
        })
        break
      }
      case 'lark-group-remove':
        if (typeof body.chatId !== 'string' || !body.chatId) return json({ error: 'thiếu chatId' }, 400)
        await store.removeLarkGroup(body.chatId)
        break
      default:
        return json({ error: 'thao tác không hợp lệ' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
  return json(await snap())
}
