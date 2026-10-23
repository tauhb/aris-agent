/**
 * Theo dõi lượt của các phiên gắn với kênh (thuần, chỉ đọc sự kiện): lượt nào chứa tin
 * aris đã gửi vào, chữ bot đang viết (để hiện dần), câu trả lời cuối khi lượt kết thúc.
 * Tin anh gõ trên web vào cùng phiên không gửi ra Telegram: chỉ lượt có tin của kênh mới giao.
 */

export interface Pending {
  /** Mã tin (UserMessage.id) đã đưa vào agent. */
  messageId: string
  inboxId: string
  threadKey: string
  bot: string
  chatId: number
  threadId?: number | undefined
  /** Tin Telegram của người gửi (để thả cảm xúc, trả lời vào). */
  tgMessageId: number
  group: boolean
  trust: 'owner' | 'member' | 'guest'
}

export interface TurnResult {
  sessionId: string
  ours: Pending[]
  text: string
  reason: { kind: string; error?: { message?: string } | undefined }
}

type Block = { type: string; text?: string }
const textOf = (blocks: readonly Block[]) =>
  blocks
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('')
    .trim()

interface TurnState {
  ours: Pending[]
  lastText: string
}

/** Sự kiện phiên ở dạng tối thiểu tracker cần. */
export type TrackedEvent =
  | { type: 'turn/start' }
  | { type: 'user/message'; data: { id: string } }
  | { type: 'assistant/message'; data: { message: { content: readonly Block[] } } }
  | { type: 'turn/end'; data: { reason: TurnResult['reason'] } }
  | { type: string; data?: unknown }

export class TurnTracker {
  private readonly pending = new Map<string, Pending>()
  private readonly turns = new Map<string, TurnState>()
  /** Chữ đang viết theo phiên: bước hiện tại (mỗi lần gọi model là một lượt viết mới). */
  private readonly drafts = new Map<string, { attempt: string; text: string }>()

  expect(p: Pending) {
    this.pending.set(p.messageId, p)
  }

  /** Tin đã gửi vào nhưng chưa có lượt nào nhận (khi khởi động lại, dừng…). */
  pendingFor(threadKey: string): Pending[] {
    return [...this.pending.values()].filter((p) => p.threadKey === threadKey)
  }

  /** Phiên có lượt đang mở chứa tin của kênh. */
  active(sessionId: string): Pending[] {
    return this.turns.get(sessionId)?.ours ?? []
  }

  onEvent(sessionId: string, event: TrackedEvent): TurnResult | undefined {
    switch (event.type) {
      case 'turn/start':
        this.turns.set(sessionId, { ours: [], lastText: '' })
        this.drafts.delete(sessionId)
        return undefined
      case 'user/message': {
        const id = (event.data as { id?: string } | undefined)?.id
        const p = id === undefined ? undefined : this.pending.get(id)
        if (!p) return undefined
        this.pending.delete(p.messageId)
        const turn = this.turns.get(sessionId) ?? { ours: [], lastText: '' }
        turn.ours.push(p)
        this.turns.set(sessionId, turn)
        return undefined
      }
      case 'assistant/message': {
        const content = (event.data as { message?: { content?: readonly Block[] } } | undefined)?.message
          ?.content
        const text = content ? textOf(content) : ''
        const turn = this.turns.get(sessionId)
        if (turn && text) turn.lastText = text
        return undefined
      }
      case 'turn/end': {
        const turn = this.turns.get(sessionId)
        this.turns.delete(sessionId)
        this.drafts.delete(sessionId)
        if (!turn?.ours.length) return undefined
        const reason = (event.data as { reason?: TurnResult['reason'] } | undefined)?.reason ?? {
          kind: 'completed',
        }
        return { sessionId, ours: turn.ours, text: turn.lastText, reason }
      }
      default:
        return undefined
    }
  }

  /** Khung luồng chữ của agent; trả chữ đang viết nếu lượt hiện tại là của kênh. */
  onStream(
    sessionId: string,
    frame: { type: string; attemptId?: string; chunk?: { type: string; text?: string } },
  ): string | undefined {
    if (!this.turns.get(sessionId)?.ours.length) return undefined
    if (frame.type === 'start') {
      this.drafts.set(sessionId, { attempt: frame.attemptId ?? '', text: '' })
      return undefined
    }
    if (frame.type !== 'chunk' || frame.chunk?.type !== 'text-delta') return undefined
    const d = this.drafts.get(sessionId) ?? { attempt: frame.attemptId ?? '', text: '' }
    if (d.attempt !== (frame.attemptId ?? '')) {
      d.attempt = frame.attemptId ?? ''
      d.text = ''
    }
    d.text += frame.chunk.text ?? ''
    this.drafts.set(sessionId, d)
    return d.text
  }
}
