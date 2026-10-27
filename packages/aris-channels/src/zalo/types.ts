/**
 * Giao diện nhỏ giữa kênh Zalo cá nhân và thư viện không chính thức `zca-js`. Kênh chỉ biết các kiểu ở đây; phần gọi
 * thư viện thật nằm trọn trong `sdk.ts`, nên kiểm thử thay nó bằng bản giả và không bao giờ gọi mạng.
 */

/**
 * Dữ liệu đăng nhập của một tài khoản Zalo (cookie, imei, user agent). Rất nhạy cảm: chỉ nằm trong bộ nhớ lúc chạy và
 * trong kho khoá (dạng JSON, tên `ZALO_<MÃ BOT>_SESSION`), không vào bản ghi, tệp thường hay log.
 */
export interface ZaloSession {
  imei: string
  userAgent: string
  cookie: unknown
  language?: string | undefined
}

/** Một tin vào đã chuẩn hoá (đây cũng là dạng lưu trong hàng đợi bền). */
export interface ZaloInbound {
  messageId: string
  /** Mã người (chat riêng) hay mã nhóm: nơi trả lời. */
  threadId: string
  isGroup: boolean
  senderId: string
  /** Tên hiển thị người gửi theo tin (có thể trống). */
  senderName: string
  /** `webchat` (chữ), `chat.photo`, `share.file`, `chat.voice`, `chat.video.msg`… */
  msgType: string
  /** Chữ của tin (tin chữ thường), hay chuỗi JSON của nội dung đính kèm. */
  content: string
  /** Những người được @ trong tin nhóm: mã Zalo, vị trí và độ dài chỗ @ trong chữ. */
  mentions: { uid: string; pos: number; len: number }[]
  /** Giờ tạo tin (ms). */
  createTime: number
  /** Tin do chính tài khoản gửi (chủ tự gõ trên điện thoại, hay tin aris vừa gửi): dùng cho "nhường tay cho chủ". */
  fromSelf?: boolean | undefined
}

/** Thông tin tài khoản Zalo đang đăng nhập. */
export interface ZaloProfile {
  id: string
  name: string
  avatar: string
}

export interface ZaloApi {
  /** Mã Zalo của chính tài khoản. */
  selfId(): string
  profile(): Promise<ZaloProfile>
  /** Tên hiển thị của người; không lấy được thì `undefined`. */
  userName(id: string): Promise<string | undefined>
  /** Tên nhóm; không lấy được thì `undefined`. */
  groupName(id: string): Promise<string | undefined>
  /** Gửi tin chữ thường (tối đa 2.000 ký tự); `mention` @nhắc thật một người ở đầu tin (nhóm). Trả mã tin vừa gửi. */
  send(
    threadId: string,
    isGroup: boolean,
    text: string,
    mention?: { uid: string; len: number },
  ): Promise<{ messageId: string }>
  /** Nhãn của tài khoản (đặt trên app Zalo): tên nhãn và các cuộc chat mang nhãn. */
  labels(): Promise<{ name: string; threads: string[] }[]>
  /** Gửi ảnh hay tệp. */
  sendFile(
    threadId: string,
    isGroup: boolean,
    data: Uint8Array,
    filename: string,
  ): Promise<{ messageId: string }>
  /** Báo "đang soạn tin". */
  typing(threadId: string, isGroup: boolean): Promise<void>
  /** Tải ảnh hay tệp theo đường dẫn trong tin; quá `maxBytes` thì ném lỗi. */
  download(url: string, maxBytes: number): Promise<Uint8Array>
}

/** Lý do trình nghe đóng: `duplicate` là tài khoản đang mở ở nơi khác (thường là Zalo Web). */
export type ZaloCloseReason = 'duplicate' | 'other'

export interface ZaloListenerHandlers {
  onMessage(ev: ZaloInbound): void | Promise<void>
  onConnected(): void
  onClosed(reason: ZaloCloseReason, detail: string): void
}

/** Trình nghe tin (WebSocket). Mỗi tài khoản chỉ nghe được ở một nơi. */
export interface ZaloListener {
  start(h: ZaloListenerHandlers): void
  close(): void
}

/** Các bước của một lần đăng nhập bằng mã QR. */
export interface ZaloQrHandlers {
  /** Mã QR mới (ảnh PNG dạng base64, không có tiền tố `data:`). */
  onQr(png: string): void
  onScanned(who: { name: string; avatar: string }): void
  /** Mã hết hạn: lần đăng nhập này dừng, người dùng bấm "Tạo mã mới" để bắt đầu lại. */
  onExpired(): void
  onDeclined(): void
}

export interface ZaloQrResult {
  session: ZaloSession
  profile: ZaloProfile
}

export interface ZaloQrLogin {
  /** Xong khi đã quét; ném `ZaloError` khi hết hạn, bị từ chối hay bị huỷ. */
  done: Promise<ZaloQrResult>
  abort(): void
}

export interface ZaloLog {
  warn(msg: string, ...a: unknown[]): void
}

/** Cổng vào thư viện thật; kiểm thử đưa bản giả. */
export interface ZaloConnector {
  loginQR(h: ZaloQrHandlers, log: ZaloLog): ZaloQrLogin
  /** Đăng nhập lại bằng dữ liệu đã lưu (không cần quét QR). Hết hạn thì ném `ZaloError` có `fatal`. */
  open(session: ZaloSession, log: ZaloLog): Promise<{ api: ZaloApi; listener: ZaloListener }>
}

/** Lỗi từ Zalo. `fatal`: dữ liệu đăng nhập hết hạn hay bị từ chối, thử lại cũng vô ích, phải quét lại QR. */
export class ZaloError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message)
    this.name = 'ZaloError'
  }
}
