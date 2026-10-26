# Plan 8.1 · Kho skill từ GitHub, nhập skill từ Claude Code và Codex, kết nối dùng chung

Đọc trước `docs/plans/gd8-chung.md`: luật chung, cách vẽ, cách đăng nhập, phần kiểm tra.

Plan này trả lời hai câu đầu trong `docs/Check xem đã làm chưa.md`. Làm xong thì ghi câu trả lời vào tệp đó.

## Hiện trạng (Opus đã đọc mã)

**Skill**
- Skill nằm trong `@aris/skills` (`packages/aris-skills/src/`), mỗi bot có kho riêng. `SkillRecord` có `id`, `bot`, `name`, `description`, `whenToUse`, `status` và `version`. Mỗi bản là một `VersionRecord` với `body` (Markdown), `status` (`proposed` / `active` / `superseded` / `rejected`), `by` (`reflect` / `user` / `restore`) và `warnings`.
- `SkillStore.propose(input)` (`store.ts`, khoảng dòng 179) tạo bản đề xuất chờ duyệt. Nó chạy `lintSkill` trước: có lỗi thì ném lỗi, có cảnh báo thì lưu vào `warnings`.
- Đề xuất được duyệt ở Hộp duyệt (`mind/Approvals.tsx`), trang skill (`mind/Skills.tsx`, `mind/Skill.tsx`) và Telegram. API là `/api/aris/skills`, khai báo trong `index.ts` khoảng dòng 661.
- Chưa có cách nhập skill từ bên ngoài.

**Định dạng skill của Claude Code và Codex trên máy người dùng**
- Claude Code để skill ở `~/.claude/skills/<tên>/SKILL.md`, và trong plugin ở `~/.claude/plugins/**/skills/<tên>/SKILL.md`.
- Codex để skill ở `~/.codex/skills/<tên>/SKILL.md`.
- Tệp `SKILL.md` có frontmatter YAML: bắt buộc có `name` và `description`, ngoài ra có thể có `metadata` và các trường khác. Phần còn lại là Markdown. Cùng thư mục có thể có tệp kèm: `references/*.md`, `scripts/*`, ảnh…

**Kết nối (MCP)**
- Kết nối nằm trong `packages/aris-bots/src/mcp.ts`. Mỗi bot có máy chủ MCP riêng (`McpRecord.bot`), với các mẫu `github`, `lark`, `notion`, `browser` và `custom`. Khoá lưu trong `secrets`, giao diện chỉ thấy tên khoá. Kết nối gắn vào agent của phiên bot, nên chỉ bot đó thấy công cụ.
- Giao diện ở `team/BotTools.tsx` (hồ sơ bot, phần Skill & tool) và `settings/Integrations.tsx`.
- **Còn thiếu:**
  - Muốn năm bot cùng dùng GitHub thì phải cấu hình năm lần;
  - Chưa có cách nhập máy chủ MCP mà người dùng đã cấu hình sẵn trong Claude Code và Codex.

## Phần A · Nhập skill

### A1. Nguồn

1. **GitHub.** Người dùng dán đường dẫn theo một trong các dạng:
   - `https://github.com/<chủ>/<repo>`;
   - `.../tree/<nhánh hay tag>/<thư mục>`;
   - `.../blob/<ref>/<đường>/SKILL.md`.

   Cách tải:
   - Tải bản nén bằng `fetch` từ `https://codeload.github.com/<chủ>/<repo>/tar.gz/<ref>`. Không cần cài `git`.
   - Ghim mã commit (sha) bằng `GET https://api.github.com/repos/<chủ>/<repo>/commits/<ref>`. API này không cần khoá nhưng giới hạn 60 lần mỗi giờ.
   - Bung bằng `tar -xzf` (bsdtar có sẵn trên macOS) vào một **thư mục tạm mới, trống**, nằm dưới `~/.aris/tmp/skill-import-<id>/`.

   Giới hạn để an toàn:
   - bản nén tối đa 20 MB, tối đa 5.000 tệp sau khi bung;
   - bỏ symlink, bỏ đường dẫn có `..`;
   - **không chạy bất kỳ tệp nào** trong thư mục đã tải.

   Tìm `SKILL.md` sâu tối đa 5 cấp, bỏ `node_modules` và `.git`. Xong thì xoá thư mục tạm.
