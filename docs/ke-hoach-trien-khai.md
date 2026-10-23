# aris-agent — Kế hoạch triển khai

> 23/10/2026. Kế hoạch này nối ba tài liệu: kiến trúc ([phan-tich-kien-truc.md](phan-tich-kien-truc.md)), đặc tả tính năng ([tinh-nang-aris.md](tinh-nang-aris.md)) và thiết kế giao diện (canvas 36 màn, bản sao mã nguồn trong [`design/canvas/`](../design/canvas/)). Nó **thay mục 13 "Lộ trình"** của tài liệu tính năng: thứ tự được sắp lại để **giao diện nền đúng canvas có trước** (giai đoạn G, chốt 23/10), rồi anh **dùng được aris qua Telegram từ tuần thứ 5**, mỗi giai đoạn sau thêm một năng lực lớn. Bốn cách dùng aris (chạy ngầm, giao diện, điều phối, làm agent thành viên) theo mục 15 của tài liệu tính năng được rải vào các giai đoạn, mã M1–M10.

## Nguyên tắc làm

1. **Mỗi giai đoạn kết thúc bằng một thứ chạy được và anh dùng thật.** Không xây hết phần nền rồi mới có giao diện.
2. **Đi theo lát cắt dọc**: mỗi tính năng làm đủ từ đặc tả → dữ liệu → logic → giao diện → kiểm thử, không làm hết tầng này mới sang tầng khác.
3. **Không sửa DeepSeek Harness (dsh)**: mọi thứ là plugin trong profile `aris`. Ghim chính xác phiên bản dsh; nâng cấp có kiểm thử hợp đồng.
4. **Mỗi giai đoạn = một nhánh + một PR**, có danh sách nghiệm thu; anh duyệt bằng cách dùng thử.
5. **Đặc tả trước khi viết mã**: mỗi package có `docs/specs/<tên>.md` viết bằng lời của mình (đúng quy trình tham khảo Hermes).
6. **Giao diện nền trước, dữ liệu sau** (chốt 23/10): giao diện làm theo hệ thống, không theo từng màn — theme aris ghi đè toàn bộ token của dsh → bộ thành phần dùng chung (`aris-ui-kit`) → khung ứng dụng → vỏ của mọi trang → đối chiếu từng màn với canvas (giai đoạn G). Mảnh nào của dsh có bố cục khác canvas thì tắt row đó và chèn gói aris giữ nguyên hợp đồng slot (`@aris/web-bundle`); không fork cả dsh. Từ giai đoạn 1, dòng "Giao diện" của mỗi giai đoạn nghĩa là **nối dữ liệu thật vào trang đã dựng ở G**, không vẽ lại.
7. **Một lõi, nhiều mặt**: toàn bộ năng lực nằm trong `aris-bundle`; Web UI, Telegram, `aris ask`, ACP, API, A2A, MCP chỉ là các mặt mở ra ngoài. Daemon là chủ duy nhất của trạng thái.

## Tổng quan

| Giai đoạn | Thời lượng | Kết quả anh dùng được | Màn hình |
|---|---|---|---|
| **0 · Nền móng** | 1 tuần | `pnpm aris` mở được Web UI, chat với DeepSeek | — |
| **G · Giao diện nền** | 2 tuần | Toàn app mang dáng aris; đi khắp mọi trang trong điều hướng, màn nào cũng đạt canvas (dữ liệu mẫu được đánh dấu) | vỏ của cả 36 màn |
| **1 · Một bot dùng hằng ngày** | 2 tuần | Nhắn Aris qua Telegram, Aris nhớ anh, đổi được model; chạy ngầm 24/7 và `aris ask` trong script | 1.1 (chưa có đội), 1.6, 3.1, 6.2, 6.3 (Telegram), 6.7 |
| **2 · Đội bot và Commander** | 3 tuần | 5 bot có linh vật, Aris giao việc cho đội **kể cả bot ngoài** (Claude Code, Codex, Hermes…), thấy dòng việc rẽ nhánh và bản đồ 3D | 1.1–1.5, 2.1–2.5, 2.1b |
| **3 · Tự tiến hoá** | 3 tuần | Bot tự học ký ức, tự đề xuất skill có kiểm thử, anh duyệt qua Telegram | 2.3, 3.2–3.5, 7.1, 7.3 |
| **4 · Tự động** | 2 tuần | Routine 8h sáng tự gửi, Kanban cho dự án dài | 4.1–4.3, 7.2 |
| **5 · Second Brain và đồ thị** | 3 tuần | Ghi âm Telegram → ghi chú có liên kết, hỏi bộ não, đồ thị 2D/3D | 5.1–5.4 |
| **6 · Mở cửa: aris trong nền tảng khác** | 2 tuần | Aris làm agent thành viên trong IDE, **Buzz Desktop**, Open WebUI; gọi và được gọi bởi agent khác (A2A); mở tool cho Claude Desktop/Cursor (MCP) | 6.3b Mặt tích hợp, 6.4 |
| **7 · Cứng cáp và lên server** | 2 tuần | Chạy 24/7 trên server, an toàn mạng, ngân sách, Lark + Zalo, đo đối đầu với Hermes | 6.1, 6.4, 6.5 |
| **8 · Mở rộng** | theo nhu cầu | Màn hình của bot, trình duyệt tự động, chat web trên điện thoại, Buzz như kênh nhắn tin… | 6.6, 7.4 |

