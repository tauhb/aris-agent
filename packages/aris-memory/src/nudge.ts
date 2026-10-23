/**
 * Tự nhắc lưu: theo dõi một lượt chat (lời chủ nhân, số lần gọi công cụ, có ghi ký ức
 * chưa). Lượt có dấu hiệu cần nhớ mà chưa ghi thì cài một lời nhắc cho lượt kế tiếp
 * (không tốn thêm lần gọi model, bot không phải nói thêm gì ở lượt này).
 */
import { fold } from './store.js'

export interface TurnSignals {
  turn: number
  /** Lời chủ nhân trong lượt. */
  userText: string[]
  toolCalls: number
  /** Số lần tool `memory` ghi (save/update/forget) trong lượt. */
  memoryWrites: number
}

export const emptyTurn = (turn: number): TurnSignals => ({
  turn,
  userText: [],
  toolCalls: 0,
  memoryWrites: 0,
})

/** Dấu hiệu chủ nhân muốn bot nhớ hoặc vừa sửa cách bot làm (so trên chữ đã bỏ dấu). */
export const CUE_RE =
  /\b(nho la|ghi nho|hay nho|nho giup|lan sau|tu gio|tu nay|dung bao gio|luon luon|sai roi|khong phai the|(anh|em|minh|toi|tao) (thich|muon|ghet|khong thich|hay|quen)|uu tien|remember|always|never|next time|from now on|i prefer)\b/

export interface NudgeOptions {
  /** Lượt có từ ngần này lần gọi công cụ trở lên là lượt dài. */
  longTurn: number
  /** Sau một lần nhắc, bỏ qua ngần này lượt. */
  cooldown: number
}

export const NUDGE_DEFAULTS: NudgeOptions = { longTurn: 8, cooldown: 2 }

/** Lý do cần nhắc, hoặc undefined khi không nhắc. */
export function nudgeReason(
  s: TurnSignals,
  lastNudgeTurn: number | undefined,
  opts: NudgeOptions = NUDGE_DEFAULTS,
): 'cue' | 'long' | undefined {
  if (s.memoryWrites > 0) return undefined
  if (lastNudgeTurn !== undefined && s.turn - lastNudgeTurn <= opts.cooldown) return undefined
  if (s.userText.some((t) => CUE_RE.test(fold(t)))) return 'cue'
  if (s.toolCalls >= opts.longTurn) return 'long'
  return undefined
}

export const NUDGE_TEXT: Record<'cue' | 'long', string> = {
  cue: 'Nhắc của trí nhớ: ở lượt trước chủ nhân có nói điều có thể cần nhớ lâu dài (sở thích, quy ước, việc sửa lại cách bạn làm) nhưng chưa được lưu. Nếu đúng là điều nên nhớ, lưu bằng tool memory trước khi trả lời tiếp; nếu không, bỏ qua nhắc này và đừng nhắc tới nó.',
  long: 'Nhắc của trí nhớ: lượt trước là một việc dài. Nếu bạn rút ra được bài học hoặc quy ước dùng lại được (cách làm hiệu quả, chỗ dễ sai, nơi để tài liệu), lưu ngắn gọn bằng tool memory trước khi trả lời tiếp; nếu không, bỏ qua nhắc này và đừng nhắc tới nó.',
}
