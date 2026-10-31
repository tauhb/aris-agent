# Nghiên cứu Rakazo và đường biến aris thành Rakazo (31/10/2026)

Người dùng muốn **giữ aris và lõi DeepSeek harness (dsh)**, đắp dần những gì Rakazo có, và giữ nguyên những chỗ aris đang hơn. Tài liệu này là kết quả đọc mã Rakazo (bản clone nông, commit `beaed0c`, 31/10/2026, giấy phép Apache-2.0) bằng bốn sub agent chỉ đọc, không chạy gì trong repo. Bốn báo cáo gốc (tiếng Anh, có dẫn đường tệp) nằm ở `docs/nghien-cuu/rakazo/`:

1. [Lõi chạy bot](rakazo/1-loi-chay-bot.md): bot, vòng chạy, Pi, công cụ, giao việc, trí nhớ, routine, duyệt, skill, đánh giá.
2. [Máy tính của bot](rakazo/2-may-tinh-cua-bot.md): ảnh máy, ngủ và thức, máy chung hay riêng, điều khiển, xem và cầm lái, an toàn.
3. [Bề mặt sản phẩm](rakazo/3-be-mat-san-pham.md): màn hình, chat, giọng nói, kênh nhắn tin, app máy tính và điện thoại.
4. [Nền tảng](rakazo/4-nen-tang.md): dịch vụ, dữ liệu, connector, model, bí mật, tự cài, chất lượng mã.

## 1. Rakazo là gì, nói gọn

- Bản mã nguồn mở nhái **Grok Bot** của xAI (ra mắt 11/8/2026): "đồng đội AI" chạy liên tục, mỗi bot có **máy tính riêng trên mây**, làm việc cả khi máy người dùng tắt, cần người thì dừng lại hỏi.
- Rất lớn: khoảng **767 nghìn dòng** TypeScript (gần 400 nghìn dòng là test), 107 bảng Postgres, 15 luồng CI. Đang beta, thay đổi nhanh.
- Lõi gọi model là thư viện ngoài **Pi** (`@earendil-works/pi-agent-core`, `pi-ai` 1.3.0). Phần Rakazo tự viết là mọi thứ xung quanh: chạy bền, máy cho bot, duyệt, kênh, app. dsh cũng có gói `dsh-llm-pi-ai` dựng trên chính `@earendil-works/pi-ai` (bản đối chiếu song song với `dsh-llm-deepseek`), nên hai bên chung tầng gọi model; chỗ khác nhau nằm ở phần xung quanh.

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
| Nền tảng | Postgres, người dùng → thành viên → tổ chức → không gian, phân quyền ở tầng dữ liệu, mã hoá theo không gian, Stripe, nhật ký kiểm toán, sao lưu PITR, khoảng 150 biến môi trường | Một chủ, chạy local, Keychain, sao lưu mã hoá hằng đêm, thống kê và phát lại | **Làm mới**: công ty nhiều nhân sự (mục 5), bỏ Stripe và nhiều công ty |
| Nhập agent | Nhập từ OpenClaw, Hermes, ChatGPT | Chưa có | **Làm mới** (sau) |
| Đánh giá | Model đóng vai người dùng, chấm theo dữ liệu thật của trang thử; phát lại thao tác máy | Kiểm thử skill bằng chạy lại | **Học** cho kho skill |

## 3. Kết luận

- **Lõi aris không thua**: trí nhớ, Second Brain, skill tự học, hàng rào, `/goal`, Zalo và tiếng Việt đều hơn Rakazo. Lõi gọi model của Rakazo cũng là thư viện ngoài, nên giữ dsh là đúng.
- **Rakazo hơn ở "bot sống 24/7 trên máy riêng"** và ở độ bền khi chạy lâu: máy cho bot, dừng chờ người mà không giữ tiến trình, ngủ và thức, cầm lái trên web và điện thoại.
- Không đuổi theo 767 nghìn dòng. Lấy đúng phần tạo nên trải nghiệm Grok Bot **và phần cho công ty dùng chung**; bỏ phần bán SaaS (nhiều công ty trên một server, Stripe, tín dụng model, 13 nhà cung cấp máy).

## 4. Lộ trình đề xuất (GĐ9 · aris thành Rakazo cho công ty)

