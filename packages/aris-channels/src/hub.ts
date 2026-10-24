/**
 * Trung tâm kênh: nhận tin Telegram (long-polling), quyết định quyền ở cửa vào, đưa tin vào
 * phiên của dsh, theo dõi lượt để trả lời (hiện dần rồi gửi bản cuối), giao bền, lệnh, nút bấm,
 * duyệt và câu hỏi. Mọi phụ thuộc của dsh đi qua `HubDeps` để kiểm thử bằng bản giả.
 */
import { commandAllowed, decide, type Trust } from './access.js'
import { T } from './copy.js'
import type { BotRecord, InboxRecord, OutboxRecord } from './domain.js'
import { sttNotReady, textToVoice, transcribe, type SpeechToText } from './media.js'
import { ChannelStore, keyNum, threadKey } from './store.js'
import { TelegramApi, TelegramError, type Fetch } from './telegram/api.js'
import { escapeHtml, isSilent, preview, toTelegramHtml } from './telegram/format.js'
import type {
  InlineButton,
  TgCallbackQuery,
  TgChatMemberUpdated,
  TgMessage,
  TgUpdate,
} from './telegram/types.js'
import { TurnTracker, type Pending, type TurnResult } from './tracker.js'

/** Agent sống của dsh, dạng tối thiểu kênh dùng. */
export interface LiveAgent {
  readonly status: 'idle' | 'running'
  readonly session: { readonly id: string }
  followup(message: unknown): void
  steer(message: unknown): void
  inject(message: unknown): void
  cancel(cause: { kind: 'user' }, options?: { keepInbox?: boolean }): void
}

export interface ModelGroupLite {
  id: string
  name: string
  models: readonly { id: string; name: string }[]
}

/** Phần phiên của dsh mà kênh cần (bọc `ctx.sessionController`, `ctx.sessionQuery`). */
export interface SessionPort {
  /** Phiên mới trong workspace chat riêng (`@aris/home`). */
  create(): Promise<string>
  agent(sessionId: string): Promise<LiveAgent>
  catalog(): Promise<readonly ModelGroupLite[]>
  select(sessionId: string, provider: string, model: string): Promise<void>
  titles(sessionIds: readonly string[]): Promise<Map<string, string>>
  /** Tin người dùng theo định dạng của dsh. */
  message(content: readonly unknown[]): { id: string }
  /** Tin ngữ cảnh (lời nhắc riêng của nhóm) không đánh thức agent. */
  notice(text: string, summary: string): unknown
}

export interface AttachmentPort {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<unknown>
  saveFile(input: { data: Uint8Array; name?: string }): Promise<unknown>
}

export interface CredentialPort {
  resolve(ref: string): Promise<string | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export interface HubDeps {
  store: ChannelStore
  credentials: CredentialPort
  sessions: SessionPort
  attachments?: AttachmentPort | undefined
  stt?: SpeechToText | undefined
  logger: { info(msg: string, ...a: unknown[]): void; warn(msg: string, ...a: unknown[]): void }
  fetchImpl?: Fetch | undefined
  now?: () => number
}

interface BotRuntime {
  rec: BotRecord
  api: TelegramApi
  abort: AbortController
}

interface Waiter<T> {
  resolve(v: T): void
  /** Ai được bấm: chỉ người dùng chính, hoặc người hỏi. */
  owner: boolean
  chatId: number
  messageId?: number
}

/** Tối đa tải 20 MB (giới hạn getFile của Bot API). */
const MAX_FILE = 20 * 1024 * 1024
const PREVIEW_EVERY_MS = 1200
const APPROVAL_TIMEOUT_MS = 10 * 60_000
const MODELS_PER_PAGE = 8

const tokenRef = (bot: string) => `TELEGRAM_${bot.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_BOT_TOKEN`
const fullName = (u: { first_name: string; last_name?: string | undefined }) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ')
const randomId = () => Math.random().toString(36).slice(2, 10)

export class ChannelHub {
  readonly tracker = new TurnTracker()
  private readonly runtimes = new Map<string, BotRuntime>()
  private readonly lanes = new Map<string, Promise<void>>()
  /** Model đang dùng theo phiên (từ `request/context`). */
  readonly models = new Map<string, string>()
  private readonly previews = new Map<
    string,
    {
      chatId: number
      messageId?: number
      /** Lần gửi/sửa tin xem trước đang chạy: xoá tin phải đợi lần gửi đầu có mã tin. */
      sending?: Promise<unknown>
      last: number
      text: string
      timer?: ReturnType<typeof setTimeout> | undefined
    }
  >()
  private readonly typing = new Map<string, ReturnType<typeof setInterval>>()
  private readonly approvals = new Map<string, Waiter<boolean>>()
  private readonly questions = new Map<string, Waiter<{ option?: number; other?: true; done?: true }>>()
  /** Cuộc trò chuyện đang chờ chữ trả lời câu hỏi ("Khác"). */
  private readonly textWaiters = new Map<string, (text: string) => void>()
  private readonly strangers = new Map<number, { name: string; username?: string | undefined }>()
  private readonly now: () => number

  constructor(private readonly d: HubDeps) {
    this.now = d.now ?? Date.now
  }

  private get store() {
    return this.d.store
  }

  // ======================================================================================
  // Tài khoản bot
  // ======================================================================================

  async start() {
    for (const rec of this.store.bots())
      await this.startBot(rec).catch((e: unknown) => this.botError(rec.bot, e))
    await this.recover()
  }

  stop() {
    for (const rt of this.runtimes.values()) rt.abort.abort()
    this.runtimes.clear()
    for (const t of this.typing.values()) clearInterval(t)
    this.typing.clear()
  }

