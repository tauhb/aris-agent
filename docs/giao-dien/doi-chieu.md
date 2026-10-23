# Đối chiếu canvas ↔ app thật (G6)

> 23/10/2026 · canvas bản mới nhất trên claude.ai (trùng bản sao trong [`design/canvas/`](../../design/canvas/)) · app `pnpm aris` với dữ liệu mẫu `DEMO_*`. Cổng nghiệm thu của giai đoạn G: mọi màn **đạt**, hoặc lệch có lý do ghi rõ.

## Cách chạy lại

1. Chạy app: `pnpm aris`, chép URL có token mà dsh in ra.
2. Lấy runtime của canvas một lần: tải `artifact-type/dc-runtime.js` của artifact canvas trên claude.ai về `design/canvas/.runtime/support.js` (thư mục này không vào git).
3. Chụp: `ARIS_APP_URL='<URL có token>' node scripts/ui/doi-chieu.mjs` (thêm `--only 4.1,5.3` hoặc `--theme dark` để chụp một phần).
4. Mở `out/doi-chieu/index.html`: mỗi màn một hàng, canvas bên trái, app bên phải, sáng và tối; `cap-<màn>-<theme>.png` là ảnh ghép từng cặp.

Script không cần gói nào ngoài Node 22 và Google Chrome: điều khiển Chrome qua giao thức DevTools ([`scripts/ui/cdp.mjs`](../../scripts/ui/cdp.mjs)). Danh sách màn và cách mở từng màn trong app: [`scripts/ui/screens.mjs`](../../scripts/ui/screens.mjs) (có kiểm thử: đủ 36 màn, trỏ đúng bảng canvas và trang có thật).

Lưu ý khi đọc ảnh: Chrome của script là hồ sơ mới, nên với màn chat script mở phiên gần nhất của dự án đầu tiên và mở cột phải, như khi anh dùng thật. Máy thử chỉ có phiên thuộc dự án, nên 1.1 hiện biến thể dự án (1.4).

Phông: từ 23/10 app dùng phông hệ thống như DeepSeek (anh chọn), còn canvas vẫn vẽ bằng Lexend / Be Vietnam Pro. Chữ khác nét giữa hai bên là chủ ý, không tính là lệch.

## Kết quả

Đạt ✅ · đạt, còn lệch nhỏ có lý do ◐ · lệch, có kế hoạch ✗ · chưa có trong app ○

