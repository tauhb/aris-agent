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

export const RESULTS = ['session-opened', 'allowed', 'app-approved', 'app-rejected', 'blocked'] as const
export type LogResult = (typeof RESULTS)[number]

/** Kết quả cũ (tiếng Việt) còn trong nhật ký đã lưu: đọc thì quy về giá trị mới. */
export const LEGACY_RESULTS: Readonly<Record<string, LogResult>> = {
  'mo-phien': 'session-opened',
  'cho-phep': 'allowed',
  'ung-dung-duyet': 'app-approved',
  'ung-dung-tu-choi': 'app-rejected',
  chan: 'blocked',
}

export const logRecord = z.object({
  id: z.string(),
  at: z.string(),
  app: z.string(),
  bot: z.string(),
  session: z.string(),
  what: z.string(),
  result: z.preprocess((v) => (typeof v === 'string' ? (LEGACY_RESULTS[v] ?? v) : v), z.enum(RESULTS)),
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
