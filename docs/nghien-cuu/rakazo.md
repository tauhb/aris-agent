# Nghiên cứu Rakazo và đường biến aris thành Rakazo (31/10/2026)

Người dùng muốn **giữ aris và lõi DeepSeek harness (dsh)**, đắp dần những gì Rakazo có, và giữ nguyên những chỗ aris đang hơn. Tài liệu này là kết quả đọc mã Rakazo (bản clone nông, commit `beaed0c`, 31/10/2026, giấy phép Apache-2.0) bằng bốn sub agent chỉ đọc, không chạy gì trong repo. Bốn báo cáo gốc (tiếng Anh, có dẫn đường tệp) nằm ở `docs/nghien-cuu/rakazo/`:

1. [Lõi chạy bot](rakazo/1-loi-chay-bot.md): bot, vòng chạy, Pi, công cụ, giao việc, trí nhớ, routine, duyệt, skill, đánh giá.
2. [Máy tính của bot](rakazo/2-may-tinh-cua-bot.md): ảnh máy, ngủ và thức, máy chung hay riêng, điều khiển, xem và cầm lái, an toàn.
3. [Bề mặt sản phẩm](rakazo/3-be-mat-san-pham.md): màn hình, chat, giọng nói, kênh nhắn tin, app máy tính và điện thoại.
4. [Nền tảng](rakazo/4-nen-tang.md): dịch vụ, dữ liệu, connector, model, bí mật, tự cài, chất lượng mã.

## 1. Rakazo là gì, nói gọn

- Bản mã nguồn mở nhái **Grok Bot** của xAI (ra mắt 11/8/2026): "đồng đội AI" chạy liên tục, mỗi bot có **máy tính riêng trên mây**, làm việc cả khi máy người dùng tắt, cần người thì dừng lại hỏi.
- Rất lớn: khoảng **767 nghìn dòng** TypeScript (gần 400 nghìn dòng là test), 107 bảng Postgres, 15 luồng CI. Đang beta, thay đổi nhanh.
- Lõi gọi model là thư viện ngoài **Pi** (`@earendil-works/pi-agent-core`, `pi-ai` 1.3.0). Phần Rakazo tự viết là mọi thứ xung quanh: chạy bền, máy cho bot, duyệt, kênh, app.

## 2. Đối chiếu từng mảng

Ký hiệu cột cuối: **Giữ** (aris đang hơn, giữ nguyên), **Học** (lấy ý tưởng của Rakazo, làm theo cách của aris), **Làm mới** (aris chưa có).

