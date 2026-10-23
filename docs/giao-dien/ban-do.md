# Bản đồ giao diện aris (G1)

> 23/10/2026 · dsh `0.2.1-rc.2` · canvas bản 58 (36 màn, bản sao trong [`design/canvas/`](../../design/canvas/)). Kiểm kê chi tiết các mảnh giao diện của dsh: [kiem-ke-dsh.md](kiem-ke-dsh.md) (tự sinh).
>
> Mục đích: trả lời một lần cho cả app **màn nào làm bằng cách nào, ở gói nào, khi nào có dữ liệu thật**, để giao diện được dựng theo hệ thống (giai đoạn G) chứ không sửa vụn từng mảnh.

## 1. Năm cách làm

| Mã | Cách | Khi nào dùng | Ví dụ đã làm |
|---|---|---|---|
| **T** | Chỉ theme + Việt hoá | Mảnh của dsh đã đúng bố cục canvas, chỉ khác màu, chữ, phông | — |
| **C** | Cắm thêm vào chỗ cắm (slot) của dsh | Canvas thêm một phần vào chỗ dsh đã chừa sẵn | Đầu khung "Aris · Commander / Phiên ▾" (`@aris/ui-chat-header`) |
| **R** | Tắt row của dsh, chèn gói aris giữ nguyên hợp đồng slot | Bố cục canvas khác hẳn mảnh của dsh | Thanh bên Đội hình + Dự án (`@aris/ui-sidebar` thay `ui-sidebar`) |
| **P** | Trang mới ở vùng chính (`main`) hoặc hộp thoại | Canvas có trang/hộp thoại mà dsh không có | Bản đồ đội (thử nghiệm `@aris/web-spike`) |
| **N** | Ngoài Web UI | Telegram, điện thoại | — |

## 2. Lớp nền chung — áp cho mọi màn trước khi làm từng màn

| Lớp | Cách làm | Kết quả |
|---|---|---|
| **Theme aris** (G2 ✅) | `@aris/ui-theme` gọi `ctx.theme.overrideTokens('aris', { token: { light, dark } })`, ghi đè 403 token `--dsw-*`: nền (`alias-bg-*`), chữ (`alias-label-*`), viền (`alias-border-*`), nút (`alias-button-*`), trạng thái (`alias-state-*`), thương hiệu (`alias-brand-*`, `static-deepseek-*`), bo góc (`radius-*`), bóng (`shadow-*`, `elevation-*`), phông (`font-family-*`). Màu lấy từ `@aris/ui-kit` | Khung chat, ô nhập, cài đặt, hộp thoại, menu, toast của dsh cùng lúc mang dáng aris; hết màu xanh DeepSeek |
| **Tiếng Việt** (G2 ✅) | Thêm một ngôn ngữ, không thay tiếng Anh: `@aris/ui-locale-vi` gọi `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` rồi đăng ký từ điển `vi` cho 61 namespace của dsh (2.760 chuỗi, dịch đủ 100%). Chữ của aris (thanh bên, đầu khung) có từ điển en/vi riêng (`aris.sidebar`, `aris.chatHeader`). Khi nâng dsh: `node scripts/ui/extract-strings.mjs packages/aris-ui-locale-vi/locales/en.snapshot.json` → `pnpm check:locale` báo chuỗi thiếu, lỗi thời, biến `{tên}` lệch → dịch bằng `scripts/ui/merge-vi.py`. Thuật ngữ và văn phong: `packages/aris-ui-locale-vi/locales/README.md` | Cài đặt › Chung › Ngôn ngữ có 中文 / English / Tiếng Việt; đổi là cả app đổi ngay, không tải lại. Chuỗi dsh thêm mới mà chưa dịch thì hiện tiếng Anh |
| **Phông** (G2 ✅, đổi 23/10) | Phông hệ thống như DeepSeek dùng (`-apple-system`, Segoe UI, PingFang SC…, mã: SF Mono) cho cả tiêu đề lẫn nội dung, qua token `font-family`; không tải phông ngoài. Canvas vẫn vẽ bằng Lexend / Be Vietnam Pro, nên khi đối chiếu (G6) chữ khác nét là chủ ý | Giống cảm giác DeepSeek mà anh thích, chữ có dấu vẫn đủ nét, mở app không chờ tải phông |
| **Bộ thành phần** (G3 ✅) | `@aris/ui-kit/react` theo màn "Ngôn ngữ thiết kế mới" và các màn Cài đặt: `Button` (primary/secondary/ghost/danger = b1/b2), `IconButton`, `StatusGlyph`/`StatusPill` (5 trạng thái, xoay/thở), `Pill`, `Tag`, `Card`/`CardRow`, `Switch`/`SwitchRow` (có câu "bật thì sao", màu theo bot), `Checkbox`, `Segmented`, `TextInput`/`Field`, `Tabs`, `Menu`/`MenuItem`/`MenuLabel` + `useDismiss`, `Dialog`, `NavItem`, `BotRow`, `TeamOrbit` (sơ đồ đội 3D vẽ bằng canvas, đọc hình và mắt từ thư viện linh vật nên bot nào cũng vẽ được), `TaskBranch`/`BranchStep`/`Progress`/`ApprovalBox` (dòng việc), `SectionHeader`/`GroupLabel`, `PageShell`, `SettingsShell` (6.x), `Mascot`, `BrandMark`, `BotPicker` (chọn một bot: linh vật, tên, vai trò, nhóm theo phòng ban, tìm khi danh sách dài — dùng thay dải tab bất cứ khi nào lựa chọn là các bot; dải tab `Segmented` chỉ cho 2–4 lựa chọn cố định không phải bot), bộ icon nét 1,75. Không có chữ cố định — nhãn do nơi dùng truyền vào đã dịch. CSS chung `KIT_CSS` gắn một lần (`mountKitCss`), mọi quy tắc chỉ có hiệu lực trong gốc lớp `aris`. Trang thử sáng/tối: [thanh-phan.html](thanh-phan.html), sinh bằng `node scripts/ui/gallery.mjs` | Mọi màn aris chỉ ghép từ bộ này; thanh bên và đầu khung chat đã chuyển sang |

