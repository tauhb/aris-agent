/**
 * Kênh Zalo cá nhân: aris đọc và trả lời ngay trên tài khoản Zalo của người dùng qua thư viện không chính thức
 * `zca-js` (giả lập Zalo Web). Đưa tin vào phiên của dsh qua đúng đường như Telegram và Lark (quyền ở cửa vào, hàng đợi
 * bền, ghép đôi bằng mã kênh `zalo`, lệnh `/new` `/stop` `/status`, phiên bị hạn chế với người không phải chủ), theo dõi
 * lượt để trả lời, giao bền qua hộp thư ra. Phần gọi thư viện nằm sau `ZaloConnector` nên kiểm thử dùng bản giả.
 *
 * Rủi ro: Zalo không cho phép cách này, tài khoản có thể bị khoá. Vì vậy luật chặt hơn các kênh khác: chỉ trả lời người
 * đã ghép đôi (người lạ im lặng, chỉ báo chủ một lần mỗi ngày), nhóm mặc định tắt và chỉ trả lời khi được @ nhắc, không
 * bao giờ tự nhắn trước, gửi theo giới hạn tần suất (`ZALO_LIMITS`), và khi Zalo Web đang mở thì ngừng nghe, thử lại chậm.
 *
 * Khác Telegram: không có nút bấm trong tin nên duyệt việc của chủ nhân vẫn ở web; không hiện chữ dần; báo "đang soạn tin"
 * thay cho cảm xúc.
 */
import { commandAllowed, type Trust } from '../access.js'
import { NOT_OWNER_NOTE, T } from '../copy.js'
import type { BotRecord, InboxRecord, OutboxRecord } from '../domain.js'
import type {
  AttachmentPort,
  ChannelPeer,
  CredentialPort,
  LiveAgent,
  MediaPort,
  SessionPort,
} from '../hub.js'
import { sttNotReady, transcribe, type SpeechToText } from '../media.js'
import { accId, ChannelStore, newAccountId, normalizeCode, zaloKey, zaloThreadKey } from '../store.js'
import { isSilent, nameTeam, type TeamName } from '../telegram/format.js'
import { TurnTracker, type PendingBase, type TurnPart, type TurnResult } from '../tracker.js'
import { decideZalo, STRANGER_EXCERPT, STRANGER_NOTIFY_MS, ZALO_LIMITS, ZaloThrottle } from './access.js'
import { parseMessage, toChunks, splitText, type ParsedMessage, type ZaloResource } from './content.js'
import { TELEGRAM_ONLY_COMMANDS, Z, ZN } from './copy.js'
import { sdkConnector } from './sdk.js'
import {
  ZaloError,
  type ZaloApi,
  type ZaloConnector,
  type ZaloInbound,
  type ZaloListener,
  type ZaloQrLogin,
  type ZaloQrResult,
  type ZaloSession,
} from './types.js'

/** Tin Zalo đã đưa vào agent. */
export interface ZaloPending extends PendingBase {
  /** Mã người (chat riêng) hay mã nhóm: nơi trả lời. */
  threadId: string
  /** Mã tin Zalo của người gửi. */
  msgId: string
}

export interface ZaloDeps {
  store: ChannelStore
  credentials: CredentialPort
  sessions: SessionPort
  attachments?: AttachmentPort | undefined
  stt?: SpeechToText | undefined
  logger: { info(msg: string, ...a: unknown[]): void; warn(msg: string, ...a: unknown[]): void }
  /** Mặc định: `zca-js` thật. Kiểm thử đưa bản giả. */
  connector?: ZaloConnector | undefined
  now?: () => number
  /** Chờ cho giới hạn tần suất; kiểm thử đưa bản giả để không chờ thật. */
  sleep?: (ms: number) => Promise<void>
  /** Bot trong đội: `@tên_gọi` trong tin gửi ra đổi thành chấm màu + tên. */
  team?: () => readonly TeamName[]
  media?: () => MediaPort | undefined
  /** aris đang dừng khẩn cấp (@aris/guard): tin thường chỉ nhận câu báo, lệnh vẫn chạy. */
  stopped?: () => boolean
  /** Báo chủ nhân qua kênh khác (Telegram), vì Zalo có thể đang mất kết nối hay là nơi bị hạn chế gửi. */
  notify?: (markdown: string) => Promise<unknown>
  /** Chờ trước lần thử lại đầu khi mất kết nối (mặc định 2 phút, gấp đôi mỗi lần, tối đa 15 lần số đó = 30 phút). */
  retryMs?: number
}

/** Trạng thái một tài khoản Zalo cho trang Kênh và `aris status`. */
export type ZaloState = 'connecting' | 'listening' | 'web' | 'retrying' | 'needs-qr'

export interface ZaloAccountStatus {
  /** Mã tài khoản trong aris. */
  account: string
  /** Tên tài khoản do người dùng đặt ("CSKH 1"). */
  label: string
  /** Ai được bot trả lời: chỉ người đã ghép đôi, hay mọi người là khách. */
  mode: 'paired' | 'guests'
  bot: string
  /** Mã Zalo của tài khoản. */
  id: string
  name: string
  avatar: string
  state: ZaloState
  error: string | null
  /** `true` = đang nghe (cho `aris status`, cùng nghĩa với `running` của Telegram). */
  running: boolean
  /** Số tin còn được gửi trong hôm nay. */
  leftToday: number
}

/** Trạng thái một lần đăng nhập bằng mã QR. */
export interface ZaloLoginStatus {
  /** Mã của lần đăng nhập (trả từ `loginStart`), để giao diện hỏi lại. */
  key: string
  /** Mã tài khoản sau khi đăng nhập xong. */
  account?: string
  bot: string
  status: 'waiting' | 'scanned' | 'done' | 'expired' | 'declined' | 'error'
  /** Ảnh PNG base64 của mã QR (chỉ khi `waiting`). */
  qrPng?: string
  /** Giờ mã QR hết hạn (ms). */
  expiresAt?: number
  /** Tên và ảnh đại diện Zalo (khi đã quét hay đã đăng nhập). */
  name?: string
  avatar?: string
  error?: string
}

