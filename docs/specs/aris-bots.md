# Đặc tả bot (giai đoạn 2, bước 1)

> Viết theo [ke-hoach-trien-khai.md](../ke-hoach-trien-khai.md) mục "Giai đoạn 2", sau phép thử Agent Teams (23/10).

## Bot là dữ liệu của aris, không phải preset của dsh

Phép thử Agent Teams cho thấy thành viên đội của dsh dùng chung preset và model với phiên chính, không chọn preset riêng được. Preset của dsh lại là hàng cấu hình tĩnh (sửa xong phải nạp lại). Vì vậy:

- **Bot là một bản ghi** trong storage domain `aris_bots` (thư mục dữ liệu của từng người, không nằm trong repo).
- **Phiên được gắn với một bot** (bảng `sessions`: phiên → bot). Phiên chưa gắn là phiên của Commander.
- Các plugin aris đọc bot của phiên để nạp đúng **tính cách** (SOUL), **ký ức**, **model**.

Tạo, sửa, xoá bot ngay trong app, không phải khởi động lại.

## Hồ sơ bot

| Trường | Ý nghĩa |
|---|---|
| `id` | Mã nội bộ cố định, tự sinh (`b-xxxxxx`); Commander là `aris`. Ký ức, phiên, kênh gắn vào mã này |
| `handle` | Tên gọi `@handle`: chữ thường không dấu, số, `-`; đổi được, không trùng |
| `name` | Tên hiển thị (có dấu) |
| `role` | Vai ngắn ("Nghiên cứu") |
| `description` | Mô tả năng lực: Commander dựa vào đây để chọn người (bước 2) |
| `soul` | Tính cách, cách làm việc, giọng văn |
| `mascot` | Mã linh vật trong bộ linh vật của aris |
| `model` | `{ provider, model }` riêng, bỏ trống là theo model mặc định |
| `department` | Mã phòng ban |
| `kind` | `commander` (đúng một bot) hoặc `member` |

Phòng ban (bảng `departments`): `id`, `name`, `lead` (mã bot trưởng nhóm), `order`. Chính sách chung của phòng ban ở bước 3.

## Gắn bot vào phiên

1. **Chat thẳng với bot**: trang Hồ sơ bot hoặc thanh bên, nút "Chat với …". Máy chủ tạo phiên trong chat riêng, gắn bot, chọn model của bot (`sessionController.selectModel`), rồi web mở phiên đó.
2. **Thành viên đội trùng tên gọi**: khi phiên chính ghi `team/member` (dsh ghi bản ghi này trước khi phiên con chạy) mà tên thành viên trùng `handle` của một bot, phiên con được gắn bot đó.
3. **Commander giao việc** (bước 2): công cụ giao việc tự gắn.

## Nạp theo bot

- **Tính cách**: ngữ cảnh động `aris:bot` (dsh nạp lại mỗi lần dựng prompt): tên, vai, SOUL, đội hình (tên gọi, vai, mô tả của các bot khác) để bot biết gọi ai.
- **Ký ức**: `@aris/memory` lấy bot của phiên thay vì luôn là `aris`. Mỗi bot có hai cuốn lõi và lưu trữ riêng. Phiên chưa gắn dùng ký ức của Commander.
- **Model**: chọn khi mở phiên (mục 1). Thành viên đội và việc được giao dùng model do Commander chọn (bước 2).

## Xưng hô với người dùng

Không viết cứng "anh", "chị", "chủ nhân" ở bất cứ đâu (lời nhắc cho model, chữ giao diện, tin Telegram):

- **Hồ sơ xưng hô** (bảng `owner` của `aris_bots`): tên người dùng, bot gọi người dùng là gì, bot tự xưng là gì. Cả đội dùng chung.
- **Lần đầu**: ngữ cảnh `aris:bot` báo chưa biết; bot vẫn làm việc được nhờ rồi hỏi ngắn một lần, nhận câu trả lời thì lưu bằng tool `xung_ho`. Người dùng không muốn trả lời thì thôi. Trước khi biết, dùng cách gọi trung tính hợp với ngôn ngữ người dùng đang viết.
- **Biết rồi**: ngữ cảnh ghi rõ tên, cách gọi, cách xưng; mọi bot theo.
- **Lời nhắc cho model** gọi là "người dùng" (vai "người dùng chính" khi cần phân biệt với người khác trên Telegram).
- **Chữ giao diện tiếng Việt** (của aris và bản dịch chữ dsh) dùng `{you}` / `{You}`, điền lúc đăng ký chữ theo hồ sơ (`registerPersonal` trong `@aris/ui-kit/react`), chưa có thì "bạn"; đổi hồ sơ thì chữ đổi theo. Chân thanh bên hiện tên người dùng.
- **Tin hệ thống trên Telegram** viết không cần đại từ.
- Sửa tay ở trang Hồ sơ (2.3), mục "Đội gọi … thế nào".

## Đội mẫu

Tệp `packages/aris-bots/templates/*.json`, mỗi tệp một đội: phòng ban và bot (trừ `id`, sinh khi áp). Đi kèm aris:

| Mẫu | Nội dung |
|---|---|
| `tang-truong` (A) | Minh (Nghiên cứu), Thơ (Nội dung), Phát (Bán hàng và chăm khách) ở Tăng trưởng; An (Thư ký), Ngân (Tài chính) ở Vận hành; Khoa (Kỹ thuật) |
| `biet-danh` (B) | Soi, Bút, Chốt, Lịch, Két, Máy: cùng vai như A, tên theo việc |
| `canvas` (C) | Lâm, Hạ, Mai, Tín, Dev như bản thiết kế, thêm một bot bán hàng |

Lần đầu mở (chưa có bot nào ngoài Commander), Đội hình mời chọn một đội mẫu hoặc tự tạo. Áp mẫu chỉ thêm bot, không xoá bot đang có; trùng tên gọi thì bỏ qua bot đó.

## Đường máy chủ

`/api/aris/bots`: `GET` trả bot, phòng ban, danh sách mẫu. `POST` với `op`:

| `op` | Việc |
|---|---|
| `create` `{ bot }` | Tạo bot |
| `update` `{ id, patch }` | Sửa bot (không đổi `id`, `kind`) |
| `delete` `{ id }` | Xoá bot (không xoá Commander; ký ức và phiên cũ giữ nguyên) |
| `department` `{ department }` | Tạo hoặc sửa phòng ban |
| `apply-template` `{ template }` | Áp đội mẫu |
| `open` `{ id }` | Tạo phiên chat thẳng với bot, trả `sessionId` |

## Giao diện (bước 1)

Thanh bên Đội hình, cột phải (sơ đồ đội 3D), Bản đồ đội, trang phòng ban, Hồ sơ bot (2.2), Tạo bot (2.1) đọc dữ liệu thật; gỡ `DEMO_TEAM`. Trạng thái trực tiếp (đang làm, chờ anh…) và việc gần đây là bước 2.