  /** Tóm tắt cho `aris status`. */
  status() {
    return this.store.bots().map((b) => ({
      bot: b.bot,
      username: b.username,
      running: this.runtimes.has(b.bot),
      error: b.error ?? null,
    }))
  }

  api(bot: string): TelegramApi | undefined {
    return this.runtimes.get(bot)?.api
  }

  private newApi(token: string) {
    return new TelegramApi(token, this.d.fetchImpl)
  }

  /** Dán token: kiểm tra bằng getMe, chặn token đã gắn với bot aris khác, lưu vào kho khoá. */
  async connect(bot: string, token: string): Promise<BotRecord> {
    const api = this.newApi(token.trim())
    const me = await api.getMe()
    const taken = this.store.bots().find((b) => b.tgId === me.id && b.bot !== bot)
    if (taken) throw new Error(`token này là của @${me.username}, đã gắn với bot ${taken.bot}`)
    const ref = tokenRef(bot)
    await this.d.credentials.set(ref, token.trim())
    const cur = this.store.bot(bot)
    const rec: BotRecord = {
      bot,
      tgId: me.id,
      username: me.username ?? '',
      name: me.first_name,
      tokenRef: ref,
      canReadAll: !!me.can_read_all_group_messages,
      // Cùng tài khoản thì giữ vị trí đọc; tài khoản mới thì đọc từ đầu hàng chờ của Telegram.
      offset: cur?.tgId === me.id ? cur.offset : 0,
      voice: cur?.voice ?? false,
      ...(cur?.home && cur.tgId === me.id ? { home: cur.home } : {}),
      addedAt: new Date(this.now()).toISOString(),
    }
    await this.store.putBot(rec)
    this.stopBot(bot)
    await this.startBot(rec)
    return this.store.bot(bot)!
  }

  async disconnect(bot: string) {
    const rec = this.store.bot(bot)
    this.stopBot(bot)
    if (rec) await this.d.credentials.unset(rec.tokenRef)
    await this.store.removeBot(bot)
  }

  private stopBot(bot: string) {
    this.runtimes.get(bot)?.abort.abort()
    this.runtimes.delete(bot)
  }

  private async botError(bot: string, e: unknown) {
    this.d.logger.warn('aris-channels: bot %s: %s', bot, e instanceof Error ? e.message : String(e))
    await this.store.patchBot(bot, { error: e instanceof Error ? e.message : String(e) })
  }

  private async startBot(rec: BotRecord) {
    const token = await this.d.credentials.resolve(rec.tokenRef)
    if (!token) throw new Error('chưa có token trong kho khoá')
    const api = this.newApi(token)
    const me = await api.getMe()
    const prev: BotRecord = { ...(this.store.bot(rec.bot) ?? rec) }
    delete prev.error
    const cur: BotRecord = {
      ...prev,
      username: me.username ?? rec.username,
      name: me.first_name,
      canReadAll: !!me.can_read_all_group_messages,
    }
    await this.store.putBot(cur)
    await api
      .setMyCommands(
        // Menu lệnh của Telegram: chỉ các lệnh ai cũng dùng được (lệnh người dùng vẫn gõ được).
        [
          { command: 'new', description: 'Mở phiên mới' },
          { command: 'stop', description: 'Dừng việc đang làm' },
          { command: 'status', description: 'Phiên, model, trạng thái' },
          { command: 'help', description: 'Danh sách lệnh' },
        ],
      )
      .catch(() => undefined)
    const rt: BotRuntime = { rec: cur, api, abort: new AbortController() }
    this.runtimes.set(rec.bot, rt)
    void this.poll(rt)
  }

  // ======================================================================================
  // Nhận tin
  // ======================================================================================

  private async poll(rt: BotRuntime) {
    const { abort } = rt
    let backoff = 1000
    while (!abort.signal.aborted) {
      const rec = this.store.bot(rt.rec.bot)
      if (!rec) return
      try {
        const updates = await rt.api.getUpdates(rec.offset, 25, abort.signal)
        backoff = 1000
        for (const u of updates) {
          const inbox: InboxRecord = {
            id: `${rec.bot}-${u.update_id}`,
            bot: rec.bot,
            update: u,
            state: 'queued',
            receivedAt: this.now(),
          }
          // Ghi vào hàng đợi bền trước, rồi mới dời vị trí đọc: tắt máy giữa chừng không mất tin.
          await this.store.enqueue(inbox)
          await this.store.patchBot(rec.bot, { offset: u.update_id + 1 })
          this.route(inbox)
        }
      } catch (e) {
        if (abort.signal.aborted) return
        if (e instanceof TelegramError && (e.code === 401 || e.code === 409)) {
          await this.botError(
            rec.bot,
            e.code === 401
              ? 'token không còn hiệu lực (401)'
              : 'một nơi khác đang nhận tin bằng token này (409)',
          )
          this.runtimes.delete(rec.bot)
          return
        }
        this.d.logger.warn('aris-channels: getUpdates: %s', e instanceof Error ? e.message : String(e))
        await new Promise((r) => setTimeout(r, backoff))
        backoff = Math.min(backoff * 2, 30_000)
      }
    }
  }

  /** Xếp tin vào làn của cuộc trò chuyện: trong một cuộc thì nối tiếp, giữa các cuộc thì song song. */
  private route(inbox: InboxRecord, resumed = false) {
    const u = inbox.update as TgUpdate
    const rt = this.runtimes.get(inbox.bot)
    if (!rt) return
    const m = u.message ?? u.callback_query?.message
    const lane = m
      ? threadKey(rt.rec.tgId, m.chat.id, m.is_topic_message ? m.message_thread_id : undefined)
      : inbox.bot
    const prev = this.lanes.get(lane) ?? Promise.resolve()
    const next = prev
      .then(() => this.handle(rt, inbox, resumed))
      .catch((e: unknown) =>
        this.d.logger.warn('aris-channels: xử lý tin: %s', e instanceof Error ? e.stack : String(e)),
      )
    this.lanes.set(lane, next)
  }

