/** Storage domain `aris_stats`: từng lần gọi model, tổng theo phiên và ngày, sự kiện duyệt và hỏi người dùng. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const KINDS = ['chat', 'giao', 'routine', 'hoc'] as const
/** Loại việc, khớp bốn màu của biểu đồ: chat, việc được giao, routine, vòng học và kiểm thử. */
export type Kind = (typeof KINDS)[number]

export const SOURCES = ['web', 'telegram', 'lark', 'zalo', 'lich', 'commander', 'app', 'nen', 'giao'] as const
/** Nơi việc bắt nguồn (cột Nguồn của nhật ký). */
export type Source = (typeof SOURCES)[number]

const kind = z.enum(KINDS)
const source = z.enum(SOURCES)

export const callRecord = z.object({
  /** Lúc gọi (ms). */
  at: z.number(),
  /** Ngày theo giờ máy, `2026-10-26`. */
  day: z.string(),
  session: z.string().optional(),
  bot: z.string().optional(),
  kind,
  source,
  provider: z.string(),
  model: z.string(),
  /** Token đầu vào chưa qua cache (dsh trừ phần đọc cache ra). */
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  usd: z.number(),
})
export type CallRecord = z.infer<typeof callRecord>

export const sessionRecord = z.object({
  day: z.string(),
  /** Mã phiên; rỗng là khoản gom của các lần gọi ngoài phiên (vòng học nền) trong ngày. */
  session: z.string(),
  bot: z.string(),
  kind,
  source,
  /** Tên bot giao việc, nếu có. */
  by: z.string().optional(),
  firstAt: z.number(),
  lastAt: z.number(),
  calls: z.number(),
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  usd: z.number(),
  /** USD tiết kiệm được nhờ cache so với tính giá đầu vào thường (chỉ model có giá). */
  saveUsd: z.number(),
  /** USD đầu vào nếu không có cache (cùng phạm vi model có giá), mẫu số của phần trăm tiết kiệm. */
  fullInUsd: z.number(),
  /** Trong ngày này phiên đã phải hỏi người dùng (xin duyệt hay hỏi). */
  asked: z.boolean(),
})
export type SessionRecord = z.infer<typeof sessionRecord>

export const eventRecord = z.object({
  at: z.number(),
  session: z.string(),
  type: z.enum(['duyet', 'hoi']),
  tool: z.string().optional(),
  /** Mã lời gọi công cụ, để ghép với bước công cụ khi phát lại. */
  callId: z.string().optional(),
  /** Mô tả ngắn của lời gọi (lệnh, đường dẫn, câu hỏi). */
  what: z.string().optional(),
  /** Kết quả duyệt: `allowed-once`, `rejected`, `cancelled`, `unavailable`. */
  decision: z.string().optional(),
  waitedMs: z.number().optional(),
})
export type EventRecord = z.infer<typeof eventRecord>

export const statsDomain = defineDomain({
  name: 'aris_stats',
  version: 1,
  layout: 'per-record',
  tables: {
    calls: domainTable<string, CallRecord>(callRecord),
    sessions: domainTable<string, SessionRecord>(sessionRecord),
    events: domainTable<string, EventRecord>(eventRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