interface ZaloRuntime {
  /** Mã tài khoản Zalo (GĐ8.7; tài khoản cũ: mã bot). `rec.bot` là bot của aris trả lời. */
  id: string
  rec: BotRecord
  api: ZaloApi
  listener: ZaloListener
  throttle: ZaloThrottle
  /** Giờ nối xong: tin cũ hơn mốc này không trả lời. */
  connectedAt: number
  /** Mã tin aris vừa gửi, để bỏ qua nếu Zalo báo lại. */
  sent: Set<string>
  typingAt: Map<string, number>
  /** Bộ canh mạng chết im: gọi nhẹ Zalo định kỳ. */
  watch?: ReturnType<typeof setInterval> | undefined
  /** Số lần canh lỗi liền nhau. */
  watchFails: number
}

const MAX_FILE = 20 * 1024 * 1024
/** Mã QR của Zalo sống khoảng 100 giây (thư viện không báo giờ hết hạn, đây là ước lượng để giao diện đếm ngược). */
const QR_LIFETIME_MS = 100_000
/** Bộ canh: 5 phút gọi nhẹ Zalo một lần; lỗi hai lần liền thì coi như mất kết nối. */
const WATCH_MS = 5 * 60_000
const WATCH_FAILS = 2
/** Báo chủ "bị đá phiên" nhiều nhất 6 giờ một lần mỗi tài khoản. */
const KICK_NOTIFY_MS = 6 * 3_600_000
/** Gom tin dồn dập: đợi chừng này không có tin mới trong cuộc chat rồi mới trả lời (người không phải chủ). */
export const GATHER_MS = 5000
/** Kết nối sống quá chừng này thì coi là vững: lần mất kết nối kế tiếp lại chờ từ mức đầu. */
const STABLE_MS = 10 * 60_000
/** Báo "đang soạn tin" nhiều nhất mỗi 5 giây cho một cuộc trò chuyện. */
const TYPING_EVERY_MS = 5000

export const zaloSessionRef = (bot: string) => `ZALO_${bot.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_SESSION`
const randomId = () => Math.random().toString(36).slice(2, 10)
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Đoán loại ảnh từ vài byte đầu (Zalo không báo loại tệp khi tải). */
function imageType(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif'
  if (data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57) return 'image/webp'
  return 'image/jpeg'
}

export class ZaloChannel implements ChannelPeer {
  readonly kind = 'zalo'
  readonly tracker = new TurnTracker<ZaloPending>()
  private readonly apps = new Map<string, ZaloRuntime>()
  private readonly states = new Map<string, ZaloState>()
  private readonly lanes = new Map<string, Promise<void>>()
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly delays = new Map<string, number>()
  private readonly throttles = new Map<string, ZaloThrottle>()
  private readonly logins = new Map<string, { login: ZaloQrLogin; status: ZaloLoginStatus }>()
  private readonly seen = new Set<string>()
  private readonly names = new Map<string, { name: string; at: number }>()
  private readonly flushing = new Set<string>()
  /** Đã báo chủ "hết hạn mức ngày" hôm nay chưa, theo bot (giá trị: ngày đã báo). */
  private readonly limitNotified = new Map<string, string>()
  private readonly qrNotified = new Set<string>()
  private readonly kickNotified = new Map<string, number>()
  /** Giờ tin cuối của mỗi làn (cuộc chat), để gom tin dồn dập. */
  private readonly lastAt = new Map<string, number>()
  /** Phiên có lượt bị dừng vì khách nhắn thêm: lượt đó không gửi gì ra. */
  private readonly superseded = new Set<string>()
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly connector: ZaloConnector

  constructor(private readonly d: ZaloDeps) {
    this.now = d.now ?? Date.now
    this.sleep = d.sleep ?? sleepReal
    this.connector = d.connector ?? sdkConnector
  }

  private get store() {
    return this.d.store
  }

  private get baseDelay() {
    return this.d.retryMs ?? 120_000
  }

  /** Bộ giới hạn tần suất của tài khoản; giữ qua các lần nối lại để hạn mức ngày không bị đặt lại. */
  private throttleOf(bot: string) {
    let t = this.throttles.get(bot)
    if (!t) {
      t = new ZaloThrottle(this.now, this.sleep)
      this.throttles.set(bot, t)
    }
    return t
  }

  // ======================================================================================
  // Tài khoản Zalo
  // ======================================================================================

  async start() {
    for (const rec of this.store.zaloAccounts()) await this.startOrRetry(rec)
    await this.recover()
  }

  stop() {
    for (const t of this.retries.values()) clearTimeout(t)
    this.retries.clear()
    for (const l of this.logins.values()) l.login.abort()
    this.logins.clear()
    for (const rt of this.apps.values()) this.closeRuntime(rt)
    this.apps.clear()
  }

  /** Tình trạng từng tài khoản, cho trang Kênh và `aris status`. */
  status(): ZaloAccountStatus[] {
    return this.store.zaloAccounts().map((rec) => {
      const acc = accId(rec)
      const state: ZaloState = this.states.get(acc) ?? (rec.error ? 'needs-qr' : 'connecting')
      return {
        account: acc,
        label: rec.label ?? rec.name,
        mode: rec.mode ?? 'paired',
        bot: rec.bot,
        id: rec.botOpenId ?? '',
        name: rec.name,
        avatar: rec.avatar ?? '',
        state,
        error: rec.error ?? null,
        running: state === 'listening',
        leftToday: this.throttleOf(acc).leftToday(),
      }
    })
  }

  /** Tình trạng một lần đăng nhập QR (mã do `loginStart` trả; cho giao diện hỏi lại vài giây một lần). */
  loginStatus(key: string): ZaloLoginStatus | undefined {
    return this.logins.get(key)?.status
  }

  /** Mọi lần đăng nhập QR còn trong bộ nhớ (ảnh chụp trạng thái cho trang Kênh). */
  loginStatuses(): ZaloLoginStatus[] {
    return [...this.logins.values()].map((l) => l.status)
  }

