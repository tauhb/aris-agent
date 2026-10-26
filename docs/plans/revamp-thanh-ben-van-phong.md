# Plan revamp thanh bên và Văn phòng — để Sonnet làm

Người viết plan: Opus. Người làm: subagent Sonnet 5.5 effort cao. Opus soát diff, thử trên web và commit. Người dùng đã duyệt bản vẽ.

## Bản vẽ (nguồn sự thật)

Các bản vẽ nằm trong `design/canvas/`. Đọc HTML; dữ liệu mẫu và chữ nằm trong `<script>` ở cuối tệp.

- `SidebarMoi.dc.html`: thanh bên mới.
- `VanPhong2D.dc.html`: Văn phòng, tab Tổng quan, chế độ 2D.
- `VanPhongPhongBan.dc.html`: tab Phòng ban.
- `VanPhongKanban.dc.html`: tab Kanban.
- `VanPhong3D.dc.html`: chế độ 3D. **Đợt này không làm**, vì cần cài thư viện `three` và người dùng chưa duyệt. Chỉ để nút chuyển 3D ở trạng thái tắt, ghi "sắp có".

Xem trực tiếp: máy chủ xem bản vẽ ở `http://127.0.0.1:4317/<tệp>` nếu đang chạy. Không bắt buộc mở.

## Luật bắt buộc

- Không commit, không push, không dùng mạng, không cài gói. Chỉ được chạy `pnpm install --offline`.
- Không đọc khoá; không mở `.dsh-home/.credentials.yaml`. Log daemon chỉ đọc qua `sed 's/token=[^ &"]*/token=***/g'`.
- Chữ giao diện đặt trong các tệp `text.ts` của từng gói, đủ cả khối tiếng Anh lẫn tiếng Việt. Dùng `{you}`, không viết cứng "anh". Bỏ khoá không còn dùng.
- **Không bịa dữ liệu.** Mọi con số, trạng thái, dòng hoạt động lấy từ API thật. Phần bản vẽ có mà API chưa có thì bỏ hoặc thay bằng dữ liệu thật gần nhất, rồi ghi vào báo cáo.
- **Bớt chữ:** không thêm dòng giải thích ngoài bản vẽ. Chi tiết đưa vào `title` hoặc tooltip.
- Chuyển động phải tắt khi người dùng bật `prefers-reduced-motion`.
- Màu theo biến `--a-*` để tự theo sáng tối của app.
- Đặt tên CSS lớp mới với tiền tố riêng: `ap-of-` cho Văn phòng, `ap-lr-` cho Tự học, `as-` hay tiền tố đang dùng của `aris-ui-sidebar` cho thanh bên. Grep trước để tránh trùng.
- Giữ chức năng đang có; chỉ chuyển chỗ và gộp lại.
- Chú thích mã viết tiếng Việt có dấu, theo giọng mã sẵn có.

## R1 · Thanh bên (`packages/aris-ui-sidebar`)

1. **Menu chính.**
   - Có bốn mục: **Văn phòng**, Second Brain, Routine, **Tự học**.
   - Bỏ mục Kanban riêng (Kanban thành tab trong Văn phòng). Bỏ "Bản đồ đội".
   - Văn phòng có nhãn nhỏ "N đang làm" nếu N > 0. Tự học có số việc chờ duyệt, lấy cùng nguồn với thanh "việc đợi duyệt" hiện có.
   - Route: thêm `office` (trang Văn phòng), `learn` (Tự học). `map` và `kanban` cũ chuyển sang `office`, với `kanban` mở sẵn tab Kanban (giữ tham số dự án nếu có). Xem `packages/aris-ui-pages/src/client/routes.ts` và chỗ đăng ký menu `nav: true`.
2. **Đội hình theo trạng thái** (phương án 3):
   - Aris luôn ở trên cùng, như hiện nay.
   - Nhóm **"Cần chú ý · N"**: các bot đang chạy hoặc đang chờ duyệt. Mỗi dòng có linh vật, tên, "· tên phòng ban" và một dòng việc. Màu xanh khi đang làm, cam khi chờ {you} duyệt. Bấm tên phòng ban thì mở trang phòng ban (`department`); bấm phần còn lại của dòng thì mở chat như hiện nay.
   - Các bot còn lại gom thành **một dải linh vật** dưới nhãn "Rảnh · N": linh vật nhún nhẹ, có chấm trạng thái, `title` là tên bot, bấm vào thì mở chat với bot đó. Cuối dải có link "Xem cả đội ›" sang Văn phòng.
   - Nút "+" cạnh "Đội hình" mở menu nhỏ: "Bot mới" (luồng hiện có) và "Phòng ban mới" (luồng tạo phòng ban hiện có trong `team/Department.tsx`).
   - Trạng thái chạy và chờ duyệt lấy từ dữ liệu sống mà sidebar đang dùng (xem `useTeam`, `live`, chỗ hiện vòng quay "đang làm"). Dòng việc lấy tiêu đề phiên đang chạy hay việc đang làm; nếu không có thì để trống.
3. Mục Phòng và Dự án giữ nguyên, nhờ vậy được đẩy lên cao hơn.

## R2 · Trang Văn phòng (`packages/aris-ui-pages`, trang `office`)

Đầu trang có:
- tên "Văn phòng";
- nút chuyển 2D / 3D (3D bị vô hiệu, `title` "sắp có");
- ba tab Tổng quan · Phòng ban · Kanban;
- giờ hiện tại;
- nút chuông **"Cần {you} · N"**: mở danh sách duyệt nhanh, gồm việc chờ duyệt (Duyệt, Từ chối) và câu bot hỏi (Trả lời mở chat). Dùng API hộp duyệt và câu hỏi hiện có (xem trang `approvals`, `HopDuyet`).

