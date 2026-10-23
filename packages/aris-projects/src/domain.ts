/**
 * Storage domain `aris_projects`: dự án (quyết định 11) gắn với một workspace của dsh. Khoá bản ghi
 * là mã workspace (chỉ chữ, số, `-`).
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** Luật trò chuyện của dự án (bản vẽ 1.5 "Nâng cao"); chat chung dùng ở bước 3e. */
export const rulesRecord = z.object({
  /** Số vòng tối đa cho mỗi tin của người dùng. */
  maxRounds: z.number().int(),
  /** Số tin tối đa của các bot trong một lượt. */
  maxMessages: z.number().int(),
  /** Hiểu lệnh "dừng @bot". */
  stopCommand: z.boolean(),
  /** Aris chủ trì và tổng hợp cuối mỗi vòng. */
  arisSummarizes: z.boolean(),
})
export type Rules = z.infer<typeof rulesRecord>

export const projectRecord = z.object({
  /** Mã workspace của dsh. */
  workspace: z.string(),
  name: z.string(),
  goal: z.string().optional(),
  /** Mã nội bộ của bot thành viên (không gồm Aris: Aris luôn chủ trì). */
  members: z.array(z.string()),
  rules: rulesRecord,
  /** Phiên chính của dự án: Aris làm trưởng nhóm, Team của dự án là Team của phiên này. */
  mainSession: z.string().optional(),
  /** Chia việc (Kanban 4.3): Aris tự chia thẻ chờ ở lượt sau, hay chỉ khi người dùng bảo. */
  split: z.enum(['auto', 'manual']).optional(),
  createdAt: z.string(),
})
export type ProjectRecord = z.infer<typeof projectRecord>

/**
 * Thẻ người dùng tạo trên Kanban, chờ chia việc. Bảng việc của Team chỉ ghi được bằng agent đang
 * chạy của phiên chính, nên thẻ nằm ở đây cho tới khi Aris giao (thành thẻ `task-n` của Team).
 */
export const cardRecord = z.object({
  id: z.string(),
  workspace: z.string(),
  title: z.string(),
  description: z.string().optional(),
  /** Bot người dùng gợi ý (mã nội bộ). */
  bot: z.string().optional(),
  createdAt: z.string(),
  /** Đã giao: thẻ của Team thay cho thẻ này. */
  taskId: z.string().optional(),
})
export type CardRecord = z.infer<typeof cardRecord>

export const projectsDomain = defineDomain({
  name: 'aris_projects',
  version: 1,
  layout: 'per-record',
  tables: {
    projects: domainTable<string, ProjectRecord>(projectRecord),
    cards: domainTable<string, CardRecord>(cardRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
