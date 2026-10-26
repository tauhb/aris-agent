# Plan revamp Cài đặt — để Sonnet làm

Người viết plan: Opus. Người làm: subagent Sonnet 5.5 effort cao. Opus soát diff, thử trên web rồi commit. Người dùng đã duyệt bản vẽ.

## Bản vẽ (nguồn sự thật)

Bản vẽ nằm ở `design/canvas/`. Đọc HTML; dữ liệu mẫu nằm trong `<script>` cuối tệp. Không cần mở trình duyệt.

- `Provider.dc.html`: 6.2 Provider và khoá.
- `ModelViec.dc.html`: 6.2b Model (mới).
- `TimTheoNghia.dc.html`: 6.2c Tìm theo nghĩa.
- `Commander.dc.html`: 2.5 Commander trong Cài đặt.
- `BaoMat.dc.html`: 6.4, thêm trần tạo ảnh và trần tạo video.
- `ThongKe.dc.html`: 6.5, thêm thẻ "Chi phí theo model".
- `Kenh.dc.html`: 6.3, dòng Zalo cá nhân.
- Menu chia nhóm ở cột trái của mọi khung trên.

## Luật bắt buộc

- Không commit, không push, không dùng mạng, không cài gói (chỉ `pnpm install --offline` nếu cần).
- Không đọc khoá, không mở `.dsh-home/.credentials.yaml`. Log daemon chỉ đọc qua `sed 's/token=[^ &"]*/token=***/g'`.
- Chữ giao diện đặt trong `packages/aris-ui-pages/src/client/settings/text.ts`, đủ cả khối tiếng Anh và khối tiếng Việt (`locale.test.ts` kiểm hai khối khớp khoá). Dùng `{you}`, không viết cứng "anh", "chị". Bỏ khoá không còn dùng.
- CSS mới trong `packages/aris-ui-pages/src/client/styles.ts`, dùng biến `--a-*`. Trước khi đặt tên class thì grep để tránh trùng. Tiền tố gợi ý: `ap-mv` (Model), `ap-pk` (Provider và khoá), `ap-tn` (Tìm theo nghĩa).
- Không dựng dữ liệu giả trên giao diện thật. Bản vẽ có thứ mà API chưa có thì làm phần có thật, ghi chỗ thiếu vào báo cáo; không bịa số.
- Chú thích mã viết tiếng Việt có dấu, theo giọng mã sẵn có.
- Giữ chức năng đang chạy. Chỉ chuyển chỗ và gộp, không bỏ tính năng: khoá, nhiều khoá xoay vòng, thử kết nối, thêm provider tuỳ chỉnh, bảng model, chuỗi dự phòng chat, chuỗi ảnh và video, chính sách theo bot, tìm theo nghĩa.

## Việc cần làm

### 1. Menu chia nhóm (`settings/SettingsPage.tsx`)

`SettingsShell` (`packages/aris-ui-kit/src/react/layout.tsx`) đã hỗ trợ `group` trên mỗi mục. Thứ tự và nhóm:

- (không nhóm) `sys:general`: Chung, mục của dsh, giữ nguyên.
- **Model và kết nối:** `provider` (Provider và khoá), `model` (Model, mới), `semantic` (Tìm theo nghĩa, mới).
- **Kênh:** `channels`, `integrations`.
- **Vận hành an toàn:** `guard`, `backup`, `stats`.
- **Đội bot:** `commander`, `presets` (Mẫu bot).
- **Mở rộng:** `plugin`.

Bỏ `media` và `screen` khỏi menu:
- `section=media` cũ thì chuyển sang `model`.
- `screen` (6.6, màn mẫu, để giai đoạn 8) thì gỡ khỏi `SECTIONS`. Giữ tệp `Screen.tsx`, chỉ không nối vào menu, và ghi chú rằng sẽ làm lại ở giai đoạn 8.

Tìm mọi chỗ gọi `nav.go('settings', { section: 'media' | 'screen' | … })` trong `packages/aris-ui-*` và sửa cho đúng mục mới.

Đổi chữ `sec.provider` thành "Provider và khoá" (tiếng Anh: "Providers and keys"). Thêm `sec.model`, `sec.semantic` và chữ cho các nhóm.

### 2. Provider và khoá (`settings/Provider.tsx`)

