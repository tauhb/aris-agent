/**
 * Phần duy nhất của aris gọi SDK chính thức của Lark (`@larksuiteoapi/node-sdk`): `Client` để gọi API, `WSClient` cùng
 * `EventDispatcher` để nhận sự kiện `im.message.receive_v1` bằng kết nối dài (không cần server, không cần webhook).
 *
 * App Secret không bao giờ vào log hay lời báo lỗi. SDK có thể tự ghi cả yêu cầu lỗi (kể cả thân yêu cầu lấy token
 * chứa App Secret), nên logger ở đây chỉ nhận chuỗi và `Error.message`, bỏ mọi đối tượng, và che App Secret nếu có lọt.
 */
import * as lark from '@larksuiteoapi/node-sdk'
import {
  LarkError,
  type LarkApi,
  type LarkConnector,
  type LarkCredentials,
  type LarkInbound,
  type LarkLog,
  type LarkOutgoing,
  type LarkSocket,
  type LarkSocketHandlers,
  type LarkTarget,
} from './types.js'

/** Mã lỗi của Lark do khoá hay ứng dụng sai (App ID không có, App Secret sai): thử lại cũng vô ích. */
const FATAL_CODES = new Set([10003, 10013, 10014])

/** Che App Secret trong một chuỗi (phòng khi SDK ghi nhầm). */
export const redact = (text: string, secret: string) => (secret ? text.split(secret).join('***') : text)

/** Logger của SDK chuyển sang log của aris, chỉ lấy chuỗi và `Error.message`. */
export function sdkLogger(log: LarkLog, secret: string): lark.Logger {
  const line = (args: unknown[]) =>
    redact(
      args
        .flatMap((a) => (typeof a === 'string' ? [a] : a instanceof Error ? [a.message] : []))
        .join(' ')
        .slice(0, 300),
      secret,
    )
  const warn = (...args: unknown[]) => {
    const text = line(args)
    if (text) log.warn('aris-channels: lark: %s', text)
  }
  const quiet = () => undefined
  return { error: warn, warn, info: quiet, debug: quiet, trace: quiet }
}

/** Lỗi bất kỳ (axios ném khi HTTP 4xx, mạng, hay phản hồi có `code` khác 0) thành `LarkError` an toàn để hiện. */
export function toLarkError(e: unknown, secret: string): LarkError {
  if (e instanceof LarkError) return e
  const resp = (e as { response?: { status?: number; data?: { code?: unknown; msg?: unknown } } } | null)
    ?.response
  const code = resp?.data?.code
  if (typeof code === 'number' && code !== 0) {
    const msg = typeof resp?.data?.msg === 'string' ? resp.data.msg : ''
    return new LarkError(redact(`Lark ${code}${msg ? `: ${msg}` : ''}`, secret), code, FATAL_CODES.has(code))
  }
  if (resp?.status) return new LarkError(`Lark trả HTTP ${resp.status}`)
  return new LarkError(redact(e instanceof Error ? e.message : String(e), secret) || 'không tới được Lark')
}

/** Phản hồi của Lark có `code` khác 0 (nhưng HTTP 200) cũng là lỗi. */
function check<T extends { code?: number | undefined; msg?: string | undefined } | null | undefined>(
  res: T,
  secret: string,
): NonNullable<T> {
  if (!res) throw new LarkError('Lark không trả dữ liệu')
  if (res.code !== undefined && res.code !== 0)
    throw toLarkError({ response: { data: { code: res.code, msg: res.msg } } }, secret)
  return res
}

class SdkApi implements LarkApi {
  private readonly client: lark.Client

  constructor(
    private readonly c: LarkCredentials,
    log: LarkLog,
  ) {
    this.client = new lark.Client({
      appId: c.appId,
      appSecret: c.appSecret,
      domain: c.domain === 'feishu' ? lark.Domain.Feishu : lark.Domain.Lark,
      logger: sdkLogger(log, c.appSecret),
      loggerLevel: lark.LoggerLevel.warn,
    })
  }

