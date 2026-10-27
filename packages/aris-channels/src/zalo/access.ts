/**
 * Quyết định ở cửa vào cho Zalo cá nhân (thuần, không gọi mạng) và giới hạn tần suất gửi tin. Zalo không chính thức
 * nên luật chặt hơn Telegram và Lark để giảm rủi ro bị khoá tài khoản: chỉ người đã ghép đôi mới được trả lời, người
 * lạ thì im lặng, nhóm mặc định tắt và chỉ trả lời khi tài khoản được @ nhắc.
 */
import type { Decision, GroupRule, Role } from '../access.js'
import { parseZaloCommand, type ParsedMessage } from './content.js'
import type { ZaloInbound } from './types.js'

/** Giới hạn gửi tin (hằng số, không cho sửa trên giao diện). */
export const ZALO_LIMITS = {
  /** Tối thiểu giữa hai tin trong cùng một cuộc trò chuyện. */
  perChatMs: 3000,
  /** Tối đa số tin mỗi phút cho cả tài khoản. */
  perMinute: 20,
  /** Tối đa số tin mỗi ngày cho cả tài khoản. */
  perDay: 300,
} as const

/** Nhắn tin báo chủ về một người lạ nhiều nhất một lần mỗi người mỗi ngày. */
export const STRANGER_NOTIFY_MS = 24 * 3_600_000

/** Cắt trích tin của người lạ khi báo chủ. */
export const STRANGER_EXCERPT = 80

export interface ZaloAccessState {
  roleOf(zaloId: string): Role | undefined
  groupRule(groupId: string): GroupRule | undefined
}

export function decideZalo(ev: ZaloInbound, parsed: ParsedMessage, state: ZaloAccessState): Decision {
  if (!ev.senderId) return { kind: 'ignore', reason: 'không rõ người gửi' }
  const command = parseZaloCommand(parsed.text)
  const role = state.roleOf(ev.senderId)
  const text = parsed.text

  if (!ev.isGroup) {
    if (!role) return { kind: 'stranger' }
    return { kind: 'accept', trust: role, text, command }
  }
  if (!parsed.mentionedSelf) return { kind: 'ignore', reason: 'không gọi tài khoản này' }
  const rule = state.groupRule(ev.threadId)
  // Nhóm lạ hay nhóm chưa bật: im lặng hẳn (không báo chủ, không có chế độ khách).
  if (!rule?.allowed) return { kind: 'ignore', reason: 'nhóm chưa bật' }
  if (role) return { kind: 'accept', trust: role, text, command }
  if (rule.who === 'everyone') return { kind: 'accept', trust: 'member', text, command }
  return { kind: 'ignore', reason: 'người gửi chưa được phép trong nhóm' }
}

/**
 * Xếp lịch gửi tin theo `ZALO_LIMITS`. Mỗi lần gửi xin một chỗ (`take`): chỗ được xếp nối đuôi nhau trên cả tài khoản,
 * nên tin vượt giới hạn chờ tới lượt thay vì bị bỏ; hết hạn mức ngày thì trả `false` và không gửi nữa tới hết ngày.
 */
export class ZaloThrottle {
  private readonly lastByChat = new Map<string, number>()
  /** Giờ của các chỗ đã xếp trong phút gần nhất (tăng dần). */
  private slots: number[] = []
  private day = { key: '', sent: 0 }

  constructor(
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly limits: { perChatMs: number; perMinute: number; perDay: number } = ZALO_LIMITS,
  ) {}

  private dayKey(at: number) {
    const d = new Date(at)
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  /** Còn bao nhiêu tin trong hôm nay. */
  leftToday(): number {
    const key = this.dayKey(this.now())
    return this.day.key === key ? Math.max(0, this.limits.perDay - this.day.sent) : this.limits.perDay
  }

  /** Đã hết hạn mức hôm nay. */
  get dayExhausted(): boolean {
    return this.leftToday() <= 0
  }

  /** Xin một chỗ gửi cho `chat`; chờ tới giờ rồi trả `true`, hết hạn mức ngày thì trả `false`. */
  async take(chat: string): Promise<boolean> {
    const key = this.dayKey(this.now())
    if (this.day.key !== key) this.day = { key, sent: 0 }
    if (this.day.sent >= this.limits.perDay) return false
    this.day.sent++
    let at = this.now()
    const last = this.lastByChat.get(chat)
    if (last !== undefined) at = Math.max(at, last + this.limits.perChatMs)
    const prev = this.slots.at(-1)
    if (prev !== undefined) at = Math.max(at, prev)
    if (this.slots.length >= this.limits.perMinute)
      at = Math.max(at, this.slots[this.slots.length - this.limits.perMinute]! + 60_000)
    this.lastByChat.set(chat, at)
    this.slots.push(at)
    if (this.slots.length > this.limits.perMinute) this.slots.shift()
    const wait = at - this.now()
    if (wait > 0) await this.sleep(wait)
    return true
  }
}
