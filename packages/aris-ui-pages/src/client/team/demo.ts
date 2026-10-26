/**
 * Dữ liệu mẫu nhóm "Đội bot" (canvas 1.3, 1.5, 1.6, 2.1–2.4). Nội dung là dữ liệu
 * nên để nguyên tiếng Việt như canvas; dịch vụ đội bot (giai đoạn 2) thay toàn bộ.
 */
import type { BotStatus } from '@aris/ui-kit'

export interface StepDemo {
  text: string
  status: BotStatus
}

/** 1.3 · Chi tiết từng bot ở cột phải của bản đồ. GĐ2. */
export const DEMO_MAP: Record<
  string,
  { task: string; steps: StepDemo[]; memory: string; cost: string; skillVersion: string; skill: string }
> = {
  lam: {
    task: 'Nghiên cứu động thái 3 đối thủ',
    steps: [
      { text: 'Tìm được 20 nguồn', status: 'done' },
      { text: 'Đọc và trích ý · 12/20', status: 'working' },
      { text: 'Gửi tổng hợp cho Aris', status: 'idle' },
    ],
    memory: '62%',
    cost: '0,11 USD',
    skillVersion: 'v3',
    skill: 'Nghiên cứu đối thủ',
  },
  mai: {
    task: 'Lời mời họp thứ 5 với team marketing',
    steps: [
      { text: 'Soạn thư cho 4 người', status: 'done' },
      { text: 'Đợi anh cho gửi', status: 'waiting' },
      { text: 'Gửi và đặt lịch', status: 'idle' },
    ],
    memory: '48%',
    cost: '0,06 USD',
    skillVersion: 'v2',
    skill: 'Soạn lời mời họp',
  },
  tin: {
    task: 'Routine kế tiếp: kiểm số dư lúc 5 giờ chiều',
    steps: [
      { text: 'Báo cáo chi tiêu tuần đã gửi lúc 8 giờ', status: 'done' },
      { text: 'Kiểm số dư quảng cáo', status: 'idle' },
    ],
    memory: '71%',
    cost: '0,03 USD',
    skillVersion: 'v3',
    skill: 'Báo cáo doanh thu tuần',
  },
  ha: {
    task: 'Bài Facebook về khoá học AI',
    steps: [
      { text: 'Viết nháp theo giọng của anh', status: 'done' },
      { text: 'Aris chuyển giao cho anh duyệt', status: 'done' },
      { text: 'Đã lên lịch đăng 19:00', status: 'done' },
    ],
    memory: '35%',
    cost: '0,04 USD',
    skillVersion: 'v1',
    skill: 'Bài Facebook dài',
  },
  dev: {
    task: 'Không có việc đang chạy',
    steps: [{ text: 'Sửa landing page · hôm qua', status: 'done' }],
    memory: '22%',
    cost: '0,00 USD',
    skillVersion: 'v2',
    skill: 'Landing page',
  },
}

/** Hoạt động hôm nay (06:00 → bây giờ): các đoạn [bắt đầu, kết thúc] theo phần trăm. GĐ2. */
export const DEMO_TIMELINE: { id: string; spans: [number, number][] }[] = [
  {
    id: 'aris',
    spans: [
      [8, 14],
      [60, 100],
    ],
  },
  { id: 'lam', spans: [[62, 100]] },
  {
    id: 'mai',
    spans: [
      [20, 30],
      [62, 70],
    ],
  },
  { id: 'tin', spans: [[32, 40]] },
  { id: 'ha', spans: [[14, 26]] },
]

/** 2.2 · Hồ sơ bot. GĐ2. */
export const DEMO_PROFILE = {
  id: 'lam',
  about: 'Nghiên cứu · đọc nguồn, so sánh, tổng hợp có trích dẫn',
  soulMeta: 'đứng đầu prompt · sửa lần cuối 18/10 · phiên bản 4',
  soul: [
    'Bạn là Lâm, nhà nghiên cứu cẩn thận trong đội của anh.',
    'Luôn trích dẫn nguồn, ghi rõ ngày của dữ liệu.',
    'Tách sự thật và nhận định. Khi nguồn mâu thuẫn, nêu cả hai.',
    'Viết tiếng Việt có dấu, ngắn gọn, ưu tiên bảng so sánh.',
    'Không đoán số liệu; thiếu thì nói thiếu.',
  ].join('\n'),
  models: [
    { task: 'Chat và làm việc', provider: 'DeepSeek', model: 'deepseek-chat', note: 'mặc định của bot' },
    { task: 'Suy luận sâu (khi /goal)', provider: 'DeepSeek', model: 'deepseek-reasoner', note: '' },
    { task: 'Vòng học nền', provider: 'DeepSeek', model: 'deepseek-chat', note: 'theo cài đặt chung' },
    { task: 'Dự phòng khi lỗi', provider: 'Anthropic', model: 'Claude Haiku 5.5', note: '' },
  ],
  tools: [
    { text: 'Tìm và đọc web', on: true },
    { text: 'Đọc tệp, PDF, Office', on: true },
    { text: 'Brain · chỉ đọc', on: true },
    { text: 'Chạy lệnh terminal', on: false },
    { text: 'Gửi email / tin nhắn ra ngoài', on: false },
  ],
  permissions: [
    ['Ghi file', 'Chỉ trong thư mục làm việc'],
    ['Hành động nguy hiểm', 'Luôn hỏi anh'],
  ],
  channels: [
    { text: 'Telegram · @lam_nghiencuu_bot', connected: true },
    { text: 'Lark', connected: false },
  ],
  routines: 2,
  now: 'nghiên cứu 3 đối thủ',
  stats: [
    ['Được giao 7 ngày', '23 việc'],
    ['Hoàn thành', '91%'],
    ['Chi phí 7 ngày', '1,84 USD'],
    ['Ký ức lõi', '62%'],
  ],
  delegatedTags: ['nghiên cứu thị trường', 'tóm tắt tài liệu', 'so sánh sản phẩm'],
  learned: ['Skill nghien-cuu-doi-thu lên v3 · 21/10', 'Ghi nhớ: anh thích bảng so sánh có cột “nguồn”'],
}

/** 2.1 · Mẫu bot và linh vật gợi ý. */
export const DEMO_CREATE_BOT = {
  templates: ['Thư ký', 'Nghiên cứu', 'Tài chính', 'Viết nội dung', 'Lập trình', 'Trống'],
  template: 'Viết nội dung',
  suggested: [
    'ha',
    'dam-may',
    'hat-dau',
    'bong-hoa',
    'bong-bong-thoai',
    'qua-trung',
    'chiec-la',
    'vuong-mien',
  ],
  name: 'Hạ',
  title: 'Biên tập nội dung',
  about:
    'Viết bài Facebook, kịch bản video ngắn và email theo giọng văn của anh. Sửa bản nháp, đề xuất tiêu đề.',
  cloneFrom: ['blank', 'aris', 'lam'],
}