- Bỏ cột phải hiện tại (`CostBox`, `Tasks`, `SemanticCard`, `Fallback`); các phần này chuyển sang mục khác như dưới.
- **Danh sách provider** (`Directory`) chia nhóm:
  - **Chat:** provider đã kết nối có model chat;
  - **Ảnh và video:** các mục `media:*` đang có;
  - **Nhúng:** provider có model nhúng, dùng `EMBED_MODELS` hay thông tin sẵn có trong API; xem `aris-providers`;
  - **Có sẵn:** chưa kết nối.

  Một provider có thể nằm ở hai nhóm (Google ở Ảnh và Nhúng).
- **Cột phải mới, thẻ "Đang dùng ở":** model của provider đang chọn được gán ở đâu:
  - chat mặc định;
  - bậc trong chuỗi dự phòng chat;
  - bậc trong chuỗi ảnh hay video;
  - model nhúng;
  - bot nào có model riêng thuộc provider này (nếu API bot cho biết).

  Cuối thẻ có link "Đổi model theo việc ở mục Model ›". Thêm một dòng nhỏ dẫn sang Thống kê (chi phí theo model) và Ngân sách (trần), như bản vẽ.

### 3. Model, mục mới (`settings/Model.tsx`, khoá `model`)

Dùng lại logic sẵn có, đừng viết lại API: `Tasks` và `Fallback` trong `Provider.tsx`; `ChainEditor`, `PolicyEditor`, `BotMediaRows` trong `Media.tsx`. Tách thành component dùng chung nếu cần; xoá phần thừa sau khi chuyển.

- **Thẻ "Chat và việc nền":**
  - dòng **Chat**: chọn model chính (như `Tasks` đang làm với `chat`), rồi chuỗi dự phòng dạng viên thuốc 1 → 2 → 3 có thêm, bỏ, đổi thứ tự (lấy logic từ `Fallback`);
  - dòng **Rút ký ức**, **Đặt tên phiên**, **Kiểm thử skill**: hiện như `Tasks` đang hiện (ghi chú "theo chuỗi chat" hay model cố định nếu có);
  - dòng cuối: "Tìm theo nghĩa dùng một model nhúng riêng: Tìm theo nghĩa ›".
- **Thẻ "Tạo ảnh", "Tạo video":** chuỗi chung (`ChainEditor`), có giá và trạng thái từng model như trang Ảnh và video đang hiện. Tiêu đề phụ bên phải: "hôm nay X / trần Y USD · sửa trần ›" (link sang `guard`).
- **Thẻ "Gán riêng theo bot":** bảng các bot có cấu hình khác chung, cột Bot, Chat, Ảnh, Video.
  - Ảnh và video lấy từ dữ liệu `BotMediaRows` hay API media theo bot; chat lấy model riêng của bot nếu API có.
  - Bấm "Sửa" thì mở `PolicyEditor` ngay tại đây (như trang Ảnh và video đang làm), hoặc dẫn sang Hồ sơ bot tab Model nếu có đường.
  - Dòng cuối: "N bot khác theo chuỗi chung."
- **Thẻ "aris chọn model thế nào":** ba bước như bản vẽ, dùng lại `md.rules` nếu hợp.
- Trang Ảnh và video cũ (`Media.tsx`, `MediaSettings`) không còn là một mục. Giữ các component đang được nơi khác dùng (ví dụ `BotMediaRows` trong hồ sơ bot, `MediaProviderPanel` trong Provider).

### 4. Tìm theo nghĩa, mục mới (`settings/SemanticPage.tsx` hay tương tự, khoá `semantic`)

Dùng lại `SemanticCard`, `EmbedSelect` trong `settings/Semantic.tsx`. Bố cục theo bản vẽ:

- **Trái, thẻ "Model nhúng":**
  - chọn model (`EmbedSelect`);
  - trạng thái khoá của provider nhúng ("đã lưu" hay "chưa có"), kèm link sang Provider và khoá, chọn sẵn provider đó;
  - chi phí nếu API có;
  - cảnh báo gói miễn phí nếu là Gemini miễn phí (xem chữ sẵn có `sm.*`);
  - "Đổi model thì aris nhúng lại từ đầu".
- **Trái, thẻ "Gửi đi nhúng":** chỉ làm nếu API của `aris-brain` (semantic) có lựa chọn nguồn; nếu không có thì bỏ thẻ và ghi vào báo cáo.
- **Phải, thẻ "Chỉ mục":** tiến độ và trạng thái (phần chính của `SemanticCard`), cùng "Thử tìm" nếu đã có.

### 5. Ngân sách, duyệt, an toàn (`settings/Guard.tsx`)

