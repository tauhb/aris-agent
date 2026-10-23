# Bản đồ giao diện aris (G1)

> 23/10/2026 · dsh `0.2.1-rc.2` · canvas bản 58 (36 màn, bản sao trong [`design/canvas/`](../../design/canvas/)). Kiểm kê chi tiết các mảnh giao diện của dsh: [kiem-ke-dsh.md](kiem-ke-dsh.md) (tự sinh).
>
> Mục đích: trả lời một lần cho cả app **màn nào làm bằng cách nào, ở gói nào, khi nào có dữ liệu thật**, để giao diện được dựng theo hệ thống (giai đoạn G) chứ không sửa vụn từng mảnh.

## 1. Năm cách làm

| Mã | Cách | Khi nào dùng | Ví dụ đã làm |
|---|---|---|---|
| **T** | Chỉ theme + Việt hoá | Mảnh của dsh đã đúng bố cục canvas, chỉ khác màu, chữ, phông | — |
| **C** | Cắm thêm vào chỗ cắm (slot) của dsh | Canvas thêm một phần vào chỗ dsh đã chừa sẵn | Đầu khung "Aris · Commander / Phiên ▾" (`@aris/ui-chat-header`) |
| **R** | Tắt row của dsh, chèn gói aris giữ nguyên hợp đồng slot | Bố cục canvas khác hẳn mảnh của dsh | Thanh bên Đội hình + Phòng (`@aris/ui-sidebar` thay `ui-sidebar`) |
| **P** | Trang mới ở vùng chính (`main`) hoặc hộp thoại | Canvas có trang/hộp thoại mà dsh không có | Bản đồ đội (thử nghiệm `@aris/web-spike`) |
| **N** | Ngoài Web UI | Telegram, điện thoại | — |

## 2. Lớp nền chung — áp cho mọi màn trước khi làm từng màn

| Lớp | Cách làm | Kết quả |
|---|---|---|
| **Theme aris** (G2) | `@aris/ui-theme` gọi `ctx.theme.overrideTokens('aris', { token: { light, dark } })`, ghi đè 403 token `--dsw-*`: nền (`alias-bg-*`), chữ (`alias-label-*`), viền (`alias-border-*`), nút (`alias-button-*`), trạng thái (`alias-state-*`), thương hiệu (`alias-brand-*`, `static-deepseek-*`), bo góc (`radius-*`), bóng (`shadow-*`, `elevation-*`), phông (`font-family-*`). Màu lấy từ `@aris/ui-kit` | Khung chat, ô nhập, cài đặt, hộp thoại, menu, toast của dsh cùng lúc mang dáng aris; hết màu xanh DeepSeek |
| **Tiếng Việt** (G2) | `@aris/ui-locale-vi` gọi `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` rồi đăng ký từ điển cho từng namespace của dsh (~2.400 chuỗi trong 51 gói). Script trích chuỗi tiếng Anh từ bản dsh đã ghim → tệp dịch → kiểm tra thiếu/thừa khi nâng dsh | Mọi chữ của dsh (ô nhập, cài đặt, Automation tasks…) bằng tiếng Việt, xưng hô "anh/em" như canvas |
| **Phông** (G2) | Lexend (tiêu đề), Be Vietnam Pro (nội dung), JetBrains Mono (mã) qua token `font-family` và đặt làm mặc định; người dùng vẫn đổi được trong Cài đặt | Chữ tiếng Việt có dấu hiển thị đẹp, đồng nhất |
| **Bộ thành phần** (G3) | `@aris/ui-kit` thêm React: nút b1/b2/icon, viên trạng thái, chip, thẻ, dòng cài đặt, nút chọn đoạn, ô nhập, hộp thoại, menu thả, tab, linh vật, glyph trạng thái, khung trang Cài đặt (điều hướng 6.x), khung trang thường (tiêu đề + nội dung) | Mọi màn aris chỉ ghép từ bộ này |

## 3. 36 màn

Trạng thái: ✅ đã làm · ◐ làm một phần · ○ chưa. "Dữ liệu" là giai đoạn nối dữ liệu thật (trước đó dùng dữ liệu mẫu `DEMO_*`).

### Nhóm 1 · Khung & Chat

