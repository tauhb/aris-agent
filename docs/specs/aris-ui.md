# Đặc tả · Giao diện mới GĐ9 (đợt 9.1, khung giao diện)

Plan: [plans/gd9-1-khung-giao-dien.md](../plans/gd9-1-khung-giao-dien.md). Bản vẽ: `design/gd9/` (V1, V5, V8–V12). Ảnh thật: `design/gd9/anh-thuc-te/`.

## Công tắc

- `localStorage['aris.ui.v2'] === '1'` thì bật (`isUiV2()` ở `@aris/ui-kit/react`). Mặc định tắt. Bật hay tắt ở Cài đặt › Giao diện; đổi xong trang nạp lại vì các gói đọc công tắc lúc nạp.
- Tắt thì mọi gói đăng ký đúng như trước GĐ9.

## Theme (`@aris/ui-theme`)

- Bật v2: ghi đè token dsh bằng `G9_TOKENS` (cùng khoá với `ARIS_TOKENS`, màu theo `G9_THEMES` ở `@aris/ui-kit`), gắn lớp `aris-v2` lên `<body>`, chèn `V2_CSS`:
  - biến `--g9-*` trên `body.aris-v2` (tối khi có `data-ds-dark-theme`), biến `--a-*` của bộ thành phần đổi theo bảng GĐ9;
  - phông Inter: hai tệp `woff2` (latin, vietnamese) của `@fontsource-variable/inter` nhúng dạng data URL vào `lib/client.js` (loader `.woff2` trong `scripts/build-client.mjs`);
  - bong bóng người dùng xám, thẻ duyệt bo 18 px viền cam nhẹ, nút viên, lựa chọn của thẻ câu hỏi thành hàng nút viên;
  - đầu chat: ẩn tên phiên (`_crumbs`), đẩy nút sang phải.
- CSS bám đuôi tên lớp và thuộc tính `data-*` của dsh như `overrides.ts`, không ghi phần băm.

## Thành phần (lớp `g9-*`, CSS ở `@aris/ui-kit/react/css-v2.ts`)

| Chỗ | Gói | Slot | Nội dung |
|---|---|---|---|
| Thanh bên | `@aris/ui-sidebar` (`SidebarV2`) | `sidebar` | Hàng trên: tìm (`arisNavigate('search')`), chuông (`openActivity()`), dấu cộng (chat mới với Aris, bot mới, phòng ban mới). Danh bạ `rosterV2`. Đáy: menu ảnh đại diện (Bộ não, Tự học, Văn phòng, Routine, Thống kê, các dự án, tạo dự án, Cài đặt) và "Kết nối ứng dụng". Phòng gập lưu ở `aris.ui.v2.collapsed`. |
| Đầu chat | `@aris/ui-chat-header` (`HeaderV2`) | `conversation.header.leading`, `conversation.session.header.actions` | Viên tên bot ở giữa; viên model và nút máy bên phải. Bỏ danh sách phiên và nút phiên mới; "Chủ đề mới" trong menu "…". |
| Hồ sơ bot | `@aris/ui-team-pane` (`ProfileV2`) | loại tab `aris-profile` (`sidebarRightTabs.register`), `sidebar.right.pane.tab`, `.title` | Bot của phiên (chưa gắn là Aris). Thẻ Chi tiết, Thư viện, Máy; bánh răng mở Cài đặt bot. Mở bằng `sidebarRight.openTab('aris-profile', { params: { view } })`. |
| Hoạt động | `@aris/ui-pages` (`ActivityDrawer`) | `shell.overlay` | Mở khi có sự kiện `aris:activity-open`. Ba phần: Cần {you}, Đang chạy (kèm xong hôm nay), Routine. Bấm mục mở phiên của bot. |
| Cài đặt | `@aris/ui-pages` (`Appearance`) | mục `appearance` | Công tắc giao diện mới. |

## Mô hình (hàm thuần, có test)

- `rosterV2(view, live, approvals)`: Aris ghim; phòng theo thứ tự, phòng rỗng bỏ, bot không phòng ở cuối. Chấm: `need` (có phê duyệt chờ hay đang đợi) > `err` (lỗi) > `run` (đang làm). Dòng việc: rỗng khi `need` (thành phần viết "Cần {you} duyệt N việc"); `run`/`err` lấy việc đang làm, không thì việc gần nhất; rảnh lấy việc gần nhất, không thì vai.
- `activityV2(approvals, live, nameOf, now, busy)`: mỗi phê duyệt một mục "cần"; bot đợi mà chưa có phê duyệt cũng vào "cần"; bot đang làm vào "đang chạy"; mục xong hay vấp từ đầu ngày, tối đa 20.
- `profileGroups(bot, view, extra)`: các dòng của hồ sơ; mỗi dòng trỏ tới thẻ của trang hồ sơ bot cũ (`arisNavigate('bot', { id, tab })`, trang này nay nhận `tab`).

## Còn dùng đường cũ (đợt sau thay)

- Mọi trình sửa (lời dặn, model, skill, quyền, routine) là trang hồ sơ bot cũ.
- "Luồng" của bot là phiên mở gần nhất (`openBotSession`); luồng thật ở 9.6.
- Tìm kiếm là hộp "Tìm trong mọi phiên" cũ.
- Thẻ duyệt chi tiết cho tạo bot và sửa lời dặn (V3, V4): 9.2.
