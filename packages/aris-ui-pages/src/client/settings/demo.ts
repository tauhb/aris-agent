/**
 * Dữ liệu mẫu của trang Cài đặt theo canvas 6.x và 2.5. Mỗi khối ghi giai đoạn
 * nối dữ liệu thật; nội dung là dữ liệu nên để nguyên tiếng Việt như canvas.
 */

/** 6.1 · GĐ7 (bảng điều khiển vận hành). */
export const DEMO_DASHBOARD = {
  uptime: 'aris chạy liên tục 6 ngày 4 giờ · máy chủ tại nhà',
  stats: { bots: 5, working: 2, cost: '0,42', budget: '5', cache: '86%', memory: '212 MB', waiting: 3 },
  costByBot: [
    { id: 'aris', name: 'Aris', pct: 62, usd: '0,19' },
    { id: 'lam', name: 'Lâm', pct: 36, usd: '0,11' },
    { id: 'mai', name: 'Mai', pct: 20, usd: '0,06' },
    { id: 'tin', name: 'Tín', pct: 10, usd: '0,03' },
  ],
  learningCost: { pct: 10, usd: '0,03' },
  channels: [
    { name: 'Telegram · 3 bot', ok: true },
    { name: 'Lark · 1 bot', ok: true },
    { name: 'Zalo OA', ok: false },
  ],
  upcoming: [
    { at: '17:00', bot: 'tin', name: 'Kiểm tra số dư quảng cáo' },
    { at: 'T6 16:00', bot: 'lam', name: 'Tin đối thủ trong tuần' },
    { at: 'T2 07:30', bot: 'mai', name: 'Tóm tắt email buổi sáng' },
  ],
  warning: 'routine “Tin đối thủ trong tuần” lỗi 2 lần · ký ức hồ sơ của Aris đã dùng 88%',
}

/** 6.3b · GĐ6 (mặt tích hợp ACP, API, MCP, A2A). */
export const DEMO_INTEGRATIONS = {
  summary: 'đang chạy nền, 4 ứng dụng đang nối · chỉ trên máy này',
  acp: { on: true, live: '2 đang nối', cmd: 'aris-acp --bot <tên>', bots: ['aris', 'lam', 'tin'] },
  api: {
    on: true,
    live: '1 đang nối',
    url: 'http://127.0.0.1:8642/v1',
    key: 'aris_sk_••••3f9a',
    bots: ['aris', 'mai', 'lam'],
  },
  mcp: { on: true, live: '1 đang nối', tools: ['brain_search', 'brain_capture', 'memory_search'] },
  a2a: { on: false, live: 'đang bật', peers: ['hermes-vps', 'tako-office'], bots: ['aris', 'mai', 'lam'] },
  access: 'Hôm nay 23 lượt truy cập · 1 bị chặn',
}

/** 6.4 · GĐ3 (duyệt), GĐ7 (ngân sách, mạng). */
export const DEMO_GUARD = {
  dailyCap: '5',
  alertAt: '80',
  learningCap: '1',
  denied: ['xoá toàn bộ ổ đĩa', 'chuyển tiền', 'đổi mật khẩu', 'đọc khoá SSH, .env', 'tắt hàng rào này'],
  allowed: ['git status, ls trong thư mục dự án', 'Mai gửi lời mời họp cho người trong công ty'],
  approvalTimeout: '30',
  hosts: [
    'api.deepseek.com',
    'api.anthropic.com',
    'api.telegram.org',
    'open.larksuite.com',
    '*.googleapis.com',
  ],
  moreHosts: 6,
  blocked: { count: 3, host: 'pastebin.com', bot: 'Dev' },
  vault: '1Password · đã kết nối',
}

/** 6.5 · GĐ7 (thống kê, nhật ký phiên). */
export const DEMO_STATS = {
  total: '2,96 USD',
  days: ['T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5'],
  /** Phần trăm từng loại việc trong cột mỗi ngày: chat, được giao, routine, vòng học. */
  bars: [
    [40, 25, 20, 15],
    [38, 30, 17, 15],
    [45, 20, 20, 15],
    [30, 45, 12, 13],
    [40, 28, 17, 15],
    [30, 10, 50, 10],
    [45, 30, 15, 10],
  ],
  /** Chiều cao cột mỗi ngày (px, khung 170px). */
  heights: [90, 110, 70, 160, 100, 40, 75],
  cache: { value: '86%', note: 'tiết kiệm ước tính 61% chi phí đầu vào' },
  autonomous: { value: '78%', note: '142 / 182 việc' },
  skills: { value: '3', note: '1 bị rollback' },
  log: [
    {
      at: '10:42',
      bot: 'lam',
      title: 'Nghiên cứu 3 đối thủ',
      by: 'do Aris giao',
      source: 'Commander',
      usd: '0,11',
    },
    { at: '10:40', bot: 'aris', title: 'Tóm tắt đối thủ + họp thứ 5', by: '', source: 'Web', usd: '0,19' },
    { at: '08:00', bot: 'tin', title: 'Routine: báo cáo chi tiêu tuần', by: '', source: 'Lịch', usd: '0,03' },
    {
      at: '07:55',
      bot: 'ha',
      title: 'Ghi âm: ý tưởng series 5 tập',
      by: '',
      source: 'Telegram',
      usd: '0,01',
    },
  ],
}

/** 6.6 · GĐ8 (màn hình ảo của bot). */
export const DEMO_SCREEN = {
  bots: ['aris', 'lam', 'dev'],
  current: 'lam',
  blocked: 'trang yêu cầu đăng nhập hai bước. Anh cầm lái để đăng nhập, xong trả lại cho Lâm làm tiếp.',
  url: 'https://[DỊCH VỤ]/dang-nhap',
  resources: [
    ['RAM màn hình + trình duyệt', '1,2 GB'],
    ['Tự tắt khi không dùng', '30 phút'],
    ['Báo khi bot mở màn hình', 'bật'],
  ],
  events: [
    ['10:51', 'Mở trang báo cáo của đối thủ C'],
    ['10:51', 'Bấm “Đăng nhập” → trang xác minh'],
    ['10:52', 'Dừng, chờ anh'],
  ],
} as const

/** Phần còn là bản vẽ của trang 2.5: điều Commander đã học (giai đoạn 3). */
export const DEMO_COMMANDER = {
  learned: [
    { bot: 'lam', text: 'Nghiên cứu thị trường', note: '23 lần · 91% đạt' },
    { bot: 'mai', text: 'Lịch và email', note: '41 lần · 98% đạt' },
    { bot: 'tin', text: 'Báo cáo chi tiêu', note: '12 lần · 83% đạt · hay bị sửa định dạng' },
  ],
} as const
