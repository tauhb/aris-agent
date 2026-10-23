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

export const commanderDomain = defineDomain({
  name: 'aris_commander',
  version: 1,
  layout: 'per-record',
  tables: { dispatch: domainTable<string, DispatchRecord>(dispatchRecord) },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