2. **Claude Code:** quét `~/.claude/skills/*/SKILL.md` và `~/.claude/plugins/**/skills/*/SKILL.md` (bỏ các thư mục `cache` trùng lặp).
3. **Codex:** quét `~/.codex/skills/*/SKILL.md`.
4. **Thư mục khác:** người dùng dán một đường dẫn tuyệt đối trên máy.

Viết một gói mới `@aris/skill-import`, hoặc thư mục `import/` trong `aris-skills`; chọn theo khuôn repo. Gồm các hàm thuần:
- `parseGithubUrl`;
- `findSkillDirs`;
- `parseSkillMd`: frontmatter và thân bài, dùng gói YAML nếu repo đã có, không thì tự đọc frontmatter đơn giản;
- `toAris`: đổi sang dạng của aris.

Mỗi hàm có test riêng.

### A2. Đổi sang skill của aris

- `name`: chuyển tên thành dạng slug ASCII, chữ thường, tối đa 64 ký tự.
- `description`: cắt còn 1.000 ký tự.
- `whenToUse`: nếu `description` có đoạn "Use when…" hay "Dùng khi…" thì tách đoạn đó ra; không thì bỏ trống.
- `body`: phần Markdown của `SKILL.md`.
- **Tệp kèm:**
  - chỉ chép tệp chữ (`md`, `txt`, `json`, `yaml`, `yml`, `csv`, `py`, `sh`, `js`, `ts`, `html`, `css`), mỗi tệp tối đa 200 KB, tổng tối đa 2 MB;
  - chép vào `~/.aris/skill-files/<bot>/<name>/v<số bản>/`, giữ cấu trúc thư mục;
  - cuối `body` thêm mục "Tệp kèm (đọc khi cần)", liệt kê đường dẫn tuyệt đối;
  - tệp nhị phân và tệp quá cỡ thì bỏ, ghi vào báo cáo nhập;
  - tệp kèm không bao giờ được tự chạy. Bot muốn chạy script thì phải qua `bash`, và vẫn qua hàng rào.
- `by`: thêm giá trị `'import'` vào enum ở `domain.ts`, `store.ts` và giao diện.
- **Nguồn:** thêm trường `source` vào `VersionRecord`, gồm `{ kind: 'github' | 'claude-code' | 'codex' | 'folder', repo?, ref?, sha?, path, importedAt }`. Không có trường này thì coi như dữ liệu cũ.

### A3. An toàn

- **Mọi skill nhập vào đều qua `propose` và chờ duyệt**, không bao giờ tự bật.
- Thêm bộ quét `scanImported(body, files)`, chạy bên cạnh `lintSkill`. Mỗi dấu hiệu là một cảnh báo có lý do, hiện đỏ trong thẻ duyệt:
  - lệnh tải rồi chạy: `curl … | sh`, `wget … | bash`, `eval "$(curl …)"`;
  - lệnh xoá rộng (`rm -rf /`, `~`, `$HOME`) hay sửa quyền hàng loạt;
  - đọc hay gửi bí mật: `~/.ssh`, `.aws/credentials`, `Keychain`, `security find-generic-password`, `.env`, `credentials.yaml`;
  - giải mã base64 rồi chạy;
  - câu dụ dỗ model, ví dụ "ignore previous instructions", "bỏ qua mọi hướng dẫn", "do not tell the user";
  - gửi dữ liệu tới địa chỉ lạ, ví dụ `curl -d` với URL không phải tài liệu.

  Lệnh trong khối mã thì phân tích bằng `@aris/shell` (`parse`, `ops`) để phân loại, đừng chỉ dò chuỗi.