## 3. 36 màn

Trạng thái: ✅ đã làm · ◐ làm một phần · ○ chưa. "Dữ liệu" là giai đoạn nối dữ liệu thật (trước đó dùng dữ liệu mẫu `DEMO_*`).

### Nhóm 1 · Khung & Chat

| Màn | Vùng của dsh hiện có | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| Thanh bên dùng chung | `ui-sidebar` | R | `@aris/ui-sidebar` | ✅ dùng bộ thành phần; Đội hình (mẫu), Dự án (thật), mục trang aris (Bản đồ, Second Brain, Routine, Kanban); nút tìm, bánh răng, "+" mở trang/hộp thoại aris; menu "Thêm" của dsh thu thành nút cạnh bánh răng; tên nhóm mở trang Phòng ban; bot đang xem sáng trên Đội hình | Dự án: thật · Đội hình: GĐ2 · việc chờ duyệt: GĐ3 |
| 1.1 Chat | đầu khung `conversation.session.header.*`; hội thoại `ui-chat`, công cụ `ui-tool`; thẻ duyệt `ui-approval`; cột phải `ui-sidebar-right` | C đầu khung · C "dòng việc": mỗi lần gọi công cụ `subagent` vẽ thành nhánh màu bot (`tool.call.toolview`, khoá `subagent`) · T bong bóng tin nhắn nền mực, thẻ duyệt nền cam (CSS bám lớp dsh, có kiểm thử canh lớp) · C cột phải "Đội bot lúc này" chiếm trang bắt đầu (`sidebar.right.tab.guide`): sơ đồ đội 3D xoay được (`TeamOrbit`), việc gần đây, giữ lối mở Tệp/Terminal | `@aris/ui-chat-header` ✅, `@aris/ui-chat` ✅, `@aris/ui-team-pane` ✅, `@aris/ui-theme` ✅ | ◐ G4 xong phần khung; còn: đường đời tin nhắn (chấm xanh + vạch dọc), thẻ duyệt nằm trong nhánh của bot, ghim trí nhớ, đầu khung "nhớ thêm được … điều" | GĐ1 (ghim trí nhớ), GĐ2 (bot thật cho nhánh và đội hình), GĐ3 (duyệt trong nhánh) |
| 1.2 Khung chat | ô nhập của `ui-conversation`, `ui-input-trigger`, `ui-model-selection`, `ui-attachment`, `ui-goal` | T + C: nút "/" và "@" (`conversation.input.left`, chèn ký tự qua `input.paste` để mở đúng menu của dsh), nhãn model có ô chữ đầu nhà cung cấp, tên kỹ thuật khi rê chuột (`conversation.input.model.label`, tắt row "1017"); đính kèm giữ nút "+" của dsh; nhắn thêm khi bot đang làm giữ Xếp hàng/Chèn vào việc của dsh | `@aris/ui-chat` ✅ | ◐ còn: "@" liệt kê bot của đội, nút ghi âm (dsh chưa bật nhập giọng nói) | GĐ2 (@bot) |
| 1.3 Bản đồ đội | — | P (trang `main`, mục thanh bên): sân khấu `TeamOrbit` cỡ lớn, cột phải bot đang chọn, dòng thời gian hôm nay | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ2 |
| 1.4 Dự án (canvas ghi "Phòng") | như 1.1 | C: phiên thuộc workspace không phải workspace mặc định của dsh là phiên dự án (`projectOfSession`, phiên đang hiện lấy từ `sidebarRight.mounted`); đầu khung hiện linh vật thành viên, tên dự án, "n bot và anh"; cột phải thay "Đội bot lúc này" bằng thành viên, luật (thư mục thật), việc sinh ra từ dự án, nút mở bảng việc | `@aris/ui-chat-header` ✅, `@aris/ui-team-pane` ✅ | ◐ G5 vỏ; còn: ô nhập "Gửi tới Cả dự án" và nút Dừng, tin nhiều bot có vòng, thẻ "cần anh quyết" (cần Team của dsh) | GĐ2 |
| 1.5 Tạo dự án (canvas ghi "Tạo phòng") | `ui-workspace` (chọn thư mục) | P hộp thoại, dùng `uiWorkspace.pickDirectory` + `workspaces.create` | `@aris/ui-pages` ✅ | ✅ G5: tạo dự án thật (thư mục → workspace), thành viên và mục tiêu là mẫu | GĐ2 (thành viên) |
| 1.6 Tìm trong mọi phiên | phím tắt `ctx.shortcuts`; tìm phiên `dsh-experimental-session-search` | P hộp thoại, mở từ nút tìm trên thanh bên; ⌘K vẫn là bộ tìm phiên của dsh (`session.search`) tới GĐ1 | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ1 |

