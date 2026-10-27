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

**Trình duyệt tự động** (giai đoạn 4, đợt 5; dsh bản ghim không có gói trình duyệt): mẫu kết nối "Trình duyệt" chạy máy chủ MCP Playwright (`npx @playwright/mcp` bản ghim, chạy ẩn, hồ sơ trình duyệt riêng mỗi lần), không cần khoá. Công cụ đọc (mở trang, đọc cấu trúc trang, chụp màn hình, đợi, xem tab) theo `readOnlyHint` của máy chủ thì dùng luôn, cộng các công cụ xem máy chủ không đánh dấu (mở trang, quay lại, tab, đóng, đổi cỡ, rê chuột) mà aris coi như chỉ đọc vì rủi ro ngang `web_fetch`; công cụ có hiệu ứng (bấm, gõ, điền biểu mẫu, chọn, tải tệp lên, chạy mã trên trang) hỏi người dùng theo cách hỏi `write` mặc định. Routine chỉ đọc cũng dùng được công cụ đọc của kết nối MCP. Tệp chụp trang ghi vào thư mục tạm của hệ thống (`aris-browser/<tên kết nối>`), không vào thư mục làm việc của bot. Lần kiểm tra đầu tải gói về máy (cần người dùng đồng ý); dùng Chrome đã cài.

- Mẫu điền sẵn: GitHub (máy chủ chính thức `https://api.githubcopilot.com/mcp/`, token thành `Authorization: Bearer`), Lark (`npx -y @larksuiteoapi/lark-mcp mcp -a <App ID> -s <App Secret>`), Notion (`npx -y @notionhq/notion-mcp-server`, `NOTION_TOKEN`). "Tự thêm" nhận mọi máy chủ: lệnh (stdio) hoặc URL (HTTP).
- Gắn vào phiên: khi agent của phiên được tạo, hoặc ngay sau khi phiên được gắn bot (chat riêng, thành viên đội khi Aris giao việc), aris nạp plugin `@deepseek-ai/dsh-mcp-client` vào `agent.ctx` cho từng kết nối đang bật. Công cụ chỉ agent đó thấy; bot khác không thấy. Agent tắt thì kết nối đóng theo.
- Kết nối mới có hiệu lực ở phiên mới (giữ prompt cache cho phiên đang dở). Tắt hay gỡ kết nối thì phiên cũ bị chặn gọi công cụ của kết nối đó ngay.
- Hỏi trước khi ghi: `tools/pre-execute` trả `ask` cho công cụ không chỉ đọc (và công cụ chưa có trong lần kiểm tra) → thanh duyệt trên web, thẻ Telegram khi bot được giao việc.
- Khoá lưu trên máy, không bao giờ gửi lại giao diện (`viewOf` chỉ trả tên khoá). Sửa mà để trống khoá là giữ khoá cũ. Nhân bản và xuất bot không mang theo kết nối.
- "Kiểm tra kết nối": mở máy chủ bằng `@modelcontextprotocol/client`, liệt kê công cụ, đóng; lỗi báo bằng lời (thiếu lệnh, khoá sai, không tới được máy chủ). Lần đầu chạy lệnh npx sẽ tải gói về máy.

**Bộ công cụ theo bot** (trường `tools` của bot): tìm và đọc web, đọc tệp (`read`, `read_image`, `glob`, `grep`, `str_replace_editor view`), chạy lệnh terminal. Tắt thì bot bị từ chối kèm lý do. Bot chỉ dùng được khi cả bộ công cụ của bot và chính sách phòng đều cho; phòng không cho thì ô tích bị khoá, ghi "Phòng X không cho". Ghi tệp nằm ở Quyền & kênh. Second Brain (giai đoạn 5), gửi email / tin nhắn ra ngoài (giai đoạn 4), danh sách skill (giai đoạn 3) hiện mờ.

Chạy thử thật (24/10): thêm cho Khoa kết nối "Tự thêm" tới máy chủ thử `packages/aris-bots/test/echo-mcp.mjs` (công cụ `echo` chỉ đọc, `ghi_chu` ghi) → Kiểm tra kết nối báo 2 công cụ; trong phiên mới, Khoa gọi `mcp__echo_thu__echo` chạy luôn, `mcp__echo_thu__ghi_chu` hiện thanh duyệt "Khoa muốn dùng Echo thử · ghi_chu", cho phép thì chạy, biến môi trường tới được máy chủ; Minh (bot khác) không thấy công cụ `mcp__` nào; Aris giao việc cho Khoa thì phiên con của Khoa cũng dùng được kết nối.

