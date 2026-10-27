/**
 * Đường `/api/aris/channels` cho trang 6.3 Kênh và ghép đôi. dsh đã kiểm Host/Origin, cookie
 * đăng nhập và quyền chủ nhân trước khi gọi tới đây. Token bot chỉ đi vào, không bao giờ trả ra.
 *   GET                                   → bot, người đã ghép đôi, nhóm, mã đang hiệu lực, cài đặt
 *   POST { op: 'connect', bot, token, account?, label? } → kiểm tra token bằng getMe, lưu vào kho khoá; `account`
 *        là mã tài khoản (mặc định: tài khoản cũ mang mã bot), `'new'` là thêm tài khoản mới cho bot (GĐ8.7)
 *   POST { op: 'disconnect', account? | bot }
 *   POST { op: 'account', channel: 'telegram' | 'zalo', account, bot?, label?, mode? } → đổi bot trả lời, tên, chế độ
 *   POST { op: 'code', role, channel?, account? } → mã ghép đôi mới (mặc định telegram; một lần, 10 phút; có
 *        `account` thì chỉ dùng được trên tài khoản đó)
 *   POST { op: 'revoke', userId, account? }
 *   POST { op: 'group', chatId, account?, allowed?, who?, prompt? } | { op: 'group-remove', chatId, account? }
 *   POST { op: 'settings', busy?, guestMode? } | { op: 'voice', bot, on }
 *   Lark (App Secret chỉ đi vào, không bao giờ trả ra):
 *   POST { op: 'connect-lark', bot, appId, appSecret, domain } → kiểm khoá bằng lời gọi lấy thông tin bot, lưu vào kho khoá
 *   POST { op: 'disconnect-lark', bot } | { op: 'revoke-lark', openId }
 *   POST { op: 'lark-group', chatId, allowed?, who?, prompt? } | { op: 'lark-group-remove', chatId }
 *   (mã ghép đôi Lark: op 'code' với channel 'lark')
 *   Zalo cá nhân (zca-js, không chính thức; dữ liệu đăng nhập chỉ vào kho khoá, không bao giờ trả ra):
 *   POST { op: 'zalo-login-start', bot, account?, label? } → { qr: { qrPng (base64), expiresAt, key } }; không có
 *        `account` là thêm tài khoản mới; quét xong kênh tự bắt đầu nghe
 *   POST { op: 'zalo-login-status' } → ảnh chụp, trong đó `zalo.logins` là các lần đăng nhập QR (chờ quét, đã quét…)
 *   POST { op: 'zalo-logout', account } | { op: 'revoke-zalo', zaloId, account? }
 *   POST { op: 'zalo-group', groupId, account?, allowed?, who?, prompt? } | { op: 'zalo-group-remove', groupId, account? }
 *   (mã ghép đôi Zalo: op 'code' với channel 'zalo')
 */
