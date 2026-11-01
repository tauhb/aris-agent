/** Storage domain `aris_commander`: nhật ký giao việc (quyết định định tuyến) cho trang 2.5. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { commanderSettings, type CommanderSettings } from './settings.js'

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
  /** Loại việc Commander ghi khi giao (tự học: ai làm tốt việc gì). */
  kind: z.string().optional(),
  /** Kết quả lượt của bot: xong, vấp, bị dừng. */
  outcome: z.enum(['done', 'failed', 'stopped']).optional(),
  finishedAt: z.string().optional(),
  /** Câu trả lời cuối của bot (cắt ngắn): thẻ sau đọc làm đầu vào (Driver). */
  answer: z.string().optional(),
})
export type DispatchRecord = z.infer<typeof dispatchRecord>

/** Trạng thái Driver của một dự án (khoá: mã workspace). */
export const driverRecord = z.object({
  woken: z.array(z.string()),
  failures: z.record(z.string(), z.number()),
  counted: z.record(z.string(), z.string()),
  gaveUp: z.array(z.string()),
  stuck: z.array(z.string()),
  allDone: z.boolean().optional(),
})

/**
 * Việc lớn giao cho cả phòng ban (bước 3d): trưởng nhóm làm trưởng Team ở một phiên gốc riêng
 * (trong thư mục dự án), chia cho thành viên phòng, nộp báo cáo về phiên của Commander.
 */
export const jobRecord = z.object({
  id: z.string(),
  department: z.string(),
  /** Bot trưởng nhóm (mã nội bộ). */
  lead: z.string(),
  title: z.string(),
  task: z.string(),
  /** Phiên của Commander giao việc (nhận báo cáo). */
  parentSession: z.string(),
  /** Phiên gốc của trưởng nhóm cho việc này. */
  session: z.string(),
  /** Workspace (dự án) chứa phiên; không có là chỗ chat riêng. */
  workspace: z.string().optional(),
  status: z.enum(['running', 'done', 'failed']),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  /** Báo cáo cuối của trưởng nhóm (cắt ngắn). */
  result: z.string().optional(),
})
export type JobRecord = z.infer<typeof jobRecord>

/** Một tin trong phòng nhóm: bot nói, bỏ lượt, bị bỏ qua (không thuộc dự án, đang bận, bị dừng). */
export const roomEntry = z.object({
  bot: z.string(),
  handle: z.string(),
  name: z.string(),
  role: z.string().optional(),
  at: z.string(),
  kind: z.enum(['say', 'pass', 'skip', 'stopped', 'error']),
  /** Vì sao bot không nói (giao diện dịch theo mã này). */
  reason: z.enum(['not-member', 'busy', 'no-messages', 'user-stopped', 'interrupted', 'timeout']).optional(),
  text: z.string(),
})
export type RoomEntry = z.infer<typeof roomEntry>

/**
 * Một vòng của phòng nhóm (bước 3e): một lần Aris gọi `moi_noi` trong phiên chính của dự án, khoá
 * theo mã lần gọi công cụ để khung chat vẽ đúng chỗ.
 */
export const roundRecord = z.object({
  callId: z.string(),
  session: z.string(),
  round: z.number().int(),
  maxRounds: z.number().int(),
  /** Tin của các bot đã dùng trong lượt (tính cả vòng này), trên tối đa. */
  used: z.number().int(),
  maxMessages: z.number().int(),
  status: z.enum(['running', 'done', 'stopped']),
  /** Bot đang nói (tên gọi), khi vòng đang chạy. */
  speaking: z.string().optional(),
  entries: z.array(roomEntry),
  /** Mỗi tin đã ghi thành bản ghi riêng trong phiên (khung chat vẽ tin của từng bot). */
  posted: z.boolean().optional(),
  createdAt: z.string(),
})
export type RoundRecord = z.infer<typeof roundRecord>

/** Một bước của bot ngoài (`claude-driver.ts`). */
export const externalStep = z.object({
  id: z.string(),
  kind: z.string(),
  target: z.string().optional(),
  tool: z.string().optional(),
  status: z.enum(['running', 'done', 'failed']),
  at: z.string(),
})

/** Một lần chạy của bot ngoài (bước 4): CLI trên máy (có từng bước) hoặc plugin dsh (chỉ kết quả cuối). */
export const externalRunRecord = z.object({
  id: z.string(),
  bot: z.string(),
  handle: z.string(),
  name: z.string(),
  agent: z.string(),
  title: z.string(),
  task: z.string(),
  /** Phiên giao việc (nhận kết quả thành thông báo). */
  parentSession: z.string(),
  cwd: z.string().optional(),
  /** Worktree riêng: nhánh, thư mục, repo gốc. */
  worktree: z.object({ branch: z.string(), dir: z.string(), repo: z.string().optional() }).optional(),
  /** Chạy bằng CLI trên máy (bộ chuyển tự viết) hay plugin dsh. */
  runtime: z.enum(['cli', 'plugin']).optional(),
  /** Từng bước (CLI): làm gì, với cái gì, xong chưa; giữ 60 bước cuối. */
  steps: z.array(externalStep).optional(),
  /** Yêu cầu quyền đang chờ người dùng (thẻ duyệt trên nhánh). */
  pending: z.array(externalStep.omit({ status: true })).optional(),
  /** Yêu cầu quyền đã trả lời (20 cái cuối). */
  answered: z
    .array(
      externalStep
        .omit({ status: true })
        .extend({ allow: z.boolean(), by: z.enum(['user', 'telegram', 'timeout', 'ended']) }),
    )
    .optional(),
  costUsd: z.number().optional(),
  budgetUsd: z.number().optional(),
  /** Phiên của agent ngoài (làm tiếp lần sau). */
  sessionRef: z.string().optional(),
  /** Làm tiếp từ lần chạy trước của cùng bot trong cùng cuộc. */
  resumedFrom: z.string().optional(),
  status: z.enum(['running', 'done', 'failed', 'stopped']),
  /** Vì sao dừng: người dùng bấm Dừng, quá giờ, aris khởi động lại. */
  stoppedBy: z.enum(['user', 'timeout', 'restart']).optional(),
  timeoutMin: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  /** Câu trả lời cuối (cắt ngắn). */
  output: z.string().optional(),
  /** Lời báo lỗi an toàn của plugin (không có nội dung việc, đường dẫn hay khoá). */
  diagnostic: z.string().optional(),
  stopReason: z.string().optional(),
})
export type ExternalRunRecord = z.infer<typeof externalRunRecord>

export const commanderDomain = defineDomain({
  name: 'aris_commander',
  version: 1,
  layout: 'per-record',
  tables: {
    dispatch: domainTable<string, DispatchRecord>(dispatchRecord),
    jobs: domainTable<string, JobRecord>(jobRecord),
    rounds: domainTable<string, RoundRecord>(roundRecord),
    externals: domainTable<string, ExternalRunRecord>(externalRunRecord),
    /** Cấu hình Commander (trang 2.5), một bản ghi khoá `commander`. */
    settings: domainTable<string, CommanderSettings>(commanderSettings),
    driver: domainTable<string, z.infer<typeof driverRecord>>(driverRecord),
  },
})

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}
