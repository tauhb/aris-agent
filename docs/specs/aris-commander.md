# Đặc tả Commander giao việc (giai đoạn 2, bước 2)

> Dựng trên [aris-bots.md](aris-bots.md) (bot là dữ liệu của aris gắn vào phiên) và Agent Teams của dsh.

## Công cụ `giao_viec` (chỉ Commander)

- Tham số `viec`: tối đa 4 mục, mỗi mục `bot` (tên gọi), `noi_dung` (đủ ngữ cảnh để bot tự làm), `ly_do` (vì sao chọn bot này), `tieu_de` (tuỳ chọn, tên thẻ trên bảng việc).
- Mỗi bot là **một thành viên trong Team của phiên Commander** (`agentTeams`), tên thành viên = tên gọi của bot, nên `@aris/bots` gắn phiên con với bot (tính cách, ký ức, model riêng).
  - Bot chưa có trong đội: tạo thành viên mới (`spawnTeammate`, `fresh`).
  - Bot đã có: nhắn tiếp (`sendMessage`), bot nhớ việc trước trong cùng cuộc.
- Mỗi việc thành một **thẻ trên bảng việc** của Team, gán cho bot (Kanban). Tham số `the` (tuỳ chọn) giao một thẻ có sẵn thay vì tạo thẻ mới: `task-n` (thẻ đã chia, phải sẵn sàng: thẻ nó chờ đã xong) hoặc `c-n` (thẻ người dùng tạo trên Kanban; giao xong thì thẻ của đội thay chỗ). Thẻ sai hoặc đang chờ thì báo trước, không nhắn bot.
- Công cụ trả ngay; Commander đợi bằng `wait_agent` rồi tổng hợp. Câu trả lời của công cụ có mã phiên của từng bot (giao diện vẽ nhánh).
- Giới hạn: tối đa 4 bot mỗi lần, 6 bot chạy cùng lúc; mỗi bot một việc mỗi lần; không giao cho Commander.

## Công cụ `tao_the` (chỉ Commander, bước 3c)

Chia một việc lớn thành tối đa 12 thẻ trên bảng việc của Team, chưa giao ai. Mỗi thẻ có tiêu đề, nội dung, và `sau`: các thẻ phải xong trước (mã `task-n` có sẵn hoặc tiêu đề một thẻ ghi trước trong cùng lần). Sau đó Commander giao từng thẻ sẵn sàng bằng `giao_viec` với `the`.

## Việc lớn của phòng ban: `giao_phong` (chỉ Commander, bước 3d)

- Tham số: `phong` (tên phòng, có hay không chữ "Phòng" đều được), `tieu_de`, `noi_dung` (đủ ngữ cảnh để trưởng nhóm tự chia). Phòng phải có trưởng nhóm.
- aris mở **một phiên mới cho trưởng nhóm** trong cùng workspace với phiên giao (dự án thì nằm trong dự án), đánh dấu là phiên giao việc, rồi gửi bản giao việc. Bản ghi việc lớn ở kho `aris_commander`, bảng `jobs`: phòng, trưởng nhóm, tiêu đề, việc, phiên giao, phiên trưởng nhóm, trạng thái (`running`, `done`, `failed`), báo cáo.
- Trưởng nhóm có ngữ cảnh riêng (`jobContext`): chia việc bằng `tao_the`, giao bằng `giao_viec` **chỉ cho thành viên phòng mình** (giao người ngoài phòng bị từ chối, nêu rõ lý do), tự làm phần nhỏ, cuối cùng trả một báo cáo gọn. Trưởng nhóm được lập đội (`spawn_teammate`) trong phiên việc lớn; Team của phiên đó là bảng việc riêng của phòng.
- Giới hạn: tối đa 3 việc lớn đang chạy cùng lúc.
- **Chốt việc lớn**: đọc thẳng log phiên trưởng nhóm (không đánh thức phiên). Xong khi trưởng nhóm đã xong ít nhất một lượt, có câu trả lời, và phiên trưởng nhóm cùng mọi phiên thành viên của đội đó đều rảnh; câu trả lời cuối của trưởng nhóm là báo cáo. Lượt lỗi thì việc lớn thành `failed`. Xét lại khi trưởng nhóm xong lượt, khi xem danh sách việc lớn, và 5 giây sau khi aris khởi động, nên aris chạy lại giữa chừng vẫn chốt được.
- Chốt xong, báo cáo được gửi vào phiên giao (xếp hàng), Commander đọc và trả lời người dùng.
- `GET /api/aris/commander?jobs=1`: 30 việc lớn gần nhất kèm tiến độ (thẻ xong / tổng thẻ trên bảng việc của trưởng nhóm). Dịch vụ `arisJobs` (`list`, `forWorkspace`, `progressOf`) cho Kanban của dự án.