Tổng: khoảng **20 tuần** cho giai đoạn 0–7 (thêm 2 tuần của giai đoạn G).

---

## Giai đoạn 0 · Nền móng (tuần 1)

> **Đã xong 23/10** · kết quả các thử nghiệm: [spikes/giai-doan-0.md](spikes/giai-doan-0.md). Giao diện: **thay từng row giao diện của dsh bằng gói aris** (`@aris/web-bundle` tắt row gốc, chèn row aris cùng hợp đồng slot); thanh bên trái đã thay xong bản đầu.

**Mục tiêu**: có bộ khung chạy được, CI, và trả lời dứt điểm câu hỏi kỹ thuật lớn nhất: *giao diện aris làm bằng plugin Web client của dsh được tới đâu*.

**Việc cần làm**

1. **Monorepo**: Node 22 LTS, pnpm workspace, TypeScript strict, Vitest, ESLint/Prettier.
   ```
   aris-agent/
     profiles/aris/            package.json (dsh.profile), cordis.patch.yml mẫu
     packages/aris-bundle/     package.json (dsh.bundle) + patch
     packages/aris-ui-kit/     màu, chữ, trạng thái, 30 linh vật (SVG + Path2D), thanh bên
     packages/aris-hello/      plugin mẫu
     docs/specs/               đặc tả từng package
     design/canvas/            bản sao thiết kế
   ```
2. **Ghim dsh**: thêm `@deepseek-ai/dsh` phiên bản chính xác; script `pnpm aris` = `dsh --profile aris web`.
3. **Profile `aris`**: xếp lớp `dsh-base` → `dsh-web-app` → `aris-bundle`; kiểm tra bằng `dsh --profile aris --dump-config`.
4. **Plugin mẫu `aris-hello`**: một `PromptSection`, một tool, một sự kiện `aris/hello` trong log phiên — chứng minh đủ ba đường mở rộng và gỡ plugin sạch.
5. **Spike giao diện (2 ngày)**: dựng thử thanh bên + một node chat (thẻ "dòng việc") + canvas 3D bằng cơ chế client module / conversation node / sidebar của Web client dsh.
   - Được ⇒ toàn bộ giao diện aris là plugin của Web client dsh (khuyến nghị: một chỗ, ít mã).
   - Không đủ linh hoạt ⇒ phương án B: app web riêng (React + Vite) nói chuyện với dsh qua `sdk` JSON-RPC. Em báo anh kết quả spike trước khi đi tiếp.
6. **`aris-ui-kit` bản đầu**: chuyển token màu, 5 trạng thái, 30 linh vật từ canvas thành mã dùng chung.
7. **CI**: build, test, lint; chặn dependency có tên `hermes`/từ `nousresearch/*`; quét giấy phép dependency.
8. **Spike "nhiều mặt" (nửa ngày)**: xếp `aris-bundle` lên profile `acp` và `headless` của dsh, chạy thử trong Zed (ACP) và một lệnh `--json`. Chứng minh sớm rằng kiến trúc "một lõi, nhiều mặt" chạy được, tránh phải đập lại ở giai đoạn 6.

**Nghiệm thu**
- `pnpm aris` mở Web UI, chat với DeepSeek; log phiên ghi ra đĩa.
- Sandbox chặn ghi ra ngoài thư mục làm việc.
- `--dump-config` thấy các row của aris; gỡ `aris-hello` không để lại gì.
- Có kết luận spike giao diện (A hay B).
- aris trả lời được trong Zed qua ACP và qua `headless --json`.

**Anh cần chuẩn bị**: khoá API DeepSeek.

---

## Giai đoạn G · Giao diện nền (tuần 2–3)

> **G1 xong 23/10**: [giao-dien/ban-do.md](giao-dien/ban-do.md) (36 màn → cách làm), [giao-dien/kiem-ke-dsh.md](giao-dien/kiem-ke-dsh.md) (tự sinh). Phát hiện thêm: mọi chữ của dsh là tiếng Anh (~2.400 chuỗi) → Việt hoá gộp vào G2; cài đặt của dsh là hộp thoại, canvas là trang 6.x → trang Cài đặt aris riêng.

