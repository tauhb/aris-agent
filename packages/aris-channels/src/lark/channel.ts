/**
 * Kênh Lark: nhận tin bằng kết nối dài của SDK chính thức, đưa vào phiên của dsh qua đúng đường như Telegram (quyền ở
 * cửa vào, hàng đợi bền, ghép đôi bằng mã kênh `lark`, lệnh `/new` `/stop` `/status`, phiên bị hạn chế với người không
 * phải chủ), theo dõi lượt để trả lời, giao bền qua hộp thư ra. Dùng chung với Telegram: kho (`ChannelStore`), bộ theo dõi
 * lượt (`TurnTracker`), cổng phiên (`SessionPort`), luật quyền (`access.ts`). Phần gọi SDK nằm sau `LarkConnector`
 * nên kiểm thử dùng bản giả, không gọi mạng.
 *
 * Khác Telegram: không có nút bấm trong tin (thẻ Lark cần gói nhận sự kiện thẻ), nên duyệt việc của chủ nhân vẫn ở web;
 * không hiện chữ dần (không sửa tin xem trước); thả cảm xúc thay cho "đang gõ".
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
import { ChannelStore, larkKey, larkThreadKey, normalizeCode } from '../store.js'
import { isSilent, nameTeam, type TeamName } from '../telegram/format.js'
import { TurnTracker, type PendingBase, type TurnPart, type TurnResult } from '../tracker.js'
import { decideLark } from './access.js'
import { parseMessage, splitMarkdown, toOutgoing, type LarkResource, type ParsedMessage } from './content.js'
import { L, TELEGRAM_ONLY_COMMANDS } from './copy.js'
import { sdkConnector } from './sdk.js'
import {
  LarkError,
  type LarkApi,
  type LarkConnector,
  type LarkCredentials,
  type LarkDomain,
  type LarkInbound,
  type LarkSocket,
  type LarkSocketState,
  type LarkTarget,
} from './types.js'

/** Tin Lark đã đưa vào agent. */
export interface LarkPending extends PendingBase {
  /** `chat_id` của cuộc trò chuyện. */
  chatId: string
  /** Mã tin Lark của người gửi (để thả cảm xúc, trả lời vào). */
  msgId: string
}

export interface LarkDeps {
  store: ChannelStore
  credentials: CredentialPort
  sessions: SessionPort
  attachments?: AttachmentPort | undefined
  stt?: SpeechToText | undefined
  logger: { info(msg: string, ...a: unknown[]): void; warn(msg: string, ...a: unknown[]): void }
  /** Mặc định: SDK thật. Kiểm thử đưa bản giả. */
  connector?: LarkConnector | undefined
  now?: () => number
  /** Bot trong đội: `@tên_gọi` trong tin gửi ra đổi thành chấm màu + tên. */
  team?: () => readonly TeamName[]
  media?: () => MediaPort | undefined
  /** aris đang dừng khẩn cấp (@aris/guard): tin thường chỉ nhận câu báo, lệnh vẫn chạy. */
  stopped?: () => boolean
  /** Chờ trước lần thử lại đầu khi khởi động lỗi tạm (mặc định 15 giây, gấp đôi mỗi lần, tối đa 5 phút). */
  retryMs?: number
}

/** Trạng thái một ứng dụng Lark cho trang Kênh và `aris status`. */
export type LarkAppState = 'receiving' | 'connecting' | 'reconnecting' | 'error'

export interface LarkAppStatus {
  bot: string
  appId: string
  name: string
  domain: LarkDomain
  state: LarkAppState
  error: string | null
  /** `lark` = đang nhận tin (cho `aris status`, cùng nghĩa với `running` của Telegram). */
  running: boolean
}

interface LarkRuntime {
  rec: BotRecord
  api: LarkApi
  socket: LarkSocket
  state: LarkAppState
}

