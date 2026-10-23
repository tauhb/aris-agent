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

/** 6.2 · GĐ1 (danh mục model của dsh, kho khoá). */
export const DEMO_PROVIDERS = {
  connected: [
    { id: 'deepseek', name: 'DeepSeek', color: '#4D6BFE', ok: true },
    { id: 'anthropic', name: 'Anthropic', color: '#D97757', ok: true },
    { id: 'ollama', name: 'Ollama · trên máy', color: 'var(--a-ink)', ok: true },
    { id: 'litellm', name: 'LiteLLM nội bộ', color: '#7C3AED', ok: false, custom: true },
  ],
  available: [
    'OpenAI',
    'Google Gemini',
    'OpenRouter',
    'Qwen · Moonshot · Zhipu',
    'Groq · Mistral · xAI',
    'LM Studio · vLLM',
  ],
  current: {
    name: 'DeepSeek',
    color: '#4D6BFE',
    sdk: 'Kiểu SDK: tương thích OpenAI · provider mặc định',
    latency: '210 ms',
    key: 'sk-••••••••••••••••3f2a',
    keys: 2,
    baseUrl: 'https://api.deepseek.com',
    probe: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', caps: ['gọi tool', 'đầu ra JSON', 'cache'], on: true },
      { id: 'deepseek-reasoner', caps: ['suy luận', 'gọi tool', 'cache'], on: true },
    ],
  },
  byTask: [
    { task: 'Chat với bot', model: null, color: null },
    { task: 'Commander điều phối', model: 'Claude Opus 5.5', color: '#D97757' },
    { task: 'Vòng học nền', model: 'deepseek-chat', color: '#4D6BFE' },
    { task: 'Tóm tắt khi tìm lại', model: 'deepseek-chat', color: '#4D6BFE' },
    { task: 'Giám khảo mục tiêu', model: 'Claude Haiku 5.5', color: '#D97757' },
    { task: 'Nén ngữ cảnh', model: 'deepseek-chat', color: '#4D6BFE' },
    { task: 'Kiểm thử skill', model: 'deepseek-chat', color: '#4D6BFE' },
    { task: 'Nhúng (tìm ngữ nghĩa)', model: 'Ollama · nomic-embed-text', color: 'var(--a-ink)' },
  ],
  fallback: ['DeepSeek', 'Anthropic', 'Ollama trên máy'],
}

/** 6.3 · GĐ1 (Telegram), GĐ6 (Lark, Zalo). */
export const DEMO_CHANNELS = {
  telegram: [
    { bot: 'aris', name: 'Aris', handle: '@aris_chunhan_bot', note: 'cửa vào chính' },
    { bot: 'lam', name: 'Lâm', handle: '@lam_nghiencuu_bot', note: 'chat riêng' },
    { bot: 'mai', name: 'Mai', handle: '@mai_thuky_bot', note: 'chat riêng' },
  ],
  lark: [
    { bot: 'aris', text: 'Aris trong nhóm “Marketing”', note: 'chỉ trả lời khi được @' },
    { bot: 'lam', text: 'Lâm gửi routine vào nhóm “Marketing”', note: 'chỉ gửi' },
  ],
  zaloNeeds: 'Official Account đã xác thực · App ID · khoá bí mật · đường webhook công khai',
  pairCode: '4KX7-29QM',
  pairExpires: '9:42',
  paired: ['Chủ nhân · Telegram', 'Chủ nhân · Lark'],
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

/** 2.5 · GĐ2 (dịch vụ đội bot, định tuyến của Commander). */
export const DEMO_COMMANDER = {
  delegates: [
    { bot: 'mai', text: 'Mai · email, lịch, giấy tờ', on: true, approve: false },
    { bot: 'lam', text: 'Lâm · nghiên cứu, tổng hợp', on: true, approve: false },
    { bot: 'tin', text: 'Tín · tài chính, ngân sách', on: true, approve: false },
    { bot: 'dev', text: 'Dev · lập trình', on: true, approve: true },
  ],
  limits: { parallel: '4', nested: '4', budget: '0,30' },
  routing: [
    {
      at: '10:42',
      req: 'Tóm tắt 3 đối thủ',
      kind: 'delegate',
      bot: 'Lâm',
      why: 'Khớp “nghiên cứu” · tin cậy 0,92',
      result: 'đang',
    },
    {
      at: '10:42',
      req: 'Xếp lịch họp T5',
      kind: 'delegate',
      bot: 'Mai',
      why: 'Khớp “lịch” · 0,95',
      result: 'chờ anh',
    },
    {
      at: '09:15',
      req: 'Dịch đoạn email sang tiếng Anh',
      kind: 'self',
      bot: '',
      why: 'Việc nhẹ, xong trong 1 lượt',
      result: '✓',
    },
    {
      at: '08:30',
      req: 'Viết bài Facebook về khoá học',
      kind: 'handoff',
      bot: 'Hạ',
      why: 'Hạ sở hữu toàn bộ kết quả',
      result: '✓',
    },
    {
      at: 'hôm qua',
      req: 'Kiểm tra 40 link trong tài liệu',
      kind: 'helpers',
      bot: '4',
      why: 'Quét độc lập, chia lô song song',
      result: '✓',
    },
  ],
  learned: [
    { bot: 'lam', text: 'Nghiên cứu thị trường', note: '23 lần · 91% đạt' },
    { bot: 'mai', text: 'Lịch và email', note: '41 lần · 98% đạt' },
    { bot: 'tin', text: 'Báo cáo chi tiêu', note: '12 lần · 83% đạt · hay bị anh sửa định dạng' },
  ],
} as const
