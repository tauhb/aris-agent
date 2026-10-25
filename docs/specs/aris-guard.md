# @aris/guard, @aris/keychain — hàng rào cho mọi bot (giai đoạn 7, đợt 7a)

Bản vẽ 6.4 `BaoMat.dc.html` ("Ngân sách, duyệt, an toàn"). Làm ở local (chốt 26/10).

## Trần cả đội

- Tổng chi phí hôm nay = mọi lần gọi model (`ledger.summary().today`) + ảnh, video (`arisSpend.total()`).
- Trần cả đội mỗi ngày (mặc định 5 USD), báo Telegram (qua Aris) khi chạm ngưỡng (mặc định 80%) và khi chạm trần,
  mỗi mức một lần mỗi ngày (bảng `notices`).
- Chạm trần: "Dừng việc nền, chat vẫn trả lời" (mặc định) hay "Dừng hết". Việc nền là routine, Thủ thư, kiểm thử
  skill, phiên khách ACP, phiên con, thành viên đội và việc được giao (`tag.via` là `team`, `dispatch`). Bước model
  bị chặn ở `agent/pre-step` kèm một câu báo cho bot, như trần phòng ban của `@aris/providers`.
- Các trần riêng giữ nguyên: phòng ban, ảnh và video, Thủ thư nạp 0,50, vòng học 0,30, hồ sơ 0,20, soát sâu 0,30.

## Dừng khẩn cấp

`POST op=stop`: ghi `stopped`, huỷ mọi phiên đang chạy (`sessionController.cancel`), ngắt ứng dụng ACP. Khi đang
dừng: mọi bước model bị chặn; routine, Driver không chạy; `aris-acp` từ chối bắt tay; Telegram trả lời tin thường
"aris đang dừng khẩn cấp…" (lệnh `/` vẫn chạy). `op=resume` chạy lại.

## Danh sách cấm cứng (mọi bot, kể cả Aris, áp cả khi đã duyệt)

`tools/pre-execute` đứng đầu: xoá đệ quy (`rm -r`) ngoài thư mục làm việc, `git push --force`, `sudo`, đọc khoá
trong Keychain (`security find-…`, `dump-keychain`), đọc hay sửa khoá và dữ liệu riêng (`~/.ssh`, `~/.aws`, `.env`
trừ `.env.example`, `~/.aris`, `.dsh-home`, `.credentials.yaml`). Ghi nhật ký chặn 7 ngày. Phiên khách ACP có thêm
danh sách riêng chặt hơn (`@aris/acp`).

## Duyệt

- "Hỏi người dùng" (mặc định) hay "Tự cho việc rủi ro thấp": đọc tệp, lệnh chỉ đọc (`ls`, `git status`, tìm…, không
  chuyển hướng, không `-delete`), ghi trong thư mục làm việc. Mạng, gửi ra ngoài, ghi ngoài thư mục vẫn hỏi.
- Chờ duyệt quá hạn (mặc định 30 phút; 0 là chờ mãi) thì từ chối. Phiên khách ACP do ứng dụng quyết.

## Kho khoá trong Keychain (`@aris/keychain`)

- Thay row `credentials` của dsh (tắt `dsh-credentials-local`, chèn `@aris/keychain`): lớp con của
  `LocalCredentialProvider`. Khoá API đọc Keychain trước rồi tới tệp, môi trường, `.env` như cũ; khoá mới lưu vào
  Keychain (dịch vụ `aris-dsh-credentials`); bản ghi đăng nhập tài khoản vẫn ở tệp.
- Ghi qua stdin của `security -i` dưới dạng hex nên giá trị không nằm trong tham số lệnh; đọc lại khớp mới coi là
  ghi xong. Tên khoá ở Keychain lưu trong `aris-keychain.json` cạnh tệp khoá (chỉ tên).
- "Chuyển cả vào Keychain": từng khoá trong tệp được chép sang, đọc lại khớp rồi mới xoá khỏi tệp.
- Bot vẫn chạy dưới tài khoản người dùng nên Keychain không cách ly khoá khỏi bot; danh sách cấm cứng chặn lệnh
  `security` đọc khoá.

## Đường máy chủ

`GET /api/aris/guard`: cài đặt, chi phí hôm nay, mức báo, trần phòng ban, ảnh/video, nhật ký chặn, số việc chờ
duyệt, tên khoá và nơi giữ. `POST`: `stop`, `resume`, `set`, `keys-move`.

## Đã chạy trên máy (26/10)

Daemon chạy với kho khoá mới, nhà cung cấp vẫn đọc được khoá; màn 6.4 hiện 6 khoá (tên) đang ở tệp; dừng khẩn cấp
⇒ `aris-acp` báo "aris đang dừng khẩn cấp", màn hiện dải đỏ; Chạy lại về bình thường. Lớp Keychain ghi, đọc lại,
xoá thật với khoá thử. Chưa thử: bấm "Chuyển cả vào Keychain" với khoá thật, báo Telegram khi chạm ngưỡng, dừng
khẩn cấp lúc có phiên đang chạy.
