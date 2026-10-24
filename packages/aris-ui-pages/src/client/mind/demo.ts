/**
 * Dữ liệu mẫu nhóm "Trí nhớ và tự tiến hoá" (canvas 3.1–3.5). Nội dung là dữ liệu
 * nên để nguyên tiếng Việt như canvas; mỗi khối ghi giai đoạn nối dữ liệu thật.
 */

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
