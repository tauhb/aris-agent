# Nghiệm thu giai đoạn 2 · Đội bot và Commander

Ngày 24/10/2026, nhánh `claude/fervent-bose-b47879`. Tiêu chí lấy từ [kế hoạch triển khai](../ke-hoach-trien-khai.md#giai-đoạn-2--đội-bot-và-commander-tuần-68).

## Kiểm tra tự động

`pnpm check` đạt: build, lint, định dạng, 69 tệp / 335 test, chữ tiếng Việt 2760/2760, không phụ thuộc hay import nào tới Hermes Agent, 677 gói không có giấy phép ngoài danh sách.

## Tiêu chí nghiệm thu

| # | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | "Tóm tắt 3 đối thủ rồi xếp lịch họp" ⇒ Aris giao hai bot song song, thấy hai nhánh, duyệt lời mời họp trên nhánh hoặc Telegram | **Đạt** (duyệt trên web; thẻ Telegram đã gửi, chờ người dùng xác nhận đã thấy) | Thử 24/10 18:19: Aris giao Minh (tóm tắt) và An (lời mời họp) cùng lúc, hai nhánh chạy song song; An xin quyền "Ghi /tmp/aris-loi-moi-hop.ics" (ghi ngoài thư mục làm việc nên hỏi), thanh duyệt và thanh bên "1 việc đợi … gật đầu", cho phép → tệp lời mời họp thứ Sáu 30/10 15:00–16:00, nhắc trước 15 phút; Aris tổng hợp tóm tắt 3 đối thủ (PACE, FPT Digital, Gitiho / Unica) và tệp. |
| 2 | Dự án 3 bot bàn một việc trong chat chung, dừng sau tối đa 3 vòng; việc chia ra hiện trên Kanban | **Đạt** | Bước 3e: `@all` với Thơ, Minh, Phát → 2 vòng, 6/10 tin, Aris hỏi người dùng chọn; "Dừng phòng" dừng giữa vòng. Bước 3c–3d: thẻ của đội và việc lớn hiện trên Kanban của "Thử dự án aris". |
| 3 | Nhắn thẳng cho một bot qua bot Telegram riêng của nó | **Đạt** | Bước 5: trang 6.3 gắn tài khoản Telegram cho từng bot; người dùng đã thử nhắn riêng và nhận trả lời của đúng bot. |
| 4 | Bot thường không giao việc tiếp; chỉ Commander và trưởng nhóm đang nhận việc của phòng được mở Team | **Đạt** | Thử 24/10 18:21: Thơ gọi `giao_viec` → "Không giao được: Chỉ Commander, hoặc trưởng nhóm đang nhận việc lớn của phòng, được giao việc."; `spawn_teammate` bị chặn ở phiên bot thường (luật đội). Thêm: bot tắt "Commander được giao việc" thì `giao_viec` của Aris cũng báo lỗi (test). |
| 5 | Giao "nghiên cứu sâu 5 đối thủ" cho một phòng ⇒ trưởng nhóm mở Team riêng, nộp báo cáo vào thẻ Kanban | **Đạt về cơ chế** (thử với 2 việc con, chưa chạy đúng 5 báo cáo) | Bước 3d: Aris `giao_phong` phòng Tăng trưởng → Thơ (trưởng nhóm) chia 2 thẻ cho Minh, Phát trong Team riêng → xong 2/2 → báo cáo về Aris; Kanban có thẻ "Việc lớn · Tăng trưởng" kèm tiến độ. |
| 6 | "Sửa lỗi đăng nhập trong repo X" ⇒ giao bot ngoài Claude Code, thấy từng bước trên nhánh, duyệt lệnh nguy hiểm trên Telegram | **Đạt** | Thử 24/10 18:27 với repo thử `demo-login` (test báo đúng mật khẩu vẫn không đăng nhập được): Aris giao Kiệt (Claude Code); nhánh hiện từng bước (chạy test, đọc `login.js`, sửa, chạy lại test); 6 lần xin quyền (lệnh Bash, sửa tệp) đều được người dùng duyệt trên Telegram (bản ghi `by: telegram`); Kiệt sửa đúng chỗ (`digest('base64')` thành `digest('hex')`), test đạt, 0,19 USD. Lưu ý: việc giao từ phiên chat riêng (thư mục không phải repo) nên không có worktree, Kiệt sửa thẳng repo gốc; worktree chỉ tạo khi thư mục của phiên giao việc là repo (đã thử ở bước 4). |

## Hạng mục trong kế hoạch

| Hạng mục | Trạng thái |
|---|---|
| `aris-bots`: hồ sơ, SOUL theo phiên bản, linh vật, model theo việc, quyền, kênh riêng, tạo / nhân bản / xuất / nhập | Xong (màn 2.1, 2.2, 2.2c, 2.2d, 2.4) |
| `aris-commander`: `giao_viec`, `chuyen_giao`, `giao_phong`, `moi_noi`, `tao_the`; nhật ký định tuyến có lý do; giới hạn 4 bot mỗi lần, 6 bot cùng lúc | Xong |
| Trợ lý ẩn danh (`tro_ly_an`) | Dùng công cụ bot con có sẵn của dsh, không có công cụ riêng; khác kế hoạch: bot thường cũng gọi được bot con ẩn danh (dsh giới hạn độ sâu nên không thành vòng lặp) |
| Trần ngân sách mỗi việc | Xong (24/10): trần tiền mỗi việc ở trang Commander, áp cho bot trong đội và bot ngoài; cùng trần ngân sách mỗi ngày theo phòng |
| Phòng ban, dự án, Kanban, phòng nhóm | Xong (bước 3a–3e, Kanban làm đẹp lại 24/10) |
| Dòng việc rẽ nhánh, đầu tin "ai đang nói", sơ đồ đội 3D | Xong |
| Bot ngoài (M3) | Claude Code, Codex chạy thật; ACP chỉ có đường plugin của dsh. Gemini CLI, OpenCode, Hermes chưa thử vì chưa cài trên máy |
| Kết nối nền tảng (M4): MCP theo bot | Xong (bước hồ sơ bot đợt 1); đã thử với máy chủ MCP thử trên máy; GitHub, Lark, Notion thật cần token của người dùng |
| Duyệt tập trung (web, thanh bên, Telegram) | Xong |
| Giao diện 1.1–1.4, 2.1, 2.1b, 2.2, 2.4, 2.5 | Xong; trang Commander (2.5) nối dữ liệu thật (24/10), còn "Commander đã học" (giai đoạn 3) và Driver (giai đoạn 4) là bản vẽ |

## Còn lại

- Tiêu chí 1: người dùng xác nhận thẻ "CẦN DUYỆT · An" trên Telegram đã tự cập nhật thành "đã duyệt trên web".
- ~~Bot ngoài nhận việc có đường dẫn repo khác thư mục của phiên giao việc: chưa tạo worktree cho repo đó~~ → đã làm (24/10): Commander nêu `thu_muc`, hoặc aris lấy repo nhắc trong việc khi phiên giao không ở trong repo; worktree tạo từ repo đó. Thử thật 24/10 19:19 từ phiên chat thường: Aris giao Kiệt với `thu_muc` là repo `demo-login`, worktree mới ở `~/.aris/worktrees/demo-login/` (nhánh `aris/kiet-them-test-…`), 2 lần xin quyền (sửa tệp, chạy lệnh) duyệt trên Telegram, Kiệt thêm 1 test, test đạt, repo gốc không đổi, 0,14 USD.
- Tiêu chí 5 ở quy mô 5 báo cáo (tuỳ chọn, tốn thêm chi phí model).
- ~~Trang Commander 2.5 nối dữ liệu thật cho danh sách bot và giới hạn~~ → đã làm (24/10): bot nhận việc, duyệt mỗi lần, trợ lý ẩn danh, bot chạy cùng lúc, việc lớn cùng lúc, trần tiền mỗi việc đều lưu và áp thật.
- Bảng điều khiển (6.1) đã rời Cài đặt, sẽ ra menu chính; hiện vẫn là dữ liệu mẫu.
- Ghi nhận khi thử: An ghi tệp .ics có ký tự xuống dòng sai, Aris tự phát hiện và sửa; Minh lúc đầu trả "kết quả cũ" vì được nhắn tiếp trong cùng cuộc, Aris hỏi lại thì Minh trả đủ.
