# GĐ9.7a · Duyệt bền, chống lặp, nhắn chen khi chờ duyệt

Theo Điểm dừng 2 ([spikes/gd9-luong-bot.md](../spikes/gd9-luong-bot.md)): người dùng chọn cách **B** cho nhắn chen và đưa duyệt bền lên trước "đồng đội hỏi nhau". Ký ức theo người (phần còn lại của 9.7 trong plan bản 2) cần bảng `people` của 9.6 nên để sang đợt đó.

## Mục tiêu

1. **Duyệt bền**:
   - Mọi yêu cầu duyệt của phiên chính (chat với Aris hay với một bot) do aris giữ thay cho thẻ của dsh và lưu xuống đĩa.
   - aris khởi động lại hay lượt hết giờ chờ (15 phút) thì yêu cầu vẫn nằm trong Hộp duyệt và chuông.
   - Người dùng cho phép muộn thì aris ghi "được phép một lần" cho đúng thao tác đó (cùng phiên, cùng công cụ, cùng tham số) và nhắn vào phiên để bot làm tiếp. Bot gọi lại đúng thao tác thì chạy luôn, không hỏi lại; lần sau nữa lại hỏi.
2. **Nhắn chen kiểu B**: thẻ duyệt không còn che ô nhập. Người dùng gõ tin khi một yêu cầu đang chờ thì yêu cầu đó bị từ chối và tin vừa gõ thành chỉ dẫn mới cho bot.
3. **Chống lặp thao tác ra ngoài** (`channel_send`, `channel_notify_owner`, công cụ MCP có ghi):
   - cùng bot, cùng công cụ, cùng tham số đã chạy xong trong 10 phút thì bị chặn;
   - lời chặn nói đã làm lúc nào, để bot không gửi trùng cho khách khi thử lại.
4. **Một công tắc** ở trang Commander: "Duyệt bền (GĐ9)", mặc định bật. Tắt thì mọi thứ như trước (thẻ duyệt của dsh, không lưu, không chống lặp).

## Cách làm (không sửa dsh)

- `approval/request` của dsh là chuỗi hook: aris thêm một hook **chạy sau cùng**. Hook này không gọi `next()` (thẻ của dsh) mà chờ ở hộp duyệt chung `ApprovalHub` với lần chạy `session:<mã phiên>`. Web (thanh duyệt `ApprovalDock`, chuông, Hộp duyệt) và Telegram đã đọc hộp này.
- Tham số lời gọi lấy từ sự kiện `tool/call` của phiên (bản đồ `calls` nay ghi cho mọi phiên, không chỉ phiên con), băm thành `argsHash`.
- Bảng `approvals` mới trong kho `aris_commander`:
  - bản ghi `{ id, session, bot, tool, hash, reason, at, status: pending | granted }`;
  - bản `granted` dùng một lần rồi xoá; bản quá 7 ngày thì bỏ.
- Hết giờ chờ (15 phút) hay lượt bị huỷ: trả "từ chối" cho lượt nhưng giữ bản ghi `pending`. Khởi động lại: nạp các bản `pending` vào hộp duyệt chung như yêu cầu "lượt đã dừng".
- Trả lời một yêu cầu không còn lượt chờ: cho phép thì bản ghi thành `granted` và aris nhắn vào phiên; từ chối thì xoá.
- Nhắn chen: sự kiện `agent/inbox/spliced` có tin của người dùng ở phiên đang có yêu cầu chờ thì trả lời "từ chối" cho các yêu cầu đó.
- Chống lặp: hook `tools/pre-execute` (chặn) và `tools/post-execute` (ghi) với bảng `effects` trong bộ nhớ có hạn 10 phút. Không lưu đĩa: khởi động lại thì lượt cũ đã chết, lượt mới gọi lại phải qua duyệt bền.

## Kiểm tra

- Test thuần: băm tham số ổn định (thứ tự khoá không đổi kết quả), vòng đời bản ghi (chờ → được phép → dùng một lần), chống lặp trong 10 phút và hết hạn.
- Thử thật trên bản chép dữ liệu (đã gỡ kênh):
  1. nhờ Aris sửa lời dặn → thẻ duyệt hiện ở thanh duyệt aris, ô nhập vẫn gõ được;
  2. gõ chen → yêu cầu bị từ chối, Aris đọc tin mới;
  3. tạo yêu cầu, khởi động lại aris → yêu cầu còn trong Hộp duyệt → cho phép → aris nhắn vào phiên → bot làm tiếp không hỏi lại.
