/**
 * Tin hệ thống của bot trên Telegram (tiếng Việt). Không dùng đại từ (anh, chị, em, chủ nhân):
 * cách xưng hô do người dùng chọn chỉ có trong lời của bot (model), không trong tin hệ thống.
 * HTML của Telegram: chỉ thoát giá trị chèn vào.
 */
import type { Trust } from './access.js'
import { escapeHtml as h } from './telegram/format.js'

export const COMMANDS: { command: string; description: string; owner?: true }[] = [
  { command: 'new', description: 'Mở phiên mới' },
  { command: 'stop', description: 'Dừng việc đang làm' },
  { command: 'status', description: 'Phiên, model, trạng thái' },
  { command: 'model', description: 'Chọn model', owner: true },
  { command: 'sessions', description: 'Các phiên của cuộc trò chuyện này', owner: true },
  { command: 'resume', description: 'Quay lại một phiên: /resume <số>', owner: true },
  { command: 'sethome', description: 'Nhận báo cáo và tin bot chủ động gửi ở đây', owner: true },
  { command: 'voice', description: 'Trả lời kèm giọng nói: /voice on|off', owner: true },
  { command: 'whoami', description: 'Vai và quyền của bạn' },
  { command: 'help', description: 'Danh sách lệnh' },
]

export const ROLE_LABEL: Record<Trust, string> = {
  owner: 'người dùng chính (toàn quyền)',
  member: 'người được phép (chỉ hỏi đáp)',
  guest: 'khách trong nhóm (chỉ hỏi đáp)',
}

