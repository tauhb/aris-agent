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
}

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
    }
    await this.table.put(item.id, item)
    return item
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
  statsOf(bot: string, recent = 3): { core: Usage; recent: { text: string; at: string }[] } {
    return {
      core: this.usage(bot, 'notes'),
      recent: this.list(bot, { book: 'notes', status: 'active' })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, recent)
        .map((i) => ({ text: i.text, at: i.createdAt })),
    }
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
