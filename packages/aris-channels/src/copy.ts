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
  { command: 'note', description: 'Ghi nhanh vào nhật ký của bộ não: /note <nội dung>', owner: true },
  { command: 'whoami', description: 'Vai và quyền của bạn' },
  { command: 'help', description: 'Danh sách lệnh' },
]

export const ROLE_LABEL: Record<Trust, string> = {
  owner: 'người dùng chính (toàn quyền)',
  member: 'người được phép (chỉ hỏi đáp)',
  guest: 'khách trong nhóm (chỉ hỏi đáp)',
}

/** Dòng nhắc giới hạn quyền gắn vào tin của người không phải người dùng chính (mọi kênh dùng chung). */
export const NOT_OWNER_NOTE =
  '\n(Người này không phải người dùng chính: chỉ trả lời câu hỏi, không làm việc có tác động như gửi tin, sửa tệp, chạy lệnh.)'

export const T = {
  routineAt: (d: Date) => {
    const dow = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()]
    const two = (n: number) => String(n).padStart(2, '0')
    return `${dow}, ${two(d.getDate())}/${two(d.getMonth() + 1)} · ${two(d.getHours())}:${two(d.getMinutes())}`
  },
  routineMore: 'Xem chi tiết',
  routineAsk: (name: string) => `Hỏi ${name}`,
  routineAsking: (name: string, title: string) =>
    `Giờ nhắn ở đây là hỏi tiếp ${name} về «${title}». Gõ /new để về chat mới.`,
  routineGone: 'Lần chạy này không còn để xem lại.',
  paired: (name: string, owner: boolean) =>
    owner
      ? `Chào ${h(name)}! Đã ghép đôi: tài khoản này là <b>người dùng chính</b> của bot. Từ giờ cứ nhắn ở đây như trên web.\n\nGõ /help để xem lệnh.`
      : `Chào ${h(name)}! Tài khoản này đã là <b>người được phép</b>: hỏi đáp được với bot, nhưng bot không làm việc có tác động (gửi thư, chạy lệnh…) theo lời người được phép.`,
  /** Người nhắn mã ghép đôi do kênh khác tạo (ví dụ mã của Lark gõ vào Telegram). */
  codeOtherChannel: 'Mã này dành cho kênh khác.',
  /** Mã của một tài khoản khác cùng kênh (GĐ8.7: mỗi tài khoản một mã). */
  codeOtherAccount: 'Mã này dành cho tài khoản khác.',
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
  guardStopped: 'aris đang dừng khẩn cấp. Bấm Chạy lại ở Cài đặt › Ngân sách, duyệt, an toàn trên web.',
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
  /** Khách xin gặp người thật (GĐ8.7): bot im cuộc chat đó 2 giờ. */
  human: (name: string, username: string | undefined, text: string) =>
    `<b>${h(name)}</b>${username ? ` (@${h(username)})` : ''} muốn gặp người thật: «${h(text.slice(0, 300))}»\n\nBot im cuộc chat này 2 giờ.`,
  humanAck: 'Đã báo người phụ trách, sẽ có người trả lời sớm.',
  /** Bot gọi công cụ "báo chủ". */
  ping: (who: string, text: string) => `Chat với <b>${h(who)}</b>: ${h(text)}`,
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
  /** Thẻ đề xuất ký ức (bản vẽ 7.3). */
  memoryCard: (who: string, text: string, why?: string) =>
    [`🧠 <b>GHI NHỚ</b> · ${who}`, `“${h(text)}” — lưu lại nhé?`, ...(why ? [`<i>${h(why)}</i>`] : [])].join(
      '\n',
    ),
  memoryDone: (decision: 'saved' | 'discarded', by: string, text: string) =>
    by === 'timeout'
      ? '⌛ Quá 7 ngày chưa trả lời, đã bỏ.'
      : decision === 'saved'
        ? `✅ Đã lưu${by === 'user' ? ' trên web' : ''}: “${h(text)}”`
        : `🗑 Đã bỏ${by === 'user' ? ' trên web' : ''}.`,
  /** Thẻ đề xuất skill (bản vẽ 7.3). */
  skillCard: (who: string, name: string, version: number, patch: boolean, why?: string) =>
    [
      `🧩 <b>ĐỀ XUẤT SKILL</b> · ${who}`,
      `${patch ? 'Bản vá' : 'Skill mới'}: bật <code>${h(name)}</code> v${version}?`,
      ...(why ? [`<i>${h(why)}</i>`] : []),
      '<i>Xem thay đổi ở Hộp duyệt trên web.</i>',
    ].join('\n'),
  skillDone: (decision: 'approved' | 'rejected', by: string, version: number) =>
    by === 'timeout'
      ? '⌛ Quá 7 ngày chưa trả lời, đã bỏ.'
      : by === 'replaced'
        ? '↻ Đã có bản đề xuất mới thay bản này.'
        : decision === 'approved'
          ? `✅ Đã bật v${version}${by === 'user' ? ' trên web' : ''}.`
          : `🗑 Không bật${by === 'user' ? ' (trả lời trên web)' : ''}.`,
  memoryTypeNew: 'Gõ câu mới cho ký ức này: tin nhắn kế tiếp trong chat này sẽ được lưu thay.',
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
  // --- Bộ não (bản vẽ 7.5) ---
  noteUsage: 'Dùng: /note <nội dung>',
  noteDone: (time: string) =>
    `📝 Đã ghi vào nhật ký hôm nay (Ghi nhanh · ${time}). Nhật ký tự nạp vào wiki lúc 23:00.`,
  brainOff: 'Bộ não chưa bật trên máy này.',
  fwdAsk: 'Tin chuyển tiếp. Lưu vào bộ não để Thủ thư nạp vào wiki?',
  fwdSave: 'Lưu vào bộ não',
  fwdChat: 'Không, chỉ hỏi',
  fwdSaved: '✓ Đã lưu',
  fwdAsked: 'Tin chuyển tiếp: gửi cho bot như tin thường.',
  fwdGone: 'Tin này không còn trong bộ nhớ tạm (aris vừa khởi động lại). Chuyển tiếp lại nhé.',
  brainQueued: (label: string) =>
    `📥 Đã vào Hộp thư vào: <b>${h(label)}</b>. Thủ thư đang lập bản nạp, xong sẽ gửi thẻ duyệt ở đây.`,
  brainUnreadable: (label: string) =>
    `📥 Đã vào Hộp thư vào: <b>${h(label)}</b>. Loại tệp này chưa đọc được; mở Hộp thư vào trên web để Chỉ lưu tệp gốc.`,
  brainFail: (e: string) => `Chưa lưu được vào bộ não: ${h(e)}`,
  brainLevel: { nhanh: 'duyệt nhanh', ky: '⚠ duyệt kỹ', 'tu-nap': 'tự nạp' } as Record<string, string>,
  brainKind: {
    'tai-lieu': 'tài liệu',
    link: 'link',
    'ghi-chu': 'ghi chú',
    'nhat-ky': 'nhật ký',
    anh: 'ảnh',
    'ghi-am': 'ghi âm',
  } as Record<string, string>,
  brainOp: {
    moi: '＋ Trang mới',
    'bo-sung': '✎ Bổ sung',
    'lien-ket': '🔗 Thêm liên kết',
    'sua-y': '✎ Sửa ý cũ',
  } as Record<string, string>,
  brainCareful: 'Có chỗ cần xem kỹ nên duyệt trên web.',
  brainEmpty: 'Thủ thư không thấy gì cần ghi thêm vào wiki. Có thể Chỉ lưu nguồn.',
  brainApprove: 'Đồng ý',
  brainWeb: 'Xem trên web',
  brainKeep: 'Chỉ lưu',
  brainWebHint: 'Mở aris trên máy: Brain › Hộp thư vào.',
  brainNapped: (title: string, pages: number, place: string, conflicts: number) =>
    [
      '✅ <b>ĐÃ NẠP</b>',
      `<b>${h(title)}</b>`,
      `Ghép ${pages} trang vào wiki ${h(place)}.${conflicts ? ` ${conflicts} trang đổi trong lúc chờ nên chưa ghép, mở web để Lập lại.` : ''} Muốn hoàn tác thì mở Nhật ký bộ não trên web.`,
    ].join('\n'),
  brainKept: (title: string, place: string) =>
    `📦 <b>CHỈ LƯU NGUỒN</b>\n<b>${h(title)}</b>\nNguồn đã lưu vào ${h(place)}, không ghép vào wiki.`,
  brainDropped: (title: string) => `🗑 Đã bỏ «${h(title)}».`,
  brainReplan: (title: string) => `↻ Thủ thư đang lập lại «${h(title)}», xong sẽ gửi thẻ mới.`,
  brainError: (title: string, note?: string) =>
    `⚠️ Chưa lập được bản nạp «${h(title)}»${note ? `: ${h(note)}` : ''}\nMở Hộp thư vào trên web để Lập lại hay Bỏ.`,
  brainTomorrow: (title: string) => `⏳ Thủ thư đã dùng hết tiền hôm nay; «${h(title)}» lập tiếp ngày mai.`,
  brainRemind: (n: number) =>
    `📥 Hộp thư vào còn ${n} bản nạp chờ duyệt hơn 7 ngày. Quá 30 ngày chỉ lưu nguồn, không ghép vào wiki.`,
  brainList: 'Xem các bản chờ',
  brainNone: 'Hộp thư vào không còn bản nạp nào chờ duyệt.',
}
