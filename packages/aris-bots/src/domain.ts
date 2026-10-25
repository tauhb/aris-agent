/**
 * Storage domain `aris_bots` (backend của dsh, mỗi bản ghi một tệp). Khoá bản ghi chỉ gồm chữ,
 * số và `-` (ràng buộc của storage dsh).
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { externalRecord } from './external.js'
import { mcpRecord, type McpRecord } from './mcp.js'
import { soulRecord, type SoulRecord } from './soul.js'

export const modelRef = z.object({ provider: z.string(), model: z.string() })

const mediaPolicy = z.object({
  mode: z.enum(['off', 'shared', 'own']),
  list: z.array(modelRef).optional(),
  fallback: z.boolean().optional(),
  capUsd: z.number().nonnegative().optional(),
})

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
  /** Bộ công cụ riêng của bot (bản vẽ 2.2); không có là theo chính sách phòng. Tắt thì bot không dùng được kể cả phòng cho phép. */
  tools: z.object({ web: z.boolean(), files: z.boolean(), shell: z.boolean() }).partial().optional(),
  /**
   * Quyền riêng của bot (bản vẽ 2.2, Quyền & kênh). `write`: không ghi, chỉ trong thư mục làm việc,
   * mọi nơi (ngoài thư mục làm việc thì hỏi); mặc định mọi nơi. `danger`: thao tác cần duyệt thì hỏi
   * người dùng hay tự từ chối; mặc định hỏi.
   */
  perms: z
    .object({ write: z.enum(['none', 'workspace', 'anywhere']), danger: z.enum(['ask', 'deny']) })
    .partial()
    .optional(),
  /**
   * Model theo việc (bản vẽ 2.2, tab Model): `goal` khi phiên đang chạy /goal, `fallback` thử trước
   * chuỗi dự phòng chung khi model lỗi. Không có là theo model chat / chuỗi chung.
   */
  models: z.object({ goal: modelRef, fallback: modelRef }).partial().optional(),
  /**
   * Tạo ảnh, tạo video (bản vẽ 2.2f, 6.2c): tắt, theo thứ tự chung, hay danh sách riêng (nhiều model, theo thứ
   * tự); hết danh sách riêng có rơi về thứ tự chung không; trần riêng mỗi ngày. Không có là theo thứ tự chung.
   */
  media: z.object({ image: mediaPolicy, video: mediaPolicy }).partial().optional(),
  /** Commander được giao việc cho bot (bot thường); bot ngoài dùng `external.assignable`. Mặc định có. */
  assignable: z.boolean().optional(),
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
  /** `acp`: phiên do ứng dụng khác mở qua aris-acp (giai đoạn 6). */
  via: z.enum(['open', 'team', 'dispatch', 'acp']),
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
    mcp: domainTable<string, McpRecord>(mcpRecord),
    souls: domainTable<string, SoulRecord>(soulRecord),
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
