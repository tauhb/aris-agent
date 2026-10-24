/** Storage domain `aris_autonomy`: mục tiêu đã chấm (giám khảo /goal) và vòng lặp, nhịp tim. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const verdict = z.object({
  verdict: z.enum(['done', 'continue', 'blocked']),
  reason: z.string(),
  missing: z.string().optional(),
  round: z.number().int(),
  at: z.string(),
})

/** Mục tiêu hiện tại của một phiên (khoá: mã phiên đã thay ký tự lạ). */
export const goalRecord = z.object({
  sessionId: z.string(),
  bot: z.string(),
  goalId: z.string(),
  objective: z.string(),
  phase: z.enum(['active', 'paused', 'blocked', 'complete', 'cleared']),
  rounds: z.number().int(),
  max: z.number().int(),
  blocked: z.object({ code: z.string(), message: z.string() }).optional(),
  /** 5 lần chấm gần nhất. */
  verdicts: z.array(verdict),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type GoalRecord = z.infer<typeof goalRecord>

/** Một vòng lặp (`/loop`) hay nhịp tim (`/heartbeat`) chạy trên lịch nhắc của dsh. */
export const loopRecord = z.object({
  id: z.string(),
  sessionId: z.string(),
  bot: z.string(),
  kind: z.enum(['loop', 'heartbeat']),
  mode: z.enum(['fixed', 'auto']),
  /** Nhịp hiện tại (giây). */
  seconds: z.number().int(),
  task: z.string(),
  scheduleId: z.string(),
  runs: z.number().int(),
  /** Số lần liền câu trả lời không đổi (tự điều nhịp). */
  same: z.number().int(),
  lastAnswer: z.string().optional(),
  lastAt: z.string().optional(),
  active: z.boolean(),
  createdAt: z.string(),
})
export type LoopRecord = z.infer<typeof loopRecord>

export const autonomyDomain = defineDomain({
  name: 'aris_autonomy',
  version: 1,
  layout: 'per-record',
  tables: {
    goals: domainTable<string, GoalRecord>(goalRecord),
    loops: domainTable<string, LoopRecord>(loopRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Khoá bản ghi từ mã phiên (storage dsh chỉ nhận chữ, số, `-`). */
export const keyOf = (sessionId: string) => sessionId.replace(/[^A-Za-z0-9-]/g, '-')
