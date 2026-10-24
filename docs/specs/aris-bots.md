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

## Phòng ban và chính sách chung (bước 3a)

Phòng ban là nhóm bot bền có trưởng nhóm, mô tả ngắn và **chính sách chung** áp cho mọi bot thường của phòng (Commander không theo chính sách phòng; bot chưa xếp phòng theo chính sách mặc định). Bot chỉ thuộc một phòng; rời phòng thì thôi làm trưởng nhóm ở đó. Xoá phòng: bot về "chưa xếp phòng", giữ hồ sơ, ký ức, model riêng. Giao diện: trang 2.6 (bản vẽ `PhongBan.dc.html`).

| Chính sách | Áp ở đâu |
|---|---|
| Model mặc định | Bot không đặt model riêng thì chạy model của phòng: khi mở chat với bot, và khi bot được giao việc (`botModel` của `@aris/providers`). |
| Ngân sách mỗi ngày (USD, cả phòng) | `@aris/providers` ghi chi phí từng lần gọi model theo phòng của bot (bảng `spend`). Chạm trần mà chọn "Dừng": bước đầu của lượt nhận một lời báo để bot trả lời đúng một câu "dừng vì phòng hết ngân sách", các bước sau bị từ chối; "Chỉ báo": ghi nhật ký, vẫn chạy. |
| Quyền | `tools/pre-execute`: web (`web_search`, `web_fetch`), ghi tệp (`write`, `edit`, `str_replace_editor` trừ `view`), chạy lệnh (`bash`, `pwsh`, `terminal_open`, `terminal_send`). Công cụ ngoài quyền bị từ chối kèm lý do; ngữ cảnh `aris:bot` nói trước quyền bị tắt để bot không thử. Đọc tệp luôn được; thao tác cần duyệt với bot được giao việc do dsh từ chối sẵn. |

Mặc định: web và ghi tệp, không chạy lệnh, chạm trần thì dừng. Đội mẫu khai `about` và `policy` cho từng phòng (Kỹ thuật, "Sáng tạo · Kỹ thuật" được chạy lệnh); phòng có từ trước bước 3a nhận chính sách theo phòng cùng mã trong đội mẫu khi khởi động. Chưa có: skill dùng chung, vùng Second Brain của phòng.

Chạy thử thật (24/10): Minh (Tăng trưởng, không chạy lệnh) gọi `bash` bị từ chối đúng lời của chính sách và gợi ý nhờ @khoa; chi phí lượt đó ghi vào phòng Tăng trưởng; đặt trần 0 USD thì Minh trả lời một câu "dừng vì phòng Tăng trưởng đã hết ngân sách hôm nay".

## Bot ngoài (bước 4)