### Nhóm 2 · Đội bot & Commander

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 2.1 Tạo bot · 2.1b Bot ngoài | `ui-agent-preset` (chọn preset) | P hộp thoại, hai thẻ aris / agent ngoài (ACP) | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ2 |
| 2.2 Hồ sơ bot | `ui-agent-preset`, Cài đặt › Agent presets | P trang (mở từ Đội hình) | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ2 |
| 2.3 Hồ sơ chủ nhân | — | P trang | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ3 |
| 2.4 Nhân bản / xuất bot | — | P hộp thoại | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ2 |
| Phòng ban (quyết định 12, canvas chưa vẽ) | — | P trang `department` (bấm tên nhóm trong Đội hình): thành viên, trưởng nhóm, chính sách chung, việc phòng đang nhận; Đội hình đánh dấu trưởng nhóm | `@aris/ui-pages` ✅, `@aris/ui-sidebar` ✅ | ✅ G5 vỏ | GĐ2 |
| 2.5 Commander | — | P (mục trong trang Cài đặt) | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ2 |

### Nhóm 3 · Trí nhớ & tự tiến hoá

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 3.1 Ký ức | — | P trang; đọc/sửa qua `/api/aris/memory` của `@aris/memory` | `@aris/ui-pages` ✅ | ✅ dữ liệu thật (GĐ1 bước 1) | ✅ |
| 3.2 Thư viện skill · 3.3 Chi tiết skill | `ui-skill` (tham chiếu skill trong chat) | P trang | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ3 |
| 3.4 Hộp duyệt | `ui-approval` (duyệt ngay trong ô nhập) | P trang + giữ T cho duyệt trong ô nhập | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ3 |
| 3.5 Việc đang chạy | `ui-jobs`, `ui-goal` | P trang | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ3 |

### Nhóm 4 · Tự động

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 4.1 Routine | `ui-schedule` (trang Automation tasks) | R: giữ lõi lịch `dsh-schedule`, thay trang bằng giao diện canvas đọc `ctx.remote.schedule`. Mục lịch của dsh đã ẩn khỏi thanh bên; nút "Lịch đang chạy" trong trang Routine mở trang lịch thật của dsh | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ4 |
| 4.2 Tạo routine bằng lời | hộp tạo của `ui-schedule` | P trang (mở từ "+ Routine mới") | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ4 |
| 4.3 Kanban | — | P trang; mỗi dự án một bảng, chọn ở tiêu đề (`params.project`) | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ4 |

### Nhóm 5 · Second Brain & đồ thị

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 5.1 Ghi chú · 5.2 Hộp thư vào · 5.3 Đồ thị · 5.4 Hỏi bộ não | — | P trang (một mục "Second Brain" trên thanh bên; bốn khung chọn qua `params.view`: ghi chú, `inbox`, `graph`, `ask`). Đồ thị 3D là `KnowledgeGraph` của bộ thành phần | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ5 |

### Nhóm 6 · Cài đặt & vận hành

