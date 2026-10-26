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
