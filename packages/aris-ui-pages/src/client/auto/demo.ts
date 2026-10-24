/**
 * Dữ liệu mẫu nhóm "Tự động": còn mỗi 4.2 (tạo routine bằng lời, giai đoạn 4 đợt 2). Màn 4.1 dùng
 * `@aris/routine`, Kanban 4.3 dùng `@aris/projects`.
 */

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
