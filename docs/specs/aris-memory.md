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

## Tự nhắc lưu

Mỗi lượt chat, plugin ghi lại lời chủ nhân, số lần gọi công cụ và việc bot đã ghi ký ức chưa (`agent/pre-step`, `tools/post-execute`). Đến cuối lượt (`agent/turn-stopping`), nếu chưa ghi gì mà lượt có một trong hai dấu hiệu sau thì cài một lời nhắc dạng "notice" cho **lượt kế tiếp** (`agent.inject`):

- Chủ nhân nói câu có dấu hiệu cần nhớ: "nhớ là", "lần sau", "từ giờ", "đừng bao giờ", "sai rồi", "anh thích"… (so trên chữ đã bỏ dấu).
- Lượt dài: từ 8 lần gọi công cụ trở lên. Khi đó lời nhắc là rút bài học.

Cách này không tốn thêm lần gọi model và bot không phải nói thêm gì ở lượt đang dở. Hai lượt sau một lần nhắc thì không nhắc nữa. Mỗi lần nhắc để lại bản ghi `plugin:aris/memory-nudge` trong log phiên.

## Lưu trước khi nén

Plugin giữ bản chép gần đây của mỗi phiên (lời chủ nhân và câu trả lời của bot, tối đa 400 dòng) qua sự kiện `session/event`. Khi dsh ghi `compaction/summary`:

1. Lấy đúng các dòng có `seq` nằm trong `shadowedSeqs`.
2. Đoạn từ 120 ký tự trở lên thì gọi model (cùng model vừa viết bản tóm tắt), kèm danh sách ký ức hiện có, để rút ra điều đáng nhớ lâu dài dưới dạng JSON.
3. Bỏ những mục gần trùng với ký ức đã có (Jaccard theo từ ≥ 0,6).
4. Cất phần còn lại vào **lưu trữ** với nhãn `agent-inferred`.

Bước này chạy nền nên không giữ khoá nén. Kết quả ghi vào bản ghi `plugin:aris/memory-reflect`, và lần gần nhất hiện ở trường `reflect` của `GET /api/aris/memory`.

Lưu ý: dsh giữ nguyên câu trả lời mới nhất, nên đoạn bị nén thường chỉ gồm lời chủ nhân và các bước giữa. Bản chép nằm trong bộ nhớ của máy chủ, nên khởi động lại thì phần trước đó không được đọc.

## Để sau

- Vòng học nền sinh ký ức chờ duyệt (GĐ3).
- Gộp hằng đêm.
- Ký ức riêng theo bot thật (GĐ2).