  /**
   * Bắt đầu đăng nhập bằng mã QR: trả ảnh QR ngay khi thư viện có. Có lần đăng nhập đang dở của bot này thì huỷ nó
   * (đây cũng là nút "Tạo mã mới"). Quét xong thì dữ liệu đăng nhập vào kho khoá và kênh tự bắt đầu nghe.
   */
  async loginStart(
    bot: string,
    opts: { account?: string | undefined; label?: string | undefined } = {},
  ): Promise<{ qrPng: string; expiresAt: number; key: string }> {
    // Quét lại một tài khoản có sẵn thì khoá theo tài khoản; thêm mới thì khoá theo bot (một lần thêm dở mỗi bot).
    const key = opts.account ?? `new-${bot}`
    this.logins.get(key)?.login.abort()
    const status: ZaloLoginStatus = { key, bot, status: 'waiting' }
    let gotQr!: (v: { qrPng: string; expiresAt: number; key: string }) => void
    let failQr!: (e: Error) => void
    const first = new Promise<{ qrPng: string; expiresAt: number; key: string }>((res, rej) => {
      gotQr = res
      failQr = rej
    })
    const login = this.connector.loginQR(
      {
        onQr: (png) => {
          status.status = 'waiting'
          status.qrPng = png
          status.expiresAt = this.now() + QR_LIFETIME_MS
          gotQr({ qrPng: png, expiresAt: status.expiresAt, key })
        },
        onScanned: (who) => {
          status.status = 'scanned'
          status.name = who.name
          status.avatar = who.avatar
          delete status.qrPng
        },
        onExpired: () => {
          status.status = 'expired'
          delete status.qrPng
        },
        onDeclined: () => {
          status.status = 'declined'
          delete status.qrPng
        },
      },
      this.d.logger,
    )
    const entry = { login, status }
    this.logins.set(key, entry)
    login.done.then(
      (res) => void this.finishLogin(bot, opts, entry, res),
      (e: unknown) => {
        failQr(e instanceof Error ? e : new Error(msg(e)))
        if (this.logins.get(key) !== entry) return
        // Hết hạn và bị từ chối đã được ghi bởi trình xử lý riêng; còn lại là lỗi.
        if (status.status === 'waiting' || status.status === 'scanned') {
          status.status = 'error'
          status.error = msg(e)
          delete status.qrPng
        }
      },
    )
    const timer = setTimeout(() => failQr(new Error('Zalo chưa trả mã QR')), 20_000)
    timer.unref?.()
    try {
      return await first
    } finally {
      clearTimeout(timer)
    }
  }

  private async finishLogin(
    bot: string,
    opts: { account?: string | undefined; label?: string | undefined },
    entry: { status: ZaloLoginStatus },
    res: ZaloQrResult,
  ) {
    const status = entry.status
    try {
      // Cùng tài khoản Zalo đã có trong aris: dùng lại mã tài khoản đó (giữ người đã ghép đôi, nhóm).
      const same = this.store.zaloAccounts().find((a) => a.botOpenId === res.profile.id)
      if (same && opts.account && accId(same) !== opts.account)
        throw new Error(`tài khoản Zalo này đã có trong aris (${same.label ?? same.name})`)
      const id = opts.account ?? (same ? accId(same) : newAccountId())
      const cur = this.store.zaloAccount(id)
      // Quét lại bằng tài khoản Zalo khác: người ghép đôi và nhóm riêng của tài khoản cũ không còn đúng, bỏ.
      if (cur && cur.botOpenId !== res.profile.id) await this.store.forgetAccount('zalo', id)
      const ref = cur?.tokenRef ?? zaloSessionRef(id)
      await this.d.credentials.set(ref, JSON.stringify(res.session))
      const label = opts.label?.trim() || cur?.label
      const rec: BotRecord = {
        bot: cur?.bot ?? bot,
        ...(id !== (cur?.bot ?? bot) ? { account: id } : {}),
        ...(label ? { label } : {}),
        ...(cur?.mode ? { mode: cur.mode } : {}),
        tgId: 0,
        username: res.profile.id,
        name: res.profile.name,
        tokenRef: ref,
        canReadAll: true,
        offset: 0,
        voice: false,
        addedAt: new Date(this.now()).toISOString(),
        channel: 'zalo',
        botOpenId: res.profile.id,
        avatar: res.profile.avatar,
      }
      await this.store.putZaloAccount(rec)
      this.stopApp(id)
      this.qrNotified.delete(id)
      status.account = id
      status.status = 'done'
      status.name = res.profile.name
      status.avatar = res.profile.avatar
      await this.startOrRetry(rec)
    } catch (e) {
      status.status = 'error'
      status.error = msg(e)
    }
  }

  /**
   * Đăng xuất một tài khoản: xoá dữ liệu đăng nhập trong kho khoá, tài khoản, người được phép và nhóm riêng của nó.
   * Tài khoản cuối cùng thì xoá cả chủ nhân và nhóm dùng chung của Zalo.
   */
  async logout(account: string) {
    const rec = this.store.zaloAccount(account)
    this.logins.get(account)?.login.abort()
    this.logins.delete(account)
    this.stopApp(account)
    this.states.delete(account)
    if (rec) await this.d.credentials.unset(rec.tokenRef)
    await this.store.removeZaloAccount(account)
    await this.store.forgetAccount('zalo', account)
    if (!this.store.zaloAccounts().length) await this.forgetPeople()
  }

  /** Đổi bot trả lời, tên, chế độ của một tài khoản. */
  async updateAccount(account: string, patch: { bot?: string; label?: string; mode?: 'paired' | 'guests' }) {
    const cur = this.store.zaloAccount(account)
    if (!cur) throw new Error('không có tài khoản này')
    const next: BotRecord = { ...cur, ...patch, account }
    await this.store.putZaloAccount(next)
    const rt = this.apps.get(account)
    if (rt) rt.rec = next
  }

  private async forgetPeople() {
    for (const p of this.store.zaloPeople()) if (p.openId) await this.store.revokeZalo(p.openId, p.account)
    for (const g of this.store.zaloGroups())
      if (g.chatRef) await this.store.removeZaloGroup(g.chatRef, g.account)
  }

  private stopApp(bot: string) {
    const t = this.retries.get(bot)
    if (t) clearTimeout(t)
    this.retries.delete(bot)
    this.delays.delete(bot)
    this.closeRuntime(this.apps.get(bot))
    this.apps.delete(bot)
  }

  /** Đóng trình nghe và bộ canh của một tài khoản. */
  private closeRuntime(rt: ZaloRuntime | undefined) {
    if (!rt) return
    if (rt.watch) clearInterval(rt.watch)
    rt.watch = undefined
    rt.listener.close()
  }

  private async setError(bot: string, e: string | undefined) {
    const cur = this.store.zaloAccount(bot)
    if (!cur || cur.error === e) return
    const next = { ...cur }
    if (e) next.error = e
    else delete next.error
    await this.store.putZaloAccount(next)
  }