- Một lần nhập tạo tối đa 30 đề xuất. Trùng tên với skill đang có của bot thì đề xuất **bản mới** của skill đó, và Hộp duyệt hiện phần khác biệt (đã có `diff.ts`).

### A4. Kho skill chung của đội và gán skill cho bot (người dùng yêu cầu 26/10)

Người dùng muốn: skill nằm ở một kho chung, rồi **chính họ gán skill nào cho bot nào dùng**.

**Mô hình dữ liệu**
- Thêm khái niệm **skill của đội**: `SkillRecord.bot = '_doi'` (hằng số `TEAM_OWNER`). Bản ghi thêm `assigned: string[] | 'all'`, là danh sách mã bot được dùng. Skill riêng của từng bot (do vòng học `reflect` tạo ra) giữ nguyên như cũ.
- **Skill nhập từ ngoài luôn vào kho của đội.** Lúc duyệt, người dùng chọn gán cho những bot nào; mặc định chưa gán bot nào.

**Nguồn skill của phiên** (`SkillProvider` trong `index.ts`): bot thấy các skill riêng của mình **cộng với** các skill của đội đã gán cho mình.
- Trùng tên thì skill riêng thắng.
- Đếm lượt dùng (`recordUse`) cho skill của đội theo từng bot. Thêm `usesBy: Record<bot, number>` nếu cần cho màn thống kê.

**Thao tác mới** (`/api/aris/skills`):
- `assign { skill, bots | 'all' }`;
- `unassign { skill, bot }`;
- `share { skill }`: chuyển skill riêng của một bot vào kho đội, giữ các bản cũ, gán sẵn cho bot gốc;
- `unshare`: trả về làm skill riêng của một bot, chỉ được khi skill chỉ gán cho một bot.

**Duyệt:** một lần nhập nhiều skill thì Hộp duyệt gộp thành **một thẻ** "N skill từ <nguồn>", có nút Duyệt tất cả, Xem từng cái, và ô chọn gán cho bot nào.

**Giao diện (vẽ ở A7):**
- **Thư viện skill** có bộ lọc "Kho đội · Riêng từng bot". Mỗi thẻ skill của đội có một dải linh vật các bot đã gán, và nút "Gán…" mở danh sách bot có ô chọn, kèm lựa chọn "Cả đội".
- **Trang chi tiết skill:**
  - mục "Bot được dùng": danh sách bot có công tắc;
  - số lần dùng theo từng bot;
  - với skill riêng của bot thì có thêm nút "Chia sẻ cho đội".
- **Hồ sơ bot › Skill & tool:** hai nhóm "Skill riêng" và "Từ kho đội". Nhóm "Từ kho đội" có công tắc bật/tắt từng skill (chính là gán và bỏ gán), và nút "＋ Thêm từ kho đội".

**Test:**
- bot chỉ thấy skill của đội đã gán cho mình;
- trùng tên thì skill riêng thắng;
- `share` / `unshare` giữ nguyên lịch sử các bản;
- gán `'all'` thì bot tạo sau cũng nhận được.

### A5. Cập nhật từ nguồn

- Skill nguồn GitHub có nút **"Kiểm tra bản mới"** trong trang skill. Bấm thì so `sha` hiện tại với `sha` mới nhất của `ref`; nếu `SKILL.md` hay tệp kèm khác đi thì tạo đề xuất bản mới (`by: 'import'`), chờ duyệt, có phần khác biệt.
- Người dọn kho (curator) chạy hằng tuần cũng kiểm tra luôn, tối đa 20 repo mỗi lần, và ghi vào báo cáo của nó. Không tự cập nhật.

### A6. API (`/api/aris/skills`)

