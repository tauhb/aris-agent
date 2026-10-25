/** Storage domain `aris_acp`: cài đặt mặt ACP và nhật ký việc của phiên khách. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const settingsRecord = z.object({
  /** Nghe socket nội bộ cho `aris-acp`. */
  enabled: z.boolean(),
  /** Mã bot mở cho ứng dụng khác. */
  open: z.array(z.string()),
  rules: z.object({ ask: z.boolean(), untrusted: z.boolean(), nomem: z.boolean(), notools: z.boolean() }),
})
export type SettingsRecord = z.infer<typeof settingsRecord>

export const RESULTS = ['mo-phien', 'cho-phep', 'ung-dung-duyet', 'ung-dung-tu-choi', 'chan'] as const
export type LogResult = (typeof RESULTS)[number]

export const logRecord = z.object({
  id: z.string(),
  at: z.string(),
  app: z.string(),
  bot: z.string(),
  session: z.string(),
  what: z.string(),
  result: z.enum(RESULTS),
  reason: z.string().optional(),
  callId: z.string().optional(),
})
export type LogRecord = z.infer<typeof logRecord>

export const acpDomain = defineDomain({
  name: 'aris_acp',
  version: 1,
  layout: 'per-record',
  tables: {
    settings: domainTable<string, SettingsRecord>(settingsRecord),
    log: domainTable<string, LogRecord>(logRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
