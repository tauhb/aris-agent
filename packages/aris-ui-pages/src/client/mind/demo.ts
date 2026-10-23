/**
 * Dữ liệu mẫu nhóm "Trí nhớ và tự tiến hoá" (canvas 3.1–3.5). Nội dung là dữ liệu
 * nên để nguyên tiếng Việt như canvas; mỗi khối ghi giai đoạn nối dữ liệu thật.
 */

/** 3.1 · Bot có trang ký ức. Ký ức là dữ liệu thật (`@aris/memory`); danh sách bot thật ở GĐ2. */
export const DEMO_MEMORY = {
  bots: ['aris', 'mai', 'lam', 'tin', 'dev'],
}

export type SkillState = 'pending' | 'active' | 'rare' | 'archived'

/** 3.2 · GĐ3 (thư viện skill, vòng học). */
export const DEMO_SKILLS = {
  summary: '62 skill · 9 do bot tự học · người dọn thư viện chạy lần kế 28/10 khi anh rảnh',
  counts: { pending: 2 },
  rows: [
    {
      id: 'bao-cao-doanh-thu-tuan',
      note: 'Bản vá: thêm cột so với tuần trước',
      bot: 'tin',
      version: 'v2 → v3',
      state: 'pending',
      stateText: 'chờ duyệt',
      uses: '12',
      success: ['83%', '100%'],
      updated: 'hôm nay',
      pinned: false,
    },
    {
      id: 'soan-loi-moi-hop',
      note: 'Mới — học từ việc sáng nay',
      bot: 'mai',
      version: 'v1',
      state: 'pending',
      stateText: 'chờ duyệt',
      uses: '0',
      success: ['eval 5/5 đạt'],
      updated: 'hôm nay',
      pinned: false,
    },
    {
      id: 'nghien-cuu-doi-thu',
      note: '',
      bot: 'lam',
      version: 'v3',
      state: 'active',
      stateText: 'đang dùng',
      uses: '9',
      success: ['89%'],
      updated: '21/10',
      pinned: false,
    },
    {
      id: 'tom-tat-nguon',
      note: '',
      bot: 'lam',
      version: 'v2',
      state: 'active',
      stateText: 'đang dùng',
      uses: '31',
      success: ['97%'],
      updated: '03/10',
      pinned: true,
    },
    {
      id: 'dat-lich-routine',
      note: '',
      bot: 'aris',
      version: 'v1',
      state: 'rare',
      stateText: 'ít dùng · 16 ngày',
      uses: '2',
      success: ['100%'],
      updated: '07/10',
      pinned: false,
    },
    {
      id: 'xuat-hoa-don-cu',
      note: '',
      bot: 'tin',
      version: 'v1',
      state: 'archived',
      stateText: 'lưu kho',
      uses: '0',
      success: ['—'],
      updated: '12/09',
      pinned: false,
    },
  ] satisfies {
    id: string
    note: string
    bot: string
    version: string
    state: SkillState
    stateText: string
    uses: string
    success: string[]
    updated: string
    pinned: boolean
  }[],
}

/** 3.3 · GĐ3 (bản vá skill, ca thử chạy lại phiên cũ). */
export const DEMO_SKILL = {
  id: 'bao-cao-doanh-thu-tuan',
  bot: 'tin',
  subtitle: 'Của Tín · bản vá v3 do vòng học đề xuất sau khi anh sửa báo cáo hôm qua',
  diffStat: 'SKILL.md · +4 −1',
  diff: [
    { kind: ' ', text: '## Các bước' },
    { kind: ' ', text: '1. Lấy file Excel doanh thu tuần trong Drive' },
    { kind: ' ', text: '2. Gộp theo kênh bán, đơn vị triệu đồng' },
    { kind: '-', text: '3. Xuất bảng 3 cột: kênh, doanh thu, tỉ trọng' },
    { kind: '+', text: '3. Lấy thêm số tuần trước từ báo cáo đã gửi' },
    { kind: '+', text: '4. Xuất bảng 4 cột: kênh, doanh thu, tỉ trọng, so tuần trước (%)' },
    { kind: ' ', text: ' ' },
    { kind: ' ', text: '## Lỗi thường gặp' },
    { kind: '+', text: '- Tuần có ngày lễ: ghi chú bên dưới bảng, đừng tự điều chỉnh số' },
    { kind: '+', text: '- Thiếu file tuần trước: để trống cột so sánh và báo anh' },
  ] as { kind: ' ' | '+' | '-'; text: string }[],
  reason: 'anh sửa báo cáo ngày 22/10, thêm cột so sánh bằng tay',
  metrics: [
    { label: 'pass', value: '5/5', note: 'v2: 4/5', good: true },
    { label: 'steps', value: '−32%', note: '9,4 → 6,4', good: false },
    { label: 'tokens', value: '−18%', note: 'mỗi lần chạy', good: false },
  ],
  cases: [
    { name: 'Tuần 41 — có file đủ', v2: ['đạt', true], v3: ['đạt', true], steps: 6 },
    { name: 'Tuần 42 — anh sửa thêm cột', v2: ['thiếu cột', false], v3: ['đạt', true], steps: 7 },
    { name: 'Tuần 39 — có ngày lễ', v2: ['đạt', true], v3: ['đạt', true], steps: 6 },
    { name: 'Thiếu file tuần trước', v2: ['đạt', true], v3: ['đạt', true], steps: 5 },
    { name: 'File có thêm kênh mới', v2: ['đạt', true], v3: ['đạt', true], steps: 8 },
  ] as { name: string; v2: [string, boolean]; v3: [string, boolean]; steps: number }[],
  history: [
    { text: 'v2 · 10/10 · thêm đơn vị triệu đồng', restore: true },
    { text: 'v1 · 02/10 · tạo sau việc khó đầu tiên', restore: false },
  ],
}

