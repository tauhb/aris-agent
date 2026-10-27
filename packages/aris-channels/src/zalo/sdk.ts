/**
 * Phần duy nhất của aris gọi thư viện không chính thức `zca-js` (giả lập Zalo Web): đăng nhập bằng mã QR hay bằng dữ
 * liệu đã lưu, trình nghe tin, gửi tin, tải tệp. Mỗi tài khoản chỉ nghe được ở một nơi: mở Zalo Web ở trình duyệt thì
 * trình nghe này bị đóng với mã `DuplicateConnection`.
 *
 * Dữ liệu đăng nhập (cookie) không bao giờ vào log hay lời báo lỗi: lỗi ra ngoài chỉ mang `Error.message` của thư viện.
 */
import {
  CloseReason,
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  ZaloApiError,
  type API,
  type Credentials,
  type Message,
} from 'zca-js'
import {
  ZaloError,
  type ZaloApi,
  type ZaloConnector,
  type ZaloInbound,
  type ZaloListener,
  type ZaloListenerHandlers,
  type ZaloLog,
  type ZaloProfile,
  type ZaloQrHandlers,
  type ZaloQrLogin,
  type ZaloSession,
} from './types.js'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'lỗi không rõ'

/** Tin của thư viện → `ZaloInbound`. */
export function toInbound(m: Message): ZaloInbound {
  const d = m.data
  const group = m.type === ThreadType.Group
  return {
    messageId: String(d.msgId),
    threadId: m.threadId,
    isGroup: group,
    senderId: String(d.uidFrom),
    senderName: d.dName ?? '',
    msgType: d.msgType,
    content: typeof d.content === 'string' ? d.content : JSON.stringify(d.content),
    mentions: group
      ? ((d as { mentions?: { uid: string; pos: number; len: number }[] }).mentions ?? []).map((x) => ({
          uid: String(x.uid),
          pos: x.pos,
          len: x.len,
        }))
      : [],
    createTime: Number(d.ts) || Date.now(),
  }
}

/** Dữ liệu đăng nhập đã lưu → kiểu thư viện cần. */
const credentials = (s: ZaloSession): Credentials => ({
  imei: s.imei,
  userAgent: s.userAgent,
  cookie: s.cookie as Credentials['cookie'],
  ...(s.language ? { language: s.language } : {}),
})

class SdkApi implements ZaloApi {
  constructor(private readonly api: API) {}

  selfId() {
    return this.api.getOwnId()
  }

  async profile(): Promise<ZaloProfile> {
    const p = (await this.api.fetchAccountInfo()).profile
    return {
      id: String(p.userId || this.api.getOwnId()),
      name: p.displayName || p.zaloName,
      avatar: p.avatar,
    }
  }

  async userName(id: string) {
    try {
      const r = await this.api.getUserInfo(id)
      const p = r.changed_profiles[id]
      return p?.displayName || p?.zaloName || undefined
    } catch {
      return undefined
    }
  }

  async groupName(id: string) {
    try {
      const r = await this.api.getGroupInfo(id)
      return r.gridInfoMap[id]?.name || undefined
    } catch {
      return undefined
    }
  }

  async send(threadId: string, isGroup: boolean, text: string) {
    try {
      const r = await this.api.sendMessage(text, threadId, isGroup ? ThreadType.Group : ThreadType.User)
      return { messageId: String(r.message?.msgId ?? '') }
    } catch (e) {
      throw new ZaloError(errText(e))
    }
  }

  async sendFile(threadId: string, isGroup: boolean, data: Uint8Array, filename: string) {
    try {
      const name = (
        /\.[A-Za-z0-9]{1,8}$/.test(filename) ? filename : `${filename}.bin`
      ) as `${string}.${string}`
      const r = await this.api.sendMessage(
        {
          msg: '',
          attachments: { data: Buffer.from(data), filename: name, metadata: { totalSize: data.length } },
        },
        threadId,
        isGroup ? ThreadType.Group : ThreadType.User,
      )
      return { messageId: String(r.attachment[0]?.msgId ?? r.message?.msgId ?? '') }
    } catch (e) {
      throw new ZaloError(errText(e))
    }
  }

  async typing(threadId: string, isGroup: boolean) {
    await this.api.sendTypingEvent(threadId, isGroup ? ThreadType.Group : ThreadType.User)
  }

