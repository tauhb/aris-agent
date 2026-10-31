# Nghiên cứu OpenMausBot, so với Rakazo, điểm mạnh lấy về aris (31/10/2026)

Người dùng yêu cầu đọc thêm OpenMausBot (`github.com/milind-soni/OpenMausBot`, commit `80012e6`), xem điểm mạnh so với Rakazo, và lấy các điểm mạnh về aris. Ba sub agent chỉ đọc mã và tài liệu, không chạy gì trong repo. Báo cáo gốc (tiếng Anh, có dẫn đường tệp) ở `docs/nghien-cuu/openmausbot/`:

1. [Lõi chạy bot](openmausbot/1-loi-chay-bot.md)
2. [Máy tính và app](openmausbot/2-may-tinh-va-app.md)
3. [Đội và nền tảng](openmausbot/3-doi-va-nen-tang.md)

Đọc cùng [rakazo.md](rakazo.md) (lộ trình GĐ9).

## 1. OpenMausBot là gì, nói gọn

- Cũng là bản mã nguồn mở nhái Grok Bot, nhưng **không tự viết vòng chạy agent**: mỗi bot là một CLI có sẵn chạy ngầm (Claude Code, Codex, hơn chục CLI qua ACP, Pi, hay một endpoint kiểu OpenAI), dùng đăng nhập sẵn có của người dùng. Gần với "bot ngoài" của aris hơn là với lõi dsh.
- Một tiến trình Node, dữ liệu là tệp JSON và SQLite, app Electron cho Mac, Windows, Ubuntu (máy chủ chạy ngay trong app), app iPhone ghép bằng mã QR. Nhẹ: khoảng 2 CPU, 4 GB.
- Rất lớn: khoảng **913 nghìn dòng** (nửa phần máy chủ là test).
- **Giấy phép**: Apache-2.0, trừ `enterprise/` (chỉ được đọc; chạy thật cần khoá, cấm phân phối): nhãn trắng, bảng quản trị, ngân sách, bán giá, SSO. Tên và linh vật OpenMausBot là nhãn hiệu. Phần tạo đội, mời người, danh sách nhân sự, thanh toán nằm ở một dịch vụ Admin **đóng**, không có trong repo.
- **Có tệp chép từ Hermes** (soát skill chạy nền, MIT). Luật của aris cấm chép mã Hermes: những tệp đó không lấy, kể cả ý tưởng đi kèm thì chỉ học qua tài liệu như trước.

## 2. So nhanh với Rakazo