## Kết nối dùng chung của đội (giai đoạn 8, plan 8.1 phần B; bản vẽ 6.7, 6.7b, 2.2d)

Kết nối MCP cấu hình một lần, nhiều bot dùng chung. Làm trên `mcp.ts` và `mcp-import.ts`.

- **Bản ghi:** kết nối của đội là một `McpRecord` có `bot = '_doi'` (`TEAM_OWNER`) và `scope = { bots: 'all' | string[], departments?: string[] }`. Dữ liệu cũ không có `scope` vẫn là kết nối riêng của bot. Tên máy chủ có tiền tố `doi-` (kết nối riêng chỉ dùng `_`) nên công cụ `mcp__doi-<tên>__…` không đụng kết nối riêng cùng tên. Khoá lưu cùng bảng với kết nối riêng, giao diện chỉ thấy tên khoá.
- **Bot nào dùng:** `McpStore.forBot(bot)` = kết nối riêng của bot + kết nối của đội trong phạm vi (đúng mã bot, thuộc phòng đã chọn kể cả bot tạo sau, hay `'all'`) mà bot chưa tắt (`off`). Dùng cho cả lúc gắn máy chủ vào agent của phiên (`attach`) và lúc hàng rào hỏi duyệt (`tools/pre-execute`). Có hiệu lực ở phiên mới.
- **Mức hỏi:** mức chung `ask` của kết nối; mỗi bot đặt thêm được `botAsk[bot]` nhưng chỉ chặt hơn (`never` < `write` < `always`). Mức nới hơn bị bỏ. `needsAsk(rec, tool, bot)` dùng mức chặt hơn của hai mức.
- **Đường máy chủ** (`POST /api/aris/bots`): `mcp-team-add { input, scope }`, `mcp-team-scope { id, scope }`, `mcp-team-bot { id, bot, off?, ask? }`; `mcp-update`, `mcp-check`, `mcp-delete` dùng chung với kết nối riêng.
- **Nhập từ Claude Code và Codex:** `mcp-import-scan` đọc `~/.claude.json` (gốc và từng dự án), `~/.claude/settings.json` và `~/.codex/config.toml` (bảng `[mcp_servers.*]`, bộ đọc TOML tự viết). Bỏ máy chủ tắt (`enabled = false`, `disabled`), máy chủ chỉ chạy trong ứng dụng bên thứ ba (đường dẫn `/Applications/ChatGPT.app`, `Codex Computer Use.app`), kiểu SSE cũ và lệnh dùng đường dẫn tương đối. Kết quả giữ 15 phút trong bộ nhớ theo `scanId`; giá trị khoá không bao giờ gửi giao diện (chỉ `secretKeys`). `mcp-import { scanId, keys, scope, ask }` tạo kết nối của đội (kèm `from: 'codex' | 'claude-code'` để hiện nhãn) rồi kiểm tra từng cái. Tối đa 30 máy chủ mỗi lần.
- **Chưa làm:** khoá MCP vẫn nằm trong bảng của aris, chưa vào Keychain (nút "Chuyển cả vào Keychain" của 7a chỉ chuyển khoá API của provider). Đăng nhập OAuth cho máy chủ hosted (HeyGen, Notion…) thuộc plan 8.5. Bot ngoài (Claude Code, Codex) không có phiên dsh nên không dùng kết nối của đội.
- **Giao diện:** Cài đặt › Kết nối (`settings/Connections.tsx`, nhóm "Mở rộng"), hộp nhập (`team/McpImport.tsx`), chọn phạm vi (`team/ScopePicker.tsx`), hộp Thêm kết nối có chế độ đội (`McpDialog` với `team=1`), thẻ "Dùng chung từ đội" trong tab Skill & tool của hồ sơ bot (tắt riêng, mức hỏi chặt hơn).
- **Chạy thử thật (26/10):** quét máy người dùng thấy 2 máy chủ dùng được (lark-base, heygen từ Codex), bỏ qua 2 (computer-use đang tắt, node_repl chỉ chạy trong ChatGPT); nhập heygen cho Minh và Khoa + phòng Kỹ thuật, kết nối báo lỗi đúng thực tế (HeyGen đòi token OAuth). Thêm máy chủ thử `echo` chỉ cho Khoa: Khoa gọi được `mcp__doi-echo_thu__echo`, Minh trả lời không có công cụ đó.

