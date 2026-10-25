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
import {
  colorDot,
  escapeHtml,
  isSilent,
  nameTeam,
  preview,
  toTelegramHtml,
  type TeamName,
} from './telegram/format.js'
import type {
  InlineButton,
  TgCallbackQuery,
  TgChatMemberUpdated,
  TgMessage,
  TgUpdate,
} from './telegram/types.js'
import { TurnTracker, type Pending, type TurnPart, type TurnResult } from './tracker.js'

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
  /** Phiên mới cho tài khoản bot `bot` (mã bot của aris): phiên gắn với bot đó. */
  create(bot: string): Promise<string>
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

/** Một yêu cầu quyền của bot trong hộp duyệt chung (`@aris/commander`, `arisApprovals`). */
export interface ApprovalItem {
  id: string
  source: 'external' | 'member'
  bot: string
  name: string
  handle?: string | undefined
  kind: string
  target?: string | undefined
  tool?: string | undefined
  reason?: string | undefined
}

/** Hộp duyệt chung: nghe yêu cầu mới / đã xong, trả lời một yêu cầu. */
export interface ApprovalsPort {
  on(
    fn: (
      e:
        | { type: 'opened'; item: ApprovalItem }
        | { type: 'closed'; item: ApprovalItem; allow: boolean; by: string },
    ) => void,
  ): () => void
  answer(id: string, allow: boolean, by: 'telegram'): boolean
}

/** Một đề xuất ký ức chờ duyệt (`@aris/memory`, `arisMemory.proposals`). */
export interface ProposalItem {
  id: string
  /** Bot đề xuất (mã nội bộ). */
  bot: string
  text: string
  why?: string | undefined
}

/** Hàng đề xuất ký ức: nghe mở / đóng, trả lời (lưu, kèm câu sửa hay tầng lưu trữ; bỏ). */
export interface ProposalsPort {
  on(
    fn: (
      e:
        | { type: 'opened'; item: ProposalItem }
        | { type: 'closed'; item: ProposalItem; decision: 'saved' | 'discarded'; by: string },
    ) => void,
  ): () => void
  answer(
    id: string,
    decision: 'saved' | 'discarded',
    by: 'telegram',
    patch?: { text?: string; tier?: 'core' | 'archive' },
  ): Promise<unknown>
}

/** Một bản skill chờ duyệt (`@aris/skills`, `arisSkills`). */
export interface SkillItem {
  id: string
  bot: string
  name: string
  version: number
  why?: string | undefined
}

/** Lần chạy routine (`@aris/routine`) cho thẻ báo cáo 7.2: lấy lại nội dung khi bấm nút. */
export interface RoutinePort {
  card(
    sessionId: string,
  ): { title: string; bot: string; name: string; answer: string; suggestion?: string | undefined } | undefined
}

/** Mã nút thẻ routine: mã phiên bỏ tiền tố `session-` cho vừa 64 byte của Telegram. */
const routineKey = (sessionId: string) => sessionId.replace(/^session-/, '')

/** Hàng đề xuất skill: nghe mở / đóng, trả lời (bật / không), mã các bản đang chờ. */
export interface SkillsPort {
  on(
    fn: (
      e:
        | { type: 'opened'; version: SkillItem; patch: boolean }
        | { type: 'closed'; version: SkillItem; decision: 'approved' | 'rejected'; by: string },
    ) => void,
  ): () => void
  answer(id: string, approve: boolean, by: 'telegram'): Promise<unknown>
  pending(): string[]
}

/** Một bản nạp của bộ não (`@aris/brain`, `arisBrain`), dạng thẻ Telegram cần. */
export interface BrainCard {
  id: string
  status: string
  title: string
  kind: string
  from: string
  /** Bot Telegram nhận nguồn (khi `from` là `telegram`). */
  by?: string | undefined
  /** "Cá nhân" hay "Công ty · <phòng>". */
  place: string
  summary?: string | undefined
  level?: string | undefined
  note?: string | undefined
  ops: { title: string; kind: string; flag?: string | undefined }[]
  conflicts: number
}

/** Bộ não: gửi nguồn vào Hộp thư vào, ghi nhanh, duyệt; nghe bản nạp đổi trạng thái và lời nhắc. */
export interface BrainPort {
  on(
    fn: (
      e:
        | { type: 'status'; batch: BrainCard; prev?: string | undefined }
        | { type: 'remind'; batches: BrainCard[] },
    ) => void,
  ): () => void
  add(i: { text: string; by: string }): Promise<BrainCard>
  addFile(i: { name: string; data: Uint8Array; by: string }): Promise<BrainCard>
  note(text: string): Promise<string>
  approve(id: string): Promise<BrainCard>
  keep(id: string): Promise<BrainCard>
  get(id: string): BrainCard | undefined
  waiting(): BrainCard[]
}

