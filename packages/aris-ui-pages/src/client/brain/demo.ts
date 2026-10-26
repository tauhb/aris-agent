/**
 * Dữ liệu mẫu Brain (canvas 5.1–5.4). Nội dung là dữ liệu nên để nguyên tiếng
 * Việt như canvas; kho ghi chú Markdown và đồ thị thật nối ở giai đoạn 5.
 */

/** 5.1 · Cây ghi chú bên trái. */
export const DEMO_TREE = {
  inbox: 12,
  daily: 'Ghi chú hằng ngày',
  groups: [
    { title: 'Dự án', items: [{ name: 'Kênh YouTube Q4', active: true }, { name: 'Ra mắt khoá học AI' }] },
    {
      title: 'Lĩnh vực',
      items: [{ name: 'Marketing' }, { name: 'Tài chính cá nhân' }, { name: 'Sức khoẻ' }],
    },
    {
      title: 'Khác',
      items: [{ name: 'Người', count: 24 }, { name: 'Tài nguyên' }, { name: 'Lưu trữ', muted: true }],
    },
  ] as { title: string; items: { name: string; active?: boolean; count?: number; muted?: boolean }[] }[],
}

/** 5.1 · Ghi chú đang mở. */
export const DEMO_NOTE = {
  path: ['Dự án', 'Kênh YouTube Q4'],
  title: 'Chiến lược nội dung YouTube Q4',
  short: 'Chiến lược nội dung',
  meta: '#chiến-lược #youtube · từ ghi âm Telegram 21/10 · Lâm sửa lần cuối hôm nay',
  summary: 'Tập trung video hướng dẫn, 2 video/tuần, ngân sách 50 triệu; chờ anh chọn ưu tiên.',
  intro: [
    'Rút ra từ dự án ',
    ['Kế hoạch quý 4'],
    '. Dữ liệu trong ',
    ['Báo cáo kênh 90 ngày'],
    ' cho thấy video hướng dẫn giữ chân người xem tốt nhất.',
  ],
  goals: [
    ['2 video hướng dẫn mỗi tuần'],
    ['Thử định dạng dưới 60 giây — xem ', ['Ghi chú: video ngắn']],
    ['Ngân sách theo ', ['Ngân sách marketing 2026']],
  ],
  backlinks: [
    'Ra mắt khoá học AI',
    'Ghi chú hằng ngày 22/10',
    'Phiên chat với Aris 21/10',
    'Skill: bao-cao-kenh-youtube',
  ],
  suggestions: [
    { text: '“Lịch quay tháng 11” — cùng nói về 2 video/tuần' },
    { text: 'Người “Chị Hà — editor” — nhắc trong 3 ghi chú sản xuất' },
  ],
} as const

/** Đoạn văn có liên kết: chuỗi thường hoặc [tên ghi chú được liên kết]. */
export type Rich = readonly (string | readonly [string])[]

