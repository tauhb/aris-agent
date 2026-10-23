/** Storage domain `aris_commander`: nhật ký giao việc (quyết định định tuyến) cho trang 2.5. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const dispatchRecord = z.object({
  at: z.string(),
  sessionId: z.string(),
  bot: z.string(),
  handle: z.string(),
  title: z.string(),
  task: z.string(),
  reason: z.string(),
  member: z.string(),
  taskId: z.string().optional(),
  reused: z.boolean(),
})
export type DispatchRecord = z.infer<typeof dispatchRecord>

/**
 * Việc lớn giao cho cả phòng ban (bước 3d): trưởng nhóm làm trưởng Team ở một phiên gốc riêng
 * (trong thư mục dự án), chia cho thành viên phòng, nộp báo cáo về phiên của Commander.
 */
export const jobRecord = z.object({
  id: z.string(),
  department: z.string(),
  /** Bot trưởng nhóm (mã nội bộ). */
  lead: z.string(),
  title: z.string(),
  task: z.string(),
  /** Phiên của Commander giao việc (nhận báo cáo). */
  parentSession: z.string(),
  /** Phiên gốc của trưởng nhóm cho việc này. */
  session: z.string(),
  /** Workspace (dự án) chứa phiên; không có là chỗ chat riêng. */
  workspace: z.string().optional(),
  status: z.enum(['running', 'done', 'failed']),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  /** Báo cáo cuối của trưởng nhóm (cắt ngắn). */
  result: z.string().optional(),
})
export type JobRecord = z.infer<typeof jobRecord>

export const commanderDomain = defineDomain({
  name: 'aris_commander',
  version: 1,
  layout: 'per-record',
  tables: {
    dispatch: domainTable<string, DispatchRecord>(dispatchRecord),
    jobs: domainTable<string, JobRecord>(jobRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