Dsh để cài đặt trong **một hộp thoại** (Chung, Models, Built-in plugins, Agent presets); canvas là **các trang 6.x có điều hướng riêng**. Cách làm: một trang P "Cài đặt" của aris với thanh điều hướng 6.1–6.7; mục "Chung" của dsh (quyền mặc định, ngôn ngữ, giao diện, phông, phím tắt) giữ trong hộp thoại dsh (T) và mở từ mục "Chung" của trang aris. **Một chỗ cài đặt duy nhất** (23/10): bánh răng mở trang Cài đặt aris; nhóm "Hệ thống (DeepSeek Harness)" cuối điều hướng vẽ ngay các mục dsh đăng ký vào `settings.section` (Chung, Model, Plugin có sẵn, Mẫu bot) bằng chỗ cắm con của trang. Menu "…" của dsh (Cài đặt, Góp ý, Đăng nhập tài khoản DeepSeek) bị chiếm chỗ cắm `settings.launcher` nên không hiện; vỏ cài đặt dsh vẫn chạy để báo mất kết nối, các bước làm quen và phím tắt mở hộp thoại cũ. Bỏ theo: Góp ý (gửi DeepSeek) và đăng xuất tài khoản DeepSeek — aris dùng khoá API, không cần tài khoản DeepSeek.

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 6.1 Bảng điều khiển | — | P | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ7 |
| 6.2 Provider & model | `ui-settings-models` (Models) | P: cột trái vẽ chính mục "Model" của dsh (khoá chỉ ghi, thêm nhà cung cấp, API tuỳ chỉnh, dò model) qua `settings.section`; cột phải "Model theo việc" ghi `agent-default-model` qua `configForms`, danh mục từ `session.modelCatalog`. Mục "Model" bỏ khỏi nhóm Hệ thống. Đặc tả: [aris-providers.md](../specs/aris-providers.md) | `@aris/ui-pages` ✅ | ✅ dữ liệu thật (GĐ1 bước 2) | còn: dự phòng, xoay vòng khoá, giá |
| 6.3 Kênh & ghép đôi | — | P | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ1 (Telegram) |
| 6.3b Mặt tích hợp | — | P | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ6 |
| 6.4 Ngân sách, duyệt, mạng | `ui-permission` (quyền mặc định) | P | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ3 / GĐ7 |
| 6.5 Thống kê & nhật ký | `ui-trajectory` (tab Trajectory trong phiên) | P + giữ T cho tab Trajectory | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ7 |
| 6.6 Màn hình của bot | `ui-sidebar-browser` (chỉ bản desktop) | P | `@aris/ui-pages` ✅ | ✅ G5 vỏ | GĐ8 |
| 6.7 Plugin | `ui-plugin-manager` (trang Plugins, chợ plugin) | R ở G6 (trang dsh lệch nhiều): mục Plugin trong trang Cài đặt theo canvas; "Mở chợ" và "Xem" cập nhật mở trang Plugins của dsh | `@aris/ui-pages` ✅ | ✅ G6 vỏ | danh sách thật: GĐ7 |

### Nhóm 7 · Di động

| Màn | Vùng | Cách | Trạng thái | Dữ liệu |
|---|---|---|---|---|
| 7.1 Thẻ duyệt · 7.2 Báo cáo routine · 7.3 Đề xuất ký ức/skill (Telegram) | — | N: định dạng tin nhắn + nút inline của gateway Telegram | ○ | GĐ1 / GĐ3 / GĐ4 |
| 7.4 Chat web trên điện thoại | Web UI của dsh dưới 768px | N: bố cục hẹp của thanh bên và đầu khung aris | ○ | GĐ8 |

## 4. Phần của dsh mà canvas chưa vẽ — quyết định