/** 5.1 · Đồ thị quanh ghi chú (hình vẽ cố định theo canvas, thay bằng đồ thị thật ở GĐ5). */
export const DEMO_LOCAL_GRAPH = {
  viewBox: '0 0 272 256',
  label:
    'Ghi chú Chiến lược YouTube Q4 ở giữa, nối với Báo cáo 90 ngày, Dự án YouTube, Ký ức của Tín, Phiên chat 21/10, Chị Hà; aris gợi ý nối thêm Lịch quay tháng 11',
  svg: '<defs> <radialGradient id="gc-bg" cx="50%" cy="48%" r="60%"><stop offset="0%" stop-color="var(--a-accent)" stop-opacity="0.10"></stop><stop offset="100%" stop-color="var(--a-accent)" stop-opacity="0"></stop></radialGradient> <radialGradient id="gc-core" cx="38%" cy="32%" r="75%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"></stop><stop offset="45%" stop-color="var(--a-accent)" stop-opacity="1"></stop><stop offset="100%" stop-color="var(--a-accent)" stop-opacity="1"></stop></radialGradient> </defs> <rect x="0" y="0" width="272" height="256" fill="url(#gc-bg)"></rect> <circle cx="136" cy="124" r="54" fill="none" stroke="var(--a-line)" stroke-width="1" stroke-dasharray="2 5" opacity="0.7"></circle> <circle cx="136" cy="124" r="90" fill="none" stroke="var(--a-line)" stroke-width="1" stroke-dasharray="2 6" opacity="0.5"></circle> <g class="ap-d2"> <path d="M91 46 Q62 44 43 54" fill="none" stroke="#5B8DEF" stroke-width="1.2" opacity="0.45"></path><circle cx="40" cy="56" r="4.5" fill="#5B8DEF" opacity="0.6"></circle> <path d="M181 46 Q205 34 226 30" fill="none" stroke="#00B5A5" stroke-width="1.2" opacity="0.45"></path><circle cx="228" cy="29" r="4.5" fill="#5B8DEF" opacity="0.6"></circle> <path d="M181 46 Q206 58 222 70" fill="none" stroke="#00B5A5" stroke-width="1.2" opacity="0.45"></path><path d="M224 66l4.5 8h-9z" fill="#FF309C" opacity="0.6"></path> <path d="M91 202 Q66 214 50 228" fill="none" stroke="#FF6700" stroke-width="1.2" opacity="0.45"></path><circle cx="48" cy="229" r="4.5" fill="#5B8DEF" opacity="0.6"></circle> <path d="M226 124 Q248 150 252 168" fill="none" stroke="#9259FE" stroke-width="1.2" opacity="0.45"></path><circle cx="252" cy="171" r="4.5" fill="#5B8DEF" opacity="0.6"></circle> </g> <path d="M136 124 Q124 79 91 46" fill="none" stroke="#5B8DEF" stroke-width="2.2" stroke-linecap="round" opacity="0.7"></path> <path d="M136 124 Q169 91 181 46" fill="none" stroke="#00B5A5" stroke-width="2.2" stroke-linecap="round" opacity="0.7"></path> <path d="M136 124 Q181 136 226 124" fill="none" stroke="#9259FE" stroke-width="2.2" stroke-linecap="round" opacity="0.7"></path> <path d="M136 124 Q148 169 181 202" fill="none" stroke="var(--a-muted)" stroke-width="2" stroke-linecap="round" opacity="0.55"></path> <path d="M136 124 Q103 157 91 202" fill="none" stroke="#FF6700" stroke-width="2.2" stroke-linecap="round" opacity="0.7"></path> <path d="M136 124 Q91 112 46 124" fill="none" stroke="var(--a-accent)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="4 5" opacity="0.8"></path> <path class="ap-flow" d="M136 124 Q169 91 181 46" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" opacity="0.9"></path> <path class="ap-flow" d="M136 124 Q181 136 226 124" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" opacity="0.9"></path> <g class="ap-nd"><circle cx="91" cy="46" r="13" fill="#5B8DEF"></circle><circle cx="87" cy="42" r="5" fill="#FFFFFF" opacity="0.25"></circle><path d="M86.5 41.5h9M86.5 45.5h9M86.5 49.5h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"></path></g> <g class="ap-nd"><rect x="168" y="33" width="26" height="26" rx="8" fill="#00B5A5"></rect><rect x="175.5" y="40.5" width="11" height="11" rx="3" fill="none" stroke="#fff" stroke-width="1.8"></rect></g> <g class="ap-nd"><path d="M226 109.5C228 109.5 229.4 110.6 230.4 112.3L239.2 128.2C241 131.4 238.8 135 235.2 135H216.8C213.2 135 211 131.4 212.8 128.2L221.6 112.3C222.6 110.6 224 109.5 226 109.5Z" fill="#9259FE"></path><circle cx="226" cy="126" r="2.6" fill="#fff"></circle></g> <g class="ap-nd"><circle cx="181" cy="202" r="12" fill="var(--a-panel)" stroke="var(--a-muted)" stroke-width="2.4"></circle><path d="M176 198.5h10a1.8 1.8 0 0 1 1.8 1.8v4.2a1.8 1.8 0 0 1-1.8 1.8h-5.5l-3 2.4v-2.4h-1.5a1.8 1.8 0 0 1-1.8-1.8v-4.2a1.8 1.8 0 0 1 1.8-1.8z" fill="none" stroke="var(--a-muted)" stroke-width="1.5" stroke-linejoin="round"></path></g> <g class="ap-nd"><circle cx="91" cy="202" r="13" fill="#FF6700"></circle><circle cx="87" cy="198" r="5" fill="#FFFFFF" opacity="0.25"></circle><circle cx="91" cy="198.5" r="3.2" fill="#fff"></circle><path d="M84.5 208.5c1.2-3.2 3.6-4.6 6.5-4.6s5.3 1.4 6.5 4.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"></path></g> <g class="ap-nd"><circle cx="46" cy="124" r="12" fill="var(--a-panel)" stroke="var(--a-accent)" stroke-width="2" stroke-dasharray="3 3"></circle><path d="M46 119v10M41 124h10" stroke="var(--a-accent)" stroke-width="2" stroke-linecap="round"></path></g> <circle class="ap-halo" cx="136" cy="124" r="32" fill="var(--a-accent)" opacity="0.18"></circle> <circle cx="136" cy="124" r="22" fill="url(#gc-core)"></circle> <path d="M129 117.5h14M129 123.5h14M129 129.5h9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"></path> <g font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="var(--a-ink)"> <rect x="72" y="153" width="128" height="20" rx="10" fill="var(--a-panel)" stroke="var(--a-line)"></rect> <text x="136" y="167" text-anchor="middle" font-weight="700" font-size="11">Chiến lược YouTube Q4</text> <rect x="49" y="9" width="84" height="18" rx="9" fill="var(--a-panel)" stroke="var(--a-line)"></rect><text x="91" y="22" text-anchor="middle">Báo cáo 90 ngày</text> <rect x="141" y="9" width="80" height="18" rx="9" fill="var(--a-panel)" stroke="var(--a-line)"></rect><text x="181" y="22" text-anchor="middle">Dự án YouTube</text> <rect x="192" y="141" width="72" height="18" rx="9" fill="var(--a-panel)" stroke="var(--a-line)"></rect><text x="228" y="154" text-anchor="middle">Ký ức của Tín</text> <rect x="149" y="221" width="64" height="18" rx="9" fill="var(--a-panel)" stroke="var(--a-line)"></rect><text x="181" y="234" text-anchor="middle">Phiên 21/10</text> <rect x="60" y="221" width="62" height="18" rx="9" fill="var(--a-panel)" stroke="var(--a-line)"></rect><text x="91" y="234" text-anchor="middle">Chị Hà</text> <rect x="8" y="141" width="76" height="18" rx="9" fill="var(--a-accentSoft)" stroke="var(--a-accent)" stroke-dasharray="3 3"></rect><text x="46" y="154" text-anchor="middle" fill="var(--a-accent)">Lịch quay T11?</text> </g>',
}