const MAX_FILE = 20 * 1024 * 1024
/** Cảm xúc "đang làm" thả vào tin vừa nhận; xong thì đổi sang cảm xúc kết quả. */
const REACT_WORKING = 'OnIt'
const REACT_OK = 'DONE'
const REACT_FAIL = 'CrossMark'
/** Mã lỗi Lark: tin cần trả lời đã bị thu hồi. */
const REPLY_WITHDRAWN = 230011
const APP_ID_RE = /^cli_[0-9a-fA-F]{16}$/

export const larkSecretRef = (bot: string) =>
  `LARK_${bot.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_APP_SECRET`
const randomId = () => Math.random().toString(36).slice(2, 10)
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Đoán loại ảnh từ vài byte đầu (Lark không báo loại tệp khi tải). */
function imageType(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif'
  if (data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57) return 'image/webp'
  return 'image/jpeg'
}

export class LarkChannel implements ChannelPeer {
  readonly kind = 'lark'
  readonly tracker = new TurnTracker<LarkPending>()
  private readonly apps = new Map<string, LarkRuntime>()
  private readonly lanes = new Map<string, Promise<void>>()
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>()
  /** Tin đã nhận gần đây (Lark gửi lại sự kiện nếu chậm báo nhận): chỉ xử lý một lần. */
  private readonly seen = new Set<string>()
  private readonly names = new Map<string, { name: string; at: number }>()
  /** Cảm xúc "đang làm" đã thả theo mã tin, để gỡ khi xong. */
  private readonly reactions = new Map<string, string>()
  private readonly now: () => number
  private readonly connector: LarkConnector

  constructor(private readonly d: LarkDeps) {
    this.now = d.now ?? Date.now
    this.connector = d.connector ?? sdkConnector
  }

  private get store() {
    return this.d.store
  }

  // ======================================================================================
  // Ứng dụng Lark
  // ======================================================================================

  async start() {
    for (const rec of this.store.larkApps()) await this.startOrRetry(rec)
    await this.recover()
  }

  stop() {
    for (const t of this.retries.values()) clearTimeout(t)
    this.retries.clear()
    for (const rt of this.apps.values()) rt.socket.close()
    this.apps.clear()
  }

  /** Tình trạng từng ứng dụng, cho trang Kênh và `aris status`. */
  status(): LarkAppStatus[] {
    return this.store.larkApps().map((rec) => {
      const rt = this.apps.get(rec.bot)
      const state: LarkAppState = rt?.state ?? (rec.error ? 'error' : 'connecting')
      return {
        bot: rec.bot,
        appId: rec.appId ?? '',
        name: rec.name,
        domain: rec.domain ?? 'lark',
        state,
        error: rec.error ?? null,
        running: state === 'receiving',
      }
    })
  }

  /**
   * Nhập khoá: kiểm bằng một lời gọi nhẹ (lấy thông tin bot) rồi mới lưu. App Secret vào kho khoá (`credentials`), bản ghi
   * chỉ giữ App ID, tên và miền. Khoá sai thì ném lỗi, không lưu gì.
   */
  async connect(bot: string, c: LarkCredentials): Promise<BotRecord> {
    const appId = c.appId.trim()
    const appSecret = c.appSecret.trim()
    if (!APP_ID_RE.test(appId)) throw new Error('App ID phải có dạng cli_ rồi 16 ký tự (chữ số hay a-f)')
    if (!appSecret) throw new Error('thiếu App Secret')
    const cred: LarkCredentials = { appId, appSecret, domain: c.domain === 'feishu' ? 'feishu' : 'lark' }
    const taken = this.store.larkApps().find((a) => a.appId === appId && a.bot !== bot)
    if (taken) throw new Error(`ứng dụng này đã gắn với bot ${taken.bot}`)
    const info = await this.connector.open(cred, this.d.logger).api.botInfo()
    const cur = this.store.larkApp(bot)
    // Người ghép đôi và nhóm là của ứng dụng cũ (open_id, chat_id khác nhau giữa các ứng dụng): đổi ứng dụng thì bỏ.
    if (cur && cur.appId !== appId) await this.forgetPeople()
    const ref = larkSecretRef(bot)
    await this.d.credentials.set(ref, appSecret)
    const rec: BotRecord = {
      bot,
      tgId: 0,
      username: info.name,
      name: info.name,
      tokenRef: ref,
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: new Date(this.now()).toISOString(),
      channel: 'lark',
      appId,
      domain: cred.domain,
      botOpenId: info.openId,
    }
    await this.store.putLarkApp(rec)
    this.stopApp(bot)
    // Khoá đã kiểm xong và đã lưu; nối kết nối dài lỗi tạm thì ghi lỗi vào bản ghi và tự thử lại, không bắt nhập lại.
    await this.startOrRetry(rec)
    return this.store.larkApp(bot)!
  }