export const T = {
  paired: (name: string, owner: boolean) =>
    owner
      ? `Chào ${h(name)}! Đã ghép đôi: tài khoản này là <b>người dùng chính</b> của bot. Từ giờ cứ nhắn ở đây như trên web.\n\nGõ /help để xem lệnh.`
      : `Chào ${h(name)}! Tài khoản này đã là <b>người được phép</b>: hỏi đáp được với bot, nhưng bot không làm việc có tác động (gửi thư, chạy lệnh…) theo lời người được phép.`,
  help: (trust: Trust) =>
    [
      `<b>Lệnh</b> (vai: ${ROLE_LABEL[trust]})`,
      ...COMMANDS.filter((c) => trust === 'owner' || !c.owner).map(
        (c) => `/${c.command} — ${h(c.description)}`,
      ),
    ].join('\n'),
  whoami: (trust: Trust, userId: number, chatId: number) =>
    `Vai: <b>${ROLE_LABEL[trust]}</b>.\nMã Telegram: <code>${userId}</code>\nMã cuộc trò chuyện: <code>${chatId}</code>`,
  ownerOnly: 'Lệnh này chỉ người dùng chính dùng được.',
  newSession: 'Đã mở phiên mới: bắt đầu lại từ đầu, ký ức lâu dài vẫn giữ nguyên.',
  stopped: 'Đã dừng.',
  nothingRunning: 'Không có việc nào đang chạy.',
  status: (o: {
    session: string
    title?: string | undefined
    model?: string | undefined
    running: boolean
    busy: string
  }) =>
    [
      `<b>Phiên</b>: ${h(o.title ?? '(chưa có tên)')}`,
      `<code>${h(o.session)}</code>`,
      `<b>Model</b>: ${h(o.model ?? 'mặc định')}`,
      `<b>Trạng thái</b>: ${o.running ? 'đang làm' : 'rảnh'}`,
      `<b>Nhắn thêm khi đang làm</b>: ${h(o.busy)}`,
    ].join('\n'),
  busyLabel: { steer: 'chèn vào việc', queue: 'xếp hàng', interrupt: 'dừng và làm mới' } as Record<
    string,
    string
  >,
  noSession: 'Cuộc trò chuyện này chưa có phiên nào.',
  sessions: 'Các phiên của cuộc trò chuyện này (bấm để quay lại):',
  resumed: (title: string) => `Đã quay lại phiên: ${h(title)}`,
  badIndex: 'Số phiên không đúng. Gõ /sessions để xem danh sách.',
  homeSet: 'Đã chọn nơi này nhận báo cáo routine và tin bot chủ động gửi.',
  voice: (on: boolean) => (on ? 'Từ giờ bot trả lời kèm giọng nói.' : 'Đã tắt trả lời bằng giọng nói.'),
  voiceUsage: 'Dùng: /voice on hoặc /voice off',
  modelPick: (current?: string) => `Chọn nhà cung cấp${current ? ` (đang dùng: ${h(current)})` : ''}:`,
  modelList: (provider: string) => `Chọn model của ${h(provider)}:`,
  modelSet: (name: string) => `Đã chuyển sang <b>${h(name)}</b>, áp dụng từ lượt kế tiếp.`,
  modelFail: (e: string) => `Không đổi được model: ${h(e)}`,
  stranger: (name: string, username: string | undefined, id: number, text: string) =>
    `Có người lạ nhắn bot: <b>${h(name)}</b>${username ? ` (@${h(username)})` : ''}, mã <code>${id}</code>\n«${h(text.slice(0, 300))}»\n\nBot chưa trả lời. Cho phép người này hỏi đáp với bot?`,
  strangerAllowed: (name: string) => `Đã cho phép ${h(name)} hỏi đáp (người được phép).`,
  strangerIgnored: 'Đã bỏ qua.',
  welcomeMember: 'Tài khoản này đã được cho phép hỏi đáp với bot. Cứ nhắn nhé!',
  unknownGroup: (title: string, id: number) =>
    `Bot vừa được gọi trong nhóm <b>${h(title)}</b> (mã <code>${id}</code>) chưa có trong danh sách cho phép. Bot chưa trả lời gì.`,
  addedToGroup: (title: string, id: number) =>
    `Bot vừa được thêm vào nhóm <b>${h(title)}</b> (mã <code>${id}</code>). Nhóm chưa được phép nên bot im lặng.`,
  groupAllowed: (title: string) =>
    `Đã cho phép nhóm ${h(title)}. Trong nhóm, bot chỉ trả lời khi được @ hoặc khi có người trả lời vào tin của bot.`,
  groupLeft: (title: string) => `Đã rời nhóm ${h(title)}.`,
  approval: (tool: string, reason?: string) =>
    `🔐 <b>Cần duyệt</b>: <code>${h(tool)}</code>${reason ? `\n${h(reason)}` : ''}`,
  approvalDone: (ok: boolean) => (ok ? '✅ Đã cho phép một lần.' : '⛔ Đã từ chối.'),
  /** Thẻ duyệt tập trung (bản vẽ 7.1): bot nào xin, xin làm gì, chi tiết, hạn. */
  centralCard: (who: string, action: string, target?: string, reason?: string, external?: boolean) =>
    [
      `🔐 <b>CẦN DUYỆT</b> · ${who}${external ? ' <i>(bot ngoài)</i>' : ''}`,
      `<b>${h(action)}</b>`,
      ...(target ? [`<code>${h(target)}</code>`] : []),
      ...(reason ? [h(reason)] : []),
      '<i>Tự từ chối sau 15 phút</i>',
    ].join('\n'),
  centralDone: (allow: boolean, by: string) =>
    by === 'timeout'
      ? '⌛ Hết 15 phút, đã từ chối.'
      : by === 'ended'
        ? '⏹ Việc đã dừng, yêu cầu đã huỷ.'
        : `${allow ? '✅ Đã cho phép' : '⛔ Đã từ chối'}${by === 'user' ? ' trên web' : ''}.`,
  centralGone: 'Yêu cầu này đã xong.',
  stepAction: {
    run: 'Chạy lệnh',
    edit: 'Sửa tệp',
    write: 'Ghi tệp',
    read: 'Đọc tệp',
    search: 'Tìm trong tệp',
    find: 'Tìm tệp',
    web: 'Mở trang web',
    webSearch: 'Tìm trên web',
    permission: 'Xin thêm quyền',
  } as Record<string, string>,
  stepOther: (tool: string) => `Dùng công cụ ${tool}`,
  approvalExpired: '⌛ Hết giờ chờ duyệt, hành động bị chặn.',
  approvalNotOwner: (tool: string) =>
    `Việc này (<code>${h(tool)}</code>) cần người dùng chính duyệt; người khác gọi thì bot không làm.`,
  askOther: '✏️ Khác (gõ trả lời)',
  askDone: 'Xong',
  askTypeAnswer: 'Gõ câu trả lời ở tin kế tiếp.',
  askAnswered: (answer: string) => `Đã trả lời: ${h(answer)}`,
  restarted: '♻️ aris vừa khởi động lại giữa chừng, đang làm tiếp tin này.',
  recovered: '♻️ Câu trả lời khôi phục sau khi khởi động lại, có thể trùng.',
  stoppedTurn: 'Đã dừng việc này.',
  continueWith: (name: string) => `Nhắn tiếp với ${name}`,
  failedTurn: (e: string) => `Bot gặp lỗi: ${h(e)}`,
  voiceFail: (e: string) => `Chưa nghe được ghi âm: ${h(e)}`,
  voiceNotReady:
    'Máy chưa có mô hình nhận giọng nói nên chưa nghe được ghi âm. Mở aris trên web, bấm nút micro ở ô nhập rồi chọn chuẩn bị (tải mô hình một lần, chạy ngay trên máy). Xong thì gửi lại ghi âm nhé.',
  fileTooBig: 'Tệp lớn hơn 20 MB, Telegram không cho bot tải. Gửi qua web nhé.',
  fileFail: (e: string) => `Chưa nhận được tệp: ${h(e)}`,
  voiceNote: '🎙️ (ghi âm)',
}