/** 5.2 · Hộp thư vào. */
export const DEMO_INBOX = [
  {
    source: 'voice',
    from: 'Ghi âm Telegram · 1:42 · 07:55',
    title: 'Ý tưởng: series “AI cho chủ shop” 5 tập',
    summary: 'Đã chép lời và tóm tắt: 5 tập, mỗi tập 1 công cụ, kết bằng mời vào khoá học.',
    plan: [
      ['place', 'Dự án / Kênh YouTube Q4'],
      ['tag', '#ý-tưởng'],
      ['task', 'Hạ viết dàn ý'],
    ],
  },
  {
    source: 'link',
    from: 'Link chuyển tiếp · Lark · hôm qua',
    title: 'Bài phân tích: xu hướng video ngắn 2026',
    summary: 'Tóm tắt 5 ý chính, trích 2 số liệu kèm nguồn.',
    plan: [
      ['place', 'Tài nguyên / Marketing'],
      ['link', 'Chiến lược nội dung YouTube Q4'],
    ],
  },
  {
    source: 'image',
    from: 'Ảnh danh thiếp · Zalo · hôm qua',
    title: 'Anh [TÊN] — đối tác in ấn',
    summary: 'Đọc được tên, công ty, số điện thoại, email.',
    plan: [
      ['page', 'Người / [TÊN]'],
      ['remind', 'gọi lại thứ 2'],
    ],
  },
  {
    source: 'note',
    from: '/note từ chat với Aris · 2 ngày trước',
    title: 'Giữ quảng cáo dưới 30% ngân sách',
    summary: '',
    plan: [
      ['place', 'Lĩnh vực / Tài chính'],
      ['readers', 'Tín'],
      ['readers', 'Aris'],
    ],
  },
] as {
  source: 'voice' | 'link' | 'image' | 'note'
  from: string
  title: string
  summary: string
  plan: [string, string][]
}[]