Điểm mạnh lấy thêm từ OpenMausBot cho từng mục: xem [openmausbot.md](openmausbot.md) mục 3.

Thứ tự theo giá trị và theo phụ thuộc. 9.3 và 9.4 phải xong cùng nhau trước khi cho nhân sự vào: server mở ra ngoài thì phải có tài khoản và quyền.

1. **9.1 Chạy bền.** Đọc dsh xem đã có gì: dừng chờ người, lưu và khôi phục lượt, chen lời giữa lượt, cache. Làm phần thiếu bằng gói của aris, không sửa dsh nếu tránh được. Thêm mô hình "lượt bị nhiễm".
2. **9.2 Máy riêng cho bot (Docker).** Ảnh máy của aris (màn hình ảo, Chromium, xem qua noVNC, tiến trình điều khiển), công cụ bấm gõ, trình duyệt qua CDP, shell, tệp, "cần người dùng cầm lái". Bật khi cần, ngủ khi rảnh, lưu thư mục nhà. Máy chung cho phòng ban hay máy riêng từng bot. Dùng lại cổng duyệt, khung màn hình, thẻ duyệt, Cầm lái / Trả lại của `@aris/computer`: chỉ thêm một "nơi chạy" mới cạnh máy Mac. Chạy trên Mac qua Docker trước.
3. **9.3 Công ty nhiều nhân sự** (mục 5): tài khoản, vai trò, phòng ban, quyền trên bot, dữ liệu riêng từng người, duyệt và ngân sách theo người, nhật ký kiểm toán.
4. **9.4 Lên server** (mục 1 của GĐ7 còn để dở). aris và các máy của bot chạy trên VPS của công ty, HTTPS và tên miền riêng, sao lưu và giám sát trên server. Từ đây bot làm việc 24/7 và nhân sự vào từ trình duyệt.
5. **9.5 Đội tự vận hành.** Đổi cài đặt bot bằng lời (có hoàn tác), bot nhắn bot, nhóm bot, bot tạo bot con có giới hạn; routine có webhook và theo dõi thay đổi; người duyệt tự động.
6. **9.6 Giọng nói.** Đọc câu trả lời, nhận tin thoại trên Zalo và Telegram, "gọi" trong app (nói → chữ → lượt chat → đọc). dsh có sẵn gói nhận giọng nói thử nghiệm (SenseVoice): thử với tiếng Việt trước khi chọn hãng.
7. **9.7 App điện thoại.** Đăng nhập theo tài khoản nhân sự; chat, chuông Cần người dùng, xem và cầm lái máy của bot, đẩy thông báo.
8. **9.8 Connector lớn.** Danh mục lười, cân nhắc Composio hay Pipedream; "Dạy một việc"; nhập agent từ OpenClaw, Hermes.

## 5. aris cho công ty (người dùng chốt 31/10)

Người dùng muốn: công ty dựng aris trên server của mình, chạy 24/7, **cấp tài khoản cho nhân sự**; nhân sự đăng nhập, tạo bot, làm việc với bot theo quyền được cấp. **Một công ty trên một server**, không bán cho nhiều công ty trên cùng server; dữ liệu vẫn ghi mã công ty để sau này mở rộng không phải viết lại.

### Nền có sẵn trong dsh

- dsh đã có lớp phân quyền theo người gọi: `PrincipalMap` (danh tính người gọi, hiện chỉ có `owner`) được thiết kế **để gói khác khai báo thêm loại người**, và `dsh-api-remote-access` cho mỗi loại người một chính sách quyền: vai trò, quyền theo từng hành động và từng tài nguyên, lọc danh sách, báo lại khi quyền đổi. Cổng API của dsh hỏi chính sách này trước mỗi lời gọi của người không phải chủ.
- Nghĩa là: thêm loại người `member` (nhân sự) và chính sách quyền của aris **đi đúng đường của dsh**, không phải vá lõi. Chưa kiểm: đăng nhập web của dsh (cookie) có nhận nhiều người không, phiên và kho dữ liệu có ghi người tạo không. Đây là việc đầu của 9.3 (spike).

### Mô hình