  async download(url: string, maxBytes: number) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new ZaloError(`Zalo trả HTTP ${res.status}`)
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += part.length
      if (size > maxBytes) throw new ZaloError('tệp quá lớn')
      chunks.push(part)
    }
    return new Uint8Array(Buffer.concat(chunks))
  }
}

class SdkListener implements ZaloListener {
  private started = false

  constructor(
    private readonly api: API,
    private readonly log: ZaloLog,
  ) {}

  start(h: ZaloListenerHandlers) {
    const l = this.api.listener
    const self = this.api.getOwnId()
    l.on('connected', () => h.onConnected())
    l.on('message', (m) => {
      // Tin do chính tài khoản gửi (kể cả tin aris vừa gửi) thì bỏ ngay từ cửa vào.
      if (m.isSelf || String(m.data.uidFrom) === self) return
      void Promise.resolve(h.onMessage(toInbound(m))).catch((e: unknown) =>
        this.log.warn('aris-channels: zalo xử lý tin: %s', errText(e)),
      )
    })
    l.on('closed', (code, reason) =>
      h.onClosed(
        code === CloseReason.DuplicateConnection ? 'duplicate' : 'other',
        `${code} ${reason}`.trim(),
      ),
    )
    l.on('error', (e) => this.log.warn('aris-channels: zalo trình nghe: %s', errText(e)))
    // Không để thư viện tự nối lại: aris tự thử lại chậm (2 phút, gấp đôi, tối đa 30 phút) để không giành kết nối.
    l.start({ retryOnClose: false })
    this.started = true
  }

  close() {
    if (!this.started) return
    this.started = false
    try {
      this.api.listener.stop()
    } catch {
      // Đã đóng rồi.
    }
  }
}

function loginQR(h: ZaloQrHandlers): ZaloQrLogin {
  let abort: (() => unknown) | undefined
  let aborted = false
  const done = new Promise<{ session: ZaloSession; profile: ZaloProfile }>((resolve, reject) => {
    let info: ZaloSession | undefined
    new Zalo({ selfListen: false, checkUpdate: false, logging: false })
      .loginQR({}, (ev) => {
        switch (ev.type) {
          case LoginQRCallbackEventType.QRCodeGenerated:
            abort = () => ev.actions.abort()
            if (aborted) ev.actions.abort()
            else h.onQr(ev.data.image)
            break
          case LoginQRCallbackEventType.QRCodeScanned:
            abort = () => ev.actions.abort()
            h.onScanned({ name: ev.data.display_name, avatar: ev.data.avatar })
            break
          case LoginQRCallbackEventType.QRCodeExpired:
            h.onExpired()
            ev.actions.abort()
            break
          case LoginQRCallbackEventType.QRCodeDeclined:
            h.onDeclined()
            ev.actions.abort()
            break
          case LoginQRCallbackEventType.GotLoginInfo:
            info = {
              imei: ev.data.imei,
              userAgent: ev.data.userAgent,
              cookie: ev.data.cookie,
              language: 'vi',
            }
            break
        }
      })
      .then(async (api) => {
        if (!info) throw new ZaloError('Zalo không trả dữ liệu đăng nhập')
        const profile = await new SdkApi(api).profile()
        // Đăng nhập thử đã xong; trình nghe chưa bật nên đóng gọn, kênh sẽ đăng nhập lại bằng dữ liệu đã lưu.
        resolve({ session: info, profile })
      })
      .catch((e: unknown) => reject(new ZaloError(errText(e), true)))
  })
  return {
    done,
    abort: () => {
      aborted = true
      abort?.()
    },
  }
}

/** Bộ nối thật, dùng `zca-js`. */
export const sdkConnector: ZaloConnector = {
  loginQR: (h) => loginQR(h),
  async open(session, log) {
    try {
      const api = await new Zalo({ selfListen: false, checkUpdate: false, logging: false }).login(
        credentials(session),
      )
      return { api: new SdkApi(api), listener: new SdkListener(api, log) }
    } catch (e) {
      // Lỗi của chính Zalo (cookie hết hạn, bị từ chối) thì phải quét lại QR; lỗi mạng thì thử lại sau.
      throw new ZaloError(errText(e), e instanceof ZaloApiError)
    }
  },
}
