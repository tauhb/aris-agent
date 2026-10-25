# Đặc tả: dự án (`@aris/projects`, bước 3b)

## Dự án là gì

Quyết định 11: dự án là nơi vài bot cùng làm một việc lớn, có thư mục làm việc riêng. Trong aris, một dự án là **một workspace của dsh** (thư mục, các phiên) **kèm hồ sơ của aris**: tên, mục tiêu, thành viên, luật trò chuyện, phiên chính. Chỗ chat riêng (`~/aris/workspace`) và workspace mặc định của dsh không phải dự án.

| Trường | Ý nghĩa |
|---|---|
| `workspace` | Mã workspace của dsh (khoá bản ghi) |
| `name`, `goal` | Tên (đổi tên thì đổi cả tên workspace), mục tiêu (không bắt buộc) |
| `members` | Mã nội bộ của bot thường; Aris không nằm trong danh sách vì luôn chủ trì |
| `rules` | `maxRounds` (1–10, mặc định 3), `maxMessages` (1–30, mặc định 10), `stopCommand`, `arisSummarizes`; phòng nhóm dùng (bước 3e, xem [aris-commander.md](aris-commander.md#phòng-nhóm-của-dự-án-moi_noi-bước-3e)) |
| `mainSession` | Phiên chính, Aris làm trưởng nhóm, ghim đầu dự án |

## Một dự án, một Team

Team của dsh gắn với một phiên trưởng nhóm (mã Team = mã phiên). Team của dự án là Team của **phiên chính**: việc Aris giao trong phiên chính thành thẻ trên bảng việc của Team đó (Kanban bước 3c). Thành viên dự án là danh sách của aris; bot vào Team khi được giao việc lần đầu (dsh tạo thành viên đội lúc đó), nên thêm bot vào dự án không tốn gì cho tới khi có việc. Phiên chính mất (bị xoá) thì lần mở sau tạo phiên chính mới.

## Ngữ cảnh `aris:project`

Mọi phiên trong một dự án có hồ sơ nạp `<aris-project>` (sau tính cách, trước hướng dẫn giao việc): tên, thư mục, mục tiêu, thành viên (`@tên gọi`, vai). Aris nhận thêm cách làm trong dự án: giao việc cho thành viên trước, cần bot ngoài dự án thì hỏi người dùng hoặc đề nghị thêm vào dự án. Riêng phiên chính (phòng nhóm): khi nào mở cuộc bàn bằng `moi_noi`, cách điều phối, luật số vòng và số tin, hỏi người dùng bằng `ask_user_question` trước khi chốt, lệnh dừng. Bot thành viên nhận mục tiêu và đồng đội.

## Đường máy chủ

`/api/aris/projects`: `GET` trả mọi workspace là dự án (`workspace`, `path`, `title`, số phiên, `project` là hồ sơ hoặc `null` với dự án cũ chưa có hồ sơ). `POST` với `op`:

| `op` | Việc |
|---|---|
| `create` `{ project: { name, path, goal?, members, rules? } }` | Mở rộng `~`, tạo thư mục nếu chưa có, tạo (hoặc lấy lại) workspace, ghi hồ sơ, tạo phiên chính; trả `sessionId`. Thư mục đã là dự án thì báo. |
| `update` `{ workspace, patch }` | Sửa từng phần; dự án cũ chưa có hồ sơ thì tạo hồ sơ (tên theo workspace) |
| `main` `{ workspace }` | Mã phiên chính (tạo mới nếu đã mất) |

Dịch vụ `arisProjects` (`store`, `ofSession`) cho Kanban và chat chung ở bước sau.

## Bảng việc (Kanban, bước 3c)

Bảng việc của dự án gộp hai nguồn:

- **Thẻ của đội** (`task-n`): bản ghi `team/task` trong phiên chính. Đọc bằng `ctx.sessionQuery.observeSession` (không đánh thức phiên), gom với `team/member` để biết bot nào giữ thẻ. Thẻ của đội chỉ ghi được bằng agent đang chạy, nên do Aris tạo (`tao_the`, `giao_viec`) và bot nhận thẻ đánh dấu xong (xem đặc tả Commander).
- **Thẻ người dùng tạo** (`c-n`, bảng `cards` của `aris_projects`): chờ chia việc tới khi Aris giao; giao xong thì thẻ của đội thay chỗ (`taskId`).

| Cột | Thẻ |
|---|---|
| Chờ chia việc | Thẻ người dùng tạo; thẻ Aris chia chưa giao ai (thẻ chờ thẻ khác ghi "chờ n thẻ: …") |
| Sẵn sàng | Đã giao, bot chưa bắt đầu, hoặc bot đang làm thẻ cũ hơn |
| Đang làm / Chờ duyệt | Thẻ cũ nhất bot đang giữ, theo phiên của bot đang chạy hay đang đợi người dùng |
| Xong | Thẻ hoàn tất |

**Chia việc** (`split` của dự án): tự động (mặc định) thì ngữ cảnh `aris:project` liệt kê thẻ chờ để Aris giao ở lượt này hoặc lượt tới; thủ công thì Aris chỉ giao khi người dùng bảo. Nút "Giao ngay" trên một thẻ chờ (chọn bot hoặc để Aris chọn) gửi một tin vào phiên chính nhờ Aris giao thẻ đó (`giao_viec` với `the`), tốn một lượt của Aris.

Đường máy chủ thêm: `GET ?board=<workspace>` (thẻ, chế độ chia việc); `POST` `card-create`, `card-update`, `card-delete`, `card-dispatch`.

Chạy thử thật (24/10): dự án "Thử dự án aris", chế độ thủ công, thẻ `c-1` «3 ý tưởng bài Facebook…» gợi ý Thơ → "Giao ngay" → Aris giao Thơ (thẻ `task-1`) → Thơ làm xong, thẻ tự sang Xong.

## Driver — tự đẩy việc trên bảng (giai đoạn 4, đợt 4)

Không có Driver, mọi bước chuyển trên bảng chờ Aris tốn một lượt: thẻ trước xong thì thẻ sau đứng yên tới khi Aris đọc kết quả và giao tiếp. Driver làm phần cơ học đó, học cách bộ phân việc của Hermes (đọc tài liệu, nhật ký clean-room 25/10), viết lại trên Team của dsh.

- **Bật theo dự án**, mặc định tắt (công tắc "Driver" ở thanh trên của 4.3). Trang Commander (2.5) dẫn về Kanban.
- **Bot dự kiến cho thẻ**: `tao_the` nhận thêm `bot` cho từng thẻ (người sẽ làm khi thẻ sẵn sàng); aris lưu ở `aris_projects` (bảng `plans`), Kanban hiện tên bot dự kiến trên thẻ chờ.
- Mỗi **30 giây**, với mỗi dự án bật Driver (đọc bảng từ log phiên chính, không đánh thức phiên):
  1. Thẻ chưa giao, mọi thẻ phụ thuộc đã xong, có bot dự kiến ⇒ Driver **giao thẳng** bằng đúng đường của `giao_viec` (mở lại agent phiên chính khi cần, không tốn lượt của Aris), lời giao kèm **kết quả của các thẻ phụ thuộc** (câu trả lời cuối của bot làm thẻ đó, cắt ngắn). Theo giới hạn số bot chạy cùng lúc của Commander.
  2. Thẻ sẵn sàng mà chưa có bot dự kiến ⇒ **đánh thức Aris** một lần cho thẻ đó (mỗi nhịp tối đa một thẻ) để Aris chọn người.
  3. Lượt của bot làm thẻ kết thúc vấp ⇒ Driver giao lại một lần kèm lý do vấp; **vấp 2 lần liên tiếp** thì ngừng tự đẩy thẻ đó, thẻ hiện "vấp", báo Telegram. Người dùng dừng tay thì Driver để yên.
  4. Thẻ đã giao mà 30 phút không có kết quả và bot không chạy ⇒ báo "kẹt" một lần.
  5. Mọi thẻ của dự án xong ⇒ báo Telegram một lần.
- Kết quả lượt của bot (câu trả lời cuối) được ghi vào nhật ký giao việc để thẻ sau đọc được.
- Để sau (Hermes có): tự chia thẻ thô bằng model, thẻ chế độ mục tiêu, bình luận trên thẻ, tệp đính kèm, lịch sử từng lần chạy trong chi tiết thẻ (cần vẽ).

## Giao diện

- 1.5 Tạo dự án (bản vẽ `TaoPhong.dc.html`): tên, thành viên từ đội thật (Aris chủ trì cố định), thư mục gợi ý `~/aris/projects/<tên>` hoặc chọn bằng bộ chọn thư mục, mục tiêu, luật (Nâng cao). Tạo xong mở phiên chính.
- 1.4 Cột phải của dự án: mục tiêu, thành viên kèm trạng thái trực tiếp (sơ đồ 3D, Aris giữa), thêm bot (menu các bot chưa ở trong dự án), bỏ bot, luật, việc sinh ra từ dự án (thẻ chưa xong, đang làm và chờ duyệt trước), lối mở bảng việc của dự án.
- 4.3 Kanban (bản vẽ `Kanban.dc.html`): chọn dự án, năm cột, chia việc tự động/thủ công, thẻ mới (tiêu đề, chi tiết, bot gợi ý), thẻ chờ có "Giao ngay" và "Xoá", bấm thẻ đã giao mở phiên của bot; tải lại 5 giây một lần.
- Đầu khung chat của phiên dự án: linh vật Aris và các thành viên, "n bot và {you}".
- Bộ thành phần có kho dự án dùng chung (`useProjects`, `projectAction`); sửa ở một gói thì phát `aris:projects-changed` để gói khác tải lại.

Chạy thử thật (24/10): tạo "Thử dự án aris" (Minh, Thơ, mục tiêu "Viết 3 ý tưởng bài Facebook…") → thư mục `~/aris/projects/thu-du-an-aris` được tạo, phiên chính mở, đầu khung và cột phải hiện đúng thành viên; thêm rồi bỏ Phát cập nhật ngay; hỏi Aris trong phiên chính thì Aris nêu đúng tên, thư mục, mục tiêu, thành viên.