  private async handle(rt: BotRuntime, inbox: InboxRecord, resumed: boolean) {
    const u = inbox.update as TgUpdate
    let keep = false
    try {
      if (u.callback_query) await this.onCallback(rt, u.callback_query)
      else if (u.my_chat_member) await this.onMembership(rt, u.my_chat_member)
      else if (u.message) keep = await this.onMessage(rt, inbox, u.message, resumed)
    } finally {
      // Tin đã vào agent thì giữ trong hàng đợi tới khi lượt trả lời xong.
      if (!keep) await this.store.doneInbox(inbox.id)
    }
  }

  /** Trả `true` khi tin đã vào agent (hàng đợi giữ tới khi trả lời xong). */
  private async onMessage(
    rt: BotRuntime,
    inbox: InboxRecord,
    m: TgMessage,
    resumed: boolean,
  ): Promise<boolean> {
    const api = rt.api
    const from = m.from
    if (!from) return false
    const text = (m.text ?? m.caption ?? '').trim()

    // Ghép đôi: nhắn đúng mã trong chat riêng.
    if (m.chat.type === 'private') {
      const person = await this.store.redeem(text, {
        id: from.id,
        name: fullName(from),
        username: from.username,
      })
      if (person) {
        const owner = person.role === 'owner'
        if (owner && !this.store.bot(rt.rec.bot)?.home)
          await this.store.patchBot(rt.rec.bot, { home: { chatId: m.chat.id } })
        await api.sendMessage(m.chat.id, T.paired(person.name, owner), { html: true })
        return false
      }
    }

    const me = { id: rt.rec.tgId, username: this.store.bot(rt.rec.bot)?.username ?? rt.rec.username }
    const d = decide(m, me, this.store)
    if (d.kind === 'ignore') return false
    if (d.kind === 'stranger') {
      if (await this.store.shouldNotifyStranger(from.id)) {
        this.strangers.set(from.id, { name: fullName(from), username: from.username })
        await this.toOwners(rt, T.stranger(fullName(from), from.username, from.id, text), [
          [
            { text: 'Cho phép hỏi đáp', callback_data: `pa:${from.id}` },
            { text: 'Bỏ qua', callback_data: `px:${from.id}` },
          ],
        ])
      }
      return false
    }
    if (d.kind === 'unknown-group') {
      const title = m.chat.title ?? String(m.chat.id)
      if (await this.store.shouldNotifyGroup(m.chat.id, title))
        await this.notifyGroup(rt, m.chat.id, T.unknownGroup(title, m.chat.id))
      return false
    }

    const topic = m.is_topic_message ? m.message_thread_id : undefined
    const key = threadKey(rt.rec.tgId, m.chat.id, topic)

    // Câu hỏi của bot đang chờ chữ trả lời ("Khác").
    const waiter = this.textWaiters.get(key)
    if (waiter && text && !d.command) {
      this.textWaiters.delete(key)
      waiter(text)
      return false
    }

    if (d.command) {
      if (!commandAllowed(d.command.name, d.trust)) {
        await this.reply(api, m, T.ownerOnly)
        return false
      }
      await this.command(rt, m, key, topic, d.trust, d.command.name, d.command.args)
      return false
    }
    return this.submit(rt, inbox, m, key, topic, d.trust, d.text, resumed)
  }

  private reply(api: TelegramApi, m: TgMessage, html: string, buttons?: InlineButton[][]) {
    return api.sendMessage(m.chat.id, html, {
      html: true,
      threadId: m.is_topic_message ? m.message_thread_id : undefined,
      replyTo: m.chat.type === 'private' ? undefined : m.message_id,
      buttons,
    })
  }

  private async toOwners(rt: BotRuntime, html: string, buttons?: InlineButton[][]) {
    for (const o of this.store.owners())
      await rt.api
        .sendMessage(o.userId, html, { html: true, buttons })
        .catch((e: unknown) =>
          this.d.logger.warn(
            'aris-channels: nhắn người dùng: %s',
            e instanceof Error ? e.message : String(e),
          ),
        )
  }

  private notifyGroup(rt: BotRuntime, chatId: number, html: string) {
    return this.toOwners(rt, html, [
      [
        { text: 'Cho phép nhóm', callback_data: `ga:${keyNum(chatId)}` },
        { text: 'Rời nhóm', callback_data: `gl:${keyNum(chatId)}` },
      ],
    ])
  }

  private async onMembership(rt: BotRuntime, u: TgChatMemberUpdated) {
    if (u.new_chat_member.user.id !== rt.rec.tgId) return
    if (u.chat.type !== 'group' && u.chat.type !== 'supergroup') return
    const joined = ['member', 'administrator'].includes(u.new_chat_member.status)
    const title = u.chat.title ?? String(u.chat.id)
    if (!joined) return
    const g = await this.store.upsertGroup(u.chat.id, { title })
    if (!g.allowed) await this.notifyGroup(rt, u.chat.id, T.addedToGroup(title, u.chat.id))
  }

  // ======================================================================================
  // Đưa tin vào phiên
  // ======================================================================================

  /** Phiên của cuộc trò chuyện; chưa có thì tạo trong workspace chat riêng. */
  async sessionFor(
    bot: string,
    key: string,
    chatId: number,
    topic: number | undefined,
    fresh = false,
  ): Promise<LiveAgent> {
    const t = this.store.thread(key)
    if (t && !fresh) {
      try {
        return await this.d.sessions.agent(t.sessionId)
      } catch (e) {
        this.d.logger.warn('aris-channels: mở lại phiên %s: %s, mở phiên mới', t.sessionId, String(e))
      }
    }
    const sessionId = await this.d.sessions.create()
    await this.store.bindThread({ key, bot, chatId, ...(topic ? { threadId: topic } : {}), sessionId })
    return this.d.sessions.agent(sessionId)
  }

