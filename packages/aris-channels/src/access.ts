/**
 * Quyết định ở cửa vào (thuần, không gọi mạng): tin này có tới bot không, ai đang nói và
 * với quyền gì. Chạy trước khi tin tới model: người lạ không tốn token, không chèn lệnh được.
 */
import type { TgEntity, TgMessage } from './telegram/types.js'

/** Vai của người đã ghép đôi. */
export type Role = 'owner' | 'member'

/** Mức tin cậy của một lượt: chủ nhân toàn quyền; thành viên và khách chỉ hỏi đáp. */
export type Trust = 'owner' | 'member' | 'guest'

export interface GroupRule {
  allowed: boolean
  /** Ai trong nhóm được gọi bot. */
  who: 'allowed' | 'everyone'
}

export interface AccessState {
  roleOf(userId: number): Role | undefined
  groupRule(chatId: number): GroupRule | undefined
  /** Nhóm lạ vẫn trả lời khi được @ đích danh. */
  guestMode: boolean
  /** Tài khoản đặt "mọi người nhắn riêng là khách" (GĐ8.7): người lạ nhắn riêng thành khách, chỉ hỏi đáp. */
  guests?: boolean | undefined
}

export interface BotIdentity {
  id: number
  username: string
}

export type Decision =
  | { kind: 'accept'; trust: Trust; text: string; command?: Command | undefined }
  /** Không gửi cho bot, không báo ai (tin nhóm không gọi bot, tin của bot khác…). */
  | { kind: 'ignore'; reason: string }
  /** Người lạ nhắn riêng: im lặng, báo chủ nhân. */
  | { kind: 'stranger' }
  /** Bot được gọi trong nhóm chưa được phép: im lặng, báo chủ nhân. */
  | { kind: 'unknown-group' }

export interface Command {
  name: string
  args: string
}

const lower = (s: string) => s.toLowerCase()

function textAndEntities(m: TgMessage): { text: string; entities: TgEntity[] } {
  if (m.text !== undefined) return { text: m.text, entities: m.entities ?? [] }
  return { text: m.caption ?? '', entities: m.caption_entities ?? [] }
}

const slice = (text: string, e: TgEntity) => text.slice(e.offset, e.offset + e.length)

/** Các @username trong tin (không phân biệt hoa thường, bỏ dấu @). */
export function mentionedUsernames(m: TgMessage): string[] {
  const { text, entities } = textAndEntities(m)
  return entities.filter((e) => e.type === 'mention').map((e) => lower(slice(text, e).replace(/^@/, '')))
}

/**
 * Lệnh `/tên[@bot] tham số` ở đầu tin. `targeted`: có ghi `@bot`; `forOther`: ghi `@` một bot
 * khác (bot này bỏ qua).
 */
export function parseCommand(
  m: TgMessage,
  bot: BotIdentity,
): (Command & { targeted: boolean; forOther: boolean }) | undefined {
  const { text, entities } = textAndEntities(m)
  const e = entities.find((x) => x.type === 'bot_command' && x.offset === 0)
  if (!e) return undefined
  const [name = '', target] = slice(text, e).slice(1).split('@')
  return {
    name: lower(name),
    args: text.slice(e.length).trim(),
    targeted: target !== undefined,
    forOther: target !== undefined && lower(target) !== lower(bot.username),
  }
}

/** Tin có gọi bot này không: @tên bot, trả lời vào tin của bot, hoặc lệnh `/lệnh@tên_bot`. */
export function addressedTo(m: TgMessage, bot: BotIdentity): boolean {
  const names = mentionedUsernames(m)
  const self = lower(bot.username)
  const mentioned = names.includes(self)
  const textMention = textAndEntities(m).entities.some(
    (e) => e.type === 'text_mention' && e.user?.id === bot.id,
  )
  if (mentioned || textMention) return true
  // @ một bot khác (tên bot Telegram luôn tận cùng bằng "bot"): chỉ bot đó trả lời, kể cả khi
  // đây là tin trả lời vào bot này. Nhờ vậy hai bot aris cùng nhóm không chen nhau.
  if (names.some((n) => n !== self && n.endsWith('bot'))) return false
  const cmd = parseCommand(m, bot)
  if (cmd?.targeted && !cmd.forOther) return true
  return m.reply_to_message?.from?.id === bot.id
}

/** Bỏ @tên bot ở đầu/cuối tin trước khi đưa cho model. */
export function stripMention(text: string, bot: BotIdentity): string {
  const re = new RegExp(`(^|\\s)@${bot.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  return text.replace(re, ' ').replace(/\s+/g, ' ').trim()
}

export function decide(m: TgMessage, bot: BotIdentity, state: AccessState): Decision {
  const from = m.from
  if (!from || from.is_bot) return { kind: 'ignore', reason: 'bot hoặc không rõ người gửi' }
  const { text } = textAndEntities(m)
  const cmd = parseCommand(m, bot)
  if (cmd?.forOther) return { kind: 'ignore', reason: 'lệnh cho bot khác' }
  const command = cmd ? { name: cmd.name, args: cmd.args } : undefined
  const role = state.roleOf(from.id)

  if (m.chat.type === 'private') {
    if (!role) return state.guests ? { kind: 'accept', trust: 'guest', text, command } : { kind: 'stranger' }
    return { kind: 'accept', trust: role, text, command }
  }
  if (m.chat.type === 'channel') return { kind: 'ignore', reason: 'kênh phát' }

  if (!addressedTo(m, bot)) return { kind: 'ignore', reason: 'không gọi bot này' }
  const clean = stripMention(text, bot)
  const rule = state.groupRule(m.chat.id)
  if (!rule?.allowed) {
    const explicit = mentionedUsernames(m).includes(lower(bot.username))
    if (state.guestMode && explicit) return { kind: 'accept', trust: 'guest', text: clean, command }
    return { kind: 'unknown-group' }
  }
  if (role) return { kind: 'accept', trust: role, text: clean, command }
  if (rule.who === 'everyone') return { kind: 'accept', trust: 'member', text: clean, command }
  return { kind: 'ignore', reason: 'người gửi chưa được phép trong nhóm' }
}

/** Lệnh người không phải chủ nhân được dùng. */
export const MEMBER_COMMANDS: ReadonlySet<string> = new Set([
  'start',
  'help',
  'whoami',
  'new',
  'stop',
  'status',
])

export function commandAllowed(name: string, trust: Trust): boolean {
  return trust === 'owner' || MEMBER_COMMANDS.has(name)
}
