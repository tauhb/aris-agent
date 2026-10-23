# Đặc tả Commander giao việc (giai đoạn 2, bước 2)

> Dựng trên [aris-bots.md](aris-bots.md) (bot là dữ liệu của aris gắn vào phiên) và Agent Teams của dsh.

## Công cụ `giao_viec` (chỉ Commander)

- Tham số `viec`: tối đa 4 mục, mỗi mục `bot` (tên gọi), `noi_dung` (đủ ngữ cảnh để bot tự làm), `ly_do` (vì sao chọn bot này), `tieu_de` (tuỳ chọn, tên thẻ trên bảng việc).
- Mỗi bot là **một thành viên trong Team của phiên Commander** (`agentTeams`), tên thành viên = tên gọi của bot, nên `@aris/bots` gắn phiên con với bot (tính cách, ký ức, model riêng).
  - Bot chưa có trong đội: tạo thành viên mới (`spawnTeammate`, `fresh`).
  - Bot đã có: nhắn tiếp (`sendMessage`), bot nhớ việc trước trong cùng cuộc.
- Mỗi việc thành một **thẻ trên bảng việc** của Team, gán cho bot (nền cho Kanban ở bước 3).
- Công cụ trả ngay; Commander đợi bằng `wait_agent` rồi tổng hợp. Câu trả lời của công cụ có mã phiên của từng bot (giao diện vẽ nhánh).
- Giới hạn: tối đa 4 bot mỗi lần, 6 bot chạy cùng lúc; mỗi bot một việc mỗi lần; không giao cho Commander.

## Nhật ký định tuyến

- Bản ghi `plugin:aris/dispatch` trong log phiên Commander: bot, tiêu đề, việc, lý do, phiên của bot, thẻ.
- Kho `aris_commander` (bảng `dispatch`) cho trang 2.5: `GET /api/aris/commander` trả 50 lần giao gần nhất.

## Luật đội

- Chỉ phiên của Commander (phiên chưa gắn bot) dùng được `giao_viec`.
- Bot thường không tự lập đội: `spawn_teammate` bị chặn ở phiên của bot thường (móc `tools/pre-execute`). Bot vẫn nhắn đồng đội được (`send_message`). Trưởng nhóm phòng ban lập Team riêng ở bước 3.
- Hướng dẫn giao việc (khi nào tự làm, khi nào giao, giao song song hay nối tiếp) là ngữ cảnh động `aris:commander`, chỉ nạp ở phiên của Commander.

## Model của bot

Phiên của bot được giao việc (gắn qua đội) chạy bằng model riêng của bot, nếu có (`@aris/providers` đổi cấu hình gọi ở `agent/request`, trước thứ tự dự phòng). Phiên anh chat thẳng với bot đã chọn model lúc mở nên không bị đè.

## Trạng thái trực tiếp (`@aris/bots`)

Suy từ sự kiện phiên của bot: đang chạy là "đang làm", đang đợi duyệt hoặc câu hỏi là "chờ anh", lượt vừa xong là "xong" hoặc "lỗi" (hiện 30 phút), còn lại "rảnh". Việc gần đây: 30 mục gần nhất (nhận việc, xong, lỗi, chờ anh). Chỉ giữ trong bộ nhớ. `GET /api/aris/bots?live=1`.

## Giao diện

- Thanh bên: trạng thái và việc đang làm của từng bot.
- Sơ đồ 3D, Bản đồ đội: trạng thái thật.
- Cột phải: việc gần đây thật.
- Khung chat: mỗi lần `giao_viec` vẽ các nhánh theo bot (đã nhận → đang làm → xong), bấm để mở phiên của bot.
- Trang Commander (2.5): bot nhận việc, giới hạn, quyết định định tuyến gần đây từ nhật ký.

## Để sau

- `chuyen_giao` (bot nhận việc trả lời thẳng chủ nhân): bước 5, cùng kênh riêng của bot.
- Duyệt ngay trên nhánh: giai đoạn 3 (Hộp duyệt).
- Trần ngân sách mỗi việc: giai đoạn 7.