| Mảng | OpenMausBot | Rakazo | Ai hơn |
|---|---|---|---|
| Vòng chạy | Điều khiển CLI của hãng khác | Pi bọc trong lớp chạy bền của Rakazo | Rakazo (aris có dsh, hơn cả hai) |
| Giao việc giữa bot | Cây giao việc ghi sự kiện, ba chế độ (làm, hỏi ý, báo), phong bì do harness viết, khởi động lại có xét việc đã làm ra ngoài | Nhắn bot, bot phụ một tầng | **OpenMausBot** |
| Chạy bền khi chờ người | Dựa vào phiên của CLI, chạy lại một lần | Lưu lượt, nhả tiến trình, chạy tiếp đúng chỗ | **Rakazo** |
| Ngữ cảnh, cache | Giao cho CLI | Tự tính theo giá cache | **Rakazo** |
| Duyệt | Mặc định toàn quyền, có nút hoàn tác; mức duyệt truyền xuống bot con | Hỏi / Tự động có model duyệt riêng / Không hỏi; mô hình "nhiễm" | **Rakazo**, lấy thêm "truyền mức duyệt xuống bot con" |
| Routine | **Kiểm tra bằng mã trước khi gọi model** (lượt yên không tốn token), câu trả lời "không có gì", bản tin ngày không cần AI | Cron, theo dõi thay đổi, webhook | **OpenMausBot** |
| Trí nhớ | Chỉ ghi điều có trích dẫn, gạch bỏ chứ không xoá, trần 20%, nhật ký có hoàn tác, hết hạn | Markdown, tìm theo chữ | OpenMausBot (aris đã hơn cả hai) |
| Máy cho bot | Boat (dịch vụ ngoài), Docker trên ảnh Cua, VPS qua SSH, máy của người dùng | Ảnh Docker riêng, 11 nhà cung cấp chung một giao diện, thư mục nhà mã hoá mang đi được | **Rakazo** |
| Cho mượn máy người dùng | App máy tính cho Cloud mượn mạng nhà, Chrome thật, thư mục (không bao giờ terminal) | Cổng thiết bị của người dùng | **OpenMausBot** về trải nghiệm |
| Cách ly khi chạy lệnh | Hộp cát từng lượt, đổi khoá thật lấy mã dùng một lượt | Máy chung không cách ly giữa bot | **OpenMausBot** |
| Kênh | Gần như không có (Slack qua dịch vụ đóng) | Slack, Telegram, WhatsApp, iMessage, Lark | **Rakazo** (aris có Zalo) |
| App điện thoại | iPhone ghép QR, nhập bí mật mã hoá từ điện thoại | Expo, đẩy thông báo chạy thật | **Rakazo** |
| Giọng nói | Gọi trực tiếp qua WebRTC (OpenAI), biến markdown thành lời nói được | Nói → chữ → chat → đọc, bot gọi người dùng | Ngang, mỗi bên một ý |
| Ngôn ngữ | 16 ngôn ngữ **có tiếng Việt** (71%), bài kiểm báo bản dịch cũ khi câu gốc đổi | 14 ngôn ngữ | OpenMausBot về cách kiểm |
| Công ty | **Ai thấy gì**: chat riêng mà cả quản trị cũng không đọc được nội dung; bot chia sẻ theo mức (không, xem, chat, sửa); kết nối của đội và của cá nhân, ghi "dùng Gmail của An"; nghỉ việc thì xoá dữ liệu cá nhân | **Cấu trúc**: tổ chức, không gian, thành viên trong Postgres, phân quyền ở tầng dữ liệu, mã hoá, nhật ký kiểm toán, đăng nhập tự chạy | Rakazo làm khung, **OpenMausBot làm luật ai thấy gì** |
| Mở hoàn toàn | Không (enterprise, Admin đóng, phụ thuộc boat.dev và Cloudflare) | Có | **Rakazo** |

## 3. Điểm mạnh của OpenMausBot lấy về aris (gắn vào lộ trình GĐ9)

Tự viết lại theo cách của aris; không chép mã từ `enterprise/`, tệp có nguồn Hermes, tên và linh vật OpenMausBot.

**9.1 Chạy bền**
- Chen lời có ba kết quả: đã nhận, bị từ chối, chưa rõ; dùng làm luật cho mọi lần thử lại.
- Khởi động lại lượt bị cắt **chỉ khi chưa làm gì ra ngoài**; nếu đã làm thì báo người giao việc những việc đã xảy ra.
- Danh sách công cụ cố định từng byte (giữ cache DeepSeek ổn định).

**9.2 Máy riêng cho bot**
- Cầm lái: khi người đang lái thì **từ chối** thao tác của bot, không xếp hàng.
- Cách ly lệnh từng lượt và **đổi khoá thật lấy mã dùng một lượt** (bot không bao giờ thấy khoá gốc).
- Cho máy của bot **mượn mạng và Chrome thật của máy người dùng** khi trang chặn IP máy chủ; không bao giờ cho mượn terminal.

