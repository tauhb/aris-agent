/**
 * Storage domain `aris_channels` (backend của dsh, mỗi bản ghi một tệp). Khoá bản ghi chỉ
 * gồm chữ, số và `-` (ràng buộc của storage dsh): số âm của Telegram ghi thành `n<số>`.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const botRecord = z.object({
  /** Bot của aris (giai đoạn 1: `aris`). */
  bot: z.string(),
  tgId: z.number().int(),
  username: z.string(),
  name: z.string(),
  /** Tên khoá trong kho khoá của dsh; không bao giờ lưu token ở đây. */
  tokenRef: z.string(),
  /** Bot đọc được mọi tin trong nhóm (privacy mode tắt). */
  canReadAll: z.boolean(),
  /** Vị trí đọc kế tiếp của getUpdates. */
  offset: z.number().int(),
  home: z.object({ chatId: z.number(), threadId: z.number().optional() }).optional(),
  voice: z.boolean(),
  addedAt: z.string(),
  error: z.string().optional(),
})
export type BotRecord = z.infer<typeof botRecord>

export const personRecord = z.object({
  userId: z.number().int(),
  name: z.string(),
  username: z.string().optional(),
  role: z.enum(['owner', 'member']),
  pairedAt: z.string(),
})
export type PersonRecord = z.infer<typeof personRecord>

export const groupRecord = z.object({
  chatId: z.number(),
  title: z.string(),
  allowed: z.boolean(),
  who: z.enum(['allowed', 'everyone']),
  prompt: z.string().optional(),
  /** Lần cuối báo chủ nhân về nhóm lạ này (ms). */
  notifiedAt: z.number().optional(),
  seenAt: z.string(),
})
export type GroupRecord = z.infer<typeof groupRecord>

export const codeRecord = z.object({
  code: z.string(),
  role: z.enum(['owner', 'member']),
  expiresAt: z.number(),
})
export type CodeRecord = z.infer<typeof codeRecord>

/** Cuộc trò chuyện → phiên đang dùng, kèm các phiên cũ (`/sessions`). */
export const threadRecord = z.object({
  key: z.string(),
  bot: z.string(),
  chatId: z.number(),
  threadId: z.number().optional(),
  sessionId: z.string(),
  history: z.array(z.string()),
  updatedAt: z.string(),
})
export type ThreadRecord = z.infer<typeof threadRecord>

/** Tin vào đã nhận, chờ hoặc đang xử lý (hàng đợi bền). */
export const inboxRecord = z.object({
  id: z.string(),
  bot: z.string(),
  update: z.unknown(),
  state: z.enum(['queued', 'running']),
  receivedAt: z.number(),
})
export type InboxRecord = z.infer<typeof inboxRecord>

/** Câu trả lời cuối chờ gửi (giao bền). */
export const outboxRecord = z.object({
  id: z.string(),
  bot: z.string(),
  chatId: z.number(),
  threadId: z.number().optional(),
  replyTo: z.number().optional(),
  chunks: z.array(z.string()),
  /** Số phần đã gửi xong. */
  sent: z.number().int(),
  state: z.enum(['pending', 'sending']),
  attempts: z.number().int(),
  createdAt: z.number(),
})
export type OutboxRecord = z.infer<typeof outboxRecord>

export const settingsRecord = z.object({
  busy: z.enum(['steer', 'queue', 'interrupt']),
  guestMode: z.boolean(),
  /** Lần cuối báo chủ nhân về từng người lạ (ms). */
  strangers: z.record(z.string(), z.number()),
})
export type SettingsRecord = z.infer<typeof settingsRecord>

export const channelsDomain = defineDomain({
  name: 'aris_channels',
  version: 1,
  layout: 'per-record',
  tables: {
    bots: domainTable<string, BotRecord>(botRecord),
    people: domainTable<string, PersonRecord>(personRecord),
    groups: domainTable<string, GroupRecord>(groupRecord),
    codes: domainTable<string, CodeRecord>(codeRecord),
    threads: domainTable<string, ThreadRecord>(threadRecord),
    inbox: domainTable<string, InboxRecord>(inboxRecord),
    outbox: domainTable<string, OutboxRecord>(outboxRecord),
    settings: domainTable<string, SettingsRecord>(settingsRecord),
  },
})
