/** Storage domain `aris_skills`: skill của từng bot và các bản của skill. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { EvalRecord } from './eval.js'
import type { CuratorPlan, SkillRecord, VersionRecord } from './store.js'

const skill: z.ZodType<SkillRecord> = z.object({
  id: z.string(),
  bot: z.string(),
  name: z.string(),
  description: z.string(),
  whenToUse: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived', 'rejected']),
  version: z.number().int(),
  uses: z.number().int(),
  lastUsedAt: z.string().optional(),
  activatedAt: z.string().optional(),
  pinned: z.boolean().optional(),
  archivedAt: z.string().optional(),
  archivedBy: z.enum(['user', 'curator']).optional(),
  cases: z
    .array(z.object({ request: z.string(), sessionId: z.string().optional(), at: z.string() }))
    .optional(),
  /** Skill của đội (`bot` là `TEAM_OWNER`): bot nào được dùng. */
  assigned: z.union([z.literal('all'), z.array(z.string())]).optional(),
  /** Số lượt dùng theo từng bot (skill của đội). */
  usesBy: z.record(z.string(), z.number().int()).optional(),
  mergedInto: z.string().optional(),
  mergeSkips: z.array(z.object({ with: z.string(), at: z.string() })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const version: z.ZodType<VersionRecord> = z.object({
  id: z.string(),
  skill: z.string(),
  bot: z.string(),
  name: z.string(),
  version: z.number().int(),
  body: z.string(),
  description: z.string(),
  whenToUse: z.string().optional(),
  status: z.enum(['proposed', 'active', 'superseded', 'rejected']),
  by: z.enum(['reflect', 'user', 'restore', 'import', 'merge']),
  why: z.string().optional(),
  quote: z.string().optional(),
  sessionId: z.string().optional(),
  from: z.number().int().optional(),
  warnings: z.array(z.string()),
  /** Dấu hiệu nguy hiểm của skill nhập từ ngoài (bộ quét `scanImported`), hiện đỏ ở thẻ duyệt. */
  risks: z.array(z.string()).optional(),
  /** Nơi nhập từ đâu (chỉ có ở bản nhập từ ngoài). */
  source: z
    .object({
      kind: z.enum(['github', 'claude-code', 'codex', 'folder']),
      repo: z.string().optional(),
      ref: z.string().optional(),
      sha: z.string().optional(),
      path: z.string(),
      importedAt: z.string(),
    })
    .optional(),
  /** Tệp kèm đã chép (đường dẫn tương đối trong thư mục tệp kèm của bản). */
  files: z.array(z.string()).optional(),
  /** Bot được gán khi bản này được duyệt (skill của đội). */
  assignOnApprove: z.union([z.literal('all'), z.array(z.string())]).optional(),
  mergeOf: z.string().optional(),
  at: z.string(),
  review: z
    .object({
      at: z.string(),
      by: z.enum(['user', 'telegram', 'timeout', 'replaced']),
      decision: z.enum(['approved', 'rejected']),
    })
    .optional(),
})

const run = z.object({
  session: z.string(),
  steps: z.number().int(),
  tokens: z.number().int(),
  answer: z.string(),
  denied: z.number().int(),
  pass: z.boolean().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
})

const evalRecord: z.ZodType<EvalRecord> = z.object({
  id: z.string(),
  skill: z.string(),
  version: z.number().int(),
  base: z.number().int(),
  at: z.string(),
  status: z.enum(['running', 'done', 'failed', 'stopped']),
  cases: z.array(z.object({ request: z.string(), base: run.optional(), cand: run.optional() })),
  usd: z.number(),
  cap: z.number(),
  note: z.string().optional(),
  finishedAt: z.string().optional(),
})

const curatorItem = z.object({ id: z.string(), name: z.string(), bot: z.string(), idle: z.number().int() })

/** Kết quả một lần tìm skill trùng (đợt 8.2), ghi vào báo cáo của người dọn kho. */
export interface DupReport {
  /** Số cặp nghi trùng đã xét. */
  pairs: number
  /** Đề xuất gộp đã mở: tên hai skill và skill giữ lại. */
  proposed: { a: string; b: string; keep: string }[]
  /** Cặp chồng nhau một phần: chỉ ghi lại, không đề xuất. */
  overlap: { a: string; b: string; reason: string }[]
  usd: number
  /** Dừng giữa chừng vì hết trần tiền. */
  capped?: boolean | undefined
}

/** Một lần chạy của người dọn kho (báo cáo). */
export interface CuratorRun extends CuratorPlan {
  at: string
  dupes?: DupReport | undefined
}

const curatorRun: z.ZodType<CuratorRun> = z.object({
  at: z.string(),
  archive: z.array(curatorItem),
  stale: z.array(curatorItem),
  dupes: z
    .object({
      pairs: z.number().int(),
      proposed: z.array(z.object({ a: z.string(), b: z.string(), keep: z.string() })),
      overlap: z.array(z.object({ a: z.string(), b: z.string(), reason: z.string() })),
      usd: z.number(),
      capped: z.boolean().optional(),
    })
    .optional(),
})

export const skillsDomain = defineDomain({
  name: 'aris_skills',
  version: 1,
  layout: 'per-record',
  tables: {
    skills: domainTable<string, SkillRecord>(skill),
    versions: domainTable<string, VersionRecord>(version),
    evals: domainTable<string, EvalRecord>(evalRecord),
    curator_runs: domainTable<string, CuratorRun>(curatorRun),
  },
})
