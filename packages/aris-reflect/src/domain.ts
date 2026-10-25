/** Storage domain `aris_reflect`: các lần chạy vòng học nền (để xem lại, tính trần, hiện trên giao diện). */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { AREAS, type Insight } from './insights.js'

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
  /** Số nhận định về người dùng đã ghi vào hồ sơ của bot (đợt 2). */
  insights: z.number().int().optional(),
  /** Skill hay bản vá đã gửi duyệt (`tên vN`), hoặc lý do bộ kiểm bỏ (đợt 3). */
  skill: z.string().optional(),
  /** Không chạy: hết trần ngày, chưa có model. */
  skipped: z.enum(['budget', 'no-model']).optional(),
  error: z.string().optional(),
})
export type RunRecord = z.infer<typeof runRecord>

const evidence = z.object({ sessionId: z.string().optional(), at: z.string(), quote: z.string().optional() })

/** Nhận định về người dùng của một bot (hồ sơ chủ nhân, màn 2.3). */
export const insightRecord: z.ZodType<Insight> = z.object({
  id: z.string(),
  bot: z.string(),
  area: z.enum(AREAS),
  text: z.string(),
  confidence: z.number(),
  evidence: z.array(evidence),
  hits: z.number().int(),
  confirmed: z.boolean().optional(),
  question: z
    .object({
      text: z.string(),
      options: z.array(z.object({ label: z.string(), text: z.string() })),
      at: z.string(),
    })
    .optional(),
  status: z.enum(['active', 'rejected', 'merged']),
  bots: z.array(z.string()).optional(),
  mergedInto: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Một lần suy luận hồ sơ ba vòng (đợt 5b; màn 2.3 "Lần suy luận gần nhất"). */
export const profileRunRecord = z.object({
  id: z.string(),
  at: z.string(),
  bot: z.string(),
  sessionId: z.string(),
  turns: z.number().int(),
  model: z.string().optional(),
  usd: z.number().optional(),
  /** Vòng 1: số quan sát rút ra. */
  observed: z.number().int(),
  /** Vòng 2: quan sát bị bỏ và lý do. */
  dropped: z.array(z.object({ text: z.string(), why: z.string().optional() })),
  /** Vòng 3: kết quả ghi vào hồ sơ. */
  results: z.array(
    z.object({
      kind: z.enum(['new', 'raise', 'ask', 'share']),
      text: z.string(),
      scope: z.string(),
      confidence: z.number(),
    }),
  ),
  skipped: z.enum(['budget', 'no-model']).optional(),
  error: z.string().optional(),
})
export type ProfileRun = z.infer<typeof profileRunRecord>

export const reflectDomain = defineDomain({
  name: 'aris_reflect',
  version: 1,
  layout: 'per-record',
  tables: {
    runs: domainTable<string, RunRecord>(runRecord),
    insights: domainTable<string, Insight>(insightRecord),
    profile_runs: domainTable<string, ProfileRun>(profileRunRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
