/**
 * Storage domain `aris_channels` (backend của dsh, mỗi bản ghi một tệp). Khoá bản ghi chỉ
 * gồm chữ, số và `-` (ràng buộc của storage dsh): số âm của Telegram ghi thành `n<số>`.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/**
 * Kênh của một bản ghi dùng chung bảng với Telegram. Bản ghi cũ chưa có trường này là Telegram, nên mọi mã
 * Telegram hiện có đọc bản ghi như trước; bản ghi Lark và Zalo phải bị lọc ra ở những chỗ chỉ dành cho Telegram.
 */
export const recordChannel = z.enum(['telegram', 'lark', 'zalo'])
export type RecordChannel = z.infer<typeof recordChannel>

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
  /** `lark`: ứng dụng Lark của bot này (khoá bản ghi `lark-<bot>`; `tgId` là 0, `tokenRef` trỏ App Secret). */
  channel: recordChannel.optional(),
  /** Lark: App ID (`cli_…`), không phải bí mật. */
  appId: z.string().optional(),
  /** Lark: `lark` (larksuite.com, quốc tế) hay `feishu` (feishu.cn). */
  domain: z.enum(['lark', 'feishu']).optional(),
  /** Lark: `open_id` của chính bot, để nhận ra lúc người ta @ nó trong nhóm. */
  botOpenId: z.string().optional(),
  /** Zalo: tài khoản Zalo của bot này (khoá bản ghi `zalo-<bot>`; `tokenRef` trỏ dữ liệu đăng nhập trong kho khoá, `botOpenId` là mã Zalo của tài khoản). */
  avatar: z.string().optional(),
})
export type BotRecord = z.infer<typeof botRecord>

export const personRecord = z.object({
  userId: z.number().int(),
  name: z.string(),
  username: z.string().optional(),
  role: z.enum(['owner', 'member']),
  pairedAt: z.string(),
  /** `lark`: người ghép đôi trên Lark (khoá `lk-<open_id>`, `userId` là 0). */
  channel: recordChannel.optional(),
  /** Lark: `open_id` của người trong ứng dụng Lark của aris. */
  openId: z.string().optional(),
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
  /** `lark`: nhóm Lark (khoá `lk-<chat_id>`, `chatId` là 0). */
  channel: recordChannel.optional(),
  /** Lark: `chat_id` của nhóm (`oc_…`). */
  chatRef: z.string().optional(),
})
export type GroupRecord = z.infer<typeof groupRecord>

/** Kênh mà một mã ghép đôi dùng được. Thêm kênh mới (Lark, Zalo cá nhân) chỉ cần thêm vào đây. */
export const CHANNEL_KINDS = ['telegram', 'lark', 'zalo'] as const
export const channelKind = z.enum(CHANNEL_KINDS)
export type ChannelKind = z.infer<typeof channelKind>

export const codeRecord = z.object({
  code: z.string(),
  role: z.enum(['owner', 'member']),
  expiresAt: z.number(),
  /** Kênh của mã. Tuỳ chọn để mã cũ đang lưu (chưa có trường này) vẫn đọc được: coi là Telegram. */
  channel: channelKind.optional(),
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
  /** Lark: `chat_id` của cuộc trò chuyện (`chatId` là 0). */
  chatRef: z.string().optional(),
})
export type ThreadRecord = z.infer<typeof threadRecord>

/** Tin vào đã nhận, chờ hoặc đang xử lý (hàng đợi bền). */
export const inboxRecord = z.object({
  id: z.string(),
  bot: z.string(),
  update: z.unknown(),
  state: z.enum(['queued', 'running']),
  receivedAt: z.number(),
  /** `lark`: `update` là tin Lark đã chuẩn hoá; Telegram không đụng tới bản ghi này. */
  channel: recordChannel.optional(),
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
  /** Nút gắn vào phần cuối (ví dụ link "Nhắn tiếp với …"). */
  buttons: z
    .array(
      z.array(
        z.object({ text: z.string(), url: z.string().optional(), callback_data: z.string().optional() }),
      ),
    )
    .optional(),
  /** Bot gửi thay khi bot này không gửi được vào chat (chưa ở trong nhóm, bị chặn). */
  fallbackBot: z.string().optional(),
  /** `lark`: `chunks` là Markdown (chưa đổi dạng), gửi vào `chatRef`; Telegram không đụng tới bản ghi này. */
  channel: recordChannel.optional(),
  /** Lark: `chat_id` đích, hoặc `open_id` khi gửi thẳng cho một người (`toOpenId`). */
  chatRef: z.string().optional(),
  /** Lark: `chatRef` là `open_id` của người nhận chứ không phải `chat_id`. */
  toOpenId: z.boolean().optional(),
  /** Lark: mã tin (`om_…`) để trả lời vào. */
  replyRef: z.string().optional(),
  /** Zalo: `chatRef` là mã nhóm Zalo (không phải mã người). */
  isGroup: z.boolean().optional(),
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
