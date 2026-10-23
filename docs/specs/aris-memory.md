# Đặc tả `aris-memory` (giai đoạn 1, bước 1)

> Viết lại bằng lời của aris từ thiết kế ở [phan-tich-kien-truc.md](../phan-tich-kien-truc.md) mục 6.3, chỉnh theo giao diện 3.1 và các API dsh đã kiểm.

## Mục tiêu

- Anh nói "nhớ là…" thì từ **tin kế tiếp** bot đã biết, không cần mở chat mới.
- Mở phiên mới vẫn nhớ.
- Ký ức không phá bộ nhớ đệm prompt.
- Anh xem, sửa, xoá, hạ cấp được trên trang 3.1.

## Dữ liệu

Mỗi bot có ký ức riêng (quyết định 3). Một bản ghi:

| Trường | Ý nghĩa |
|---|---|
| `id` | `m-<thời gian>-<ngẫu nhiên>` (chỉ chữ, số, `-`, đúng ràng buộc khoá của storage dsh) |
| `bot` | Mã bot sở hữu; giai đoạn 1 luôn là `aris` |
| `book` | `notes` (ghi chú của bot: môi trường, quy ước, bài học) hoặc `owner` (hồ sơ chủ nhân: sở thích, thói quen) |
| `tier` | `core` (nạp vào mọi lượt) hoặc `archive` (chỉ tìm khi cần) |
| `status` | `active`, `pending` (chờ anh duyệt) hoặc `deleted` (xoá mềm) |
| `kind` | `preference`, `environment`, `convention`, `lesson`, `project`, `person`, `event`, `fact` — nhãn hiện trên trang 3.1 |
| `trust` | `user-stated` (anh nói), `agent-inferred` (bot suy ra), `external` (từ web/tệp; không bao giờ tự lên lõi) |
| `text` | Nội dung một câu |
| `source` | Phiên và lúc ghi (để mở lại đoạn chat) |
| `revision`, `createdAt`, `updatedAt`, `uses`, `lastUsedAt` | Theo dõi sửa và mức dùng |

**Trần lõi** tính theo ký tự, mỗi bot: ghi chú 2.200, hồ sơ chủ nhân 1.375. Ghi vượt trần thì bị từ chối kèm lời nhắc gộp bớt hoặc hạ xuống lưu trữ. Bot tự gộp; việc gộp hằng đêm làm sau.

**Lưu bền**: storage domain `aris_memory` của dsh (backend JSON ở `$DSH_HOME/storages`, mỗi bản ghi một tệp). Tìm trong lưu trữ ở giai đoạn này là so khớp từ khoá không dấu ngay trong bộ nhớ, đủ cho vài nghìn bản ghi; chuyển sang SQLite FTS5 khi lớn.

## Đưa vào prompt

- **Đoạn hướng dẫn cố định** (`PromptSection`): khi nào lưu, lưu vào cuốn nào, giữ lõi gọn. Nội dung không đổi nên không ảnh hưởng bộ nhớ đệm.
- **Ký ức lõi** (`PromptContext` "aris:memory"): danh sách lõi hiện tại của bot. dsh đưa ngữ cảnh động vào lịch sử thành một tin người dùng có nguồn, và khi nội dung đổi thì thêm bản mới **sau** lịch sử đã đệm. Nhờ vậy ghi ký ức không viết lại đầu prompt; tin kế tiếp đã thấy ký ức mới.

## Công cụ cho model

Một tool `memory` (ít schema hơn bốn tool rời) với `action`:

- `save`: `text`, `kind`, `book`, `tier` (mặc định lõi nếu anh nói "nhớ là…").
- `update`: `id`, `text`.
- `forget`: `id` (xoá mềm).
- `search`: `query` trong lưu trữ.

Ghi xong trả về id và dung lượng còn lại. Mỗi lần ghi để lại bản ghi `plugin:aris/memory-op` trong log phiên.

## Trang 3.1

Host mở đường `/api/aris/memory` qua `ctx.connection.fetch` của dsh: dsh tự kiểm Host/Origin, cookie đăng nhập, và chỉ cho chủ nhân vào.

- `GET ?bot=aris`: trả lõi, lưu trữ, chờ duyệt và dung lượng.
- `POST`: thao tác `update`, `demote`, `promote`, `forget`, `approve`, `discard`.

Đường này chỉ có ở mặt web. Ở mặt ACP hoặc chạy ngầm, tool và prompt vẫn chạy.

## Để sau

- Tự nhắc lưu khi lượt dài.
- Lưu trước khi nén ngữ cảnh.
- Vòng học nền sinh ký ức chờ duyệt (GĐ3).
- Gộp hằng đêm.
- Ký ức riêng theo bot thật (GĐ2).
