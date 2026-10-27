/**
 * Tin hệ thống của bot trên Zalo (tiếng Việt, chữ thường vì Zalo không hiển thị Markdown). Như Telegram và Lark:
 * không dùng đại từ (anh, chị, em, chủ nhân), vì cách xưng hô do người dùng chọn chỉ có trong lời của bot (model).
 * Chỗ nào trùng với bản Telegram (không có HTML) thì dùng lại `T` trong `copy.ts`.
 */
import type { Trust } from '../access.js'
import { COMMANDS, ROLE_LABEL } from '../copy.js'

/** Lệnh có trên Zalo; các lệnh còn lại của Telegram (`/model`, `/sethome`, `/voice`, `/note`) cần nút bấm hay nơi nhận riêng. */
export const ZALO_COMMANDS = COMMANDS.filter((c) =>
  ['new', 'stop', 'status', 'sessions', 'resume', 'whoami', 'help'].includes(c.command),
)

/** Lệnh của Telegram mà Zalo chưa có: nhận ra để báo rõ thay vì in lại danh sách lệnh. */
export const TELEGRAM_ONLY_COMMANDS: ReadonlySet<string> = new Set(['model', 'sethome', 'voice', 'note'])

export const Z = {
  paired: (name: string, owner: boolean) =>
    owner
      ? `Chào ${name}! Đã ghép đôi: tài khoản này là người dùng chính của bot. Từ giờ cứ nhắn ở đây như trên web.\n\nGõ /help để xem lệnh.`
      : `Chào ${name}! Tài khoản này đã là người được phép: hỏi đáp được với bot, nhưng bot không làm việc có tác động (gửi thư, chạy lệnh…) theo lời người được phép.`,
  help: (trust: Trust) =>
    [
      `Lệnh (vai: ${ROLE_LABEL[trust]})`,
      ...ZALO_COMMANDS.filter((c) => trust === 'owner' || !c.owner).map(
        (c) => `/${c.command} — ${c.description}`,
      ),
    ].join('\n'),
  whoami: (trust: Trust, zaloId: string, threadId: string) =>
    `Vai: ${ROLE_LABEL[trust]}.\nMã người dùng Zalo: ${zaloId}\nMã cuộc trò chuyện: ${threadId}`,
  telegramOnly: (name: string) => `Lệnh /${name} chưa có trên Zalo. Gõ /help để xem các lệnh có thể dùng.`,
  status: (o: {
    session: string
    title?: string | undefined
    model?: string | undefined
    running: boolean
    busy: string
  }) =>
    [
      `Phiên: ${o.title ?? '(chưa có tên)'}`,
      o.session,
      `Model: ${o.model ?? 'mặc định'}`,
      `Trạng thái: ${o.running ? 'đang làm' : 'rảnh'}`,
      `Nhắn thêm khi đang làm: ${o.busy}`,
    ].join('\n'),
  sessions: (items: { title: string; current: boolean }[]) =>
    [
      'Các phiên của cuộc trò chuyện này (gõ /resume <số> để quay lại):',
      ...items.map((s, i) => `${i + 1}. ${s.current ? '● ' : ''}${s.title}`),
    ].join('\n'),
  resumed: (title: string) => `Đã quay lại phiên: ${title}`,
  approvalNotOwner: (tool: string) =>
    `Việc này (${tool}) cần người dùng chính duyệt; người khác gọi thì bot không làm.`,
  approvalOnWeb: (tool: string) =>
    `Việc này (${tool}) cần duyệt. Chưa duyệt được trên Zalo: mở aris trên máy để bấm cho phép hay từ chối.`,
  voiceFail: (e: string) => `Chưa nghe được tin thoại: ${e}`,
  fileTooBig: 'Tệp lớn hơn 20 MB, bot không nhận. Gửi qua web nhé.',
  fileFail: (e: string) => `Chưa nhận được tệp: ${e}`,
  unsupported: (type: string) =>
    `Bot chưa đọc được loại tin này (${type}). Gửi chữ, ảnh, tệp hay tin thoại nhé.`,
  failedTurn: (e: string) => `Bot gặp lỗi: ${e}`,
  continueWith: (name: string) => `Nhắn tiếp với ${name}`,
}

/** Tin báo chủ (qua Telegram, vì Zalo có thể đang mất kết nối). Không dùng đại từ. */
export const ZN = {
  /** Người lạ nhắn Zalo: bot im lặng, báo chủ một lần mỗi người mỗi ngày. */
  stranger: (name: string, excerpt: string) => `${name} nhắn Zalo: «${excerpt}»\n\nBot chưa trả lời.`,
  needQr: (name: string) =>
    `Zalo ${name} cần quét lại mã QR: phiên đăng nhập đã hết hạn. Mở Cài đặt › Kênh và ghép đôi trên web, phần Zalo.`,
  /** Bị đá phiên (thường do mở Zalo Web): báo tối đa 6 giờ một lần mỗi tài khoản. */
  kicked: (name: string) =>
    `Zalo ${name} vừa bị ngắt vì tài khoản đang mở ở nơi khác (thường là Zalo Web). Bot tạm ngừng nghe và tự thử lại sau; muốn bot nghe ngay thì đóng Zalo Web.`,
  dailyLimit: (limit: number) =>
    `Bot đã gửi ${limit} tin Zalo hôm nay, chạm giới hạn ngày nên dừng gửi tới hết ngày để tránh bị khoá tài khoản.`,
}

/** Lý do hiện trên trang Kênh và `aris status`. */
export const ZALO_STATE_LABEL = {
  listening: 'đang nghe',
  connecting: 'đang kết nối',
  web: 'Zalo Web đang mở, aris tạm ngừng nghe',
  retrying: 'mất kết nối, đang thử lại',
  'needs-qr': 'Cần quét lại QR',
} as const