Hồ sơ bot có thể kèm `external`: loại agent (`claude-code`, `codex`, `acp`), mức quyền (`EXTERNAL_PERMISSIONS`; mặc định hỏi người dùng: Claude Code `manual`, Codex `ask`; đi đường plugin của dsh thì đổi theo `PLUGIN_PERMISSION`), model (bỏ trống là theo cài đặt của agent trên máy), `timeoutMin` (5–240, mặc định 45), `budgetUsd` (chỉ Claude Code, 0,5–100, mặc định 3), `worktree`, `assignable`, lệnh khởi chạy (ACP). `cleanExternal` kiểm và điền mặc định; sửa một trường giữ các trường khác, đổi loại agent thì mức quyền về mặc định. Đội hình trong `<aris-bot>` ghi bot ngoài kèm loại agent và nhắc: bot ngoài làm việc trọn gói, không vào phòng nhóm, giao lại trong cùng phiên thì làm tiếp việc trước. Bot ngoài không mở được phiên chat riêng (`open` từ chối); bấm vào bot ngoài ở thanh bên mở hồ sơ. Chạy thật ở [aris-commander.md](aris-commander.md#bot-ngoài-bước-4).

## Hồ sơ bot · Skill & tool (bản vẽ 2.2, 2.2c)

Màn hồ sơ bot làm đủ theo bản vẽ 2.2 qua 4 đợt; phần thuộc giai đoạn sau vẫn hiện như bản vẽ nhưng mờ, có nhãn "Giai đoạn N" (thành phần `Later`).

**Kết nối nền tảng (MCP) theo bot** (`mcp.ts`, bảng `mcp` của domain `aris_bots`): mỗi kết nối thuộc một bot, gồm tên, `serverName` (tiền tố công cụ `mcp__<serverName>__…`, duy nhất trong bot), cách chạy (lệnh trên máy hoặc URL), khoá (biến môi trường hoặc header), cách hỏi (`write` hỏi trước khi ghi, mặc định; `always`; `never`), bật/tắt, kết quả kiểm tra gần nhất (danh sách công cụ, công cụ nào chỉ đọc theo `readOnlyHint`).

- Mẫu điền sẵn: GitHub (máy chủ chính thức `https://api.githubcopilot.com/mcp/`, token thành `Authorization: Bearer`), Lark (`npx -y @larksuiteoapi/lark-mcp mcp -a <App ID> -s <App Secret>`), Notion (`npx -y @notionhq/notion-mcp-server`, `NOTION_TOKEN`). "Tự thêm" nhận mọi máy chủ: lệnh (stdio) hoặc URL (HTTP).
- Gắn vào phiên: khi agent của phiên được tạo, hoặc ngay sau khi phiên được gắn bot (chat riêng, thành viên đội khi Aris giao việc), aris nạp plugin `@deepseek-ai/dsh-mcp-client` vào `agent.ctx` cho từng kết nối đang bật. Công cụ chỉ agent đó thấy; bot khác không thấy. Agent tắt thì kết nối đóng theo.
- Kết nối mới có hiệu lực ở phiên mới (giữ prompt cache cho phiên đang dở). Tắt hay gỡ kết nối thì phiên cũ bị chặn gọi công cụ của kết nối đó ngay.
- Hỏi trước khi ghi: `tools/pre-execute` trả `ask` cho công cụ không chỉ đọc (và công cụ chưa có trong lần kiểm tra) → thanh duyệt trên web, thẻ Telegram khi bot được giao việc.
- Khoá lưu trên máy, không bao giờ gửi lại giao diện (`viewOf` chỉ trả tên khoá). Sửa mà để trống khoá là giữ khoá cũ. Nhân bản và xuất bot không mang theo kết nối.
- "Kiểm tra kết nối": mở máy chủ bằng `@modelcontextprotocol/client`, liệt kê công cụ, đóng; lỗi báo bằng lời (thiếu lệnh, khoá sai, không tới được máy chủ). Lần đầu chạy lệnh npx sẽ tải gói về máy.

**Bộ công cụ theo bot** (trường `tools` của bot): tìm và đọc web, đọc tệp (`read`, `read_image`, `glob`, `grep`, `str_replace_editor view`), chạy lệnh terminal. Tắt thì bot bị từ chối kèm lý do. Bot chỉ dùng được khi cả bộ công cụ của bot và chính sách phòng đều cho; phòng không cho thì ô tích bị khoá, ghi "Phòng X không cho". Ghi tệp nằm ở Quyền & kênh. Second Brain (giai đoạn 5), gửi email / tin nhắn ra ngoài (giai đoạn 4), danh sách skill (giai đoạn 3) hiện mờ.

Chạy thử thật (24/10): thêm cho Khoa kết nối "Tự thêm" tới máy chủ thử `packages/aris-bots/test/echo-mcp.mjs` (công cụ `echo` chỉ đọc, `ghi_chu` ghi) → Kiểm tra kết nối báo 2 công cụ; trong phiên mới, Khoa gọi `mcp__echo_thu__echo` chạy luôn, `mcp__echo_thu__ghi_chu` hiện thanh duyệt "Khoa muốn dùng Echo thử · ghi_chu", cho phép thì chạy, biến môi trường tới được máy chủ; Minh (bot khác) không thấy công cụ `mcp__` nào; Aris giao việc cho Khoa thì phiên con của Khoa cũng dùng được kết nối.

## Hồ sơ bot · Quyền & kênh, cột phải (đợt 2)

**Quyền riêng của bot** (trường `perms`, `assignable` của bot; tab Quyền & kênh):

- **Ghi file**: không ghi; chỉ trong thư mục làm việc (`session.header.cwd` của phiên; ngoài đó thì từ chối kèm lý do); mọi nơi (mặc định; ghi ngoài thư mục làm việc thì hỏi người dùng). Áp cho `write`, `edit`, `str_replace_editor` (trừ `view`); lệnh terminal thuộc Bộ công cụ. Phòng không cho ghi thì ô khoá, ghi "Phòng X không cho". Không áp cho Commander.
- **Hành động nguy hiểm**: luôn hỏi người dùng (mặc định) hoặc tự từ chối: mọi `approval/request` của phiên bot trả `rejected` ngay (cả phiên con khi được giao việc, qua bộ duyệt của commander).
- **Commander được giao việc cho bot này** (`assignable`, mặc định có): tắt thì `giao_viec` báo lỗi, đội hình trong lời nhắc ghi "không nhận giao việc từ Commander". Bot ngoài vẫn dùng `external.assignable`.
- Kênh riêng: Telegram như cũ; Lark hiện mờ "Giai đoạn 7".

**Cột phải "Tóm tắt bot"** (`GET /api/aris/bots?profile=<mã bot>`, tải lại 15 giây một lần): trạng thái trực tiếp và việc đang làm; số việc được giao 7 ngày, tỉ lệ hoàn thành (việc giao có kết quả xong / vấp sau đó, theo tên việc), chi phí 7 ngày của riêng bot, mức đầy ký ức lõi (cuốn `notes`); 3 việc Aris giao gần nhất; 3 ký ức mới học. "Skill tự cải tiến" hiện mờ "Giai đoạn 3".

- Việc gần đây lưu bền 8 ngày (tối đa 3.000 mục) thay vì 30 mục; thanh bên và cột phải phiên vẫn chỉ đọc 30 mục mới nhất.
- Sổ chi phí (`@aris/providers`) ghi thêm phạm vi `bot:<mã bot>` cho mỗi lần gọi model (trước chỉ ghi theo phòng ban); `arisSpend.botWeek(bot)`. Chi phí trước lúc có bản này không chia được theo bot.

Chạy thử thật (24/10): đặt Khoa "chỉ trong thư mục làm việc", nhờ Khoa dùng `write` ghi `/tmp/…` → bị chặn đúng lời "chỉ cho ghi trong thư mục làm việc /Users/…/aris/workspace", Khoa dừng không lách; cột phải của Khoa: 2 việc 7 ngày, hoàn thành 100%, hai tên việc gần nhất.

## Nhân bản, xuất, nhập (bản vẽ 2.4)

Hộp "Nhân bản / xuất" trên hồ sơ bot (`portable.ts`). Luôn chép vai trò, mô tả, linh vật; bot ngoài luôn giữ cấu hình bot ngoài (đó là loại bot). Chọn thêm:

- **Cấu hình và model**: model riêng, phòng ban.
- **Tính cách (SOUL)**.
- **Ký ức riêng của bot**: cuốn `notes` (ký ức đang dùng, giữ tầng lõi / lưu trữ; lõi đầy thì xuống lưu trữ), chép một lần qua dịch vụ `arisMemory` của `@aris/memory`. Hồ sơ người dùng dùng chung cả đội nên không chép.

Không bao giờ chép: kênh nhắn tin (token Telegram), khoá API (mọi bot dùng chung kho khoá của aris), lịch sử chat. Skill để giai đoạn 3 (bot chưa có skill riêng), ô hiện mờ.

Nhân bản: tên mới (mặc định "Tên 2"), tên gọi sinh từ tên (bỏ dấu, trùng thì `-2`, `-3`…), xong mở hồ sơ bot mới. Xuất: tệp `<tên gọi>.aris-bot.json` (`format: "aris-bot"`, `version: 1`, phòng ban ghi bằng **tên** vì mã phòng khác nhau giữa các máy, không có mã bot). Nhập: nút "Nhập từ tệp…" ở chân hộp Tạo bot; tên gọi trùng thì đổi, phòng ban khớp theo tên nếu máy này có, ký ức trong tệp nạp vào bot mới. Tệp sai dạng thì báo bằng lời.

Chạy thử thật (24/10): nhân bản Minh thành "Minh Thử" (@minh-thu) kèm ký ức → cùng phòng Tăng trưởng, tính cách, linh vật, 1 mục ký ức dự án; xuất "Minh Thử" rồi nhập lại → @minh-thu-2, phòng khớp theo tên, 1 mục ký ức; tệp lạ bị từ chối. Hai bot thử đã xoá.

## Đường máy chủ

`/api/aris/bots`: `GET` trả bot, phòng ban, danh sách mẫu, chi phí hôm nay theo phòng (`spend`). `POST` với `op`:

| `op` | Việc |
|---|---|
| `create` `{ bot }` | Tạo bot |
| `update` `{ id, patch }` | Sửa bot (không đổi `id`, `kind`) |
| `delete` `{ id }` | Xoá bot (không xoá Commander; ký ức và phiên cũ giữ nguyên) |
| `department` `{ department }` | Sửa phòng ban theo `id` (tên, mô tả, trưởng nhóm, `policy` chỉ các trường gửi lên) hoặc tạo theo mã cho trước |
| `department-create` `{ department }` | Phòng mới: mã sinh từ tên, bot chọn rời phòng cũ, trưởng nhóm trong phòng, chép chính sách từ phòng khác |
| `department-delete` `{ id }` | Xoá phòng, bot về chưa xếp phòng |
| `move` `{ id, department }` | Chuyển bot sang phòng khác (`null`: chưa xếp phòng) |
| `apply-template` `{ template }` | Áp đội mẫu |
| `open` `{ id }` | Tạo phiên chat thẳng với bot, trả `sessionId` |
| `mcp-test` `{ bot, id?, input }` | Kiểm tra kết nối chưa lưu (khoá để trống khi sửa thì dùng khoá đã lưu), trả `check` |
| `mcp-add` `{ bot, input }`, `mcp-update` `{ id, input }`, `mcp-check` `{ id }`, `mcp-delete` `{ id }` | Thêm, sửa (bật/tắt không kiểm tra lại), kiểm tra lại, gỡ kết nối; `GET` trả `mcp` (không có giá trị khoá) |
| `commander-latest` `{ candidates }` | Bấm Aris trên thanh bên: trả `sessionId` là ứng viên đầu tiên (phiên chat riêng, mới nhất trước) chưa gắn bot nào, không có thì `null` (thanh bên mở phiên mới) |
| `clone` `{ id, name, parts }` | Nhân bản; `parts` = `{ config, soul, memory }`; trả thêm `created`, `memory` (số mục ký ức đã chép) |
| `export` `{ id, parts }` | Trả `file` (tệp `aris-bot`) |
| `import` `{ file }` | Tạo bot từ tệp; trả `created`, `memory` |

## Giao diện (bước 1)

Thanh bên Đội hình, cột phải (sơ đồ đội 3D), Bản đồ đội, trang phòng ban, Hồ sơ bot (2.2), Tạo bot (2.1) đọc dữ liệu thật; gỡ `DEMO_TEAM`. Trạng thái trực tiếp (đang làm, chờ anh…) và việc gần đây là bước 2.
