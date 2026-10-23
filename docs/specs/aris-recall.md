# Đặc tả `aris-recall` (giai đoạn 1, bước 3)

> Viết lại bằng lời của aris từ thiết kế ở [phan-tich-kien-truc.md](../phan-tich-kien-truc.md) mục 6.4, chỉnh theo các API dsh đã kiểm.

## Mục tiêu

- Anh hỏi "tuần trước mình bàn gì về X?", bot tìm trong các phiên cũ và trả lời đúng, **có dẫn nguồn** (phiên nào, tin nào).
- Chỉ phần tóm tắt vào ngữ cảnh, không đổ nguyên văn nhiều phiên vào prompt.
- Hộp "Tìm trong mọi phiên" (1.6) tìm trong nội dung thật.

## Dựng trên lõi của dsh

- **Chỉ mục toàn văn**: `ctx.sessionQuery` của dsh (SQLite FTS5 trên log phiên). dsh-base có sẵn nhưng tắt tìm nội dung (`openAt: never`). Lớp aris bật lên: `openAt: first-search` (mở khi tìm lần đầu, khởi động không chậm), lưu chỉ mục ở `$DSH_HOME/session-search.sqlite` để lần sau không phải dựng lại. Chỉ mục là dữ liệu suy ra từ log, xoá đi thì dsh dựng lại.
- Bật chỉ mục cũng làm ô tìm phiên của dsh (⌘K) tìm được trong nội dung.
- dsh còn có bộ tool thử nghiệm `dsh-experimental-session-search` (5 tool đọc phiên thô). aris không bật nó: hai bộ tool làm cùng việc chỉ làm model bối rối, và tool thô đổ nguyên văn vào ngữ cảnh.

## Tool `recall`

Một tool, hai `action`:

- `search`: `query` (bắt buộc), `days` (chỉ xét tin trong N ngày gần đây), `limit` (số phiên, mặc định 5, tối đa 10).
  1. `sessionQuery.searchSessions`: mỗi phiên lấy tin khớp nhất. Bỏ phiên đang chat và tin `log-only` (lời nhắc, bản ghi nội bộ). Giữ tin `shadowed`: đó là lời thật đã bị nén khỏi ngữ cảnh, vẫn đúng.
  2. Mỗi phiên đọc một cửa sổ quanh tin khớp (`sessionQuery.readEvent`, 4 tin trước, 4 tin sau), chỉ lấy lời chủ nhân và lời bot, cắt bớt tin dài.
  3. Một lời gọi model tóm tắt: trả lời câu hỏi chỉ bằng các đoạn trích, mỗi ý ghi nguồn dạng `[S1#12]` (phiên S1, tin số 12); không thấy thì nói không thấy.
  4. Trả về phần tóm tắt và danh sách nguồn: `S1 = <tên phiên> · <ngày> · <mã phiên>`.
- `open`: `session`, `seq`, `around` (số tin hai bên, mặc định 2, tối đa 10): đọc nguyên văn khi cần chính xác (trích lời, số liệu).

**Model tóm tắt** ("Tóm tắt khi tìm lại" ở trang 6.2): mặc định là model phiên đang dùng (lấy từ sự kiện `request/context` gần nhất của phiên). Cấu hình `summaryModel: { provider, model }` của plugin để chọn model rẻ hơn. Model lỗi thì trả các đoạn trích thô kèm nguồn, bot vẫn có cái để trả lời.

Mỗi lần tìm để lại bản ghi `plugin:aris/recall` trong log phiên (câu hỏi, số phiên, nguồn).

## Đường `/api/aris/recall` (trang 1.6)

- `GET ?q=…&limit=…` → các phiên khớp: mã phiên, tên, ngày, đoạn trích quanh chỗ khớp, `seq`. Không gọi model (hộp tìm cần nhanh).
- dsh kiểm cookie và chỉ cho chủ nhân, như `/api/aris/memory`.

## Để sau

- Tìm theo nghĩa (embedding) cho câu hỏi không trùng chữ: GĐ3, cùng "Nhúng" ở trang 6.2.
- Chỉ tìm trong phiên của đúng bot hỏi (GĐ2, khi có bot riêng).