| Màn | Vùng của dsh hiện có | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| Thanh bên dùng chung | `ui-sidebar` | R | `@aris/ui-sidebar` | ◐ có Đội hình (mẫu), Phòng (thật), Plugin ở chân; còn thiếu chuyển sang bộ thành phần | Phòng: thật · Đội hình: GĐ2 · việc chờ duyệt: GĐ3 |
| 1.1 Chat | đầu khung `conversation.session.header.*`; hội thoại `ui-chat`; cột phải `ui-sidebar-right` | C đầu khung · C nút hội thoại (dòng việc, thẻ duyệt) qua `uiConversation.events` · C cột phải "Đội bot lúc này" qua `sidebar.right.pane.tab` | `@aris/ui-chat-header` ✅, `@aris/ui-chat`, `@aris/ui-team-pane` | ◐ đầu khung xong | GĐ1 (phiên), GĐ2 (dòng việc, đội) |
| 1.2 Khung chat | ô nhập của `ui-conversation`, `ui-input-trigger`, `ui-model-selection`, `ui-attachment`, `ui-goal` | T + C: nhãn model `conversation.input.model.label`, nguồn `@bot` cho `ui-input-trigger`, lệnh `/` của aris; chỉ R nếu đối chiếu G6 còn lệch | `@aris/ui-composer` | ○ | GĐ1 (model), GĐ2 (@bot) |
| 1.3 Bản đồ đội | — | P (trang `main`, mục thanh bên) | `@aris/ui-team-map` (thay `web-spike`) | ◐ thử nghiệm | GĐ2 |
| 1.4 Phòng | như 1.1 | C: đầu khung hiện thành viên khi phiên thuộc phòng; cột phải thành viên + luật phòng | `@aris/ui-chat-header`, `@aris/ui-team-pane` | ○ | GĐ2 |
| 1.5 Tạo phòng | `ui-workspace` (chọn thư mục) | P hộp thoại, dùng `uiWorkspace.pickDirectory` + `workspaces.create` | `@aris/ui-rooms` | ◐ nút + chỉ chọn thư mục | GĐ2 (thành viên) |
| 1.6 Tìm trong mọi phiên | phím tắt `ctx.shortcuts`; tìm phiên `dsh-experimental-session-search` | P hộp thoại ⌘K | `@aris/ui-search` | ○ | GĐ1 |

### Nhóm 2 · Đội bot & Commander

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 2.1 Tạo bot · 2.1b Bot ngoài | `ui-agent-preset` (chọn preset) | P hộp thoại | `@aris/ui-bots` | ○ | GĐ2 |
| 2.2 Hồ sơ bot | `ui-agent-preset`, Cài đặt › Agent presets | P trang (mở từ Đội hình) | `@aris/ui-bots` | ○ | GĐ2 |
| 2.3 Hồ sơ chủ nhân | — | P trang | `@aris/ui-bots` | ○ | GĐ3 |
| 2.4 Nhân bản / xuất bot | — | P hộp thoại | `@aris/ui-bots` | ○ | GĐ2 |
| 2.5 Commander | — | P trang | `@aris/ui-bots` | ○ | GĐ2 |

### Nhóm 3 · Trí nhớ & tự tiến hoá

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 3.1 Ký ức | — | P trang | `@aris/ui-memory` | ○ | GĐ1 |
| 3.2 Thư viện skill · 3.3 Chi tiết skill | `ui-skill` (tham chiếu skill trong chat) | P trang | `@aris/ui-skills` | ○ | GĐ3 |
| 3.4 Hộp duyệt | `ui-approval` (duyệt ngay trong ô nhập) | P trang + giữ T cho duyệt trong ô nhập | `@aris/ui-approvals` | ○ | GĐ3 |
| 3.5 Việc đang chạy | `ui-jobs`, `ui-goal` | P trang | `@aris/ui-runs` | ○ | GĐ3 |

### Nhóm 4 · Tự động

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 4.1 Routine | `ui-schedule` (trang Automation tasks) | R: giữ lõi lịch `dsh-schedule`, thay trang bằng giao diện canvas đọc `ctx.remote.schedule` | `@aris/ui-routine` | ◐ mới đổi tên mục thành Routine | GĐ4 |
| 4.2 Tạo routine bằng lời | hộp tạo của `ui-schedule` | P hộp thoại | `@aris/ui-routine` | ○ | GĐ4 |
| 4.3 Kanban | — | P trang | `@aris/ui-kanban` | ○ | GĐ4 |

### Nhóm 5 · Second Brain & đồ thị

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 5.1 Ghi chú · 5.2 Hộp thư vào · 5.3 Đồ thị · 5.4 Hỏi bộ não | — | P trang (một mục "Second Brain" trên thanh bên, tab bên trong) | `@aris/ui-brain` | ○ | GĐ5 |

### Nhóm 6 · Cài đặt & vận hành

Dsh để cài đặt trong **một hộp thoại** (Chung, Models, Built-in plugins, Agent presets); canvas là **các trang 6.x có điều hướng riêng**. Cách làm: một trang P "Cài đặt" của aris với thanh điều hướng 6.1–6.7; mục "Chung" của dsh (quyền mặc định, ngôn ngữ, giao diện, phông, phím tắt) giữ trong hộp thoại dsh (T) và mở từ mục "Chung" của trang aris. G5 thử nhúng thẳng các mục cài đặt của dsh vào trang aris; được thì bỏ hộp thoại.

