/**
 * Ký ức chờ duyệt (giai đoạn 3, đợt 1): mọi ký ức bot tự suy ra (tool `memory`, vòng học nền, lúc
 * nén) thành đề xuất; người dùng trả lời ở Hộp duyệt (web) hay thẻ Telegram; quá hạn thì tự bỏ.
 * Nơi khác (Telegram) nghe đề xuất mở / đóng qua {@link Proposals.on}.
 */
import { itemsFor } from './books.js'
import { overlap } from './reflect.js'
import {
  PROPOSAL_DAYS,
  type MemoryItem,
  type MemoryStore,
  type Review,
  type SaveInput,
  type Tier,
} from './store.js'

/** Một đề xuất như Hộp duyệt và Telegram thấy. */
export interface ProposalView {
  id: string
  /** Bot đề xuất (hồ sơ người dùng lưu dưới Commander nhưng có thể do bot khác đề xuất). */
  bot: string
  book: MemoryItem['book']
  kind: MemoryItem['kind']
  tier: Tier
  trust: MemoryItem['trust']
  text: string
  why?: string | undefined
  quote?: string | undefined
  via: NonNullable<MemoryItem['proposal']>['via']
  sessionId?: string | undefined
  at: string
  expiresAt: string
}

export type ProposalEvent =
  | { type: 'opened'; item: ProposalView }
  | { type: 'closed'; item: ProposalView; decision: Review['decision']; by: Review['by'] }

export function viewOf(m: MemoryItem, days = PROPOSAL_DAYS): ProposalView {
  return {
    id: m.id,
    bot: m.proposal?.by ?? m.bot,
    book: m.book,
    kind: m.kind,
    tier: m.tier,
    trust: m.trust,
    text: m.text,
    ...(m.proposal?.why ? { why: m.proposal.why } : {}),
    ...(m.proposal?.quote ? { quote: m.proposal.quote } : {}),
    via: m.proposal?.via ?? 'tool',
    ...(m.source.sessionId ? { sessionId: m.source.sessionId } : {}),
    at: m.createdAt,
    expiresAt: new Date(Date.parse(m.createdAt) + days * 86_400_000).toISOString(),
  }
}

export class Proposals {
  private readonly listeners = new Set<(e: ProposalEvent) => void>()

  constructor(private readonly store: MemoryStore) {}

  /**
   * Thêm đề xuất chờ duyệt. Gần trùng ký ức bot đã thấy (cả đề xuất đang chờ) thì bỏ, trả undefined.
   * `by` là bot đề xuất; ký ức lưu dưới chủ cuốn (`input.bot`).
   */
  async propose(
    input: SaveInput & { proposal: NonNullable<SaveInput['proposal']> },
  ): Promise<MemoryItem | undefined> {
    // Ký ức bot thấy gồm cả đề xuất đang chờ, nên đề xuất lặp lại cũng bị bỏ.
    const seen = itemsFor(this.store, input.proposal.by ?? input.bot).map((m) => m.text)
    if (seen.some((t) => overlap(t, input.text) >= 0.6)) return undefined
    const item = await this.store.save({ ...input, status: 'pending' })
    this.emit({ type: 'opened', item: viewOf(item) })
    return item
  }

  list(): ProposalView[] {
    return this.store.pending().map((m) => viewOf(m))
  }

  async review(
    id: string,
    decision: Review['decision'],
    by: Review['by'],
    patch?: { text?: string | undefined; tier?: Tier | undefined },
  ): Promise<MemoryItem> {
    const item = await this.store.review(id, decision, by, patch)
    this.emit({ type: 'closed', item: viewOf(item), decision, by })
    return item
  }

  async expire(): Promise<number> {
    const gone = await this.store.expire()
    for (const item of gone)
      this.emit({ type: 'closed', item: viewOf(item), decision: 'discarded', by: 'timeout' })
    return gone.length
  }

  /** Nghe đề xuất mới và đề xuất đã trả lời; trả hàm gỡ. */
  on(fn: (e: ProposalEvent) => void): () => void {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  private emit(e: ProposalEvent) {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch {
        // Người nghe lỗi không làm hỏng việc duyệt.
      }
    }
  }
}
