# Đặc tả: dự án (`@aris/projects`, bước 3b)

## Dự án là gì

Quyết định 11: dự án là nơi vài bot cùng làm một việc lớn, có thư mục làm việc riêng. Trong aris, một dự án là **một workspace của dsh** (thư mục, các phiên) **kèm hồ sơ của aris**: tên, mục tiêu, thành viên, luật trò chuyện, phiên chính. Chỗ chat riêng (`~/aris/workspace`) và workspace mặc định của dsh không phải dự án.

| Trường | Ý nghĩa |
|---|---|
| `workspace` | Mã workspace của dsh (khoá bản ghi) |
| `name`, `goal` | Tên (đổi tên thì đổi cả tên workspace), mục tiêu (không bắt buộc) |
| `members` | Mã nội bộ của bot thường; Aris không nằm trong danh sách vì luôn chủ trì |
| `rules` | `maxRounds` (1–10, mặc định 3), `maxMessages` (1–30, mặc định 10), `stopCommand`, `arisSummarizes`; chat chung dùng ở bước 3e |
| `mainSession` | Phiên chính, Aris làm trưởng nhóm, ghim đầu dự án |

## Một dự án, một Team

Team của dsh gắn với một phiên trưởng nhóm (mã Team = mã phiên). Team của dự án là Team của **phiên chính**: việc Aris giao trong phiên chính thành thẻ trên bảng việc của Team đó (Kanban bước 3c). Thành viên dự án là danh sách của aris; bot vào Team khi được giao việc lần đầu (dsh tạo thành viên đội lúc đó), nên thêm bot vào dự án không tốn gì cho tới khi có việc. Phiên chính mất (bị xoá) thì lần mở sau tạo phiên chính mới.

## Ngữ cảnh `aris:project`

Mọi phiên trong một dự án có hồ sơ nạp `<aris-project>` (sau tính cách, trước hướng dẫn giao việc): tên, thư mục, mục tiêu, thành viên (`@tên gọi`, vai). Aris nhận thêm cách làm trong dự án: giao việc cho thành viên trước, cần bot ngoài dự án thì hỏi người dùng hoặc đề nghị thêm vào dự án; luật trò chuyện. Bot thành viên nhận mục tiêu và đồng đội.

## Đường máy chủ

`/api/aris/projects`: `GET` trả mọi workspace là dự án (`workspace`, `path`, `title`, số phiên, `project` là hồ sơ hoặc `null` với dự án cũ chưa có hồ sơ). `POST` với `op`:

| `op` | Việc |
|---|---|
| `create` `{ project: { name, path, goal?, members, rules? } }` | Mở rộng `~`, tạo thư mục nếu chưa có, tạo (hoặc lấy lại) workspace, ghi hồ sơ, tạo phiên chính; trả `sessionId`. Thư mục đã là dự án thì báo. |
| `update` `{ workspace, patch }` | Sửa từng phần; dự án cũ chưa có hồ sơ thì tạo hồ sơ (tên theo workspace) |
| `main` `{ workspace }` | Mã phiên chính (tạo mới nếu đã mất) |

Dịch vụ `arisProjects` (`store`, `ofSession`) cho Kanban và chat chung ở bước sau.

## Giao diện

- 1.5 Tạo dự án (bản vẽ `TaoPhong.dc.html`): tên, thành viên từ đội thật (Aris chủ trì cố định), thư mục gợi ý `~/aris/projects/<tên>` hoặc chọn bằng bộ chọn thư mục, mục tiêu, luật (Nâng cao). Tạo xong mở phiên chính.
- 1.4 Cột phải của dự án: mục tiêu, thành viên kèm trạng thái trực tiếp (sơ đồ 3D, Aris giữa), thêm bot (menu các bot chưa ở trong dự án), bỏ bot, luật, việc sinh ra từ dự án (bước 3c), lối mở bảng việc.
- Đầu khung chat của phiên dự án: linh vật Aris và các thành viên, "n bot và {you}".
- Bộ thành phần có kho dự án dùng chung (`useProjects`, `projectAction`); sửa ở một gói thì phát `aris:projects-changed` để gói khác tải lại.

Chạy thử thật (24/10): tạo "Thử dự án aris" (Minh, Thơ, mục tiêu "Viết 3 ý tưởng bài Facebook…") → thư mục `~/aris/projects/thu-du-an-aris` được tạo, phiên chính mở, đầu khung và cột phải hiện đúng thành viên; thêm rồi bỏ Phát cập nhật ngay; hỏi Aris trong phiên chính thì Aris nêu đúng tên, thư mục, mục tiêu, thành viên.
