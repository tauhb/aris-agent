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
| **4 · Tự động** | 2 tuần | Routine 8h sáng tự gửi, Kanban cho dự án dài; bot dùng trình duyệt, sửa tệp có điểm khôi phục | 4.1–4.3, 7.2, 3.5 (điểm khôi phục) |
| **5 · Second Brain và đồ thị** | 3 tuần | Ghi âm Telegram → ghi chú có liên kết, hỏi bộ não, đồ thị 2D/3D | 5.1–5.4 |
| **6 · Mở cửa: aris trong nền tảng khác** | 2 tuần | Aris làm agent thành viên trong IDE, **Buzz Desktop**, Open WebUI; gọi và được gọi bởi agent khác (A2A); mở tool cho Claude Desktop/Cursor (MCP) | 6.3b Mặt tích hợp, 6.4 |
| **7 · Cứng cáp và lên server** | 2 tuần | Chạy 24/7 trên server, an toàn mạng, ngân sách, Lark + Zalo, đo đối đầu với Hermes | 6.1, 6.4, 6.5 |
| **8 · Mở rộng** | theo nhu cầu | Màn hình của bot, computer-use, chat web trên điện thoại, Buzz như kênh nhắn tin… | 6.6, 7.4 |

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
     packages/aris-ui-kit/     màu, chữ, trạng thái, 50 linh vật (SVG + Path2D, chuyển động theo trạng thái), thanh bên
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
> **Bước 4 xong 24/10 — Telegram (`@aris/channels`)** ([đặc tả](specs/aris-telegram.md)): chạy thử thật với bot `@aris_agent_ai_bot`. Dán token trên 6.3, nhắn mã ghép đôi thì Telegram của người dùng thành chủ nhân, chat riêng thành chat chính. Đạt: nhắn và trả lời hiện dần trong một tin; nhớ qua `/new`; bảng; nút Cho phép / Từ chối khi bot xin ghi ra ngoài thư mục làm việc (lệnh chỉ đọc chạy luôn, đúng mức quyền "ghi trong thư mục làm việc"); `/status`, `/help`; tắt aris rồi gửi hai tin, bật lại thì trả lời đúng một lần; khởi động lại giữa lúc đang viết thì tin được làm lại, chỉ một bài, không báo lỗi. Lần thử lộ bốn lỗi đã sửa: lượt nhiều bước chỉ giao đoạn cuối (nay giao mọi đoạn theo thứ tự), bảng lớn thành khối chữ gãy dòng (nay luôn là danh sách), tin xem trước còn đang gửi lúc lượt xong bị sót (nay đợi rồi xoá), aris tắt giữa lượt có thể báo lỗi và bỏ tin (nay giữ tin để làm lại). Kèm theo: gỡ plugin mẫu `aris-hello` của giai đoạn 0 (Aris còn gọi công cụ `aris_hello` khi chào), plugin dò của các script kiểm khởi động chuyển sang kiểm tool `memory`. Còn lại: ghi âm cần chuẩn bị mô hình nhận giọng nói trên web một lần (chưa làm, bot báo cách làm bằng tiếng Việt); tin chèn vào lượt đang chạy chưa gặp trong lần thử thật (đã có test); kênh riêng cho từng bot ở giai đoạn 2 bước 5.

> **Bước 5 xong 23/10 — chạy ngầm (`@aris/daemon`, lệnh `aris`)** ([đặc tả](specs/aris-daemon.md)): LaunchAgent `vn.aris.daemon` chạy profile `aris` khi đăng nhập, văng thì chạy lại; socket cục bộ `~/.aris/run/<băm thư mục dữ liệu>.sock` (0600; không đặt trong thư mục dữ liệu vì đường socket của macOS tối đa 104 ký tự). Lệnh `install`/`uninstall`/`start`/`stop`/`restart`/`status`/`logs`/`open`/`url`/`send`/`ask [--json]`. Một chủ duy nhất: daemon đang chạy thì `pnpm aris` từ chối; bản sau không chiếm socket của bản đang chạy. Chạy thử thật (bản chạy tay, chưa cài launchd): `status`, `url`, `ask --json` (phiên mới trong chat riêng, trả `{sessionId, text, reason}`), `stop`, chặn bản thứ hai đều đúng. Đổi so với kế hoạch: `aris ask` không có đường chạy một lần khi daemon tắt, vì bản headless của dsh cố ý tắt kho khoá và không có kênh; aris không chạy thì báo và thoát mã 1. Đã cài launchd cùng ngày: aris tự chạy, `ask --json` trả lời đúng; giết hẳn tiến trình (`kill -9`) thì launchd chạy lại sau khoảng 2 giây, bản mới dọn socket cũ. Thử chạy ngầm không giao diện 24/10: đóng mọi trang web của aris (không còn kết nối nào tới cổng web), nhắn qua Telegram, Aris trả lời bình thường; tiến trình do launchd giữ (cha là launchd, `keepalive`, `runatload`). Còn lại: thử khởi động lại máy (aris chạy khi người dùng đăng nhập; muốn chạy ngay khi bật máy thì bật đăng nhập tự động của macOS).
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

> **Nghiệm thu 24/10** ([biên bản](nghiem-thu/giai-doan-2.md)): `pnpm check` đạt (335 test). Tiêu chí 1, 2, 3, 4, 6 đạt, 5 đạt về cơ chế (thử với 2 việc con). Thử lại trong ngày: Aris giao Minh và An song song, duyệt lời mời họp; Thơ gọi `giao_viec` bị từ chối; Kiệt (Claude Code) sửa lỗi đăng nhập repo thử, 6 lần xin quyền đều duyệt trên Telegram. Còn lại: worktree cho repo nêu trong việc khi phiên giao không ở repo đó, trang Commander 2.5 nối dữ liệu thật, Bảng điều khiển ra menu chính.