| Phần của dsh | Quyết định |
|---|---|
| Màn trống "Into the Unknown" (`conversation.hero.*`) | ✅ G4: dấu Aris thay con cá (`conversation.hero.brand.mark`), lời chào "Hôm nay anh muốn làm gì?" từ từ điển; gợi ý việc chờ canvas vẽ |
| Hộp "Get started" đăng nhập DeepSeek / thêm key (`ui-settings-models`, `ui-settings-account`) | T + Việt hoá; aris không ép đăng nhập tài khoản DeepSeek |
| Cột phải: Workspace files, Terminal, xem trước tài liệu (`ui-sidebar-right`, `-files`, `-terminal`, `-documentpreview`) | Giữ (T), thêm tab "Đội bot" làm tab mặc định |
| Tab Trajectory, chi tiết bước, thẻ tệp thay đổi (`ui-trajectory`, `ui-tool`, `ui-deliverables`) | Giữ (T) — công cụ cho người làm kỹ thuật |
| Chế độ Plan, câu hỏi cho người dùng, duyệt trong ô nhập (`ui-plan`, `ui-user-questions`, `ui-approval`) | Giữ (T); thẻ duyệt đổi sang dáng canvas (nền cam, nút chính trước) ở G4, giữ phím Enter/Esc của dsh |
| Nhãn "1017" cạnh model (`ui-deepseek-model-label-1017`) | ✅ Đã tắt row; nhãn model do `@aris/ui-chat` vẽ |
| Thương hiệu DeepSeek (`ui-brand-official`) | ✅ Thanh bên vẽ dấu aris; tiêu đề tab "… — aris" và biểu tượng tab là dấu aris (`@aris/ui-theme`); màn trống dùng dấu Aris |
| Danh sách phiên theo workspace (`ui-workspace` trong `sidebar.workspaces`) | Đã bỏ khỏi thanh bên (quyết định số 10); hộp thoại của nó (đổi tên, lưu trữ phiên) vẫn dùng được từ menu phiên |

## 5. Dữ liệu mẫu đang có

| Hằng | Ở đâu | Gỡ khi |
|---|---|---|
| `DEMO_TEAM`, `COMMANDER` (đội 6 bot, trạng thái, dòng phụ), `DEMO_ACTIVITY` (việc gần đây ở cột phải) | `packages/aris-ui-kit/src/demo.ts` | GĐ2 (dịch vụ đội bot) |
| `DEMO_PENDING_APPROVALS` (3 việc chờ duyệt) | cùng tệp | GĐ3 (hộp duyệt) |
| `DEMO_PROJECT_ROOM` (thành viên, luật, việc của phiên dự án) và trưởng nhóm trong `DEMO_TEAM` | cùng tệp | GĐ2 (Team của dsh, `aris-departments`) |
| ~~`DEMO_COST`~~ (dòng chủ nhân "… USD hôm nay") | đã gỡ ở GĐ1 bước 6: số thật từ sổ chi phí `@aris/providers`; trần ngân sách ở GĐ7 | GĐ1 |
| Bot trên đầu khung luôn là Aris | `packages/aris-ui-chat-header/src/client/Header.tsx` | GĐ2 |
| Bot của nhánh "dòng việc": thành viên đội khi mẫu bot trùng mã, không thì linh vật chưa dùng | `packages/aris-ui-chat/src/client/branch.ts` | GĐ2 |
| Dữ liệu các trang và hộp thoại G5: `DEMO_*` của Cài đặt (6.x, Commander), Trí nhớ (Ký ức, skill, hộp duyệt, việc đang chạy), Đội bot (bản đồ, hồ sơ bot/chủ nhân, tạo bot, agent ngoài, tạo dự án, tìm phiên), Tự động (routine, kanban), Second Brain (cây ghi chú, ghi chú, đồ thị quanh ghi chú, hộp thư vào, hỏi bộ não, `demoGraph()`) | `packages/aris-ui-pages/src/client/{settings,mind,team,auto,brain}/demo.ts` — mỗi hằng ghi giai đoạn gỡ | GĐ tương ứng ở cột "Dữ liệu" phía trên |

## 6. Thứ tự làm trong giai đoạn G

1. ✅ **G2** theme + tiếng Việt + phông — một lần cho cả app (23/10).
2. ✅ **G3** bộ thành phần; chuyển thanh bên và đầu khung sang dùng bộ này (23/10).
3. ✅ **G4** khung: ô nhập 1.2, nút hội thoại 1.1 (dòng việc, thẻ duyệt), cột phải "Đội bot", màn trống, tiêu đề tab (23/10).
4. ✅ **G5** vỏ mọi trang P và hộp thoại trong gói `@aris/ui-pages` (23/10): Cài đặt 6.1–6.7 + Commander, Ký ức, Thư viện/Chi tiết skill, Hộp duyệt, Việc đang chạy, Bản đồ đội, Hồ sơ bot/chủ nhân, Tạo bot/dự án, Nhân bản, Tìm phiên, Routine, Tạo routine, Kanban, Second Brain (4 khung). Bổ sung sau quyết định 11–12: 1.4 Dự án (đầu khung, cột phải), Kanban theo dự án, trang Phòng ban. Còn lại: nhóm 7 di động.
5. ✅ **G6** script chụp app thật cạnh canvas cho cả 36 màn, sáng/tối (`scripts/ui/doi-chieu.mjs`); bảng "đạt / lệch": [doi-chieu.md](doi-chieu.md) (23/10).