  async disconnect(bot: string) {
    const rec = this.store.larkApp(bot)
    this.stopApp(bot)
    if (rec) await this.d.credentials.unset(rec.tokenRef)
    await this.store.removeLarkApp(bot)
    if (!this.store.larkApps().length) await this.forgetPeople()
  }

  private async forgetPeople() {
    for (const p of this.store.larkPeople()) if (p.openId) await this.store.revokeLark(p.openId)
    for (const g of this.store.larkGroups()) if (g.chatRef) await this.store.removeLarkGroup(g.chatRef)
  }

  private stopApp(bot: string) {
    const t = this.retries.get(bot)
    if (t) clearTimeout(t)
    this.retries.delete(bot)
    this.apps.get(bot)?.socket.close()
    this.apps.delete(bot)
  }

  private async appError(bot: string, e: unknown) {
    this.d.logger.warn('aris-channels: lark %s: %s', bot, msg(e))
    const cur = this.store.larkApp(bot)
    if (cur) await this.store.putLarkApp({ ...cur, error: msg(e) })
  }

  /**
   * Bật một ứng dụng; lỗi tạm (mạng, Lark trả 5xx) thì thử lại sau 15 giây, gấp đôi mỗi lần, tối đa 5 phút, cho tới khi
   * bật được hay ứng dụng bị gỡ. Khoá sai hay chưa có App Secret thì không thử lại. Sau khi đã nhận tin, SDK tự nối lại
   * khi rớt kết nối.
   */
  private async startOrRetry(rec: BotRecord, delay = this.d.retryMs ?? 15_000) {
    this.retries.delete(rec.bot)
    try {
      await this.startApp(rec)
    } catch (e) {
      await this.appError(rec.bot, e)
      const fatal =
        (e instanceof LarkError && e.fatal) || !this.store.larkApp(rec.bot) || e instanceof MissingSecret
      if (fatal) return
      const timer = setTimeout(() => {
        const cur = this.store.larkApp(rec.bot)
        if (cur && !this.apps.has(rec.bot)) void this.startOrRetry(cur, Math.min(delay * 2, 300_000))
      }, delay)
      timer.unref?.()
      this.retries.set(rec.bot, timer)
    }
  }

  private async startApp(rec: BotRecord) {
    const appSecret = await this.d.credentials.resolve(rec.tokenRef)
    if (!appSecret || !rec.appId) throw new MissingSecret()
    const { api, socket } = this.connector.open(
      { appId: rec.appId, appSecret, domain: rec.domain ?? 'lark' },
      this.d.logger,
    )
    const info = await api.botInfo()
    const next: BotRecord = {
      ...(this.store.larkApp(rec.bot) ?? rec),
      name: info.name,
      botOpenId: info.openId,
    }
    delete next.error
    await this.store.putLarkApp(next)
    const rt: LarkRuntime = { rec: next, api, socket, state: 'connecting' }
    this.apps.set(rec.bot, rt)
    try {
      await socket.start({
        onMessage: (ev) => this.receive(rt, ev),
        onState: (s, err) => void this.onState(rt, s, err),
      })
    } catch (e) {
      this.apps.delete(rec.bot)
      socket.close()
      throw e
    }
  }

