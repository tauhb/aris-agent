/**
 * Dữ liệu mẫu nhóm "Tự động" (canvas 4.1–4.3). Routine thật nằm ở lõi lịch của dsh
 * (`dsh-schedule`) và nối ở giai đoạn 4; Kanban nối ở giai đoạn 4.
 */

/** 4.1 · Danh sách routine. */
export const DEMO_ROUTINES = {
  count: 7,
  next: { bot: 'Tín', at: '17:00 hôm nay' },
  rows: [
    {
      bot: 'tin',
      name: 'Báo cáo chi tiêu tuần',
      note: 'skill bao-cao-chi-tieu',
      when: 'Thứ 2, 08:00',
      to: 'Telegram',
      last: ['done', 'xong', '20/10'],
      on: true,
    },
    {
      bot: 'mai',
      name: 'Tóm tắt email và lịch buổi sáng',
      note: 'chỉ email chưa đọc',
      when: 'Thứ 2–6, 07:30',
      to: 'Telegram',
      last: ['done', 'xong', 'hôm nay'],
      on: true,
    },
    {
      bot: 'lam',
      name: 'Tin đối thủ trong tuần',
      note: 'skill nghien-cuu-doi-thu',
      when: 'Thứ 6, 16:00',
      to: 'Lark · nhóm Marketing',
      last: ['failed', 'lỗi 2 lần', '17/10'],
      on: true,
    },
    {
      bot: 'tin',
      name: 'Kiểm tra số dư tài khoản quảng cáo',
      note: 'chỉ chạy script, không dùng AI',
      when: 'Mỗi ngày, 17:00',
      to: 'Telegram nếu dưới 2 triệu',
      last: ['done', 'xong', 'hôm qua'],
      on: true,
    },
    {
      bot: 'aris',
      name: 'Ôn lại ghi chú cũ liên quan hôm nay',
      note: 'Second Brain',
      when: 'Mỗi ngày, 07:00',
      to: 'Telegram',
      last: ['done', 'xong', 'hôm nay'],
      on: true,
    },
    {
      bot: 'dev',
      name: 'Sao lưu repo dự án',
      note: 'đang tạm dừng',
      when: 'Chủ nhật, 23:00',
      to: 'Không gửi',
      last: null,
      on: false,
    },
  ] as {
    bot: string
    name: string
    note: string
    when: string
    to: string
    last: [string, string, string] | null
    on: boolean
  }[],
  alert: {
    title: '“Tin đối thủ trong tuần” lỗi 2 lần liên tiếp',
    text: 'trang nguồn chặn truy cập tự động. Lâm đề xuất đổi sang nguồn RSS.',
    bot: 'Lâm',
  },
}

/** 4.2 · aris hiểu câu mô tả routine. */
export const DEMO_ROUTINE_DRAFT = {
  text: '8 giờ sáng các ngày trong tuần, Mai tóm tắt email chưa đọc và lịch hôm nay, gửi Telegram cho anh',
  bot: 'mai',
  schedule: 'Thứ 2 – Thứ 6, 08:00 · giờ Việt Nam',
  cron: '0 8 * * 1-5 · Asia/Ho_Chi_Minh',
  nextRuns: 'Thứ 6 24/10 · Thứ 2 27/10 · Thứ 3 28/10',
  task: 'Tóm tắt email chưa đọc (nhóm theo mức gấp) + lịch hôm nay',
  to: 'Telegram · chat riêng với Mai',
  perms: 'Chỉ đọc email và lịch · hành động khác phải hỏi anh',
  catchUp: 'Chạy bù khi bật lại nếu trễ dưới 3 giờ',
}

/** 4.3 · Bảng Kanban. */
export const DEMO_KANBAN = {
  board: 'Kênh YouTube quý 4',
  meta: '9 thẻ · bảng việc của dự án “Kênh YouTube Q4”',
  columns: [
    {
      id: 'triage',
      cards: [
        {
          title: 'Kế hoạch livestream ra mắt khoá học',
          bot: 'aris',
          foot: 'Commander sẽ chia trong lượt tới',
        },
      ],
    },
    {
      id: 'ready',
      cards: [
        { title: 'Thiết kế thumbnail mẫu', bot: 'dev', foot: 'Dev' },
        { title: 'Lịch đăng 8 tuần', bot: 'mai', foot: 'Mai · chờ 1 thẻ:', blockedBy: 'Kịch bản 8 video' },
      ],
    },
    {
      id: 'doing',
      cards: [
        {
          title: 'Kịch bản 8 video hướng dẫn',
          bot: 'lam',
          foot: 'Lâm · chế độ mục tiêu · lượt 3/15',
          progress: 35,
        },
        { title: 'Bảng ngân sách quý 4', bot: 'tin', foot: 'Tín · 12 phút' },
      ],
    },
    {
      id: 'review',
      cards: [
        {
          title: 'Chốt 3 mục tiêu quý 4',
          bot: 'aris',
          foot: 'Aris · cần anh chọn hướng ưu tiên',
          warn: true,
        },
      ],
    },
    {
      id: 'done',
      cards: [
        { title: 'Báo cáo kênh 90 ngày', bot: 'lam', foot: 'Lâm · 21/10' },
        { title: 'Danh sách 20 chủ đề', bot: 'ha', foot: 'Hạ · 22/10' },
        { title: 'Khảo sát giá đối thủ', bot: 'lam', foot: 'Lâm · 22/10' },
      ],
    },
  ] as {
    id: string
    cards: {
      title: string
      bot: string
      foot: string
      blockedBy?: string
      progress?: number
      warn?: boolean
    }[]
  }[],
}
