/** Storage domain `aris_routine`: routine, các lần chạy, trạng thái chung. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const routineRecord = z.object({
  id: z.string(),
  bot: z.string(),
  title: z.string(),
  /** Lời việc gửi cho bot mỗi lần chạy. */
  task: z.string(),
  cron: z.string(),
  tz: z.string(),
  deliver: z.enum(['telegram', 'none']),
  /** `read`: chỉ đọc, việc khác hỏi qua Telegram; `bot`: theo quyền thường của bot. */
  perms: z.enum(['read', 'bot']),
  /** `agent`: bot làm (mặc định); `script`: chỉ chạy lệnh shell, không dùng AI (đợt 2). */
  mode: z.enum(['agent', 'script']).optional(),
  command: z.string().optional(),
  capUsd: z.number(),
  catchupHours: z.number(),
  enabled: z.boolean(),
  nextAt: z.string().optional(),
  failStreak: z.number().int(),
  /** Đã gửi cảnh báo cho chuỗi lỗi hiện tại. */
  alerted: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type RoutineRecord = z.infer<typeof routineRecord>

export const runRecord = z.object({
  id: z.string(),
  routine: z.string(),
  bot: z.string(),
  sessionId: z.string().optional(),
  /** Lúc theo lịch (chạy tay: lúc bấm). */
  at: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  trigger: z.enum(['schedule', 'catchup', 'manual']),
  status: z.enum(['running', 'done', 'failed', 'stopped', 'cap', 'missed']),
  answer: z.string().optional(),
  /** Việc tiếp theo bot gợi ý (nút trên thẻ Telegram). */
  suggestion: z.string().optional(),
  usd: z.number(),
  error: z.string().optional(),
})
export type RunRecord = z.infer<typeof runRecord>

export const stateRecord = z.object({ paused: z.boolean() })
export type StateRecord = z.infer<typeof stateRecord>

export const routineDomain = defineDomain({
  name: 'aris_routine',
  version: 1,
  layout: 'per-record',
  tables: {
    routines: domainTable<string, RoutineRecord>(routineRecord),
    runs: domainTable<string, RunRecord>(runRecord),
    state: domainTable<string, StateRecord>(stateRecord),
  },
})

/** Bảng đã mở (phần dùng tới). */
export interface Table<T> {
  get(k: string): T | undefined
  entries(): Iterable<[string, T]>
  put(k: string, v: T): Promise<void>
  delete(k: string): Promise<boolean>
}
