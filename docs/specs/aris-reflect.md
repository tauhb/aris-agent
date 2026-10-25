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

## Hồ sơ chủ nhân (đợt 2, màn 2.3)

Mỗi bot giữ một hồ sơ riêng về người dùng: các **nhận định** suy ra từ cách người dùng làm việc và phản hồi, khác với ký ức (điều được nói ra hay ghi lại, qua Hộp duyệt).

| Trường | Ý nghĩa |
|---|---|
| `area` | `communication` (cách giao tiếp) hoặc `work` (công việc và mục tiêu) |
| `text` | Một câu, gọi là "người dùng" |
| `confidence` | 0–1; do aris tính, không do model đặt |
| `evidence` | Các lần thấy (phiên, lúc, trích ngắn), giữ 10 lần gần nhất; `hits` là tổng số lần |
| `confirmed` | Người dùng bấm Đúng hoặc sửa: độ tin cậy 1 |
| `question` | Khi có bằng chứng ngược: câu hỏi và các lựa chọn (mỗi lựa chọn là một nhận định đầy đủ) |
| `status` | `active` hoặc `rejected` (người dùng bấm Sai; giữ lại để vòng học khỏi đưa lại) |

**Chỉ vòng học cập nhật.** Bot không có công cụ ghi nhận định. Mỗi lần học, ngoài ký ức, model trả thêm tối đa 3 quan sát `insights`: câu nhận định, mảng, trích dẫn, và nếu trùng ý thì mã nhận định có sẵn (`supports`) hay ngược ý (`contradicts`, kèm câu hỏi và lựa chọn).

**Tính độ tin cậy:**
- Nhận định mới: 0,4.
- Mỗi lần thấy thêm: `c + (1 − c) × 0,35` (0,4 → 0,61 → 0,75 → 0,84 → …): thấy 4 lần thì vượt 0,8.
- Quan sát ngược: `c × 0,5`; có câu hỏi thì hiện ô "chưa chắc" để người dùng chọn.
- Quan sát gần trùng (Jaccard ≥ 0,6) với nhận định có sẵn được tính là thấy thêm; trùng nhận định bị bác thì bỏ.

**Vào prompt:** nhận định từ 0,8 trở lên (hoặc đã xác nhận) của bot nạp thành khối `<aris-owner-insights>` ở ngữ cảnh động, sau ký ức lõi; tối đa 1.500 ký tự, cao trước. Nhận định không qua Hộp duyệt: cửa chặn là độ tin cậy, và người dùng xem, sửa, bác được trên màn 2.3.

**Màn 2.3:** chọn bot; ô "chưa chắc" với các lựa chọn; hai bảng Cách giao tiếp, Công việc và mục tiêu (thanh độ tin cậy, số lần làm bằng chứng mở đúng phiên gần nhất, Đúng / Sửa, Sai với nhận định yếu); "Sao chép sang bot khác" chép các nhận định đang có (gộp với nhận định trùng ý ở bot đích).

**API:** `GET /api/aris/insights?bot=<mã>`; `POST` với `op` = `confirm`, `edit` (`text`), `reject`, `answer` (`option`), `copy` (`to`).

## Hiểu chủ nhân sâu (giai đoạn 5, đợt 5b; bản vẽ 2.3b, làm 25/10)

- **Hồ sơ chung** (mã `chung`, mọi bot đọc): quan sát của một bot khớp nhận định đang có của bot khác (cùng ý từ 0,6)
  thì cả hai gộp lên hồ sơ chung, ghi các bot đã thấy; bản riêng thành `merged`. Quan sát khớp hồ sơ chung thì nâng
  hồ sơ chung. Nút "Đưa vào chung" làm tay. Ngược ý một nhận định chung thì hỏi lại như cũ. Bot đọc hồ sơ chung
  rồi hồ sơ riêng (vòng học, đầu phiên, prompt).
- **Suy luận ba vòng** sau mỗi 6 lượt của một phiên (và khi phiên đóng, nếu còn từ 2 lượt), model rẻ của vòng học:
  (1) suy tối đa 5 quan sát kèm trích lời người dùng; (2) tự soát, bỏ điều thiếu bằng chứng, chỉ đúng một lần, nói
  về bot; (3) hoà giải với hồ sơ (cùng ý, ngược ý kèm câu hỏi, mới) rồi ghi qua kho nhận định. Bỏ qua phiên kiểm
  thử skill, routine, Thủ thư, trợ lý ẩn danh. Trần 0,20 USD/ngày (phạm vi `profile`). Mỗi lần ghi vào bảng
  `profile_runs` (200 lần gần nhất).
- **Đầu phiên**: ở câu đầu của phiên, nếu có hơn 6 nhận định đủ tin thì chọn 6 điều gần câu đầu nhất (0,6 × gần +
  0,4 × tin cậy; gần theo nghĩa qua `arisEmbed` khi có khoá Gemini, không thì theo từ trùng), chờ tối đa 1,5 giây.
- Màn 2.3: chọn "Chung · mọi bot" hay từng bot; hồ sơ chung ghi "Thấy ở"; hồ sơ riêng có "Đưa vào chung" và dòng
  "cũng đọc N nhận định chung"; cột phải: lần suy luận gần nhất (3 vòng, kết quả mới / nâng / hỏi lại / lên chung /
  bỏ), đầu phiên gần nhất, nhịp và chi phí. API: `GET /api/aris/insights?profile`, POST `share`.
- Đã chạy trên máy: 6 lượt với Aris ⇒ một lần suy luận rút 5 quan sát, giữ cả 5, 0,0066 USD; "Đưa vào chung" nhận
  định "đọc trên điện thoại" ⇒ hồ sơ chung có 1 nhận định, thấy ở Aris. Lỗi tìm ra: vòng hoà giải không khớp được
  nhận định cũ (model chép cả ngoặc vuông của mã) ⇒ đọc mã bỏ ngoặc, nói rõ hơn trong lời nhắc. Chưa thử thật: hai
  bot cùng thấy tự lên chung, đầu phiên khi có hơn 6 nhận định đủ tin, câu hỏi lại từ vòng hoà giải, trần ngày.

## Để sau

- Đề xuất skill (đợt 3) dùng chung vòng học này.
- Gợi ý luật từ lịch sử duyệt, "luôn cho phép loại này".
- `/refine` chạy vòng học thủ công.