- `POST { op: 'import-scan', source: { kind, url | path } }` trả về danh sách skill tìm được. Mỗi skill gồm `name`, `description`, `files` (số tệp, số tệp bị bỏ), `warnings`, `exists` (bot nào đã có skill trùng tên), và `scanId`.
  - Kết quả quét giữ trong bộ nhớ 15 phút. Với GitHub thì giữ thư mục đã bung tới khi nhập xong hay hết hạn.
- `POST { op: 'import', scanId, names: string[], bots?: string[] | 'all' }` tạo đề xuất vào kho của đội. `bots` là danh sách gán sẵn, chỉ có hiệu lực khi đề xuất được duyệt. Trả về các đề xuất đã tạo.
- `POST { op: 'import-check', skill }` dùng cho phần A5.
- Lỗi mạng, repo riêng tư (404), hay vượt giới hạn tần suất của API GitHub thì trả câu lỗi dễ hiểu.

### A7. Giao diện (vẽ trước, chờ duyệt)

Vẽ khung mới `design/canvas/NhapSkill.dc.html` trên trang canvas `g3` "3 · Trí nhớ & tự tiến hoá".
- **Trang Tự học › Thư viện skill** thêm nút **"＋ Nhập skill"**. Bấm thì mở hộp gồm:
  - tab **GitHub · Claude Code · Codex · Thư mục**;
  - tab GitHub có ô dán đường dẫn, nút "Tìm skill", và một dòng gợi ý mẫu `github.com/anthropics/skills` để người dùng thử;
  - danh sách skill tìm được: ô chọn, tên, mô tả hai dòng, pill "Có trên máy" hay "Trùng tên với <bot>", số cảnh báo màu đỏ;
  - chọn bot nhận và nút **"Nhập N skill"**. Nhập xong thì về Hộp duyệt.
- **Thẻ skill** trong Thư viện có pill nguồn ("GitHub · chủ/repo", "Claude Code", "Codex") và pill "Có bản mới" khi kiểm tra thấy.
- **Thẻ duyệt** cho skill nhập có dòng nguồn (repo@sha rút gọn, có link), danh sách cảnh báo, và danh sách tệp kèm.

## Phần B · Kết nối dùng chung (trả lời câu 2)

### B1. Kết nối của đội

- `McpRecord` thêm `scope`:
  - `{ kind: 'bot', bot }`: giữ nguyên cách cũ, dữ liệu cũ đọc như loại này;
  - `{ kind: 'team', bots: string[] | 'all', departments?: string[] }`: kết nối dùng chung.
- Kết nối dùng chung được gắn vào phiên của mọi bot thuộc phạm vi, bằng cùng cơ chế gắn `agent.ctx` như kết nối riêng. Tên máy chủ không được đụng với kết nối riêng của bot: kết nối của đội có tiền tố `doi-`.
- Khoá chỉ lưu **một lần**, cùng chỗ với khoá MCP hiện nay. Nút "Chuyển cả vào Keychain" của 7a phải áp cả cho kết nối của đội.
- Quyền hỏi (`ask`) đặt chung cho kết nối. Hồ sơ bot được đè lại bằng mức chặt hơn, không được nới hơn.

### B2. Nhập kết nối từ Claude Code và Codex

- **Đọc cấu hình:**
  - Claude Code: `~/.claude.json` (khoá `mcpServers` ở gốc và trong `projects.*`) và `~/.claude/settings.json` nếu có;
  - Codex: `~/.codex/config.toml`, bảng `[mcp_servers.<tên>]`. Đọc TOML bằng gói sẵn có; nếu repo chưa có gói TOML thì viết bộ đọc nhỏ chỉ cho bảng `mcp_servers`, có test.
