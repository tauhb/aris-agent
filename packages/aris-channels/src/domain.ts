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
  /**
   * GĐ8.7: mã tài khoản kênh (khoá bản ghi). Bản ghi cũ không có trường này: mã tài khoản là `bot` (khoá cũ giữ
   * nguyên, không phải chuyển dữ liệu). `bot` luôn là bot của aris trả lời trên tài khoản này.
   */
  account: z.string().optional(),
  /** Tên tài khoản do người dùng đặt trong aris ("CSKH 1"); không có thì dùng tên của kênh. */
  label: z.string().optional(),
  /** Ai được bot trả lời trong chat riêng: `paired` (mặc định, chỉ người đã ghép đôi) hay `guests` (mọi người là khách). */
  mode: z.enum(['paired', 'guests']).optional(),
  /** Zalo: nhường tay cho chủ (mặc định bật): chủ tự gõ trả lời khách trên điện thoại thì bot im cuộc chat đó một lúc. */
  hand: z.boolean().optional(),
  /**
   * Zalo: giờ trực. `days` là thứ trong tuần (0 = Chủ nhật), `from`/`to` dạng `HH:MM` theo giờ máy. Ngoài giờ thì giữ
   * tin của người không phải chủ tới lúc vào giờ; `offReply` (nếu có) gửi một lần mỗi đợt ngoài giờ.
   */
  hours: z
    .object({
      days: z.array(z.number().int().min(0).max(6)),
      from: z.string(),
      to: z.string(),
      offReply: z.string().optional(),
    })
    .optional(),
  /**
   * Chỉ trả lời theo tài liệu (GĐ8.7 đợt D): với khách (chưa ghép đôi), bot chỉ tra trong các thư mục nguồn của bộ não;
   * không thấy thì trả `noInfo`.
   */
  docs: z.object({ on: z.boolean(), folders: z.array(z.string()), noInfo: z.string().optional() }).optional(),
  /** Zalo: bỏ qua các cuộc chat có nhãn này (tên nhãn đặt trên app Zalo). */
  skipLabels: z.array(z.string()).optional(),
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
  /**
   * GĐ8.7: người được phép chỉ trên tài khoản kênh này. Không có (bản ghi cũ, và mọi chủ nhân) là dùng được trên mọi
   * tài khoản của kênh.
   */
  account: z.string().optional(),
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
  /** GĐ8.7: nhóm thấy qua tài khoản kênh này. Không có (bản ghi cũ) là áp cho mọi tài khoản của kênh. */
  account: z.string().optional(),
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
  /** GĐ8.7: mã chỉ dùng được trên tài khoản kênh này. Không có là dùng được trên mọi tài khoản của kênh. */
  account: z.string().optional(),
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
  /** Zalo: @nhắc thật người hỏi ở đầu phần đầu tiên (trong nhóm). */
  mention: z.object({ uid: z.string(), len: z.number().int() }).optional(),
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