## Danh mục connector và đăng nhập OAuth (giai đoạn 8, plan 8.5; bản vẽ `DanhMucConnector.dc.html`, 6.4)

**Danh mục** (`src/catalog.ts`): mỗi mục có `id`, `name`, `category`, `vendor`, `official`, `status` (`verified` / `unverified`), cách chạy (`transport` và `url`, hay `command` + `args` ghim phiên bản), `auth` (`oauth` / `token` / `none`), `keys`, `needsClient`, `docs`, `writes`, `defaultAsk` (mặc định `write`), `notes`. Kiểm ngày 27/10/2026:

| Mục | Địa chỉ | Đăng nhập | Ghi chú |
|---|---|---|---|
| Notion | `https://mcp.notion.com/mcp` | OAuth, aris tự đăng ký client | đã kiểm |
| HubSpot | `https://mcp.hubspot.com` | OAuth, cần Client ID / Secret của "MCP auth app" | đã kiểm |
| Canva | `https://mcp.canva.com/mcp` | OAuth, cần Client ID / Secret (Developer Portal) | đã kiểm |
| Meta Ads | `https://mcp.facebook.com/ads` | OAuth, cần ứng dụng Meta riêng (Meta từ chối đăng ký tự động) | beta, đã kiểm |
| Google Workspace | người dùng điền (mỗi sản phẩm một máy chủ) | OAuth, cần OAuth client của dự án Google Cloud | **chưa kiểm được địa chỉ** |
| Slack, Atlassian, Figma, HighLevel, HeyGen, Rainmaker | có hay không có địa chỉ | xem từng mục | `unverified`, để đợt sau |

Bốn mẫu cũ (GitHub, Lark, Notion trên máy, Trình duyệt) là các mục có `preset`; kết nối đã lưu theo mẫu cũ đọc như trước. Gói `npx` ghim phiên bản: `@larksuiteoapi/lark-mcp@0.5.1`, `@notionhq/notion-mcp-server@2.5.2`, `@playwright/mcp@0.0.83` (kết nối Lark, Notion đã lưu từ trước vẫn giữ lệnh cũ chưa ghim cho tới khi sửa).

**Kết nối dựng từ danh mục**: bản ghi có `catalog` (mã mục), `preset: 'custom'`; cách chạy lấy từ mục, người dùng chỉ nhập khoá, địa chỉ (nếu mục không có) và phạm vi, mức hỏi như kết nối dùng chung (8.1 phần B). Khoá token (HighLevel…) đổi thành header theo mục. Client ID / Secret nằm trong `secrets` của bản ghi như khoá của các kết nối khác, **không bao giờ** gửi làm header.

**OAuth** (`src/mcp-oauth.ts`), theo đặc tả uỷ quyền của MCP, dùng hàm `auth` của `@modelcontextprotocol/client@2.2.0`: tìm metadata tài nguyên và máy chủ uỷ quyền, đăng ký client động khi không có Client ID, PKCE S256, `state` ngẫu nhiên dùng một lần, hết hạn sau 10 phút, làm mới token khi còn dưới 60 giây.
- Gọi về: `GET /api/aris/mcp/oauth/callback` trên web aris (cùng cổng với dsh). Hãng không nhận địa chỉ `127.0.0.1` thì lời báo nói rõ phải thêm địa chỉ gọi về vào ứng dụng ở hãng; giao diện hiện địa chỉ này ở mục cần Client ID.
- Token và thông tin client đăng ký động: kho khoá, tên `MCP_<mã kết nối>_OAUTH`, JSON. Bảng kết nối chỉ giữ trạng thái `oauth: { state: 'ok' | 'login', at, error? }`. Gỡ kết nối thì xoá luôn khoá này.
- **Cách truyền token**: `@deepseek-ai/dsh-mcp-client` 0.2.1-rc.2 không nhận `authProvider`, chỉ nhận `headers` cố định, nên aris làm mới token mỗi lần gắn kết nối vào phiên mới hay kiểm tra, rồi truyền `Authorization: Bearer`. Phiên đang mở rất lâu có thể gặp token hết hạn giữa chừng tới khi mở phiên mới (giới hạn đã biết).
- Chưa có token, làm mới không được, hay máy chủ trả 401: kết nối chuyển "Cần đăng nhập lại", không gắn vào phiên, và báo chủ qua Telegram một lần mỗi lần chuyển.

