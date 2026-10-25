/** Storage domain `aris_guard`: cài đặt hàng rào, nhật ký chặn, mức báo ngân sách đã gửi. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { GuardSettings } from './policy.js'

const settingsRecord: z.ZodType<GuardSettings> = z.object({
  teamCapUsd: z.number(),
  warnPct: z.number(),
  capMode: z.enum(['bg', 'all']),
  mode: z.enum(['ask', 'auto']),
  approvalMin: z.number(),
  stopped: z.boolean(),
  stoppedAt: z.string().optional(),
})

export const blockedRecord = z.object({
  id: z.string(),
  at: z.string(),
  bot: z.string(),
  session: z.string(),
  tool: z.string(),
  what: z.string(),
})
export type BlockedRecord = z.infer<typeof blockedRecord>

export const noticeRecord = z.object({
  day: z.string(),
  levels: z.array(z.enum(['nguong', 'tran'])),
  at: z.string(),
})
export type NoticeRecord = z.infer<typeof noticeRecord>

export const guardDomain = defineDomain({
  name: 'aris_guard',
  version: 1,
  layout: 'per-record',
  tables: {
    settings: domainTable<string, GuardSettings>(settingsRecord),
    blocked: domainTable<string, BlockedRecord>(blockedRecord),
    notices: domainTable<string, NoticeRecord>(noticeRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
