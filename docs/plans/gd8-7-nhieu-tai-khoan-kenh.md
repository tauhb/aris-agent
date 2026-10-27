# Plan 8.7 · Nhiều tài khoản kênh cho một bot, và kênh chăm sóc khách hàng

Đọc trước `docs/plans/gd8-chung.md`. Thay cho phần còn dở của plan 8.4 (Zalo): người dùng chốt ngày 27/10/2026.

## Vì sao

Một bot dùng để chăm sóc khách hàng cần nhiều tài khoản Zalo cá nhân, mỗi tài khoản ở nhiều nhóm khác nhau; Telegram cũng vậy. Lark là kênh nội bộ, giữ một ứng dụng mỗi bot.

Hiện gói `@aris/channels` coi bot là một tài khoản kênh: tài khoản khoá theo mã bot, người đã ghép đôi và nhóm dùng chung cả kênh. Plan này đổi gốc: **tài khoản kênh là đơn vị chính, bot chỉ là người trả lời.**

## Đã chốt với người dùng

- Làm theo năm đợt A → E dưới đây.
- Ngoài giờ trực: mặc định **giữ tin**, vào giờ thì trả lời; tuỳ chọn gửi một câu đặt sẵn (mặc định tắt).
- Không dùng Telegram Business: "nhường tay cho chủ" chỉ làm cho Zalo cá nhân.
- Connector API của 8.5 để sau (không thuộc plan này).

## Đợt A · Sửa lỗi và làm nhanh (không có giao diện mới)

1. **Bị đá phiên, mạng chết im** (việc 9):
   - Zalo Web đá phiên: đã nhận ra và thử lại chậm; thêm **báo chủ** qua Telegram, tối đa 6 giờ một lần mỗi tài khoản.
   - Mạng chết mà không đóng kết nối: bộ canh 5 phút một lần gọi nhẹ Zalo (`fetchAccountInfo`); lỗi hai lần liền thì coi như mất kết nối, đóng trình nghe cũ rồi thử lại theo lịch sẵn có.
   - Dọn trình nghe cũ trước khi mở trình nghe mới (không để hai trình nghe cùng tài khoản).
   - Telegram: kiểm trường hợp long-polling treo không lỗi; thêm hạn chờ cho mỗi lần `getUpdates`.
2. **Cắt tin dài** (việc 3): 1.500 ký tự, theo đoạn rồi dòng rồi câu; nghỉ một nhịp ngắn giữa các phần. Áp cho Zalo và Telegram.
3. **Gom tin dồn dập** (việc 2): mỗi cuộc chat đợi 5 giây không có tin mới rồi mới đưa cả loạt vào phiên một lần; khách nhắn thêm lúc bot đang soạn thì dừng lượt cũ, làm lại với toàn bộ tin.

Test: bộ canh và báo chủ 6 giờ (đồng hồ giả), cắt 1.500, gom tin và bỏ câu trả lời cũ.

## Đợt B · Lõi nhiều tài khoản

- **Tài khoản kênh** là bản ghi riêng: mã `acc-…`, kênh (`telegram` / `zalo`; Lark giữ như cũ), tên, bot trả lời mặc định, trạng thái, giới hạn tần suất riêng. Một bot có nhiều tài khoản; một tài khoản một bot mặc định.
- Khoá trong Keychain theo tài khoản: `TELEGRAM_<acc>_TOKEN`, `ZALO_<acc>_SESSION`.
- Người đã ghép đôi, nhóm (bật/tắt, lời nhắc), mã ghép đôi, phiên chat, giới hạn gửi tin: **theo tài khoản**. Trả lời luôn ra đúng tài khoản đã nhận tin.
- **Trạng thái cuộc chat**: AI / người / chờ / đóng (nền cho đợt C và E).
- **Chuyển dữ liệu cũ** khi khởi động: tài khoản cũ thành tài khoản mới giữ nguyên bot; người, nhóm gán vào tài khoản đó; phiên giữ nguyên. Không phải ghép đôi lại. Có bản sao trước khi chuyển.
- Test: chuyển dữ liệu cũ không mất gì; hai tài khoản cùng bot không lẫn người, nhóm, phiên; mã của tài khoản A không dùng được ở B.

