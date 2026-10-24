/** Storage domain `aris_reflect`: các lần chạy vòng học nền (để xem lại, tính trần, hiện trên giao diện). */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const runRecord = z.object({
  id: z.string(),
  at: z.string(),
  bot: z.string(),
  sessionId: z.string(),
  reasons: z.array(z.string()),
  /** Số ký tự đoạn đem học. */
  chars: z.number().int(),
  model: z.string().optional(),
  usd: z.number().optional(),
  /** Số đề xuất model trả về và mã các đề xuất đã gửi duyệt (sau khi bỏ trùng). */
  proposed: z.number().int(),
  saved: z.array(z.string()),
  /** Không chạy: hết trần ngày, chưa có model. */
  skipped: z.enum(['budget', 'no-model']).optional(),
  error: z.string().optional(),
})
export type RunRecord = z.infer<typeof runRecord>

export const reflectDomain = defineDomain({
  name: 'aris_reflect',
  version: 1,
  layout: 'per-record',
  tables: { runs: domainTable<string, RunRecord>(runRecord) },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
