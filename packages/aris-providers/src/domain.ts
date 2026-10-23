/**
 * Storage domain `aris_providers` (backend của dsh, mỗi bản ghi một tệp). Khoá bản ghi chỉ gồm
 * chữ, số và `-`. Không bao giờ lưu giá trị khoá ở đây: khoá nằm trong kho khoá của dsh.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const link = z.object({ provider: z.string(), model: z.string() })
export type Link = z.infer<typeof link>

/** Thứ tự dự phòng (một bản ghi, khoá `main`). */
export const chainRecord = z.object({ links: z.array(link) })
export type ChainRecord = z.infer<typeof chainRecord>

export const slotRecord = z.object({
  /** Mã nhận diện: 4 ký tự băm từ khoá, không lộ ký tự nào của khoá. */
  fp: z.string(),
  addedAt: z.number(),
  /** Lần cuối khoá này bị đổi đi vì lỗi (ms) và mã lỗi. */
  failedAt: z.number().optional(),
  error: z.string().optional(),
})
export type SlotRecord = z.infer<typeof slotRecord>

/** Vòng khoá của một provider; khoá `i` (từ 1) nằm ở `<ref>_ARIS_<i>`. */
export const poolRecord = z.object({
  provider: z.string(),
  /** Tên khoá provider đang đọc (ví dụ `OPENROUTER_API_KEY`). */
  ref: z.string(),
  slots: z.array(slotRecord),
  /** Khoá đang dùng (từ 1). */
  active: z.number().int(),
})
export type PoolRecord = z.infer<typeof poolRecord>

/** Chi phí cộng dồn của một model trong một ngày. */
export const ledgerRecord = z.object({
  day: z.string(),
  provider: z.string(),
  model: z.string(),
  calls: z.number().int(),
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  /** USD; model chưa có giá thì không cộng. */
  usd: z.number(),
  priced: z.boolean(),
})
export type LedgerRecord = z.infer<typeof ledgerRecord>

/** Phiên vừa chuyển dự phòng: lượt sau trả về model cũ nếu phiên không có model chọn. */
export const switchRecord = z.object({ from: link, to: link, turn: z.number().int() })
export type SwitchRecord = z.infer<typeof switchRecord>

export const providersDomain = defineDomain({
  name: 'aris_providers',
  version: 1,
  layout: 'per-record',
  tables: {
    chain: domainTable<string, ChainRecord>(chainRecord),
    pools: domainTable<string, PoolRecord>(poolRecord),
    ledger: domainTable<string, LedgerRecord>(ledgerRecord),
    switches: domainTable<string, SwitchRecord>(switchRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