| Màn | Kết quả | Còn lệch | Vì sao / khi nào |
|---|---|---|---|
| 1.1 Chat | ◐ | Hội thoại chưa có dòng việc, thẻ duyệt, ghim trí nhớ; có thêm tab "Chat / Diễn biến" và dòng số liệu dưới ô nhập của dsh | Dòng việc và thẻ duyệt cần một lượt model giao việc thật (GĐ2/GĐ3); tab Diễn biến giữ theo quyết định ở mục 4 của [bản đồ](ban-do.md) |
| 1.2 Khung chat | ◐ | Canvas vẽ 4 trạng thái của ô nhập; app chỉ chụp được trạng thái nghỉ. Menu "/" và "@" là menu của dsh | "@" liệt kê bot ở GĐ2; nút ghi âm chờ dsh bật nhập giọng nói |
| 1.3 Bản đồ đội 3D | ✅ | — | — |
| 1.4 Dự án | ◐ | Ô nhập chưa có "Gửi tới Cả dự án" và nút Dừng; chưa có tin nhiều bot theo vòng, thẻ "cần anh quyết"; hàng dự án đang mở chưa sáng trên thanh bên; cột phải còn dải tab của dsh phía trên | Cần Team của dsh (GĐ2) |
| 1.5 Tạo dự án | ✅ | Chữ "Phòng" của canvas thành "Dự án" | Quyết định 11 |
| 1.6 Tìm trong mọi phiên | ✅ | — | — |
| 2.1 Tạo bot | ◐ | Hộp thoại cao hơn canvas, phải cuộn mới thấy nút cuối | Sửa khi làm hộp thoại thật (GĐ2) |
| 2.1b Bot ngoài | ✅ | — | — |
| 2.2 Hồ sơ bot | ✅ | — | — |
| 2.3 Hồ sơ chủ nhân | ✅ | — | — |
| 2.4 Nhân bản / xuất | ✅ | — | — |
| 2.5 Commander | ◐ | App đặt trong trang Cài đặt (có cột điều hướng); màn canvas vẽ trang riêng | Các màn 6.x của canvas liệt kê Commander trong điều hướng Cài đặt; giữ một chỗ |
| 3.1 Ký ức | ✅ | — | — |
| 3.2 Thư viện skill | ✅ | — | — |
| 3.3 Chi tiết skill | ✅ | — | — |
| 3.4 Hộp duyệt | ✅ | — | — |
| 3.5 Việc đang chạy | ✅ | — | — |
| 4.1 Routine | ✅ | — | — |
| 4.2 Tạo routine | ✅ | — | — |
| 4.3 Kanban | ✅ | Tiêu đề là bộ chọn bảng theo dự án | Quyết định 11 |
| 5.1 Ghi chú | ✅ | — | — |
| 5.2 Hộp thư vào | ✅ | — | — |
| 5.3 Đồ thị | ✅ | Nút đang chọn ban đầu khác (đồ thị sinh từ hạt giống) | — |
| 5.4 Hỏi bộ não | ◐ | Nút gửi là chữ "Gửi", canvas là nút tròn mũi tên | Nhỏ, sửa cùng ô hỏi thật (GĐ5) |
| 6.1 Bảng điều khiển | ✅ | — | — |
| 6.2 Provider & model | ◐ | Chạy bằng dữ liệu thật nên danh sách provider, model và mức trễ khác số mẫu; một khoá mỗi provider; cột Giá ghi "để sau"; thứ tự dự phòng chỉ hiển thị | Xoay vòng khoá, giá và chuyển provider khi lỗi làm ở phần sau của GĐ1 ([đặc tả](../specs/aris-providers.md)) |
| 6.3 Kênh & ghép đôi | ✅ | — | — |
| 6.3b Mặt tích hợp | ✅ | — | — |
| 6.4 Ngân sách, duyệt, mạng | ✅ | — | — |
| 6.5 Thống kê & nhật ký | ✅ | — | — |
| 6.6 Màn hình của bot | ◐ | App có cột điều hướng Cài đặt; canvas vẽ trang riêng có nút quay lại | Như 2.5 |
| 6.7 Plugin | ✅ | — | Đã đổi từ T sang R ở G6: trang Plugin của dsh lệch nhiều; "Mở chợ" dẫn sang trang dsh |
| 7.1 Telegram · thẻ duyệt | ○ | — | Tin nhắn của gateway Telegram (GĐ1/GĐ3) |
| 7.2 Telegram · báo cáo routine | ○ | — | GĐ4 |
| 7.3 Telegram · đề xuất | ○ | — | GĐ3 |
| 7.4 Chat trên điện thoại | ✗ | Dưới 768px app giữ dải biểu tượng của thanh bên; canvas có thanh trên với nút menu và thanh tab ở đáy | Bố cục hẹp ở GĐ8 |

## Đã sửa trong G6

- Chân thanh bên cao hơn canvas (thêm dòng "Plugin" và "Thêm") nên mục Dự án bị cuộn khuất: bỏ dòng Plugin (Plugin nằm trong Cài đặt 6.7), thu menu "Thêm" của dsh thành nút nhỏ cạnh bánh răng.
- Hộp "Tìm trong mọi phiên" nằm thấp hơn canvas: quy tắc vị trí bị quy tắc chung của lớp phủ đè.
- Trang con không làm sáng mục cha (Tạo routine → Routine); bot đang xem (hồ sơ, ký ức, hồ sơ chủ nhân) chưa sáng trên Đội hình như canvas.
- 5.1: ô "Hộp thư vào" có nền nhấn, liên kết ngược thành ô có viền, nút "Nối" là nút chính. 5.2: biểu tượng nguồn nét như canvas thay cho emoji.
- 6.7 Plugin: trang riêng theo canvas.
