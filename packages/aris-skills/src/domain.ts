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
  by: z.enum(['reflect', 'user', 'restore', 'import']),
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

/** Một lần chạy của người dọn kho (báo cáo). */
export interface CuratorRun extends CuratorPlan {
  at: string
}

const curatorRun: z.ZodType<CuratorRun> = z.object({
  at: z.string(),
  archive: z.array(curatorItem),
  stale: z.array(curatorItem),
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
