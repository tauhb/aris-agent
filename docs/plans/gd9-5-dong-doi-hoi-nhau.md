# GĐ9.5 · Đồng đội hỏi nhau (chế độ hỏi ý)

Lát cắt đầu của mô hình đồng đội ngang hàng (plan bản 2, [gd9-doi-dong-doi.md](gd9-doi-dong-doi.md) mục 4, "9.1a"). Làm sau duyệt bền (9.7a) theo Điểm dừng 2.

## Mục tiêu

Bot nào cũng hỏi ý được một đồng đội bằng công cụ `ask_teammate`, rồi dùng câu trả lời để làm tiếp. Ví dụ: Hằng (chăm sóc khách) hỏi Ngân (tài chính) về chính sách đổi trả.

- **Chỉ chế độ hỏi ý** (`consult`): đồng đội chỉ trả lời, không làm việc ra ngoài. Việc nào cần duyệt trong phiên được hỏi thì bị từ chối kèm lời giải thích.
- **Chỉ trong lượt do chủ bắt đầu**: chat trên web, hoặc tin của chủ đã ghép đôi trên Telegram, Zalo, Lark. Lượt của khách hay người lạ thì không được hỏi đồng đội, vì chưa có ký ức theo người nên khách có thể kéo dữ liệu của chủ qua đồng đội.
- **Đồng đội trả lời ở phiên riêng** của chính đồng đội đó, do aris mở cho từng câu hỏi; không dùng bot phụ của dsh.
- **Giới hạn**:
  - độ sâu ≤ 2 (bot hỏi đồng đội, đồng đội đó hỏi thêm được một lần nữa);
  - ≤ 6 câu hỏi mỗi gốc (một lượt của chủ);
  - chờ tối đa 5 phút mỗi câu.
  - Trần 0,30 USD mỗi gốc cần số chi phí theo phiên của `@aris/stats`, làm ở đợt sau (xem "Chưa làm").
- **Kết quả tự quay về**:
  - bình thường câu trả lời là kết quả của công cụ, ngay trong lượt;
  - lượt của bot hỏi đã dừng (hết giờ, bị dừng) thì khi đồng đội trả lời xong, aris nhắn kết quả vào phiên của bot hỏi;
  - nhiều kết quả về cùng lúc thì gom thành một tin, để bot hỏi chỉ bị đánh thức một lần;
  - aris khởi động lại khi câu hỏi đang chạy thì báo bot hỏi là câu hỏi bị ngắt.
- **Danh bạ đồng đội trong lời dặn** có mô tả công khai của từng bot, ghi rõ là dữ liệu chứ không phải chỉ dẫn.
- **Giao diện**: lời gọi `ask_teammate` hiện thành dòng "Đã hỏi <viên tên bot>" kèm câu trả lời gấp gọn.
- **Công tắc** "Đồng đội hỏi nhau" ở trang Commander, mặc định bật.

## Cách làm

- `@aris/commander`:
  - bảng `tasks` (`id`, `root`, `parent`, `depth`, `from`, `fromSession`, `to`, `toSession`, `question`, `status`, `answer`, `startedAt`, `finishedAt`, `returnedAt`);
  - công cụ `ask_teammate`; hàm thuần ở `teammates.ts` (giới hạn, câu gửi đồng đội, gom kết quả);
  - hook duyệt từ chối mọi yêu cầu duyệt trong phiên được hỏi.
- `@aris/channels`: hàm `trustOf(sessionId)` của Telegram, Zalo, Lark, cung cấp qua `arisChannelTrust`.
- `@aris/bots` (`persona.ts`): danh bạ thêm mô tả công khai.
- `@aris/ui-chat`: giao diện cho lời gọi `ask_teammate` (`tool.call.toolview`).

## Chưa làm ở đợt này

- Trần tiền mỗi gốc.
- Chế độ làm việc (`work`), báo tin (`notify`), chuyển hẳn (`hand_off_to_teammate`): 9.8.
- Mở cho lượt của nhân sự hay khách: sau khi có ký ức theo người (9.6).
