/**
 * Duyệt bền và chống lặp (GĐ9.7a, docs/plans/gd9-7-duyet-ben.md):
 * - Yêu cầu duyệt của phiên chính lưu xuống đĩa; hết giờ chờ hay aris khởi động lại thì vẫn còn trong Hộp duyệt.
 *   Người dùng cho phép muộn thì ghi "được phép một lần" cho đúng thao tác (phiên, công cụ, tham số).
 * - Chống lặp: cùng bot, cùng công cụ, cùng tham số đã chạy xong gần đây thì chặn (không gửi trùng cho khách).
 * Phần thuần ở đây; nối vào dsh ở `index.ts`.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Table } from './domain.js'

export const durableRecord = z.object({
  id: z.string(),
  session: z.string(),
  bot: z.string(),
  /** Tên hiển thị của bot lúc hỏi. */
  name: z.string(),
  tool: z.string(),
  /** Băm của tên công cụ và tham số (xem {@link argsHash}). */
  hash: z.string(),
  reason: z.string().optional(),
  at: z.string(),
  /** Đang chờ (lượt có thể đã dừng) hay đã được phép một lần, chờ bot gọi lại. */
  status: z.enum(['pending', 'granted']),
})
export type DurableRecord = z.infer<typeof durableRecord>

/** Bản ghi quá ngần này thì bỏ (người dùng không trả lời, hay bot không gọi lại). */
export const DURABLE_KEEP_MS = 7 * 86_400_000
/** Chống lặp: cùng thao tác trong ngần này thì chặn. */
export const REPEAT_WINDOW_MS = 10 * 60_000

/** JSON có khoá sắp xếp, để cùng tham số khác thứ tự khoá vẫn ra cùng một chuỗi. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v ?? null)
}

/** Băm của một thao tác: tên công cụ cộng tham số (16 ký tự hex). */
export function argsHash(tool: string, args: unknown): string {
  return createHash('sha256')
    .update(`${tool}\n${stable(args)}`)
    .digest('hex')
    .slice(0, 16)
}

/** Kho yêu cầu duyệt bền. */
export class DurableApprovals {
  constructor(
    private readonly table: Table<DurableRecord>,
    private readonly now: () => number = Date.now,
  ) {}

  all(): DurableRecord[] {
    return [...this.table.entries()].map(([, r]) => r).sort((a, b) => a.at.localeCompare(b.at))
  }

  get(id: string): DurableRecord | undefined {
    return this.table.get(id)
  }

  /** Yêu cầu đang chờ (gồm cả yêu cầu mà lượt đã dừng). */
  pending(): DurableRecord[] {
    return this.all().filter((r) => r.status === 'pending')
  }

  async open(r: Omit<DurableRecord, 'status'>): Promise<void> {
    await this.table.put(r.id, { ...r, status: 'pending' })
  }

  /** Lượt còn chờ đã có câu trả lời: bỏ bản ghi. */
  async done(id: string): Promise<void> {
    await this.table.delete(id)
  }

  /** Người dùng cho phép khi lượt không còn chờ: được phép một lần, bot gọi lại đúng thao tác thì chạy. */
  async grant(id: string): Promise<DurableRecord | undefined> {
    const r = this.table.get(id)
    if (!r) return undefined
    const next: DurableRecord = { ...r, status: 'granted', at: new Date(this.now()).toISOString() }
    await this.table.put(id, next)
    return next
  }

  /** Lần được phép một lần khớp thao tác này; dùng xong thì xoá. */
  async take(session: string, tool: string, hash: string): Promise<DurableRecord | undefined> {
    const r = this.all().find(
      (x) => x.status === 'granted' && x.session === session && x.tool === tool && x.hash === hash,
    )
    if (r) await this.table.delete(r.id)
    return r
  }

  /** Bỏ bản ghi quá hạn; trả số bản đã bỏ. */
  async prune(): Promise<number> {
    const old = this.all().filter((r) => this.now() - Date.parse(r.at) > DURABLE_KEEP_MS)
    for (const r of old) await this.table.delete(r.id)
    return old.length
  }
}

/** Thao tác ra ngoài (gửi tin, ghi qua kết nối) cần chống lặp. */
export function isOutbound(tool: string, mcpWrites: (tool: string) => boolean): boolean {
  return (
    tool === 'channel_send' ||
    tool === 'channel_notify_owner' ||
    (tool.startsWith('mcp__') && mcpWrites(tool))
  )
}

/** Sổ các thao tác ra ngoài vừa chạy xong (trong bộ nhớ, giữ {@link REPEAT_WINDOW_MS}). */
export class RepeatGuard {
  private readonly done = new Map<string, number>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly windowMs = REPEAT_WINDOW_MS,
  ) {}

  private key = (bot: string, hash: string) => `${bot}:${hash}`

  /** Lúc thao tác này chạy xong lần trước, nếu còn trong khoảng chống lặp. */
  last(bot: string, hash: string): number | undefined {
    const at = this.done.get(this.key(bot, hash))
    if (at === undefined) return undefined
    if (this.now() - at > this.windowMs) {
      this.done.delete(this.key(bot, hash))
      return undefined
    }
    return at
  }

  record(bot: string, hash: string): void {
    this.done.set(this.key(bot, hash), this.now())
    if (this.done.size > 500) this.done.delete(this.done.keys().next().value!)
  }
}