> **G5 xong 23/10**: mọi trang và hộp thoại trong canvas có vỏ trong gói `@aris/ui-pages`, đi tới được từ app thật: thanh bên có mục Bản đồ đội, Second Brain, Routine, Kanban; bánh răng mở Cài đặt (6.1–6.7, Commander; "Cài đặt chung" vẫn là hộp thoại của dsh); Đội hình mở Hồ sơ bot, "+" mở Tạo bot / Tạo dự án (tạo dự án là thật: chọn thư mục → workspace; "Phòng" đổi thành "Dự án" theo quyết định 11); nút tìm mở "Tìm trong mọi phiên"; hàng việc chờ mở Hộp duyệt. Dữ liệu đều là mẫu `DEMO_*` trong `src/client/*/demo.ts`, mỗi hằng ghi giai đoạn gỡ. Đồ thị tri thức 3D (`KnowledgeGraph`) vào bộ thành phần. Mục lịch của dsh ẩn khỏi thanh bên, mở từ nút "Lịch đang chạy" trong trang Routine. ⌘K vẫn là bộ tìm phiên của dsh tới GĐ1. Còn lại cho G6: 1.4 Dự án (đầu khung và cột phải khi phiên thuộc dự án), nhóm 7 di động.
>
> **G4 xong 23/10**: tiêu đề và biểu tượng tab mang tên aris; màn trống có dấu Aris; ô nhập có nút "/" và "@" mở đúng menu của dsh, nhãn model có dấu nhà cung cấp (tắt nhãn "1017"); mỗi lần Aris giao việc cho bot con (công cụ `subagent`) vẽ thành một nhánh "dòng việc" màu của bot, theo dõi phiên bot con đang làm hay đã xong; bong bóng tin nhắn nền mực và thẻ duyệt nền cam như canvas; cột phải mở ra là "Đội bot lúc này" (sơ đồ đội 3D xoay được như màn R3: Commander lơ lửng giữa, bot xoay quanh, dây nối chạy khi bot đang làm/chờ, mắt đổi theo trạng thái; việc gần đây) và vẫn giữ lối mở Tệp, Terminal. Chưa xem trên dữ liệu thật: nhánh "dòng việc" và thẻ duyệt (cần một lượt model giao việc / xin quyền). Dời sang giai đoạn có dữ liệu: "@" liệt kê bot (GĐ2), duyệt ngay trong nhánh (GĐ3), ghim trí nhớ (GĐ1), đường đời tin nhắn.

> **G3 xong 23/10**: `@aris/ui-kit/react` có 28 thành phần (nút, trạng thái, pill, thẻ, công tắc, ô tích, chọn đoạn, ô nhập, tab, menu, hộp thoại, dòng điều hướng, dòng bot, khung trang thường và khung Cài đặt 6.x) cùng bộ icon; trang thử sáng/tối [giao-dien/thanh-phan.html](giao-dien/thanh-phan.html) (`node scripts/ui/gallery.mjs`). Thanh bên và đầu khung chat đã ghép lại từ bộ này, chỉ còn CSS bố cục riêng. React 18.3.1 (đúng bản dsh dùng) chỉ là devDependency cho kiểm thử và trang thử; lúc chạy dùng React của dsh.

> **G2 xong 23/10**: theme aris cho toàn app (`@aris/ui-theme`, sáng và tối); tiếng Việt là ngôn ngữ thứ ba bên cạnh tiếng Anh và tiếng Trung, chọn ở Cài đặt › Chung › Ngôn ngữ (`@aris/ui-locale-vi`, 2.760 chuỗi của dsh, 100%); chữ của aris có từ điển en/vi; `pnpm check` chặn bản dịch lệch biến hoặc lỗi thời khi nâng dsh. Còn lại cho G4: tiêu đề tab "DeepSeek Harness", màn trống.

> Thêm ngày 23/10 theo yêu cầu của chủ dự án: làm thanh bên rồi đầu khung theo từng góp ý là cách làm vụn vặt, app sẽ thành chắp vá giữa dáng aris và dáng dsh. Giai đoạn này dựng giao diện theo hệ thống để mọi màn đạt canvas trước khi nối dữ liệu.

**Mục tiêu**: đi khắp app, màn nào cũng giống canvas ở cả sáng và tối; những chỗ chưa có dữ liệu thật dùng dữ liệu mẫu được đánh dấu rõ.

