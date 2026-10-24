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

> **G6 xong 23/10**: `node scripts/ui/doi-chieu.mjs` chụp 36 màn của canvas và màn tương ứng của app thật, sáng và tối, ghép từng cặp (chỉ cần Node 22 và Chrome). Bảng kết quả: [docs/giao-dien/doi-chieu.md](giao-dien/doi-chieu.md) — các màn còn lệch đều do dữ liệu thật (dòng việc, thẻ duyệt, chat nhiều bot: GĐ2/GĐ3), kênh Telegram (nhóm 7, GĐ1/3/4) hoặc bố cục điện thoại (GĐ8). Đã sửa trong G6: chân thanh bên, vị trí hộp tìm, mục cha và bot đang xem sáng trên thanh bên, chi tiết 5.1/5.2, trang Plugin theo canvas. Giai đoạn G xong; tiếp theo là giai đoạn 1.
>
> **G5 xong 23/10**: mọi trang và hộp thoại trong canvas có vỏ trong gói `@aris/ui-pages`, đi tới được từ app thật: thanh bên có mục Bản đồ đội, Second Brain, Routine, Kanban; bánh răng mở Cài đặt (6.1–6.7, Commander; "Cài đặt chung" vẫn là hộp thoại của dsh); Đội hình mở Hồ sơ bot, "+" mở Tạo bot / Tạo dự án (tạo dự án là thật: chọn thư mục → workspace; "Phòng" đổi thành "Dự án" theo quyết định 11); nút tìm mở "Tìm trong mọi phiên"; hàng việc chờ mở Hộp duyệt. Dữ liệu đều là mẫu `DEMO_*` trong `src/client/*/demo.ts`, mỗi hằng ghi giai đoạn gỡ. Đồ thị tri thức 3D (`KnowledgeGraph`) vào bộ thành phần. Mục lịch của dsh ẩn khỏi thanh bên, mở từ nút "Lịch đang chạy" trong trang Routine. ⌘K vẫn là bộ tìm phiên của dsh tới GĐ1. Bổ sung sau quyết định 11–12: phiên thuộc dự án có đầu khung và cột phải riêng (1.4), Kanban chọn theo dự án, trang Phòng ban (trưởng nhóm, chính sách chung). Còn lại: nhóm 7 di động.
>
> **G4 xong 23/10**: tiêu đề và biểu tượng tab mang tên aris; màn trống có dấu Aris; ô nhập có nút "/" và "@" mở đúng menu của dsh, nhãn model có dấu nhà cung cấp (tắt nhãn "1017"); mỗi lần Aris giao việc cho bot con (công cụ `subagent`) vẽ thành một nhánh "dòng việc" màu của bot, theo dõi phiên bot con đang làm hay đã xong; bong bóng tin nhắn nền mực và thẻ duyệt nền cam như canvas; cột phải mở ra là "Đội bot lúc này" (sơ đồ đội 3D xoay được như màn R3: Commander lơ lửng giữa, bot xoay quanh, dây nối chạy khi bot đang làm/chờ, mắt đổi theo trạng thái; việc gần đây) và vẫn giữ lối mở Tệp, Terminal. Chưa xem trên dữ liệu thật: nhánh "dòng việc" và thẻ duyệt (cần một lượt model giao việc / xin quyền). Dời sang giai đoạn có dữ liệu: "@" liệt kê bot (GĐ2), duyệt ngay trong nhánh (GĐ3), ghim trí nhớ (GĐ1), đường đời tin nhắn.

> **G3 xong 23/10**: `@aris/ui-kit/react` có 28 thành phần (nút, trạng thái, pill, thẻ, công tắc, ô tích, chọn đoạn, ô nhập, tab, menu, hộp thoại, dòng điều hướng, dòng bot, khung trang thường và khung Cài đặt 6.x) cùng bộ icon; trang thử sáng/tối [giao-dien/thanh-phan.html](giao-dien/thanh-phan.html) (`node scripts/ui/gallery.mjs`). Thanh bên và đầu khung chat đã ghép lại từ bộ này, chỉ còn CSS bố cục riêng. React 18.3.1 (đúng bản dsh dùng) chỉ là devDependency cho kiểm thử và trang thử; lúc chạy dùng React của dsh.

