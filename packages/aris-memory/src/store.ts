/**
 * Kho ký ức thuần (không phụ thuộc dsh): bản ghi, trần ký tự của hai cuốn lõi, tìm
 * không dấu, dựng đoạn ký ức lõi đưa vào prompt. Lưu bền qua một bảng khoá–giá trị
 * (bảng của storage domain dsh, hoặc Map khi kiểm thử).
 */

/** Ghi chú của bot (môi trường, quy ước, bài học) và hồ sơ người dùng (sở thích, thói quen). */
export const BOOKS = ['notes', 'owner'] as const
export type Book = (typeof BOOKS)[number]

export const TIERS = ['core', 'archive'] as const
export type Tier = (typeof TIERS)[number]

export const KINDS = [
  'preference',
  'environment',
  'convention',
  'lesson',
  'project',
  'person',
  'event',
  'fact',
] as const
export type Kind = (typeof KINDS)[number]

export type Trust = 'user-stated' | 'agent-inferred' | 'external'
export type Status = 'active' | 'pending' | 'deleted'

/** Trần ký tự của mỗi cuốn lõi, cho mỗi bot. */
export const CAPS: Record<Book, number> = { notes: 2200, owner: 1375 }

export interface MemoryItem {
  id: string
  bot: string
  book: Book
  tier: Tier
  status: Status
  kind: Kind
  trust: Trust
  text: string
  /** Phiên và thời điểm sinh ra ký ức (để mở lại đoạn chat). */
  source: { sessionId?: string | undefined; at: string }
  revision: number
  createdAt: string
  updatedAt: string
  uses: number
  lastUsedAt?: string | undefined
  /** Ký ức bot tự suy ra (chờ duyệt): bot nào đề xuất, vì sao, bằng chứng, đến từ đâu. */
  proposal?: Proposal | undefined
  /** Người dùng (hay hết hạn) đã trả lời đề xuất. */
  review?: Review | undefined
}

/** Ký ức chờ duyệt đến từ tool `memory`, vòng học nền hay lúc nén hội thoại. */
export const VIAS = ['tool', 'reflect', 'compaction'] as const
export interface Proposal {
  /** Bot đề xuất (cuốn `owner` lưu dưới Commander nhưng có thể do bot khác đề xuất). */
  by?: string | undefined
  why?: string | undefined
  quote?: string | undefined
  via: (typeof VIAS)[number]
}

export interface Review {
  at: string
  by: 'user' | 'telegram' | 'timeout'
  decision: 'saved' | 'discarded'
}

/** Đề xuất chưa trả lời quá ngần này ngày thì tự bỏ. */
export const PROPOSAL_DAYS = 7

/** Bảng khoá–giá trị tối thiểu mà kho cần (khớp `KvTable` của dsh). */
export interface MemoryTable {
  get(key: string): MemoryItem | undefined
  entries(): IterableIterator<[string, MemoryItem]>
  put(key: string, value: MemoryItem): Promise<void>
}

/** Lỗi có lời nhắn cho model và cho người dùng. */
export class MemoryError extends Error {
  constructor(
    readonly code: 'not-found' | 'full' | 'empty' | 'untrusted-core',
    message: string,
  ) {
    super(message)
  }
}

/** Mã bản ghi chỉ gồm chữ, số và `-`, đúng ràng buộc khoá của storage dsh. */
export function newId(now: number, random: () => number = Math.random): string {
  return `m-${now.toString(36)}-${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`
}