export type ApprovalKind = 'action' | 'memory' | 'skill'

/** 3.4 · GĐ3 (hộp duyệt). */
export const DEMO_APPROVALS = {
  doneToday: 7,
  items: [
    {
      id: 'invite',
      kind: 'action',
      bot: 'mai',
      title: 'Gửi lời mời họp',
      sub: 'Mai · qua Commander · 4 người nhận',
      due: 'còn 25 phút',
      heading: 'Mai muốn gửi lời mời họp',
      context: 'Commander Aris giao lúc 10:42 · yêu cầu của anh trong chat với Aris',
      fields: [
        ['Thời gian', 'Thứ 5, 30/10 · 14:00–15:00'],
        ['Người nhận', '4 người · marketing@[CÔNG TY], [TÊN 1], [TÊN 2], [TÊN 3]'],
        ['Nơi họp', 'Google Meet (theo ký ức của Aris)'],
        [
          'Nội dung',
          'Chào cả nhóm, mời mọi người họp thứ 5 để thống nhất kế hoạch nội dung quý 4. Tài liệu: báo cáo đối thủ (Lâm gửi trước buổi họp).',
        ],
      ],
      risk: 'Gửi ra ngoài · không hoàn tác được',
      timeout: '25 phút',
    },
    {
      id: 'skill',
      kind: 'skill',
      bot: 'tin',
      title: 'Bật skill bao-cao-doanh-thu-tuan v3',
      sub: 'Tín · eval 5/5 đạt · −32% số bước',
      due: '',
      heading: 'Tín đề xuất bản vá skill bao-cao-doanh-thu-tuan',
      context: 'Vòng học nền · sau khi anh sửa báo cáo ngày 22/10',
      fields: [
        ['Thay đổi', 'Thêm cột so với tuần trước · +4 −1 dòng'],
        ['Ca thử', '5/5 đạt (v2: 4/5) · −32% số bước · −18% token'],
      ],
      risk: '',
      timeout: '',
    },
    {
      id: 'memory',
      kind: 'memory',
      bot: 'mai',
      title: 'Lưu ký ức',
      sub: '“Anh không nhận họp trước 9 giờ”',
      due: '',
      heading: 'Mai muốn ghi nhớ một điều về anh',
      context: 'Vòng học nền · từ chat 10:35',
      fields: [
        ['Ký ức', 'Anh không nhận cuộc họp trước 9 giờ sáng'],
        ['Lưu vào', 'Hồ sơ chủ nhân của Mai'],
      ],
      risk: '',
      timeout: '',
    },
  ] satisfies {
    id: string
    kind: ApprovalKind
    bot: string
    title: string
    sub: string
    due: string
    heading: string
    context: string
    fields: [string, string][]
    risk: string
    timeout: string
  }[],
  rule: '“gửi lời mời họp cho người trong công ty” 12 lần',
}

/** 3.5 · GĐ3 (mục tiêu, việc được giao, vòng lặp, điểm khôi phục). */
export const DEMO_RUNS = {
  goal: {
    bot: 'aris',
    title: 'Tóm tắt 3 đối thủ và chốt lịch họp thứ 5',
    turn: 'lượt 2/20',
    pct: 10,
    judgeAt: '10:44',
    verdict: 'tiếp tục',
    judge: 'còn chờ kết quả của Lâm và anh duyệt lời mời của Mai.',
  },
  delegated: [
    {
      from: 'aris',
      to: 'lam',
      title: 'Nghiên cứu 3 đối thủ',
      pct: 60,
      time: '4 phút',
      helpers: [
        { text: 'Trợ lý ẩn · đọc nguồn 1–10', done: true },
        { text: 'Trợ lý ẩn · đọc nguồn 11–20', done: false },
      ],
    },
    { from: 'aris', to: 'mai', title: 'Gửi lời mời họp thứ 5', pct: 0, time: '', waiting: true, helpers: [] },
  ] as {
    from: string
    to: string
    title: string
    pct: number
    time: string
    waiting?: boolean
    helpers: { text: string; done: boolean }[]
  }[],
  loops: [
    { bot: 'dev', title: 'Kiểm tra bản deploy mỗi 5 phút', note: '3 lần', next: '02:14', action: 'stop' },
    {
      bot: 'tin',
      title: 'Theo dõi tỉ giá, tự giãn nhịp',
      note: 'không đổi 4 lần ⇒ giãn lên 8 phút',
      next: '',
      action: 'stop',
    },
    {
      bot: 'aris',
      title: 'Nhịp tim: “có tin quan trọng trong email thì báo”',
      note: 'mỗi 30 phút khi rảnh',
      next: '',
      action: 'pause',
    },
  ] as { bot: string; title: string; note: string; next: string; action: 'stop' | 'pause' }[],
  checkpoints: [
    { at: '10:02', text: 'Trước khi Dev sửa 3 file trong', path: 'landing-page/', diff: true },
    { at: 'hôm qua', text: 'Trước khi Hạ viết lại 2 bài nháp', path: '', diff: false },
  ],
}