**API** (`/api/aris/bots`): ảnh chụp có thêm `connectors` (danh mục, bỏ hàm); `mcp-team-add` nhận `input.catalog`; kết nối OAuth mới thì chưa kiểm tra (chờ đăng nhập); `mcp-oauth-start { id }` trả `{ authUrl }` hay `{ authorized: true }`; `mcp-delete` xoá cả token OAuth.

**Giao diện**: Cài đặt › Kết nối › "+ Kết nối" mở hộp `mcp-catalog`: ô tìm, tab nhóm, thẻ có logo chữ, pill "Chính thức" / "Chưa kiểm" / "Có ghi". Bấm thẻ: ô khoá (`type=password`), địa chỉ gọi về, phạm vi, mức hỏi, rồi "Đăng nhập <hãng>" (mở cửa sổ ngay khi bấm để không bị chặn, đọc lại trạng thái 3 giây một lần) hay "Kiểm tra". Thẻ mẫu cũ mở hộp `mcp-add` có điền sẵn mẫu. Danh sách kết nối của đội hiện "cần đăng nhập lại" kèm nút Đăng nhập. Hồ sơ bot hiện các kết nối bot dùng được như ở 8.1.

**Chưa làm**: Connector API cho dịch vụ không có MCP (mục 4 của plan, Điểm dừng 3); tải gói `npx` lần đầu chưa có bước hỏi riêng cho mục mới.

## Hồ sơ bot · Quyền & kênh, cột phải (đợt 2)

**Quyền riêng của bot** (trường `perms`, `assignable` của bot; tab Quyền & kênh):

- **Ghi file**: không ghi; chỉ trong thư mục làm việc (`session.header.cwd` của phiên; ngoài đó thì từ chối kèm lý do); mọi nơi (mặc định; ghi ngoài thư mục làm việc thì hỏi người dùng). Áp cho `write`, `edit`, `str_replace_editor` (trừ `view`); lệnh terminal thuộc Bộ công cụ. Phòng không cho ghi thì ô khoá, ghi "Phòng X không cho". Không áp cho Commander.
- **Hành động nguy hiểm**: luôn hỏi người dùng (mặc định) hoặc tự từ chối: mọi `approval/request` của phiên bot trả `rejected` ngay (cả phiên con khi được giao việc, qua bộ duyệt của commander).
- **Commander được giao việc cho bot này** (`assignable`, mặc định có): tắt thì `giao_viec` báo lỗi, đội hình trong lời nhắc ghi "không nhận giao việc từ Commander". Bot ngoài vẫn dùng `external.assignable`.
- Kênh riêng: Telegram như cũ; Lark hiện mờ "Giai đoạn 7".

**Cột phải "Tóm tắt bot"** (vẽ lại theo bản vẽ 2.2d, phương án A: thẻ đầu tô theo màu linh vật có tên, vai, phòng, trạng thái và việc đang làm; 4 ô chỉ số không viền có dòng phụ; việc Aris giao gần đây có dấu ✓ / ! / • theo kết quả và ngày; học gần đây dạng dòng thời gian) (`GET /api/aris/bots?profile=<mã bot>`, tải lại 15 giây một lần): trạng thái trực tiếp và việc đang làm; số việc được giao 7 ngày, tỉ lệ hoàn thành (việc giao có kết quả xong / vấp sau đó, theo tên việc), chi phí 7 ngày của riêng bot, mức đầy ký ức lõi (cuốn `notes`); 3 việc Aris giao gần nhất; 3 ký ức mới học. "Skill tự cải tiến" hiện mờ "Giai đoạn 3".

- Việc gần đây lưu bền 8 ngày (tối đa 3.000 mục) thay vì 30 mục; thanh bên và cột phải phiên vẫn chỉ đọc 30 mục mới nhất.
- Sổ chi phí (`@aris/providers`) ghi thêm phạm vi `bot:<mã bot>` cho mỗi lần gọi model (trước chỉ ghi theo phòng ban); `arisSpend.botWeek(bot)`. Chi phí trước lúc có bản này không chia được theo bot.

Chạy thử thật (24/10): đặt Khoa "chỉ trong thư mục làm việc", nhờ Khoa dùng `write` ghi `/tmp/…` → bị chặn đúng lời "chỉ cho ghi trong thư mục làm việc /Users/…/aris/workspace", Khoa dừng không lách; cột phải của Khoa: 2 việc 7 ngày, hoàn thành 100%, hai tên việc gần nhất.

## Hồ sơ bot · Model theo việc (đợt 3)

