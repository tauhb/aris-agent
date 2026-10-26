/**
 * Kho kênh: bọc các bảng của domain `aris_channels` bằng các thao tác có nghĩa (ghép đôi,
 * cho phép nhóm, gắn phiên…). Đọc đồng bộ từ bộ nhớ, ghi bền qua backend của dsh.
 */
import { randomInt } from 'node:crypto'
import type { AccessState, GroupRule, Role } from './access.js'
import type {
  BotRecord,
  ChannelKind,
  CodeRecord,
  GroupRecord,
  InboxRecord,
  OutboxRecord,
  PersonRecord,
  SettingsRecord,
  ThreadRecord,
} from './domain.js'

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface Tables {
  bots: Table<BotRecord>
  people: Table<PersonRecord>
  groups: Table<GroupRecord>
  codes: Table<CodeRecord>
  threads: Table<ThreadRecord>
  inbox: Table<InboxRecord>
  outbox: Table<OutboxRecord>
  settings: Table<SettingsRecord>
}

/** Số Telegram → phần khoá hợp lệ của storage dsh (số âm thành `n<số>`). */
export const keyNum = (n: number) => (n < 0 ? `n${-n}` : String(n))

/**
 * Mã của Lark (`open_id` dạng `ou_…`, `chat_id` dạng `oc_…`) → phần khoá hợp lệ của storage dsh (chỉ chữ, số và `-`).
 * Bản ghi giữ mã gốc trong trường riêng (`openId`, `chatRef`), nên khoá không cần đảo ngược được.
 */
export const larkKey = (id: string) => id.replace(/[^A-Za-z0-9]+/g, '-')

/** Khoá cuộc trò chuyện Lark: gồm mã bot của aris và `chat_id`, nên hai bot không dùng chung phiên. */
export const larkThreadKey = (bot: string, chatId: string) => `lk-${bot}-${larkKey(chatId)}`

/** Khoá cuộc trò chuyện: có mã tài khoản bot nên hai bot không dùng chung phiên. */
export function threadKey(tgBotId: number, chatId: number, threadId?: number): string {
  return `tg-${keyNum(tgBotId)}-${keyNum(chatId)}${threadId ? `-t${threadId}` : ''}`
}

/** Mã ghép đôi: 8 ký tự dễ đọc (bỏ 0/O, 1/I/L), dạng `4KX7-29QM`. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_TTL_MS = 10 * 60_000
/** Nhắn sai mã ghép đôi quá bấy nhiêu lần trong một giờ thì khoá chat đó tới hết giờ (đợt 7f, S18). */
export const CODE_MAX_WRONG = 5
export const CODE_LOCK_MS = 3_600_000
/** Người lạ đã báo quá bấy nhiêu ngày thì xoá khỏi bảng `strangers`. */
export const STRANGER_KEEP_MS = 30 * 86_400_000