| Mảng | Rakazo | aris bây giờ | Việc |
|---|---|---|---|
| Lõi gọi model | Pi (thư viện ngoài), nhiều hãng, đăng nhập bằng gói ChatGPT/Claude | dsh: harness DeepSeek, provider, phiên, công cụ, MCP | **Giữ** dsh |
| Chạy bền | Lượt dừng khi cần người (duyệt, hỏi, cầm lái, xin bí mật) thì **nhả tiến trình**, lưu bản ghi lượt đã mã hoá, trả lời xong chạy tiếp đúng chỗ; thao tác ngoài có mã chống lặp | Duyệt qua Hộp duyệt và Telegram; lượt chờ trong tiến trình | **Học**: kiểm dsh có gì trước |
| Chen lời giữa lượt | Tin nhắn gửi lúc bot đang chạy được đưa vào lượt đang chạy | Chưa rõ, cần kiểm dsh | **Học** |
| Ngữ cảnh và cache | Tính "có đáng dựng lại phần đầu không" theo giá cache; không bao giờ tóm tắt tốn tiền chỉ vì cache hết hạn | Dựa trên dsh; DeepSeek có cache rẻ | **Học**: hợp DeepSeek nhất |
| Chống tiêm lệnh | Lượt bị "nhiễm" khi có nội dung ngoài vào thì siết quyền (mất công cụ quản đội, mất tìm chéo chat) | Hàng rào, chặn cứng, chế độ tài liệu cho khách | **Học** mô hình "nhiễm" |
| Duyệt | Ba chế độ Hỏi / Tự động / Không hỏi; chế độ Tự động dùng một model riêng chỉ đọc lời chủ, không đọc nội dung trang | Hỏi, trong phạm vi; ngân sách, dừng khẩn cấp | **Giữ** hàng rào, **Học** người duyệt tự động |
| Bot và đội | Mỗi bot một luồng chat liên tục, lời dặn có phiên bản và hoàn tác; bot tạo bot, nhắn bot, nhóm 2–10 bot; đổi cài đặt bot bằng cách nói | Commander giao việc, dự án, hồ sơ bot, linh vật, văn phòng | **Giữ** Commander, **Học** nhắn bot, nhóm bot, đổi cài đặt bằng lời |
| Trí nhớ | Văn bản markdown, tìm theo chuỗi; nhớ theo nghĩa phải mua bên ngoài | Ký ức, hồ sơ chủ, tìm lại phiên cũ, vòng học tự rút bài học, **Second Brain có đồ thị** | **Giữ** |
| Skill | Chỉ là chữ, không kiểm thử, không theo bản; có "Dạy một việc" (người làm mẫu trên máy, bot soạn skill) | Tự học, tự vá, kiểm thử bằng chạy lại, gộp trùng, nhập GitHub, **kho 18 skill tiếng Việt** | **Giữ**, **Học** "Dạy một việc" |
| Routine | Cron, theo dõi thay đổi (không gọi model), webhook, GitHub, tin Slack, bảng việc có bot nhận việc | Routine theo lịch, `/goal` có giám khảo, `/loop`, `/heartbeat`, Kanban | **Giữ**, **Làm mới** webhook và theo dõi thay đổi |
| **Máy cho bot** | Ảnh Docker Debian: màn hình ảo, Chromium, noVNC, tiến trình điều khiển; công cụ bấm gõ, trình duyệt qua CDP, shell, tệp, `request_takeover`; bật khi cần, **ngủ sau 10 phút**, lưu thư mục nhà (cả đăng nhập web); máy chung cho đội (mỗi bot một màn hình) hay máy riêng; nhiều nhà cung cấp (Docker, E2B, Daytona, Railway…) | Điều khiển **chính máy Mac** của người dùng qua cua-driver, duyệt từng bước, cầm lái | **Làm mới**: khoảng trống lớn nhất |
| Máy của người dùng | App máy tính cho bot chạy lệnh và điều khiển Mac qua cua-driver, luôn hỏi | Đã có (8.3), sâu hơn: phạm vi, chặn cứng, trần ảnh và thao tác | **Giữ** |
| Kênh | Slack, Telegram, WhatsApp, Lark; iMessage và SMS mua qua Sendblue | Telegram, **Zalo cá nhân nhiều tài khoản**, Lark; bán hàng, giờ trực, nhường tay | **Giữ**, cân nhắc Messenger, Zalo OA |
| Giọng nói | Không phải gọi thật: nói → chữ → chạy lượt chat → đọc lại; ElevenLabs, OpenAI, Cartesia, Fish, giọng macOS | Nhận tin thoại Telegram | **Làm mới** (vừa sức) |
| App | Web, Electron, **app điện thoại viết riêng bằng Expo** (đẩy thông báo, chia sẻ vào app, hàng đợi khi mất mạng) | Web của dsh, bản vẽ di động | **Làm mới** sau khi lên server |
| Connector | Composio, Pipedream, MCP có OAuth, OpenAPI, plugin; **danh mục lười** khi quá 20 công cụ | Danh mục 15 connector, OAuth MCP | **Học** danh mục lười, cân nhắc Composio |
| Nền tảng | Postgres, nhiều tổ chức, mã hoá theo không gian, Stripe, nhật ký kiểm toán, sao lưu PITR, khoảng 150 biến môi trường | Một chủ, chạy local, Keychain, sao lưu mã hoá hằng đêm, thống kê và phát lại | **Giữ** một chủ (trừ khi muốn bán SaaS) |
| Nhập agent | Nhập từ OpenClaw, Hermes, ChatGPT | Chưa có | **Làm mới** (sau) |
| Đánh giá | Model đóng vai người dùng, chấm theo dữ liệu thật của trang thử; phát lại thao tác máy | Kiểm thử skill bằng chạy lại | **Học** cho kho skill |

## 3. Kết luận

