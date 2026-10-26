/**
 * Giao diện nhỏ giữa kênh Lark và SDK `@larksuiteoapi/node-sdk`. Kênh chỉ biết các kiểu ở đây; phần gọi SDK thật
 * nằm trọn trong `sdk.ts`, nên kiểm thử thay nó bằng bản giả và không bao giờ gọi mạng.
 */

/** `lark` là Lark quốc tế (larksuite.com), `feishu` là Feishu (feishu.cn). */
export type LarkDomain = 'lark' | 'feishu'

export interface LarkCredentials {
  /** App ID dạng `cli_…`, không phải bí mật. */
  appId: string
  /** App Secret: chỉ nằm trong bộ nhớ lúc chạy và trong kho khoá, không vào bản ghi hay log. */
  appSecret: string
  domain: LarkDomain
}

/** Một người hay bot được @ trong tin; `key` là chỗ giữ chỗ trong chữ (`@_user_1`). */
export interface LarkMention {
  key: string
  openId?: string | undefined
  name?: string | undefined
}

/** Sự kiện `im.message.receive_v1` đã chuẩn hoá (đây cũng là dạng lưu trong hàng đợi bền). */
export interface LarkInbound {
  /** Mã sự kiện (`event_id`); trống nếu Lark không gửi. */
  eventId: string
  messageId: string
  chatId: string
  /** `p2p` (chat riêng) hay `group`. */
  chatType: string
  senderOpenId: string
  /** `user` là người; bot khác hay ứng dụng thì bỏ qua. */
  senderType: string
  /** `text`, `post`, `image`, `file`, `audio`, `media`, `sticker`… */
  messageType: string
  /** Nội dung dạng chuỗi JSON, theo `messageType`. */
  content: string
  rootId?: string | undefined
  parentId?: string | undefined
  mentions: LarkMention[]
  /** Giờ tạo tin (ms). */
  createTime: number
}

export interface LarkBotInfo {
  /** `open_id` của chính bot, để nhận ra lúc bị @ trong nhóm. */
  openId: string
  name: string
}

/** Người hay nhóm nhận tin gửi đi. */
export type LarkTarget = { kind: 'chat'; id: string } | { kind: 'user'; id: string }

/** Một tin gửi đi: kiểu tin của Lark và nội dung dạng chuỗi JSON. */
export interface LarkOutgoing {
  msgType: 'text' | 'interactive' | 'image' | 'file'
  content: string
}

export interface LarkApi {
  /** Kiểm khoá bằng một lời gọi nhẹ: lấy token rồi thông tin bot. Khoá sai thì ném `LarkError`. */
  botInfo(): Promise<LarkBotInfo>
  /** Tên hiển thị của người (cần quyền `contact:user.base:readonly`); không lấy được thì `undefined`. */
  userName(openId: string): Promise<string | undefined>
  /** Tên nhóm (cần quyền `im:chat:read`); không lấy được thì `undefined`. */
  chatName(chatId: string): Promise<string | undefined>
  /** Gửi tin; có `replyTo` thì trả lời vào tin đó. Trả mã tin vừa gửi. */
  send(to: LarkTarget, msg: LarkOutgoing, replyTo?: string): Promise<{ messageId: string }>
  /** Thả cảm xúc vào một tin; trả mã cảm xúc để gỡ sau. */
  react(messageId: string, emoji: string): Promise<string | undefined>
  unreact(messageId: string, reactionId: string): Promise<void>
  /** Tải ảnh hay tệp người dùng gửi trong một tin; quá `maxBytes` thì ném lỗi. */
  download(messageId: string, fileKey: string, kind: 'image' | 'file', maxBytes: number): Promise<Uint8Array>
  /** Tải ảnh lên để gửi (trả `image_key`). */
  uploadImage(data: Uint8Array): Promise<string>
  /** Tải tệp lên để gửi (trả `file_key`). */
  uploadFile(data: Uint8Array, name: string): Promise<string>
}

export type LarkSocketState = 'ready' | 'reconnecting' | 'reconnected' | 'error'

export interface LarkSocketHandlers {
  /** Gọi cho mỗi tin vào. Phải về nhanh (Lark gửi lại sự kiện nếu quá ~3 giây chưa báo nhận). */
  onMessage(ev: LarkInbound): void | Promise<void>
  onState(state: LarkSocketState, error?: Error): void
}

/** Kết nối dài (WebSocket) nhận sự kiện; tự nối lại khi rớt. */
export interface LarkSocket {
  start(h: LarkSocketHandlers): Promise<void>
  close(): void
}

/** Dựng cặp gọi API + kết nối nhận tin cho một ứng dụng. Mặc định dùng SDK thật (`sdk.ts`). */
export interface LarkConnector {
  open(c: LarkCredentials, log: LarkLog): { api: LarkApi; socket: LarkSocket }
}

export interface LarkLog {
  warn(msg: string, ...a: unknown[]): void
}

/**
 * Lỗi từ Lark. `code` là mã của Lark (0 là không có; 0 cũng dùng khi không tới được Lark: mạng, hết giờ).
 * `fatal`: khoá sai hay ứng dụng không hợp lệ, thử lại cũng vô ích.
 */
export class LarkError extends Error {
  constructor(
    message: string,
    readonly code = 0,
    readonly fatal = false,
  ) {
    super(message)
    this.name = 'LarkError'
  }
}
