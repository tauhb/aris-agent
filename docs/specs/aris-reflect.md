# Đặc tả `aris-reflect` và Hộp duyệt chung (giai đoạn 3, đợt 1)

> Viết lại bằng lời của aris từ [tinh-nang-aris.md](../tinh-nang-aris.md) mục C1 và kế hoạch giai đoạn 3. Mức mặc định người dùng duyệt ngày 24/10/2026.

## Mục tiêu

- Bot học từ việc vừa làm mà không ai phải nhắc: sau lượt có dấu hiệu đáng học, một vòng chạy nền đọc lại lượt đó và đề xuất ký ức.
- Mọi thứ bot tự suy ra đều qua tay người dùng: đề xuất nằm ở Hộp duyệt (web, màn 3.4) và thẻ Telegram (7.3); quá 7 ngày không trả lời thì coi như bỏ.
- Nội dung từ web, email, tệp không bao giờ tự thành ký ức.
- Chi phí có trần: mỗi lần và mỗi ngày.

## Khi nào học (tín hiệu)

Plugin theo dõi từng lượt của mọi phiên bot: lời người dùng, câu trả lời, các lần gọi công cụ (tên, lỗi hay không), số lần ghi ký ức. Cuối lượt, lượt được xét học khi có một trong các dấu hiệu:

| Dấu hiệu | Cách nhận |
|---|---|
| Sửa sai | Lời người dùng có "sai rồi", "không phải", "chưa đúng", "làm lại", "nhầm"… (so trên chữ bỏ dấu) |
| Dặn nhớ mà bot chưa ghi | Có dấu hiệu "nhớ là", "lần sau", "từ giờ"… mà lượt không ghi ký ức |
| Khen | "tốt lắm", "chuẩn rồi", "đúng ý"… (cách làm này đáng giữ) |
| Việc dài | Từ 8 lần gọi công cụ trở lên |
| Lỗi rồi tìm ra cách | Có lần gọi công cụ lỗi, sau đó cùng công cụ chạy được |
| Lưới an toàn | 12 lượt liền không học lần nào, và đoạn chưa học đủ dài |

Lượt ngắn (dưới 200 ký tự lời người dùng và trả lời, không công cụ) bỏ qua. Mỗi phiên cách nhau ít nhất 2 lượt giữa hai lần học, trừ khi bị sửa sai.

## Học thế nào

- Đoạn đem học là các lượt từ lần học trước (tối đa 50.000 ký tự, giữ phần cuối, khoảng 20 nghìn token), kèm danh sách ký ức hiện có của bot (cả chờ duyệt) để khỏi trùng.
- Gọi thẳng model rẻ (`ctx.llm.stream`), mặc định model có chữ "Flash" của nhà cung cấp mặc định, không có thì model mặc định. **Khác bản thiết kế C1**: không tách nhánh phiên. Nhánh tách phải dùng model của phiên (thường đắt hơn) và mang theo công cụ của bot; với trần 20 nghìn token trên model rẻ, gọi thẳng rẻ hơn và không có nguy cơ vòng học tự chạy công cụ.
- Model trả JSON `{"memories": [...]}`, tối đa 3 mục, mỗi mục: `text`, `book` (owner / notes), `kind`, `tier` (core / archive), `why` (vì sao đáng nhớ), `quote` (trích ngắn làm bằng chứng), `origin` (user: người dùng nói ra; inferred: suy từ cách người dùng phản ứng; external: thấy trong kết quả web, tệp, email). Sai định dạng thì bỏ.
- Bỏ mục gần trùng ký ức đã có (Jaccard theo từ ≥ 0,6). Mục `external` chỉ được vào lưu trữ.
- Chạy nền, mỗi lúc một lần; mỗi lần ghi `plugin:aris/reflect` vào log phiên và một dòng vào bảng `runs` của kho `aris_reflect`.

## Trần chi phí

- Mỗi lần: đầu vào ≤ 50.000 ký tự, đầu ra ≤ 6.000 token (model có suy luận tính cả phần suy nghĩ).
- Mỗi ngày: 0,30 USD cho cả đội. `@aris/providers` tính tiền theo bảng giá và ghi vào sổ chi phí (phạm vi `reflect` và `bot:<mã>`) qua `arisSpend.charge`; chạm trần thì dừng học tới hôm sau.

## Ký ức chờ duyệt

- Ký ức bot tự suy ra (tool `memory` với `origin` inferred / external, vòng học, rút ký ức khi nén) đều vào trạng thái **chờ duyệt**; chỉ điều người dùng nói ra ("nhớ là…") được lưu ngay.
- Bản ghi ký ức có thêm: `by` (bot đề xuất), `why`, `quote`, `via` (`tool`, `reflect`, `compaction`), `review` (lúc, ai: `user` / `telegram` / `timeout`, kết quả).
- Quá 7 ngày chưa trả lời: tự bỏ (`review.by = timeout`). Quét lúc khởi động và mỗi giờ.
- `arisMemory.proposals`: danh sách đề xuất, nghe mở / đóng, trả lời (`save`, `edit` kèm câu mới, `discard`).

## Hộp duyệt chung (màn 3.4)

- Một danh sách cho hai loại: **Hành động** (yêu cầu quyền của bot trong đội và bot ngoài, có từ giai đoạn 2, tự từ chối sau 15 phút) và **Ký ức** (đề xuất chờ duyệt của mọi bot). Skill vào ở đợt 3.
- Chi tiết hành động: bot, công cụ, đối tượng, lý do, hạn; Cho phép một lần / Từ chối.
- Chi tiết ký ức: bot đề xuất, câu ký ức (sửa được ngay), cuốn, loại, tầng, vì sao, bằng chứng, phiên gốc, còn mấy ngày; Lưu / Bỏ. Lõi đầy thì báo và cho lưu vào lưu trữ.
- "Đã xử lý hôm nay": số yêu cầu và đề xuất đã trả lời trong ngày. "Gợi ý luật" để đợt sau (hiện mờ).

## Telegram (thẻ 7.3)

Mỗi đề xuất ký ức gửi một thẻ tới chat chính qua bot Aris: "GHI NHỚ · <bot>", câu ký ức, vì sao, nút Lưu / Sửa / Bỏ. Sửa: bot nhắn "gõ câu mới", tin kế tiếp của người dùng trong chat đó là câu thay, lưu luôn. Trả lời ở web hay hết hạn thì thẻ được sửa, bỏ nút.

## Đường API

- `GET /api/aris/reflect`: hôm nay đã tiêu bao nhiêu, trần, model đang dùng, 20 lần học gần nhất.
- `GET /api/aris/memory?pending=all`: đề xuất chờ duyệt của mọi bot, số đã xử lý hôm nay.
- `POST /api/aris/memory` thêm `op: 'review'` với `decision` (`save` / `discard`), `text?`, `tier?`.
- `GET /api/aris/commander?approvals=all` trả thêm `doneToday`.

## Để sau

- Hồ sơ chủ nhân có độ tin cậy (đợt 2), đề xuất skill (đợt 3) dùng chung vòng học này.
- Gợi ý luật từ lịch sử duyệt, "luôn cho phép loại này".
- `/refine` chạy vòng học thủ công.