import { CHANNEL_KINDS, type ChannelKind } from './domain.js'
import type { ChannelHub } from './hub.js'
import type { LarkChannel } from './lark/channel.js'
import type { LarkCliInfo } from './lark/cli.js'
import { accId, type ChannelStore } from './store.js'
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
export function zaloSnapshot(store: ChannelStore, zalo: ZaloChannel | undefined) {
  return {
    accounts:
      zalo?.status() ??
      store.zaloAccounts().map((a) => ({
        account: accId(a),
        label: a.label ?? a.name,
        mode: a.mode ?? 'paired',
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
    logins: zalo?.loginStatuses() ?? [],
    /** Người đã ghép đôi; `account` trống là dùng chung mọi tài khoản (chủ nhân). */
    people: store.zaloPeople().map((p) => ({
      zaloId: p.openId ?? '',
      name: p.name,
      role: p.role,
      pairedAt: p.pairedAt,
      account: p.account ?? null,
    })),
    groups: store.zaloGroups().map((g) => ({
      groupId: g.chatRef ?? '',
      account: g.account ?? null,
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
  } = {},
) {
  return {
    /** Tài khoản Telegram (GĐ8.7: nhiều tài khoản, mỗi tài khoản một bot trả lời). */
    bots: store.bots().map((b) => ({
      account: accId(b),
      label: b.label ?? b.name,
      mode: b.mode ?? 'paired',
      bot: b.bot,
      username: b.username,
      name: b.name,
      canReadAll: b.canReadAll,
      voice: b.voice,
      home: b.home ?? null,
      error: b.error ?? null,
      running: hub.api(accId(b)) !== undefined,
    })),
    people: store.people(),
    groups: store.groups(),
    codes: store.activeCodes(),
    settings: { busy: store.settings().busy, guestMode: store.settings().guestMode },
    lark: larkSnapshot(store, extra.lark, extra.larkCli ?? null),
    zalo: zaloSnapshot(store, extra.zalo),
  }
}

const BOT_RE = /^[a-z0-9-]{1,40}$/
/** Mã tài khoản hợp lệ (`acc-…`, mã bot cũ, hay `new`); khác thì bỏ. */
const acc = (v: unknown) => (typeof v === 'string' && BOT_RE.test(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

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
  const snap = async () => snapshot(store, hub, { lark, larkCli: (await probeLarkCli?.()) ?? null, zalo })
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
        await hub.connect(bot, token, acc(body.account) ?? bot, str(body.label))
        break
      }
      case 'disconnect':
        await hub.disconnect(acc(body.account) ?? bot)
        break
      case 'account': {
        const account = acc(body.account)
        if (!account) return json({ error: 'thiếu account' }, 400)
        if (typeof body.bot === 'string' && canHaveChannel && !canHaveChannel(body.bot))
          return json({ error: 'bot này không có trong đội, hoặc là bot ngoài (không có kênh riêng)' }, 400)
        const label = str(body.label)
        const patch = {
          ...(typeof body.bot === 'string' && BOT_RE.test(body.bot) ? { bot: body.bot } : {}),
          ...(label ? { label: label.slice(0, 40) } : {}),
          ...(body.mode === 'paired' || body.mode === 'guests'
            ? { mode: body.mode as 'paired' | 'guests' }
            : {}),
        }
        if (body.channel === 'zalo') {
          if (!zalo) return json({ error: 'kênh Zalo chưa bật' }, 400)
          await zalo.updateAccount(account, patch)
        } else await hub.updateAccount(account, patch)
        break
      }
      case 'code': {
        const role = body.role === 'member' ? 'member' : 'owner'
        const channel = CHANNEL_KINDS.find((k) => k === body.channel) satisfies ChannelKind | undefined
        if (body.channel !== undefined && !channel) return json({ error: 'kênh không hợp lệ' }, 400)
        const code = await store.createCode(role, channel ?? 'telegram', acc(body.account))
        return json({ ...(await snap()), created: code })
      }
      case 'revoke':
        if (typeof body.userId !== 'number') return json({ error: 'thiếu userId' }, 400)
        await store.revoke(body.userId, acc(body.account))
        break
      case 'group': {
        if (typeof body.chatId !== 'number') return json({ error: 'thiếu chatId' }, 400)
        await store.upsertGroup(
          body.chatId,
          {
            ...(typeof body.allowed === 'boolean' ? { allowed: body.allowed } : {}),
            ...(body.who === 'allowed' || body.who === 'everyone' ? { who: body.who } : {}),
            ...(typeof body.prompt === 'string' ? { prompt: body.prompt.slice(0, 2000) } : {}),
          },
          acc(body.account),
        )
        break
      }
      case 'group-remove':
        if (typeof body.chatId !== 'number') return json({ error: 'thiếu chatId' }, 400)
        await store.removeGroup(body.chatId, acc(body.account))
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
        const qr = await zalo.loginStart(bot, { account: acc(body.account), label: str(body.label) })
        return json({ ...(await snap()), qr })
      }
      case 'zalo-login-status':
        // Chỉ đọc: giao diện hỏi lại vài giây một lần trong lúc chờ quét.
        break
      case 'zalo-logout':
        if (!zalo) return json({ error: 'kênh Zalo chưa bật' }, 400)
        await zalo.logout(acc(body.account) ?? bot)
        break
      case 'revoke-zalo':
        if (typeof body.zaloId !== 'string' || !body.zaloId) return json({ error: 'thiếu zaloId' }, 400)
        await store.revokeZalo(body.zaloId, acc(body.account))
        break
      case 'zalo-group': {
        if (typeof body.groupId !== 'string' || !body.groupId) return json({ error: 'thiếu groupId' }, 400)
        await store.upsertZaloGroup(
          body.groupId,
          {
            ...(typeof body.allowed === 'boolean' ? { allowed: body.allowed } : {}),
            ...(body.who === 'allowed' || body.who === 'everyone' ? { who: body.who } : {}),
            ...(typeof body.prompt === 'string' ? { prompt: body.prompt.slice(0, 2000) } : {}),
          },
          acc(body.account),
        )
        break
      }
      case 'zalo-group-remove':
        if (typeof body.groupId !== 'string' || !body.groupId) return json({ error: 'thiếu groupId' }, 400)
        await store.removeZaloGroup(body.groupId, acc(body.account))
        break
      default:
        return json({ error: 'thao tác không hợp lệ' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
  return json(await snap())
}