/** Bỏ dấu tiếng Việt và viết thường để so khớp ("Họp" khớp "hop"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
}

const words = (s: string) =>
  fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)

export interface SaveInput {
  bot: string
  text: string
  kind: Kind
  book: Book
  tier: Tier
  trust: Trust
  status?: Status | undefined
  sessionId?: string | undefined
  proposal?: Proposal | undefined
}

export interface Usage {
  used: number
  cap: number
}

export class MemoryStore {
  constructor(
    private readonly table: MemoryTable,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Ký ức cũ có chữ "chủ nhân" viết cứng (ghi trước khi có hồ sơ xưng hô); đổi thành "người dùng"
   * để bot gọi theo hồ sơ. Chạy mỗi lần khởi động, không còn gì thì thôi. Trả số ký ức đã sửa.
   */
  async dropHardcodedAddress(): Promise<number> {
    const fix = (s: string) => s.replace(/chủ nhân/g, 'người dùng').replace(/Chủ nhân/g, 'Người dùng')
    let n = 0
    for (const [id, item] of [...this.table.entries()])
      if (/chủ nhân/i.test(item.text)) {
        await this.table.put(id, { ...item, text: fix(item.text) })
        n++
      }
    return n
  }

  /** Mọi bản ghi chưa xoá của bot, mới nhất trước. */
  list(bot: string, filter: Partial<Pick<MemoryItem, 'tier' | 'status' | 'book'>> = {}): MemoryItem[] {
    const out: MemoryItem[] = []
    for (const [, item] of this.table.entries()) {
      if (item.bot !== bot || item.status === 'deleted') continue
      if (filter.tier && item.tier !== filter.tier) continue
      if (filter.status && item.status !== filter.status) continue
      if (filter.book && item.book !== filter.book) continue
      out.push(item)
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(id: string): MemoryItem | undefined {
    const item = this.table.get(id)
    return item && item.status !== 'deleted' ? item : undefined
  }

  /** Số ký tự đang dùng của một cuốn lõi (chỉ ký ức đang hiệu lực). */
  usage(bot: string, book: Book, except?: string): Usage {
    let used = 0
    for (const item of this.list(bot, { tier: 'core', status: 'active', book })) {
      if (item.id !== except) used += item.text.length
    }
    return { used, cap: CAPS[book] }
  }

  private assertFits(bot: string, book: Book, text: string, except?: string): void {
    const { used, cap } = this.usage(bot, book, except)
    if (used + text.length > cap)
      throw new MemoryError(
        'full',
        `Cuốn "${book}" của ${bot} đã dùng ${used}/${cap} ký tự; thêm ${text.length} ký tự sẽ vượt trần. Gộp hoặc rút gọn các mục cũ, hoặc chuyển mục ít dùng xuống lưu trữ, rồi lưu lại.`,
      )
  }

  async save(input: SaveInput): Promise<MemoryItem> {
    const text = input.text.trim()
    if (!text) throw new MemoryError('empty', 'Nội dung ký ức rỗng.')
    if (input.tier === 'core' && input.trust === 'external')
      throw new MemoryError(
        'untrusted-core',
        'Nội dung từ nguồn ngoài chỉ được lưu vào lưu trữ, không lên lõi.',
      )
    const status = input.status ?? 'active'
    if (input.tier === 'core' && status === 'active') this.assertFits(input.bot, input.book, text)
    const at = this.now().toISOString()
    const item: MemoryItem = {
      id: newId(this.now().getTime()),
      bot: input.bot,
      book: input.book,
      tier: input.tier,
      status,
      kind: input.kind,
      trust: input.trust,
      text,
      source: { sessionId: input.sessionId, at },
      revision: 1,
      createdAt: at,
      updatedAt: at,
      uses: 0,
      ...(input.proposal ? { proposal: input.proposal } : {}),
    }
    await this.table.put(item.id, item)
    return item
  }

  /** Đề xuất chờ duyệt của mọi bot, cũ trước. */
  pending(): MemoryItem[] {
    return [...this.table.entries()]
      .map(([, i]) => i)
      .filter((i) => i.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * Trả lời một đề xuất: lưu (có thể kèm câu sửa, đổi tầng) hay bỏ. Lõi đầy thì báo lỗi `full`
   * và không đổi gì, để người dùng chọn lưu vào lưu trữ.
   */
  async review(
    id: string,
    decision: Review['decision'],
    by: Review['by'],
    patch: { text?: string | undefined; tier?: Tier | undefined } = {},
  ): Promise<MemoryItem> {
    const item = this.get(id)
    if (!item || item.status !== 'pending')
      throw new MemoryError('not-found', 'Đề xuất này đã được trả lời hoặc không còn.')
    const review: Review = { at: this.now().toISOString(), by, decision }
    if (decision === 'discarded') return this.change(id, () => ({ status: 'deleted', review }))
    const text = patch.text?.trim() || item.text
    const tier = patch.tier ?? item.tier
    if (tier === 'core' && item.trust === 'external')
      throw new MemoryError('untrusted-core', 'Nội dung từ nguồn ngoài không lên lõi được.')
    if (tier === 'core') this.assertFits(item.bot, item.book, text, id)
    return this.change(id, () => ({ status: 'active', text, tier, review }))
  }

  /** Bỏ các đề xuất quá hạn; trả các đề xuất vừa bỏ. */
  async expire(days = PROPOSAL_DAYS): Promise<MemoryItem[]> {
    const cutoff = this.now().getTime() - days * 86_400_000
    const out: MemoryItem[] = []
    for (const item of this.pending())
      if (Date.parse(item.createdAt) < cutoff) out.push(await this.review(item.id, 'discarded', 'timeout'))
    return out
  }

  /** Số đề xuất người dùng đã trả lời hôm nay (giờ máy). */
  reviewedToday(): number {
    const day = this.now().toDateString()
    let n = 0
    for (const [, i] of this.table.entries())
      if (i.review && i.review.by !== 'timeout' && new Date(i.review.at).toDateString() === day) n++
    return n
  }

  private async change(id: string, patch: (item: MemoryItem) => Partial<MemoryItem>): Promise<MemoryItem> {
    const item = this.get(id)
    if (!item) throw new MemoryError('not-found', `Không thấy ký ức ${id}.`)
    const next: MemoryItem = {
      ...item,
      ...patch(item),
      revision: item.revision + 1,
      updatedAt: this.now().toISOString(),
    }
    await this.table.put(id, next)
    return next
  }

  async update(id: string, text: string): Promise<MemoryItem> {
    const trimmed = text.trim()
    if (!trimmed) throw new MemoryError('empty', 'Nội dung ký ức rỗng.')
    const item = this.get(id)
    if (item?.tier === 'core' && item.status === 'active') this.assertFits(item.bot, item.book, trimmed, id)
    return this.change(id, () => ({ text: trimmed }))
  }

  /** Xoá mềm: bản ghi còn lại để truy vết, không còn hiện và không nạp vào prompt. */
  async forget(id: string): Promise<MemoryItem> {
    return this.change(id, () => ({ status: 'deleted' }))
  }

  async demote(id: string): Promise<MemoryItem> {
    return this.change(id, () => ({ tier: 'archive' }))
  }

  async promote(id: string): Promise<MemoryItem> {
    const item = this.get(id)
    if (item?.trust === 'external')
      throw new MemoryError('untrusted-core', 'Nội dung từ nguồn ngoài không lên lõi được.')
    if (item) this.assertFits(item.bot, item.book, item.text, id)
    return this.change(id, () => ({ tier: 'core' }))
  }

  /** Duyệt ký ức chờ: thành ký ức hiệu lực ở tầng của nó. */
  async approve(id: string): Promise<MemoryItem> {
    const item = this.get(id)
    if (item?.tier === 'core') this.assertFits(item.bot, item.book, item.text, id)
    return this.change(id, () => ({ status: 'active' }))
  }

  /** Tìm theo từ khoá không dấu trong ký ức đang hiệu lực; tăng lượt dùng của kết quả. */
  /** Ký ức riêng của bot (cuốn ghi chú, đang dùng) để nhân bản hay xuất ra tệp. */
  notesOf(bot: string): { text: string; kind: Kind; tier: Tier }[] {
    return this.list(bot, { book: 'notes', status: 'active' }).map((i) => ({
      text: i.text,
      kind: i.kind,
      tier: i.tier,
    }))
  }

  /**
   * Nạp ký ức riêng cho bot (nhân bản, nhập từ tệp). Loại ký ức lạ thành `lesson`; lõi đầy thì mục
   * còn lại xuống lưu trữ. Trả số mục đã nạp.
   */
  async importNotes(
    bot: string,
    items: readonly { text: string; kind: string; tier: string }[],
  ): Promise<number> {
    let n = 0
    for (const it of items) {
      const kind = (KINDS as readonly string[]).includes(it.kind) ? (it.kind as Kind) : 'lesson'
      const base = { bot, text: it.text, kind, book: 'notes' as const, trust: 'agent-inferred' as const }
      try {
        await this.save({ ...base, tier: it.tier === 'core' ? 'core' : 'archive' })
      } catch (e) {
        if (!(e instanceof MemoryError) || it.tier !== 'core') continue
        try {
          await this.save({ ...base, tier: 'archive' })
        } catch {
          continue
        }
      }
      n++
    }
    return n
  }

  /** Cột phải hồ sơ bot: mức đầy ký ức lõi riêng của bot và vài ký ức mới học. */
  statsOf(
    bot: string,
    recent = 3,
  ): {
    core: Usage
    recent: {
      id: string
      text: string
      at: string
      kind: Kind
      tier: Tier
      trust: string
      sessionId?: string
    }[]
  } {
    return {
      core: this.usage(bot, 'notes'),
      recent: this.list(bot, { book: 'notes', status: 'active' })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, recent)
        .map((i) => ({
          id: i.id,
          text: i.text,
          at: i.createdAt,
          kind: i.kind,
          tier: i.tier,
          trust: i.trust,
          ...(i.source.sessionId ? { sessionId: i.source.sessionId } : {}),
        })),
    }
  }

  /**
   * Tìm trong ký ức đang hiệu lực của mọi bot (Hỏi bộ não, giai đoạn 5): cả hai cuốn, lõi và lưu trữ.
   * Chỉ đọc: không tính là bot đã dùng ký ức.
   */
  searchAll(query: string, limit = 8): MemoryItem[] {
    const q = words(query)
    if (q.length === 0) return []
    const out: { item: MemoryItem; score: number }[] = []
    for (const [, item] of this.table.entries()) {
      if (item.status !== 'active') continue
      const w = new Set(words(item.text))
      const hits = q.filter((x) => w.has(x) || [...w].some((y) => y.startsWith(x))).length
      if (hits) out.push({ item, score: hits / q.length })
    }
    return out
      .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
      .slice(0, limit)
      .map((x) => x.item)
  }

  async search(bot: string, query: string, limit = 8): Promise<MemoryItem[]> {
    const q = words(query)
    if (q.length === 0) return []
    const scored = this.list(bot, { status: 'active' })
      .map((item) => {
        const w = new Set(words(item.text))
        const hits = q.filter((x) => w.has(x) || [...w].some((y) => y.startsWith(x))).length
        return { item, score: hits / q.length }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
      .slice(0, limit)
    const at = this.now().toISOString()
    for (const { item } of scored)
      await this.table.put(item.id, { ...item, uses: item.uses + 1, lastUsedAt: at })
    return scored.map((x) => this.get(x.item.id)!)
  }
}

const BOOK_TITLE: Record<Book, string> = {
  notes: 'Ghi chú của bot (môi trường, quy ước, bài học)',
  owner: 'Hồ sơ người dùng (sở thích, thói quen)',
}

/** Đoạn ký ức lõi đưa vào prompt; rỗng khi chưa có gì để không thêm tin thừa. */
export function renderCore(items: readonly MemoryItem[]): string {
  const core = items.filter((m) => m.tier === 'core' && m.status === 'active')
  if (core.length === 0) return ''
  const parts = [
    '<aris-memory>',
    'Ký ức lõi đã lưu từ các phiên trước (mã trong ngoặc vuông dùng cho tool memory):',
  ]
  for (const book of BOOKS) {
    const rows = core.filter((m) => m.book === book).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (rows.length === 0) continue
    parts.push('', `## ${BOOK_TITLE[book]}`, ...rows.map((m) => `- [${m.id}] ${m.text}`))
  }
  parts.push('</aris-memory>')
  return parts.join('\n')
}