**9.3 Công ty nhiều nhân sự**: luật "ai thấy gì" của OpenMausBot đặt trên khung của Rakazo.
- Ba đối tượng xem: cả công ty, một phòng, một người. **Một lượt chỉ đọc được những gì mọi người thấy câu trả lời đều được thấy.**
- Chat riêng: quản trị chỉ thấy tên và trạng thái, không thấy nội dung, không thấy bí mật.
- Bot chia sẻ theo mức: không, xem, chat, sửa; kèm danh sách việc mà cả mức "sửa" cũng không làm được.
- Kết nối của công ty và kết nối cá nhân; câu trả lời ghi rõ đang dùng tài khoản của ai.
- Nghỉ việc: xoá dữ liệu cá nhân (không chuyển cho quản trị), bot cá nhân chuyển cho trưởng phòng; xuất phòng ban có lọc bí mật.
- Ai được trả lời thẻ duyệt: lần theo chuỗi giao việc.
- Cả hai bên đều chưa có **chuỗi duyệt theo cấp** (nhân viên → trưởng phòng) và **ngân sách từng người**: aris tự thiết kế.

**9.5 Đội tự vận hành**
- Giao việc giữa bot theo cây có ghi sự kiện, ba chế độ (làm, hỏi ý, báo), điều kiện xong (`done_when`), phong bì do harness viết (model không giả được).
- Mức duyệt truyền xuống bot con, không vượt quyền bot cha, có ghi nguồn.
- Model nhanh chọn bot nào trả lời trong nhóm, lỗi thì để mặc định.
- **Routine kiểm bằng mã trước khi gọi model**, câu trả lời "không có gì", chặn chạy chồng, giãn khi lỗi; bản tin ngày không cần AI.
- Gói cài sẵn (preset) chỉ được thu hẹp quyền, không mở rộng; skill nhập vào mặc định tắt.
- "Lính gác" chạy ngoài tiến trình, không gọi model: quét lỗi lặp, gom theo dấu lỗi, tách lỗi của aris với lỗi bên ngoài.

**Trí nhớ** (bổ sung cho `aris-memory`, aris vẫn giữ thiết kế của mình)
- Chỉ ghi điều có câu trích dẫn; câu hỏi hay việc cần làm không thành sự thật.
- Gạch bỏ thay vì xoá, có hạn dùng, nhật ký có hoàn tác.

**9.6 Giọng nói**: biến markdown thành câu nói được; một nguồn cho lời kể "bot đang làm gì".

**9.7 App điện thoại**: ghép bằng mã QR có xác nhận tên máy; nhập bí mật từ điện thoại có mã hoá.

**9.8 Connector**: ô dán bất cứ dòng cấu hình MCP nào (lệnh, JSON), thử trước khi bật, bí mật chỉ ghi không đọc lại.

**Việc chung**
- Kiểm bản dịch cũ: câu tiếng Việt bị báo khi câu gốc đổi (aris viết tiếng Việt trước, nên làm theo chiều ngược lại).
- Trang xem trước mọi trạng thái của thẻ theo đường dẫn (trạng thái, giao diện, ngôn ngữ) để duyệt bản vẽ nhanh.
- Lời mở đầu "Lúc vắng {you}, đội bot nên làm gì?" ở cuối phần cài đặt đầu tiên.

## 4. Kết luận

- **Rakazo vẫn là khung chính** của GĐ9: chạy bền, máy cho bot, cấu trúc công ty, kênh, app điện thoại, mở hoàn toàn.
- **OpenMausBot bổ sung chỗ Rakazo mỏng**: giao việc giữa bot, routine rẻ, giữ trí nhớ sạch, cách ly lệnh và khoá, luật ai thấy gì trong công ty, cho mượn máy người dùng.
- Không chọn kiểu "bot là CLI của hãng khác" của OpenMausBot làm lõi: aris giữ dsh. Kiểu đó đã có ở "bot ngoài" (Claude Code, Codex qua ACP).

## 5. Giới hạn

- Chỉ đọc bản clone nông; không đọc dịch vụ Admin đóng, mã app iPhone (không có trong repo), phần giao diện chỉ đọc một phần.
- Báo cáo do sub agent viết; chỗ suy luận được đánh dấu "[inference]". Trước khi làm từng giai đoạn sẽ đọc lại đúng tệp liên quan và ghi vào `docs/clean-room-log.md`.
