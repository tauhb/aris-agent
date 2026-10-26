/**
 * Tin hệ thống của bot trên Lark (tiếng Việt, Markdown). Như Telegram: không dùng đại từ (anh, chị, em, chủ nhân),
 * vì cách xưng hô do người dùng chọn chỉ có trong lời của bot (model), không trong tin hệ thống.
 * Chỗ nào trùng với bản Telegram (không có HTML) thì dùng lại `T` trong `copy.ts`.
 */
import type { Trust } from '../access.js'
import { COMMANDS, ROLE_LABEL } from '../copy.js'

/** Lệnh có trên Lark; các lệnh còn lại của Telegram (`/model`, `/sethome`, `/voice`, `/note`) cần nút bấm hay nơi nhận riêng. */
export const LARK_COMMANDS = COMMANDS.filter((c) =>
  ['new', 'stop', 'status', 'sessions', 'resume', 'whoami', 'help'].includes(c.command),
)

/** Lệnh của Telegram mà Lark chưa có: nhận ra để báo rõ thay vì in lại danh sách lệnh. */
export const TELEGRAM_ONLY_COMMANDS: ReadonlySet<string> = new Set(['model', 'sethome', 'voice', 'note'])

export const L = {
  paired: (name: string, owner: boolean) =>
    owner
      ? `Chào ${name}! Đã ghép đôi: tài khoản này là **người dùng chính** của bot. Từ giờ cứ nhắn ở đây như trên web.\n\nGõ /help để xem lệnh.`
      : `Chào ${name}! Tài khoản này đã là **người được phép**: hỏi đáp được với bot, nhưng bot không làm việc có tác động (gửi thư, chạy lệnh…) theo lời người được phép.`,
  help: (trust: Trust) =>
    [
      `**Lệnh** (vai: ${ROLE_LABEL[trust]})`,
      ...LARK_COMMANDS.filter((c) => trust === 'owner' || !c.owner).map(
        (c) => `/${c.command} — ${c.description}`,
      ),
    ].join('\n'),
  whoami: (trust: Trust, openId: string, chatId: string) =>
    `Vai: **${ROLE_LABEL[trust]}**.\nMã người dùng Lark: \`${openId}\`\nMã cuộc trò chuyện: \`${chatId}\``,
  telegramOnly: (name: string) => `Lệnh /${name} chưa có trên Lark. Gõ /help để xem các lệnh có thể dùng.`,
  status: (o: {
    session: string
    title?: string | undefined
    model?: string | undefined
    running: boolean
    busy: string
  }) =>
    [
      `**Phiên**: ${o.title ?? '(chưa có tên)'}`,
      `\`${o.session}\``,
      `**Model**: ${o.model ?? 'mặc định'}`,
      `**Trạng thái**: ${o.running ? 'đang làm' : 'rảnh'}`,
      `**Nhắn thêm khi đang làm**: ${o.busy}`,
    ].join('\n'),
  sessions: (items: { title: string; current: boolean }[]) =>
    [
      'Các phiên của cuộc trò chuyện này (gõ `/resume <số>` để quay lại):',
      ...items.map((s, i) => `${i + 1}. ${s.current ? '● ' : ''}${s.title}`),
    ].join('\n'),
  resumed: (title: string) => `Đã quay lại phiên: ${title}`,
  /** Báo chủ nhân khi có người lạ nhắn riêng (Lark không có nút trong tin này, nên chỉ dẫn cách ghép đôi). */
  stranger: (name: string, openId: string, text: string) =>
    `Có người lạ nhắn bot trên Lark: **${name}**, mã \`${openId}\`\n«${text.slice(0, 300)}»\n\nBot chưa trả lời. Muốn cho người này hỏi đáp: mở Cài đặt › Kênh và ghép đôi trên web, tạo mã "cho người khác" ở phần Lark, rồi gửi mã cho họ nhắn lại cho bot.`,
  unknownGroup: (title: string, chatId: string) =>
    `Bot vừa được gọi trong nhóm Lark **${title}** (mã \`${chatId}\`) chưa có trong danh sách cho phép. Bot chưa trả lời gì. Muốn cho phép: mở Cài đặt › Kênh và ghép đôi trên web, phần Lark › Nhóm.`,
  approvalNotOwner: (tool: string) =>
    `Việc này (\`${tool}\`) cần người dùng chính duyệt; người khác gọi thì bot không làm.`,
  approvalOnWeb: (tool: string) =>
    `Việc này (\`${tool}\`) cần duyệt. Chưa duyệt được trên Lark: mở aris trên máy để bấm cho phép hay từ chối.`,
  voiceFail: (e: string) => `Chưa nghe được ghi âm: ${e}`,
  fileTooBig: 'Tệp lớn hơn 20 MB, bot không nhận. Gửi qua web nhé.',
  fileFail: (e: string) => `Chưa nhận được tệp: ${e}`,
  unsupported: (type: string) =>
    `Bot chưa đọc được loại tin này (${type}). Gửi chữ, ảnh, tệp hay ghi âm nhé.`,
  failedTurn: (e: string) => `Bot gặp lỗi: ${e}`,
  continueWith: (name: string) => `Nhắn tiếp với ${name}`,
}