| Bước | Việc | Kết quả nghiệm thu |
|---|---|---|
| **G1 · Bản đồ giao diện** | Kiểm kê mọi mảnh giao diện web của dsh (row, chỗ cắm, token theme); đối chiếu 36 màn canvas, mỗi vùng chọn một cách làm: chỉ theme / tắt row và thay / cắm thêm vào chỗ cắm / trang mới / ngoài web | [giao-dien/ban-do.md](giao-dien/ban-do.md): bảng "màn nào làm bằng cách nào, ở gói nào, giai đoạn nào nối dữ liệu" + ảnh chụp hiện trạng |
| **G2 · Theme aris + tiếng Việt** | `@aris/ui-theme`: `ctx.theme.overrideTokens` ghi đè 403 token `--dsw-*` (màu, nền, viền, chữ, bo góc, bóng) và phông Lexend / Be Vietnam Pro / JetBrains Mono cho cả sáng và tối. `@aris/ui-locale-vi`: thêm ngôn ngữ `vi` (giữ tiếng Anh, tiếng Trung) và dịch ~2.400 chuỗi của dsh, có script trích chuỗi và báo thiếu khi nâng dsh | Mọi chỗ chưa thay (khung chat, ô nhập, cài đặt, hộp thoại, menu) mang dáng aris; chọn Tiếng Việt thì cả app nói tiếng Việt; không còn màu xanh DeepSeek |
| **G3 · Bộ thành phần** | `@aris/ui-kit` thêm thành phần React: nút (b1/b2/icon), viên trạng thái, chip, thẻ, dòng cài đặt, nút chọn đoạn, ô nhập, hộp thoại, menu, tab, linh vật, glyph trạng thái, khung trang Cài đặt (thanh điều hướng 6.x); trang thử thành phần | Mỗi thành phần có trang thử sáng/tối; thanh bên và đầu khung chuyển sang dùng bộ này |
| **G4 · Khung ứng dụng** | Thay các mảnh có bố cục khác canvas: ô nhập 1.2 (lệnh, @bot, đính kèm, model), cách vẽ hội thoại 1.1 (dòng việc rẽ nhánh, thẻ duyệt), cột phải (sơ đồ đội 3D) | 1.1 và 1.2 đạt canvas |
| **G5 · Vỏ mọi trang** | Dựng các trang trong điều hướng và Cài đặt bằng bộ thành phần, dữ liệu mẫu đánh dấu rõ (`DEMO_*`) | Đi được tới mọi màn trong 36 màn từ app thật |
| **G6 · Đối chiếu canvas** | Script chụp app thật và đặt cạnh canvas từng màn, sáng/tối, ghi chỗ lệch | Bảng đối chiếu: mọi màn "đạt" hoặc có lý do ghi rõ |

**Rủi ro**: dữ liệu mẫu bị hiểu nhầm là tính năng đã chạy ⇒ mọi dữ liệu mẫu nằm trong hằng `DEMO_*`, liệt kê trong bản đồ giao diện và gỡ dần khi nối dữ liệu thật. dsh đổi tên token/slot khi nâng cấp ⇒ ghim phiên bản, bảng kiểm kê ghi rõ phiên bản đã đối chiếu.

---

## Giai đoạn 1 · Một bot dùng hằng ngày (tuần 4–5)

