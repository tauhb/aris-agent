/**
 * Theo dõi lượt của các phiên gắn với kênh (thuần, chỉ đọc sự kiện): lượt nào chứa tin
 * aris đã gửi vào, chữ bot đang viết (để hiện dần), câu trả lời cuối khi lượt kết thúc.
 * Tin anh gõ trên web vào cùng phiên không gửi ra Telegram: chỉ lượt có tin của kênh mới giao.
 */

/** Phần chung của một tin đã đưa vào agent, mọi kênh đều có; mỗi kênh thêm mã chat và mã tin của riêng nó. */
export interface PendingBase {
  /** Mã tin (UserMessage.id) đã đưa vào agent. */
  messageId: string
  inboxId: string
  threadKey: string
  bot: string
  group: boolean
  trust: 'owner' | 'member' | 'guest'
}

/** Tin Telegram đã đưa vào agent. */
export interface Pending extends PendingBase {
  chatId: number
  threadId?: number | undefined
  /** Tin Telegram của người gửi (để thả cảm xúc, trả lời vào). */
  tgMessageId: number
}

/** Bot đích của một lần chuyển giao (bản ghi `plugin:aris/handoff`). */
export interface HandoffFrom {
  bot: string
  handle: string
  name: string
  role?: string | undefined
}

/** Một đoạn trả lời của lượt: của bot của phiên, hoặc của bot đích khi chuyển giao. */
export interface TurnPart {
  text: string
  from?: HandoffFrom | undefined
}

export interface TurnResult<P extends PendingBase = Pending> {
  sessionId: string
  ours: P[]
  /** Chữ của bot của phiên (không gồm phần chuyển giao). */
  text: string
  /** Mọi đoạn theo thứ tự, kể cả câu trả lời của bot đích khi chuyển giao. */
  parts: TurnPart[]
  reason: { kind: string; error?: { message?: string } | undefined }
}

type Block = { type: string; text?: string }
const textOf = (blocks: readonly Block[]) =>
  blocks
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('')
    .trim()

interface TurnState<P extends PendingBase> {
  ours: P[]
  /** Chữ của mọi tin trả lời trong lượt, theo thứ tự (viết, gọi công cụ, viết tiếp…). */
  texts: string[]
  parts: TurnPart[]
}

/** Sự kiện phiên ở dạng tối thiểu tracker cần. */
export type TrackedEvent =
  | { type: 'turn/start' }
  | { type: 'user/message'; data: { id: string } }
  | { type: 'assistant/message'; data: { message: { content: readonly Block[] } } }
  | { type: 'turn/end'; data: { reason: TurnResult['reason'] } }
  | { type: string; data?: unknown }

export class TurnTracker<P extends PendingBase = Pending> {
  private readonly pending = new Map<string, P>()
  private readonly turns = new Map<string, TurnState<P>>()
  /** Chữ đang viết theo phiên: bước hiện tại (mỗi lần gọi model là một lượt viết mới). */
  private readonly drafts = new Map<string, { attempt: string; text: string }>()

  expect(p: P) {
    this.pending.set(p.messageId, p)
  }

  /** Tin đã gửi vào nhưng chưa có lượt nào nhận (khi khởi động lại, dừng…). */
  pendingFor(threadKey: string): P[] {
    return [...this.pending.values()].filter((p) => p.threadKey === threadKey)
  }

  /** Phiên có lượt đang mở chứa tin của kênh. */
  active(sessionId: string): P[] {
    return this.turns.get(sessionId)?.ours ?? []
  }

  onEvent(sessionId: string, event: TrackedEvent): TurnResult<P> | undefined {
    switch (event.type) {
      case 'turn/start':
        this.turns.set(sessionId, { ours: [], texts: [], parts: [] })
        this.drafts.delete(sessionId)
        return undefined
      case 'user/message': {
        const id = (event.data as { id?: string } | undefined)?.id
        const p = id === undefined ? undefined : this.pending.get(id)
        if (!p) return undefined
        this.pending.delete(p.messageId)
        const turn = this.turns.get(sessionId) ?? { ours: [], texts: [], parts: [] }
        turn.ours.push(p)
        this.turns.set(sessionId, turn)
        return undefined
      }
      case 'assistant/message': {
        const content = (event.data as { message?: { content?: readonly Block[] } } | undefined)?.message
          ?.content
        const text = content ? textOf(content) : ''
        const turn = this.turns.get(sessionId)
        if (turn && text) {
          turn.texts.push(text)
          turn.parts.push({ text })
        }
        // Bước đã chốt: chữ đang viết của bước đó đã nằm trong `texts`.
        this.drafts.delete(sessionId)
        return undefined
      }
      case 'plugin:aris/handoff': {
        // Chuyển giao: câu trả lời của bot đích là một đoạn riêng, gửi như lời của bot đó.
        const h = event.data as (HandoffFrom & { text?: string }) | undefined
        const turn = this.turns.get(sessionId)
        if (turn && h?.text?.trim())
          turn.parts.push({
            text: h.text.trim(),
            from: { bot: h.bot, handle: h.handle, name: h.name, ...(h.role ? { role: h.role } : {}) },
          })
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
        return { sessionId, ours: turn.ours, text: turn.texts.join('\n\n'), parts: turn.parts, reason }
      }
      default:
        return undefined
    }
  }

  /**
   * Khung luồng chữ của agent; trả chữ đang hiện của lượt nếu lượt là của kênh: các đoạn đã chốt
   * nối với đoạn đang viết, để phần đã trả lời không biến mất khi bot viết tiếp.
   */
  onStream(
    sessionId: string,
    frame: { type: string; attemptId?: string; chunk?: { type: string; text?: string } },
  ): string | undefined {
    const turn = this.turns.get(sessionId)
    if (!turn?.ours.length) return undefined
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
    return [...turn.texts, d.text].filter((t) => t.trim()).join('\n\n')
  }
}
