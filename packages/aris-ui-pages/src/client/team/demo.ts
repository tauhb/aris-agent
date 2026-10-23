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
  skills: [
    { id: 'nghien-cuu-doi-thu', v: 'v3', note: 'dùng 9 lần · 89% thành công' },
    { id: 'tom-tat-nguon', v: 'v2', note: 'dùng 31 lần · 97%' },
    { id: 'bang-so-sanh', v: 'v1', note: 'dùng 4 lần' },
  ],
  skillCount: 14,
  tools: [
    { text: 'Tìm và đọc web', on: true },
    { text: 'Đọc tệp, PDF, Office', on: true },
    { text: 'Second Brain · chỉ đọc', on: true },
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

/** 2.3 · Bot hiểu gì về chủ nhân. GĐ3. */
export const DEMO_OWNER = {
  bots: ['aris', 'mai', 'lam', 'tin'],
  insights: 18,
  unsure:
    'anh muốn báo cáo nghiên cứu dài 1 trang hay đầy đủ chi tiết? Hai lần gần đây anh phản hồi ngược nhau.',
  unsureOptions: ['1 trang', 'Đầy đủ', 'Tuỳ việc'],
  communication: [
    { text: 'Trả lời tiếng Việt có dấu, ngắn, ưu tiên bảng', pct: 94, evidence: 12 },
    { text: 'Không thích mở đầu bằng lời khen hay rào đón', pct: 81, evidence: 5 },
    { text: 'Bảng so sánh phải có cột “nguồn”', pct: 88, evidence: 4 },
  ],
  goals: [
    { text: 'Đang tập trung kênh YouTube và khoá học AI trong quý 4', pct: 76, evidence: 7 },
    { text: 'Theo dõi 3 đối thủ: [ĐỐI THỦ A], [ĐỐI THỦ B], [ĐỐI THỦ C]', pct: 70, evidence: 3 },
    { text: 'Có thể thích nhận báo cáo vào sáng thứ 2', pct: 42, evidence: 1 },
  ],
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

/** 2.1b · Agent ngoài nói ACP mà aris dò được trên máy. GĐ6. */
export const DEMO_AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    cmd: 'claude-code-acp',
    note: 'Đã đăng nhập · dùng tài khoản Claude Code trên máy anh.',
    state: 'ready',
  },
  {
    id: 'codex',
    name: 'Codex',
    cmd: 'codex-acp',
    note: 'Đã đăng nhập · dùng tài khoản Codex trên máy anh.',
    state: 'ready',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    cmd: 'hermes acp',
    note: 'Đã đăng nhập · Hermes dùng ký ức và skill riêng của nó.',
    state: 'ready',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    cmd: 'gemini --experimental-acp',
    note: 'Chưa đăng nhập · chạy "gemini" một lần trong terminal.',
    state: 'login',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    cmd: 'opencode acp',
    note: 'Chưa cài · npm i -g opencode-ai',
    state: 'missing',
  },
  { id: 'custom', name: '', cmd: '…', note: 'Nhập lệnh của bất kỳ agent nào nói ACP.', state: 'custom' },
] as const

/** 1.5 · Tạo dự án. GĐ2 (thành viên, mục tiêu). */
export const DEMO_PROJECT = {
  name: 'Ra mắt khoá học AI',
  members: {
    aris: true,
    lam: true,
    tin: false,
    mai: true,
    ha: true,
    dev: false,
    'banh-rang': false,
  } as Record<string, boolean>,
  external: { 'banh-rang': 'Khoa' } as Record<string, string>,
  dir: '~/Projects/khoa-hoc-ai',
  goal: 'Lên kế hoạch ra mắt khoá học AI trong tháng 11: nội dung, giá, lịch quảng bá.',
}