  private async content(
    rt: BotRuntime,
    m: TgMessage,
    trust: Trust,
    text: string,
  ): Promise<unknown[] | undefined> {
    const parts: unknown[] = []
    let body = text
    const voice = m.voice ?? m.video_note
    if (voice) {
      try {
        const { data } = await rt.api.download(voice.file_id)
        const heard = await transcribe(this.d.stt, data, AbortSignal.timeout(120_000))
        body = [body, `${T.voiceNote} ${heard}`].filter(Boolean).join('\n')
      } catch (e) {
        await this.reply(
          rt.api,
          m,
          sttNotReady(e) ? T.voiceNotReady : T.voiceFail(e instanceof Error ? e.message : String(e)),
        )
        if (!body) return undefined
      }
    }
    const photo = m.photo?.at(-1)
    const doc = m.document ?? m.audio
    const file = photo ?? doc
    if (file) {
      if ((file.file_size ?? 0) > MAX_FILE) {
        await this.reply(rt.api, m, T.fileTooBig)
      } else if (this.d.attachments) {
        try {
          const { data, path } = await rt.api.download(file.file_id)
          const mime = photo ? 'image/jpeg' : ((doc as { mime_type?: string }).mime_type ?? '')
          const name = (doc as { file_name?: string } | undefined)?.file_name ?? path.split('/').pop()
          if (/^image\/(jpeg|png|gif|webp)$/.test(mime))
            parts.push({
              type: 'image',
              attachment: await this.d.attachments.saveImage({
                data,
                mediaType: mime,
                ...(name ? { name } : {}),
              }),
            })
          else
            parts.push({
              type: 'file',
              attachment: await this.d.attachments.saveFile({ data, ...(name ? { name } : {}) }),
            })
        } catch (e) {
          await this.reply(rt.api, m, T.fileFail(e instanceof Error ? e.message : String(e)))
        }
      }
    }
    if (!body && !parts.length) return undefined
    // Trong nhóm, bot cần biết ai đang nói; người không phải người dùng chính thì nhắc giới hạn quyền.
    const who =
      m.chat.type === 'private'
        ? ''
        : `[${m.from ? fullName(m.from) : '?'}${m.from?.username ? ` @${m.from.username}` : ''}] `
    const limit =
      trust === 'owner'
        ? ''
        : '\n(Người này không phải người dùng chính: chỉ trả lời câu hỏi, không làm việc có tác động như gửi tin, sửa tệp, chạy lệnh.)'
    if (body || who) parts.unshift({ type: 'text', text: `${who}${body || '(gửi tệp)'}${limit}` })
    return parts
  }

  private async submit(
    rt: BotRuntime,
    inbox: InboxRecord,
    m: TgMessage,
    key: string,
    topic: number | undefined,
    trust: Trust,
    text: string,
    resumed: boolean,
  ): Promise<boolean> {
    const content = await this.content(rt, m, trust, text)
    if (!content) return false
    if (resumed) await this.reply(rt.api, m, T.restarted)
    const agent = await this.sessionFor(rt.rec.bot, key, m.chat.id, topic)
    const group = m.chat.type !== 'private' ? this.store.group(m.chat.id) : undefined
    if (group?.prompt)
      agent.inject(
        this.d.sessions.notice(
          `Hướng dẫn riêng của nhóm "${group.title}":\n${group.prompt}`,
          'Lời nhắc riêng của nhóm',
        ),
      )
    const message = this.d.sessions.message(content)
    const pending: Pending = {
      messageId: message.id,
      inboxId: inbox.id,
      threadKey: key,
      bot: rt.rec.bot,
      chatId: m.chat.id,
      ...(topic ? { threadId: topic } : {}),
      tgMessageId: m.message_id,
      group: m.chat.type !== 'private',
      trust,
    }
    this.tracker.expect(pending)
    const busy = this.store.settings().busy
    if (agent.status === 'running' && busy === 'steer') agent.steer(message)
    else if (agent.status === 'running' && busy === 'interrupt') {
      agent.cancel({ kind: 'user' })
      agent.followup(message)
    } else agent.followup(message)
    await this.store.markInbox(inbox.id, 'running')
    void rt.api.setReaction(m.chat.id, m.message_id, '👀').catch(() => undefined)
    this.startTyping(agent.session.id, rt.api, m.chat.id, topic)
    return true
  }

  private startTyping(sessionId: string, api: TelegramApi, chatId: number, topic?: number) {
    if (this.typing.has(sessionId)) return
    const tick = () => void api.sendChatAction(chatId, 'typing', topic).catch(() => undefined)
    tick()
    this.typing.set(sessionId, setInterval(tick, 4500))
  }

  private stopTyping(sessionId: string) {
    const t = this.typing.get(sessionId)
    if (t) clearInterval(t)
    this.typing.delete(sessionId)
  }

  // ======================================================================================
  // Trả lời
  // ======================================================================================

  /** Sự kiện phiên của dsh (`session/event`). */
  onSessionEvent(sessionId: string, event: { type: string; data?: unknown }) {
    if (event.type === 'request/context') {
      const c = event.data as { provider: string; model: string }
      this.models.set(sessionId, `${c.provider} · ${c.model}`)
    }
    const r = this.tracker.onEvent(sessionId, event)
    if (r)
      void this.deliver(r).catch((e: unknown) =>
        this.d.logger.warn('aris-channels: giao trả lời: %s', String(e)),
      )
  }