  /**
   * Bật một tài khoản bằng dữ liệu đăng nhập đã lưu. Lỗi tạm (mạng) thì thử lại chậm: 2 phút, gấp đôi mỗi lần, tối đa
   * 30 phút. Dữ liệu hết hạn hay bị Zalo từ chối thì không thử lại: trạng thái "Cần quét lại QR" và báo chủ qua Telegram.
   */
  private async startOrRetry(rec: BotRecord) {
    const id = accId(rec)
    this.retries.delete(id)
    this.states.set(id, 'connecting')
    try {
      await this.startApp(rec)
    } catch (e) {
      this.d.logger.warn('aris-channels: zalo %s: %s', id, msg(e))
      const fatal = (e instanceof ZaloError && e.fatal) || e instanceof MissingSession
      if (fatal || !this.store.zaloAccount(id)) {
        if (this.store.zaloAccount(id)) await this.needQr(id, msg(e))
        return
      }
      await this.setError(id, msg(e))
      this.scheduleRetry(id, 'retrying')
    }
  }

  /** Báo chủ bị đá phiên, nhiều nhất 6 giờ một lần mỗi tài khoản. */
  private async notifyKicked(bot: string) {
    const last = this.kickNotified.get(bot)
    if (last !== undefined && this.now() - last < KICK_NOTIFY_MS) return
    this.kickNotified.set(bot, this.now())
    const a = this.store.zaloAccount(bot)
    await this.d.notify?.(ZN.kicked(a?.label ?? a?.name ?? bot)).catch(() => undefined)
  }

  private async needQr(bot: string, why: string) {
    this.states.set(bot, 'needs-qr')
    await this.setError(bot, why)
    if (this.qrNotified.has(bot)) return
    this.qrNotified.add(bot)
    const a = this.store.zaloAccount(bot)
    await this.d.notify?.(ZN.needQr(a?.label ?? a?.name ?? bot)).catch(() => undefined)
  }

  /** Hẹn thử nối lại sau `delay` (gấp đôi lần trước, tối đa 15 lần mức đầu). */
  private scheduleRetry(bot: string, state: ZaloState) {
    this.states.set(bot, state)
    const prev = this.delays.get(bot)
    const delay = prev === undefined ? this.baseDelay : Math.min(prev * 2, this.baseDelay * 15)
    this.delays.set(bot, delay)
    const timer = setTimeout(() => {
      const cur = this.store.zaloAccount(bot)
      if (cur && !this.apps.has(bot)) void this.startOrRetry(cur)
    }, delay)
    timer.unref?.()
    this.retries.set(bot, timer)
  }

  private async startApp(rec: BotRecord) {
    const raw = await this.d.credentials.resolve(rec.tokenRef)
    if (!raw) throw new MissingSession()
    let session: ZaloSession
    try {
      session = JSON.parse(raw) as ZaloSession
    } catch {
      throw new MissingSession()
    }
    const { api, listener } = await this.connector.open(session, this.d.logger)
    // Không để hai trình nghe cùng tài khoản: trình nghe cũ (nếu còn) đóng trước.
    const id = accId(rec)
    this.closeRuntime(this.apps.get(id))
    const rt: ZaloRuntime = {
      id,
      watchFails: 0,
      rec: this.store.zaloAccount(id) ?? rec,
      api,
      listener,
      throttle: this.throttleOf(id),
      connectedAt: this.now(),
      sent: new Set(),
      typingAt: new Map(),
    }
    this.apps.set(id, rt)
    try {
      listener.start({
        onMessage: (ev) => this.receive(rt, ev),
        onConnected: () => void this.onConnected(rt),
        onClosed: (reason, detail) => void this.onClosed(rt, reason, detail),
      })
    } catch (e) {
      this.apps.delete(id)
      listener.close()
      throw e
    }
  }

  private async onConnected(rt: ZaloRuntime) {
    if (this.apps.get(rt.id) !== rt) return
    rt.connectedAt = this.now()
    this.states.set(rt.id, 'listening')
    this.startWatch(rt)
    await this.setError(rt.id, undefined)
    // Câu trả lời dở của lúc mất kết nối thì gửi nốt.
    for (const rec of this.store.zaloOutbox())
      if (rec.bot === rt.id && rec.state === 'pending' && !this.flushing.has(rec.id)) void this.flush(rec)
  }

  /**
   * Bộ canh mạng chết im: thư viện có gửi ping nhưng không báo khi kết nối chết mà không đóng (rớt mạng, máy ngủ dậy).
   * 5 phút gọi nhẹ Zalo một lần; lỗi hai lần liền thì coi như mất kết nối và thử lại theo lịch.
   */
  private startWatch(rt: ZaloRuntime) {
    if (rt.watch) clearInterval(rt.watch)
    rt.watchFails = 0
    rt.watch = setInterval(() => {
      if (this.apps.get(rt.id) !== rt) return
      rt.api.profile().then(
        () => void (rt.watchFails = 0),
        (e: unknown) => {
          rt.watchFails++
          this.d.logger.warn('aris-channels: zalo %s canh lỗi (%d): %s', rt.id, rt.watchFails, msg(e))
          if (rt.watchFails >= WATCH_FAILS) void this.onClosed(rt, 'other', 'không phản hồi')
        },
      )
    }, WATCH_MS)
    rt.watch.unref?.()
  }

  private async onClosed(rt: ZaloRuntime, reason: 'duplicate' | 'other', detail: string) {
    if (this.apps.get(rt.id) !== rt) return
    this.closeRuntime(rt)
    this.apps.delete(rt.id)
    if (reason === 'duplicate') await this.notifyKicked(rt.id)
    this.d.logger.warn('aris-channels: zalo %s ngắt kết nối (%s)', rt.id, detail)
    // Chỉ đặt lại thời gian chờ khi kết nối đã đứng vững; bị Zalo đá ra ngay sau khi nối (Zalo Web đang mở) thì chờ
    // lâu dần, không giành lại liên tục.
    if (this.now() - rt.connectedAt >= STABLE_MS) this.delays.delete(rt.id)
    // Zalo Web đang mở thì nhường, không giành lại liên tục: chờ lâu rồi mới thử.
    this.scheduleRetry(rt.id, reason === 'duplicate' ? 'web' : 'retrying')
  }

  // ======================================================================================
  // Nhận tin
  // ======================================================================================

