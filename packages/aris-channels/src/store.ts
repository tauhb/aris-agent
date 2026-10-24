/**
 * Kho kênh: bọc các bảng của domain `aris_channels` bằng các thao tác có nghĩa (ghép đôi,
 * cho phép nhóm, gắn phiên…). Đọc đồng bộ từ bộ nhớ, ghi bền qua backend của dsh.
 */
import { randomInt } from 'node:crypto'
import type { AccessState, GroupRule, Role } from './access.js'
import type {
  BotRecord,
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

/** Khoá cuộc trò chuyện: có mã tài khoản bot nên hai bot không dùng chung phiên. */
export function threadKey(tgBotId: number, chatId: number, threadId?: number): string {
  return `tg-${keyNum(tgBotId)}-${keyNum(chatId)}${threadId ? `-t${threadId}` : ''}`
}

/** Mã ghép đôi: 8 ký tự dễ đọc (bỏ 0/O, 1/I/L), dạng `4KX7-29QM`. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_TTL_MS = 10 * 60_000

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
  people(): PersonRecord[] {
    return [...this.t.people.entries()].map(([, p]) => p).sort((a, b) => a.pairedAt.localeCompare(b.pairedAt))
  }
  owners(): PersonRecord[] {
    return this.people().filter((p) => p.role === 'owner')
  }
  async revoke(userId: number) {
    return this.t.people.delete(`tg-${keyNum(userId)}`)
  }

  // --- Mã ghép đôi ----------------------------------------------------------------------
  async createCode(role: Role): Promise<CodeRecord> {
    await this.pruneCodes()
    const rec = { code: newCode(), role, expiresAt: this.now() + CODE_TTL_MS }
    await this.t.codes.put(rec.code.replace('-', ''), rec)
    return rec
  }
  activeCodes(): CodeRecord[] {
    const now = this.now()
    return [...this.t.codes.entries()].map(([, c]) => c).filter((c) => c.expiresAt > now)
  }
  private async pruneCodes() {
    const now = this.now()
    for (const [k, c] of [...this.t.codes.entries()]) if (c.expiresAt <= now) await this.t.codes.delete(k)
  }
  /** Người nhắn đúng mã còn hạn thì thành chủ nhân/người được phép; mã dùng một lần. */
  async redeem(
    text: string,
    user: { id: number; name: string; username?: string | undefined },
  ): Promise<PersonRecord | undefined> {
    const code = normalizeCode(text)
    if (!code) return undefined
    const key = code.replace('-', '')
    const rec = this.t.codes.get(key)
    if (!rec || rec.expiresAt <= this.now()) return undefined
    await this.t.codes.delete(key)
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

  // --- Nhóm --------------------------------------------------------------------------
  group(chatId: number): GroupRecord | undefined {
    return this.t.groups.get(`tg-${keyNum(chatId)}`)
  }
  groupRule(chatId: number): GroupRule | undefined {
    const g = this.group(chatId)
    return g && { allowed: g.allowed, who: g.who }
  }
  groups(): GroupRecord[] {
    return [...this.t.groups.entries()].map(([, g]) => g).sort((a, b) => a.title.localeCompare(b.title))
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

  /** Có nên báo chủ nhân lần nữa không (tối đa một lần mỗi giờ cho mỗi người lạ/nhóm lạ). */
  async shouldNotifyStranger(userId: number): Promise<boolean> {
    const s = this.settings()
    const last = s.strangers[String(userId)]
    if (last !== undefined && this.now() - last < 3_600_000) return false
    await this.updateSettings({ strangers: { ...s.strangers, [String(userId)]: this.now() } })
    return true
  }
  async shouldNotifyGroup(chatId: number, title: string): Promise<boolean> {
    const g = this.group(chatId)
    if (g && g.notifiedAt !== undefined && this.now() - g.notifiedAt < 3_600_000) return false
    await this.upsertGroup(chatId, { title, notifiedAt: this.now() })
    return true
  }

  // --- Tài khoản bot -----------------------------------------------------------------
  bots(): BotRecord[] {
    return [...this.t.bots.entries()].map(([, b]) => b)
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
  inbox(): InboxRecord[] {
    return [...this.t.inbox.entries()].map(([, r]) => r).sort((a, b) => a.receivedAt - b.receivedAt)
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
  outbox(): OutboxRecord[] {
    return [...this.t.outbox.entries()].map(([, r]) => r).sort((a, b) => a.createdAt - b.createdAt)
  }
  async putOutbox(rec: OutboxRecord) {
    await this.t.outbox.put(rec.id, rec)
  }
  async doneOutbox(id: string) {
    await this.t.outbox.delete(id)
  }
}
