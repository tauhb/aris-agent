/** Storage domain `aris_skills`: skill của từng bot và các bản của skill. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { SkillRecord, VersionRecord } from './store.js'

const skill: z.ZodType<SkillRecord> = z.object({
  id: z.string(),
  bot: z.string(),
  name: z.string(),
  description: z.string(),
  whenToUse: z.string().optional(),
  status: z.enum(['draft', 'active', 'rejected']),
  version: z.number().int(),
  uses: z.number().int(),
  lastUsedAt: z.string().optional(),
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
  by: z.enum(['reflect', 'user', 'restore']),
  why: z.string().optional(),
  quote: z.string().optional(),
  sessionId: z.string().optional(),
  from: z.number().int().optional(),
  warnings: z.array(z.string()),
  at: z.string(),
  review: z
    .object({
      at: z.string(),
      by: z.enum(['user', 'telegram', 'timeout', 'replaced']),
      decision: z.enum(['approved', 'rejected']),
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
  },
})