/** 1.6 · Kết quả tìm trong mọi phiên. GĐ1. */
export const DEMO_SEARCH = {
  query: 'đối thủ',
  results: [
    {
      bot: 'aris',
      title: 'Đối thủ và lịch họp',
      where: 'Aris',
      when: 'hôm nay',
      snip: ['Tóm tắt động thái của 3 ', 'đối thủ', ' tuần này, rồi xếp lịch họp thứ 5…'],
    },
    {
      bot: 'lam',
      title: 'Nghiên cứu 3 đối thủ',
      where: 'Lâm',
      when: 'hôm nay',
      snip: ['…kênh A tăng 18% lượt xem nhờ video ngắn; ', 'đối thủ', ' B giảm giá khoá học…'],
    },
    {
      bot: 'tin',
      title: 'Mục tiêu quý 4',
      where: 'Dự án · Kế hoạch quý 4',
      when: '21/10',
      snip: ['Tín: so với ', 'đối thủ', ', ngân sách quảng cáo của mình thấp hơn 30%…'],
    },
    {
      bot: 'aris',
      title: 'Giá khoá học AI',
      where: 'Aris',
      when: '15/10',
      snip: ['Mức giá của 4 ', 'đối thủ', ' nằm trong khoảng 1,2–2,5 triệu…'],
    },
  ] as { bot: string; title: string; where: string; when: string; snip: [string, string, string] }[],
}

/** Phòng ban (quyết định 12): chính sách chung và việc lớn đang nhận. GĐ2. */
export const DEMO_DEPARTMENTS: Record<
  string,
  {
    about: string
    skills: string[]
    brain: string[]
    model: string
    budget: string
    perms: [string, string][]
    work: { title: string; project: string; progress: string; status: BotStatus }[]
  }
> = {
  research: {
    about: 'Đọc nguồn, so sánh, tổng hợp có trích dẫn',
    skills: ['tom-tat-nguon', 'nghien-cuu-doi-thu', 'bang-so-sanh'],
    brain: ['Tài nguyên', 'Dự án · chỉ đọc'],
    model: 'DeepSeek · deepseek-reasoner',
    budget: '1,00 USD mỗi ngày',
    perms: [
      ['Ghi tệp', 'Chỉ trong thư mục dự án'],
      ['Gửi thư, tin nhắn ra ngoài', 'Không được'],
      ['Hành động nguy hiểm', 'Luôn hỏi anh'],
    ],
    work: [
      {
        title: 'Nghiên cứu sâu 5 đối thủ, mỗi đối thủ một báo cáo',
        project: 'Ra mắt khoá học AI',
        progress: '2/5 báo cáo',
        status: 'working',
      },
    ],
  },
  ops: {
    about: 'Thư từ, lịch họp, tài chính và việc giấy tờ',
    skills: ['soan-loi-moi-hop', 'bao-cao-doanh-thu-tuan', 'kiem-so-du'],
    brain: ['Lĩnh vực / Tài chính', 'Người'],
    model: 'DeepSeek · deepseek-chat',
    budget: '0,50 USD mỗi ngày',
    perms: [
      ['Gửi thư, tin nhắn ra ngoài', 'Hỏi anh trước'],
      ['Lịch', 'Được xếp, không được xoá'],
      ['Hành động nguy hiểm', 'Luôn hỏi anh'],
    ],
    work: [
      {
        title: 'Lịch quảng bá tháng 11',
        project: 'Ra mắt khoá học AI',
        progress: 'chờ thẻ “Đề xuất giá”',
        status: 'waiting',
      },
    ],
  },
  creative: {
    about: 'Viết nội dung theo giọng anh, làm trang và sửa mã',
    skills: ['bai-facebook-dai', 'landing-page', 'viet-theo-giong-anh'],
    brain: ['Dự án', 'Tài nguyên / Marketing'],
    model: 'DeepSeek · deepseek-chat',
    budget: '0,80 USD mỗi ngày',
    perms: [
      ['Ghi tệp', 'Chỉ trong thư mục dự án'],
      ['Đăng bài', 'Hỏi anh trước'],
    ],
    work: [],
  },
}