| Màn | Vùng của dsh | Cách | Gói aris | Trạng thái | Dữ liệu |
|---|---|---|---|---|---|
| 6.1 Bảng điều khiển | — | P | `@aris/ui-settings` | ○ | GĐ7 |
| 6.2 Provider & model | `ui-settings-models` (Models) | P, đọc danh mục model của dsh | `@aris/ui-settings` | ○ | GĐ1 |
| 6.3 Kênh & ghép đôi | — | P | `@aris/ui-settings` | ○ | GĐ1 (Telegram) |
| 6.3b Mặt tích hợp | — | P | `@aris/ui-settings` | ○ | GĐ6 |
| 6.4 Ngân sách, duyệt, mạng | `ui-permission` (quyền mặc định) | P | `@aris/ui-settings` | ○ | GĐ3 / GĐ7 |
| 6.5 Thống kê & nhật ký | `ui-trajectory` (tab Trajectory trong phiên) | P + giữ T cho tab Trajectory | `@aris/ui-settings` | ○ | GĐ7 |
| 6.6 Màn hình của bot | `ui-sidebar-browser` (chỉ bản desktop) | P | `@aris/ui-settings` | ○ | GĐ8 |
| 6.7 Plugin | `ui-plugin-manager` (trang Plugins, chợ plugin) | T trước; G6 đối chiếu, lệch nhiều thì R | — | ◐ đã xuống chân thanh bên | có sẵn |

### Nhóm 7 · Di động

| Màn | Vùng | Cách | Trạng thái | Dữ liệu |
|---|---|---|---|---|
| 7.1 Thẻ duyệt · 7.2 Báo cáo routine · 7.3 Đề xuất ký ức/skill (Telegram) | — | N: định dạng tin nhắn + nút inline của gateway Telegram | ○ | GĐ1 / GĐ3 / GĐ4 |
| 7.4 Chat web trên điện thoại | Web UI của dsh dưới 768px | N: bố cục hẹp của thanh bên và đầu khung aris | ○ | GĐ8 |

## 4. Phần của dsh mà canvas chưa vẽ — quyết định

| Phần của dsh | Quyết định |
|---|---|
| Màn trống "Into the Unknown" (`conversation.hero.*`) | C: thay bằng lời chào của Aris + gợi ý việc; vẽ thêm vào canvas ở G4 |
| Hộp "Get started" đăng nhập DeepSeek / thêm key (`ui-settings-models`, `ui-settings-account`) | T + Việt hoá; aris không ép đăng nhập tài khoản DeepSeek |
| Cột phải: Workspace files, Terminal, xem trước tài liệu (`ui-sidebar-right`, `-files`, `-terminal`, `-documentpreview`) | Giữ (T), thêm tab "Đội bot" làm tab mặc định |
| Tab Trajectory, chi tiết bước, thẻ tệp thay đổi (`ui-trajectory`, `ui-tool`, `ui-deliverables`) | Giữ (T) — công cụ cho người làm kỹ thuật |
| Chế độ Plan, câu hỏi cho người dùng, duyệt trong ô nhập (`ui-plan`, `ui-user-questions`, `ui-approval`) | Giữ (T); đối chiếu với thẻ duyệt 1.1 ở G4 |
| Nhãn "1017" cạnh model (`ui-deepseek-model-label-1017`) | Tắt row (nhãn tạm của DeepSeek) |
| Thương hiệu DeepSeek (`ui-brand-official`) | Thanh bên aris đã vẽ dấu aris; G2 thay nốt các chỗ còn lại (tiêu đề tab trình duyệt "DeepSeek Harness", màn trống) |
| Danh sách phiên theo workspace (`ui-workspace` trong `sidebar.workspaces`) | Đã bỏ khỏi thanh bên (quyết định số 10); hộp thoại của nó (đổi tên, lưu trữ phiên) vẫn dùng được từ menu phiên |

## 5. Dữ liệu mẫu đang có

| Hằng | Ở đâu | Gỡ khi |
|---|---|---|
| `DEMO_TEAM`, `COMMANDER` (đội 6 bot, trạng thái, dòng phụ) | `packages/aris-ui-sidebar/src/client/team.ts` | GĐ2 (dịch vụ đội bot) |
| `DEMO_PENDING_APPROVALS` (3 việc chờ duyệt) | cùng tệp | GĐ3 (hộp duyệt) |
| Dòng chủ nhân "0,42 / 5 USD hôm nay" | `SidebarRoot.tsx` | GĐ1 (theo dõi chi phí) |
| Bot trên đầu khung luôn là Aris | `packages/aris-ui-chat-header/src/client/Header.tsx` | GĐ2 |
| Bản đồ đội 6 bot quay | `packages/aris-web-spike` | G5 (thay bằng `@aris/ui-team-map`) |

## 6. Thứ tự làm trong giai đoạn G

1. **G2** theme + tiếng Việt + phông — một lần cho cả app.
2. **G3** bộ thành phần; chuyển thanh bên và đầu khung sang dùng bộ này.
3. **G4** khung: ô nhập 1.2, nút hội thoại 1.1 (dòng việc, thẻ duyệt), cột phải "Đội bot", màn trống.
4. **G5** vỏ các trang P theo thứ tự: Cài đặt (khung + 6.2) → Ký ức 3.1 → Bản đồ 1.3 → Routine 4.1 → Hộp duyệt 3.4 → còn lại.
5. **G6** script chụp app thật cạnh canvas cho cả 36 màn, sáng/tối; bảng "đạt / lệch" làm cổng nghiệm thu.