### Tab Tổng quan (2D)

- **Aris** (linh vật to) và một **bong bóng thoại** gồm một câu dựng từ dữ liệu thật, không gọi model. Ví dụ: "N việc chờ {you}. Lâm với Hạ đang làm, Tín nghỉ từ 8 giờ." Viết hàm thuần `officeSummary(...)`, có test.
- **4 con số lớn:**
  - token hôm nay (`/api/aris/stats?range=today`);
  - chi phí hôm nay so với trần (`/api/aris/guard`: `spent`, `settings.teamCapUsd`);
  - số bot đang làm;
  - số việc chờ {you}.
- **Tab phòng ban** dạng viên bo tròn: Tất cả, rồi từng phòng ban, kèm nhãn "N đang làm" hoặc "N chờ" nếu có. Chọn một phòng thì lọc các bàn bên dưới.
- **Bàn làm việc:** mỗi phòng ban một khu (tiêu đề là tên phòng, bấm vào thì mở trang phòng ban), trong đó mỗi bot một **cảnh**:
  - dòng **terminal** phía trên: nền tối, chữ mono, hiệu ứng gõ và con trỏ nhấp nháy. Nội dung là việc đang làm (tên công cụ hay tiêu đề), "Chờ {you} duyệt …", hoặc "Zzz… nghỉ từ HH:MM";
  - **sân khấu**: linh vật thật của bot (component `Mascot` trong ui-kit) ngồi sau bàn có laptop vẽ bằng SVG như bản vẽ;
  - chuyển động theo trạng thái: đang làm thì nhún và màn laptop sáng; chờ duyệt thì nhảy, có dấu "!" cam; rảnh lâu thì nghiêng ngủ, có "z z";
  - **dưới cảnh**: tên, vai trò, chấm trạng thái kèm chữ, tên model.
  - Bản vẽ có phụ kiện riêng cho từng bot (kính, tai nghe…); dữ liệu chưa có thì **bỏ**.
- **Cột phải "Vừa làm gì":** mỗi dòng gồm giờ, chấm màu (xanh là xong, cam là chờ hay hỏi, đỏ là bị chặn hay lỗi), linh vật nhỏ và một câu.
  - Nguồn: hoạt động của bot (`aris_bots` activity, xem nơi trang hồ sơ bot hay team pane đang đọc), sự kiện duyệt và bị chặn (`@aris/stats` events, `arisGuard.blocked`), routine chạy xong.
  - Có thể thêm `GET /api/aris/stats?feed=1&limit=30` trả danh sách đã gộp, có test.
  - Lọc theo tab phòng ban đang chọn.
- **Bấm một bàn** thì mở **ngăn kéo bên phải** của bot đó:
  - dòng terminal việc đang làm;
  - vài bước gần nhất (dùng `/api/aris/stats?replay=<sid>` của phiên đang chạy, lấy 3–5 bước cuối);
  - các nút: Từng bước (mở phát lại phiên), Mở chat, Dừng (dùng đúng cơ chế huỷ phiên mà nút dừng trong chat đang dùng);
  - **ô nhắn**: gửi tin vào phiên đang chạy theo cơ chế "Chèn vào việc" mà chat đang có. Tìm trong `aris-ui-chat` / `aris-channels` chỗ xử lý "Khi bot đang làm mà {you} nhắn thêm". Không có phiên đang chạy thì mở chat.
- Tự cập nhật mỗi 5 giây.

### Tab Phòng ban

- Mỗi phòng ban một thẻ, như bản vẽ:
  - tên phòng;
  - viên trạng thái (N đang làm, N chờ duyệt, rảnh);
  - mô tả;
  - dải linh vật thành viên;
  - số bot;
  - chi tiêu hôm nay so với trần (`department.policy.budgetUsd` và chi tiêu theo phòng, xem `guard` API `departments`);
  - model mặc định;
  - thanh ngân sách.

  Bấm thẻ thì mở trang `department` hiện có.
- Nút "+ Phòng ban mới" (đầu trang và thẻ viền đứt): luồng tạo phòng ban hiện có.
- Dòng "Chưa vào phòng": các bot không thuộc phòng nào.

### Tab Kanban

Nhúng màn Kanban hiện có (component của trang `kanban`) vào tab này. Đổi giao diện nhẹ theo bản vẽ nếu không phá chức năng:
- cột có chấm màu;
- thẻ có linh vật người làm;
- thẻ ở cột "Chờ {you} duyệt" có nút Duyệt nếu API cho phép.

Không viết lại logic Kanban.

### Tự học (trang `learn`)

Một trang ba tab: **Hộp duyệt · Ký ức · Thư viện skill**. Mỗi tab dùng lại trang hiện có (`approvals`, `memory`, `skills`). Các đường cũ vẫn mở được.

### Bỏ hay giữ

- Trang Bản đồ đội 3D cũ (`team/Map.tsx`): không còn trong menu. Route `map` chuyển sang `office`. Giữ tệp để làm lại 3D ở đợt sau.
- `settings/Dashboard.tsx` (dữ liệu mẫu): không dùng; để nguyên.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`, có test mới cho `officeSummary`, phân nhóm thanh bên (hàm thuần chọn bot "cần chú ý" và "rảnh"), và gộp feed nếu có.
3. `npx eslint .` và `npx prettier --check .`.
4. `node scripts/aris.mjs restart`, đợi 15 giây, rồi `node scripts/aris.mjs status`: Telegram "đang nhận tin", log không có lỗi nạp.

## Báo cáo cho Opus

- Tệp đã sửa và tạo.
- Từng phần R1, R2: đã làm gì, nguồn dữ liệu cho từng con số và từng dòng, chỗ bỏ hay khác bản vẽ và lý do.
- Kết quả thật của 4 bước kiểm tra.