**Mục tiêu**: Aris sống trên Telegram của anh, nhớ anh, đổi được model.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-providers` | Danh mục provider dựng sẵn (DeepSeek, Anthropic, OpenAI, Google, OpenRouter, Ollama…) + **provider tự thêm** (kiểu SDK + URL + khoá); kiểm tra kết nối; năng lực và giá từng model; **model theo việc**; thứ tự dự phòng; xoay vòng khoá. Học cách tổ chức dữ liệu của VoxAgent |
| `aris-memory` | Ký ức 2 tầng: lõi có trần (nạp qua `PromptContext` để có hiệu lực ngay mà không phá cache), lưu trữ (SQLite FTS5); tool `memory` (add/patch/remove/search); nhắc lưu khi turn dài; lưu trước khi nén; sự kiện `aris/memory-op` |
| `aris-recall` | Tìm lại phiên cũ qua `ctx.sessionQuery` + tóm tắt bằng model rẻ, có trích dẫn |
| `aris-dispatch` | Cửa vào duy nhất: chống trùng theo id tin nhắn, hàng đợi bền theo cuộc hội thoại, ánh xạ chat → phiên; 3 chế độ khi bot đang bận (chèn / xếp hàng / dừng và làm mới) |
| `aris-channels` + `aris-gateway-telegram` | Long-polling, ghép đôi chủ nhân bằng mã, gửi/nhận văn bản, ảnh, tệp, ghi âm → chữ |
| Chạy ngầm (M1, M2) | Daemon `launchd` trên Mac, tự khởi động lại, **chủ duy nhất của trạng thái**; socket cục bộ: `aris status`, `aris stop`, `aris send`; `aris ask "…" [--bot] [--json]` chạy một việc rồi thoát (khách mỏng nối vào daemon nếu daemon đang chạy) |

**Giao diện**: 1.1 Chat (khung chat, chọn provider/model, đính kèm, lệnh `/`), 3.1 Ký ức, 6.2 Provider & model, phần Telegram của 6.3.

**Nghiệm thu**
- Nhắn Aris trên Telegram; tắt máy mở lại không mất tin, không trả lời đôi.
- Nói "nhớ là…", ký ức có hiệu lực ngay ở tin kế tiếp; qua phiên mới vẫn nhớ.
- Hỏi lại chuyện tuần trước, trả lời đúng có dẫn nguồn.
- Đổi model giữa chừng bằng viên chọn model hoặc `/model`; thêm được một provider tuỳ chỉnh.
- `aris ask "tóm tắt lịch hôm nay" --json` chạy trong một script cron của hệ thống, kết quả ghi vào cùng log, Aris nhớ được việc đó.

**Rủi ro**: Telegram gửi lại tin khi mạng chập chờn ⇒ chống trùng ngay từ đầu. Prompt cache bị phá ⇒ đo tỉ lệ trúng cache từ ngày đầu.

**Anh cần chuẩn bị**: tạo bot Telegram cho Aris qua BotFather; (tuỳ chọn) khoá Anthropic.

---

## Giai đoạn 2 · Đội bot và Commander (tuần 6–8)

**Mục tiêu**: 5 bot chuyên môn, Aris điều phối, anh thấy cả đội làm việc.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-bots` | Bot = agent preset của dsh + không gian dữ liệu riêng (ký ức, hồ sơ, skill); SOUL; linh vật; model mặc định; quyền; kênh riêng (mỗi bot một token Telegram); tạo / nhân bản / xuất bot |
| `aris-commander` | 3 lệnh chỉ Commander có: `giao_viec` (nhận kết quả, song song), `chuyen_giao` (bot đích trả lời anh), `tro_ly_an` (subagent ẩn danh); định tuyến theo mô tả năng lực, ghi `aris/dispatch` có lý do; giới hạn đồng thời / độ sâu / ngân sách mỗi việc; bot thường chỉ được `hoi_dong_doi` |
| **Thử Agent Teams** (làm đầu tiên) | Bật `dsh-experimental-agent-team-profile` trong profile `aris`; kiểm: aris đăng ký được bộ sinh thành viên từ hồ sơ bot (tên thành viên = mã bot), đọc được bảng việc qua projection `agentTeam` cho Kanban, Team thứ hai cùng thư mục chạy song song không đụng nhau. Không được thì ghi phương án thay trước khi làm `aris-projects` |
| `aris-departments` | Phòng ban (quyết định 12): trưởng nhóm, thành viên, chính sách chung (skill, vùng Second Brain, model, ngân sách, quyền) áp lên mọi bot của phòng |
| `aris-projects` | Dự án (quyết định 11): mỗi dự án một Team của dsh; thành viên, mục tiêu, luật; Kanban đọc bảng việc của Team; việc lớn của phòng ban chạy Team riêng do trưởng nhóm làm Lead; chat chung 2–6 bot: tối đa 3 vòng, 10 tin mỗi lượt, `@tên`, "cần anh", lệnh dừng một bot, chạy tiếp khi đóng ứng dụng |
| Dòng việc | Node chat "dòng việc rẽ nhánh": vẽ các nhánh giao việc từ sự kiện `aris/dispatch` và các bước của bot con; duyệt ngay trên nhánh |
| Bản đồ 3D | Sơ đồ đội 3D (cột phải 1.1) và tab 1.3, dựng từ trạng thái trực tiếp của các agent |
| **Bot ngoài (M3)** | Thêm Claude Code, Codex, Gemini CLI, OpenCode, Hermes vào đội qua `dsh-subagent-acp`: mỗi bot ngoài có linh vật, mô tả năng lực, thư mục làm việc, ngân sách; yêu cầu quyền của bot ngoài chuyển về hộp duyệt của aris (mặc định từ chối); kết quả và sự kiện của nó hiện trên dòng việc như bot nội bộ |
| Kết nối nền tảng (M4) | Cấu hình MCP server theo bot (GitHub cho Tín, Lark Docs cho Mai…) |

**Giao diện**: 1.1 (đủ: thanh bên đội hình, dòng việc, sơ đồ 3D), 1.2, 1.3, 1.4, 2.1 (chọn linh vật), 2.1b Thêm bot ngoài, 2.2, 2.4, 2.5 Commander.