- Thêm hai dòng sửa **Trần tạo ảnh mỗi ngày** và **Trần tạo video mỗi ngày** (USD) ngay dưới "Báo qua Telegram khi chạm". Ghi bằng chính API mà thẻ "Trần chi phí mỗi ngày" của trang Ảnh và video đang dùng (`md.caps`).
- Dòng "Ảnh và video" trong trần riêng dẫn sang `model` thay vì `media`.

### 6. Thống kê và nhật ký (`settings/Stats.tsx`)

Thêm thẻ **"Chi phí theo model"** ngay trên "Nhật ký phiên", cột Model, Lần gọi, Token, Trúng cache, Chi phí.
- Lấy từ `@aris/stats` (bảng `calls`, theo khoảng `range` đang chọn) nếu dễ: thêm trường `byModel` vào `GET /api/aris/stats?range=` trong `packages/aris-stats`, có test.
- Nếu không gộp được thì lấy `cost.byModel` mà Provider đang dùng (hôm nay, 7 ngày) và ghi rõ khoảng.

### 7. Commander (`settings/Commander.tsx`)

Theo bản vẽ:
- Hàng trên là ba thẻ cạnh nhau, tự xuống dòng khi hẹp: "Được giao việc cho", "Giới hạn", "Commander đã học" (nếu có dữ liệu).
- "Quyết định định tuyến gần đây" là bảng **rộng cả trang** ở dưới, cột Giờ, Yêu cầu, Quyết định, Lý do, Kết quả.
  - Cột Lý do đủ rộng; chữ dài cắt ở 2 dòng, bấm dòng thì mở rộng.
  - Bảng cuộn ngang khi hẹp, không ép chữ xuống từng từ như hiện nay.

### 8. Kênh và ghép đôi (`settings/Channels.tsx`)

Thẻ "Zalo OA · làm sau" đổi thành **Zalo cá nhân** với ghi chú "làm ở đợt 7e". Lark giữ nguyên.

### 9. Ứng dụng khác (`settings/Integrations.tsx`)

Dải cảnh báo đỏ về lần bị chặn gần nhất chỉ hiện khi lần chặn đó trong 24 giờ qua; cũ hơn thì chỉ còn trong nhật ký.

### 10. CSS của aris không dựa vào tên lớp đã băm của dsh (`packages/aris-ui-theme/src/client/overrides.ts`)

- Hiện tệp ghi cứng `Sixlwa_bubble`, `oRe1gG_bubble`, `ROF66W_bubble`, `mna1RW_card`, `mna1RW_body`, `mna1RW_headline`, `mna1RW_actionRow`, `mna1RW_strip`. Phần băm phụ thuộc đường dẫn lúc build dsh, nên build lại dsh là CSS aris mất tác dụng. Xem `docs/spikes/dsh-build-tu-nguon.md`.
- Đổi sang bộ chọn không phụ thuộc phần băm:
  - ưu tiên thuộc tính ổn định có sẵn trong DOM của dsh (`data-*`, `role`, `aria-*`), tìm trong mã client của dsh ở `node_modules/.pnpm/@deepseek-ai+dsh-client*`;
  - không có thì dùng `[class*="_bubble"]` (khớp phần đuôi tên cục bộ).

  Phải kiểm tên cục bộ có **duy nhất** trong toàn bộ CSS client của dsh không, ví dụ `_body`, `_card` rất dễ trùng. Trùng thì giới hạn bằng cha: `[class*="_card"] > [class*="_body"]`, hay kèm thuộc tính khác.
- Viết test nhỏ, ví dụ kiểm chuỗi CSS không còn mẫu `[A-Za-z0-9]{6}_` cứng.
- Ghi trong báo cáo từng bộ chọn cũ đổi thành gì và đã kiểm duy nhất bằng cách nào.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`: toàn bộ qua.
3. `npx eslint .` và `npx prettier --check .`.
4. `node scripts/aris.mjs restart`, đợi 12 giây, `node scripts/aris.mjs status`; 40 dòng cuối log (lọc token) không có lỗi nạp.
5. Không cần mở trình duyệt; Opus sẽ thử trên web.

## Báo cáo cho Opus

- Từng mục 1–10: đã làm gì (tệp, component), chỗ khác bản vẽ và lý do, chỗ API chưa có nên bỏ.
- Danh sách khoá chữ đã thêm và bỏ.
- Kết quả 4 bước kiểm tra.
