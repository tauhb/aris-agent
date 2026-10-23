/** Lời bot nói trên Telegram (tiếng Việt). HTML của Telegram: chỉ thoát giá trị chèn vào. */
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
  owner: 'chủ nhân (toàn quyền)',
  member: 'người được phép (chỉ hỏi đáp)',
  guest: 'khách trong nhóm (chỉ hỏi đáp)',
}

export const T = {
  paired: (name: string, owner: boolean) =>
    owner
      ? `Chào ${h(name)}, em đã nhận anh là <b>chủ nhân</b>. Từ giờ cứ nhắn ở đây như trên web nhé.\n\nGõ /help để xem lệnh.`
      : `Chào ${h(name)}, bạn đã được thêm làm <b>người được phép</b>: bạn hỏi đáp được với em, nhưng em sẽ không làm việc có tác động (gửi thư, chạy lệnh…) theo lời bạn.`,
  help: (trust: Trust) =>
    [
      `<b>Lệnh</b> (bạn là ${ROLE_LABEL[trust]})`,
      ...COMMANDS.filter((c) => trust === 'owner' || !c.owner).map(
        (c) => `/${c.command} — ${h(c.description)}`,
      ),
    ].join('\n'),
  whoami: (trust: Trust, userId: number, chatId: number) =>
    `Bạn là <b>${ROLE_LABEL[trust]}</b>.\nMã Telegram của bạn: <code>${userId}</code>\nMã cuộc trò chuyện: <code>${chatId}</code>`,
  ownerOnly: 'Lệnh này chỉ chủ nhân dùng được.',
  newSession: 'Đã mở phiên mới. Em bắt đầu lại từ đầu, ký ức lâu dài vẫn giữ nguyên.',
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
  homeSet: 'Đã chọn nơi này nhận báo cáo routine và tin em chủ động gửi.',
  voice: (on: boolean) => (on ? 'Từ giờ em trả lời kèm giọng nói.' : 'Đã tắt trả lời bằng giọng nói.'),
  voiceUsage: 'Dùng: /voice on hoặc /voice off',
  modelPick: (current?: string) => `Chọn nhà cung cấp${current ? ` (đang dùng: ${h(current)})` : ''}:`,
  modelList: (provider: string) => `Chọn model của ${h(provider)}:`,
  modelSet: (name: string) => `Đã chuyển sang <b>${h(name)}</b>, áp dụng từ lượt kế tiếp.`,
  modelFail: (e: string) => `Không đổi được model: ${h(e)}`,
  stranger: (name: string, username: string | undefined, id: number, text: string) =>
    `Có người lạ nhắn em: <b>${h(name)}</b>${username ? ` (@${h(username)})` : ''}, mã <code>${id}</code>\n«${h(text.slice(0, 300))}»\n\nEm chưa trả lời. Cho phép người này hỏi đáp với em?`,
  strangerAllowed: (name: string) => `Đã cho phép ${h(name)} hỏi đáp (người được phép).`,
  strangerIgnored: 'Đã bỏ qua.',
  welcomeMember: 'Chủ nhân đã cho phép bạn hỏi đáp với em. Cứ nhắn nhé!',
  unknownGroup: (title: string, id: number) =>
    `Em vừa được gọi trong nhóm <b>${h(title)}</b> (mã <code>${id}</code>) chưa có trong danh sách cho phép. Em chưa trả lời gì.`,
  addedToGroup: (title: string, id: number) =>
    `Em vừa được thêm vào nhóm <b>${h(title)}</b> (mã <code>${id}</code>). Nhóm chưa được phép nên em sẽ im lặng.`,
  groupAllowed: (title: string) =>
    `Đã cho phép nhóm ${h(title)}. Trong nhóm, em chỉ trả lời khi được @ hoặc khi có người trả lời vào tin của em.`,
  groupLeft: (title: string) => `Đã rời nhóm ${h(title)}.`,
  approval: (tool: string, reason?: string) =>
    `🔐 <b>Cần anh duyệt</b>: <code>${h(tool)}</code>${reason ? `\n${h(reason)}` : ''}`,
  approvalDone: (ok: boolean) => (ok ? '✅ Đã cho phép một lần.' : '⛔ Đã từ chối.'),
  approvalExpired: '⌛ Hết giờ chờ duyệt, hành động bị chặn.',
  approvalNotOwner: (tool: string) =>
    `Việc này (<code>${h(tool)}</code>) cần chủ nhân duyệt, người khác gọi em thì em không làm.`,
  askOther: '✏️ Khác (gõ trả lời)',
  askDone: 'Xong',
  askTypeAnswer: 'Gõ câu trả lời của anh ở tin kế tiếp.',
  askAnswered: (answer: string) => `Đã trả lời: ${h(answer)}`,
  restarted: '♻️ aris vừa khởi động lại giữa chừng, em làm tiếp tin này.',
  recovered: '♻️ Câu trả lời khôi phục sau khi khởi động lại, có thể trùng.',
  stoppedTurn: 'Đã dừng việc này.',
  failedTurn: (e: string) => `Em gặp lỗi: ${h(e)}`,
  voiceFail: (e: string) => `Em chưa nghe được ghi âm: ${h(e)}`,
  fileTooBig: 'Tệp lớn hơn 20 MB, Telegram không cho bot tải. Anh gửi qua web nhé.',
  fileFail: (e: string) => `Em chưa nhận được tệp: ${h(e)}`,
  voiceNote: '🎙️ (ghi âm)',
}