## Thẻ tự đánh dấu xong

Khi một thành viên đội kết thúc lượt bình thường (`turn/end` hoàn tất), aris dùng chính agent của thành viên (chủ thẻ, có quyền) đánh dấu xong **thẻ đang làm cũ nhất** nó giữ. Lượt lỗi thì thẻ giữ nguyên. Giả định: mỗi lần giao là một lượt của bot; bot giữ nhiều thẻ thì lần lượt từng thẻ theo thứ tự giao.

## Nhật ký định tuyến

- Bản ghi `plugin:aris/dispatch` trong log phiên Commander: bot, tiêu đề, việc, lý do, phiên của bot, thẻ.
- Kho `aris_commander` (bảng `dispatch`) cho trang 2.5: `GET /api/aris/commander` trả 50 lần giao gần nhất.

## Luật đội

- Chỉ phiên của Commander (phiên chưa gắn bot) dùng được `giao_viec`.
- Bot thường không tự lập đội: `spawn_teammate` bị chặn ở phiên của bot thường (móc `tools/pre-execute`). Bot vẫn nhắn đồng đội được (`send_message`). Trưởng nhóm phòng ban lập Team riêng trong phiên việc lớn (bước 3d).
- Hướng dẫn giao việc (khi nào tự làm, khi nào giao, giao song song hay nối tiếp) là ngữ cảnh động `aris:commander`, chỉ nạp ở phiên của Commander.

## Model của bot

Phiên của bot được giao việc (gắn qua đội) chạy bằng model riêng của bot, nếu có (`@aris/providers` đổi cấu hình gọi ở `agent/request`, trước thứ tự dự phòng). Phiên anh chat thẳng với bot đã chọn model lúc mở nên không bị đè.

## Trạng thái trực tiếp (`@aris/bots`)

Suy từ sự kiện phiên của bot: đang chạy là "đang làm", đang đợi duyệt hoặc câu hỏi là "chờ anh", lượt vừa xong là "xong" hoặc "lỗi" (hiện 30 phút), còn lại "rảnh". Việc gần đây: 30 mục gần nhất (nhận việc, xong, lỗi, chờ anh). Chỉ giữ trong bộ nhớ. `GET /api/aris/bots?live=1`.

## Giao diện

- Trang Phòng ban: thẻ "Việc lớn phòng đang nhận" (tiêu đề, dự án, tiến độ, trạng thái, nút Mở phiên trưởng nhóm).
- Kanban của dự án: việc lớn là một thẻ có nhãn "Phòng X", thanh tiến độ, nằm ở cột Đang làm hoặc Chờ theo trạng thái phiên trưởng nhóm, xong thì sang Xong.
- Thanh bên: trạng thái và việc đang làm của từng bot.
- Sơ đồ 3D, Bản đồ đội: trạng thái thật.
- Cột phải: việc gần đây thật.
- Khung chat: mỗi lần `giao_viec` vẽ các nhánh theo bot (đã nhận → đang làm → xong), bấm để mở phiên của bot.
- Trang Commander (2.5): bot nhận việc, giới hạn, quyết định định tuyến gần đây từ nhật ký.

## Để sau

- `chuyen_giao` (bot nhận việc trả lời thẳng chủ nhân): bước 5, cùng kênh riêng của bot.
- Duyệt ngay trên nhánh: giai đoạn 3 (Hộp duyệt).
- Trần ngân sách mỗi việc: giai đoạn 7.