export function newCode(): string {
  const s = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Chuẩn hoá mã người dùng gõ ("4kx7 29qm" → "4KX7-29QM"); không giống mã thì undefined. */
export function normalizeCode(text: string): string | undefined {
  const s = text.toUpperCase().replace(/[\s-]/g, '')
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return undefined
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

const DEFAULT_SETTINGS: SettingsRecord = { busy: 'steer', guestMode: false, strangers: {} }

export class ChannelStore implements AccessState {
  /** Số lần nhắn sai mã ghép đôi theo người gửi (trong bộ nhớ: khởi động lại thì tính lại). */
  private readonly wrongCodes = new Map<number | string, { n: number; since: number }>()

  constructor(
    readonly t: Tables,
    private readonly now: () => number = Date.now,
  ) {}

  // --- Cài đặt chung ---------------------------------------------------------------
  settings(): SettingsRecord {
    return this.t.settings.get('main') ?? DEFAULT_SETTINGS
  }
  async updateSettings(patch: Partial<SettingsRecord>): Promise<SettingsRecord> {
    const next = { ...this.settings(), ...patch }
    await this.t.settings.put('main', next)
    return next
  }
  get guestMode() {
    return this.settings().guestMode
  }

  // --- Người -------------------------------------------------------------------------
  roleOf(userId: number): Role | undefined {
    return this.t.people.get(`tg-${keyNum(userId)}`)?.role
  }
  /** Người đã ghép đôi trên Telegram (người trên Lark nằm ở `larkPeople`). */
  people(): PersonRecord[] {
    return [...this.t.people.entries()]
      .map(([, p]) => p)
      .filter((p) => p.channel !== 'lark')
      .sort((a, b) => a.pairedAt.localeCompare(b.pairedAt))
  }
  owners(): PersonRecord[] {
    return this.people().filter((p) => p.role === 'owner')
  }
  async revoke(userId: number) {
    return this.t.people.delete(`tg-${keyNum(userId)}`)
  }
  /** Người đã ghép đôi trên Lark. */
  larkPeople(): PersonRecord[] {
    return [...this.t.people.entries()]
      .map(([, p]) => p)
      .filter((p) => p.channel === 'lark')
      .sort((a, b) => a.pairedAt.localeCompare(b.pairedAt))
  }
  larkOwners(): PersonRecord[] {
    return this.larkPeople().filter((p) => p.role === 'owner')
  }
  larkRoleOf(openId: string): Role | undefined {
    return this.t.people.get(`lk-${larkKey(openId)}`)?.role
  }
  async revokeLark(openId: string) {
    return this.t.people.delete(`lk-${larkKey(openId)}`)
  }

  // --- Mã ghép đôi ----------------------------------------------------------------------
  async createCode(role: Role, channel: ChannelKind = 'telegram'): Promise<CodeRecord> {
    await this.pruneCodes()
    const rec: CodeRecord = { code: newCode(), role, expiresAt: this.now() + CODE_TTL_MS, channel }
    await this.t.codes.put(rec.code.replace('-', ''), rec)
    return rec
  }
  /** Mã đang hiệu lực; mã cũ chưa ghi kênh được điền `telegram`. */
  activeCodes(): CodeRecord[] {
    const now = this.now()
    return [...this.t.codes.entries()]
      .map(([, c]): CodeRecord => ({ ...c, channel: c.channel ?? 'telegram' }))
      .filter((c) => c.expiresAt > now)
  }
  private async pruneCodes() {
    const now = this.now()
    for (const [k, c] of [...this.t.codes.entries()]) if (c.expiresAt <= now) await this.t.codes.delete(k)
  }
  /** Chat này đang bị khoá thử mã ghép đôi (đã sai `CODE_MAX_WRONG` lần trong giờ qua). */
  pairLocked(userId: number | string): boolean {
    const w = this.wrongCodes.get(userId)
    if (!w) return false
    if (this.now() - w.since >= CODE_LOCK_MS) {
      this.wrongCodes.delete(userId)
      return false
    }
    return w.n >= CODE_MAX_WRONG
  }
  private noteWrongCode(userId: number | string) {
    const w = this.wrongCodes.get(userId)
    if (!w || this.now() - w.since >= CODE_LOCK_MS) this.wrongCodes.set(userId, { n: 1, since: this.now() })
    else w.n++
  }
  /**
   * Kiểm một mã người ta nhắn và dùng nó (mã dùng một lần). `lockKey` là người gửi để đếm nhập sai.
   * Trả bản ghi mã khi dùng được, `'other-channel'` khi mã của kênh khác (không xoá mã, không tính là nhập
   * sai), `undefined` khi không giống mã, sai hay hết hạn hay người gửi đang bị khoá.
   */
  private async takeCode(
    text: string,
    lockKey: number | string,
    channel: ChannelKind,
  ): Promise<CodeRecord | 'other-channel' | undefined> {
    const code = normalizeCode(text)
    if (!code) return undefined
    // Thử sai nhiều lần thì khoá chat tới hết giờ, kể cả khi sau đó gõ đúng (chống dò mã).
    if (this.pairLocked(lockKey)) return undefined
    const key = code.replace('-', '')
    const rec = this.t.codes.get(key)
    if (!rec || rec.expiresAt <= this.now()) {
      this.noteWrongCode(lockKey)
      return undefined
    }
    // Mã cũ chưa ghi kênh là mã Telegram.
    if ((rec.channel ?? 'telegram') !== channel) return 'other-channel'
    this.wrongCodes.delete(lockKey)
    await this.t.codes.delete(key)
    return rec
  }

  /**
   * Người nhắn đúng mã còn hạn thì thành chủ nhân/người được phép; mã dùng một lần.
   * `channel` là kênh của tin đến. Mã của kênh khác thì không ghép, không xoá mã, không tính là
   * nhập sai (không dẫn tới khoá), trả `'other-channel'` để nơi gọi báo người nhắn.
   */
  async redeem(
    text: string,
    user: { id: number; name: string; username?: string | undefined },
    channel: ChannelKind = 'telegram',
  ): Promise<PersonRecord | 'other-channel' | undefined> {
    const rec = await this.takeCode(text, user.id, channel)
    if (!rec || rec === 'other-channel') return rec
    const person: PersonRecord = {
      userId: user.id,
      name: user.name,
      ...(user.username ? { username: user.username } : {}),
      // Đã là chủ nhân thì mã "người được phép" không hạ quyền.
      role: this.roleOf(user.id) === 'owner' ? 'owner' : rec.role,
      pairedAt: new Date(this.now()).toISOString(),
    }
    await this.t.people.put(`tg-${keyNum(user.id)}`, person)
    return person
  }

  /** Như `redeem` nhưng cho người trên Lark (nhận ra bằng `open_id`); chỉ nhận mã của kênh Lark. */
  async redeemLark(
    text: string,
    user: { openId: string; name: string },
  ): Promise<PersonRecord | 'other-channel' | undefined> {
    const rec = await this.takeCode(text, `lk-${user.openId}`, 'lark')
    if (!rec || rec === 'other-channel') return rec
    const person: PersonRecord = {
      userId: 0,
      name: user.name,
      role: this.larkRoleOf(user.openId) === 'owner' ? 'owner' : rec.role,
      pairedAt: new Date(this.now()).toISOString(),
      channel: 'lark',
      openId: user.openId,
    }
    await this.t.people.put(`lk-${larkKey(user.openId)}`, person)
    return person
  }

  // --- Nhóm --------------------------------------------------------------------------
  group(chatId: number): GroupRecord | undefined {
    return this.t.groups.get(`tg-${keyNum(chatId)}`)
  }
  groupRule(chatId: number): GroupRule | undefined {
    const g = this.group(chatId)
    return g && { allowed: g.allowed, who: g.who }
  }
  /** Nhóm Telegram (nhóm Lark nằm ở `larkGroups`). */
  groups(): GroupRecord[] {
    return [...this.t.groups.entries()]
      .map(([, g]) => g)
      .filter((g) => g.channel !== 'lark')
      .sort((a, b) => a.title.localeCompare(b.title))
  }
  async upsertGroup(chatId: number, patch: Partial<GroupRecord> & { title?: string }): Promise<GroupRecord> {
    const cur = this.group(chatId)
    const next: GroupRecord = {
      chatId,
      title: patch.title ?? cur?.title ?? String(chatId),
      allowed: patch.allowed ?? cur?.allowed ?? false,
      who: patch.who ?? cur?.who ?? 'allowed',
      ...((patch.prompt ?? cur?.prompt) ? { prompt: (patch.prompt ?? cur?.prompt)! } : {}),
      ...((patch.notifiedAt ?? cur?.notifiedAt) !== undefined
        ? { notifiedAt: (patch.notifiedAt ?? cur?.notifiedAt)! }
        : {}),
      seenAt: new Date(this.now()).toISOString(),
    }
    if (patch.prompt === '') delete next.prompt
    await this.t.groups.put(`tg-${keyNum(chatId)}`, next)
    return next
  }
  async removeGroup(chatId: number) {
    return this.t.groups.delete(`tg-${keyNum(chatId)}`)
  }

  // --- Nhóm Lark (nhận ra bằng chat_id) ----------------------------------------------------
  larkGroup(chatId: string): GroupRecord | undefined {
    return this.t.groups.get(`lk-${larkKey(chatId)}`)
  }
  larkGroupRule(chatId: string): GroupRule | undefined {
    const g = this.larkGroup(chatId)
    return g && { allowed: g.allowed, who: g.who }
  }
  larkGroups(): GroupRecord[] {
    return [...this.t.groups.entries()]
      .map(([, g]) => g)
      .filter((g) => g.channel === 'lark')
      .sort((a, b) => a.title.localeCompare(b.title))
  }
  async upsertLarkGroup(
    chatId: string,
    patch: Partial<GroupRecord> & { title?: string },
  ): Promise<GroupRecord> {
    const cur = this.larkGroup(chatId)
    const prompt = patch.prompt ?? cur?.prompt
    const notifiedAt = patch.notifiedAt ?? cur?.notifiedAt
    const next: GroupRecord = {
      chatId: 0,
      title: patch.title ?? cur?.title ?? chatId,
      allowed: patch.allowed ?? cur?.allowed ?? false,
      who: patch.who ?? cur?.who ?? 'allowed',
      ...(prompt ? { prompt } : {}),
      ...(notifiedAt !== undefined ? { notifiedAt } : {}),
      seenAt: new Date(this.now()).toISOString(),
      channel: 'lark',
      chatRef: chatId,
    }
    if (patch.prompt === '') delete next.prompt
    await this.t.groups.put(`lk-${larkKey(chatId)}`, next)
    return next
  }
  async removeLarkGroup(chatId: string) {
    return this.t.groups.delete(`lk-${larkKey(chatId)}`)
  }
  async shouldNotifyLarkGroup(chatId: string, title: string): Promise<boolean> {
    const g = this.larkGroup(chatId)
    if (g && g.notifiedAt !== undefined && this.now() - g.notifiedAt < 3_600_000) return false
    await this.upsertLarkGroup(chatId, { title, notifiedAt: this.now() })
    return true
  }

  /** Có nên báo chủ nhân lần nữa không (tối đa một lần mỗi giờ cho mỗi người lạ/nhóm lạ). */
  async shouldNotifyStranger(userId: number | string): Promise<boolean> {
    const s = this.settings()
    const last = s.strangers[String(userId)]
    if (last !== undefined && this.now() - last < 3_600_000) return false
    // Dọn người lạ đã báo quá 30 ngày để bảng không phình mãi.
    const keep = Object.entries(s.strangers).filter(([, at]) => this.now() - at < STRANGER_KEEP_MS)
    await this.updateSettings({ strangers: { ...Object.fromEntries(keep), [String(userId)]: this.now() } })
    return true
  }
  async shouldNotifyGroup(chatId: number, title: string): Promise<boolean> {
    const g = this.group(chatId)
    if (g && g.notifiedAt !== undefined && this.now() - g.notifiedAt < 3_600_000) return false
    await this.upsertGroup(chatId, { title, notifiedAt: this.now() })
    return true
  }

  // --- Tài khoản bot -----------------------------------------------------------------
  /** Tài khoản bot Telegram (ứng dụng Lark nằm ở `larkApps`). */
  bots(): BotRecord[] {
    return [...this.t.bots.entries()].map(([, b]) => b).filter((b) => b.channel !== 'lark')
  }
  bot(bot: string): BotRecord | undefined {
    return this.t.bots.get(bot)
  }
  async putBot(rec: BotRecord) {
    await this.t.bots.put(rec.bot, rec)
  }
  async patchBot(bot: string, patch: Partial<BotRecord>) {
    const cur = this.bot(bot)
    if (cur) await this.t.bots.put(bot, { ...cur, ...patch })
  }
  async removeBot(bot: string) {
    return this.t.bots.delete(bot)
  }

  // --- Ứng dụng Lark: mỗi bot của aris tối đa một ứng dụng, khoá bản ghi `lark-<bot>` ---------
  larkApps(): BotRecord[] {
    return [...this.t.bots.entries()].map(([, b]) => b).filter((b) => b.channel === 'lark')
  }
  larkApp(bot: string): BotRecord | undefined {
    const b = this.t.bots.get(`lark-${bot}`)
    return b?.channel === 'lark' ? b : undefined
  }
  async putLarkApp(rec: BotRecord) {
    await this.t.bots.put(`lark-${rec.bot}`, { ...rec, channel: 'lark' })
  }
  async patchLarkApp(bot: string, patch: Partial<BotRecord>) {
    const cur = this.larkApp(bot)
    if (cur) await this.t.bots.put(`lark-${bot}`, { ...cur, ...patch, channel: 'lark' })
  }
  async removeLarkApp(bot: string) {
    return this.t.bots.delete(`lark-${bot}`)
  }

  // --- Phiên ---------------------------------------------------------------------------
  thread(key: string): ThreadRecord | undefined {
    return this.t.threads.get(key)
  }
  async bindThread(rec: Omit<ThreadRecord, 'history' | 'updatedAt'>): Promise<ThreadRecord> {
    const cur = this.thread(rec.key)
    const history = [...(cur?.history ?? [])]
    if (cur && cur.sessionId !== rec.sessionId && !history.includes(cur.sessionId))
      history.unshift(cur.sessionId)
    const next: ThreadRecord = {
      ...rec,
      history: history.filter((s) => s !== rec.sessionId).slice(0, 30),
      updatedAt: new Date(this.now()).toISOString(),
    }
    await this.t.threads.put(rec.key, next)
    return next
  }
  /** Cuộc trò chuyện đang dùng phiên này (để biết phiên nào gắn với Telegram). */
  threads(): IterableIterator<[string, ThreadRecord]> {
    return this.t.threads.entries()
  }

  threadOfSession(sessionId: string): ThreadRecord | undefined {
    for (const [, t] of this.t.threads.entries()) if (t.sessionId === sessionId) return t
    return undefined
  }

  // --- Hàng đợi vào, hộp thư ra --------------------------------------------------------
  /** Tin vào chờ xử lý của Telegram (của Lark nằm ở `larkInbox`, để Telegram không làm lại nhầm). */
  inbox(): InboxRecord[] {
    return [...this.t.inbox.entries()]
      .map(([, r]) => r)
      .filter((r) => r.channel !== 'lark')
      .sort((a, b) => a.receivedAt - b.receivedAt)
  }
  larkInbox(): InboxRecord[] {
    return [...this.t.inbox.entries()]
      .map(([, r]) => r)
      .filter((r) => r.channel === 'lark')
      .sort((a, b) => a.receivedAt - b.receivedAt)
  }
  async enqueue(rec: InboxRecord) {
    if (!this.t.inbox.get(rec.id)) await this.t.inbox.put(rec.id, rec)
  }
  async markInbox(id: string, state: InboxRecord['state']) {
    const cur = this.t.inbox.get(id)
    if (cur) await this.t.inbox.put(id, { ...cur, state })
  }
  async doneInbox(id: string) {
    await this.t.inbox.delete(id)
  }
  /** Câu trả lời chờ gửi của Telegram (của Lark nằm ở `larkOutbox`). */
  outbox(): OutboxRecord[] {
    return [...this.t.outbox.entries()]
      .map(([, r]) => r)
      .filter((r) => r.channel !== 'lark')
      .sort((a, b) => a.createdAt - b.createdAt)
  }
  larkOutbox(): OutboxRecord[] {
    return [...this.t.outbox.entries()]
      .map(([, r]) => r)
      .filter((r) => r.channel === 'lark')
      .sort((a, b) => a.createdAt - b.createdAt)
  }
  async putOutbox(rec: OutboxRecord) {
    await this.t.outbox.put(rec.id, rec)
  }
  async doneOutbox(id: string) {
    await this.t.outbox.delete(id)
  }
}