> **G2 xong 23/10**: theme aris cho toàn app (`@aris/ui-theme`, sáng và tối); tiếng Việt là ngôn ngữ thứ ba bên cạnh tiếng Anh và tiếng Trung, chọn ở Cài đặt › Chung › Ngôn ngữ (`@aris/ui-locale-vi`, 2.760 chuỗi của dsh, 100%); chữ của aris có từ điển en/vi; `pnpm check` chặn bản dịch lệch biến hoặc lỗi thời khi nâng dsh. Còn lại cho G4: tiêu đề tab "DeepSeek Harness", màn trống.

> Thêm ngày 23/10 theo yêu cầu của chủ dự án: làm thanh bên rồi đầu khung theo từng góp ý là cách làm vụn vặt, app sẽ thành chắp vá giữa dáng aris và dáng dsh. Giai đoạn này dựng giao diện theo hệ thống để mọi màn đạt canvas trước khi nối dữ liệu.

**Mục tiêu**: đi khắp app, màn nào cũng giống canvas ở cả sáng và tối; những chỗ chưa có dữ liệu thật dùng dữ liệu mẫu được đánh dấu rõ.

| Bước | Việc | Kết quả nghiệm thu |
|---|---|---|
| **G1 · Bản đồ giao diện** | Kiểm kê mọi mảnh giao diện web của dsh (row, chỗ cắm, token theme); đối chiếu 36 màn canvas, mỗi vùng chọn một cách làm: chỉ theme / tắt row và thay / cắm thêm vào chỗ cắm / trang mới / ngoài web | [giao-dien/ban-do.md](giao-dien/ban-do.md): bảng "màn nào làm bằng cách nào, ở gói nào, giai đoạn nào nối dữ liệu" + ảnh chụp hiện trạng |
| **G2 · Theme aris + tiếng Việt** | `@aris/ui-theme`: `ctx.theme.overrideTokens` ghi đè 403 token `--dsw-*` (màu, nền, viền, chữ, bo góc, bóng) và phông cho cả sáng và tối (ban đầu Lexend / Be Vietnam Pro / JetBrains Mono; từ 23/10 là phông hệ thống như DeepSeek). `@aris/ui-locale-vi`: thêm ngôn ngữ `vi` (giữ tiếng Anh, tiếng Trung) và dịch ~2.400 chuỗi của dsh, có script trích chuỗi và báo thiếu khi nâng dsh | Mọi chỗ chưa thay (khung chat, ô nhập, cài đặt, hộp thoại, menu) mang dáng aris; chọn Tiếng Việt thì cả app nói tiếng Việt; không còn màu xanh DeepSeek |
| **G3 · Bộ thành phần** | `@aris/ui-kit` thêm thành phần React: nút (b1/b2/icon), viên trạng thái, chip, thẻ, dòng cài đặt, nút chọn đoạn, ô nhập, hộp thoại, menu, tab, linh vật, glyph trạng thái, khung trang Cài đặt (thanh điều hướng 6.x); trang thử thành phần | Mỗi thành phần có trang thử sáng/tối; thanh bên và đầu khung chuyển sang dùng bộ này |
| **G4 · Khung ứng dụng** | Thay các mảnh có bố cục khác canvas: ô nhập 1.2 (lệnh, @bot, đính kèm, model), cách vẽ hội thoại 1.1 (dòng việc rẽ nhánh, thẻ duyệt), cột phải (sơ đồ đội 3D) | 1.1 và 1.2 đạt canvas |
| **G5 · Vỏ mọi trang** | Dựng các trang trong điều hướng và Cài đặt bằng bộ thành phần, dữ liệu mẫu đánh dấu rõ (`DEMO_*`) | Đi được tới mọi màn trong 36 màn từ app thật |
| **G6 · Đối chiếu canvas** | Script chụp app thật và đặt cạnh canvas từng màn, sáng/tối, ghi chỗ lệch | Bảng đối chiếu: mọi màn "đạt" hoặc có lý do ghi rõ |