  /** Khung chữ đang viết của agent (`agent/assistant-stream`): hiện dần bằng một tin xem trước. */
  onStream(
    sessionId: string,
    frame: { type: string; attemptId?: string; chunk?: { type: string; text?: string } },
  ) {
    const text = this.tracker.onStream(sessionId, frame)
    const target = this.tracker.active(sessionId).at(-1)
    if (text === undefined || !target || text.trim().length < 20) return
    const rt = this.runtimes.get(target.bot)
    if (!rt) return
    const p = this.previews.get(sessionId) ?? { chatId: target.chatId, last: 0, text: '' }
    p.text = text
    this.previews.set(sessionId, p)
    if (p.timer) return
    const wait = Math.max(0, p.last + PREVIEW_EVERY_MS - this.now())
    p.timer = setTimeout(() => {
      p.timer = undefined
      p.last = this.now()
      const body = `${preview(p.text)} ▌`
      const send = p.messageId
        ? rt.api.editMessageText(p.chatId, p.messageId, body)
        : rt.api
            .sendMessage(p.chatId, body, {
              silent: true,
              threadId: target.threadId,
              replyTo: target.group ? target.tgMessageId : undefined,
            })
            .then((msg) => void (p.messageId = msg.message_id))
      p.sending = send.catch(() => undefined)
    }, wait)
  }

  private async clearPreview(sessionId: string, bot: string) {
    const p = this.previews.get(sessionId)
    this.previews.delete(sessionId)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    // Tin xem trước có thể còn đang gửi lúc lượt xong: đợi có mã tin rồi mới xoá, không để sót.
    await p.sending
    if (p.messageId)
      await this.api(bot)
        ?.deleteMessage(p.chatId, p.messageId)
        .catch(() => undefined)
  }

  async deliver(r: TurnResult) {
    const last = r.ours.at(-1)!
    const first = r.ours[0]!
    this.stopTyping(r.sessionId)
    await this.clearPreview(r.sessionId, last.bot)
    // aris tắt giữa lượt: không báo lỗi, giữ tin trong hàng đợi vào để làm lại khi chạy lên (`recover`).
    if (r.reason.kind === 'interrupted') return
    const rt = this.runtimes.get(last.bot)
    for (const p of r.ours) await this.store.doneInbox(p.inboxId)
    const ok = r.reason.kind === 'completed'
    for (const p of r.ours)
      void rt?.api.setReaction(p.chatId, p.tgMessageId, ok ? '👍' : '😢').catch(() => undefined)
    let text = r.text
    if (!text) {
      if (r.reason.kind === 'aborted') text = T.stoppedTurn
      else if (!ok) text = T.failedTurn(r.reason.error?.message ?? r.reason.kind)
      else return
    }
    if (last.group && isSilent(text)) return
    const rec: OutboxRecord = {
      id: `${keyNum(last.chatId)}-${this.now()}-${randomId()}`,
      bot: last.bot,
      chatId: last.chatId,
      ...(last.threadId ? { threadId: last.threadId } : {}),
      ...(last.group ? { replyTo: first.tgMessageId } : {}),
      chunks: toTelegramHtml(text),
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: this.now(),
    }
    // Ghi hộp thư ra trước khi gửi: tắt máy lúc này thì lần sau gửi lại.
    await this.store.putOutbox(rec)
    await this.flush(rec)
    const bot = this.store.bot(last.bot)
    if (bot?.voice && !last.group && last.trust === 'owner' && rt)
      void textToVoice(text)
        .then((ogg) => rt.api.sendVoice(last.chatId, ogg, { threadId: last.threadId }))
        .catch((e: unknown) => this.d.logger.warn('aris-channels: giọng nói: %s', String(e)))
  }