/** Mã ngắn của một bản skill cho `callback_data` (Telegram giới hạn 64 byte). */
export function shortKey(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

const two = (n: number) => String(n).padStart(2, '0')
/** Giờ:phút theo giờ máy. */
export const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`
/** Độ dài ghi âm, dạng 1:42. */
export const minSec = (s: number) => `${Math.floor(s / 60)}:${two(Math.round(s % 60))}`

/** Chữ "lưu" đầu chú thích tệp (cả "luu", "Lưu vào bộ não"…). */
export const SAVE_WORD = /^\s*(lưu|luu)(\s|$|[.,:!])/iu
/** Tin trả lời chỉ gồm chữ "lưu" (hay "lưu vào bộ não"). */
export const SAVE_ONLY = /^\s*(lưu|luu)(\s+(vào|vao)\s+(bộ|bo)\s+(não|nao))?\s*[.!]?\s*$/iu

export const isForward = (m: TgMessage) =>
  !!(m.forward_origin ?? m.forward_date ?? m.forward_from ?? m.forward_from_chat)
export const hasFile = (m: TgMessage) => !!(m.voice ?? m.audio ?? m.document ?? m.photo?.length)

/** Nguồn của tin chuyển tiếp: người hay kênh gửi gốc. */
export function forwardOrigin(m: TgMessage): string | undefined {
  const o = m.forward_origin
  const user = o?.sender_user ?? m.forward_from
  const chat = o?.chat ?? o?.sender_chat ?? m.forward_from_chat
  return (
    (user ? fullName(user) : undefined) ??
    o?.sender_user_name ??
    m.forward_sender_name ??
    chat?.title ??
    chat?.username
  )
}

/** Chữ gửi vào bộ não: tin chuyển tiếp ghi thêm nguồn gốc (trừ khi chỉ là một link, để bộ não tải trang). */
export function withOrigin(text: string, m: TgMessage): string {
  const origin = isForward(m) ? forwardOrigin(m) : undefined
  if (!origin || /^https?:\/\/\S+$/.test(text)) return text
  return `${text}\n\n(Chuyển tiếp từ ${origin})`
}

/** Thẻ "BẢN NẠP" (bản vẽ 7.5): mức duyệt, tiêu đề, nơi và loại, các thay đổi, chỗ cần xem kỹ. */
export function brainCardHtml(c: BrainCard): string {
  const meta = [c.place, T.brainKind[c.kind] ?? c.kind, c.summary].filter(Boolean).join(' · ')
  const ops = c.ops.slice(0, 8).map((o) => `${T.brainOp[o.kind] ?? '✎'}: ${escapeHtml(o.title)}`)
  if (c.ops.length > 8) ops.push(`… và ${c.ops.length - 8} thay đổi khác`)
  const flags = c.ops
    .filter((o) => o.flag)
    .slice(0, 6)
    .map((o) => `⚠ ${escapeHtml(o.title)}: ${escapeHtml(o.flag!)}`)
  return [
    `📥 <b>BẢN NẠP · ${T.brainLevel[c.level ?? 'nhanh'] ?? ''}</b>`,
    `<b>${escapeHtml(c.title)}</b>`,
    escapeHtml(meta),
    ...(ops.length ? ['', ...ops] : ['', `<i>${T.brainEmpty}</i>`]),
    ...(flags.length ? ['', ...flags] : []),
    ...(c.level === 'ky' ? ['', `<i>${T.brainCareful}</i>`] : []),
  ].join('\n')
}

/** Câu báo khi bản nạp rời trạng thái chờ duyệt (sửa thẻ), hay báo tự nạp, lỗi, chờ mai. */
export function brainDone(c: BrainCard): string | undefined {
  switch (c.status) {
    case 'da-nap':
      return T.brainNapped(c.title, Math.max(0, c.ops.length - c.conflicts), c.place, c.conflicts)
    case 'chi-luu':
      return T.brainKept(c.title, c.place)
    case 'bo':
      return T.brainDropped(c.title)
    case 'moi':
    case 'dang-lap':
      return T.brainReplan(c.title)
    case 'loi':
      return T.brainError(c.title, c.note)
    case 'cho-mai':
      return T.brainTomorrow(c.title)
    default:
      return undefined
  }
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
  /** Bot trong đội: `@tên_gọi` trong tin gửi ra đổi thành chấm màu + tên. */
  team?: () => readonly TeamName[]
  /** Ảnh, video bot vừa tạo trong phiên (@aris/providers, đợt 5c): gửi kèm câu trả lời. */
  media?: () => MediaPort | undefined
}

export interface MediaPort {
  takeFresh(sessionId: string): { id: string; kind: 'image' | 'video'; model: string }[]
  read(
    id: string,
  ): Promise<{ rec: { kind: 'image' | 'video'; mime: string; path: string }; data: Uint8Array } | undefined>
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
  /** Thẻ duyệt tập trung đã gửi: mã yêu cầu → tin Telegram (để sửa khi yêu cầu xong). */
  private readonly cards = new Map<string, { bot: string; chatId: number; messageId: number; html: string }>()
  private proposalsPort: ProposalsPort | undefined
  private skillsPort: SkillsPort | undefined
  private routinePort: RoutinePort | undefined
  private brainPort: BrainPort | undefined
  /** Thẻ "BẢN NẠP" đang mở theo mã bản nạp. */
  private readonly brainCards = new Map<string, { bot: string; chatId: number; messageId: number }>()
  /** Tin chuyển tiếp đang chờ trả lời "Lưu vào bộ não?" theo mã tin. */
  private readonly forwards = new Map<number, TgMessage>()
  /** Thẻ "ĐỀ XUẤT SKILL" đang mở theo mã bản. */
  private readonly skillCards = new Map<
    string,
    { bot: string; chatId: number; messageId: number; html: string }
  >()
  /** Thẻ "GHI NHỚ" đang mở theo mã đề xuất. */
  private readonly memoryCards = new Map<
    string,
    { bot: string; chatId: number; messageId: number; html: string }
  >()
  private approvalsPort: ApprovalsPort | undefined
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
  /** Phiên là (hoặc từng là) phiên của một cuộc trò chuyện Telegram. */
  isChannelSession(sessionId: string): boolean {
    if (this.store.threadOfSession(sessionId)) return true
    for (const [, t] of this.store.threads()) if (t.history.includes(sessionId)) return true
    return false
  }

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
      if (u.callback_query) keep = (await this.onCallback(rt, u.callback_query, inbox)) === true
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

    // Gửi vào bộ não (bản vẽ 7.5), chỉ người dùng chính trong chat riêng: chuyển tiếp thì hỏi lại;
    // tệp, ảnh, ghi âm kèm chữ "lưu", hay trả lời "lưu" vào một tin, thì lưu luôn.
    if (d.trust === 'owner' && m.chat.type === 'private' && this.brainPort) {
      if (isForward(m)) {
        this.forwards.set(m.message_id, m)
        if (this.forwards.size > 50) this.forwards.delete(this.forwards.keys().next().value!)
        await api.sendMessage(m.chat.id, T.fwdAsk, {
          html: true,
          replyTo: m.message_id,
          buttons: [
            [
              { text: T.fwdSave, callback_data: `bf:${m.message_id}:y` },
              { text: T.fwdChat, callback_data: `bf:${m.message_id}:n` },
            ],
          ],
        })
        return false
      }
      const saveMedia = hasFile(m) && SAVE_WORD.test((m.caption ?? '').normalize('NFC'))
      const saveReply = !!m.reply_to_message && SAVE_ONLY.test(text.normalize('NFC'))
      if (saveMedia || saveReply) {
        await this.reply(api, m, await this.toBrain(rt, saveReply ? m.reply_to_message! : m))
        return false
      }
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
    const sessionId = await this.d.sessions.create(bot)
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
      const body = `${preview(this.named(p.text).replace(/\*\*/g, ''))} ▌`
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

  /** `@tên_gọi` của bot trong đội thành chấm màu + tên in đậm. */
  private named(md: string): string {
    try {
      return nameTeam(md, this.d.team?.() ?? [])
    } catch {
      return md
    }
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
    // Các đoạn theo người nói: chữ của bot của phiên gộp lại; câu trả lời chuyển giao là đoạn riêng.
    const segments: TurnPart[] = []
    for (const p of r.parts) {
      const prev = segments.at(-1)
      if (!p.from && prev && !prev.from) prev.text += `\n\n${p.text}`
      else segments.push({ ...p })
    }
    if (!segments.length) {
      if (r.reason.kind === 'aborted') segments.push({ text: T.stoppedTurn })
      else if (!ok) segments.push({ text: T.failedTurn(r.reason.error?.message ?? r.reason.kind) })
      else return
    }
    await this.sendMedia(r.sessionId, last)
    for (const seg of segments) {
      if (!seg.from) {
        if (last.group && isSilent(seg.text)) continue
        await this.send(last, first, seg.text, last.bot)
        const bot = this.store.bot(last.bot)
        if (bot?.voice && !last.group && last.trust === 'owner' && rt)
          void textToVoice(seg.text)
            .then((ogg) => rt.api.sendVoice(last.chatId, ogg, { threadId: last.threadId }))
            .catch((e: unknown) => this.d.logger.warn('aris-channels: giọng nói: %s', String(e)))
        continue
      }
      // Chuyển giao: lời của bot đích, mở đầu bằng tên thành viên. Bot đích có tài khoản Telegram riêng
      // thì trong nhóm chính tài khoản đó trả lời (gửi không được thì bot này gửi thay); trong chat
      // riêng thì kèm nút mở chat với bot đích.
      const own = this.runtimes.has(seg.from.bot) ? this.store.bot(seg.from.bot) : undefined
      const md = `@${seg.from.handle}${seg.from.role ? ` · ${seg.from.role}` : ''}\n\n${seg.text}`
      if (last.group && own) await this.send(last, first, md, seg.from.bot, undefined, last.bot)
      else
        await this.send(
          last,
          first,
          md,
          last.bot,
          own ? [[{ text: T.continueWith(seg.from.name), url: `https://t.me/${own.username}` }]] : undefined,
        )
    }
  }

  /** Ảnh, video bot tạo trong lượt: gửi trước câu trả lời (chú thích là tên model). */
  private async sendMedia(sessionId: string, last: Pending) {
    const port = this.d.media?.()
    const rt = this.runtimes.get(last.bot)
    if (!port || !rt) return
    for (const m of port.takeFresh(sessionId)) {
      const f = await port.read(m.id).catch(() => undefined)
      if (!f) continue
      const name = f.rec.path.split('/').pop() ?? 'tep'
      await rt.api
        .sendMedia(last.chatId, f.rec.kind, f.data, f.rec.mime, name, {
          threadId: last.threadId,
          caption: m.model,
        })
        .catch((e: unknown) => this.d.logger.warn('aris-channels: gửi %s: %s', f.rec.kind, String(e)))
    }
  }

  /** Một câu trả lời vào hộp thư ra rồi gửi (Markdown → HTML, `@tên_gọi` thành tên thành viên). */
  private async send(
    last: Pending,
    first: Pending,
    md: string,
    bot: string,
    buttons?: InlineButton[][],
    fallbackBot?: string,
  ) {
    const rec: OutboxRecord = {
      id: `${keyNum(last.chatId)}-${this.now()}-${randomId()}`,
      bot,
      chatId: last.chatId,
      ...(last.threadId ? { threadId: last.threadId } : {}),
      ...(last.group ? { replyTo: first.tgMessageId } : {}),
      chunks: toTelegramHtml(this.named(md)),
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: this.now(),
      ...(buttons ? { buttons } : {}),
      ...(fallbackBot ? { fallbackBot } : {}),
    }
    // Ghi hộp thư ra trước khi gửi: tắt máy lúc này thì lần sau gửi lại.
    await this.store.putOutbox(rec)
    await this.flush(rec)
  }

  /** Gửi các phần còn lại của một câu trả lời; lỗi HTML thì gửi chữ thường. */
  async flush(rec: OutboxRecord, recovered = false): Promise<void> {
    const rt = this.runtimes.get(rec.bot)
    if (!rt) return
    let cur = rec
    try {
      for (let i = cur.sent; i < cur.chunks.length; i++) {
        cur = { ...cur, state: 'sending' }
        await this.store.putOutbox(cur)
        const html = recovered && i === cur.sent ? `${T.recovered}\n\n${cur.chunks[i]!}` : cur.chunks[i]!
        const opts = {
          threadId: cur.threadId,
          replyTo: i === 0 ? cur.replyTo : undefined,
          buttons: i === cur.chunks.length - 1 ? (cur.buttons as InlineButton[][] | undefined) : undefined,
        }
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
      // Bot này không gửi được vào chat (chưa ở trong nhóm, bị chặn): bot dự phòng gửi phần còn lại.
      if (cur.fallbackBot && e instanceof TelegramError && (e.code === 403 || e.code === 400)) {
        await this.store.doneOutbox(cur.id)
        const moved: OutboxRecord = { ...cur, id: `${cur.id}-fb`, bot: cur.fallbackBot, state: 'pending' }
        delete moved.fallbackBot
        await this.store.putOutbox(moved)
        return this.flush(moved)
      }
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
      case 'note': {
        if (!this.brainPort) return this.reply(api, m, T.brainOff)
        const text = args.trim()
        if (!text) return this.reply(api, m, T.noteUsage)
        try {
          await this.brainPort.note(text)
        } catch (e) {
          return this.reply(api, m, T.brainFail(e instanceof Error ? e.message : String(e)))
        }
        return this.reply(api, m, T.noteDone(clock(new Date(this.now()))))
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

  /** Trả `true` khi nút đã đưa một tin vào agent (nút gợi ý của thẻ routine). */
  private async onCallback(rt: BotRuntime, q: TgCallbackQuery, inbox: InboxRecord): Promise<unknown> {
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
      case 'rt': {
        // Thẻ báo cáo routine: v = xem nốt, h = hỏi bot về báo cáo này, s = làm việc gợi ý.
        const sessionId = `session-${a ?? ''}`
        const card = this.routinePort?.card(sessionId)
        if (!card || !msg) return done(T.routineGone)
        const topic = msg.is_topic_message ? msg.message_thread_id : undefined
        if (b === 'v') {
          await done()
          for (const chunk of toTelegramHtml(this.named(card.answer)).slice(1))
            await api.sendMessage(msg.chat.id, chunk, { html: true, ...(topic ? { threadId: topic } : {}) })
          return
        }
        // Chat này chuyển sang phiên của lần chạy: hỏi tiếp đúng báo cáo đó.
        await this.store.bindThread({
          key: threadKey(rt.rec.tgId, msg.chat.id, topic),
          bot: rt.rec.bot,
          chatId: msg.chat.id,
          ...(topic ? { threadId: topic } : {}),
          sessionId,
        })
        if (b === 's' && card.suggestion) {
          await done()
          // Như người dùng tự gõ gợi ý: đi qua đúng đường nhận tin (quyền, hàng đợi, trả lời).
          return this.onMessage(
            rt,
            inbox,
            {
              message_id: msg.message_id,
              chat: msg.chat,
              date: msg.date,
              from: q.from,
              text: card.suggestion,
              ...(topic ? { message_thread_id: topic, is_topic_message: true } : {}),
            },
            false,
          )
        }
        await api.sendMessage(msg.chat.id, escapeHtml(T.routineAsking(card.name, card.title)), {
          html: true,
          ...(topic ? { threadId: topic } : {}),
        })
        return done()
      }
      case 'bf': {
        // "Lưu vào bộ não?" của tin chuyển tiếp: y = lưu, n = gửi cho bot như tin thường.
        const fm = this.forwards.get(Number(a))
        if (!fm) {
          await edit(T.fwdGone)
          return done()
        }
        this.forwards.delete(Number(a))
        await done()
        if (b === 'y') return edit(await this.toBrain(rt, fm))
        await edit(T.fwdAsked)
        const topic = fm.is_topic_message ? fm.message_thread_id : undefined
        const key = threadKey(rt.rec.tgId, fm.chat.id, topic)
        return this.submit(rt, inbox, fm, key, topic, 'owner', (fm.text ?? fm.caption ?? '').trim(), false)
      }
      case 'bn': {
        // Thẻ bản nạp: y = Đồng ý, k = Chỉ lưu, w = Xem trên web; "bn:list" = gửi lại các thẻ đang chờ.
        const port = this.brainPort
        if (!port) return done(T.brainOff)
        if (a === 'list') {
          await done()
          return this.sendWaitingCards()
        }
        if (b === 'w') return done(T.brainWebHint)
        // Thẻ bấm sau khi aris khởi động lại: ghi lại để sự kiện trạng thái sửa đúng thẻ này.
        if (msg && !this.brainCards.has(a ?? ''))
          this.brainCards.set(a ?? '', { bot: rt.rec.bot, chatId: msg.chat.id, messageId: msg.message_id })
        try {
          if (b === 'y') await port.approve(a ?? '')
          else if (b === 'k') await port.keep(a ?? '')
          return done()
        } catch (e) {
          // Đã xử lý nơi khác (trên web): thẻ báo trạng thái hiện tại, bỏ nút.
          const cur = port.get(a ?? '')
          const html = cur && cur.status !== 'cho-duyet' ? brainDone(cur) : undefined
          if (html) {
            this.brainCards.delete(a ?? '')
            await edit(html)
          }
          return done((e instanceof Error ? e.message : String(e)).slice(0, 190))
        }
      }
      case 'ax': {
        // Thẻ duyệt tập trung: trả lời về hộp chung; thẻ được sửa khi hộp báo yêu cầu đã xong.
        if (!this.approvalsPort?.answer(a ?? '', b === 'y', 'telegram')) {
          await edit(`${msg?.text ? escapeHtml(msg.text) + '\n\n' : ''}${T.centralGone}`)
          return done(T.centralGone)
        }
        return done()
      }
      case 'sx': {
        // Thẻ đề xuất skill: y = bật, n = không. Mã ngắn tìm lại trong các bản đang chờ.
        const port = this.skillsPort
        const id = port?.pending().find((v) => shortKey(v) === a)
        if (!port || !id) {
          await edit(`${msg?.text ? escapeHtml(msg.text) + '\n\n' : ''}${T.centralGone}`)
          return done(T.centralGone)
        }
        if (!this.skillCards.has(id) && msg)
          this.skillCards.set(id, {
            bot: rt.rec.bot,
            chatId: msg.chat.id,
            messageId: msg.message_id,
            html: escapeHtml(msg.text ?? ''),
          })
        await done()
        try {
          await port.answer(id, b === 'y', 'telegram')
        } catch (e) {
          await edit(
            `${msg?.text ? escapeHtml(msg.text) + '\n\n' : ''}⚠️ ${escapeHtml(e instanceof Error ? e.message : String(e))}`,
          )
        }
        return
      }
      case 'mm': {
        // Thẻ đề xuất ký ức: s = lưu, a = lưu vào lưu trữ (lõi đầy), e = sửa rồi lưu, d = bỏ.
        const port = this.proposalsPort
        // Thẻ gửi trước khi aris khởi động lại không còn trong bộ nhớ: dựng lại từ chính tin được bấm.
        let card = this.memoryCards.get(a ?? '')
        if (!card && msg) {
          card = {
            bot: rt.rec.bot,
            chatId: msg.chat.id,
            messageId: msg.message_id,
            html: escapeHtml(msg.text ?? ''),
          }
          this.memoryCards.set(a!, card)
        }
        if (!port || !card) return done(T.centralGone)
        if (b === 'e') {
          await done()
          const rt = this.runtimes.get(card.bot)
          if (!rt) return
          await rt.api.sendMessage(card.chatId, T.memoryTypeNew)
          const text = await this.waitText(
            threadKey(rt.rec.tgId, card.chatId),
            AbortSignal.timeout(30 * 60_000),
          )
          if (!text) return
          return void (await this.answerMemory(port, a!, 'saved', { text }))
        }
        await done()
        return void (await this.answerMemory(
          port,
          a!,
          b === 'd' ? 'discarded' : 'saved',
          b === 'a' ? { tier: 'archive' } : undefined,
        ))
      }
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

  /**
   * Duyệt tập trung (bản vẽ 7.1): yêu cầu quyền của bot (bot ngoài, bot trong đội) thành thẻ có nút
   * gửi tới chat chính của chủ nhân qua bot Aris; yêu cầu xong ở đâu (web, Telegram, hết hạn) thì sửa
   * thẻ, bỏ nút. Trả hàm gỡ.
   */
  watchApprovals(port: ApprovalsPort): () => void {
    this.approvalsPort = port
    const off = port.on((e) => {
      if (e.type === 'opened')
        void this.sendCard(e.item).catch((err: unknown) =>
          this.d.logger.warn('aris-channels: thẻ duyệt: %s', String(err)),
        )
      else void this.closeCard(e.item.id, e.allow, e.by)
    })
    return () => {
      off()
      this.approvalsPort = undefined
    }
  }

  /**
   * Đề xuất ký ức (giai đoạn 3): mỗi đề xuất một thẻ "GHI NHỚ" tới chat chính qua bot Aris (bản vẽ
   * 7.3); trả lời ở web hay hết hạn thì sửa thẻ, bỏ nút. Trả hàm gỡ.
   */
  watchProposals(port: ProposalsPort): () => void {
    this.proposalsPort = port
    const off = port.on((e) => {
      if (e.type === 'opened')
        void this.sendMemoryCard(e.item).catch((err: unknown) =>
          this.d.logger.warn('aris-channels: thẻ ghi nhớ: %s', String(err)),
        )
      else void this.closeMemoryCard(e.item, e.decision, e.by)
    })
    return () => {
      off()
      this.proposalsPort = undefined
    }
  }

  private async sendMemoryCard(item: ProposalItem) {
    const bot = this.store.bot('aris') ? 'aris' : [...this.runtimes.keys()][0]
    const rt = bot ? this.runtimes.get(bot) : undefined
    const chatId = (bot ? this.store.bot(bot)?.home?.chatId : undefined) ?? this.store.owners()[0]?.userId
    if (!rt || !bot || chatId === undefined) return
    const who = this.d.team?.().find((m) => m.id === item.bot)
    const html = T.memoryCard(
      `${colorDot(who?.color)} <b>${escapeHtml(who?.name ?? item.bot)}</b>`,
      item.text,
      item.why,
    )
    const msg = await rt.api.sendMessage(chatId, html, { html: true, buttons: this.memoryButtons(item.id) })
    this.memoryCards.set(item.id, { bot, chatId, messageId: msg.message_id, html })
  }

  /** Đề xuất skill (giai đoạn 3, đợt 3): thẻ "ĐỀ XUẤT SKILL" có nút Bật / Không (bản vẽ 7.3). Trả hàm gỡ. */
  watchRoutine(port: RoutinePort): () => void {
    this.routinePort = port
    return () => {
      this.routinePort = undefined
    }
  }

  /**
   * Thẻ báo cáo routine (7.2) ở nơi nhận của bot: tên, giờ chạy, nội dung (dài thì phần đầu và nút
   * "Xem chi tiết"), nút "Hỏi <bot>" và nút gợi ý. Không có phiên (chế độ script) thì không có nút hỏi.
   */
  async sendRoutine(
    bot: string,
    r: {
      title: string
      /** Tên bot làm việc. */
      worker: string
      /** Gửi qua Telegram của bot khác (Aris): ghi tên bot làm việc ở dòng đầu. */
      relay: boolean
      at: Date
      answer: string
      sessionId?: string | undefined
      suggestion?: string | undefined
    },
  ): Promise<string> {
    const rt = this.runtimes.get(bot)
    if (!rt) return 'Bot chưa kết nối Telegram.'
    const home =
      this.store.bot(bot)?.home ??
      (this.store.owners()[0] ? { chatId: this.store.owners()[0]!.userId } : undefined)
    if (!home) return 'Chưa có nơi nhận: người dùng chưa ghép đôi hoặc chưa /sethome.'
    const chunks = toTelegramHtml(this.named(r.answer))
    const head = `<b>ROUTINE · ${escapeHtml(r.title)}</b>${r.relay ? ` · ${escapeHtml(r.worker)}` : ''}\n<i>${escapeHtml(T.routineAt(r.at))}</i>\n\n`
    const key = r.sessionId ? routineKey(r.sessionId) : undefined
    const row: InlineButton[] = []
    if (key && chunks.length > 1) row.push({ text: T.routineMore, callback_data: `rt:${key}:v` })
    if (key) row.push({ text: T.routineAsk(r.worker), callback_data: `rt:${key}:h` })
    const buttons: InlineButton[][] = [
      ...(row.length ? [row] : []),
      ...(key && r.suggestion ? [[{ text: r.suggestion.slice(0, 60), callback_data: `rt:${key}:s` }]] : []),
    ]
    await rt.api.sendMessage(home.chatId, head + (chunks[0] ?? ''), {
      html: true,
      ...(home.threadId ? { threadId: home.threadId } : {}),
      ...(buttons.length ? { buttons } : {}),
    })
    return 'Đã gửi.'
  }

  watchSkills(port: SkillsPort): () => void {
    this.skillsPort = port
    const off = port.on((e) => {
      if (e.type === 'opened')
        void this.sendSkillCard(e.version, e.patch).catch((err: unknown) =>
          this.d.logger.warn('aris-channels: thẻ đề xuất skill: %s', String(err)),
        )
      else void this.closeSkillCard(e.version, e.decision, e.by)
    })
    return () => {
      off()
      this.skillsPort = undefined
    }
  }

  private async sendSkillCard(v: SkillItem, patch: boolean) {
    const bot = this.store.bot('aris') ? 'aris' : [...this.runtimes.keys()][0]
    const rt = bot ? this.runtimes.get(bot) : undefined
    const chatId = (bot ? this.store.bot(bot)?.home?.chatId : undefined) ?? this.store.owners()[0]?.userId
    if (!rt || !bot || chatId === undefined) return
    const who = this.d.team?.().find((m) => m.id === v.bot)
    const html = T.skillCard(
      `${colorDot(who?.color)} <b>${escapeHtml(who?.name ?? v.bot)}</b>`,
      v.name,
      v.version,
      patch,
      v.why,
    )
    const key = shortKey(v.id)
    const msg = await rt.api.sendMessage(chatId, html, {
      html: true,
      buttons: [
        [
          { text: `Bật v${v.version}`, callback_data: `sx:${key}:y` },
          { text: 'Không', callback_data: `sx:${key}:n` },
        ],
      ],
    })
    this.skillCards.set(v.id, { bot, chatId, messageId: msg.message_id, html })
  }

  private async closeSkillCard(v: SkillItem, decision: 'approved' | 'rejected', by: string) {
    const card = this.skillCards.get(v.id)
    if (!card) return
    this.skillCards.delete(v.id)
    await this.runtimes
      .get(card.bot)
      ?.api.editMessageText(
        card.chatId,
        card.messageId,
        `${card.html}\n\n${T.skillDone(decision, by, v.version)}`,
        {
          html: true,
        },
      )
      .catch(() => undefined)
  }

  /**
   * Bộ não (giai đoạn 5, bản vẽ 7.5): thẻ "BẢN NẠP" cho nguồn gửi từ Telegram khi Thủ thư lập xong,
   * sửa thẻ khi bản nạp xong ở đâu cũng vậy, báo tự nạp và lỗi, nhắc bản chờ quá 7 ngày. Trả hàm gỡ.
   */
  watchBrain(port: BrainPort): () => void {
    this.brainPort = port
    const off = port.on((e) => {
      void this.onBrain(e).catch((err: unknown) =>
        this.d.logger.warn('aris-channels: thẻ bản nạp: %s', String(err)),
      )
    })
    return () => {
      off()
      this.brainPort = undefined
    }
  }

  private async onBrain(
    e:
      | { type: 'status'; batch: BrainCard; prev?: string | undefined }
      | { type: 'remind'; batches: BrainCard[] },
  ) {
    if (e.type === 'remind') {
      const to = this.brainTarget()
      if (!to) return
      await to.rt.api.sendMessage(to.chatId, T.brainRemind(e.batches.length), {
        html: true,
        buttons: [[{ text: T.brainList, callback_data: 'bn:list' }]],
      })
      return
    }
    const c = e.batch
    const open = this.brainCards.get(c.id)
    if (open && c.status !== 'cho-duyet') {
      this.brainCards.delete(c.id)
      await this.runtimes
        .get(open.bot)
        ?.api.editMessageText(open.chatId, open.messageId, brainDone(c) ?? brainCardHtml(c), { html: true })
        .catch(() => undefined)
      return
    }
    if (c.from !== 'telegram') return
    // Tự nạp thì ghép ngay sau đó: không gửi thẻ, chỉ báo đã nạp.
    if (c.status === 'cho-duyet' && !(c.level === 'tu-nap' && c.ops.length)) return this.sendBrainCard(c)
    if (c.status === 'da-nap' || c.status === 'loi' || c.status === 'cho-mai') {
      const to = this.brainTarget(c)
      const html = brainDone(c)
      if (to && html) await to.rt.api.sendMessage(to.chatId, html, { html: true })
    }
  }

  /** Nơi gửi thẻ bộ não: bot nhận nguồn (hay Aris), chat riêng với người dùng chính. */
  private brainTarget(c?: BrainCard): { bot: string; rt: BotRuntime; chatId: number } | undefined {
    const bot =
      c?.by && this.runtimes.has(c.by) ? c.by : this.store.bot('aris') ? 'aris' : [...this.runtimes.keys()][0]
    const rt = bot ? this.runtimes.get(bot) : undefined
    const chatId = this.store.owners()[0]?.userId ?? (bot ? this.store.bot(bot)?.home?.chatId : undefined)
    return rt && bot && chatId !== undefined ? { bot, rt, chatId } : undefined
  }

  private async sendBrainCard(c: BrainCard) {
    const to = this.brainTarget(c)
    if (!to) return
    const web = { text: T.brainWeb, callback_data: `bn:${c.id}:w` }
    const keep = { text: T.brainKeep, callback_data: `bn:${c.id}:k` }
    const row =
      c.level === 'ky' || !c.ops.length
        ? [web, keep]
        : [{ text: T.brainApprove, callback_data: `bn:${c.id}:y` }, web, keep]
    const msg = await to.rt.api.sendMessage(to.chatId, brainCardHtml(c), { html: true, buttons: [row] })
    this.brainCards.set(c.id, { bot: to.bot, chatId: to.chatId, messageId: msg.message_id })
  }

  private async sendWaitingCards() {
    const list = this.brainPort?.waiting() ?? []
    if (!list.length) {
      const to = this.brainTarget()
      if (to) await to.rt.api.sendMessage(to.chatId, T.brainNone, { html: true })
      return
    }
    for (const c of list.slice(0, 10)) await this.sendBrainCard(c)
  }

  /** Gửi một tin (chữ, link, ghi âm, ảnh, tệp) vào Hộp thư vào của bộ não; trả câu báo (HTML). */
  private async toBrain(rt: BotRuntime, m: TgMessage): Promise<string> {
    const port = this.brainPort
    if (!port) return T.brainOff
    const at = new Date(m.date * 1000)
    const stamp = clock(at).replace(':', '')
    const file = m.voice ?? m.audio ?? m.document ?? m.photo?.at(-1)
    try {
      if (!file) {
        const card = await port.add({
          text: withOrigin((m.text ?? m.caption ?? '').trim(), m),
          by: rt.rec.bot,
        })
        return T.brainQueued(card.title)
      }
      if ((file.file_size ?? 0) > MAX_FILE) return T.fileTooBig
      const { data, path } = await rt.api.download(file.file_id)
      const ext = /\.[a-z0-9]+$/i.exec(path)?.[0] ?? ''
      const named = (file as { file_name?: string }).file_name
      const name = m.voice
        ? `ghi-am-${stamp}${ext || '.ogg'}`
        : m.photo
          ? `anh-${stamp}${ext || '.jpg'}`
          : (named ?? `tep-${stamp}${ext}`)
      const label = m.voice ? `ghi âm ${minSec(m.voice.duration)}` : m.photo ? `ảnh ${clock(at)}` : name
      const card = await port.addFile({ name, data, by: rt.rec.bot })
      return card.status === 'chua-doc' ? T.brainUnreadable(label) : T.brainQueued(label)
    } catch (e) {
      return T.brainFail(e instanceof Error ? e.message : String(e))
    }
  }

  private memoryButtons(id: string, full = false): InlineButton[][] {
    return [
      full
        ? [
            { text: 'Lưu vào lưu trữ', callback_data: `mm:${id}:a` },
            { text: 'Bỏ', callback_data: `mm:${id}:d` },
          ]
        : [
            { text: 'Lưu', callback_data: `mm:${id}:s` },
            { text: 'Sửa', callback_data: `mm:${id}:e` },
            { text: 'Bỏ', callback_data: `mm:${id}:d` },
          ],
    ]
  }

  /** Trả lời đề xuất từ Telegram; lõi đầy thì đổi nút thành "Lưu vào lưu trữ". */
  private async answerMemory(
    port: ProposalsPort,
    id: string,
    decision: 'saved' | 'discarded',
    patch?: { text?: string; tier?: 'core' | 'archive' },
  ) {
    try {
      await port.answer(id, decision, 'telegram', patch)
    } catch (e) {
      const card = this.memoryCards.get(id)
      const rt = card ? this.runtimes.get(card.bot) : undefined
      if (!card || !rt) return
      const message = e instanceof Error ? e.message : String(e)
      // Đề xuất đã được trả lời nơi khác hay đã hết hạn: báo trên thẻ, bỏ nút.
      const full = /trần|đầy/i.test(message)
      await rt.api
        .editMessageText(card.chatId, card.messageId, `${card.html}\n\n⚠️ ${escapeHtml(message)}`, {
          html: true,
          buttons: full ? this.memoryButtons(id, true) : undefined,
        })
        .catch(() => undefined)
      if (!full) this.memoryCards.delete(id)
    }
  }

  private async closeMemoryCard(item: ProposalItem, decision: 'saved' | 'discarded', by: string) {
    const card = this.memoryCards.get(item.id)
    if (!card) return
    this.memoryCards.delete(item.id)
    await this.runtimes
      .get(card.bot)
      ?.api.editMessageText(
        card.chatId,
        card.messageId,
        `${card.html}\n\n${T.memoryDone(decision, by, item.text)}`,
        { html: true },
      )
      .catch(() => undefined)
  }

  private async sendCard(item: ApprovalItem) {
    const bot = this.store.bot('aris') ? 'aris' : [...this.runtimes.keys()][0]
    const rt = bot ? this.runtimes.get(bot) : undefined
    const chatId = (bot ? this.store.bot(bot)?.home?.chatId : undefined) ?? this.store.owners()[0]?.userId
    if (!rt || !bot || chatId === undefined) return
    const team = this.d.team?.() ?? []
    const color = team.find((m) => m.handle === item.handle)?.color
    const who = `${colorDot(color)} <b>${escapeHtml(item.name)}</b>`
    const action = T.stepAction[item.kind] ?? T.stepOther(item.tool ?? item.kind)
    const html = T.centralCard(who, action, item.target, item.reason, item.source === 'external')
    const msg = await rt.api.sendMessage(chatId, html, {
      html: true,
      buttons: [
        [
          { text: 'Cho phép', callback_data: `ax:${item.id}:y` },
          { text: 'Từ chối', callback_data: `ax:${item.id}:n` },
        ],
      ],
    })
    this.cards.set(item.id, { bot, chatId, messageId: msg.message_id, html })
  }

  private async closeCard(id: string, allow: boolean, by: string) {
    const card = this.cards.get(id)
    if (!card) return
    this.cards.delete(id)
    await this.runtimes
      .get(card.bot)
      ?.api.editMessageText(card.chatId, card.messageId, `${card.html}\n\n${T.centralDone(allow, by)}`, {
        html: true,
      })
      .catch(() => undefined)
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
    return this.approvalCard(rt, chatId, threadId, req)
  }

  /**
   * Hỏi duyệt ở nơi nhận của bot (`/sethome`, không có thì chat với người dùng): cho phiên chạy
   * không người trông (routine). Bot chưa nối Telegram hay chưa có nơi nhận thì `unavailable`.
   */
  async approveHome(
    bot: string,
    req: {
      toolName: string
      reason?: string | undefined
      displayReason?: Record<string, string> | undefined
      signal?: AbortSignal | undefined
    },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'> {
    const rt = this.runtimes.get(bot)
    const home =
      this.store.bot(bot)?.home ??
      (this.store.owners()[0] ? { chatId: this.store.owners()[0]!.userId } : undefined)
    if (!rt || !home) return 'unavailable'
    return this.approvalCard(rt, home.chatId, home.threadId, req)
  }

  private async approvalCard(
    rt: NonNullable<ReturnType<typeof this.runtimes.get>>,
    chatId: number,
    threadId: number | undefined,
    req: {
      toolName: string
      reason?: string | undefined
      displayReason?: Record<string, string> | undefined
      signal?: AbortSignal | undefined
    },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'> {
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
      chunks: toTelegramHtml(this.named(markdown)),
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