- **Vai trò**: Chủ công ty (toàn quyền, thanh toán model, dừng khẩn cấp), Quản trị (mời và khoá nhân sự, connector và bí mật của công ty, ngân sách), Trưởng phòng (quản bot và nhân sự trong phòng), Nhân viên (dùng bot được cấp, tạo bot cá nhân nếu được phép).
- **Phòng ban** là ranh giới quyền (như "không gian" của Rakazo): bot, skill của đội, máy của bot, bộ não, kênh bán hàng thuộc một phòng ban hay cả công ty.
- **Bot**: bot của công ty, bot của phòng ban, bot cá nhân. Người tạo là người giữ; Quản trị thấy và thu hồi được mọi bot. Nhân sự nghỉ việc: khoá tài khoản, bot cá nhân chuyển cho trưởng phòng.
- **Dữ liệu riêng từng người**: chat của mỗi người với bot là riêng; ký ức "hồ sơ chủ" thành hồ sơ của từng nhân sự; bộ não có phần chung công ty, phần phòng ban, phần cá nhân. Skill tự học từ chat của một người đi qua Hộp duyệt của trưởng phòng trước khi thành skill chung.
- **Duyệt và ngân sách**: thẻ duyệt về đúng người giao việc (và trưởng phòng khi người đó vắng); trần chi phí theo công ty, phòng ban, từng người; Thống kê lọc theo người và phòng ban.
- **Kết nối và bí mật**: connector và khoá của công ty (Quản trị gán cho phòng ban, bot) tách với connector cá nhân (Google, Notion của riêng nhân sự, chỉ bot của người đó dùng).
- **Kênh**: mỗi nhân sự ghép Telegram, Zalo của mình để nói chuyện với bot; tài khoản Zalo, Telegram bán hàng của công ty gắn với bot phòng ban (đã có ở 8.7).
- **Đăng nhập**: mời bằng email, mật khẩu và mã hai lớp; đăng nhập Google Workspace tuỳ chọn; đăng xuất từ xa, khoá tài khoản ngay.
- **Nhật ký kiểm toán**: ai làm gì, lúc nào (mời, khoá, đổi quyền, duyệt, xem bí mật, cầm lái máy của bot), chỉ ghi thêm, xuất được.
- **Máy của bot (9.2)**: máy chung theo phòng ban hoặc máy riêng; quyền xem và cầm lái theo quyền trên bot.
- **Máy Mac của từng nhân sự** (8.3): để sau, cần app máy tính nhỏ nối về server và luôn hỏi trước.

### Quy mô và lưu trữ

Mục tiêu đầu: một công ty vài chục nhân sự. Bắt đầu bằng kho dữ liệu của dsh như bây giờ; nếu quá khoảng 50 người dùng đồng thời hay cần sao lưu từng thời điểm thì chuyển sang Postgres (quyết sau khi đo ở 9.4).

## 6. Cần người dùng quyết

1. **Thứ tự**: đề xuất 9.1 → 9.2 → 9.3 → 9.4, rồi tới phần còn lại theo nhu cầu.
2. **Cách lấy mã**: Rakazo dùng Apache-2.0, cho phép chép mã nếu giữ ghi công (tệp `NOTICE`, ghi rõ tệp nào lấy từ đâu). Đề xuất: **tự viết theo kiến trúc đã đọc**, chỉ chép đoạn nhỏ khi thật cần và ghi công đúng luật. Không dùng Pi.
3. **Máy cho bot chạy ở đâu trước**: Docker trên Mac (nhanh, không tốn tiền, bot vẫn tắt theo Mac) hay VPS ngay (24/7, tốn tiền thuê, cần làm 9.3 và 9.4 sớm).
4. ~~aris một chủ hay bán cho nhiều khách~~: **đã chốt 31/10**, một công ty trên một server, nhiều nhân sự (mục 5).
5. **Cho công ty** (hỏi khi lên plan 9.3): nhân viên có được tự tạo bot không, trần chi phí mặc định mỗi người, có cần đăng nhập Google Workspace ngay không, công ty khoảng bao nhiêu người.

## 7. Giới hạn của nghiên cứu này

- Chỉ đọc mã và tài liệu ở bản clone nông, không chạy Rakazo, không có lịch sử commit.
- Mã nguồn của Pi không có trong repo; giấy phép của Pi và vài thư viện khác chưa kiểm.
- Báo cáo do sub agent viết; chỗ nào là suy luận đã được đánh dấu "[inference]" trong báo cáo gốc. Trước khi làm từng giai đoạn sẽ đọc lại đúng các tệp liên quan.
