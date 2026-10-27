# Đặc tả `aris-autonomy` — tự trị: `/goal` có giám khảo, `/loop`, `/heartbeat`, Việc đang chạy (giai đoạn 3, đợt 5)

> Viết lại bằng lời của aris từ [tinh-nang-aris.md](../tinh-nang-aris.md) mục D1–D3 và màn 3.5. Dựa trên các gói dsh: `dsh-goal` (trạng thái mục tiêu), `dsh-goal-round-driver` (tự chạy tiếp lượt), `dsh-schedule` (lịch nhắc bền), `dsh-commands` (lệnh "/").

## `/goal` có giám khảo

dsh đã có `/goal`: lưu mục tiêu của phiên, tự gửi lượt tiếp khi bot rảnh, dừng khi bot tự đánh dấu xong hay hết số lượt. dsh **không có giám khảo độc lập** (bot tự quyết đã xong chưa). aris thêm:

- **Trần số lượt** mặc định 20 (dsh mặc định 256), đặt ở lớp cấu hình của aris.
- **Giám khảo**: cuối mỗi lượt của phiên đang có mục tiêu `active`, một lần gọi model rẻ đọc mục tiêu, câu trả lời cuối của lượt và các công cụ đã gọi, trả JSON `{"verdict": "done" | "continue" | "blocked", "reason", "missing"}`.
  - `done` mà mục tiêu vẫn `active`: aris đánh dấu xong (`goals.complete`), dừng tự chạy.
  - `blocked` (cần người dùng quyết, thiếu quyền, thiếu dữ liệu): aris chặn mục tiêu (`goals.block`, mã `judge-blocked`, lời giải thích của giám khảo).
  - `continue`: để dsh chạy lượt tiếp; aris chèn một lời báo "Giám khảo: còn thiếu …" vào lượt kế để bot tập trung. Ba lượt liền giám khảo nêu cùng một điều còn thiếu (gần trùng) thì chặn mục tiêu với mã `no-progress`.
  - Bot tự đánh dấu xong: giám khảo vẫn chấm, kết quả chỉ để hiện (không mở lại mục tiêu).
- Lần chấm gần nhất của mỗi mục tiêu lưu ở bảng `goals` của kho `aris_autonomy` (mục tiêu, pha, số lượt, lời giám khảo, lúc), để màn 3.5 đọc được cả khi phiên đã nguội. Tiền giám khảo ghi sổ chi phí phạm vi `goal`.

### Đợt 6 · Hợp đồng hoàn thành và `/subgoal`

Mục tiêu mơ hồ thì chấm cũng mơ hồ. Theo cách Hermes làm (đọc tài liệu, viết lại):

- Khi `/goal` đặt mục tiêu mới, aris nhờ model rẻ soạn **hợp đồng hoàn thành** từ câu mục tiêu: *xong khi* (kết quả cụ thể), *chứng minh bằng* (lệnh, tệp, số liệu cho thấy đã xong), *không được làm hỏng*, *phạm vi*, *dừng khi* (điều kiện bỏ cuộc hay cần hỏi người dùng). Soạn không được thì mục tiêu chạy như cũ, không chặn.
- Bước đầu của lượt kế nhận lời báo kèm hợp đồng (chờ soạn tối đa 15 giây), để bot nhắm vào phần chứng minh.
- `/subgoal <tiêu chí>` thêm một tiêu chí vào mục tiêu đang chạy; `/subgoal` không kèm chữ thì hiện hợp đồng và các tiêu chí. Lượt kế nhận lời báo tiêu chí mới.
- Giám khảo thấy hợp đồng và mọi tiêu chí; chỉ chấm "xong" khi có bằng chứng đúng phần *chứng minh bằng* và mọi tiêu chí đều đạt.
- Màn 3.5 hiện hợp đồng (gọn, mở rộng được) và các tiêu chí dưới mục tiêu.

### Phán quyết "chờ" (GĐ8.2)

