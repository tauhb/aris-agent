/**
 * Tín hiệu đáng học của một lượt (đặc tả: docs/specs/aris-reflect.md). Thuần, không phụ thuộc dsh:
 * plugin ghi lượt vào {@link TurnLog}, cuối lượt hỏi {@link decide} có nên chạy vòng học không.
 */

/** Một lần gọi công cụ trong lượt (đủ để nhận "lỗi rồi tìm ra cách" và kể lại cho model). */
export interface ToolCall {
  name: string
  ok: boolean
  /** Tham số rút gọn. */
  brief: string
}

export interface TurnLog {
  turn: number
  user: string[]
  assistant: string[]
  tools: ToolCall[]
  /** Số lần tool `memory` ghi (save/update/forget). */
  memoryWrites: number
}

export const emptyTurn = (turn: number): TurnLog => ({
  turn,
  user: [],
  assistant: [],
  tools: [],
  memoryWrites: 0,
})

export type Reason = 'corrected' | 'remember' | 'praised' | 'long' | 'recovered' | 'safety'

/** Bỏ dấu tiếng Việt, viết thường. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
}

/** Người dùng sửa cách bot làm. */
export const CORRECTED_RE =
  /\b(sai roi|sai bet|sai het|khong phai the|khong phai vay|khong phai nhu the|khong dung|chua dung|lam lai|sua lai|nham roi|bi nham|that'?s wrong|not what i)\b/
/** Người dùng dặn nhớ. */
export const REMEMBER_RE =
  /\b(nho la|ghi nho|hay nho|nho giup|nho nhe|lan sau|tu gio|tu nay|dung bao gio|remember|next time|from now on)\b/
/** Người dùng khen: cách vừa làm đáng giữ. */
export const PRAISED_RE =
  /\b(tot lam|hay lam|chuan roi|chuan luon|dung y|tuyet voi|xuat sac|qua hay|great job|perfect|well done)\b/

/** Lượt có từ ngần này lần gọi công cụ trở lên là việc dài. */
export const LONG_TURN = 8

/** Dấu hiệu đáng học của một lượt (không tính lưới an toàn). */
export function reasonsOf(t: TurnLog): Reason[] {
  const said = fold(t.user.join('\n'))
  const out: Reason[] = []
  if (CORRECTED_RE.test(said)) out.push('corrected')
  if (REMEMBER_RE.test(said) && t.memoryWrites === 0) out.push('remember')
  if (PRAISED_RE.test(said)) out.push('praised')
  if (t.tools.length >= LONG_TURN) out.push('long')
  if (t.tools.some((c, i) => !c.ok && t.tools.slice(i + 1).some((d) => d.ok && d.name === c.name)))
    out.push('recovered')
  return out
}

/** Số ký tự lời người dùng và câu trả lời của các lượt. */
export const charsOf = (turns: readonly TurnLog[]) =>
  turns.reduce((n, t) => n + [...t.user, ...t.assistant].reduce((m, s) => m + s.length, 0), 0)

export interface DecideOptions {
  /** Ít nhất ngần này lượt giữa hai lần học của một phiên (trừ khi bị sửa sai). */
  gap: number
  /** Lưới an toàn: ngần này lượt liền không học. */
  safetyTurns: number
  /** Lưới an toàn chỉ chạy khi đoạn chưa học dài ít nhất ngần này ký tự. */
  safetyChars: number
  /** Lượt ngắn hơn ngần này ký tự và không gọi công cụ thì bỏ qua. */
  minChars: number
}

export const DECIDE_DEFAULTS: DecideOptions = { gap: 2, safetyTurns: 12, safetyChars: 1500, minChars: 200 }

/**
 * Có học không, vì sao. `pending` là các lượt chưa học (lượt vừa xong ở cuối); `sinceLast` là số
 * lượt từ lần học trước của phiên (undefined khi phiên chưa học lần nào).
 */
export function decide(
  pending: readonly TurnLog[],
  sinceLast: number | undefined,
  opts: DecideOptions = DECIDE_DEFAULTS,
): Reason[] {
  const last = pending.at(-1)
  if (!last) return []
  if (charsOf([last]) < opts.minChars && last.tools.length === 0) return []
  const reasons = reasonsOf(last)
  const spaced = sinceLast === undefined || sinceLast >= opts.gap
  if (reasons.includes('corrected') || (reasons.length && spaced)) return reasons
  if (pending.length >= opts.safetyTurns && charsOf(pending) >= opts.safetyChars) return ['safety']
  return []
}