- **Bỏ qua** máy chủ có `enabled = false`, máy chủ trỏ vào ứng dụng của bên thứ ba có giấy phép riêng (ví dụ `SkyComputerUseClient` của Codex), và máy chủ chỉ chạy được bên trong ứng dụng đó (có biến môi trường trỏ vào `/Applications/ChatGPT.app`).
- **Bí mật** trong `env`, `headers` hay `bearer_token`:
  - không bao giờ in ra, không gửi lên giao diện;
  - nhập thẳng vào kho khoá;
  - giao diện chỉ hiện tên khoá và chữ "đã có".
- **Giao diện:** Cài đặt › Tích hợp có nút **"Nhập từ Claude Code / Codex"**. Bấm thì hiện danh sách máy chủ tìm được: tên, cách chạy (`stdio` hay HTTP), nguồn, đã có trong aris chưa. Người dùng chọn rồi gán cho cả đội, cho phòng, hay cho từng bot. Nhập xong thì chạy "Kiểm tra" từng kết nối như hiện nay.

### B3. Giao diện kết nối (vẽ trước, chờ duyệt)

Sửa khung `MatTichHop.dc.html` hoặc thêm khung mới cạnh nó, gồm:
- danh sách **Kết nối của đội**: tên, mẫu, phạm vi (Cả đội / phòng / N bot), trạng thái kiểm tra, số công cụ;
- nút "＋ Kết nối" và nút "Nhập từ Claude Code / Codex";
- trong hồ sơ bot, phần Skill & tool hiện cả "Dùng chung từ đội" (chỉ xem, có thể tắt cho riêng bot đó) lẫn "Riêng của bot".

## Thứ tự làm

0. **Làm phần B (kết nối dùng chung) trước**, theo thứ tự người dùng chốt ngày 26/10: B1 và B2 máy chủ, vẽ B3, chờ duyệt, rồi làm giao diện. Xong B mới sang A.
1. Phần máy chủ A1–A4 và A6, kèm test, đọc GitHub thật bằng mạng. **Điểm dừng 1:** cho người dùng xem kết quả `import-scan` thật trên `github.com/anthropics/skills` và trên `~/.claude/skills`. Chỉ kể số lượng và tên, không đổ cả nội dung ra.
2. Vẽ A7 và B3. **Điểm dừng 2:** chờ người dùng duyệt bản vẽ.
3. Giao diện phần A, rồi phần A4–A5.
4. Rà lại phần B (đã làm ở bước 0) xem còn khớp với kho skill của đội không. Nếu nên dùng chung khuôn "phạm vi bot" giữa kết nối và skill thì tách ra một hàm chung.
5. Thử thật:
   - nhập 2 skill từ `anthropics/skills` cho Minh, duyệt, rồi hỏi Minh một câu làm skill đó được dùng (câu ngắn);
   - nhập một skill từ `~/.claude/skills`;
   - nhập một kết nối từ Codex hay Claude Code, gán cho cả đội, rồi kiểm tra kết nối.
6. Ghi câu trả lời cho câu 1 và câu 2 vào `docs/Check xem đã làm chưa.md`, kèm chỗ trong app. Cập nhật `docs/specs/aris-skills.md` và `docs/specs/aris-bots.md`.

## Test bắt buộc

- `parseGithubUrl`: đủ các dạng đường dẫn; đường dẫn sai.
- Bung tệp an toàn: symlink, `..`, quá cỡ, quá số tệp.
- `parseSkillMd`: có và không có frontmatter, frontmatter hỏng.
- `toAris`: chuyển tên thành slug, tách `whenToUse`, chọn tệp kèm.
- `scanImported`: từng loại cảnh báo, kèm ca không báo nhầm, ví dụ tài liệu có chữ "curl" mà không chạy.
- `propose` với `by: 'import'` và `source`; trùng tên thì ra bản mới.
- Đọc cấu hình MCP của Claude Code (JSON) và Codex (TOML), bỏ máy chủ bị tắt.
- Kết nối của đội: gắn đúng bot trong phạm vi, không gắn bot ngoài phạm vi; mức hỏi riêng của bot chỉ được chặt hơn.