**Nghiệm thu**
- "Tóm tắt 3 đối thủ rồi xếp lịch họp" ⇒ Aris giao Lâm và Mai song song, anh thấy hai nhánh chạy, duyệt lời mời họp ngay trên nhánh hoặc trên Telegram.
- Dự án có 3 bot bàn một việc trong chat chung, dừng sau tối đa 3 vòng; việc chia ra hiện trên Kanban của dự án.
- Nhắn thẳng cho Lâm qua bot Telegram riêng của Lâm vẫn được.
- Bot thường không thể giao việc tiếp (không có vòng lặp); chỉ Commander và trưởng nhóm đang nhận việc của phòng ban được mở Team.
- Giao "nghiên cứu sâu 5 đối thủ" cho phòng Nghiên cứu ⇒ trưởng nhóm mở Team riêng, nộp 5 báo cáo vào thẻ Kanban của dự án.
- "Sửa lỗi đăng nhập trong repo X" ⇒ Aris giao cho bot ngoài Claude Code, anh thấy từng bước trên nhánh, duyệt lệnh nguy hiểm trên Telegram.

**Rủi ro**: chi phí tăng khi nhiều bot chạy ⇒ trần ngân sách mỗi việc từ đầu; Commander giao sai ⇒ nhật ký định tuyến có lý do để chỉnh.

**Anh cần chuẩn bị**: token Telegram cho các bot muốn có kênh riêng (Lâm, Mai…); cài sẵn agent ngoài muốn dùng (Claude Code, Codex, Hermes…) cùng tài khoản của chúng.

---

## Giai đoạn 3 · Tự tiến hoá (tuần 9–11)

**Mục tiêu**: bot giỏi dần theo thời gian mà vẫn an toàn.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-reflect` | Vòng học chạy nền qua `ctx.jobs`, kích hoạt theo **tín hiệu** (bị sửa sai, "nhớ nhé", nhiều bước, lỗi rồi tìm ra cách) + lưới an toàn theo bộ đếm; fork phiên để trúng prompt cache; đầu ra JSON có schema; trần token/lần và /ngày |
| `aris-user-model` | Nhận định về anh có độ tin cậy và bằng chứng; chỉ vòng học được cập nhật; ≥ 0,8 mới vào prompt |
| `aris-skill-forge` | Tạo/vá skill (`SKILL.md`), linter "bài học, không phải nhật ký"; **kiểm thử bằng chạy lại phiên cũ** trong sandbox không mạng; vòng đời nháp → ứng viên → đang dùng; Commander học "ai làm tốt việc gì" |
| `aris-curator` | Skill không dùng 14 ngày → ít dùng, 30 ngày → lưu kho; ghim; sao lưu và quay lui |
| `aris-approvals` | Hộp duyệt chung (hành động, ký ức, skill); thẻ duyệt có nút trên Telegram; hết hạn ⇒ từ chối; gợi ý luật từ lịch sử duyệt |
| Tự trị | `/goal` (giám khảo chấm sau mỗi lượt), `/loop`, `/heartbeat` |

**Giao diện**: 2.3 Hồ sơ chủ nhân, 3.2 Thư viện skill, 3.3 Chi tiết skill (diff + kết quả chạy lại), 3.4 Hộp duyệt, 3.5 Việc đang chạy, 7.1 và 7.3 (thẻ Telegram).

**Nghiệm thu**
- Sau một việc khó, nhận được đề xuất skill có số liệu kiểm thử; duyệt trên Telegram; lần sau cùng việc ít bước hơn ≥ 30%.
- Sửa định dạng báo cáo 2 lần ⇒ bot tự đề xuất bản vá skill.
- Nội dung từ web/email không bao giờ tự thành ký ức.
- Chi phí vòng học nằm trong trần đã đặt.

**Rủi ro**: skill tự sửa làm hỏng hành vi ⇒ bắt buộc kiểm thử + duyệt + quay lui một lệnh.

---

## Giai đoạn 4 · Tự động (tuần 12–13)

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-cron` | Tạo routine bằng lời → hiện bản dịch lịch để xác nhận; chạy ở phiên mới với quyền chặt; giao kết quả ra kênh; chạy bù khi máy tắt; chế độ chỉ chạy script không dùng AI; báo khi lỗi liên tiếp; tạm dừng tất cả |
| `aris-kanban` | Bảng việc bền dùng chung cho đội: thẻ, phụ thuộc, người nhận là bot; Commander tự chia việc (tự động/thủ công); Driver mặc định tắt |
| Webhook | Sự kiện ngoài (vd. GitHub) tạo phiên qua `ctx.webhookRuntime` |

