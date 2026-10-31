/** Storage domain `aris_backup`: cài đặt, trạng thái lần chạy trong ngày, nhật ký sao lưu và diễn tập. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { BackupSettings, RunState } from './policy.js'

const settingsRecord: z.ZodType<BackupSettings> = z.object({
  enabled: z.boolean(),
  dir: z.string(),
  time: z.string(),
  keepDaily: z.number(),
  keepWeekly: z.number(),
  notify: z.boolean(),
  codeId: z.string().optional(),
  codeSetAt: z.string().optional(),
  pendingCodeId: z.string().optional(),
})

const stateRecord: z.ZodType<RunState> = z.object({
  day: z.string(),
  attempts: z.number(),
  lastAt: z.number(),
  ok: z.boolean(),
})

/** Mã bước diễn tập cũ (tiếng Việt) còn trong nhật ký đã lưu: đọc thì quy về mã mới. */
export const LEGACY_STEP_IDS: Readonly<Record<string, string>> = {
  'giai-ma': 'decrypt',
  'giai-nen': 'unpack',
  kho: 'stores',
  'bo-nao': 'brain',
  khop: 'file-count',
}

const step = z.object({
  id: z.preprocess(
    (v) => (typeof v === 'string' ? (LEGACY_STEP_IDS[v] ?? v) : v),
    z.enum(['decrypt', 'unpack', 'stores', 'brain', 'file-count']),
  ),
  ok: z.boolean(),
  n: z.number().optional(),
  of: z.number().optional(),
  error: z.string().optional(),
})

export const runRecord = z.object({
  id: z.string(),
  kind: z.enum(['backup', 'drill']),
  at: z.string(),
  ok: z.boolean(),
  /** Tên tệp sao lưu. */
  file: z.string().optional(),
  bytes: z.number().optional(),
  files: z.number().optional(),
  missing: z.number().optional(),
  ms: z.number(),
  error: z.string().optional(),
  steps: z.array(step).optional(),
})
export type RunRecord = z.infer<typeof runRecord>

export const backupDomain = defineDomain({
  name: 'aris_backup',
  version: 1,
  layout: 'per-record',
  tables: {
    settings: domainTable<string, BackupSettings>(settingsRecord),
    state: domainTable<string, RunState>(stateRecord),
    runs: domainTable<string, RunRecord>(runRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