  /** Gửi các phần còn lại của một câu trả lời; lỗi HTML thì gửi chữ thường. */
  async flush(rec: OutboxRecord, recovered = false) {
    const rt = this.runtimes.get(rec.bot)
    if (!rt) return
    let cur = rec
    try {
      for (let i = cur.sent; i < cur.chunks.length; i++) {
        cur = { ...cur, state: 'sending' }
        await this.store.putOutbox(cur)
        const html = recovered && i === cur.sent ? `${T.recovered}\n\n${cur.chunks[i]!}` : cur.chunks[i]!
        const opts = { threadId: cur.threadId, replyTo: i === 0 ? cur.replyTo : undefined }
        await rt.api.sendMessage(cur.chatId, html, { ...opts, html: true }).catch(async (e: unknown) => {
          if (e instanceof TelegramError && e.code === 400 && /parse|entit/i.test(e.description))
            return rt.api.sendMessage(
              cur.chatId,
              html
                .replace(/<[^>]+>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&'),
              opts,
            )
          throw e
        })
        cur = { ...cur, sent: i + 1 }
        await this.store.putOutbox(cur)
      }
      await this.store.doneOutbox(cur.id)
    } catch (e) {
      const next = { ...cur, state: 'pending' as const, attempts: cur.attempts + 1 }
      if (next.attempts >= 3) {
        this.d.logger.warn('aris-channels: bỏ câu trả lời sau 3 lần gửi lỗi: %s', String(e))
        await this.store.doneOutbox(cur.id)
        return
      }
      await this.store.putOutbox(next)
      setTimeout(() => void this.flush(next), 5000 * next.attempts)
    }
  }

  /** Sau khi khởi động lại: gửi nốt câu trả lời dở, làm tiếp tin chưa xong. */
  private async recover() {
    for (const rec of this.store.outbox()) {
      if (rec.attempts >= 3 || this.now() - rec.createdAt > 24 * 3_600_000) {
        await this.store.doneOutbox(rec.id)
        continue
      }
      await this.flush(rec, rec.state === 'sending')
    }
    for (const rec of this.store.inbox()) {
      if (!this.runtimes.has(rec.bot)) continue
      this.route(rec, rec.state === 'running')
    }
  }

  // ======================================================================================
  // Lệnh
  // ======================================================================================

  private async command(
    rt: BotRuntime,
    m: TgMessage,
    key: string,
    topic: number | undefined,
    trust: Trust,
    name: string,
    args: string,
  ) {
    const api = rt.api
    switch (name) {
      case 'start':
      case 'help':
        return this.reply(api, m, T.help(trust))
      case 'whoami':
        return this.reply(api, m, T.whoami(trust, m.from!.id, m.chat.id))
      case 'new':
        await this.sessionFor(rt.rec.bot, key, m.chat.id, topic, true)
        return this.reply(api, m, T.newSession)
      case 'stop': {
        const t = this.store.thread(key)
        const agent = t ? await this.d.sessions.agent(t.sessionId).catch(() => undefined) : undefined
        if (agent?.status !== 'running') return this.reply(api, m, T.nothingRunning)
        agent.cancel({ kind: 'user' })
        return this.reply(api, m, T.stopped)
      }
      case 'status': {
        const t = this.store.thread(key)
        if (!t) return this.reply(api, m, T.noSession)
        const agent = await this.d.sessions.agent(t.sessionId).catch(() => undefined)
        const titles = await this.d.sessions.titles([t.sessionId]).catch(() => new Map<string, string>())
        return this.reply(
          api,
          m,
          T.status({
            session: t.sessionId,
            title: titles.get(t.sessionId),
            model: this.models.get(t.sessionId),
            running: agent?.status === 'running',
            busy: T.busyLabel[this.store.settings().busy] ?? '',
          }),
        )
      }
      case 'model':
        return this.reply(
          api,
          m,
          T.modelPick(this.models.get(this.store.thread(key)?.sessionId ?? '')),
          await this.providerButtons(),
        )
      case 'sessions':
        return this.sessionsList(rt, m, key)
      case 'resume': {
        const n = Number(args)
        const ids = this.threadSessions(key)
        const target = Number.isInteger(n) ? ids[n - 1] : undefined
        if (!target) return this.reply(api, m, T.badIndex)
        return this.resume(rt, m, key, topic, target)
      }
      case 'sethome':
        await this.store.patchBot(rt.rec.bot, {
          home: { chatId: m.chat.id, ...(topic ? { threadId: topic } : {}) },
        })
        return this.reply(api, m, T.homeSet)
      case 'voice': {
        const on = args.trim().toLowerCase()
        if (on !== 'on' && on !== 'off') return this.reply(api, m, T.voiceUsage)
        await this.store.patchBot(rt.rec.bot, { voice: on === 'on' })
        return this.reply(api, m, T.voice(on === 'on'))
      }
      default:
        return this.reply(api, m, T.help(trust))
    }
  }

  private threadSessions(key: string): string[] {
    const t = this.store.thread(key)
    return t ? [t.sessionId, ...t.history] : []
  }

  private async sessionsList(rt: BotRuntime, m: TgMessage, key: string) {
    const ids = this.threadSessions(key).slice(0, 10)
    if (!ids.length) return this.reply(rt.api, m, T.noSession)
    const titles = await this.d.sessions.titles(ids).catch(() => new Map<string, string>())
    const buttons = ids.map((id, i) => [
      {
        text: `${i === 0 ? '● ' : ''}${i + 1}. ${(titles.get(id) ?? id).slice(0, 48)}`,
        callback_data: `ss:${i}`,
      },
    ])
    return this.reply(rt.api, m, T.sessions, buttons)
  }

  private async resume(
    rt: BotRuntime,
    m: TgMessage,
    key: string,
    topic: number | undefined,
    sessionId: string,
  ) {
    await this.store.bindThread({
      key,
      bot: rt.rec.bot,
      chatId: m.chat.id,
      ...(topic ? { threadId: topic } : {}),
      sessionId,
    })
    const titles = await this.d.sessions.titles([sessionId]).catch(() => new Map<string, string>())
    return this.reply(rt.api, m, T.resumed(titles.get(sessionId) ?? sessionId))
  }

  private async providerButtons(): Promise<InlineButton[][]> {
    const groups = await this.d.sessions.catalog()
    const rows: InlineButton[][] = []
    groups.forEach((g, i) => {
      const b = { text: `${g.name} (${g.models.length})`, callback_data: `md:p:${i}:0` }
      if (rows.at(-1)?.length === 1) rows.at(-1)!.push(b)
      else rows.push([b])
    })
    return rows
  }

  // ======================================================================================
  // Nút bấm
  // ======================================================================================

  private async onCallback(rt: BotRuntime, q: TgCallbackQuery) {
    const api = rt.api
    const data = q.data ?? ''
    const msg = q.message
    const isOwner = this.store.roleOf(q.from.id) === 'owner'
    const done = (text?: string) => api.answerCallback(q.id, text).catch(() => undefined)
    const [kind, a, b, c] = data.split(':')
    const ownerOnly = !['q'].includes(kind ?? '')
    if (ownerOnly && !isOwner) return done('Chỉ người dùng chính bấm được.')
    const edit = (html: string, buttons?: InlineButton[][]) =>
      msg
        ? api
            .editMessageText(msg.chat.id, msg.message_id, html, { html: true, buttons })
            .catch(() => undefined)
        : undefined
    const num = (s: string | undefined) => (s?.startsWith('n') ? -Number(s.slice(1)) : Number(s))

    switch (kind) {
      case 'ap': {
        const w = this.approvals.get(a ?? '')
        if (!w) return done('Yêu cầu này đã hết hạn.')
        this.approvals.delete(a!)
        w.resolve(b === 'y')
        await edit(`${msg?.text ? escapeHtml(msg.text) + '\n\n' : ''}${T.approvalDone(b === 'y')}`)
        return done()
      }
      case 'q': {
        const w = this.questions.get(`${a}:${b}`)
        if (!w) return done('Câu hỏi này đã đóng.')
        if (c === 'o') w.resolve({ other: true })
        else if (c === 'd') w.resolve({ done: true })
        else w.resolve({ option: Number(c) })
        return done()
      }
      case 'pa': {
        const id = Number(a)
        const s = this.strangers.get(id) ?? { name: String(id) }
        await this.store.t.people.put(`tg-${keyNum(id)}`, {
          userId: id,
          name: s.name,
          ...(s.username ? { username: s.username } : {}),
          role: 'member',
          pairedAt: new Date(this.now()).toISOString(),
        })
        await edit(T.strangerAllowed(s.name))
        await api.sendMessage(id, T.welcomeMember).catch(() => undefined)
        return done()
      }
      case 'px':
        await edit(T.strangerIgnored)
        return done()
      case 'ga': {
        const g = await this.store.upsertGroup(num(a), { allowed: true })
        await edit(T.groupAllowed(g.title))
        return done()
      }
      case 'gl': {
        const chatId = num(a)
        const title = this.store.group(chatId)?.title ?? String(chatId)
        await api.leaveChat(chatId).catch(() => undefined)
        await this.store.upsertGroup(chatId, { allowed: false })
        await edit(T.groupLeft(title))
        return done()
      }
      case 'md':
        await this.modelCallback(rt, q, a, Number(b), Number(c))
        return done()
      case 'ss': {
        if (!msg) return done()
        const key = threadKey(
          rt.rec.tgId,
          msg.chat.id,
          msg.is_topic_message ? msg.message_thread_id : undefined,
        )
        const target = this.threadSessions(key)[Number(a)]
        if (!target) return done('Không còn phiên này.')
        await this.store.bindThread({ key, bot: rt.rec.bot, chatId: msg.chat.id, sessionId: target })
        const titles = await this.d.sessions.titles([target]).catch(() => new Map<string, string>())
        await edit(T.resumed(titles.get(target) ?? target))
        return done()
      }
      default:
        return done()
    }
  }

  private async modelCallback(
    rt: BotRuntime,
    q: TgCallbackQuery,
    step: string | undefined,
    gi: number,
    x: number,
  ) {
    const msg = q.message
    if (!msg) return
    const groups = await this.d.sessions.catalog()
    const g = groups[gi]
    const edit = (html: string, buttons?: InlineButton[][]) =>
      rt.api
        .editMessageText(msg.chat.id, msg.message_id, html, { html: true, buttons })
        .catch(() => undefined)
    if (step === 'b' || !g) return edit(T.modelPick(), await this.providerButtons())
    if (step === 'p') {
      const page = x
      const models = g.models.slice(page * MODELS_PER_PAGE, (page + 1) * MODELS_PER_PAGE)
      const rows: InlineButton[][] = models.map((m, i) => [
        { text: (m.name || m.id).slice(0, 60), callback_data: `md:m:${gi}:${page * MODELS_PER_PAGE + i}` },
      ])
      const nav: InlineButton[] = [{ text: '‹ Nhà cung cấp', callback_data: 'md:b:0:0' }]
      if (page > 0) nav.push({ text: '« Trước', callback_data: `md:p:${gi}:${page - 1}` })
      if ((page + 1) * MODELS_PER_PAGE < g.models.length)
        nav.push({ text: 'Sau »', callback_data: `md:p:${gi}:${page + 1}` })
      rows.push(nav)
      return edit(T.modelList(g.name), rows)
    }
    if (step === 'm') {
      const model = g.models[x]
      if (!model) return
      const key = threadKey(
        rt.rec.tgId,
        msg.chat.id,
        msg.is_topic_message ? msg.message_thread_id : undefined,
      )
      try {
        const agent = await this.sessionFor(
          rt.rec.bot,
          key,
          msg.chat.id,
          msg.is_topic_message ? msg.message_thread_id : undefined,
        )
        await this.d.sessions.select(agent.session.id, g.id, model.id)
        this.models.set(agent.session.id, `${g.id} · ${model.id}`)
        return edit(T.modelSet(model.name || model.id))
      } catch (e) {
        return edit(T.modelFail(e instanceof Error ? e.message : String(e)))
      }
    }
  }

  // ======================================================================================
  // Duyệt và câu hỏi (chuỗi người trả lời của dsh)
  // ======================================================================================

  /** Lượt hiện tại của phiên có phải của kênh không; nếu có thì người gửi có quyền thấp nhất là gì. */
  private turnOf(sessionId: string): { last: Pending; trust: Trust } | undefined {
    const ours = this.tracker.active(sessionId)
    const last = ours.at(-1)
    if (!last) return undefined
    const rank = { owner: 2, member: 1, guest: 0 } as const
    const trust = ours.reduce<Trust>((t, p) => (rank[p.trust] < rank[t] ? p.trust : t), 'owner')
    return { last, trust }
  }

  /** `approval/request`: trả undefined khi phiên không thuộc kênh (để người trả lời khác lo). */
  async approve(
    sessionId: string,
    req: {
      toolName: string
      reason?: string | undefined
      displayReason?: Record<string, string> | undefined
      signal?: AbortSignal | undefined
    },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' | undefined> {
    const turn = this.turnOf(sessionId)
    if (!turn) return undefined
    const rt = this.runtimes.get(turn.last.bot)
    if (!rt) return 'unavailable'
    const { chatId, threadId, tgMessageId, group } = turn.last
    if (turn.trust !== 'owner') {
      await rt.api.sendMessage(chatId, T.approvalNotOwner(req.toolName), {
        html: true,
        threadId,
        replyTo: group ? tgMessageId : undefined,
      })
      return 'rejected'
    }
    const id = randomId()
    const reason = req.displayReason?.vi ?? req.reason ?? req.displayReason?.en
    const card = await rt.api.sendMessage(chatId, T.approval(req.toolName, reason), {
      html: true,
      threadId,
      buttons: [
        [
          { text: 'Cho phép một lần', callback_data: `ap:${id}:y` },
          { text: 'Từ chối', callback_data: `ap:${id}:n` },
        ],
      ],
    })
    const answer = await new Promise<boolean | 'timeout' | 'cancelled'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), APPROVAL_TIMEOUT_MS)
      this.approvals.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), owner: true, chatId })
      req.signal?.addEventListener('abort', () => (clearTimeout(timer), resolve('cancelled')), { once: true })
    })
    this.approvals.delete(id)
    if (answer === true) return 'allowed-once'
    if (answer === false) return 'rejected'
    await rt.api
      .editMessageText(
        chatId,
        card.message_id,
        `${T.approval(req.toolName, reason)}\n\n${answer === 'timeout' ? T.approvalExpired : T.stoppedTurn}`,
        { html: true },
      )
      .catch(() => undefined)
    return answer === 'timeout' ? 'unavailable' : 'cancelled'
  }

  /** `user-questions/request`: hỏi bằng nút; undefined khi phiên không thuộc kênh. */
  async ask(
    sessionId: string,
    req: {
      questions: {
        id: string
        question: string
        detail?: string
        header?: string
        options?: { label: string; description?: string }[]
        multiSelect?: boolean
      }[]
      signal?: AbortSignal | undefined
    },
  ): Promise<{ answers: { id: string; selected: string[]; custom?: string }[] } | undefined> {
    const turn = this.turnOf(sessionId)
    if (!turn) return undefined
    const rt = this.runtimes.get(turn.last.bot)
    if (!rt) return undefined
    const { chatId, threadId, threadKey: key } = turn.last
    const rid = randomId()
    const answers: { id: string; selected: string[]; custom?: string }[] = []
    const aborted = () => req.signal?.aborted === true
    for (const [qi, q] of req.questions.entries()) {
      const head = [
        q.header ? `<b>${escapeHtml(q.header)}</b>` : '',
        `❓ ${escapeHtml(q.question)}`,
        q.detail ? escapeHtml(q.detail) : '',
      ]
        .filter(Boolean)
        .join('\n')
      const options = q.options ?? []
      const selected = new Set<number>()
      const buttons = () => [
        ...options.map((o, i) => [
          {
            text: `${q.multiSelect ? (selected.has(i) ? '☑ ' : '☐ ') : ''}${o.label}`.slice(0, 64),
            callback_data: `q:${rid}:${qi}:${i}`,
          },
        ]),
        [{ text: T.askOther, callback_data: `q:${rid}:${qi}:o` }],
        ...(q.multiSelect ? [[{ text: T.askDone, callback_data: `q:${rid}:${qi}:d` }]] : []),
      ]
      const card = await rt.api.sendMessage(chatId, head, {
        html: true,
        threadId,
        buttons: options.length ? buttons() : undefined,
      })
      let custom: string | undefined
      if (!options.length) custom = await this.waitText(key, req.signal)
      else
        for (;;) {
          const pick = await new Promise<{ option?: number; other?: true; done?: true } | undefined>(
            (resolve) => {
              this.questions.set(`${rid}:${qi}`, { resolve, owner: false, chatId })
              req.signal?.addEventListener('abort', () => resolve(undefined), { once: true })
            },
          )
          this.questions.delete(`${rid}:${qi}`)
          if (!pick || aborted()) return undefined
          if (pick.other) {
            await rt.api.sendMessage(chatId, T.askTypeAnswer, { threadId })
            custom = await this.waitText(key, req.signal)
            break
          }
          if (pick.done) break
          if (pick.option === undefined) continue
          if (!q.multiSelect) {
            selected.add(pick.option)
            break
          }
          if (selected.has(pick.option)) selected.delete(pick.option)
          else selected.add(pick.option)
          await rt.api
            .editMessageText(chatId, card.message_id, head, { html: true, buttons: buttons() })
            .catch(() => undefined)
        }
      if (aborted()) return undefined
      const labels = [...selected].sort((x, y) => x - y).map((i) => options[i]!.label)
      answers.push({ id: q.id, selected: labels, ...(custom ? { custom } : {}) })
      await rt.api
        .editMessageText(
          chatId,
          card.message_id,
          `${head}\n\n${T.askAnswered([...labels, custom].filter(Boolean).join(', '))}`,
          { html: true },
        )
        .catch(() => undefined)
    }
    return { answers }
  }

  private waitText(key: string, signal?: AbortSignal): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.textWaiters.set(key, (t) => resolve(t))
      signal?.addEventListener('abort', () => (this.textWaiters.delete(key), resolve(undefined)), {
        once: true,
      })
    })
  }

  // ======================================================================================
  // Bot chủ động nhắn
  // ======================================================================================

  /** Gửi tới nơi nhận (`/sethome`) của bot; không có thì gửi người dùng. */
  async sendHome(bot: string, markdown: string): Promise<string> {
    const rt = this.runtimes.get(bot)
    if (!rt) return 'Bot chưa kết nối Telegram.'
    const home =
      this.store.bot(bot)?.home ??
      (this.store.owners()[0] ? { chatId: this.store.owners()[0]!.userId } : undefined)
    if (!home) return 'Chưa có nơi nhận: người dùng chưa ghép đôi hoặc chưa /sethome.'
    const rec: OutboxRecord = {
      id: `${keyNum(home.chatId)}-${this.now()}-${randomId()}`,
      bot,
      chatId: home.chatId,
      ...(home.threadId ? { threadId: home.threadId } : {}),
      chunks: toTelegramHtml(markdown),
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: this.now(),
    }
    await this.store.putOutbox(rec)
    await this.flush(rec)
    return 'Đã gửi.'
  }
}
