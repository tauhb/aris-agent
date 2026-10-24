/** Storage domain `aris_memory`: mỗi ký ức một bản ghi (lưu bền qua backend của dsh, mặc định JSON). */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { BOOKS, KINDS, TIERS, VIAS, type MemoryItem } from './store.js'

const item: z.ZodType<MemoryItem> = z.object({
  id: z.string(),
  bot: z.string(),
  book: z.enum(BOOKS),
  tier: z.enum(TIERS),
  status: z.enum(['active', 'pending', 'deleted']),
  kind: z.enum(KINDS),
  trust: z.enum(['user-stated', 'agent-inferred', 'external']),
  text: z.string(),
  source: z.object({ sessionId: z.string().optional(), at: z.string() }),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  uses: z.number().int(),
  lastUsedAt: z.string().optional(),
  proposal: z
    .object({
      by: z.string().optional(),
      why: z.string().optional(),
      quote: z.string().optional(),
      via: z.enum(VIAS),
    })
    .optional(),
  review: z
    .object({
      at: z.string(),
      by: z.enum(['user', 'telegram', 'timeout']),
      decision: z.enum(['saved', 'discarded']),
    })
    .optional(),
})

export const memoryDomain = defineDomain({
  name: 'aris_memory',
  version: 1,
  // Mỗi lần ghi chỉ thay một tệp, không viết lại cả kho.
  layout: 'per-record',
  tables: { items: domainTable<string, MemoryItem>(item) },
})
