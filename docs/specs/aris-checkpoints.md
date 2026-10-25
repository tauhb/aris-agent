# Đặc tả `aris-checkpoints` — điểm khôi phục tệp (giai đoạn 4, đợt 5)

> Học cách làm của Hermes (đọc tài liệu, nhật ký clean-room 25/10), viết lại cho aris. Mục đích: bot sửa tệp (nhất là routine và Driver chạy không người trông) thì luôn quay lại được.

## Chụp khi nào

- Trước công cụ ghi tệp của dsh (`write`, `edit`) và trước lệnh bash **không chắc chỉ đọc** (cùng bộ lọc với hộp cát skill và routine), trong thư mục làm việc của phiên.
- **Mỗi thư mục mỗi lượt một lần**: lượt có mười lần sửa vẫn chỉ một điểm, là trạng thái ngay trước lần sửa đầu.
- Không có gì đổi so với điểm trước thì không tạo điểm mới.
- Bỏ qua: thư mục quá rộng (`/`, thư mục nhà), thư mục quá 50.000 tệp, tệp lớn hơn 10 MB, các thư mục nặng thường gặp (`node_modules`, `.git`, `.venv`, `dist`, `build`, `.next`, `target`); `.gitignore` của dự án vẫn được tôn trọng. Không có `git` thì tắt êm.
- Lỗi khi chụp không bao giờ chặn công cụ của bot (chỉ ghi log).

## Lưu ở đâu

Một kho git ẩn dùng chung `~/.aris/checkpoints/store` (git tự gộp nội dung trùng giữa các dự án và các lần chụp); mỗi thư mục một chỉ mục và một nhánh `refs/aris/<mã thư mục>`. Không đụng tới `.git` thật của dự án. Bảng `points` của kho `aris_checkpoints`: mã, thư mục, commit, lúc chụp, bot, phiên, công cụ và chi tiết (lệnh, tệp).

Giữ tối đa 20 điểm mỗi thư mục và 7 ngày; dọn mỗi ngày (bỏ nhánh cũ, `git gc`).

## Xem và khôi phục

- **Xem khác biệt**: từ điểm tới hiện tại (danh sách tệp kèm số dòng thêm/bớt, rồi phần khác biệt, cắt ở 200 KB).
- **Khôi phục**: chụp trạng thái hiện tại trước (khôi phục được cả lần khôi phục), rồi đưa mọi tệp về như lúc chụp: tệp sửa thì về bản cũ, tệp tạo sau thì xoá, tệp xoá thì tạo lại. Một tệp: chỉ tệp đó.
- Lệnh `/rollback` trong phiên: liệt kê điểm của thư mục phiên; `/rollback diff <n>`; `/rollback <n>`; `/rollback <n> <tệp>`.
- Màn 3.5 "Điểm khôi phục": dữ liệu thật (lúc, "Trước khi <bot> sửa N tệp trong <thư mục>", Xem khác biệt, Khôi phục có hỏi lại). `GET/POST /api/aris/checkpoints`.
- Không quay lại cuộc trò chuyện (khác Hermes): bot vẫn nhớ đã sửa; muốn bot biết thì nói với bot.