- Giám khảo trả thêm `wait` kèm `waiting_for` (đang đợi gì, bắt buộc, thiếu thì coi là `continue`) và `wait_seconds` (60–3600, kẹp về mép). Chỉ chọn khi mọi việc bot tự làm được đã xong và bước kế phụ thuộc một tiến trình hay sự kiện bên ngoài (CI, deploy, thư trả lời).
- Khi chờ: ghi phán quyết, đặt lịch nhắc bền của dsh (dấu `[aris-goal-wait:<mã mục tiêu>]`, lúc `bây giờ + wait_seconds`), rồi tạm dừng mục tiêu. Bản ghi mục tiêu có `waiting {for, until, scheduleId}` và `waits {count, seconds}`.
- Lịch tới: lượt nhắc bỏ lịch, cho mục tiêu chạy tiếp (`resume`) và bot kiểm lại điều đang đợi; giám khảo chấm lượt đó như thường. Mục tiêu đã khác (xong, huỷ, đổi) thì chỉ xoá lịch.
- Giới hạn trong `rules.ts`: `MAX_WAITS = 8` lần liên tiếp, `MAX_WAIT_TOTAL_SECONDS = 7200`; vượt thì chặn với lý do "Chờ quá lâu: …". Lượt không phải chờ thì đếm lại. Lượt chờ không tính vào `isStuck`.
- Người dùng nhắn vào phiên lúc đang chờ thì huỷ lịch và chạy tiếp ngay; lượt của `/loop` hay nhịp tim không làm gì. Tạm dừng hay xoá tay cũng huỷ lịch. Khởi động lại giữa chừng: lịch bền còn nguyên.
- API `POST /api/aris/autonomy`: `goal-check-now` (bỏ lịch, chạy tiếp ngay và nhắc bot kiểm lại), `goal-pause` ("Thôi chờ").
- Màn 3.5: pill "Đang chờ", dòng "Chờ: … · kiểm lại lúc HH:MM (còn N phút)", đếm lần chờ, nút Kiểm ngay / Thôi chờ. Văn phòng: dòng terminal "⏳ Chờ …" ở bàn, dòng "Đang chờ" trong nhật ký, dòng tiến độ trong bảng chat.

## `/loop` và `/heartbeat`

Hai lệnh "/" của aris, chạy trên lịch nhắc bền của dsh (giao vào đúng phiên, mở lại phiên nguội, lỡ nhiều nhịp thì chỉ giao một lần, tin đến khi bot đang làm thì chờ tới lúc rảnh):

| Lệnh | Làm gì |
|---|---|
| `/loop 5m <việc>` | Lặp `<việc>` mỗi 5 phút (`30s` không được: tối thiểu 1 phút; nhận `m`, `h`) |
| `/loop <việc>` | Tự điều nhịp: bắt đầu 1 phút; câu trả lời không đổi thì giãn gấp đôi tới 15 phút; đổi thì về 1 phút |
| `/loop` | Liệt kê vòng lặp của phiên |
| `/loop dừng` | Dừng mọi vòng lặp của phiên |
| `/heartbeat [30m] [điều cần để ý]` | Nhịp tim: định kỳ (mặc định 30 phút) hỏi bot "có gì cần báo không"; không có gì thì bot trả đúng một chữ "ổn" |
| `/heartbeat tắt` | Tắt nhịp tim của phiên |

Mỗi vòng lặp / nhịp tim là một lịch nhắc `every_seconds` của dsh, lời nhắc mang dấu `[aris-loop:<mã>]` để aris nhận ra lượt của nó. Trạng thái tự điều nhịp (khoảng hiện tại, số lần không đổi, câu trả lời trước) lưu ở bảng `loops`; khi đổi nhịp, aris sửa lịch bằng `schedule.update`.

## Màn 3.5 · Việc đang chạy

`GET /api/aris/autonomy`: mục tiêu (bảng `goals`), vòng lặp và nhịp tim (bảng `loops` cùng lần chạy kế từ lịch của dsh). Màn 3.5 ghép thêm việc được giao từ `/api/aris/commander` (nhật ký giao việc có kết quả, yêu cầu quyền đang chờ).

- **Mục tiêu**: mục tiêu, bot, lượt n/trần, lời giám khảo gần nhất, nút Tạm dừng / Chạy tiếp / Huỷ (aris mở lại agent của phiên khi cần), mở phiên.
- **Việc được giao**: việc giao trong 24 giờ, ai làm, đang làm / xong / vấp / bị dừng, việc đang chờ duyệt dẫn tới Hộp duyệt. `/api/aris/commander` thêm cờ `live` (lượt của bot nhận việc chưa kết thúc); việc không có kết quả mà không còn chờ hiện "không rõ kết quả".
- **Vòng lặp và nhịp tim**: lời nhắc, nhịp, số lần chạy, lần kế, nút Dừng.
- **Điểm khôi phục**: để mờ (chưa có trong kế hoạch giai đoạn này).
- **Dừng tất cả**: tạm dừng mọi mục tiêu đang chạy và dừng mọi vòng lặp, nhịp tim (không đụng việc đã giao cho bot).

`POST /api/aris/autonomy`: `op` = `goal-pause`, `goal-resume`, `goal-clear` (`session`), `loop-stop` (`id`), `stop-all`.