  /** Chạy một lời gọi SDK, đổi mọi lỗi thành `LarkError`. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      throw toLarkError(e, this.c.appSecret)
    }
  }

  botInfo() {
    return this.call(async () => {
      // Lấy token trước: khoá sai báo rõ (App ID không có, App Secret sai) thay vì lỗi "thiếu token" khó hiểu.
      check(
        await this.client.auth.v3.tenantAccessToken.internal({
          data: { app_id: this.c.appId, app_secret: this.c.appSecret },
        }),
        this.c.appSecret,
      )
      const r = check(
        await this.client.request<{
          code?: number
          msg?: string
          bot?: { open_id?: string; app_name?: string }
        }>({ method: 'GET', url: '/open-apis/bot/v3/info' }),
        this.c.appSecret,
      )
      if (!r.bot?.open_id) throw new LarkError('ứng dụng chưa bật tính năng Bot')
      return { openId: r.bot.open_id, name: r.bot.app_name ?? 'bot' }
    })
  }

  async userName(openId: string) {
    try {
      const r = await this.client.contact.v3.user.get({
        path: { user_id: openId },
        params: { user_id_type: 'open_id' },
      })
      return r.data?.user?.name || undefined
    } catch {
      // Thiếu quyền `contact:user.base:readonly` hay người không còn: dùng tên thay thế.
      return undefined
    }
  }

  async chatName(chatId: string) {
    try {
      const r = await this.client.im.v1.chat.get({ path: { chat_id: chatId } })
      return r.data?.name || undefined
    } catch {
      return undefined
    }
  }

  send(to: LarkTarget, msg: LarkOutgoing, replyTo?: string) {
    return this.call(async () => {
      const res = replyTo
        ? await this.client.im.v1.message.reply({
            path: { message_id: replyTo },
            data: { msg_type: msg.msgType, content: msg.content },
          })
        : await this.client.im.v1.message.create({
            params: { receive_id_type: to.kind === 'chat' ? 'chat_id' : 'open_id' },
            data: { receive_id: to.id, msg_type: msg.msgType, content: msg.content },
          })
      return { messageId: check(res, this.c.appSecret).data?.message_id ?? '' }
    })
  }

  async react(messageId: string, emoji: string) {
    return this.call(async () => {
      const r = check(
        await this.client.im.v1.messageReaction.create({
          path: { message_id: messageId },
          data: { reaction_type: { emoji_type: emoji } },
        }),
        this.c.appSecret,
      )
      return r.data?.reaction_id
    })
  }

  async unreact(messageId: string, reactionId: string) {
    await this.call(async () =>
      check(
        await this.client.im.v1.messageReaction.delete({
          path: { message_id: messageId, reaction_id: reactionId },
        }),
        this.c.appSecret,
      ),
    )
  }

  download(messageId: string, fileKey: string, kind: 'image' | 'file', maxBytes: number) {
    return this.call(async () => {
      const res = await this.client.im.v1.messageResource.get({
        params: { type: kind },
        path: { message_id: messageId, file_key: fileKey },
      })
      const chunks: Buffer[] = []
      let size = 0
      for await (const part of res.getReadableStream()) {
        const b = part as Buffer
        size += b.length
        if (size > maxBytes) throw new LarkError('tệp quá lớn')
        chunks.push(b)
      }
      return new Uint8Array(Buffer.concat(chunks))
    })
  }

  uploadImage(data: Uint8Array) {
    return this.call(async () => {
      const r = await this.client.im.v1.image.create({
        data: { image_type: 'message', image: Buffer.from(data) },
      })
      if (!r?.image_key) throw new LarkError('Lark không trả image_key')
      return r.image_key
    })
  }

  uploadFile(data: Uint8Array, name: string) {
    return this.call(async () => {
      const r = await this.client.im.v1.file.create({
        data: { file_type: 'stream', file_name: name, file: Buffer.from(data) },
      })
      if (!r?.file_key) throw new LarkError('Lark không trả file_key')
      return r.file_key
    })
  }
}

type ReceiveEvent = Parameters<NonNullable<lark.EventHandles['im.message.receive_v1']>>[0]

/** Sự kiện thô của Lark → `LarkInbound`. */
export function toInbound(e: ReceiveEvent): LarkInbound {
  const m = e.message
  return {
    eventId: e.event_id ?? '',
    messageId: m.message_id,
    chatId: m.chat_id,
    chatType: m.chat_type,
    senderOpenId: e.sender.sender_id?.open_id ?? '',
    senderType: e.sender.sender_type,
    messageType: m.message_type,
    content: m.content,
    ...(m.root_id ? { rootId: m.root_id } : {}),
    ...(m.parent_id ? { parentId: m.parent_id } : {}),
    mentions: (m.mentions ?? []).map((x) => ({ key: x.key, openId: x.id.open_id, name: x.name })),
    createTime: Number(m.create_time) || Date.now(),
  }
}

class SdkSocket implements LarkSocket {
  private ws: lark.WSClient | undefined

  constructor(
    private readonly c: LarkCredentials,
    private readonly log: LarkLog,
  ) {}

  async start(h: LarkSocketHandlers) {
    const dispatcher = new lark.EventDispatcher({
      logger: sdkLogger(this.log, this.c.appSecret),
      loggerLevel: lark.LoggerLevel.warn,
    }).register({
      // Về nhanh: Lark gửi lại sự kiện nếu quá ~3 giây chưa được báo nhận.
      'im.message.receive_v1': async (data) => {
        await h.onMessage(toInbound(data))
      },
    })
    this.ws = new lark.WSClient({
      appId: this.c.appId,
      appSecret: this.c.appSecret,
      domain: this.c.domain === 'feishu' ? lark.Domain.Feishu : lark.Domain.Lark,
      logger: sdkLogger(this.log, this.c.appSecret),
      loggerLevel: lark.LoggerLevel.warn,
      // Rớt mạng lúc máy ngủ dậy: coi kết nối chết nếu 60 giây không thấy gì thì nối lại.
      wsConfig: { pingTimeout: 60 },
      onReady: () => h.onState('ready'),
      onReconnecting: () => h.onState('reconnecting'),
      onReconnected: () => h.onState('reconnected'),
      onError: (err) => h.onState('error', new LarkError(redact(err.message, this.c.appSecret))),
    })
    await this.ws.start({ eventDispatcher: dispatcher })
  }

  close() {
    this.ws?.close({ force: true })
    this.ws = undefined
  }
}

/** Bộ nối thật, dùng SDK chính thức. */
export const sdkConnector: LarkConnector = {
  open: (c, log) => ({ api: new SdkApi(c, log), socket: new SdkSocket(c, log) }),
}