- **Lõi aris không thua**: trí nhớ, Second Brain, skill tự học, hàng rào, `/goal`, Zalo và tiếng Việt đều hơn Rakazo. Lõi gọi model của Rakazo cũng là thư viện ngoài, nên giữ dsh là đúng.
- **Rakazo hơn ở "bot sống 24/7 trên máy riêng"** và ở độ bền khi chạy lâu: máy cho bot, dừng chờ người mà không giữ tiến trình, ngủ và thức, cầm lái trên web và điện thoại.
- Không đuổi theo 767 nghìn dòng. Lấy đúng phần tạo nên trải nghiệm Grok Bot, bỏ phần SaaS (nhiều tổ chức, Stripe, tín dụng model, 13 nhà cung cấp máy).

## 4. Lộ trình đề xuất (GĐ9 · aris thành Rakazo)

Thứ tự theo giá trị cho người dùng và theo phụ thuộc:

1. **9.1 Chạy bền.** Đọc dsh xem đã có gì: dừng chờ người, lưu và khôi phục lượt, chen lời giữa lượt, cache. Làm phần thiếu bằng gói của aris, không sửa dsh nếu tránh được. Thêm mô hình "lượt bị nhiễm".
2. **9.2 Máy riêng cho bot (Docker).** Ảnh máy của aris (màn hình ảo, Chromium, xem qua noVNC, tiến trình điều khiển), công cụ bấm gõ, trình duyệt qua CDP, shell, tệp, "cần người dùng cầm lái". Bật khi cần, ngủ khi rảnh, lưu thư mục nhà. Máy chung cho đội hay máy riêng từng bot. Dùng lại cổng duyệt, khung màn hình, thẻ duyệt, Cầm lái / Trả lại của `@aris/computer`: chỉ thêm một "nơi chạy" mới cạnh máy Mac. Chạy trên Mac qua Docker trước.
3. **9.3 Lên server** (mục 1 của GĐ7 còn để dở). aris và các máy của bot chạy trên VPS, mở web an toàn từ xa. Từ đây bot làm việc khi Mac tắt.
4. **9.4 Đội tự vận hành.** Đổi cài đặt bot bằng lời (có hoàn tác), bot nhắn bot, nhóm bot, bot tạo bot con có giới hạn; routine có webhook và theo dõi thay đổi; người duyệt tự động.
5. **9.5 Giọng nói.** Đọc câu trả lời, nhận tin thoại trên Zalo và Telegram, "gọi" trong app (nói → chữ → lượt chat → đọc). Thử giọng tiếng Việt của các hãng trước khi chọn.
6. **9.6 App điện thoại.** Chat, chuông Cần người dùng, xem và cầm lái máy của bot, đẩy thông báo.
7. **9.7 Connector lớn.** Danh mục lười, cân nhắc Composio hay Pipedream; "Dạy một việc"; nhập agent từ OpenClaw, Hermes.

## 5. Cần người dùng quyết

1. **Thứ tự**: đề xuất 9.1 → 9.2 → 9.3, rồi tới phần còn lại theo nhu cầu.
2. **Cách lấy mã**: Rakazo dùng Apache-2.0, cho phép chép mã nếu giữ ghi công (tệp `NOTICE`, ghi rõ tệp nào lấy từ đâu). Đề xuất: **tự viết theo kiến trúc đã đọc**, chỉ chép đoạn nhỏ khi thật cần và ghi công đúng luật. Không dùng Pi.
3. **Máy cho bot chạy ở đâu trước**: Docker trên Mac (nhanh, không tốn tiền, bot vẫn tắt theo Mac) hay VPS ngay (24/7, tốn tiền thuê, cần làm 9.3 cùng lúc).
4. **aris một chủ hay bán cho nhiều khách (SaaS)**: Rakazo làm cả hai. Một chủ thì gọn hơn nhiều; nhiều khách thì cần thêm tài khoản, tách dữ liệu, thanh toán.

## 6. Giới hạn của nghiên cứu này

- Chỉ đọc mã và tài liệu ở bản clone nông, không chạy Rakazo, không có lịch sử commit.
- Mã nguồn của Pi không có trong repo; giấy phép của Pi và vài thư viện khác chưa kiểm.
- Báo cáo do sub agent viết; chỗ nào là suy luận đã được đánh dấu "[inference]" trong báo cáo gốc. Trước khi làm từng giai đoạn sẽ đọc lại đúng các tệp liên quan.