  /** Gọi cho mỗi tin vào. Chỉ ghi vào hàng đợi bền rồi trả về ngay. */
  private async receive(rt: ZaloRuntime, ev: ZaloInbound) {
    // Tin của chính tài khoản, tin aris vừa gửi, tin cũ hơn lúc kết nối: bỏ.
    if (ev.senderId === rt.api.selfId() || rt.sent.has(ev.messageId)) return
    if (ev.createTime < rt.connectedAt) return
    if (ev.isGroup) {
      // Nhóm được ghi nhận để hiện trong danh sách (mặc định tắt); nhóm chưa bật thì dừng ở đây.
      if (!this.store.zaloGroup(ev.threadId, rt.id))
        await this.store.upsertZaloGroup(
          ev.threadId,
          { title: (await rt.api.groupName(ev.threadId)) ?? ev.threadId },
          rt.id,
        )
      if (!this.store.zaloGroupRule(ev.threadId, rt.id)?.allowed) return
    }
    const id = `zc-${rt.id}-${zaloKey(ev.messageId)}`
    if (this.seen.has(id)) return
    this.seen.add(id)
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!)
    const inbox: InboxRecord = {
      id,
      bot: rt.id,
      update: ev,
      state: 'queued',
      receivedAt: this.now(),
      channel: 'zalo',
    }
    await this.store.enqueue(inbox)
    this.route(inbox)
  }

  /** Xếp tin vào làn của cuộc trò chuyện: trong một cuộc thì nối tiếp, giữa các cuộc thì song song. */
  private route(inbox: InboxRecord, resumed = false) {
    const ev = inbox.update as ZaloInbound
    const rt = this.apps.get(inbox.bot)
    if (!rt) return
    const lane = zaloThreadKey(inbox.bot, ev.threadId)
    if (!resumed) this.lastAt.set(lane, this.now())
    const prev = this.lanes.get(lane) ?? Promise.resolve()
    const next = prev
      .then(() => this.gather(lane, inbox.bot, ev, resumed))
      .then(() => this.handle(rt, inbox, ev, resumed))
      .catch((e: unknown) =>
        this.d.logger.warn('aris-channels: zalo xử lý tin: %s', e instanceof Error ? e.stack : String(e)),
      )
    this.lanes.set(lane, next)
  }

  /**
   * Gom tin dồn dập: tin của người không phải chủ đợi tới khi cuộc chat im `GATHER_MS` rồi mới xử lý, để khách gửi
   * 3–4 tin liền thì bot trả lời một lần (các tin sau vào phiên ngay sau tin đầu, lượt cũ bị thay; xem `submit`).
   * Tin của chủ, lệnh, mã ghép đôi và tin làm lại sau khởi động không đợi.
   */
  private async gather(lane: string, account: string, ev: ZaloInbound, resumed: boolean) {
    if (resumed || this.store.zaloRoleOf(ev.senderId, account) === 'owner') return
    // Lệnh và mã ghép đôi xử lý ngay.
    const text = ev.msgType === 'webchat' ? ev.content.trim() : ''
    if (text.startsWith('/') || normalizeCode(text)) return
    for (;;) {
      const wait = (this.lastAt.get(lane) ?? 0) + GATHER_MS - this.now()
      if (wait <= 0) return
      await this.sleep(wait)
    }
  }

  private async handle(rt: ZaloRuntime, inbox: InboxRecord, ev: ZaloInbound, resumed: boolean) {
    let keep = false
    try {
      keep = await this.onMessage(rt, inbox, ev, resumed)
    } finally {
      // Tin đã vào agent thì giữ trong hàng đợi tới khi lượt trả lời xong.
      if (!keep) await this.store.doneInbox(inbox.id)
    }
  }

  /** Tên hiển thị của người (nhớ 1 giờ); không lấy được thì dùng tên theo tin, rồi tên chung. */
  private async nameOf(rt: ZaloRuntime, id: string, fallback = ''): Promise<string> {
    const hit = this.names.get(id)
    if (hit && this.now() - hit.at < 3_600_000) return hit.name
    const name = (await rt.api.userName(id)) ?? (fallback || 'Người dùng Zalo')
    this.names.set(id, { name, at: this.now() })
    return name
  }

  /** Trả `true` khi tin đã vào agent (hàng đợi giữ tới khi trả lời xong). */
  private async onMessage(rt: ZaloRuntime, inbox: InboxRecord, ev: ZaloInbound, resumed: boolean) {
    const parsed = parseMessage(ev, rt.api.selfId())
    const here: Reply = { thread: ev.threadId, group: ev.isGroup }

    // Ghép đôi: nhắn đúng mã trong chat riêng.
    if (!ev.isGroup && normalizeCode(parsed.text)) {
      const person = await this.store.redeemZalo(
        parsed.text,
        { zaloId: ev.senderId, name: await this.nameOf(rt, ev.senderId, ev.senderName) },
        rt.id,
      )
      if (person === 'other-channel' || person === 'other-account') {
        await this.say(rt, here, person === 'other-channel' ? T.codeOtherChannel : T.codeOtherAccount)
        return false
      }
      if (person) {
        await this.say(rt, here, Z.paired(person.name, person.role === 'owner'))
        return false
      }
    }

    const d = decideZalo(ev, parsed, {
      roleOf: (id) => this.store.zaloRoleOf(id, rt.id),
      groupRule: (id) => this.store.zaloGroupRule(id, rt.id),
      guests: rt.rec.mode === 'guests',
    })
    if (d.kind === 'ignore' || d.kind === 'unknown-group') return false
    if (d.kind === 'stranger') {
      // Người lạ: bot im lặng; báo chủ nhiều nhất một lần mỗi người mỗi ngày.
      if (await this.store.shouldNotifyStranger(`zc-${rt.id}-${ev.senderId}`, STRANGER_NOTIFY_MS)) {
        const name = await this.nameOf(rt, ev.senderId, ev.senderName)
        const text = parsed.text || (parsed.resources.length ? '(gửi ảnh hay tệp)' : `(${ev.msgType})`)
        const excerpt = text.length > STRANGER_EXCERPT ? `${text.slice(0, STRANGER_EXCERPT)}…` : text
        await this.d.notify?.(ZN.stranger(name, excerpt)).catch(() => undefined)
      }
      return false
    }

    const key = zaloThreadKey(rt.id, ev.threadId)
    if (d.command) {
      if (!commandAllowed(d.command.name, d.trust)) {
        await this.say(rt, here, T.ownerOnly)
        return false
      }
      await this.command(rt, ev, here, key, d.trust, d.command.name, d.command.args)
      return false
    }
    if (this.d.stopped?.()) {
      await this.say(rt, here, T.guardStopped)
      return false
    }
    if (parsed.unsupported) {
      await this.say(rt, here, Z.unsupported(parsed.unsupported))
      return false
    }
    return this.submit(rt, inbox, ev, parsed, here, key, d.trust, resumed)
  }

  // ======================================================================================
  // Gửi tin
  // ======================================================================================

  /** Gửi một tin chữ qua bộ giới hạn tần suất. `false` khi hết hạn mức ngày (không gửi). */
  private async sendOne(rt: ZaloRuntime, thread: string, isGroup: boolean, text: string): Promise<boolean> {
    if (!(await rt.throttle.take(thread))) {
      await this.dailyStop(rt.id)
      return false
    }
    const r = await rt.api.send(thread, isGroup, text)
    this.remember(rt, r.messageId)
    return true
  }

  private remember(rt: ZaloRuntime, id: string) {
    if (!id) return
    rt.sent.add(id)
    if (rt.sent.size > 200) rt.sent.delete(rt.sent.values().next().value!)
  }

  /** Hết hạn mức ngày: báo chủ một lần mỗi ngày, rồi thôi gửi. */
  private async dailyStop(bot: string) {
    const day = new Date(this.now()).toDateString()
    if (this.limitNotified.get(bot) === day) return
    this.limitNotified.set(bot, day)
    this.d.logger.warn('aris-channels: zalo %s: hết hạn mức %d tin/ngày', bot, ZALO_LIMITS.perDay)
    await this.d.notify?.(ZN.dailyLimit(ZALO_LIMITS.perDay)).catch(() => undefined)
  }

  /** Gửi ngay một tin hệ thống (không qua hộp thư ra): lỗi chỉ ghi log. */
  private async say(rt: ZaloRuntime, to: Reply, md: string) {
    try {
      for (const chunk of toChunks(md)) if (!(await this.sendOne(rt, to.thread, to.group, chunk))) return
    } catch (e) {
      this.d.logger.warn('aris-channels: zalo gửi tin: %s', msg(e))
    }
  }

  /** Báo "đang soạn tin": nhiều nhất mỗi 5 giây cho một cuộc trò chuyện. */
  private typing(rt: ZaloRuntime, thread: string, isGroup: boolean) {
    const last = rt.typingAt.get(thread)
    if (last !== undefined && this.now() - last < TYPING_EVERY_MS) return
    rt.typingAt.set(thread, this.now())
    void rt.api.typing(thread, isGroup).catch(() => undefined)
  }

  // ======================================================================================
  // Đưa tin vào phiên
  // ======================================================================================

  private async sessionFor(bot: string, key: string, threadId: string, fresh = false): Promise<LiveAgent> {
    const t = this.store.thread(key)
    if (t && !fresh) {
      try {
        return await this.d.sessions.agent(t.sessionId)
      } catch (e) {
        this.d.logger.warn('aris-channels: zalo mở lại phiên %s: %s, mở phiên mới', t.sessionId, String(e))
      }
    }
    const sessionId = await this.d.sessions.create(bot)
    await this.store.bindThread({ key, bot, chatId: 0, chatRef: threadId, sessionId })
    return this.d.sessions.agent(sessionId)
  }

  /** Nội dung đưa vào agent: chữ, ảnh, tệp, tin thoại đã đổi thành chữ. */
  private async content(
    rt: ZaloRuntime,
    ev: ZaloInbound,
    parsed: ParsedMessage,
    here: Reply,
    trust: Trust,
  ): Promise<unknown[] | undefined> {
    const parts: unknown[] = []
    let body = parsed.text
    for (const r of parsed.resources) {
      try {
        body = (await this.resource(rt, r, parts, body)) ?? body
      } catch (e) {
        if (r.kind === 'audio')
          await this.say(rt, here, sttNotReady(e) ? T.voiceNotReady : Z.voiceFail(msg(e)))
        else
          await this.say(
            rt,
            here,
            e instanceof ZaloError && e.message === 'tệp quá lớn' ? Z.fileTooBig : Z.fileFail(msg(e)),
          )
      }
    }
    if (!body && !parts.length) return undefined
    // Trong nhóm, bot cần biết ai đang nói; người không phải người dùng chính thì nhắc giới hạn quyền.
    const who = ev.isGroup ? `[${await this.nameOf(rt, ev.senderId, ev.senderName)}] ` : ''
    const limit = trust === 'owner' ? '' : NOT_OWNER_NOTE
    if (body || who) parts.unshift({ type: 'text', text: `${who}${body || '(gửi tệp)'}${limit}` })
    return parts
  }

  /** Tải một ảnh / tệp / tin thoại; tin thoại trả về chữ mới của tin, ảnh và tệp thêm vào `parts`. */
  private async resource(
    rt: ZaloRuntime,
    r: ZaloResource,
    parts: unknown[],
    body: string,
  ): Promise<string | undefined> {
    if (r.kind === 'audio') {
      const data = await rt.api.download(r.url, MAX_FILE)
      const heard = await transcribe(this.d.stt, data, AbortSignal.timeout(120_000))
      return [body, `${T.voiceNote} ${heard}`].filter(Boolean).join('\n')
    }
    if (!this.d.attachments) return undefined
    const data = await rt.api.download(r.url, MAX_FILE)
    if (r.kind === 'image')
      parts.push({
        type: 'image',
        attachment: await this.d.attachments.saveImage({ data, mediaType: imageType(data) }),
      })
    else
      parts.push({
        type: 'file',
        attachment: await this.d.attachments.saveFile({ data, ...(r.name ? { name: r.name } : {}) }),
      })
    return undefined
  }

  private async submit(
    rt: ZaloRuntime,
    inbox: InboxRecord,
    ev: ZaloInbound,
    parsed: ParsedMessage,
    here: Reply,
    key: string,
    trust: Trust,
    resumed: boolean,
  ): Promise<boolean> {
    const content = await this.content(rt, ev, parsed, here, trust)
    if (!content) return false
    if (resumed) await this.say(rt, here, T.restarted)
    const agent = await this.sessionFor(rt.rec.bot, key, ev.threadId)
    const group = ev.isGroup ? this.store.zaloGroup(ev.threadId, rt.id) : undefined
    if (group?.prompt)
      agent.inject(
        this.d.sessions.notice(
          `Hướng dẫn riêng của nhóm "${group.title}":\n${group.prompt}`,
          'Lời nhắc riêng của nhóm',
        ),
      )
    const message = this.d.sessions.message(content)
    this.tracker.expect({
      messageId: message.id,
      inboxId: inbox.id,
      threadKey: key,
      bot: rt.id,
      threadId: ev.threadId,
      msgId: ev.messageId,
      group: ev.isGroup,
      trust,
    })
    const busy = this.store.settings().busy
    // Khách (không phải chủ) nhắn thêm khi bot đang soạn: dừng lượt cũ, không gửi câu trả lời đã cũ, làm lại với cả tin mới.
    if (agent.status === 'running' && trust !== 'owner') {
      this.superseded.add(agent.session.id)
      agent.cancel({ kind: 'user' })
      agent.followup(message)
    } else if (agent.status === 'running' && busy === 'steer') agent.steer(message)
    else if (agent.status === 'running' && busy === 'interrupt') {
      agent.cancel({ kind: 'user' })
      agent.followup(message)
    } else agent.followup(message)
    await this.store.markInbox(inbox.id, 'running')
    this.typing(rt, ev.threadId, ev.isGroup)
    return true
  }

  // ======================================================================================
  // Trả lời
  // ======================================================================================

  /** Sự kiện phiên của dsh (`session/event`). */
  onSessionEvent(sessionId: string, event: { type: string; data?: unknown }) {
    const r = this.tracker.onEvent(sessionId, event)
    if (r)
      void this.deliver(r).catch((e: unknown) =>
        this.d.logger.warn('aris-channels: zalo giao trả lời: %s', String(e)),
      )
  }

  /** `@tên_gọi` của bot trong đội thành chấm màu + tên in đậm. */
  private named(md: string): string {
    try {
      return nameTeam(md, this.d.team?.() ?? [])
    } catch {
      return md
    }
  }

  async deliver(r: TurnResult<ZaloPending>) {
    const last = r.ours.at(-1)!
    // aris tắt giữa lượt: không báo lỗi, giữ tin trong hàng đợi vào để làm lại khi chạy lên (`recover`).
    if (r.reason.kind === 'interrupted') return
    const rt = this.apps.get(last.bot)
    for (const p of r.ours) await this.store.doneInbox(p.inboxId)
    // Lượt bị thay vì khách nhắn thêm: không gửi gì, lượt mới sẽ trả lời cả loạt tin.
    if (r.reason.kind === 'aborted' && this.superseded.delete(r.sessionId)) return
    const ok = r.reason.kind === 'completed'
    if (ok) this.superseded.delete(r.sessionId)
    // Các đoạn theo người nói: chữ của bot của phiên gộp lại; câu trả lời chuyển giao là đoạn riêng.
    const segments: TurnPart[] = []
    for (const p of r.parts) {
      const prev = segments.at(-1)
      if (!p.from && prev && !prev.from) prev.text += `\n\n${p.text}`
      else segments.push({ ...p })
    }
    if (!segments.length) {
      if (r.reason.kind === 'aborted') segments.push({ text: T.stoppedTurn })
      else if (!ok) segments.push({ text: Z.failedTurn(r.reason.error?.message ?? r.reason.kind) })
      else return
    }
    await this.sendMedia(r.sessionId, last, rt)
    for (const seg of segments) {
      if (!seg.from) {
        if (last.group && isSilent(seg.text)) continue
        await this.send(last, seg.text)
        continue
      }
      // Chuyển giao: lời của bot đích, mở đầu bằng tên thành viên.
      await this.send(last, `@${seg.from.handle}${seg.from.role ? ` · ${seg.from.role}` : ''}\n\n${seg.text}`)
    }
  }

  /** Ảnh, video bot tạo trong lượt: gửi trước câu trả lời (ảnh và video đều là tệp đính kèm). */
  private async sendMedia(sessionId: string, last: ZaloPending, rt: ZaloRuntime | undefined) {
    const port = this.d.media?.()
    if (!port || !rt) return
    for (const m of port.takeFresh(sessionId)) {
      const f = await port.read(m.id).catch(() => undefined)
      if (!f) continue
      try {
        if (!(await rt.throttle.take(last.threadId))) {
          await this.dailyStop(last.bot)
          return
        }
        const name = f.rec.path.split('/').pop() ?? (f.rec.kind === 'image' ? 'anh.png' : 'video.mp4')
        const r = await rt.api.sendFile(last.threadId, last.group, f.data, name)
        this.remember(rt, r.messageId)
      } catch (e) {
        this.d.logger.warn('aris-channels: zalo gửi %s: %s', f.rec.kind, msg(e))
      }
    }
  }

  /** Một câu trả lời vào hộp thư ra rồi gửi (Markdown đổi sang chữ thường, chia theo 2.000 ký tự). */
  private async send(last: ZaloPending, md: string) {
    const rec: OutboxRecord = {
      id: `zc-${this.now()}-${randomId()}`,
      bot: last.bot,
      chatId: 0,
      channel: 'zalo',
      chatRef: last.threadId,
      isGroup: last.group,
      chunks: toChunks(this.named(md)),
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: this.now(),
    }
    // Ghi hộp thư ra trước khi gửi: tắt máy lúc này thì lần sau gửi lại.
    await this.store.putOutbox(rec)
    await this.flush(rec)
  }

  /** Gửi các phần còn lại của một câu trả lời; lỗi thì thử lại tối đa 3 lần. Hết hạn mức ngày thì bỏ. */
  async flush(rec: OutboxRecord, recovered = false): Promise<void> {
    const rt = this.apps.get(rec.bot)
    // Không có kết nối thì để nguyên trong hộp thư ra: `onConnected` gửi nốt khi nối lại.
    if (!rt || !rec.chatRef || this.flushing.has(rec.id)) return
    this.flushing.add(rec.id)
    const group = rec.isGroup === true
    let cur = rec
    try {
      for (let i = cur.sent; i < cur.chunks.length; i++) {
        cur = { ...cur, state: 'sending' }
        await this.store.putOutbox(cur)
        const text = recovered && i === cur.sent ? `${T.recovered}\n\n${cur.chunks[i]!}` : cur.chunks[i]!
        for (const piece of splitText(text))
          if (!(await this.sendOne(rt, rec.chatRef, group, piece))) {
            // Hết hạn mức ngày: bỏ phần còn lại, không để lại hộp thư ra để mai gửi dồn.
            await this.store.doneOutbox(cur.id)
            return
          }
        cur = { ...cur, sent: i + 1 }
        await this.store.putOutbox(cur)
      }
      await this.store.doneOutbox(cur.id)
    } catch (e) {
      const next = { ...cur, state: 'pending' as const, attempts: cur.attempts + 1 }
      if (next.attempts >= 3) {
        this.d.logger.warn('aris-channels: zalo bỏ câu trả lời sau 3 lần gửi lỗi: %s', msg(e))
        await this.store.doneOutbox(cur.id)
        return
      }
      await this.store.putOutbox(next)
      const timer = setTimeout(() => void this.flush(next), 5000 * next.attempts)
      timer.unref?.()
    } finally {
      this.flushing.delete(rec.id)
    }
  }

  /** Sau khi khởi động lại: gửi nốt câu trả lời dở, làm tiếp tin chưa xong. */
  private async recover() {
    for (const rec of this.store.zaloOutbox()) {
      if (rec.attempts >= 3 || this.now() - rec.createdAt > 24 * 3_600_000) {
        await this.store.doneOutbox(rec.id)
        continue
      }
      await this.flush(rec, rec.state === 'sending')
    }
    for (const rec of this.store.zaloInbox()) {
      if (!this.apps.has(rec.bot)) continue
      this.route(rec, rec.state === 'running')
    }
  }

  // ======================================================================================
  // Lệnh
  // ======================================================================================

  private async command(
    rt: ZaloRuntime,
    ev: ZaloInbound,
    here: Reply,
    key: string,
    trust: Trust,
    name: string,
    args: string,
  ) {
    const say = (md: string) => this.say(rt, here, md)
    switch (name) {
      case 'start':
      case 'help':
        return say(Z.help(trust))
      case 'whoami':
        return say(Z.whoami(trust, ev.senderId, ev.threadId))
      case 'new':
        await this.sessionFor(rt.rec.bot, key, ev.threadId, true)
        return say(T.newSession)
      case 'stop': {
        const t = this.store.thread(key)
        const agent = t ? await this.d.sessions.agent(t.sessionId).catch(() => undefined) : undefined
        if (agent?.status !== 'running') return say(T.nothingRunning)
        agent.cancel({ kind: 'user' })
        return say(T.stopped)
      }
      case 'status': {
        const t = this.store.thread(key)
        if (!t) return say(T.noSession)
        const agent = await this.d.sessions.agent(t.sessionId).catch(() => undefined)
        const titles = await this.d.sessions.titles([t.sessionId]).catch(() => new Map<string, string>())
        return say(
          Z.status({
            session: t.sessionId,
            title: titles.get(t.sessionId),
            running: agent?.status === 'running',
            busy: T.busyLabel[this.store.settings().busy] ?? '',
          }),
        )
      }
      case 'sessions': {
        const ids = this.threadSessions(key).slice(0, 10)
        if (!ids.length) return say(T.noSession)
        const titles = await this.d.sessions.titles(ids).catch(() => new Map<string, string>())
        return say(
          Z.sessions(ids.map((id, i) => ({ title: (titles.get(id) ?? id).slice(0, 60), current: i === 0 }))),
        )
      }
      case 'resume': {
        const n = Number(args)
        const target = Number.isInteger(n) ? this.threadSessions(key)[n - 1] : undefined
        if (!target) return say(T.badIndex)
        await this.store.bindThread({
          key,
          bot: rt.rec.bot,
          chatId: 0,
          chatRef: ev.threadId,
          sessionId: target,
        })
        const titles = await this.d.sessions.titles([target]).catch(() => new Map<string, string>())
        return say(Z.resumed(titles.get(target) ?? target))
      }
      default:
        return say(TELEGRAM_ONLY_COMMANDS.has(name) ? Z.telegramOnly(name) : Z.help(trust))
    }
  }

  private threadSessions(key: string): string[] {
    const t = this.store.thread(key)
    return t ? [t.sessionId, ...t.history] : []
  }

  // ======================================================================================
  // Quyền và duyệt
  // ======================================================================================

  /** Lượt đang chạy của phiên có tin của kênh Zalo không; nếu có thì người gửi có quyền thấp nhất là gì. */
  private turnOf(sessionId: string): { last: ZaloPending; trust: Trust } | undefined {
    const ours = this.tracker.active(sessionId)
    const last = ours.at(-1)
    if (!last) return undefined
    const rank = { owner: 2, member: 1, guest: 0 } as const
    const trust = ours.reduce<Trust>((t, p) => (rank[p.trust] < rank[t] ? p.trust : t), 'owner')
    return { last, trust }
  }

  /** Lượt đang chạy có tin của người không phải người dùng chính (thành viên, khách): quyền bị hạn chế thật. */
  restricted(sessionId: string): boolean {
    const turn = this.turnOf(sessionId)
    return turn !== undefined && turn.trust !== 'owner'
  }

  /**
   * `approval/request`: undefined khi phiên không thuộc Zalo (để người trả lời khác lo). Người không phải chủ thì từ
   * chối ngay và báo. Chủ nhân thì báo là cần duyệt trên web rồi trả undefined để hộp duyệt ở web hiện yêu cầu.
   */
  async approve(
    sessionId: string,
    req: { toolName: string },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' | undefined> {
    const turn = this.turnOf(sessionId)
    if (!turn) return undefined
    const rt = this.apps.get(turn.last.bot)
    if (!rt) return 'unavailable'
    const here: Reply = { thread: turn.last.threadId, group: turn.last.group }
    if (turn.trust !== 'owner') {
      await this.say(rt, here, Z.approvalNotOwner(req.toolName))
      return 'rejected'
    }
    await this.say(rt, here, Z.approvalOnWeb(req.toolName))
    return undefined
  }
}

/** Nơi gửi một tin hệ thống: cuộc trò chuyện (mã người hay mã nhóm) và có phải nhóm không. */
interface Reply {
  thread: string
  group: boolean
}

/** Chưa có dữ liệu đăng nhập trong kho khoá: phải quét lại QR. */
class MissingSession extends Error {
  constructor() {
    super('chưa có dữ liệu đăng nhập Zalo trong kho khoá')
  }
}
