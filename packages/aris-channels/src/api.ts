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
 *   Zalo cá nhân (zca-js, không chính thức; dữ liệu đăng nhập chỉ vào kho khoá, không bao giờ trả ra):
 *   POST { op: 'zalo-login-start', bot } → { qrPng (base64), expiresAt }; quét xong kênh tự bắt đầu nghe
 *   POST { op: 'zalo-login-status', bot } → trạng thái lần đăng nhập QR gần nhất (chờ quét, đã quét, đã đăng nhập, hết hạn…)
 *   POST { op: 'zalo-logout', bot } | { op: 'revoke-zalo', zaloId }
 *   POST { op: 'zalo-group', groupId, allowed?, who?, prompt? } | { op: 'zalo-group-remove', groupId }
 *   (mã ghép đôi Zalo: op 'code' với channel 'zalo')
 */
import { CHANNEL_KINDS, type ChannelKind } from './domain.js'
import type { ChannelHub } from './hub.js'
import type { LarkChannel } from './lark/channel.js'
import type { LarkCliInfo } from './lark/cli.js'
import type { ChannelStore } from './store.js'
import { ZALO_LIMITS } from './zalo/access.js'
import type { ZaloChannel } from './zalo/channel.js'

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

/** Phần Zalo của ảnh chụp trạng thái cho trang Kênh. */
export function zaloSnapshot(store: ChannelStore, zalo: ZaloChannel | undefined, bot = 'aris') {
  return {
    accounts:
      zalo?.status() ??
      store.zaloAccounts().map((a) => ({
        bot: a.bot,
        id: a.botOpenId ?? '',
        name: a.name,
        avatar: a.avatar ?? '',
        state: a.error ? 'needs-qr' : 'connecting',
        error: a.error ?? null,
        running: false,
        leftToday: ZALO_LIMITS.perDay,
      })),
    /** Lần đăng nhập QR gần nhất của bot (có ảnh QR khi đang chờ quét). */
    login: zalo?.loginStatus(bot) ?? null,
    people: store.zaloPeople().map((p) => ({
      zaloId: p.openId ?? '',
      name: p.name,
      role: p.role,
      pairedAt: p.pairedAt,
    })),
    groups: store.zaloGroups().map((g) => ({
      groupId: g.chatRef ?? '',
      title: g.title,
      allowed: g.allowed,
      who: g.who,
      ...(g.prompt ? { prompt: g.prompt } : {}),
    })),
    /** Giới hạn tần suất gửi tin: chỉ hiện, không sửa. */
    limits: ZALO_LIMITS,
  }
}

export function snapshot(
  store: ChannelStore,
  hub: ChannelHub,
  extra: {
    lark?: LarkChannel | undefined
    larkCli?: LarkCliInfo | null
    zalo?: ZaloChannel | undefined
    bot?: string
  } = {},
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
    zalo: zaloSnapshot(store, extra.zalo, extra.bot),
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
  /** Kênh Zalo cá nhân (không có thì các thao tác Zalo báo lỗi). */
  zalo?: ZaloChannel,
): Promise<Response> {
  let current = 'aris'
  const snap = async () =>
    snapshot(store, hub, { lark, larkCli: (await probeLarkCli?.()) ?? null, zalo, bot: current })
  if (request.method === 'GET' || request.method === 'HEAD') return json(await snap())
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const bot = typeof body.bot === 'string' && BOT_RE.test(body.bot) ? body.bot : 'aris'
  current = bot
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
      case 'zalo-login-start': {
        if (!zalo) return json({ error: 'kênh Zalo chưa bật' }, 400)
        if (canHaveChannel && !canHaveChannel(bot))
          return json({ error: 'bot này không có trong đội, hoặc là bot ngoài (không có kênh riêng)' }, 400)
        const qr = await zalo.loginStart(bot)
        return json({ ...(await snap()), qr })
      }
      case 'zalo-login-status':
        // Chỉ đọc: giao diện hỏi lại vài giây một lần trong lúc chờ quét.
        break
      case 'zalo-logout':
        if (!zalo) return json({ error: 'kênh Zalo chưa bật' }, 400)
        await zalo.logout(bot)
        break
      case 'revoke-zalo':
        if (typeof body.zaloId !== 'string' || !body.zaloId) return json({ error: 'thiếu zaloId' }, 400)
        await store.revokeZalo(body.zaloId)
        break
      case 'zalo-group': {
        if (typeof body.groupId !== 'string' || !body.groupId) return json({ error: 'thiếu groupId' }, 400)
        await store.upsertZaloGroup(body.groupId, {
          ...(typeof body.allowed === 'boolean' ? { allowed: body.allowed } : {}),
          ...(body.who === 'allowed' || body.who === 'everyone' ? { who: body.who } : {}),
          ...(typeof body.prompt === 'string' ? { prompt: body.prompt.slice(0, 2000) } : {}),
        })
        break
      }
      case 'zalo-group-remove':
        if (typeof body.groupId !== 'string' || !body.groupId) return json({ error: 'thiếu groupId' }, 400)
        await store.removeZaloGroup(body.groupId)
        break
      default:
        return json({ error: 'thao tác không hợp lệ' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
  return json(await snap())
}