> **Hồ sơ bot đợt 4/4 xong 24/10 — Tính cách; màn Hồ sơ bot (2.2, 2.2c) làm đủ** ([đặc tả](specs/aris-bots.md#hồ-sơ-bot--tính-cách-đợt-4)): tính cách theo phiên bản (xem, khôi phục), "Nhờ Aris viết lại" có gợi ý nhanh và so sánh bên cạnh bản hiện tại. Cả 4 đợt: Skill & tool (kết nối MCP, bộ công cụ), Quyền & kênh, cột phải số liệu thật, Model theo việc, Tính cách. Phần thuộc giai đoạn sau hiện mờ, ghi rõ giai đoạn.

> **Hồ sơ bot đợt 3/4 xong 24/10 — Model theo việc** ([đặc tả](specs/aris-bots.md#hồ-sơ-bot--model-theo-việc-đợt-3)): mỗi bot đặt được model khi chạy `/goal` và model dự phòng riêng (thử trước chuỗi chung); vòng học nền (giai đoạn 3) hiện mờ. Sửa kèm: ô chọn đè nhãn khi cửa sổ hẹp. Chạy thử thật: `/goal` của Minh dùng DeepSeek-V4-Pro, xong thì về Flash.

> **Hồ sơ bot đợt 2/4 xong 24/10 — Quyền & kênh, cột phải** ([đặc tả](specs/aris-bots.md#hồ-sơ-bot--quyền--kênh-cột-phải-đợt-2)): quyền riêng của bot (ghi file: không / trong thư mục làm việc / mọi nơi; hành động nguy hiểm: hỏi / tự từ chối; cho Aris giao việc) có hiệu lực thật; cột phải có trạng thái, số việc và tỉ lệ hoàn thành 7 ngày, chi phí 7 ngày theo bot (sổ chi phí nay ghi theo bot), ký ức lõi, việc hay giao, ký ức mới học. Lark (giai đoạn 7), skill tự cải tiến (giai đoạn 3) hiện mờ.

> **Bộ chọn dùng chung 24/10**: mọi ô chọn (`<select>` mặc định của trình duyệt, 22 chỗ) thay bằng `Select` của `@aris/ui-kit/react`: chọn bot có linh vật, tên, mô tả ngắn, chia nhóm theo phòng ban hoặc trong/ngoài dự án; phòng ban có chữ cái đầu và số bot; model chia theo nhà cung cấp, có ô tìm. Danh sách vẽ ở `document.body` nên không bị hộp thoại cắt, hết chỗ thì mở lên trên. Lựa chọn dựng sẵn ở `aris-ui-pages/src/client/options.tsx`. Kanban: "Thêm thẻ" thành "Thêm việc", "Thẻ mới" thành "Việc mới". Sửa kèm: danh mục model chưa từng được gửi lên giao diện nên ô chọn model của bot và phòng ban chỉ có "mặc định".

> **Hồ sơ bot đợt 1/4 xong 24/10 — Skill & tool, kết nối nền tảng (MCP) theo bot** ([đặc tả](specs/aris-bots.md#hồ-sơ-bot--skill--tool-bản-vẽ-22-22c), bản vẽ 2.2, 2.2c): mỗi bot có máy chủ MCP riêng (mẫu GitHub, Lark, Notion hoặc tự thêm), gắn vào đúng phiên của bot nên bot khác không thấy; hỏi trước khi ghi; bộ công cụ bật/tắt theo bot. Phần thuộc giai đoạn sau hiện mờ, ghi rõ giai đoạn. Chạy thử thật với máy chủ thử trên máy: Khoa dùng được, Minh không thấy, Aris giao việc cho Khoa cũng dùng được. Còn 3 đợt: Quyền & kênh và cột phải; Model theo việc; Tính cách.

> **Nhân bản và xuất bot xong 24/10** ([đặc tả](specs/aris-bots.md#nhân-bản-xuất-nhập-bản-vẽ-24), bản vẽ 2.4): hộp "Nhân bản / xuất" nối dữ liệu thật; chọn cấu hình và model, tính cách, ký ức riêng của bot; kênh nhắn tin, khoá API, lịch sử chat không bao giờ chép; skill để giai đoạn 3. Xuất ra tệp `.aris-bot.json`, nhập lại bằng "Nhập từ tệp…" ở hộp Tạo bot. Chạy thử thật: nhân bản Minh kèm ký ức, xuất rồi nhập lại, tên gọi và phòng ban đúng.

> **Bước 6 xong 24/10 — duyệt tập trung** ([đặc tả](specs/aris-commander.md#duyệt-tập-trung-bước-6)): yêu cầu quyền của bot ngoài và bot trong đội về một hộp chung. Bot trong đội trước đây bị dsh tự từ chối mọi thao tác cần duyệt; nay khi được giao việc, phiên con chuyển sang "hỏi". Web: thanh duyệt trên ô nhập hiện cả bot trong đội, thanh bên đếm thật số việc đợi duyệt. Telegram: thẻ "CẦN DUYỆT · tên bot" có nút theo bản vẽ 7.1; bấm ở đâu trước thì ăn, thẻ tự cập nhật. Chạy thử thật: giao Khoa ghi tệp ra Desktop → thanh duyệt web và thanh bên hiện "1 việc", thẻ tới Telegram, bấm Cho phép trên Telegram → Khoa tạo tệp đúng nội dung.

> **Bước 5 xong 24/10 — chuyển giao và kênh riêng của bot** ([đặc tả](specs/aris-commander.md#chuyển-giao-chuyen_giao-chỉ-commander-bước-5)): theo bản vẽ 1.8. `chuyen_giao` cho Commander: bot đích làm, câu trả lời của bot hiện thẳng cho người dùng như lời của bot (lượt riêng có linh vật, vạch màu, nút "Nhắn tiếp với …"), Aris kết thúc lượt không viết thêm, tin kế tiếp về Aris. Kênh riêng: trang 6.3 gắn tài khoản Telegram cho từng bot, nhắn riêng tài khoản đó là chat với bot đó; hồ sơ bot hiện kênh riêng. Telegram gửi câu trả lời chuyển giao như lời của bot đích (nút mở chat với bot đích, trong nhóm do chính tài khoản của bot trả lời). Kèm theo: menu `@` có nhóm "Đội bot"; linh vật màn trống theo bot của phiên; `@tên_gọi` trên Telegram thành chấm màu + tên. Chạy thử thật trên web: "Chuyển hẳn cho Thơ viết 2 câu slogan…" → Aris chuyển cho Thơ, bài của Thơ hiện thành lượt của Thơ, Aris không viết thêm. Telegram thử thật đạt: chuyển giao qua bot Aris (lời của Thơ mở đầu bằng tên thành viên), tài khoản Telegram riêng của một bot trả lời bằng giọng của bot đó.

> **Đầu tin nổi bật xong 24/10** (bản vẽ 1.7b, phương án B): mỗi lượt có linh vật ở cột trái, tên mang màu linh vật, phần trả lời thụt vào và có vạch màu dọc tới hết lượt; chỗ đổi người lộ rõ khi lướt. Đã xem trên phiên Aris (kèm thẻ kết quả của Kiệt), phiên riêng của Minh, phiên bot con của Phát. Kèm sửa cột phải: việc gần đây dùng biểu tượng tĩnh theo loại mốc.

> **Ai đang nói xong 24/10** ([đặc tả](specs/aris-commander.md#giao-diện), bản vẽ 1.7): mỗi lượt trả lời có đầu tin của người trả lời (Aris "Điều phối", hoặc bot của phiên riêng với chức danh). `@tên` của bot trong tin của người dùng và trong câu trả lời thành tên thành viên (linh vật, nền theo màu linh vật, bấm mở hồ sơ). Kết quả bot ngoài và báo cáo việc lớn về phiên thành thẻ của bot đó, không còn đội lốt tin của người dùng. Kèm sửa hộp Thêm bot ngoài: thẻ chọn agent và mức quyền có viền, lề đều. Chạy thử thật: giao `@kiet` đọc README trong repo, tin của người dùng hiện tên Kiệt, Aris có đầu tin trên khối quá trình, Kiệt nộp kết quả thành thẻ "Kiệt · bot ngoài · Claude Code"; phiên riêng của Minh có đầu tin Minh và tên Khoa trong câu trả lời.

> **Bước 4 xong 24/10 — bot ngoài** ([đặc tả](specs/aris-commander.md#bot-ngoài-bước-4)): theo bản vẽ 2.1b, 2.1c (vẽ lại theo bộ chuyển tự viết). Máy có CLI thì aris tự chạy: Claude Code bằng `claude -p` luồng `stream-json`, Codex bằng `codex app-server`; không có CLI hoặc agent ACP thì dùng plugin chính thức của dsh (dự phòng). Nhánh trong chat hiện từng bước (đọc, sửa, chạy lệnh…), bot ngoài xin quyền thì hỏi người dùng (thẻ trên nhánh và thanh duyệt trên ô nhập; Claude Code qua máy chủ MCP `approve-mcp.mjs`, Codex qua yêu cầu duyệt của app-server; 15 phút không trả lời thì từ chối), chi phí và trần tiền mỗi việc (Claude Code), giao lại cùng bot trong cùng phiên thì làm tiếp phiên cũ. Mỗi việc một worktree riêng; đường dẫn repo trong việc đổi sang worktree. Chạy thử thật: Kiệt (Claude Code, hỏi người dùng) chạy lệnh, đọc README, ghi NOTES-kiet.md trong worktree, duyệt trên thanh duyệt, xong sau 1 phút, 4 bước, 0,15 / 3,00 USD; Lan (Codex, hỏi người dùng) đếm 21 gói và ghi NOTES-lan.md trong worktree, hai lần duyệt, kết quả về Aris; Dừng giữa chừng đúng. Lần thử đầu của Codex lộ hai lỗi đã sửa: daemon sập vì ghi vào tiến trình codex đã tắt (EPIPE), yêu cầu quyền mất do ghi bản ghi chồng nhau (nay xếp hàng `updateRun`). Còn lại: ACP chỉ có đường plugin, chưa có "hỏi người dùng".
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

> **Chia 5 đợt (duyệt 24/10)**: (1) vòng học nền và Hộp duyệt chung, (2) hồ sơ chủ nhân có độ tin cậy, (3) skill tự tạo và tự vá, (4) kiểm thử bằng chạy lại phiên cũ, dọn kho skill, Commander tự học, (5) `/goal` có giám khảo, `/loop`, `/heartbeat`, màn Việc đang chạy. Mức mặc định: model Flash cho vòng học, ~20 nghìn token mỗi lần, 0,30 USD mỗi ngày cho cả đội, ký ức bot tự suy ra và skill luôn chờ duyệt, hạn duyệt 7 ngày.

> **Đợt 6 (bù so với Hermes) xong 24/10 — `/learn`, hợp đồng hoàn thành và `/subgoal`, người dọn kho có báo cáo** ([skill](specs/aris-skills.md#đợt-6--bù-so-với-hermes-learn-người-dọn-kho-có-báo-cáo), [tự trị](specs/aris-autonomy.md#đợt-6--hợp-đồng-hoàn-thành-và-subgoal)): sau khi đối chiếu tài liệu Hermes bản đang cài (nhật ký clean-room 24/10). `/learn <nguồn>` mở một lượt cho bot tự gom tài liệu (thư mục, tệp, URL, quy trình tả bằng lời) rồi nộp skill qua `luu_skill` (chỉ nhận trong lượt đó) thành đề xuất chờ duyệt, kèm 1–3 ca thử; Hộp duyệt ghi "Học bằng /learn". `/goal` mới được model rẻ soạn hợp đồng hoàn thành (xong khi, chứng minh bằng, không được làm hỏng, phạm vi, dừng khi); bước đầu chờ hợp đồng rồi nhận lời báo; `/subgoal` thêm tiêu chí, không kèm chữ thì xem hợp đồng; giám khảo chỉ chấm xong khi có bằng chứng đúng phần chứng minh và đạt mọi tiêu chí; màn 3.5 hiện hợp đồng và tiêu chí. Người dọn kho theo mốc mới của Hermes: 30 ngày ít dùng, 90 ngày cất kho; mỗi lần chạy ghi báo cáo (giữ 30 lần), `?curator=preview` chạy thử; màn 3.2 hiện mốc, kết quả lần gần nhất và lần tới sẽ cất gì. Chạy thử thật: `/goal` ghi tệp liệt kê lệnh kèm hợp đồng ⇒ bot tự đối chiếu bằng `cat`/`wc`/`grep` đúng phần chứng minh, giám khảo chấm xong (3 lệnh, đúng); `/subgoal` "cuối tệp có dòng tổng" ⇒ tệp có dòng tổng 1130 dòng, giám khảo chấm cả tiêu chí; `/learn` tài liệu `aris-autonomy.md` ⇒ đề xuất `theo-doi-dinh-ky-bang-loop-heartbeat` v1, 8 bước, 3 ca thử, không cảnh báo, 20 giây. Sửa ba lỗi lộ ra khi thử: trần 1.500 token làm model rẻ không kịp trả hợp đồng (nâng 3.000, ghi log khi hỏng); model lặp nhãn "xong khi:" trong nội dung; giám khảo chấm lại câu xác nhận sau khi mục tiêu đã xong. Còn để sau: bảng nhập cho nút "Học skill từ tài liệu…" (chưa vẽ; nút hướng dẫn dùng `/learn`), phán quyết "chờ" của `/goal`, gộp skill trùng bằng model.

> **Đợt 5 xong 24/10 — Tự trị: `/goal` có giám khảo, `/loop`, `/heartbeat`, màn Việc đang chạy** ([đặc tả](specs/aris-autonomy.md)): gói mới `@aris/autonomy`. `/goal` của dsh có trần mặc định 20 lượt; cuối mỗi lượt của mục tiêu đang chạy, model rẻ chấm xong / tiếp / cần người dùng ngay trước khi lượt đóng (dsh chờ bước này), nên mục tiêu xong hay bị chặn được ghi trước khi dsh gửi lượt tiếp; còn thiếu thì lời giám khảo được gắn vào lượt kế; ba lượt liền cùng một điều còn thiếu thì chặn với lý do "không tiến triển"; bot tự đánh dấu xong thì vẫn chấm để hiện. `/loop 5m <việc>`, `/loop <việc>` (tự điều nhịp: 1 phút, không đổi thì gấp đôi tới 15 phút), `/loop dừng`, `/heartbeat [30m] [điều cần để ý]`, `/heartbeat tắt` chạy trên lịch nhắc bền của dsh. Màn 3.5 dùng dữ liệu thật: mục tiêu (lượt, lời giám khảo, Tạm dừng / Chạy tiếp / Huỷ / Mở phiên), việc giao trong 24 giờ (đang làm / xong / vấp, chờ duyệt), vòng lặp và nhịp tim (nhịp, số lần, lần kế, Dừng), Dừng tất cả; điểm khôi phục để mờ. Chạy thử thật: hai mục tiêu đọc repo xong trong 1 lượt, giám khảo chấm "xong" đúng số liệu; `/loop <việc>` tự điều nhịp chạy 3 lần, bot trả "không đổi" ⇒ nhịp 1 → 2 → 4 phút, lịch nhắc của dsh đổi theo; nút Dừng và Dừng tất cả xoá lịch nhắc. Việc giao không có kết quả (giao trước khi có ghi kết quả, hay daemon khởi động lại giữa lượt) hiện "không rõ kết quả" thay vì "đang làm". Màn 3.5 chưa có lối vào từ thanh bên (Bảng điều khiển đã gỡ khỏi Cài đặt), gom vào đợt revamp menu.

> **Đợt 4 xong 24/10 — Kiểm thử, dọn kho, Commander tự học** ([đặc tả skill](specs/aris-skills.md#đợt-4--kiểm-thử-dọn-kho), [Commander](specs/aris-commander.md#commander-tự-học-giai-đoạn-3-đợt-4)): ca thử là yêu cầu thật của người dùng (lúc vòng học đề xuất và mỗi lần skill được dùng, giữ 5 ca); "Chạy kiểm thử" ở màn 3.3 chạy mỗi ca hai lần trong phiên mới của đúng bot (bản so sánh và bản thử), hộp cát chỉ đọc (đọc tệp, tìm, lệnh git/ls/cat…; lệnh ghi, chạy chương trình, mạng bị chặn), một lần gọi model rẻ chấm đạt / không, trần 5 ca và 0,20 USD. Màn 3.3 hiện Đạt, Số bước, Token, bảng ca thử; 3.2 có cột Thành công. Người dọn kho chạy mỗi ngày: 14 ngày không dùng là "ít dùng", 30 ngày thì cất vào kho; ghim, tắt (cất kho), dùng lại, sao lưu ra tệp. `giao_viec` có tham số `loai`; kết quả lượt của bot ghi vào nhật ký giao việc; trang 2.5 "Commander đã học" và ngữ cảnh của Commander dùng thống kê bot × loại việc. Chạy thử thật: kiểm thử `kiem-tra-repo` (1 ca) chạy trọn vòng, 0,01 USD mỗi lần; sửa hai lỗi lộ ra khi thử (hộp cát chặn nhầm `git -C … log`, `2>/dev/null`; lời nhắc lưu ký ức chen vào câu trả lời cuối của phiên kiểm thử). Kết quả thật cho thấy skill này chưa hơn bản không skill (Aris đã nhớ định dạng 3 dòng qua ký ức). Commander giao Minh "tóm tắt 3 lợi ích của AI" ⇒ ghi loại "tóm tắt nghiên cứu", xong. Tiêu chí "ít bước hơn ≥ 30%" chưa đo được: cần skill cho việc nhiều bước hơn và nhiều ca hơn. "Học skill từ tài liệu" để sau.

> **Đợt 3 xong 24/10 — Skill tự tạo và tự vá** ([đặc tả](specs/aris-skills.md)): gói mới `@aris/skills` giữ skill riêng của từng bot theo bản (đề xuất → đang dùng → thay; khôi phục bản cũ), bộ kiểm "bài học, không phải nhật ký" (lỗi thì bỏ, cảnh báo thì hiện). Vòng học nền được đề xuất tối đa một skill mỗi lần khi đoạn học là việc nhiều bước, lỗi rồi tìm ra cách, hoặc vừa dùng skill (khi đó là bản vá, thấy thân skill hiện tại). Mỗi agent được gắn một nguồn skill trong phạm vi của nó: chỉ thấy bản đang dùng của skill thuộc bot của phiên, nạp qua công cụ `skill` của dsh; đếm lượt dùng. Duyệt ở Hộp duyệt (loại Skill), thẻ "ĐỀ XUẤT SKILL" trên Telegram (Bật / Không), màn 3.3 (so sánh từng dòng, Từ chối / Sửa rồi bật / Duyệt và bật, lịch sử và khôi phục); màn 3.2 dùng dữ liệu thật. Kiểm thử, dọn kho, ghim, tỉ lệ thành công để mờ (đợt 4). Chạy thử thật: Aris tự kiểm tra repo nhiều bước, người dùng khen và dặn lần sau làm như vậy ⇒ đề xuất `kiem-tra-repo` v1 (7 bước, có mục lỗi thường gặp), 0,0062 USD. Bật v1 (người dùng cho phép thử) ⇒ phiên mới của Aris tự nạp skill khi được nhờ kiểm tra repo, trả lời đúng 3 dòng như skill, lượt dùng tăng 1; Minh trả lời danh mục skill của mình không có `kiem-tra-repo`.

> **Đợt 2 xong 24/10 — Hồ sơ chủ nhân** ([đặc tả](specs/aris-reflect.md#hồ-sơ-chủ-nhân-đợt-2-màn-23)): mỗi bot có hồ sơ riêng về người dùng gồm các nhận định (cách giao tiếp; công việc và mục tiêu) có độ tin cậy và bằng chứng; chỉ vòng học nền ghi (mỗi lần học trả thêm tối đa 3 quan sát, cùng ý thì cộng bằng chứng, ngược ý thì hạ độ tin cậy và hỏi người dùng). Độ tin cậy do aris tính (0,4, mỗi lần thấy thêm tăng dần, thấy 4 lần vượt 0,8); nhận định từ 0,8 trở lên hoặc đã xác nhận nạp vào prompt của bot. Màn 2.3 dùng dữ liệu thật: ô "chưa chắc" có lựa chọn, Đúng / Sửa / Sai, bằng chứng mở đúng phiên, chép sang bot khác. Chạy thử thật: chê câu trả lời dài ⇒ 2 nhận định của Aris (đọc trên điện thoại cần mỗi mục một dòng; đang làm kênh YouTube về AI), 40%, có trích dẫn. Nằm trong gói `@aris/reflect` thay vì gói riêng `aris-user-model` vì chỉ vòng học ghi.

> **Đợt 1 xong 24/10 — Vòng học nền và Hộp duyệt chung** ([đặc tả](specs/aris-reflect.md)): gói mới `@aris/reflect` theo dõi từng lượt; bị sửa sai, dặn nhớ, khen, việc dài, lỗi rồi tìm ra cách (cộng lưới an toàn 12 lượt) thì chạy nền một lần gọi model Flash đọc lại và đề xuất tối đa 3 ký ức. Mọi ký ức bot tự suy ra (vòng học, tool `memory` không phải lời người dùng, lúc nén) đều chờ duyệt, quá 7 ngày tự bỏ; nguồn ngoài chỉ vào lưu trữ. Hộp duyệt (3.4) gom yêu cầu quyền và đề xuất ký ức thật, sửa được câu và tầng trước khi lưu; thẻ "GHI NHỚ" trên Telegram có Lưu / Sửa / Bỏ. Tiền vòng học ghi vào sổ chi phí (phạm vi `reflect`). Chạy thử thật: bị sửa sai một lần ⇒ 2 đề xuất bài học có lý do và bằng chứng, 0,0023 USD. Gợi ý luật, skill trong Hộp duyệt để đợt sau.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-reflect` | Vòng học chạy nền qua `ctx.jobs`, kích hoạt theo **tín hiệu** (bị sửa sai, "nhớ nhé", nhiều bước, lỗi rồi tìm ra cách) + lưới an toàn theo bộ đếm; fork phiên để trúng prompt cache; đầu ra JSON có schema; trần token/lần và /ngày |
| `aris-user-model` | Nhận định về anh có độ tin cậy và bằng chứng; chỉ vòng học được cập nhật; ≥ 0,8 mới vào prompt |
| `aris-skill-forge` | Tạo/vá skill (`SKILL.md`), linter "bài học, không phải nhật ký"; **kiểm thử bằng chạy lại phiên cũ** trong sandbox không mạng; vòng đời nháp → ứng viên → đang dùng; Commander học "ai làm tốt việc gì" |
| `aris-curator` | Skill không dùng 30 ngày → ít dùng, 90 ngày → lưu kho (đợt 6; ban đầu 14/30); ghim; sao lưu và quay lui |
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
| Webhook | **Chuyển sang giai đoạn 7 (25/10)**: aris đang chạy trong máy, dịch vụ ngoài không gọi tới được; routine chế độ script (kiểm tra định kỳ) thay phần lớn nhu cầu tới khi lên server |
| Trình duyệt tự động (bù Hermes) | Cắm MCP trình duyệt (Playwright hoặc Chrome DevTools) làm bộ công cụ bật theo bot, quyền hỏi trước khi gửi biểu mẫu; dsh bản ghim không có gói trình duyệt. Routine như "tin đối thủ trong tuần" cần đọc web động |
| Điểm khôi phục tệp (bù Hermes) | Chụp thư mục làm việc (git ẩn) trước khi bot sửa tệp; "Xem khác biệt" và "Khôi phục" ở màn 3.5 (phần đang để mờ); bắt buộc cho routine chạy không người trông |

> **Chia 4 đợt (duyệt 24–25/10)**: (1) lõi routine và màn 4.1 dữ liệu thật, (2) tạo routine bằng lời (4.2), công cụ tạo routine cho Commander, chế độ chỉ chạy script, (3) thẻ báo cáo 7.2 trên Telegram và tab Routine của hồ sơ bot (vẽ 2.2e trước), (4) Driver Kanban (webhook chuyển sang giai đoạn 7, quyết định 25/10). Trình duyệt tự động và điểm khôi phục tệp xếp vào các đợt khi tới. Mức mặc định: giờ Việt Nam, chạy bù nếu trễ dưới 3 giờ, quyền chỉ đọc (việc khác hỏi qua Telegram, quá hạn bỏ), lỗi 2 lần liên tiếp thì cảnh báo, trần 0,10 USD mỗi lần chạy.

> **Đợt 1 xong 25/10 — Lõi routine và màn 4.1** ([đặc tả](specs/aris-routine.md)): gói mới `@aris/routine` giữ bộ hẹn giờ riêng (vòng kiểm 30 giây) vì lịch nhắc của dsh giao vào phiên có sẵn, còn routine cần phiên mới mỗi lần. Lịch cron 5 trường theo múi giờ (đúng cả giờ mùa hè), viết thành chữ ("Thứ 2–6, 07:30"). Mỗi lần chạy mở phiên mới của bot (model của bot), lời dặn "không người trông"; quyền chỉ đọc: công cụ đọc và lệnh bash chỉ đọc chạy luôn, việc khác thành thẻ duyệt gửi về Telegram của bot; trần tiền, quá 15 phút thì huỷ; xong thì gửi "ROUTINE · tên" kèm kết quả về Telegram. Chạy bù trong 3 giờ, quá thì ghi "lỡ"; daemon dừng giữa lượt thì ghi lỗi; lỗi 2 lần liên tiếp gửi cảnh báo một lần. Vòng học nền và lời nhắc ký ức bỏ qua phiên routine. API `/api/aris/routines` (tạo, sửa, bật/tắt, xoá, chạy ngay, dừng, tạm dừng tất cả, nhờ bot sửa). Màn 4.1 dữ liệu thật: lịch, gửi về, lần chạy gần nhất, công tắc, lần kế, tạm dừng / chạy lại tất cả, thanh cảnh báo có "Xem lần chạy" và "Để <bot> sửa". Bộ lọc "lệnh bash chỉ đọc" (dùng chung với hộp cát kiểm thử skill) nhận thêm gán biến, `find -exec` và `xargs` với lệnh đọc. Chạy thử thật: routine "đếm tệp" của Aris chạy đúng giờ hẹn (trễ 21 giây do vòng kiểm), lần kế hẹn sang hôm sau; hai lần đầu bot viết lệnh bash phức tạp ($(…), if) nên bị hỏi duyệt qua Telegram và em dừng tay (nút Dừng chạy đúng, thẻ duyệt được thu lại); thêm lời dặn dùng công cụ đọc và lệnh đơn giản ⇒ lần chạy tay xong, "6 tệp, 896 dòng" khớp thực tế, 0,0037 USD. Routine thử để tắt. Chưa thử thật: cảnh báo lỗi liên tiếp và "Để <bot> sửa". Chưa có cách tạo routine trên giao diện (4.2 là đợt 2), hiện tạo qua API.

> **Đợt 2 xong 25/10 — Tạo routine bằng lời, chế độ chỉ chạy script, công cụ của Commander** ([đặc tả](specs/aris-routine.md#đợt-2--tạo-bằng-lời-chế-độ-chỉ-chạy-script-công-cụ-của-commander)): màn 4.2 dữ liệu thật: gõ mô tả, ngừng 1,5 giây thì model rẻ diễn giải thành bản nháp (tên, bot, lịch kèm 3 lần tới, cách chạy, việc hay lệnh, gửi về, quyền, chạy bù), "rõ ràng" hay "cần nói rõ hơn" kèm câu hỏi, từng dòng sửa tại chỗ; Chạy thử ngay (lưu tắt rồi chạy, hiện kết quả, mở phiên), Lưu tạm dừng, Lưu routine. Chế độ chỉ chạy script: một lệnh shell, không AI, môi trường tối thiểu, quá 2 phút huỷ, chỉ gửi khi lệnh in ra gì đó; bản nháp chỉ chọn script khi người dùng đưa nguyên lệnh. Công cụ `tao_routine` (chỉ Commander) lưu ở trạng thái tắt, `bat: true` hay `bat_routine` thì hỏi duyệt rồi mới bật. Bot chưa có Telegram riêng thì kết quả, thẻ duyệt, cảnh báo đi qua Telegram của Aris (ghi tên bot). Chạy thử thật: "9 giờ sáng thứ 2 hằng tuần, Khoa xem các commit tuần qua…" ⇒ bản nháp đúng (Khoa, Thứ 2 09:00, 3 lần tới đúng các thứ Hai), chạy thử xong ~30 giây, 0,007 USD, tóm tắt 5 thay đổi đúng với commit; script `df -h / | tail -1` từ câu mô tả ⇒ giữ nguyên lệnh, chạy dưới 4 giây, 0 USD; nhờ Aris tạo routine "chưa bật" ⇒ lưu tắt, lần đầu đúng; bảo "bật lên" ⇒ thẻ duyệt có tóm tắt và 3 lần tới (em bấm Từ chối). Sửa ba chỗ lộ ra khi thử: bộ lọc bash cắt lệnh ở dấu `|` nằm trong ngoặc; lệnh bash không chắc chỉ đọc trong routine giờ bị từ chối kèm hướng dẫn viết lại thay vì chờ duyệt 10 phút (hành động thật vẫn hỏi); thiếu công cụ bật routine có sẵn (thêm `bat_routine`). Năm routine thử để tắt.

> **Đợt 3 xong 25/10 — Thẻ báo cáo 7.2 trên Telegram, tab Routine của hồ sơ bot (2.2e)** ([đặc tả](specs/aris-routine.md#đợt-3--thẻ-báo-cáo-72-trên-telegram-tab-routine-của-hồ-sơ-bot-22e)): bản vẽ 2.2e duyệt 25/10. Kết quả routine gửi thành thẻ: "ROUTINE · tên" (qua Aris thì thêm tên bot làm việc), ngày giờ chạy, nội dung; dài thì nút "Xem chi tiết"; nút "Hỏi <bot>" chuyển chat sang phiên của lần chạy để hỏi tiếp; bot kết thúc bằng dòng "GỢI Ý: …" thì thành nút, bấm như tự gõ. Nút vẫn bấm được sau khi aris khởi động lại. Tab "Routine · N" trong hồ sơ bot: routine của bot, lịch kèm lần kế, gửi về (riêng hay qua Aris), lần chạy gần nhất, công tắc; cảnh báo lỗi liên tiếp; lần chạy gần đây 7 ngày có tiền và "Mở phiên"; chưa có thì lời giải thích và nút tạo; "+ Routine cho <bot>" mở 4.2 đặt sẵn bot. Chạy thử thật: tab Routine của Khoa hiện 2 routine và 4 lần chạy gần đây; chạy tay "Tóm tắt 5 thay đổi commit tuần qua" ⇒ xong, 0,008 USD, bot gợi ý "Tóm tắt tuần này theo từng giai đoạn", thẻ gửi về Telegram qua Aris không lỗi. Chưa xác nhận trên điện thoại: hình thẻ và ba nút.

> **Đợt 4 xong 25/10 — Driver Kanban** ([đặc tả](specs/aris-projects.md#driver--tự-đẩy-việc-trên-bảng-giai-đoạn-4-đợt-4)): nghiên cứu kỹ Kanban của Hermes trước (tài liệu, nhật ký clean-room 25/10). Webhook chuyển sang giai đoạn 7 (quyết định 25/10). `tao_the` nhận bot dự kiến cho từng thẻ; Driver bật theo dự án (nút "Driver" trên 4.3, mặc định tắt), mỗi 30 giây đọc bảng từ log phiên chính: thẻ đủ phụ thuộc có bot dự kiến thì giao thẳng bằng đường của `giao_viec` (không tốn lượt của Aris) kèm kết quả các thẻ trước; thẻ sẵn sàng chưa có bot dự kiến thì đánh thức Aris một lần; thẻ vấp thì giao lại một lần, vấp 2 lần thì dừng và báo Telegram; thẻ đã giao 30 phút chưa có kết quả thì báo kẹt; xong hết thì báo. Câu trả lời cuối của bot được ghi vào nhật ký giao việc. Thẻ chờ hiện bot dự kiến ("dự kiến, chờ tới lượt"), thẻ vấp và kẹt có nhãn riêng; trang Commander dẫn về Kanban. Chạy thử thật trên "Thử dự án aris": Aris chia 2 thẻ (Minh → Thơ, thẻ 2 chờ thẻ 1) và không giao ⇒ Driver giao thẻ 1 cho Minh, 30 giây sau khi Minh xong thì giao thẻ 2 cho Thơ, lời giao có "Kết quả các thẻ làm trước" đúng câu trả lời của Minh, Thơ đáp đúng từng ý. Sửa một lỗi lộ ra khi thử: câu trả lời của bot không được ghi (đọc sai cấu trúc tin nhắn) nên lần đầu thẻ sau thiếu bàn giao. Chưa thử thật: giao lại khi vấp, dừng sau 2 lần vấp, báo kẹt, đánh thức Aris khi thẻ không có bot dự kiến (có test). Driver của "Thử dự án aris" để bật.

> **Đợt 5 (thêm 25/10) — Điểm khôi phục tệp, trình duyệt tự động** ([điểm khôi phục](specs/aris-checkpoints.md), [trình duyệt](specs/aris-bots.md)): gói mới `@aris/checkpoints` chụp thư mục làm việc vào kho git ẩn dùng chung `~/.aris/checkpoints` trước `write`, `edit` và lệnh bash không chắc chỉ đọc, mỗi thư mục mỗi lượt một lần, không đụng `.git` thật; bỏ tệp quá 10 MB, thư mục nặng, thư mục quá rộng; giữ 20 điểm mỗi thư mục, 7 ngày. Màn 3.5 "Điểm khôi phục" dữ liệu thật: "Trước khi <bot> sửa N tệp trong <thư mục>", Xem khác biệt, Khôi phục (hỏi lại, chụp trạng thái hiện tại trước); lệnh `/rollback`. Đã tìm lại: dsh bản ghim không có công cụ trình duyệt cho bot (chỉ có `web_search`/`web_fetch` đọc chữ, tab trình duyệt cho người dùng, DevTools để gỡ lỗi dsh), nên thêm mẫu kết nối "Trình duyệt" chạy Playwright MCP bản ghim `0.0.83` (ẩn, hồ sơ riêng mỗi lần, dùng Chrome đã cài); đọc trang dùng luôn, bấm và gõ hỏi trước; routine chỉ đọc dùng được công cụ đọc của MCP. Chạy thử thật: nhờ Aris sửa `ghi-chu-goal.md` và tạo `moi-tao.txt` ⇒ một điểm trước lần sửa đầu, màn 3.5 ghi "sửa 2 tệp", khác biệt đúng; Khôi phục ⇒ tệp mới bị xoá, tệp sửa về bản cũ, có điểm "Trước khi khôi phục". Trình duyệt chạy thật (người dùng đồng ý tải gói): Minh tự mở Hacker News đọc tiêu đề không hỏi, bấm vào bài thì hỏi duyệt, duyệt xong trả lời đúng (43 giây, 153K token vì ảnh chụp trang dài). Máy chủ không đánh dấu `browser_navigate` là chỉ đọc nên aris tự coi các công cụ xem (mở trang, quay lại, tab, đóng, đổi cỡ, rê chuột) là chỉ đọc; tệp chụp trang của Playwright ghi vào thư mục tạm của hệ thống thay vì thư mục làm việc của bot. Đã cân nhắc browser-use (một agent riêng cần khoá LLM thứ hai, không duyệt được từng cú bấm) và tự viết bộ công cụ như Hermes: chưa cần; giữ phiên đăng nhập thì thêm mẫu kết nối có hồ sơ riêng sau. Chưa thử thật `/rollback`.

> **Chạy thử thật nốt (25/10)**: `/rollback` (liệt kê, `diff`, khôi phục một tệp, khôi phục cả thư mục; tệp tạo sau bị xoá) đúng. Routine lỗi liên tiếp: lần 1 do aris khởi động lại giữa lượt, lần 2 do lệnh script hỏng ⇒ cảnh báo về Telegram của Aris đúng ở lần thứ 2; dừng tay không tính lỗi; "Để Minh sửa" mở đúng phiên. Driver báo kẹt: khởi động lại aris giữa lúc Minh làm thẻ ⇒ thẻ không có kết quả, sau 30 phút Driver ghi kẹt và báo Telegram. Driver giao lại / bỏ cuộc: có bài thử tự động nhưng chưa kích hoạt được trên thực tế, vì khi bot còn kịp báo cáo thì Aris (trưởng nhóm) tự ghi kết quả và đánh dấu xong thẻ trước nhịp kế của Driver; Driver chỉ cần khi bot vấp mà không báo được (model lỗi giữa lượt). Lỗi tìm ra và đã sửa: bot chạm trần tiền mỗi việc thì thẻ vẫn bị đánh dấu xong (nay tính là vấp); routine chỉ đọc hỏi duyệt cả `list_mcp_resources`/`read_mcp_resource` làm lần chạy treo; nút "Để bot sửa" bị ẩn khi lần lỗi mới nhất là script; lịch một ngày trong năm hiện nguyên chuỗi cron. Còn lại của nghiệm thu: Mai cần kết nối email và lịch (người dùng chuẩn bị khoá).

**Giao diện**: 4.1 Routine, 4.2 Tạo routine, 4.3 Kanban, 7.2 Thẻ báo cáo routine. Thêm tab **Routine · N** trong hồ sơ bot (bản vẽ 2.2 có nhãn tab nhưng chưa vẽ nội dung; vẽ 2.2e trước: bảng routine của bot như 4.1, lọc theo bot, nút "+ Routine cho <bot>", cảnh báo routine lỗi) — ghi nhận 24/10.

**Nghiệm thu**: 8h sáng thứ 2–6 Mai tự gửi tóm tắt email và lịch về Telegram; một dự án được chia thành thẻ, các bot làm lần lượt theo phụ thuộc.

> **Nghiệm thu 25/10**: người dùng duyệt giai đoạn 4. Đạt: dự án chia thành thẻ, bot làm lần lượt theo phụ thuộc (đợt 4); routine gửi Telegram đúng giờ, chạy bù, báo lỗi liên tiếp (đợt 1–3, chạy thử nốt). Để sau: Mai đọc email và lịch qua Lark (người dùng tạo ứng dụng Lark và cấp quyền khi sẵn sàng; aris đã có mẫu kết nối Lark).

---

## Giai đoạn 5 · Second Brain và đồ thị (tuần 14–16)

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-brain` | Kho ghi chú Markdown (mở được bằng Obsidian, có git); Hộp thư vào nhận tin chuyển tiếp, link, ảnh, ghi âm từ Telegram/Lark/Zalo hoặc `/note`; xử lý nền: chép lời, tóm tắt, gắn thẻ, đề xuất chỗ xếp, trích người/dự án/ngày hẹn |
| Tìm kiếm | SQLite FTS5 + chỉ mục vector (model nhúng qua `aris-providers`, có thể chạy Ollama trên máy); "Hỏi bộ não" trả lời có trích dẫn; tool `brain_search`, `brain_capture`; phân quyền đọc/ghi theo bot |
| Giọng nói và ảnh (bù Hermes) | Trả lời bằng giọng trên Telegram (đọc văn bản, có giọng tiếng Việt), tạo ảnh từ lời mô tả; qua MCP hoặc công cụ gọi API, bật theo bot |
| Hiểu chủ nhân sâu (bù Hermes) | Hồ sơ chủ nhân suy luận thường xuyên hơn (mỗi vài lượt, nhiều vòng: suy, tự soát, hoà giải), làm nóng đầu phiên, tìm theo nghĩa trên các nhận định; dùng chung chỉ mục vector của Second Brain |
| `aris-graph` | Chỉ mục cạnh: `[[liên kết]]`, thực thể, nguồn gốc ký ức; gợi ý nối; đồ thị quanh ghi chú (2D) và đồ thị toàn cục (3D) |

> **Định hướng chốt 25/10, chưa làm** ([đặc tả](specs/aris-brain.md)): lấy mẫu "LLM Wiki" của Karpathy làm gốc: ba lớp Nguồn (bất biến) / Wiki (bot viết) / Luật (`AGENTS.md`), ba thao tác Nạp / Hỏi / Soát, `index.md` và `log.md`. Kho `~/aris/brain` chia hai không gian Cá nhân và Công ty cùng một khuôn; Công ty có `wiki/chung/` và `wiki/phong-ban/<mã>/`. Thêm bot mặc định **Thủ thư** là người duy nhất ghi wiki; các bot khác tra qua `brain_search`/`brain_read` theo quyền và gửi nguồn qua `brain_capture`, có lời dặn ngắn, bản đồ mục lục và nhắc theo tên. Tìm từ khoá trước, tìm theo nghĩa để đợt cuối. Giọng nói trên Telegram (chép lời, `/voice`) đã có từ trước; còn tạo ảnh. Kênh Lark, Zalo chưa có. Chia đợt và bản vẽ còn bàn tiếp.

> **Đợt 1 xong 25/10 — Kho, chỉ mục, công cụ đọc, Thủ thư, màn 5.1** ([đặc tả](specs/aris-brain.md#đợt-1--kho-chỉ-mục-công-cụ-đọc-thủ-thư-màn-51-xong-2510)): gói mới `@aris/brain` tạo kho `~/aris/brain` theo khuôn (luật `AGENTS.md`, mẫu trang, thư mục phòng ban), git thật (aris commit ngay, Obsidian gom 10 phút), chỉ mục tìm từ khoá bỏ dấu ở `~/.aris/brain`, `brain_search`/`brain_read` lọc theo quyền, chặn bot đọc thẳng kho, bot Thủ thư mặc định, màn 5.1 dữ liệu thật (bản vẽ duyệt 25/10). Chạy thử thật đạt cả 5 điểm nghiệm thu của đợt.

> **Đợt 2a xong 25/10 — Nạp** ([đặc tả](specs/aris-brain.md#đợt-2a--nạp-hộp-thư-vào-thủ-thư-lập-bản-nạp-duyệt-ghép-nhật-ký-xong-2510)): Hộp thư vào (thả tệp, nút Thêm chữ/link, `/note` vào nhật ký), phân loại, Thủ thư lập bản nạp trên bản nháp bằng `brain_draft`, ba mức duyệt, ghép có gộp ba chiều, mục lục và `log.md` do aris giữ, hoàn tác ở màn 5.6, tự nạp nhật ký 23:00, trần 0,5 USD/ngày. Màn 5.2, 5.6 dữ liệu thật (bản vẽ duyệt 25/10); cây 5.1 làm lại theo phương án A. Chạy thử thật: Thủ thư tự phát hiện mâu thuẫn giá và thiếu ngân sách. Đợt 2b còn: PDF, Word, ảnh, ghi âm, Telegram (thẻ 7.5), `brain_capture` cho bot.

> **Đợt 2b phần 1 xong 25/10** ([đặc tả](specs/aris-brain.md#đợt-2b--đọc-tệp-bot-gửi-vào-bộ-não-telegram-phần-1-xong-2510)): đọc PDF, Word, ảnh bằng công cụ có sẵn của macOS (PDFKit, Vision, `textutil`), ghi âm qua ffmpeg và chép lời của dsh, công cụ `brain_capture` cho mọi bot. Phần 2 xong 25/10: Telegram theo bản vẽ 7.5 — `/note`, chuyển tiếp thì hỏi lưu, tệp kèm "lưu" và trả lời "lưu", thẻ bản nạp có Đồng ý, nhắc chờ quá 7 ngày.

> **Đợt 3a xong 25/10 — Hỏi bộ não** ([đặc tả](specs/aris-brain.md#đợt-3a--hỏi-bộ-não-bản-vẽ-54-xong-2510)): bản vẽ 5.4 vẽ lại và 5.7 mới duyệt 25/10. Tìm kiếm hiểu câu hỏi tự nhiên (bỏ từ đệm, tìm nới). Màn 5.4 dữ liệu thật: mỗi câu hỏi một phiên của Thủ thư, phạm vi áp ở công cụ tra, tìm cả ký ức các bot (`brain_memory`), số trích dẫn và cột Nguồn có đoạn trích, tiến độ theo thời gian thực, hỏi tiếp, dừng, lưu câu trả lời vào Hộp thư vào, nhờ Aris tìm ngoài bộ não. Đợt 3b xong 25/10 ([đặc tả](specs/aris-brain.md#đợt-3b--bộ-não-trong-khung-chat-ba-tầng-chỉ-dẫn-bản-vẽ-57-xong-2510)): `[[trang]]` thành nhãn có thẻ xem nhanh trong chat, dòng công cụ Tra bộ não / Đọc trang, nút "Từ Second Brain" và nhóm Trang bộ não trong menu `@`, trang đưa vào tin thì bot được đọc trong lượt, lời dặn và bản đồ cho mọi bot, nhắc theo tên, đếm lượt tra.

> **Đợt 4a xong 25/10 — Soát bộ não** ([đặc tả](specs/aris-brain.md#đợt-4a--soát-bộ-não-bản-vẽ-55-xong-2510)): bản vẽ 5.5 mới và 5.3 sửa duyệt 25/10. Máy soát mỗi ngày (liên kết gãy, tên chưa có trang, mồ côi, tên trùng, thiếu tóm tắt hay nguồn, lâu chưa cập nhật, phòng đã xoá còn trang, bot bỏ qua lời nhắc); Thủ thư soát sâu Chủ nhật (mâu thuẫn, nhận định cũ; trần 0,30 USD). Sửa qua bản nạp loại "soát", sửa liên kết và dời trang phòng đã xoá làm ngay; "Nhắc mạnh hơn" cho bot. Màn 5.5, thẻ trong Hộp duyệt, tin Telegram tuần. Đợt 4b xong 25/10 ([đặc tả](specs/aris-brain.md#đợt-4b--đồ-thị-và-gợi-ý-nối-bản-vẽ-51-53-xong-2510)): "Quanh trang này" ở 5.1 (đồ thị 2D, gợi ý nối với nút Nối), đồ thị toàn cục 5.3 dữ liệu thật (trang wiki theo loại, nguồn và ký ức bot bật thêm, cụm quanh dự án và chủ đề). Thêm cách xem **Cây thư mục** ở 5.3 (bản vẽ 5.3b): cây tỏa tròn theo đường dẫn, liên kết uốn theo nhánh, gộp/mở thư mục, kéo và cuộn. Thêm cách xem **Cây 3D** kiểu cầu (bản vẽ 5.3c): xoay được, cùng bộ lọc và độ uốn với cây 2D.

> **Đợt 5 (chốt 25/10)**: bản vẽ 6.2b, 6.2c, 2.2f, 2.3b, 1.9. 5a tìm theo nghĩa bằng Gemini gói miễn phí ([đặc tả](specs/aris-brain.md#đợt-5a--tìm-theo-nghĩa-bản-vẽ-62b-làm-2510)): kho vector cạnh chỉ mục, nhúng dần ở nền, gộp từ khoá với theo nghĩa ở `brain_search` và ký ức bot; chờ khoá để chạy thật. 5b hồ sơ chung ([đặc tả](specs/aris-reflect.md#hiểu-chủ-nhân-sâu-giai-đoạn-5-đợt-5b-bản-vẽ-23b-làm-2510)): hồ sơ mọi bot đọc, suy luận 3 vòng mỗi 6 lượt, đầu phiên nạp nhận định gần câu đầu, màn 2.3 mới. 5c ảnh và video ([đặc tả](specs/aris-providers.md#nhúng-ảnh-và-video-giai-đoạn-5-đợt-5a-và-5c)): thứ tự ưu tiên chung và riêng theo bot, `tao_anh`/`tao_video`, khung ảnh trong chat, Telegram gửi ảnh; ảnh fal hiện ngay trong lượt, video Kling 5 giây chạy thật. Thêm (25/10, bản vẽ 5.5b, 4.3b): ranh giới ba kho (`brain_note`, Soát "ký ức nên vào bộ não"), số liệu ghi "tính đến" (Soát, Ghi ngày, luật nạp), dự án Kanban nối trang Dự án hai chiều ([đặc tả](specs/aris-brain.md)). **Giai đoạn 5 người dùng nghiệm thu 26/10.**

**Giao diện**: 5.1 Ghi chú (đồ thị 2D quanh ghi chú), 5.2 Hộp thư vào, 5.3 Đồ thị toàn cục 3D, 5.4 Hỏi bộ não; phần "Từ Second Brain" trong menu đính kèm.

**Nghiệm thu**: gửi một ghi âm Telegram ⇒ có ghi chú đã chép lời, xếp đúng dự án, nối với ghi chú liên quan; "Hỏi bộ não" trả lời đúng kèm nguồn; mở thẳng thư mục bằng Obsidian được.

---

## Giai đoạn 6 · Mở cửa: aris làm agent cho nền tảng khác qua ACP (tuần 17–18)

**Mục tiêu**: nền tảng khác (Buzz Desktop, IDE) mời được bot của aris vào làm việc như aris đang dùng Claude
Code, Codex làm bot ngoài: cùng một lõi, một bộ dữ liệu.

> **Chốt 26/10: chỉ ACP.** aris không làm nhà cung cấp API: bỏ API kiểu OpenAI, MCP server, A2A và cổng mạng
> riêng. Ứng dụng kia chạy lệnh `aris-acp`, nói qua stdio; lệnh nối vào daemon qua socket nội bộ (chỉ tài
> khoản người dùng mở được). Phiên chạy trong daemon, là chủ duy nhất của bot, ký ức, bộ não, kênh.

**Đợt**

| Đợt | Nội dung |
|---|---|
| 6a · aris làm agent ACP | `aris-acp --bot <tên>` (khách mỏng qua stdio ↔ socket của daemon); phiên làm trong thư mục ứng dụng kia đưa sang, hiện trên bản đồ đội và log, ghi nguồn ("từ Buzz Desktop"); bộ quyền "Thành viên": bỏ tool nguy hiểm, nội dung đến không tin cậy, không tự ghi ký ức, **danh sách cấm áp cả khi ứng dụng kia tự duyệt mọi quyền**, quyền khác hỏi ngược lại ứng dụng kia; đặt `aris-acp` vào PATH (hỏi trước) để Buzz tự phát hiện |
| 6b · Màn 6.3b | "Dùng aris từ ứng dụng khác": bật/tắt, lệnh, bot mở ra, ứng dụng đang nối, bộ quyền Thành viên, nhật ký truy cập |

**Nghiệm thu**
- Buzz Desktop tìm thấy aris trong Runtimes và chat được với một bot; lệnh xoá tệp bị chặn dù Buzz tự duyệt.
- Phiên từ Buzz hiện trên bản đồ đội và trong log phiên, đúng thư mục làm việc.

> **Đợt 6a và màn 6.3b làm 26/10** ([đặc tả](specs/aris-acp.md)): gói mới `@aris/acp`: daemon nghe socket `~/.aris/acp.sock`, mỗi kết nối là một nhánh `dsh-acp` với model của bot, phiên được chọn preset, gắn bot, vào workspace của thư mục; bộ quyền khi làm khách (danh sách cấm áp cả khi ứng dụng tự duyệt, chặn giao cho bot ngoài, không ghi ký ức, không công cụ đội); nhật ký 7 ngày; màn 6.3b dữ liệu thật. Chạy thật bằng ứng dụng ACP giả lập; chờ thử với Buzz Desktop.

**Rủi ro**: hai tiến trình cùng ghi một bot ⇒ daemon là chủ duy nhất, `aris-acp` chỉ là khách mỏng.

**Anh cần chuẩn bị**: Buzz Desktop (đã cài).

---

## Giai đoạn 7 · Cứng cáp và lên server (tuần 19–20)

> **Chốt 26/10: làm ở local trước, chưa lên server.** Mục 1 (container, `systemd`, chỉ cho gọi ra API cần thiết, proxy công cụ mạng) để tới khi lên server; các mục còn lại làm trên máy Mac. Nghiệm thu "chạy liên tục 14 ngày" tính trên máy local.
>
> **Đợt (chốt 26/10)**: 7a An toàn và ngân sách (màn 6.4 thật: trần ngày cả đội, báo khi tới ngưỡng, nút dừng khẩn cấp, danh sách cấm cứng cho mọi bot, chế độ duyệt, kho bí mật trong Keychain của macOS) → 7b Sao lưu (hằng đêm, mã hoá, vào thư mục local do người dùng chọn, diễn tập khôi phục) → 7c Quan sát (màn 6.5 thật, đo token, otel, phát lại phiên) → 7f Đo và rà soát (rà soát bảo mật, build dsh từ mã nguồn, đo đối đầu với Hermes). 7d Kênh Lark (kèm Mai đọc email, lịch) khi có ứng dụng Lark, rồi 7e Kênh Zalo cá nhân. Webhook để tới khi lên server.
>
> **Đợt 7a làm 26/10** ([đặc tả](specs/aris-guard.md)): gói `@aris/guard` (trần cả đội, báo Telegram ở ngưỡng và trần, dừng khẩn cấp nối vào routine, Driver, ACP, Telegram, danh sách cấm cứng cho mọi bot, chế độ và hạn duyệt) và `@aris/keychain` (kho khoá trong Keychain, tệp khoá làm lớp dưới); màn 6.4 dữ liệu thật.
>
> **Đợt 7b làm 26/10** ([đặc tả](specs/aris-backup.md)): gói `@aris/backup` (hằng đêm 02:00, nén và mã hoá AES-256-GCM vào thư mục người dùng chọn, mã khôi phục trong Keychain, giữ 7 bản ngày và 4 bản tuần, diễn tập khôi phục mỗi Chủ nhật, báo Telegram khi lỗi) và lệnh `aris restore`; màn 6.4b dữ liệu thật. Người dùng tự bật và chọn thư mục.
>
> **Đợt 7c làm 26/10** ([đặc tả](specs/aris-stats.md), [plan](plans/gd7-7c-quan-sat.md); Opus vẽ và lên plan, Sonnet viết mã, Opus soát): gói `@aris/stats` (ghi từng lần gọi model theo loại việc và nguồn, sự kiện duyệt, hỏi, bị chặn), màn 6.5 số thật (chi phí theo việc, trúng cache, việc xong không cần người dùng, skill, nhật ký phiên có token) và 6.5b Phát lại phiên từng bước. Số liệu tính từ 26/10; otel để tới khi lên server.
>
> **Đợt 7f làm 26/10** (phần A, B): rà soát bảo mật ([báo cáo](nghiem-thu/ra-soat-bao-mat-7f.md): 1 nặng, 10 vừa, 9 nhẹ; đã sửa S1–S11, S18–S20 qua gói mới `@aris/shell` dùng chung cho hàng rào, khách ACP, kiểm thử skill, ký ức, bộ não, Telegram; tắt in URL đăng nhập vào log; sao lưu có AAD) và build dsh từ mã nguồn ([spike](spikes/dsh-build-tu-nguon.md): build được, aris chạy trên bản tự build). Phần C đo đối đầu với Hermes: người dùng bỏ (26/10). Đợt 7f xong.

**Việc cần làm**
1. **Lên server**: container, `systemd`, egress allowlist (chỉ cho các API cần thiết), proxy có nhật ký cho tool mạng.
2. **Ngân sách và an toàn**: trần chi phí ngày, ngưỡng báo, danh sách cấm cứng, luật cho phép, kho bí mật (1Password/Bitwarden), nút dừng khẩn cấp.
3. **Quan sát**: otel + token-meter; bảng điều khiển; thống kê chi phí theo bot và việc; phát lại phiên từng bước.
4. **Sao lưu**: hằng đêm, mã hoá, diễn tập khôi phục.
5. **Kênh**: Lark (nhóm, tài liệu), Zalo OA.
6. **Đo đối đầu với Hermes**: cùng máy, cùng model DeepSeek, 30 tác vụ mẫu; so RAM, độ trễ, tỉ lệ trúng cache, chi phí vòng học, tỉ lệ hoàn thành không cần can thiệp (chỉ tiêu ở mục 10.3 tài liệu tính năng).
7. **Webhook** (chuyển từ giai đoạn 4, quyết định 25/10): cổng riêng nhận sự kiện ngoài (dsh đòi cookie đăng nhập cho đường API), mỗi route có mã bí mật kiểu GitHub, lọc sự kiện, mẫu lời nhắc chỉ lấy trường đặt tên, chạy như routine (phiên mới, chỉ đọc) hoặc tạo thẻ Kanban; chống trùng theo mã lần gửi, giới hạn tần suất và kích thước; nội dung payload luôn là dữ liệu không tin được. Thiết kế đã đối chiếu tài liệu webhook của Hermes (nhật ký clean-room 25/10). Cần vẽ giao diện trước.
8. **Rà soát bảo mật** toàn bộ trước khi để chạy không giám sát.

**Giao diện**: 6.1 Bảng điều khiển, 6.3 (đủ Lark, Zalo), 6.4 Ngân sách–duyệt–mạng, 6.5 Thống kê & nhật ký.

**Nghiệm thu**: chạy liên tục 14 ngày không cần can thiệp; chi phí trong ngân sách; khôi phục thành công từ bản sao lưu; số đo đối đầu đạt chỉ tiêu.

**Anh cần chuẩn bị**: chọn server (đề xuất Oracle Cloud), ứng dụng Lark, Zalo OA đã xác thực.

---

## Giai đoạn 8 · Mở rộng (theo nhu cầu)

- 6.6 Màn hình của bot (desktop ảo, cầm lái khi gặp đăng nhập/2FA).
- Computer-use (điều khiển cả máy). Trình duyệt tự động đã chuyển lên giai đoạn 4; dsh bản ghim 0.2.1-rc.2 không có gói `browser-use` hay `computer-use` (kiểm 25/10).
- 7.4 Chat web trên điện thoại (PWA).
- Buzz như một kênh nhắn tin ngang Telegram (M10); thêm Discord, Slack, WhatsApp khi cần.
- Bot tự viết tool qua hệ con `extensions` của dsh (luôn cần duyệt).
- Nhập cấu hình/skill từ Claude Code, Codex, Cursor; kho skill cộng đồng (cài qua quét bảo mật và duyệt); xuất trajectory để huấn luyện.
- Phần bù Hermes còn lại: ~~phán quyết "chờ" của `/goal`, gộp skill trùng bằng model~~ (xong ở GĐ8.2, nghiệm thu 27/10).

**Nghiệm thu GĐ8.2 (27/10)**: giao Khoa `/goal` chạy `sleep 100` ở nền; giám khảo trả `wait` 110 giây, mục tiêu tạm dừng với lịch nhắc, tới giờ bot kiểm lại và giám khảo chấm `done` (2 lượt). Thử thêm `sleep 600`: bấm "Kiểm ngay" thì mục tiêu chạy tiếp ngay, bot kiểm lại rồi chờ lần hai; bấm "Thôi chờ" thì lịch bị xoá, mục tiêu tạm dừng. Gộp skill: nhập hai skill gần giống vào kho đội (độ giống 0,99), model soạn bản gộp, Hộp duyệt hiện thẻ gộp, bấm Gộp thì skill kia được cất kèm `mergedInto`. Tốn khoảng 0,005 USD cho gộp; dữ liệu thử đã dọn (mục tiêu xoá, hai skill thử đã cất). Chưa thử: tin Telegram tuần cho đề xuất gộp (thẻ duyệt skill hiện có vẫn gửi như mọi đề xuất), và chạy Chủ nhật của người dọn kho.

**GĐ8.4 · Kênh Zalo cá nhân (27/10, phần máy chủ; giao diện chờ duyệt bản vẽ)** ([đặc tả](specs/aris-zalo.md)): bộ nối `packages/aris-channels/src/zalo/` bọc `zca-js@2.2.0` (MIT, đã được người dùng đồng ý cài, ghim đúng phiên bản; `pako` có giấy phép `MIT AND Zlib` nên thêm một ngoại lệ có ghi lý do ở `scripts/check-licenses.mjs`). Đăng nhập QR, dữ liệu đăng nhập vào Keychain (`ZALO_<BOT>_SESSION`), đăng nhập lại khi khởi động; chỉ trả lời người đã ghép đôi, người lạ im lặng và báo chủ qua Telegram một lần mỗi người mỗi ngày, nhóm mặc định tắt và chỉ trả lời khi được @nhắc; gửi tin theo giới hạn 3 giây / 20 tin mỗi phút / 300 tin mỗi ngày (xếp hàng, hết hạn mức ngày thì dừng và báo chủ); mất kết nối thì thử lại 2 phút gấp đôi tới 30 phút, Zalo Web mở thì "tạm ngừng nghe"; API `zalo-login-start/-status`, `zalo-logout`, `revoke-zalo`, `zalo-group`; nguồn "Zalo" trong Thống kê và `aris status`. **Đã kiểm bằng test tự động** (bản giả của thư viện, không gọi mạng, cộng với các lớp tin thật của `zca-js` cho việc chuẩn hoá tin): 75 test mới cho bộ nối Zalo, 5 cho API, 3 cho kho, 1 cho Thống kê. **Chưa thử thật** vì cần tài khoản Zalo của người dùng: quét QR, nhắn và nhận tin thật, mở/đóng Zalo Web, khởi động lại daemon rồi tự đăng nhập, dạng thật của nội dung ảnh/tệp/tin thoại, phản ứng của Zalo với tài khoản dùng lâu ngày. Bản vẽ `design/canvas/KenhZalo.dc.html` (khung 6.3d) chưa duyệt nên chưa viết giao diện trong Cài đặt › Kênh và ghép đôi; chưa đăng lên artifact.

**GĐ8.5 · Danh mục connector và OAuth (27/10, chưa thử thật)** ([đặc tả](specs/aris-bots.md#danh-mục-connector-và-đăng-nhập-oauth-giai-đoạn-8-plan-85-bản-vẽ-danhmucconnectordchtml-64)): người dùng duyệt bản vẽ `DanhMucConnector.dc.html`. Danh mục 15 mục; đợt 1 theo đề xuất (người dùng bảo làm luôn): Notion, HubSpot, Canva, Meta Ads đã kiểm trên tài liệu chính hãng, Google Workspace chưa kiểm được địa chỉ nên để người dùng điền. Đăng nhập OAuth theo đặc tả MCP bằng hàm `auth` của `@modelcontextprotocol/client` (đăng ký client động, PKCE, `state`, làm mới), token ở kho khoá `MCP_<mã>_OAUTH`, gọi về `/api/aris/mcp/oauth/callback`; token truyền qua header vì `dsh-mcp-client` không nhận `authProvider`. Giao diện: hộp danh mục (tìm, tab, thẻ), hộp kết nối (khoá, địa chỉ gọi về, phạm vi, mức hỏi, Đăng nhập / Kiểm tra), trạng thái "cần đăng nhập lại" trong danh sách của đội. **Đã kiểm bằng test tự động**: 9 test OAuth với máy chủ uỷ quyền giả (đăng ký động, client riêng, PKCE, state lạ/dùng lại/hết hạn, từ chối, làm mới, làm mới hỏng, xoá), 10 test danh mục. **Chưa thử thật**: đăng nhập với từng hãng (cần tài khoản của người dùng, và với HubSpot, Canva, Meta, Google còn cần tạo ứng dụng ở hãng), hãng có nhận địa chỉ gọi về trên máy không, giao diện trên web thật. Connector API (Điểm dừng 3): người dùng chọn để sau.

**GĐ8.7 đợt A (27/10, chưa thử thật)** ([plan](plans/gd8-7-nhieu-tai-khoan-kenh.md)): Zalo báo chủ khi bị đá phiên (tối đa 6 giờ một lần), bộ canh mạng chết im 5 phút một lần (lỗi hai lần liền thì nối lại), đóng trình nghe cũ trước khi mở mới; Telegram có hạn chót 45 giây cho mỗi lần nhận tin. Zalo và Telegram: gom tin dồn dập của người không phải chủ (đợi 5 giây im lặng), khách nhắn thêm khi bot đang soạn thì bỏ câu trả lời cũ; cắt câu trả lời ở 1.500 ký tự, có nhịp nghỉ giữa các phần. **Đã kiểm bằng test tự động** (6 test Zalo với đồng hồ giả, 5 test Telegram). **Chưa thử thật**: mạng chết thật (rút mạng, máy ngủ dậy), Zalo Web mở thật, khách thật nhắn dồn dập.

**GĐ8.7 đợt B, C, D và giao diện (27/10, chưa thử thật)** ([plan](plans/gd8-7-nhieu-tai-khoan-kenh.md)): một bot gắn nhiều tài khoản Telegram và Zalo cá nhân; người được phép, nhóm, mã ghép đôi, phiên theo tài khoản, chủ nhân dùng chung, dữ liệu cũ giữ nguyên không phải chuyển; mỗi tài khoản chọn "chỉ người đã ghép đôi" hay "mọi người nhắn riêng là khách". Zalo: nhường tay cho chủ (chủ tự gõ thì bot im 10 phút, giữ tin khách), giờ trực giữ tin và câu ngoài giờ tuỳ chọn, nhãn Zalo bỏ qua, @nhắc thật trong nhóm. Telegram và Zalo: khách gặp nhân viên (bot im 2 giờ, báo chủ), công cụ im lặng và báo chủ (10 phút một lần mỗi cuộc chat), chỉ trả lời theo tài liệu cho khách (tra bộ não trong thư mục nguồn, chặn công cụ khác, không tra thấy thì thay bằng câu chưa có thông tin và báo chủ). Giao diện Cài đặt › Kênh và ghép đôi theo hai bản vẽ đã duyệt, hồ sơ bot có dòng kênh bot đang trả lời. **Đã kiểm bằng test tự động** (aris-channels 316 test; aris-brain thêm test thư mục) và dựng trang với dữ liệu giả trong Chromium (sáng, tối, điện thoại 390 px). **Chưa thử thật**: tài khoản Telegram và Zalo thật, `selfListen` của Zalo có báo đúng tin chủ tự gõ, nhãn Zalo thật, @nhắc thật, chế độ tài liệu với bộ não thật. **Chưa làm**: nhận và thả cảm xúc trên Zalo, chuông báo trên web.

**GĐ8.3 đợt 1 (27/10, chưa thử trên Mac)** ([plan](plans/gd8-3-dieu-khien-man-hinh.md), [đặc tả](specs/aris-computer.md)): gói `@aris/computer` với lõi cua-driver 0.37.0 chạy trong tiến trình aris, gửi thao tác ở nền. Tám công cụ (`man_hinh_xem`, `man_hinh_tim`, `man_hinh_bam`, `man_hinh_keo`, `man_hinh_cuon`, `man_hinh_go`, `man_hinh_phim`, `ung_dung_mo`); ảnh chụp chỉ đưa cho model đọc được ảnh. Tắt mặc định theo bot; hỏi từng bước hay trong phạm vi (ngoài phạm vi từ chối, không có chế độ không hỏi); chặn cứng ứng dụng nhạy cảm, ô mật khẩu, phím khoá máy, đăng xuất, màn hình khoá, kéo vào Thùng rác; một bot một lúc, trần 40 ảnh và 150 thao tác mỗi lượt, cầm lái, tạm dừng khi người dùng đang dùng máy; `aris computer doctor`. **Đã kiểm bằng test tự động** (lõi giả) và **thử lõi thật trên màn hình ảo Linux** (xterm: chụp, bấm, gõ, phím tắt, cuộn, duyệt rồi làm, chặn phím khoá máy). **Chưa thử trên Mac**: quyền Trợ năng, Ghi màn hình, cây Trợ năng và bấm theo mã phần tử, gửi nền, đọc rảnh và màn hình khoá. **Đợt 2–3 (27/10)**: ba bản vẽ được duyệt rồi làm giao diện: khung màn hình của bot, Cầm lái / Trả lại trong bảng chat; thẻ duyệt có ảnh và viền cam ở chuông "Cần anh", bảng chat, Hộp duyệt (yêu cầu đi qua hộp duyệt chung nên Telegram cũng nhận); thẻ Điều khiển máy trong Hồ sơ bot › Quyền. Đã dựng thử với dữ liệu giả trong Chromium (sáng, tối).

**GĐ8.8 · Kho skill dựng sẵn tiếng Việt (27/10)** ([plan](plans/gd8-8-kho-skill-viet.md), [đặc tả](specs/aris-skills.md#đợt-88--kho-skill-dựng-sẵn-tiếng-việt)): 18 skill trong `packages/aris-skills/library/` (Bán hàng và chăm sóc khách, Nội dung mạng xã hội, Phễu và marketing), viết bằng tiếng Việt, không đại từ cứng, có các bước, khuôn trả lời, ví dụ tốt và chưa tốt, điều không được làm; mỗi skill 3 ca thử. Cài qua `importItems` với nguồn `library`, bật ngay không qua Hộp duyệt, skill người dùng đã sửa thì không ghi đè khi chưa đồng ý. **Đã kiểm bằng test tự động** (8 test: kho thật không lỗi bộ kiểm hay bộ quét nào, cài cả gói, cài một skill và gán bot, có bản mới, đã sửa, lấy lại skill đã cất, API, so khác bản). Giao diện tab "Kho dựng sẵn" trong Thư viện skill theo bản vẽ đã duyệt, dựng thử với dữ liệu giả (sáng, tối, điện thoại). **Chưa thử**: chạy ca thử của từng skill với model mặc định, bot thật trả lời khách thật bằng các skill này.

---

## Giai đoạn 9 · aris thành Rakazo cho công ty (đề xuất 31/10, chưa bắt đầu)

Người dùng muốn giữ aris và lõi dsh, đắp những gì Rakazo (bản mã nguồn mở của Grok Bot) có, giữ chỗ aris hơn, và **cho công ty dùng**: dựng trên server của công ty, chạy 24/7, cấp tài khoản cho nhân sự tạo bot và làm việc. Nghiên cứu và lộ trình: [nghien-cuu/rakazo.md](nghien-cuu/rakazo.md).

Lộ trình đề xuất: 9.1 Chạy bền → 9.2 Máy riêng cho bot (Docker) → 9.3 Công ty nhiều nhân sự → 9.4 Lên server → 9.5 Đội tự vận hành → 9.6 Giọng nói → 9.7 App điện thoại → 9.8 Connector lớn. Chốt 31/10: một công ty trên một server, nhiều nhân sự. Còn chờ người dùng: thứ tự, cách lấy mã từ Rakazo (Apache-2.0), máy của bot chạy trên Mac hay VPS trước.

---

## Bù năng lực một bot so với Hermes (đánh giá 25/10)

Câu hỏi: người dùng chỉ dùng Aris, không tạo bot khác, thì có mạnh như một Hermes không (aris nhiều bot tương đương Hermes nhiều profile; mỗi profile Hermes là một Hermes đầy đủ). Đối chiếu tài liệu Hermes bản đang cài và gói dsh bản ghim (nhật ký clean-room 24/10):

- **Ngang hoặc hơn**: vòng lặp và công cụ lõi của dsh (lệnh, tệp, tìm, tìm và đọc web, MCP, agent con, chạy script nhiều bước, kế hoạch, nén ngữ cảnh); ký ức có hiệu lực ngay; tự học có duyệt và kiểm thử skill; `/goal` có hợp đồng và chặn khi không tiến triển; trần chi phí, dự phòng provider, xoay vòng khoá.
- **Còn kém, xếp vào giai đoạn**:

| Chỗ kém | Hermes | Xếp vào |
|---|---|---|
| Trình duyệt tự động | Nhiều backend | Giai đoạn 4 (MCP trình duyệt) |
| Điểm khôi phục tệp, `/rollback` | Tự chụp trước khi sửa | Giai đoạn 4 |
| Lịch tự động (routine) | Có | Giai đoạn 4 (đã có) |
| Đọc văn bản thành giọng, chế độ thoại, tạo ảnh | 10 provider giọng, 11 model ảnh | Giai đoạn 5 |
| Hiểu người dùng sâu (kiểu Honcho) | Biện chứng nhiều vòng, làm nóng đầu phiên | Giai đoạn 5 |
| API tương thích OpenAI, A2A | Có | Không làm (chốt 26/10: aris chỉ mở qua ACP) |
| Kênh nhắn tin | ~35 nền tảng | Giai đoạn 7 (Lark, Zalo), giai đoạn 8 (Discord, Slack, WhatsApp…) |
| Computer-use, kho skill cộng đồng, phán quyết "chờ", gộp skill trùng | Có | Giai đoạn 8 |
| Độ trưởng thành, hàng trăm skill dựng sẵn | Nhiều năm dùng thật | Đo đối đầu ở giai đoạn 7; skill tích luỹ qua dùng thật |

Ưu tiên cắm MCP có sẵn thay vì tự viết khi được (trình duyệt, giọng, ảnh). Chất lượng một bot còn phụ thuộc model: mặc định DeepSeek Flash; việc khó đổi model mạnh hơn qua `aris-providers`.

## Việc xuyên suốt mọi giai đoạn

| Việc | Cách làm |
|---|---|
| Kiểm thử | Unit cho logic thuần; **kiểm thử hợp đồng** với phiên bản dsh đã ghim; **phát lại phiên mẫu** để bắt thoái lui khi đổi prompt/skill/model; kiểm thử "hỗn loạn" (`kill -9`, mất mạng, tin gửi lại) cho kênh |
| Đặc tả | `docs/specs/<package>.md` trước khi code; cập nhật nhật ký tham khảo khi đọc Hermes/Tako/VoxAgent |
| Nâng cấp dsh | Đọc hướng dẫn nâng cấp → đổi phiên bản ghim → chạy kiểm thử hợp đồng + phát lại → mới hợp nhất |
| Giao diện | Mọi màn dùng `aris-ui-kit`; đối chiếu canvas trước khi đóng giai đoạn |
| Revamp giao diện (sau khi xong chức năng) | Gom các việc thuần giao diện làm một lần cuối: menu chính / thanh bên (bản vẽ `MenuChinh.dc.html`: Tổng quan và Tự học, chưa chọn A/B), Bảng điều khiển nối dữ liệu thật. Trong lúc làm chức năng thì không đổi thanh bên |
| Chi phí | Theo dõi từ giai đoạn 1; mỗi tính năng nền có trần token riêng |

## Anh cần chuẩn bị (tổng hợp)

| Khi nào | Việc |
|---|---|
| Giai đoạn 0 | Khoá API DeepSeek |
| Giai đoạn 1 | Bot Telegram cho Aris (BotFather); máy Mac để chạy nền; tuỳ chọn khoá Anthropic |
| Giai đoạn 2 | Bot Telegram riêng cho các bot muốn có kênh riêng |
| Giai đoạn 2 | Agent ngoài muốn đưa vào đội (Claude Code, Codex, Hermes…) đã cài và đăng nhập |
| Giai đoạn 6 | Buzz Desktop (đã cài) |
| Giai đoạn 7 | Server; ứng dụng Lark; Zalo OA đã xác thực; chốt trần ngân sách ngày |