**Rủi ro**: dữ liệu mẫu bị hiểu nhầm là tính năng đã chạy ⇒ mọi dữ liệu mẫu nằm trong hằng `DEMO_*`, liệt kê trong bản đồ giao diện và gỡ dần khi nối dữ liệu thật. dsh đổi tên token/slot khi nâng cấp ⇒ ghim phiên bản, bảng kiểm kê ghi rõ phiên bản đã đối chiếu.

---

## Giai đoạn 1 · Một bot dùng hằng ngày (tuần 4–5)

> **Bước 6 xong 23/10 — dự phòng, nhiều khoá, giá** ([đặc tả](specs/aris-providers.md#bước-6-dự-phòng-nhiều-khoá-giá-giai-đoạn-1)): `@aris/providers` móc vào `agent/request-error` và `agent/request` của dsh (đứng ngoài bộ chọn model). Khoá hỏng, hết tiền, model không có, tràn ngữ cảnh không nén được, lỗi tạm vẫn còn sau khi dsh thử lại thì chuyển sang mắt xích kế tiếp **trong lượt đó**; lượt sau về model đã chọn. Vòng khoá: khoá phụ ở `<TÊN>_ARIS_<i>` trong kho khoá của dsh, đổi khoá khi 401/402/429. Giá theo bảng của pi-ai, sổ chi phí theo ngày; trang 6.2 có cột Giá, Chi phí, Thêm khoá, chuỗi dự phòng chỉnh được; chân thanh bên hiện chi phí thật (gỡ `DEMO_COST`). Chạy thử thật: chuỗi OpenRouter GPT-4o-mini (402 vì chưa nạp tiền) → Groq GPT OSS 120B (413: bản miễn phí giới hạn 8.000 token mỗi phút, lời nhắc của aris khoảng 14.000) → DeepSeek flash trả lời đúng, không tốn thêm bước; lượt sau quay về OpenRouter rồi lại chuyển, dòng báo hiện trong tab Diễn biến. Lưu ý: Groq miễn phí không đỡ nổi aris làm dự phòng; tab Chat chưa hiện dòng báo chuyển (cũng như dòng đổi model của dsh). Đổi khoá thật chưa thử vì cần khoá thứ hai, đã kiểm bằng test.
>
> **Bước 5 xong 23/10 — chạy ngầm (`@aris/daemon`, lệnh `aris`)** ([đặc tả](specs/aris-daemon.md)): LaunchAgent `vn.aris.daemon` chạy profile `aris` khi đăng nhập, văng thì chạy lại; socket cục bộ `~/.aris/run/<băm thư mục dữ liệu>.sock` (0600; không đặt trong thư mục dữ liệu vì đường socket của macOS tối đa 104 ký tự). Lệnh `install`/`uninstall`/`start`/`stop`/`restart`/`status`/`logs`/`open`/`url`/`send`/`ask [--json]`. Một chủ duy nhất: daemon đang chạy thì `pnpm aris` từ chối; bản sau không chiếm socket của bản đang chạy. Chạy thử thật (bản chạy tay, chưa cài launchd): `status`, `url`, `ask --json` (phiên mới trong chat riêng, trả `{sessionId, text, reason}`), `stop`, chặn bản thứ hai đều đúng. Đổi so với kế hoạch: `aris ask` không có đường chạy một lần khi daemon tắt, vì bản headless của dsh cố ý tắt kho khoá và không có kênh; aris không chạy thì báo và thoát mã 1. Đã cài launchd cùng ngày: aris tự chạy, `ask --json` trả lời đúng; giết hẳn tiến trình (`kill -9`) thì launchd chạy lại sau khoảng 2 giây, bản mới dọn socket cũ. Còn lại: thử khởi động lại máy.
>
> **Bước 3 xong 23/10 — tìm lại phiên cũ (`@aris/recall`)** ([đặc tả](specs/aris-recall.md)): dựng trên chỉ mục toàn văn của dsh (`ctx.sessionQuery`, SQLite FTS5) mà dsh-base mount sẵn nhưng tắt tìm nội dung; lớp aris bật lên (mở khi tìm lần đầu, lưu ở `$DSH_HOME/session-search.sqlite`). Tool `recall`: search tìm, đọc quanh tin khớp, tóm tắt có dẫn nguồn `[S1#12]`; open đọc nguyên văn. Hộp 1.6 "Tìm trong mọi phiên" tìm nội dung thật qua `/api/aris/recall` và mở đúng phiên. Chạy thử thật: tìm không phân biệt dấu ("khoa hoc" ra "khoá học"), 20–90 ms; tin "user" do dsh chèn (chỉ dẫn nội bộ) bị loại khỏi kết quả; hỏi ở phiên mới "khoá học AI mấy buổi, tối thứ mấy, ra mắt tháng nào" và "kế hoạch tuần: sáng làm gì, chiều làm gì" đều trả lời đúng, có nguồn. Sửa kèm: model có suy luận tính cả phần suy nghĩ vào trần token, trần 900 làm tóm tắt rỗng; nâng lên 6.000 cho cả tóm tắt khi tìm lại và rút ký ức khi nén (lần thử trước của rút ký ức "đề xuất 0 mục" có thể do lỗi này).
>
> **Bước 2 xong 23/10 — provider và model** ([đặc tả](specs/aris-providers.md)): không làm lõi riêng mà dựng trên `dsh-llm-pi-ai` (mọi nhà cung cấp pi-ai biết, cộng API tương thích OpenAI/Anthropic) và kho khoá của dsh. Trang 6.2 gom về một chỗ: cột trái là mục "Model" của dsh vẽ ngay trong trang (mục này bỏ khỏi nhóm Hệ thống), cột phải "Model theo việc" chỉnh model mặc định cho phiên mới (ghi thật, đã thử đổi và trả lại). Viên chọn model trong khung chat và `/model` là của dsh, chạy sẵn. Còn lại cho phần sau của GĐ1: thứ tự dự phòng giữa nhà cung cấp, xoay vòng nhiều khoá, giá từng model; model tóm tắt và đặt tên phiên chỉ chỉnh được trong `cordis.patch.yml` vì máy chủ không mở chúng cho trang cài đặt.
>
> **Bước 1 xong 23/10 — ký ức (`@aris/memory`)**: đặc tả [docs/specs/aris-memory.md](specs/aris-memory.md). Hai cuốn lõi có trần (ghi chú của bot 2.200 ký tự, hồ sơ chủ nhân 1.375) nạp vào mọi lượt qua ngữ cảnh động của dsh; lưu trữ tìm không dấu; tool `memory` (save/update/forget/search); bản ghi `plugin:aris/memory-op` trong log phiên; lưu bền ở storage domain `aris_memory`; trang 3.1 đọc/sửa qua `/api/aris/memory` (dsh kiểm cookie, chỉ chủ nhân). Chạy thử thật với DeepSeek: "nhớ là…" được lưu đúng cuốn và loại; phiên mới trả lời đúng mà không cần gọi tool; sửa ký ức từ trang thì lượt kế tiếp trong cùng phiên đã dùng bản mới, lượt đó trúng bộ nhớ đệm 81%. Bổ sung cùng ngày: **tự nhắc lưu** (lượt có dấu hiệu cần nhớ hoặc lượt dài mà chưa lưu thì cài lời nhắc cho lượt kế tiếp) và **lưu trước khi nén** (rút ký ức từ đúng đoạn bị nén, cất vào lưu trữ). Chạy thử thật: lời gọi model khi nén chạy đúng (đọc đoạn bị nén, đề xuất 0 mục vì bot đã tự lưu trong lượt); lời nhắc chưa bật trong lần thử nào vì bot đều tự lưu ngay, đúng điều kiện.

**Mục tiêu**: Aris sống trên Telegram của anh, nhớ anh, đổi được model.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-providers` | Danh mục provider dựng sẵn (DeepSeek, Anthropic, OpenAI, Google, OpenRouter, Ollama…) + **provider tự thêm** (kiểu SDK + URL + khoá); kiểm tra kết nối; năng lực và giá từng model; **model theo việc**; thứ tự dự phòng; xoay vòng khoá. Học cách tổ chức dữ liệu của VoxAgent |
| `aris-memory` | Ký ức 2 tầng: lõi có trần (nạp qua `PromptContext` để có hiệu lực ngay mà không phá cache), lưu trữ (SQLite FTS5); tool `memory` (add/patch/remove/search); nhắc lưu khi turn dài; lưu trước khi nén; sự kiện `aris/memory-op` |
| `aris-recall` | Tìm lại phiên cũ qua `ctx.sessionQuery` + tóm tắt bằng model rẻ, có trích dẫn |
| `aris-dispatch` | Cửa vào duy nhất: chống trùng theo id tin nhắn, hàng đợi bền theo cuộc hội thoại, ánh xạ chat → phiên; 3 chế độ khi bot đang bận (chèn / xếp hàng / dừng và làm mới) |
| `aris-channels` + `aris-gateway-telegram` | Long-polling, ghép đôi chủ nhân bằng mã, gửi/nhận văn bản, ảnh, tệp, ghi âm → chữ |
| Chạy ngầm (M1, M2) | Daemon `launchd` trên Mac, tự khởi động lại, **chủ duy nhất của trạng thái**; socket cục bộ: `aris status`, `aris stop`, `aris send`; `aris ask "…" [--bot] [--json]` giao một việc qua daemon rồi thoát |

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

> **Bước 4 xong 24/10 — bot ngoài** ([đặc tả](specs/aris-commander.md#bot-ngoài-bước-4)): theo bản vẽ 2.1b, 2.1c (vẽ lại theo plugin có sẵn của dsh). Claude Code và Codex chạy qua plugin chính thức của dsh (`dsh-subagent-claude-code`, `dsh-subagent-codex`), agent khác qua `dsh-subagent-acp`. Hộp Thêm bot ngoài cài plugin khi cần (không bật lớp profile), aris gắn mỗi bot một nhà cung cấp riêng với mức quyền của bot đó. `giao_viec` cho bot ngoài là một lần chạy trọn gói: worktree riêng, tự dừng khi quá giờ, kết quả về Aris thành thông báo; nhánh trong chat hiện đã nhận, đang làm bao lâu, nút Dừng, xong với kết quả hoặc vấp với lý do. Khác bản vẽ cũ: không xem được từng bước bên trong, không có "hỏi người dùng" khi bot ngoài xin quyền, không đo chi phí (giới hạn bằng thời gian). Chạy thử thật: thêm Kiệt (Claude Code, phòng Kỹ thuật) → plugin cài và gắn → Aris giao "đọc README.md, tóm tắt 3 gạch" trong repo aris → worktree mới, Claude Code làm 22 giây, kết quả về Aris, nhánh 2.1c đúng. Codex và ACP chưa chạy thử thật.
>
> **Bước 3e xong 24/10 — phòng nhóm của dự án** ([đặc tả](specs/aris-commander.md#phòng-nhóm-của-dự-án-moi_noi-bước-3e)): phiên chính của dự án là phòng chung, Aris điều phối bằng `moi_noi` (mỗi lần một vòng, bot nói lần lượt và nghe được nhau, `@tên` hỏi lại nhau, bỏ lượt khi không có ý mới). Luật dự án giới hạn vòng và tin cho mỗi tin của người dùng; "dừng @tên", "dừng phòng" và nút Dừng phòng. Khung chat vẽ tin của bot theo bản vẽ Phòng nhóm; thanh phòng trên ô nhập. Chạy thử thật: `@all` với Thơ, Minh, Phát → 2 vòng, 6/10 tin, bot phản biện và chọn phương án của nhau → Aris hỏi người dùng chọn tiêu đề bằng câu hỏi có lựa chọn; Dừng phòng giữa vòng 1 → bot đang nói dừng, Aris tóm tắt. Bước 3 xong.
>
> **Bước 3d xong 24/10 — việc lớn của phòng ban** ([đặc tả](specs/aris-commander.md#việc-lớn-của-phòng-ban-giao_phong-chỉ-commander-bước-3d)): Aris giao cả phòng bằng `giao_phong`; trưởng nhóm nhận ở phiên riêng, chia thẻ, giao cho thành viên trong phòng (ngoài phòng bị chặn), tổng hợp rồi báo cáo về Aris. Việc lớn chốt theo log phiên trưởng nhóm, aris khởi động lại vẫn chốt được. Trang Phòng ban có thẻ việc lớn, Kanban có thẻ việc lớn kèm tiến độ. Chạy thử thật: Aris giao phòng Tăng trưởng → Thơ chia 2 thẻ cho Minh, Phát → xong 2/2 → báo cáo về Aris. Tiếp theo: 3e chat chung của dự án.
>
> **Bước 3c xong 24/10 — Kanban thật** ([đặc tả](specs/aris-projects.md#bảng-việc-kanban-bước-3c)): bảng của dự án đọc bảng việc của Team trong phiên chính (không đánh thức phiên) cùng thẻ người dùng tạo; năm cột theo bản vẽ 4.3, cột theo trạng thái trực tiếp của phiên bot. Aris chia việc thành thẻ có thứ tự (`tao_the`), giao thẻ có sẵn (`giao_viec` với `the`); bot làm xong thì thẻ tự đánh dấu xong. Chia việc tự động hoặc thủ công, "Giao ngay". Cột phải của dự án hiện việc chưa xong. Chạy thử thật: thẻ người dùng → Giao ngay → Aris giao Thơ → Thơ làm xong → thẻ sang Xong. Tiếp theo: 3d việc lớn của phòng ban.
>
> **Bước 3b xong 24/10 — dự án là một Team (`@aris/projects`)** ([đặc tả](specs/aris-projects.md)): dự án = workspace của dsh + hồ sơ của aris (mục tiêu, thành viên, luật trò chuyện, phiên chính Aris làm trưởng nhóm; Team của dự án là Team của phiên chính). Hộp Tạo dự án theo bản vẽ 1.5 tạo thật (thư mục tự tạo, phiên chính mở ngay); cột phải 1.4 và đầu khung chat của dự án dùng dữ liệu thật, thêm/bỏ bot tại chỗ; ngữ cảnh `aris:project` cho Aris và thành viên. Chạy thử thật: tạo dự án có Minh, Thơ; Aris nêu đúng mục tiêu, thư mục, thành viên. Tiếp theo: 3c Kanban thật.
>
> **Bước 3a xong 24/10 — phòng ban thật** ([đặc tả](specs/aris-bots.md#phòng-ban-và-chính-sách-chung-bước-3a)): tạo, đổi tên, xoá phòng, chuyển bot giữa các phòng; chính sách chung lưu thật và áp thật cho mọi bot của phòng: model mặc định, trần ngân sách mỗi ngày (chi phí ghi theo phòng), quyền web / ghi tệp / chạy lệnh (chặn ở công cụ, bot được báo trước). Trang 2.6 theo bản vẽ mới `PhongBan.dc.html`. Đội sửa ở một trang thì thanh bên và các gói khác cập nhật ngay. Chạy thử thật: Minh bị chặn chạy lệnh đúng chính sách, hết ngân sách thì dừng bằng một câu báo. Tiếp theo: 3b dự án là một Team.
>
> **Sửa sau bước 2 (23/10)**: (1) **Xưng hô không viết cứng** ([aris-bots.md](specs/aris-bots.md#xưng-hô-với-người-dùng)): bot hỏi tên và cách xưng hô lần đầu rồi lưu (`xung_ho`), lời nhắc gọi "người dùng", chữ giao diện dùng `{you}` điền theo hồ sơ (thử thật: Aris hỏi bằng phiếu ba câu, lưu đúng, thanh bên đổi tên và cách gọi). (2) **Chỗ chat riêng chuyển ra `~/aris/workspace`**: thư mục mặc định cũ của dsh trong `~/Documents` bị macOS chặn với aris chạy ngầm, mọi lệnh bash treo ở `getcwd`. (3) **node chạy ngầm không dùng node của Hermes** (`pickNode`, mặc định `/usr/local/bin/node`). Còn chờ: macOS hỏi quyền cho node vào Desktop (mã và dữ liệu aris đang ở Desktop), aris chạy ngầm chạy tiếp khi người dùng cho phép. (4) Việc gần đây có mục "bắt đầu", lưu bền qua khởi động lại; "Việc mới" theo bot của phiên.
>
> **Bước 2 xong 23/10 — Commander giao việc (`@aris/commander`)** ([đặc tả](specs/aris-commander.md)): công cụ `giao_viec` chỉ Commander dùng, mỗi bot là thành viên Team của phiên (lần sau nhắn tiếp), mỗi việc một thẻ gán cho bot, có lý do; nhật ký định tuyến (`plugin:aris/dispatch`, trang 2.5); bot thường không tự lập đội; việc được giao chạy bằng model riêng của bot; trạng thái trực tiếp và việc gần đây (thanh bên, sơ đồ 3D, cột phải, Bản đồ đội); nhánh dòng việc theo bot trong chat. Chạy thử thật trên web: "tóm tắt 3 đối thủ rồi viết bài Facebook" → Aris giao Minh (lý do: phụ trách nghiên cứu), đợi, rồi giao Thơ kèm kết quả của Minh, tổng hợp bài và tự lưu ký ức; nhánh Minh hiện trong chat, thanh bên đổi trạng thái theo.
>
> **Bước 1 xong 23/10 — bot (`@aris/bots`)** ([đặc tả](specs/aris-bots.md)). Thử Agent Teams trước: hai đội chạy song song không đụng nhau, bảng việc ghi `team/task` đầy đủ; nhưng thành viên đội dùng chung preset và model với phiên chính, nên **bot là dữ liệu của aris gắn vào phiên** chứ không phải preset của dsh. Kho bot (mã nội bộ cố định, tên gọi `@handle` đổi được), phòng ban, ba đội mẫu đi kèm (anh chọn mẫu A: Minh, Thơ, Phát ở Tăng trưởng; An, Ngân ở Vận hành; Khoa ở Kỹ thuật). Phiên gắn bot khi mở chat thẳng với bot, hoặc khi thành viên đội trùng tên gọi (dsh ghi `team/member` trước khi phiên con chạy). Ngữ cảnh `aris:bot` nạp tính cách và đội hình theo phiên; ký ức: hồ sơ chủ nhân dùng chung cả đội, ghi chú riêng từng bot. Giao diện: thanh bên (đội thật, mời chọn đội mẫu, bấm bot là mở chat với bot), đầu khung chat hiện bot của phiên, sơ đồ 3D, Bản đồ đội, Phòng ban (đặt trưởng nhóm), Hồ sơ bot (sửa hồ sơ, tính cách, linh vật, model riêng, xoá), Tạo bot (vai mẫu điền sẵn). Chạy thử thật: chat với Minh, Minh tự giới thiệu đúng vai và chỉ sang Thơ cho bài Facebook; thành viên đội tên `tho` nhận đúng tính cách Thơ. Còn mẫu tới bước sau: trạng thái trực tiếp, việc gần đây, skill, quyền, kênh riêng, cột phải của dự án.

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
