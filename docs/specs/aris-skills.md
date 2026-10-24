# Đặc tả `aris-skills` — skill tự tạo và tự vá (giai đoạn 3, đợt 3)

> Viết lại bằng lời của aris từ [tinh-nang-aris.md](../tinh-nang-aris.md) mục C2 và kế hoạch giai đoạn 3. Kiểm thử bằng chạy lại phiên cũ, dọn kho, ghim là đợt 4.

## Mục tiêu

- Sau việc khó, bot đề xuất một skill (`SKILL.md`) của riêng nó: cách làm dùng lại được cho lần sau.
- Người dùng sửa kết quả của một việc đã có skill (ví dụ sửa định dạng báo cáo) thì bot đề xuất bản vá cho skill đó.
- Không skill nào tự có hiệu lực: mỗi bản mới chờ duyệt ở Hộp duyệt (3.4), thẻ Telegram (7.3) hoặc màn chi tiết (3.3); quá 7 ngày thì tự bỏ.
- Mỗi bot chỉ thấy skill của mình.

## Dữ liệu

Kho `aris_skills`, hai bảng:

- `skills`: một dòng mỗi skill của một bot: `bot`, `name` (chữ thường không dấu, nối bằng `-`), `description`, `whenToUse`, `status` (`draft`: chưa có bản nào được duyệt; `active`; `rejected`), `version` (bản đang dùng, 0 khi chưa có), `uses`, `lastUsedAt`.
- `versions`: mỗi bản một dòng: số bản, `body` (Markdown), `description`, `whenToUse`, `status` (`proposed`, `active`, `superseded`, `rejected`), `by` (`reflect`, `user`, `restore`), `why`, `quote`, `sessionId`, cảnh báo của bộ kiểm, lúc tạo và lúc trả lời (`review`: ai, khi nào).

Vòng đời một bản: **đề xuất** → duyệt thì **đang dùng** (bản cũ thành `superseded`) hoặc **bị từ chối**. Khôi phục bản cũ tạo một bản mới (`by: restore`) và dùng ngay. Bước "ứng viên" (đã qua kiểm thử) thêm ở đợt 4.

## Bộ kiểm "bài học, không phải nhật ký"

Chạy khi vòng học đề xuất và khi người dùng sửa:

- Lỗi (bỏ đề xuất): tên sai dạng, thân rỗng hoặc quá 6.000 ký tự, mô tả rỗng.
- Cảnh báo (vẫn giữ, hiện cho người dùng): có ngày cụ thể hoặc "hôm nay, hôm qua, vừa rồi, lần này"; kể lại việc đã làm ("bot đã…", "đã gửi…") nhiều hơn chỉ dẫn; không có mục các bước; nhắc người dùng bằng "anh, chị, chủ nhân" thay vì "người dùng".

## Vòng học đề xuất

Mỗi lần học (gói `@aris/reflect`), model nhận thêm danh sách skill đang dùng của bot (tên, mô tả, thân của skill vừa dùng trong đoạn học) và có thể trả **tối đa một** `skill`:

- `name`, `description`, `whenToUse`, `body` (Markdown: "Khi nào dùng", "Các bước", "Lỗi thường gặp"), `why`, `quote`.
- Trùng tên skill đang có của bot thì là **bản vá** (bản kế tiếp), không thì skill mới.
- Chỉ đề xuất khi đoạn học là việc nhiều bước làm lại được, hoặc người dùng sửa kết quả của việc đã dùng skill. Việc một lần, chuyện trò thì không.

## Nạp skill cho bot

Khi agent được tạo, aris gắn một nguồn skill vào phạm vi của agent đó (`ctx.skills.registerProvider` trong một plugin con mount ở `agent.ctx`). Nguồn liệt kê bản đang dùng của các skill thuộc bot của phiên (tính lại mỗi lần, nên phiên đổi bot vẫn đúng), dsh hiện chúng trong danh mục skill của phiên và nạp thân bằng công cụ `skill`. Duyệt, từ chối, khôi phục đều báo các nguồn làm mới danh mục. Mỗi lần công cụ `skill` nạp một skill của aris thì cộng `uses`.

## Duyệt

- **Hộp duyệt (3.4)**: loại "Skill": skill nào, bot nào, bản mới hay bản vá, vì sao, số dòng thêm/bớt; Duyệt và bật / Mở chi tiết / Từ chối.
- **Telegram (7.3)**: thẻ "ĐỀ XUẤT SKILL · <bot>": bật `<tên>` vN?, vì sao, nút Bật / Không. Trả lời nơi khác hay hết hạn thì thẻ được sửa.
- **Màn 3.3**: thay đổi so với bản đang dùng (từng dòng thêm/bớt), lý do kèm lối mở đoạn chat, cảnh báo của bộ kiểm; Từ chối / Sửa rồi bật / Duyệt và bật; lịch sử các bản với khôi phục. Chỉ số kiểm thử và ca thử để mờ (đợt 4).
- **Màn 3.2**: danh sách skill của mọi bot, lọc Tất cả / Chờ duyệt / Đang dùng (Ít dùng, Lưu kho, Đã ghim mờ, đợt 4), cột bot, bản (`v2 → v3` khi có bản vá chờ), trạng thái, số lần dùng, cập nhật; "Thành công" để đợt 4.

## API

- `GET /api/aris/skills`: mọi skill (kèm bản đề xuất đang chờ). `?pending=all`: các bản chờ duyệt. `?id=<bot>/<tên>`: một skill, các bản, so sánh bản chờ với bản đang dùng.
- `POST`: `op` = `approve` (`version`, `body?` khi sửa rồi bật), `reject` (`version`), `restore` (`version`).

## Để sau (đợt 4)

Kiểm thử bằng chạy lại phiên cũ (ứng viên, số bước, token), dọn kho (ít dùng, lưu kho), ghim, sao lưu, "Học skill từ tài liệu…".
