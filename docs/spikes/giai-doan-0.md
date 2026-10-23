# Giai đoạn 0 — kết quả

> 23/10/2026 · dsh `0.2.1-rc.2` (ghim chính xác; dsh chưa có bản ổn định, mọi bản trên npm đều là bản thử nghiệm).

## Đã dựng

| Phần | Nội dung |
|---|---|
| Monorepo | pnpm workspace, TypeScript 6 strict (NodeNext), Vitest, ESLint, Prettier |
| `@aris/bundle` | Lớp cấu hình `dsh.bundle` xếp sau bundle của dsh; mọi row aris nằm ở `packages/aris-bundle/cordis.patch.yml` |
| Ba profile | `aris` = dsh-base → dsh-web-app → @aris/bundle; `aris-acp` = dsh-base → dsh-acp-app → @aris/bundle; `aris-headless` = dsh-base → dsh-headless → @aris/bundle. Tạo bằng `pnpm aris:setup` trong `.dsh-home/` của repo, không đụng `~/.dsh` |
| `@aris/hello` | Plugin mẫu: đoạn prompt `aris:hello` (thứ tự 50), tool `aris_hello`, bản ghi `plugin:aris/hello` trong log phiên |
| `@aris/ui-kit` | Token màu sáng/tối, phông chữ, 5 trạng thái (Đang làm, Chờ anh, Xong, Vấp, Rảnh), 30 linh vật sinh từ `design/canvas/ThuVienLinhVat.dc.html` bằng `scripts/gen-ui-kit.mjs` |
| CI | `.github/workflows/ci.yml`: build, lint, định dạng, test, chặn phụ thuộc/import Hermes Agent, quét giấy phép, dựng profile và bắt tay ACP |

## Thử nghiệm 1 · "nhiều mặt"

Mục tiêu: chứng minh cùng một `aris-bundle` chạy được ở mọi mặt.

| Mặt | Kết quả |
|---|---|
| Web (`pnpm aris`) | Khởi động sạch; plugin dò xác nhận tool `aris_hello` và đoạn prompt `aris:hello` có trong system prompt |
| ACP (`pnpm aris:spike`) | Đóng vai IDE qua stdio: `initialize` trả ACP v1, `session/new` tạo phiên; plugin dò xác nhận tool và đoạn prompt đã nạp. Đây chính là đường Buzz Desktop, Zed, VS Code dùng |
| Headless (`pnpm aris:ask "…"`) | Khởi động với lớp aris, dừng ở `MISSING_CREDENTIAL` vì máy chưa có `DEEPSEEK_API_KEY`. Chạy trọn một câu hỏi cần khoá |

Ghi chú kỹ thuật:
- Profile ACP giữ riêng stdout/stderr cho giao thức, nên plugin dò ghi kết quả ra `$DSH_HOME/probe.out`.
- `--patch` phải đứng trước tham số của app (`dsh --profile aris --patch x.yml --port …`).
- Bản ghi riêng trong log phiên dùng `appendPluginRecord` với tên `plugin:aris/<loại>`; dsh kiểm tra đúng lớp `Session`, nên kiểm thử dùng `Session.create` thật.

**Kết luận: kiến trúc "một lõi, nhiều mặt" chạy được trên dsh hiện tại.**

## Thử nghiệm 2 · giao diện

Mục tiêu: giao diện aris làm bằng plugin Web client của dsh được tới đâu.

Đã làm: `@aris/web-spike` thêm mục **"Bản đồ đội"** vào thanh bên trái của dsh và một trang riêng ở vùng chính, vẽ quỹ đạo 3D 6 bot bằng canvas. Chạy thật trong Web UI, không lỗi console.

Chỗ cắm Web client của dsh cho phép (đọc từ các gói client có sẵn):

| Chỗ cắm | Dùng cho màn aris |
|---|---|
| `sidebar.panellist` + `main` | Trang riêng: Bản đồ đội 3D, Kanban, Routine, Second Brain, Đồ thị, Hộp duyệt, Cài đặt aris |
| `sidebar.right.pane.tab` | Cột phải: sơ đồ đội nhỏ, chi tiết bot, chi tiết việc |
| `uiConversation.events.register` + `conversation.chat.turnTail` | Thẻ trong khung chat: dòng việc rẽ nhánh, thẻ duyệt |
| `shell.bottom`, `sidebar.brand.*`, `sidebar.toggle.badge` | Thanh dưới, thương hiệu aris, huy hiệu "3 việc đợi anh" |
| `presentCall` / `presentResult` của tool | Thẻ hiển thị riêng cho từng tool aris |

Giới hạn đã thấy:
- Gói client phải ở định dạng `window.__ModuleLoader__` mà dsh build bằng tsdown; thử nghiệm viết tay. Giai đoạn 1 cần dựng chuỗi build React + TypeScript cho client.
- Danh sách phiên, khung chat và thanh bên trái là của dsh; aris thêm vào được nhưng chưa chắc đổi được toàn bộ bố cục như canvas (ví dụ thay danh sách "Workspaces" bằng "Đội hình"). Cần thử tiếp ở giai đoạn 1–2 trước khi chốt.

**Kết luận: chọn phương án A** (giao diện aris là plugin của Web client dsh). Phương án B (app web riêng nói chuyện qua `dsh sdk`) giữ làm dự phòng nếu không thay được bố cục thanh bên.

## Cần anh

- Khoá API DeepSeek (đặt `DEEPSEEK_API_KEY` khi chạy, hoặc nhập ở trang Models của Web UI) để chạy trọn một câu hỏi và kiểm tra tool `aris_hello` được model gọi thật.