**Giao diện**: 4.1 Routine, 4.2 Tạo routine, 4.3 Kanban, 7.2 Thẻ báo cáo routine.

**Nghiệm thu**: 8h sáng thứ 2–6 Mai tự gửi tóm tắt email và lịch về Telegram; một dự án được chia thành thẻ, các bot làm lần lượt theo phụ thuộc.

---

## Giai đoạn 5 · Second Brain và đồ thị (tuần 14–16)

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-brain` | Kho ghi chú Markdown (mở được bằng Obsidian, có git); Hộp thư vào nhận tin chuyển tiếp, link, ảnh, ghi âm từ Telegram/Lark/Zalo hoặc `/note`; xử lý nền: chép lời, tóm tắt, gắn thẻ, đề xuất chỗ xếp, trích người/dự án/ngày hẹn |
| Tìm kiếm | SQLite FTS5 + chỉ mục vector (model nhúng qua `aris-providers`, có thể chạy Ollama trên máy); "Hỏi bộ não" trả lời có trích dẫn; tool `brain_search`, `brain_capture`; phân quyền đọc/ghi theo bot |
| `aris-graph` | Chỉ mục cạnh: `[[liên kết]]`, thực thể, nguồn gốc ký ức; gợi ý nối; đồ thị quanh ghi chú (2D) và đồ thị toàn cục (3D) |

**Giao diện**: 5.1 Ghi chú (đồ thị 2D quanh ghi chú), 5.2 Hộp thư vào, 5.3 Đồ thị toàn cục 3D, 5.4 Hỏi bộ não; phần "Từ Second Brain" trong menu đính kèm.

**Nghiệm thu**: gửi một ghi âm Telegram ⇒ có ghi chú đã chép lời, xếp đúng dự án, nối với ghi chú liên quan; "Hỏi bộ não" trả lời đúng kèm nguồn; mở thẳng thư mục bằng Obsidian được.

---

## Giai đoạn 6 · Mở cửa: aris trong nền tảng khác (tuần 17–18)

**Mục tiêu**: aris làm được mọi điều Hermes làm khi được nhúng vào hệ thống khác, cùng một lõi và một bộ dữ liệu.

**Việc cần làm**

| Package / mặt | Nội dung |
|---|---|
| Preset "thành viên" | Bộ quyền dùng khi aris chạy trong nền tảng khác: chỉ chủ nhân, bỏ tool nguy hiểm, nội dung đến là không tin cậy, không tự ghi ký ức, **tự áp danh sách cấm kể cả khi host tự duyệt mọi quyền** (Buzz Desktop làm vậy) |
| `aris-acp` (M6) | Profile = acp của dsh + aris-bundle + preset thành viên; `aris acp --bot <tên>`; tên lệnh `aris-acp` trên PATH để **Buzz Desktop tự phát hiện** như runtime; chạy được sau `buzz-acp` trên server |
| `aris-api` (M7) | HTTP + SSE tương thích OpenAI: `/v1/chat/completions`, `/v1/responses`, `/v1/models` (mỗi bot là một model `aris/<bot>`); khoá chống gửi lặp; sự kiện tool trong luồng; bearer token; mặc định chỉ nghe `127.0.0.1` |
| `aris-a2a` (M5, M8) | Client: `a2a_discover`, `a2a_call`, chia việc cho mọi peer cùng năng lực; Server: Agent Card (mỗi bot một kỹ năng), JSON-RPC, SSE, push webhook có ký HMAC, token theo peer, giới hạn tốc độ, trần số lượt qua lại, nhật ký kiểm toán |
| `aris-mcp-server` (M9) | Mở `brain_search`, `brain_capture`, `memory_search`, `giao_viec` cho Claude Desktop, Cursor…; từng tool bật/tắt riêng |
| Giao diện | 6.3b Mặt tích hợp: mỗi mặt một thẻ có trạng thái, Bật/Tắt, địa chỉ hoặc lệnh, khoá, peer, bot được mở ra; dẫn sang bộ quyền "Thành viên" và nhật ký truy cập |

**Nghiệm thu**
- Buzz Desktop tìm thấy aris trong Settings → Runtimes và chat được với Lâm; lệnh xoá tệp bị chặn dù Buzz tự duyệt.
- Open WebUI nối vào `aris-api`, chọn được model `aris/mai`.
- Một Hermes khác gọi aris qua A2A và ngược lại; hai bên không chat qua lại quá trần đã đặt.
- Claude Desktop tìm được ghi chú trong Second Brain qua MCP.
- Mọi việc làm qua các mặt này đều hiện trên bản đồ đội và trong log phiên.

**Rủi ro**: mở cổng mạng ⇒ mặc định chỉ localhost, mở ra ngoài phải có token và cấu hình rõ ràng. Hai tiến trình cùng ghi một bot ⇒ daemon là chủ duy nhất, các mặt khác là khách mỏng.

**Anh cần chuẩn bị**: (tuỳ chọn) cài Buzz Desktop hoặc một relay Buzz; Open WebUI nếu muốn dùng.

---

## Giai đoạn 7 · Cứng cáp và lên server (tuần 19–20)

**Việc cần làm**
1. **Lên server**: container, `systemd`, egress allowlist (chỉ cho các API cần thiết), proxy có nhật ký cho tool mạng.
2. **Ngân sách và an toàn**: trần chi phí ngày, ngưỡng báo, danh sách cấm cứng, luật cho phép, kho bí mật (1Password/Bitwarden), nút dừng khẩn cấp.
3. **Quan sát**: otel + token-meter; bảng điều khiển; thống kê chi phí theo bot và việc; phát lại phiên từng bước.
4. **Sao lưu**: hằng đêm, mã hoá, diễn tập khôi phục.
5. **Kênh**: Lark (nhóm, tài liệu), Zalo OA.
6. **Đo đối đầu với Hermes**: cùng máy, cùng model DeepSeek, 30 tác vụ mẫu; so RAM, độ trễ, tỉ lệ trúng cache, chi phí vòng học, tỉ lệ hoàn thành không cần can thiệp (chỉ tiêu ở mục 10.3 tài liệu tính năng).
7. **Rà soát bảo mật** toàn bộ trước khi để chạy không giám sát.

**Giao diện**: 6.1 Bảng điều khiển, 6.3 (đủ Lark, Zalo), 6.4 Ngân sách–duyệt–mạng, 6.5 Thống kê & nhật ký.

**Nghiệm thu**: chạy liên tục 14 ngày không cần can thiệp; chi phí trong ngân sách; khôi phục thành công từ bản sao lưu; số đo đối đầu đạt chỉ tiêu.

**Anh cần chuẩn bị**: chọn server (đề xuất Oracle Cloud), ứng dụng Lark, Zalo OA đã xác thực.

---

## Giai đoạn 8 · Mở rộng (theo nhu cầu)

- 6.6 Màn hình của bot (desktop ảo, cầm lái khi gặp đăng nhập/2FA).
- Trình duyệt tự động, computer-use (dsh có sẵn `browser-use`, `computer-use`).
- 7.4 Chat web trên điện thoại (PWA).
- Buzz như một kênh nhắn tin ngang Telegram (M10); thêm Discord, Slack, WhatsApp khi cần.
- Bot tự viết tool qua hệ con `extensions` của dsh (luôn cần duyệt).
- Nhập cấu hình/skill từ Claude Code, Codex, Cursor; kho skill cộng đồng; xuất trajectory để huấn luyện.

---

## Việc xuyên suốt mọi giai đoạn

| Việc | Cách làm |
|---|---|
| Kiểm thử | Unit cho logic thuần; **kiểm thử hợp đồng** với phiên bản dsh đã ghim; **phát lại phiên mẫu** để bắt thoái lui khi đổi prompt/skill/model; kiểm thử "hỗn loạn" (`kill -9`, mất mạng, tin gửi lại) cho kênh |
| Đặc tả | `docs/specs/<package>.md` trước khi code; cập nhật nhật ký tham khảo khi đọc Hermes/Tako/VoxAgent |
| Nâng cấp dsh | Đọc hướng dẫn nâng cấp → đổi phiên bản ghim → chạy kiểm thử hợp đồng + phát lại → mới hợp nhất |
| Giao diện | Mọi màn dùng `aris-ui-kit`; đối chiếu canvas trước khi đóng giai đoạn |
| Chi phí | Theo dõi từ giai đoạn 1; mỗi tính năng nền có trần token riêng |

## Anh cần chuẩn bị (tổng hợp)

| Khi nào | Việc |
|---|---|
| Giai đoạn 0 | Khoá API DeepSeek |
| Giai đoạn 1 | Bot Telegram cho Aris (BotFather); máy Mac để chạy nền; tuỳ chọn khoá Anthropic |
| Giai đoạn 2 | Bot Telegram riêng cho các bot muốn có kênh riêng |
| Giai đoạn 2 | Agent ngoài muốn đưa vào đội (Claude Code, Codex, Hermes…) đã cài và đăng nhập |
| Giai đoạn 6 | (Tuỳ chọn) Buzz Desktop hoặc relay Buzz; Open WebUI |
| Giai đoạn 7 | Server; ứng dụng Lark; Zalo OA đã xác thực; chốt trần ngân sách ngày |
