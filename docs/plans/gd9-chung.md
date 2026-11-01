# Giai đoạn 9 · Luật chung và lộ trình bản 3 (1/11/2026)

Opus viết plan, người dùng đổi phiên sang Sonnet. **Sonnet làm trực tiếp trong phiên chính, không dùng subagent** (không gọi công cụ Agent). Luật làm việc, đăng nhập web, an toàn và kiểm tra giữ nguyên như [gd8-chung.md](gd8-chung.md), trừ các điểm ghi dưới đây.

Đọc trước:

- [gd9-doi-dong-doi.md](gd9-doi-dong-doi.md): mô hình đồng đội ngang hàng (bản 2), mục 9 (Chief của Rakazo, chạy thật) và mục 10 (công ty nhiều nhân sự).
- [gd9-kiem-ke-va-ban-ve.md](gd9-kiem-ke-va-ban-ve.md): aris đang ở đâu, danh sách 25 màn.
- Bản vẽ đã duyệt: canvas [aris GĐ9 · Giao diện kiểu OpenMausBot](https://claude.ai/artifact/3FvLeEg2hVpfGEoFpX4PwP), bản sao ở `design/gd9/` (mở `design/gd9/gd9.css` để lấy màu, cỡ chữ, bo góc).

## Khác với GĐ8

- **Bản vẽ GĐ9 đã duyệt** (V1–V25). Làm đúng bản vẽ; chỗ nào bản vẽ chưa có thì vẽ thêm lên canvas GĐ9 (không phải canvas cũ `UQ8f…`) rồi hỏi người dùng.
- **Cảm quan đã chốt** (người dùng góp ý trực tiếp, không được làm khác):
  - khung chat và khung phải theo OpenMausBot: nền tối, chữ Inter, tên bot dạng viên ở giữa đầu chat, nút dạng viên, nút chính màu trắng;
  - thanh bên giữ dạng **danh sách**: linh vật màu, chấm trạng thái (xanh đang làm, cam cần {you}, đỏ lỗi), dòng việc gần nhất cùng màu; nhóm theo phòng ban; **không** xếp bot thành ô;
  - linh vật luôn giữ màu của nó; màu nhấn chỉ ở trạng thái, thẻ chờ duyệt (viền và nhãn cam nhẹ) và **viên tên bot** trong chat;
  - thẻ cần quyết định (duyệt, xin ý kiến) phải đủ chi tiết ngay trong chat; khung ngoài thì ít chữ;
  - chữ trên nút không xuống dòng, không tràn.
- **Mỗi đợt một công tắc** để tắt về giao diện và cách chạy cũ; chỉ gỡ đường cũ ở đợt cuối, có Điểm dừng.
- **Định danh mới trong mã bằng tiếng Anh**; chữ hiển thị tiếng Việt và tiếng Anh như cũ.
- Push: được push nhánh đang làm khi người dùng bảo (đã có repo `tauhb/aris-agent`).

## Lộ trình bản 3

Sửa so với bản 2: giao diện mới làm **trước** (người dùng thấy sản phẩm sớm), "Aris quản đội" và hai công tắc thành đợt nhỏ riêng, máy riêng của bot lên trước phần công ty. Đường ray an toàn của bản 2 giữ nguyên: chưa có duyệt bền và chống lặp thì chưa mở bot nhờ bot chế độ làm việc.

| Đợt | Plan | Nội dung | Bản vẽ |
|---|---|---|---|
| 9.1 | [gd9-1-khung-giao-dien.md](gd9-1-khung-giao-dien.md) | Khung giao diện mới trên dữ liệu hiện có: thanh bên danh sách nhóm theo phòng, chat một luồng mỗi bot (luồng tạm = phiên mở gần nhất), viên tên bot ở đầu chat, khung phải hồ sơ (Chi tiết / Thư viện / Máy) và Cài đặt bot, chuông Hoạt động, menu ảnh đại diện, nút Kết nối ứng dụng, tìm kiếm | V1, V5, V8, V9, V10, V11, V12, V14 |
| 9.2 | gd9-2-aris-quan-doi.md (viết sau 9.1) | Aris tạo và sửa bot bằng lời, thẻ duyệt đủ chi tiết, bản lời dặn và hoàn tác, lời chào lần đầu với thẻ câu hỏi dạng nút viên, viên tên bot trong tin nhắn | V2, V3, V4 |
| 9.3 | gd9-3-cong-tac-skill-ket-noi.md (viết sau 9.1) | Hai công tắc "Chỉ dùng skill được gán", "Chỉ dùng kết nối được gán"; kết nối gán thắng kết nối chung cùng dịch vụ | V20, V21 |
| 9.4 | spike | Đo như 9.0 của bản 2 (mở lại phiên nguội, chen lời khi chờ duyệt, chi phí theo độ dài ngữ cảnh, sang trang). **Điểm dừng** | không |
| 9.5 | | Đồng đội hỏi nhau (9.1a bản 2): `ask_teammate` chế độ hỏi ý, bảng `tasks`, kết quả gấp gọn | V6 |
| 9.6 | | Người, luồng, một cửa gửi tin (9.1b bản 2) | không đổi |
| 9.7 | | Duyệt bền, chống lặp, ký ức theo người (9.2 bản 2) | V9 |
| 9.8 | | Đồng đội đầy đủ, việc chạy nền, sang trang (9.3, 9.4 bản 2) | V7, V8 |
| 9.9 | | Máy riêng của bot (Docker trên Mac, máy chung theo phòng) | V12 |
| 9.10 | | Công ty nhiều nhân sự: tài khoản, phòng ban là không gian, skill và kết nối riêng, chia sẻ bot | V13, V17–V25 |
| 9.11 | | Gỡ đường cũ sau hai tuần chạy thật. **Điểm dừng** | |

Sau 9.11: lên server, app điện thoại (V15), nhóm bot (V16), giọng nói.

Plan chi tiết của đợt sau viết khi đợt trước xong, để bám đúng mã lúc đó.

## Kiểm tra thêm cho GĐ9

Ngoài phần "Kiểm tra" của `gd8-chung.md`:

1. Chụp màn hình web thật ở cả nền tối và nền sáng, đặt cạnh bản vẽ tương ứng, gửi cho người dùng.
2. Tắt công tắc của đợt thì aris chạy y như trước đợt (thử tay một lần).
3. Ghi nghiệm thu vào `docs/ke-hoach-trien-khai.md`, mục giai đoạn 9.