Tab Model theo bản vẽ 2.2, trường `models` của bot:

- **Chat và làm việc**: model riêng của bot (`model`) như cũ; áp cho phiên chat mới với bot và việc Aris giao cho bot, không đặt thì theo model mặc định của phòng.
- **Suy luận sâu (khi /goal)** (`models.goal`): khi phiên của bot có mục tiêu `/goal` ở trạng thái `active` (dịch vụ `goals` của dsh), router của `@aris/providers` đổi lần gọi sang model này (thắng model riêng). dsh ghi model vừa dùng thành model của phiên, nên router nhớ model trước `/goal` và trả về khi mục tiêu không còn chạy (nhớ trong bộ nhớ: khởi động lại giữa chừng thì phiên giữ model `/goal`, chọn lại ở ô model).
- **Vòng học nền**: giai đoạn 3, hiện mờ "theo cài đặt chung".
- **Dự phòng khi lỗi** (`models.fallback`): model lỗi (hết tiền, sập…) thì thử model này trước, rồi tới chuỗi dự phòng chung.
- Nhân bản / xuất với "Cấu hình và model" mang theo model theo việc, bộ công cụ, quyền riêng.
- Ô chọn trong dòng thẻ (`.a-row`) và dòng model (`.ap-taskrow`) xuống dòng khi hẹp, không còn đè nhãn.

Chạy thử thật (24/10): đặt model `/goal` của Minh là DeepSeek-V4-Pro, chạy `/goal` ngắn trong phiên mới của Minh → sổ chi phí ghi các lần gọi DeepSeek-V4-Pro, Flash không tăng; tin thường sau đó dùng lại DeepSeek-V4.1-Flash, ô model của phiên về Flash. Lần thử đầu lộ hai lỗi đã sửa: tên dịch vụ là `goals` (không phải `goal`), và phiên bị giữ model `/goal` sau khi mục tiêu xong.

## Hồ sơ bot · Tính cách (đợt 4)

Tab Tính cách theo bản vẽ 2.2: thẻ "Tính cách (SOUL)" có dòng "đứng đầu prompt · sửa lần cuối · phiên bản N", ô sửa, nút Lịch sử phiên bản, Nhờ Aris viết lại, Lưu, ghi chú hiệu lực ở phiên mới. Các trường hồ sơ (tên, tên gọi, vai, phòng, việc của bot, linh vật, xoá bot) nằm dưới, mục "Hồ sơ bot", nút Lưu riêng.

- **Lịch sử** (`soul.ts`, bảng `souls` của domain `aris_bots`, khoá `<bot>-v<n>`): mỗi lần SOUL đổi (op `update` có `soul`) ghi một phiên bản kèm ai đổi (`user`, `aris` khi lưu bản Aris viết, `restore` khi khôi phục từ phiên bản cũ, `create` cho bản lúc tạo bot). Bot chưa có lịch sử thì lần đổi đầu ghi bản cũ thành phiên bản 1. Snapshot gửi `soulMeta` (phiên bản, lần sửa cuối) của mỗi bot. Xoá bot thì xoá lịch sử.
- **Khôi phục** (op `soul-restore`): đặt lại SOUL bằng phiên bản cũ, ghi thành phiên bản mới.
- **Nhờ Aris viết lại** (op `soul-rewrite` `{ id, wish, draft }`): gọi `llm.stream` với model của Commander (không đặt thì model mặc định của dsh, cuối cùng là model vừa dùng), lời nhắc có vai trò, việc của bot, bản đang sửa, mong muốn (có gợi ý nhanh: ngắn gọn, thân thiện, nghiêm túc, luôn ghi nguồn); không viết cứng cách xưng hô. Câu trả lời được làm sạch (bỏ khối mã, lời dẫn, đầu dòng). Bản đề xuất hiện cạnh bản hiện tại; "Dùng bản này" chỉ điền vào ô sửa, bấm Lưu mới lưu (ghi là Aris viết).

Chạy thử thật (24/10): nhờ Aris viết lại tính cách Minh "ngắn gọn hơn" → bản 7 câu đúng vai nghiên cứu; Dùng bản này → Lưu → phiên bản 2 "Aris viết"; Lịch sử → khôi phục phiên bản 1 → Minh về bản gốc, thành phiên bản 3. Lần thử đầu lộ lỗi đã sửa: sau khi khởi động lại chưa có tin nhắn nào thì không biết dùng model nào (nay lấy model mặc định của dsh).

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
