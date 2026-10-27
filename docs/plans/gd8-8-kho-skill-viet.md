# Plan 8.8 · Kho skill dựng sẵn tiếng Việt (B2)

Đọc trước `docs/plans/gd8-chung.md`. Người dùng chốt ngày 27/10/2026: làm **gói skill tiếng Việt do aris tự viết** trước (B2). Danh mục nguồn skill bên ngoài (B1) và mở rộng connector (A) để sau.

## Vì sao

Cài xong aris thì Thư viện skill trống: muốn bot làm tốt việc quen thuộc phải tự viết hay nhập skill. Hermes và OpenClaw có kho lớn nhưng tiếng Anh, không hợp việc kinh doanh ở Việt Nam. Một kho skill tiếng Việt viết cho bán hàng, nội dung, chăm sóc khách là chỗ khác biệt thật của aris.

## Đóng gói

- Skill nằm trong repo: `packages/aris-skills/library/<gói>/<skill>/SKILL.md` (cùng dạng `SKILL.md` mà bộ nhập đang đọc: tên, mô tả, khi nào dùng, nội dung), cộng `library/<gói>/pack.json` (tên gói, mô tả, danh sách skill, bot gợi ý gán).
- Cài qua **đúng đường nhập sẵn có** (`importItems`), nguồn mới `kind: 'library'` (gói, phiên bản aris). Không có bước tải mạng.
- Cài một skill hay cả gói: skill thành **skill của đội**, chưa gán bot nào, trừ khi người dùng chọn bot lúc cài. Không cần qua Hộp duyệt (aris tự viết, đã kiểm), nhưng vẫn chạy bộ quét an toàn.
- aris cập nhật kho (bản mới của skill trong gói): Thư viện skill báo "có bản mới", người dùng bấm cập nhật; bản người dùng đã sửa thì không ghi đè, hỏi trước.
- Skill không gán sẵn cho mọi bot: mỗi skill gán thêm làm dài lời dặn của bot.

## Chất lượng

- Mỗi skill: viết bằng tiếng Việt tự nhiên, **không dùng đại từ cứng** cho người dùng hay khách (theo cách xưng hô bot đã chọn), có quy trình từng bước, khuôn đầu ra, ví dụ ngắn, điều không được làm (không bịa giá, chính sách, số liệu; thiếu thông tin thì hỏi lại).
- Mỗi skill kèm **2–3 ca thử** cho bộ kiểm thử skill sẵn có (`eval.ts`); skill chỉ vào kho khi qua ca thử.
- Kiểm tự động: mọi `SKILL.md` đọc được, tên không trùng, mô tả đủ, qua `scanImported`, mỗi gói có `pack.json` khớp thư mục.

## Gói đề xuất (người dùng chọn gói làm trước)

| Gói | Skill đề xuất |
|---|---|
| **Bán hàng và chăm sóc khách** | trả lời hỏi giá, sản phẩm (theo tài liệu); xử lý từ chối (đắt, để suy nghĩ…); chốt đơn nhẹ nhàng; nhắn lại khách im lặng; xử lý khiếu nại; lấy thông tin giao hàng |
| **Nội dung mạng xã hội** | bài Facebook giá trị + CTA; 10 hook cho một chủ đề; chuỗi comment; kịch bản video ngắn; tái chế một bài thành nhiều định dạng; lịch nội dung tuần |
| **Phễu và marketing** | lead magnet; trang đích; chuỗi email nuôi khách; ưu đãi (offer); bản copy quảng cáo Meta; đọc số liệu phễu, chỉ điểm nghẽn |
| **Vận hành nội bộ** | báo cáo tuần; biên bản họp; SOP từ mô tả miệng; checklist; kế hoạch dự án; tóm tắt tài liệu dài |
| **Đào tạo online** | dàn ý khoá học; bài giảng; bài tập và câu hỏi kiểm tra; trả lời học viên; thư chào mừng học viên |

## Điểm dừng

1. Chọn gói làm trước.
2. Duyệt **nội dung** 2 skill mẫu của gói đầu (cách viết, độ dài, giọng) trước khi viết cả gói.
3. Duyệt bản vẽ giao diện.

## Giao diện (vẽ trước, chờ duyệt)

Tự học › Thư viện skill thêm tab **Kho dựng sẵn**:
- thẻ từng gói (tên, mô tả, số skill, đã cài bao nhiêu), nút **Cài cả gói** (chọn bot gán);
- mở gói: danh sách skill, xem trước nội dung, cài từng skill;
- dấu "có bản mới" khi kho trong aris mới hơn bản đã cài.

## Kiểm tra

Theo `gd8-chung.md`. Thêm: chạy ca thử của từng skill với model mặc định, ghi tỉ lệ đạt vào tiến độ; ghi rõ phần chưa thử với bot thật trong phiên thật.