## Đợt C · Bán hàng trên Zalo

1. **Nhường tay cho chủ** (việc 1, chỉ Zalo cá nhân): bật nhận tin chính tài khoản gửi; tin chủ tự gõ (không nằm trong danh sách tin aris vừa gửi) làm cuộc chat đó im 10 phút; tin khách trong lúc đó được giữ; hết 10 phút mà chủ không trả lời thì bot trả lời các tin đang giữ.
2. **Ba nút của model** (việc 4): công cụ "im lặng" (chat riêng lẫn nhóm); "báo chủ" (chuông trên web và Telegram, tối đa 10 phút một lần mỗi cuộc chat); "gặp nhân viên" khi khách gõ (cuộc chat sang trạng thái "người", bot im, báo chủ).
3. **Chế độ khách**: mỗi tài khoản chọn "chỉ người đã ghép đôi" (mặc định) hay "mọi người nhắn riêng là khách" (chỉ hỏi đáp, không làm việc có tác động).
4. **Giờ trực và nhãn** (việc 6): giờ trực theo tài khoản; nhãn Zalo chủ chọn thì bỏ qua (đọc lại nhãn vài phút một lần).
5. **Bot riêng theo nhóm**: không chọn thì dùng bot mặc định của tài khoản.
6. **File, phản ứng, tag** (việc 10): nhận và gửi file đã có; thêm nhận và thả cảm xúc, @nhắc thật trong nhóm Zalo.

## Đợt D · Chỉ trả lời theo tài liệu (việc 5)

- Bật theo tài khoản hay theo bot. Nguồn: các thư mục chọn trong bộ não của aris. Bot chỉ được tra trong nguồn đó, không dùng kiến thức ngoài.
- Không thấy thì trả "chưa có thông tin" (giọng theo cách xưng hô đã chọn). Câu trả lời phải dẫn được đoạn tài liệu; không dẫn được thì thay bằng câu trên.
- Tệp khách gửi lưu riêng, **không bao giờ** vào nguồn tra.
- Không cam kết 100% không bịa: ghi rõ trên giao diện.

## Đợt E · Hộp thư chung và Zalo Bot chính thức

1. **Hộp thư chung** (việc 7): danh sách cuộc chat theo tài khoản, nhóm, bot, trạng thái; xem và nhắn thay; "AI soạn nháp" (người duyệt rồi mới gửi); thống kê cơ bản (số cuộc chat, thời gian trả lời, tỉ lệ AI tự xử lý).
2. **Zalo Bot chính thức** (việc 8): đọc tài liệu `bot.zaloplatforms.com` trước (ghi vào `clean-room-log.md`), viết bộ nối thay `zalo/sdk.ts` (token, nhận tin kiểu `getUpdates`). Dùng cho chủ ra lệnh và nhận kết quả.

## Bản vẽ (vẽ trước, chờ duyệt)

| Khung | Đợt | Nội dung |
|---|---|---|
| `KenhTaiKhoan.dc.html` | B | Cài đặt › Kênh: mỗi kênh là danh sách tài khoản, "+ Thêm tài khoản"; chi tiết một tài khoản: bot trả lời, trạng thái, người đã ghép, nhóm, giới hạn |
| `KenhZalo.dc.html` (vẽ lại) | B, C | Đăng nhập QR cho tài khoản mới; chi tiết tài khoản Zalo: chế độ khách, giờ trực, nhãn bỏ qua, nhường tay cho chủ, nhóm có công tắc và bot riêng |
| `HoSoBotKenh.dc.html` | B | Hồ sơ bot: các tài khoản kênh bot đang trả lời |
| `TraLoiTheoTaiLieu.dc.html` | D | Bật chế độ, chọn thư mục nguồn, câu khi không có thông tin |
| `HopThuChung.dc.html` | E | Hộp thư chung: danh sách, khung chat, nháp AI, thống kê |
| `KenhZaloBot.dc.html` | E | Kết nối Zalo Bot chính thức bằng token |

Đợt A không có giao diện mới. Chuông "báo chủ" dùng chỗ thông báo sẵn có.

## Kiểm tra

Theo `gd8-chung.md`. Phần thử thật cần tài khoản Zalo, Telegram của người dùng: ghi rõ phần chưa thử.
