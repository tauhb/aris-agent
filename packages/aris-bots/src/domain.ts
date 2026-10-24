/**
 * Storage domain `aris_bots` (backend của dsh, mỗi bản ghi một tệp). Khoá bản ghi chỉ gồm chữ,
 * số và `-` (ràng buộc của storage dsh).
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { externalRecord } from './external.js'

export const modelRef = z.object({ provider: z.string(), model: z.string() })

export const botRecord = z.object({
  /** Mã nội bộ cố định: `aris` cho Commander, `b-xxxxxx` cho bot khác. */
  id: z.string(),
  kind: z.enum(['commander', 'member']),
  /** Tên gọi `@handle`: chữ thường không dấu, số, `-`. */
  handle: z.string(),
  name: z.string(),
  role: z.string(),
  /** Mô tả năng lực: Commander dựa vào đây để chọn người. */
  description: z.string(),
  /** Tính cách, cách làm việc, giọng văn. */
  soul: z.string(),
  mascot: z.string(),
  model: modelRef.optional(),
  department: z.string().optional(),
  /** Bot ngoài (Claude Code, Codex, ACP): chạy qua plugin của dsh, không có phiên riêng. */
  external: externalRecord.optional(),
  createdAt: z.string(),
})
export type BotRecord = z.infer<typeof botRecord>

/** Chính sách chung của phòng ban (xem `policy.ts`). */
export const policyRecord = z.object({
  /** Model mặc định cho bot chưa đặt model riêng. */
  model: modelRef.optional(),
  /** Trần chi phí mỗi ngày của cả phòng (USD); không có là không giới hạn. */
  budgetUsd: z.number().nonnegative().optional(),
  /** Chạm trần: dừng việc mới, hay chỉ báo. */
  onBudget: z.enum(['stop', 'warn']),
  web: z.boolean(),
  write: z.boolean(),
  shell: z.boolean(),
})
export type PolicyRecord = z.infer<typeof policyRecord>

export const departmentRecord = z.object({
  id: z.string(),
  name: z.string(),
  /** Phòng làm gì (dòng phụ của trang Phòng ban). */
  about: z.string().optional(),
  policy: policyRecord.optional(),
  /** Mã nội bộ của bot trưởng nhóm. */
  lead: z.string().optional(),
  order: z.number().int(),
})
export type DepartmentRecord = z.infer<typeof departmentRecord>

/** Phiên → bot. Phiên không có ở đây là phiên của Commander. */
export const sessionRecord = z.object({
  bot: z.string(),
  via: z.enum(['open', 'team', 'dispatch']),
  at: z.string(),
  /** Mã phiên gốc (khoá bản ghi đã thay ký tự lạ). */
  session: z.string().optional(),
})
export type SessionRecord = z.infer<typeof sessionRecord>

/**
 * Cách xưng hô với người dùng (một bản ghi, khoá `main`). Không viết cứng "anh", "chị", "chủ nhân":
 * bot hỏi lần đầu rồi lưu bằng tool `xung_ho`; sửa được ở trang Hồ sơ.
 */
export const ownerRecord = z.object({
  /** Tên người dùng. */
  name: z.string().optional(),
  /** Bot gọi người dùng là gì ("anh", "chị Hà", "bạn", "sếp"…). */
  call: z.string().optional(),
  /** Bot tự xưng là gì ("em", "tôi", "mình"…). */
  self: z.string().optional(),
  updatedAt: z.string(),
})
export type OwnerRecord = z.infer<typeof ownerRecord>

/** Một mục việc gần đây của đội (giữ 30 mục mới nhất). */
export const activityRecord = z.object({
  bot: z.string(),
  kind: z.enum(['assigned', 'started', 'done', 'failed', 'waiting']),
  task: z.string().optional(),
  at: z.number(),
})
export type ActivityRecord = z.infer<typeof activityRecord>

export const botsDomain = defineDomain({
  name: 'aris_bots',
  version: 1,
  layout: 'per-record',
  tables: {
    bots: domainTable<string, BotRecord>(botRecord),
    departments: domainTable<string, DepartmentRecord>(departmentRecord),
    sessions: domainTable<string, SessionRecord>(sessionRecord),
    activity: domainTable<string, ActivityRecord>(activityRecord),
    owner: domainTable<string, OwnerRecord>(ownerRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface Tables {
  bots: Table<BotRecord>
  departments: Table<DepartmentRecord>
  sessions: Table<SessionRecord>
  owner?: Table<OwnerRecord>
}