  private async onState(rt: LarkRuntime, s: LarkSocketState, err?: Error) {
    if (this.apps.get(rt.rec.bot) !== rt) return
    if (s === 'ready' || s === 'reconnected') {
      rt.state = 'receiving'
      const cur = this.store.larkApp(rt.rec.bot)
      if (cur?.error) {
        const ok = { ...cur }
        delete ok.error
        await this.store.putLarkApp(ok)
      }
    } else if (s === 'reconnecting') rt.state = 'reconnecting'
    else {
      // SDK bỏ cuộc (khoá sai, chưa bật kết nối dài…): dừng hẳn, chờ người dùng sửa rồi kết nối lại.
      rt.state = 'error'
      rt.socket.close()
      this.apps.delete(rt.rec.bot)
      await this.appError(rt.rec.bot, err ?? new Error('mất kết nối với Lark'))
    }
  }

  // ======================================================================================
  // Nhận tin
  // ======================================================================================

  /** Gọi cho mỗi sự kiện vào. Chỉ ghi vào hàng đợi bền rồi trả về ngay (Lark gửi lại nếu quá ~3 giây chưa báo nhận). */
  private async receive(rt: LarkRuntime, ev: LarkInbound) {
    if (ev.senderType !== 'user') return
    const id = `lk-${rt.rec.bot}-${larkKey(ev.messageId)}`
    if (this.seen.has(id)) return
    this.seen.add(id)
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!)
    const inbox: InboxRecord = {
      id,
      bot: rt.rec.bot,
      update: ev,
      state: 'queued',
      receivedAt: this.now(),
      channel: 'lark',
    }
    await this.store.enqueue(inbox)
    this.route(inbox)
  }

  /** Xếp tin vào làn của cuộc trò chuyện: trong một cuộc thì nối tiếp, giữa các cuộc thì song song. */
  private route(inbox: InboxRecord, resumed = false) {
    const ev = inbox.update as LarkInbound
    const rt = this.apps.get(inbox.bot)
    if (!rt) return
    const lane = larkThreadKey(inbox.bot, ev.chatId)
    const prev = this.lanes.get(lane) ?? Promise.resolve()
    const next = prev
      .then(() => this.handle(rt, inbox, ev, resumed))
      .catch((e: unknown) =>
        this.d.logger.warn('aris-channels: lark xử lý tin: %s', e instanceof Error ? e.stack : String(e)),
      )
    this.lanes.set(lane, next)
  }

  private async handle(rt: LarkRuntime, inbox: InboxRecord, ev: LarkInbound, resumed: boolean) {
    let keep = false
    try {
      keep = await this.onMessage(rt, inbox, ev, resumed)
    } finally {
      // Tin đã vào agent thì giữ trong hàng đợi tới khi lượt trả lời xong.
      if (!keep) await this.store.doneInbox(inbox.id)
    }
  }

  /** Tên hiển thị của người (nhớ 1 giờ); không lấy được (thiếu quyền) thì dùng tên chung. */
  private async nameOf(rt: LarkRuntime, openId: string): Promise<string> {
    const hit = this.names.get(openId)
    if (hit && this.now() - hit.at < 3_600_000) return hit.name
    const name = (await rt.api.userName(openId)) ?? 'Người dùng Lark'
    this.names.set(openId, { name, at: this.now() })
    return name
  }

  /** Trả `true` khi tin đã vào agent (hàng đợi giữ tới khi trả lời xong). */
  private async onMessage(rt: LarkRuntime, inbox: InboxRecord, ev: LarkInbound, resumed: boolean) {
    const parsed = parseMessage(ev, rt.rec.botOpenId)
    const p2p = ev.chatType === 'p2p'
    const here: Reply = { chat: ev.chatId, to: p2p ? undefined : ev.messageId }

    // Ghép đôi: nhắn đúng mã trong chat riêng.
    if (p2p && ev.senderType === 'user' && normalizeCode(parsed.text)) {
      const person = await this.store.redeemLark(parsed.text, {
        openId: ev.senderOpenId,
        name: await this.nameOf(rt, ev.senderOpenId),
      })
      if (person === 'other-channel') {
        await this.say(rt, here, T.codeOtherChannel)
        return false
      }
      if (person) {
        await this.say(rt, here, L.paired(person.name, person.role === 'owner'))
        return false
      }
    }

    const d = decideLark(ev, parsed, {
      roleOf: (id) => this.store.larkRoleOf(id),
      groupRule: (id) => this.store.larkGroupRule(id),
      guestMode: this.store.guestMode,
    })
    if (d.kind === 'ignore') return false
    if (d.kind === 'stranger') {
      if (await this.store.shouldNotifyStranger(ev.senderOpenId))
        await this.toOwners(
          rt,
          L.stranger(await this.nameOf(rt, ev.senderOpenId), ev.senderOpenId, parsed.text),
        )
      return false
    }
    if (d.kind === 'unknown-group') {
      const title = (await rt.api.chatName(ev.chatId)) ?? ev.chatId
      if (await this.store.shouldNotifyLarkGroup(ev.chatId, title))
        await this.toOwners(rt, L.unknownGroup(title, ev.chatId))
      return false
    }

    const key = larkThreadKey(rt.rec.bot, ev.chatId)
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
      await this.say(rt, here, L.unsupported(parsed.unsupported))
      return false
    }
    return this.submit(rt, inbox, ev, parsed, here, key, d.trust, resumed)
  }

  // ======================================================================================
  // Gửi tin
  // ======================================================================================

  /** Gửi ngay một tin hệ thống (không qua hộp thư ra): lỗi chỉ ghi log. */
  private async say(rt: LarkRuntime, to: Reply, md: string) {
    try {
      const replyTo = to.to
      for (const [i, chunk] of splitMarkdown(md).entries())
        await rt.api.send({ kind: 'chat', id: to.chat }, toOutgoing(chunk), i === 0 ? replyTo : undefined)
    } catch (e) {
      this.d.logger.warn('aris-channels: lark gửi tin: %s', msg(e))
    }
  }

  /** Báo các chủ nhân đã ghép đôi trên Lark (nhắn riêng). */
  private async toOwners(rt: LarkRuntime, md: string) {
    for (const o of this.store.larkOwners()) {
      if (!o.openId) continue
      try {
        await rt.api.send({ kind: 'user', id: o.openId }, toOutgoing(md))
      } catch (e) {
        this.d.logger.warn('aris-channels: lark nhắn người dùng: %s', msg(e))
      }
    }
  }

  // ======================================================================================
  // Đưa tin vào phiên
  // ======================================================================================

  private async sessionFor(bot: string, key: string, chatId: string, fresh = false): Promise<LiveAgent> {
    const t = this.store.thread(key)
    if (t && !fresh) {
      try {
        return await this.d.sessions.agent(t.sessionId)
      } catch (e) {
        this.d.logger.warn('aris-channels: lark mở lại phiên %s: %s, mở phiên mới', t.sessionId, String(e))
      }
    }
    const sessionId = await this.d.sessions.create(bot)
    await this.store.bindThread({ key, bot, chatId: 0, chatRef: chatId, sessionId })
    return this.d.sessions.agent(sessionId)
  }

  /** Nội dung đưa vào agent: chữ, ảnh, tệp, ghi âm đã đổi thành chữ. */
  private async content(
    rt: LarkRuntime,
    ev: LarkInbound,
    parsed: ParsedMessage,
    here: Reply,
    trust: Trust,
  ): Promise<unknown[] | undefined> {
    const parts: unknown[] = []
    let body = parsed.text
    for (const r of parsed.resources) {
      try {
        body = (await this.resource(rt, ev, r, parts, body)) ?? body
      } catch (e) {
        if (r.kind === 'audio')
          await this.say(rt, here, sttNotReady(e) ? T.voiceNotReady : L.voiceFail(msg(e)))
        else
          await this.say(
            rt,
            here,
            e instanceof LarkError && e.message === 'tệp quá lớn' ? L.fileTooBig : L.fileFail(msg(e)),
          )
      }
    }
    if (!body && !parts.length) return undefined
    // Trong nhóm, bot cần biết ai đang nói; người không phải người dùng chính thì nhắc giới hạn quyền.
    const who = ev.chatType === 'p2p' ? '' : `[${await this.nameOf(rt, ev.senderOpenId)}] `
    const limit = trust === 'owner' ? '' : NOT_OWNER_NOTE
    if (body || who) parts.unshift({ type: 'text', text: `${who}${body || '(gửi tệp)'}${limit}` })
    return parts
  }

  /** Tải một ảnh / tệp / ghi âm của tin; ghi âm trả về chữ mới của tin, ảnh và tệp thêm vào `parts`. */
  private async resource(
    rt: LarkRuntime,
    ev: LarkInbound,
    r: LarkResource,
    parts: unknown[],
    body: string,
  ): Promise<string | undefined> {
    if (r.kind === 'audio') {
      const data = await rt.api.download(ev.messageId, r.fileKey, 'file', MAX_FILE)
      const heard = await transcribe(this.d.stt, data, AbortSignal.timeout(120_000))
      return [body, `${T.voiceNote} ${heard}`].filter(Boolean).join('\n')
    }
    if (!this.d.attachments) return undefined
    const data = await rt.api.download(ev.messageId, r.fileKey, r.kind, MAX_FILE)
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
    rt: LarkRuntime,
    inbox: InboxRecord,
    ev: LarkInbound,
    parsed: ParsedMessage,
    here: Reply,
    key: string,
    trust: Trust,
    resumed: boolean,
  ): Promise<boolean> {
    const content = await this.content(rt, ev, parsed, here, trust)
    if (!content) return false
    if (resumed) await this.say(rt, here, T.restarted)
    const agent = await this.sessionFor(rt.rec.bot, key, ev.chatId)
    const group = ev.chatType !== 'p2p' ? this.store.larkGroup(ev.chatId) : undefined
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
      bot: rt.rec.bot,
      chatId: ev.chatId,
      msgId: ev.messageId,
      group: ev.chatType !== 'p2p',
      trust,
    })
    const busy = this.store.settings().busy
    if (agent.status === 'running' && busy === 'steer') agent.steer(message)
    else if (agent.status === 'running' && busy === 'interrupt') {
      agent.cancel({ kind: 'user' })
      agent.followup(message)
    } else agent.followup(message)
    await this.store.markInbox(inbox.id, 'running')
    void rt.api
      .react(ev.messageId, REACT_WORKING)
      .then((id) => void (id && this.reactions.set(ev.messageId, id)))
      .catch(() => undefined)
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
        this.d.logger.warn('aris-channels: lark giao trả lời: %s', String(e)),
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

  async deliver(r: TurnResult<LarkPending>) {
    const last = r.ours.at(-1)!
    const first = r.ours[0]!
    // aris tắt giữa lượt: không báo lỗi, giữ tin trong hàng đợi vào để làm lại khi chạy lên (`recover`).
    if (r.reason.kind === 'interrupted') return
    const rt = this.apps.get(last.bot)
    for (const p of r.ours) await this.store.doneInbox(p.inboxId)
    const ok = r.reason.kind === 'completed'
    for (const p of r.ours) void this.finishReaction(rt, p.msgId, ok)
    // Các đoạn theo người nói: chữ của bot của phiên gộp lại; câu trả lời chuyển giao là đoạn riêng.
    const segments: TurnPart[] = []
    for (const p of r.parts) {
      const prev = segments.at(-1)
      if (!p.from && prev && !prev.from) prev.text += `\n\n${p.text}`
      else segments.push({ ...p })
    }
    if (!segments.length) {
      if (r.reason.kind === 'aborted') segments.push({ text: T.stoppedTurn })
      else if (!ok) segments.push({ text: L.failedTurn(r.reason.error?.message ?? r.reason.kind) })
      else return
    }
    await this.sendMedia(r.sessionId, last, rt)
    for (const seg of segments) {
      if (!seg.from) {
        if (last.group && isSilent(seg.text)) continue
        await this.send(last, first, seg.text)
        continue
      }
      // Chuyển giao: lời của bot đích, mở đầu bằng tên thành viên.
      await this.send(
        last,
        first,
        `@${seg.from.handle}${seg.from.role ? ` · ${seg.from.role}` : ''}\n\n${seg.text}`,
      )
    }
  }

  /** Gỡ cảm xúc "đang làm", thả cảm xúc kết quả. */
  private async finishReaction(rt: LarkRuntime | undefined, messageId: string, ok: boolean) {
    if (!rt) return
    const working = this.reactions.get(messageId)
    this.reactions.delete(messageId)
    if (working) await rt.api.unreact(messageId, working).catch(() => undefined)
    await rt.api.react(messageId, ok ? REACT_OK : REACT_FAIL).catch(() => undefined)
  }

  /** Ảnh, video bot tạo trong lượt: gửi trước câu trả lời (ảnh thành tin ảnh, video thành tệp). */
  private async sendMedia(sessionId: string, last: LarkPending, rt: LarkRuntime | undefined) {
    const port = this.d.media?.()
    if (!port || !rt) return
    for (const m of port.takeFresh(sessionId)) {
      const f = await port.read(m.id).catch(() => undefined)
      if (!f) continue
      try {
        const to: LarkTarget = { kind: 'chat', id: last.chatId }
        if (f.rec.kind === 'image')
          await rt.api.send(to, {
            msgType: 'image',
            content: JSON.stringify({ image_key: await rt.api.uploadImage(f.data) }),
          })
        else
          await rt.api.send(to, {
            msgType: 'file',
            content: JSON.stringify({
              file_key: await rt.api.uploadFile(f.data, f.rec.path.split('/').pop() ?? 'video.mp4'),
            }),
          })
      } catch (e) {
        this.d.logger.warn('aris-channels: lark gửi %s: %s', f.rec.kind, msg(e))
      }
    }
  }

  /** Một câu trả lời vào hộp thư ra rồi gửi (Markdown chia phần, `@tên_gọi` thành tên thành viên). */
  private async send(last: LarkPending, first: LarkPending, md: string) {
    const rec: OutboxRecord = {
      id: `lk-${this.now()}-${randomId()}`,
      bot: last.bot,
      chatId: 0,
      channel: 'lark',
      chatRef: last.chatId,
      ...(last.group ? { replyRef: first.msgId } : {}),
      chunks: splitMarkdown(this.named(md)),
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: this.now(),
    }
    // Ghi hộp thư ra trước khi gửi: tắt máy lúc này thì lần sau gửi lại.
    await this.store.putOutbox(rec)
    await this.flush(rec)
  }

  /** Gửi các phần còn lại của một câu trả lời; lỗi thì thử lại tối đa 3 lần. */
  async flush(rec: OutboxRecord, recovered = false): Promise<void> {
    const rt = this.apps.get(rec.bot)
    if (!rt || !rec.chatRef) return
    const to: LarkTarget = rec.toOpenId
      ? { kind: 'user', id: rec.chatRef }
      : { kind: 'chat', id: rec.chatRef }
    let cur = rec
    try {
      for (let i = cur.sent; i < cur.chunks.length; i++) {
        cur = { ...cur, state: 'sending' }
        await this.store.putOutbox(cur)
        const text = recovered && i === cur.sent ? `${T.recovered}\n\n${cur.chunks[i]!}` : cur.chunks[i]!
        const replyTo = i === 0 ? cur.replyRef : undefined
        await rt.api.send(to, toOutgoing(text), replyTo).catch((e: unknown) => {
          // Tin cần trả lời đã bị thu hồi: gửi thẳng vào cuộc trò chuyện.
          if (replyTo && e instanceof LarkError && e.code === REPLY_WITHDRAWN)
            return rt.api.send(to, toOutgoing(text))
          throw e
        })
        cur = { ...cur, sent: i + 1 }
        await this.store.putOutbox(cur)
      }
      await this.store.doneOutbox(cur.id)
    } catch (e) {
      const next = { ...cur, state: 'pending' as const, attempts: cur.attempts + 1 }
      if (next.attempts >= 3) {
        this.d.logger.warn('aris-channels: lark bỏ câu trả lời sau 3 lần gửi lỗi: %s', msg(e))
        await this.store.doneOutbox(cur.id)
        return
      }
      await this.store.putOutbox(next)
      const timer = setTimeout(() => void this.flush(next), 5000 * next.attempts)
      timer.unref?.()
    }
  }

  /** Sau khi khởi động lại: gửi nốt câu trả lời dở, làm tiếp tin chưa xong. */
  private async recover() {
    for (const rec of this.store.larkOutbox()) {
      if (rec.attempts >= 3 || this.now() - rec.createdAt > 24 * 3_600_000) {
        await this.store.doneOutbox(rec.id)
        continue
      }
      await this.flush(rec, rec.state === 'sending')
    }
    for (const rec of this.store.larkInbox()) {
      if (!this.apps.has(rec.bot)) continue
      this.route(rec, rec.state === 'running')
    }
  }

  // ======================================================================================
  // Lệnh
  // ======================================================================================

  private async command(
    rt: LarkRuntime,
    ev: LarkInbound,
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
        return say(L.help(trust))
      case 'whoami':
        return say(L.whoami(trust, ev.senderOpenId, ev.chatId))
      case 'new':
        await this.sessionFor(rt.rec.bot, key, ev.chatId, true)
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
          L.status({
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
          L.sessions(ids.map((id, i) => ({ title: (titles.get(id) ?? id).slice(0, 60), current: i === 0 }))),
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
          chatRef: ev.chatId,
          sessionId: target,
        })
        const titles = await this.d.sessions.titles([target]).catch(() => new Map<string, string>())
        return say(L.resumed(titles.get(target) ?? target))
      }
      default:
        return say(TELEGRAM_ONLY_COMMANDS.has(name) ? L.telegramOnly(name) : L.help(trust))
    }
  }

  private threadSessions(key: string): string[] {
    const t = this.store.thread(key)
    return t ? [t.sessionId, ...t.history] : []
  }

  // ======================================================================================
  // Quyền và duyệt
  // ======================================================================================

  /** Lượt đang chạy của phiên có tin của kênh Lark không; nếu có thì người gửi có quyền thấp nhất là gì. */
  private turnOf(sessionId: string): { last: LarkPending; trust: Trust } | undefined {
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
   * `approval/request`: undefined khi phiên không thuộc Lark (để người trả lời khác lo). Người không phải chủ thì từ
   * chối ngay và báo. Chủ nhân thì báo là cần duyệt trên web rồi trả undefined để hộp duyệt ở web hiện yêu cầu
   * (Lark chưa có nút duyệt).
   */
  async approve(
    sessionId: string,
    req: { toolName: string },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' | undefined> {
    const turn = this.turnOf(sessionId)
    if (!turn) return undefined
    const rt = this.apps.get(turn.last.bot)
    if (!rt) return 'unavailable'
    const here: Reply = { chat: turn.last.chatId, to: turn.last.group ? turn.last.msgId : undefined }
    if (turn.trust !== 'owner') {
      await this.say(rt, here, L.approvalNotOwner(req.toolName))
      return 'rejected'
    }
    await this.say(rt, here, L.approvalOnWeb(req.toolName))
    return undefined
  }
}

/** Nơi gửi một tin hệ thống: cuộc trò chuyện, và tin để trả lời vào (trong nhóm). */
interface Reply {
  chat: string
  to: string | undefined
}

/** Chưa có App Secret trong kho khoá: thử lại cũng vô ích tới khi người dùng nhập lại. */
class MissingSecret extends Error {
  constructor() {
    super('chưa có App Secret trong kho khoá')
  }
}
