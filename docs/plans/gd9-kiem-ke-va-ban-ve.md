# GĐ9 · Kiểm kê: aris đang ở đâu so với "Rakazo có giao diện OpenMausBot" (1/11/2026)

Đọc cùng [gd9-doi-dong-doi.md](gd9-doi-dong-doi.md) (plan bản 2), [nghien-cuu/rakazo.md](../nghien-cuu/rakazo.md), [nghien-cuu/openmausbot.md](../nghien-cuu/openmausbot.md), [nghien-cuu/kien-truc-bot.md](../nghien-cuu/kien-truc-bot.md).

## 1. Đã làm gì cho GĐ9

Chỉ có **giấy**: nghiên cứu, plan và 3 bản vẽ. **Chưa có dòng mã sản phẩm nào** của GĐ9.

| Đã có | Ở đâu | Ghi chú |
|---|---|---|
| Nghiên cứu Rakazo (4 báo cáo), OpenMausBot (3 báo cáo), kiến trúc luồng bot (7 báo cáo, 2 lượt soát độc lập) | `docs/nghien-cuu/` | Xong |
| Plan GĐ9 bản 2, Điểm dừng 1 đã chốt | `docs/plans/gd9-doi-dong-doi.md` | 9.0 → 9.6, ước 12–16 tuần |
| Chạy thật Rakazo, sửa mục 9 | như trên, ảnh ở `docs/nghien-cuu/rakazo/anh-chay-thu/` | Xong 1/11 |
| Bản vẽ kiểu OpenMausBot: **Văn phòng**, **Cần anh**, **Hồ sơ bot** (mỗi màn sáng và tối) | `design/canvas/Mb*.dc.html` | **Chưa thấy ghi người dùng duyệt** |
| Bản vẽ kiểu Rakazo (đợt trước, đã thay bằng Mb*) | `design/canvas/Rk*.dc.html` | Bỏ |
| Đổi tên định danh tiếng Việt trong mã sang tiếng Anh | commit `3d3866b`, 104 tệp | Việc dọn mã, không phải tính năng |

Tất cả nằm trên nhánh `claude/busy-volta-05wmgj`, **15 commit chưa vào `main`**.

Chưa làm: spike 9.0 (Điểm dừng 2), bảng `threads`, `people`, `tasks`, một cửa gửi tin, `ask_teammate`, `hand_off_to_teammate`, duyệt bền, sang trang, Aris tạo bot, máy riêng cho bot, giao diện mới.

Tài liệu lệch nhau: đoạn GĐ9 trong `docs/ke-hoach-trien-khai.md` vẫn ghi thứ tự đợt của plan bản 1 (9.0 → 9.5), plan hiện hành là bản 2 (9.0, 9.1a, 9.1b, 9.2 → 9.6).

## 2. Khoảng cách với đích, theo trải nghiệm người dùng

Đích: mở app thấy **danh bạ bot** (Aris ghim đầu), bấm bot là vào **một cuộc chat liên tục**, nhắn lúc nào cũng được kể cả khi bot đang làm, bot làm trên **máy của nó** (thấy màn hình ở khung phải), thẻ hỏi và thẻ duyệt nằm ngay trong chat, bot nhờ nhau, Aris tạo bot mới cho mình.

| Trải nghiệm | Rakazo | aris hôm nay | Plan GĐ9 đặt ở |
|---|---|---|---|
| Danh bạ bot ở thanh bên, bấm là chat | Có | Thanh bên có đội, nhưng chat theo **phiên** ("Việc mới", 5 phiên gần nhất) | 9.1b (dữ liệu), 9.5 (giao diện) |
| Một luồng liên tục mỗi bot, gộp mọi kênh | Có (một chủ) | Không: mỗi lối vào tự tạo phiên | 9.1b, sang trang ở 9.4 |
| Nhắn chen khi bot đang làm | Có, cùng lượt | dsh có `steer`, aris có dùng; chưa thành luật chung | 9.2 (mặc định chen, nút Dừng) |
| Thẻ hỏi A/B/C, thẻ duyệt trong chat | Có, duyệt nhả tiến trình | Có thẻ duyệt, chờ trong tiến trình, khởi động lại là mất | 9.2 (duyệt bền) |
| Bot nhờ bot, kết quả tự quay về | Có | Chỉ Commander giao việc qua đội dsh | 9.1a (hỏi ý), 9.3 (đủ) |
| Aris (Chief) tạo bot bằng lời | Có, không hỏi | Không, chỉ tạo bot bằng form | 9.3 (Quản đội); chưa có đợt riêng |
| Lời chào lần đầu, mỗi không gian có Chief | Có | Không | Chưa có đợt; "không gian" cần mô hình công ty (sau 9.6) |
| **Máy riêng của bot**, xem màn hình, cầm lái | Có (Docker, máy chung theo không gian) | Chỉ điều khiển **Mac của người dùng** (8.3) | **Sau 9.6** |
| Việc nền, routine đăng kết quả vào chat | Có | Routine mở phiên riêng | 9.4 |

Kết luận: plan bản 2 đúng về kiến trúc nhưng **giao diện mới để cuối cùng (9.5) và máy riêng của bot để sau cả GĐ9**. Vì vậy sau 12–16 tuần làm theo plan, người dùng mới thấy aris "giống Rakazo"; trong lúc đó không có gì để nhìn.

## 3. Đề xuất sửa thứ tự (cần anh quyết)

1. **Vẽ trước, duyệt sớm** (đưa Điểm dừng 3 lên đầu): duyệt luôn 3 bản vẽ Mb* và các màn ở mục 4 trước khi viết mã. Bản vẽ là "đích" để mọi đợt bám theo.
2. **Lát cắt nhìn thấy được trong 2–3 tuần**: làm **khung giao diện mới** (thanh bên danh bạ bot, chat một luồng mỗi bot, khung phải) **cùng lúc** với 9.1a, trên dữ liệu hiện có: "luồng" tạm thời = phiên mở gần nhất của bot với chủ, "Việc mới" ẩn đi. Phần dữ liệu thật (9.1b) thay vào sau mà giao diện không đổi.
3. **Aris quản đội thành một đợt nhỏ riêng** (đợt 9.3b đề xuất ở mục 9 của plan): Aris tạo bot bằng lời có thẻ duyệt đầy đủ, sửa lời dặn có bản và hoàn tác, lời chào lần đầu tiếng Việt. Không phụ thuộc bot nhờ bot, làm được ngay sau lát cắt đầu.
4. **Máy riêng của bot đưa lên trước công ty nhiều nhân sự**: bản đầu chạy Docker trên Mac, "máy chung" theo phòng ban như Rakazo; khung "Chạy ở đâu: Máy chung / Mac này / Tắt" trong bản vẽ đã giả định có nó.
5. Giữ nguyên đường ray an toàn: chưa có duyệt bền và chống lặp (9.2) thì chưa mở bot nhờ bot chế độ làm việc (9.3).

## 4. Các màn cần vẽ để duyệt

**Đã vẽ đủ 16 màn (1/11)** trên canvas [aris GĐ9 · Giao diện kiểu OpenMausBot](https://claude.ai/artifact/3FvLeEg2hVpfGEoFpX4PwP), bản sao ở `design/gd9/`. Mỗi màn có bản tối và sáng; V15 gom các màn điện thoại. Hướng bố cục người dùng chốt khi xem bản nháp:

- Thanh bên chỉ còn danh bạ bot (Aris ở đầu); trên cùng: dấu aris, Tìm, Chuông, Tạo; dưới cùng: ảnh đại diện và nút "Kết nối ứng dụng" có logo.
- Hộp duyệt và Việc, routine gộp vào **Chuông** (bảng Hoạt động: Cần anh, Đang chạy, Routine). Bộ não, Tự học, Thống kê, Văn phòng 3D, Cài đặt vào **menu ảnh đại diện**. Hồ sơ bot và máy của bot mở ở **khung phải** của chat.
- Khung ngoài ít chữ; nhưng **thẻ cần quyết định trong chat phải đủ chi tiết**: thẻ tạo bot (mô tả công khai, lời dặn, skill, model, kênh, máy, quyền), thẻ sửa lời dặn (toàn văn, chỗ đổi, hệ quả), thẻ duyệt gửi tin (nội dung, gửi cho ai, cách gửi, ai khởi đầu), thẻ xin ý kiến (tên khách, tin của khách).
- Cảm quan theo OpenMausBot (đối chiếu app thật trên máy 1/11): nền đen, khung chat và khung phải trung tính, tên bot dạng viên ở giữa đầu chat, hồ sơ bot ở khung phải có tab Chi tiết / Thư viện / Máy và các nhóm dòng, trang Cài đặt bot riêng, thẻ hỏi dùng nút viên, nút chính màu trắng.
- Giữ thanh bên dạng danh sách của aris: linh vật màu, chấm trạng thái (xanh đang làm, cam cần anh, đỏ lỗi), dòng việc gần nhất cùng màu trạng thái. Không xếp bot thành ô.
- Màu nhấn chỉ ở chỗ cần: thẻ chờ duyệt có viền và nhãn cam nhẹ; khi chat nhắc tên bot thì hiện **viên tên bot** (linh vật nhỏ, tên, nền màu của bot).
- Aris dùng màu xanh (bỏ tím theo bộ quy tắc thiết kế).

Đã có (chờ duyệt): **M1 Văn phòng** (chat với bot, khung máy, routine), **M2 Cần anh** (thẻ duyệt gửi Zalo, cầm lái), **M3 Hồ sơ bot** (linh vật, lời dặn có bản, ai được dùng).

Cần vẽ thêm, xếp theo đợt làm. Mỗi màn có bản sáng, tối và điện thoại 390 px.

**Đợt vẽ 1: cho lát cắt đầu (khung mới + Aris quản đội)**

| # | Màn | Nội dung chính |
|---|---|---|
| V1 | Khung ứng dụng và danh bạ bot | Aris ghim đầu; nhóm theo phòng ban; trạng thái từng bot (rảnh, đang làm, cần anh, lỗi) và dòng việc gần nhất; chuông Cần anh; lối vào Hộp duyệt, Việc và routine, Bộ não, Kết nối, Tự học, Cài đặt; chi phí hôm nay. Chỗ của các trang cũ (Tổng quan, Thống kê, bản đồ 3D) trong khung mới |
| V2 | Lần đầu mở aris: Aris chào | Thẻ câu hỏi A/B/C bằng tiếng Việt, gõ tự do cũng được; Aris hỏi anh cần giúp việc gì |
| V3 | Aris đề xuất và tạo đội bot | Aris đề xuất 2–3 bot (tên, vai trò, linh vật); **thẻ duyệt tạo bot** hiện đủ mô tả công khai, lời dặn, model, skill gắn từ kho dựng sẵn; duyệt từng bot; thẻ "bot con" sau khi tạo; luồng bot mới có dòng "Do Aris tạo" |
| V4 | Thẻ sửa bot bằng lời | "Sửa lời dặn của Mai" → thẻ so khác bản cũ và bản mới, Cho phép một lần / Từ chối; bản lịch sử và hoàn tác |
| V5 | Chat khi bot đang làm | Dòng "đang làm" có bước hiện tại, tin chen vào cùng lượt, bot báo "đã nhận", nút Dừng; dấu "chủ đề mới" thay "Việc mới" và `/new` |

**Đợt vẽ 2: đồng đội và việc**

| # | Màn | Nội dung chính |
|---|---|---|
| V6 | Bot nhờ bot | Luồng bot nhờ: chip "Đã nhờ Mai…", kết quả gấp gọn dưới chip; luồng bot được nhờ: thẻ lặng "Lâm nhờ: …"; chuyển hẳn cho đồng đội (bot kia trả lời thẳng anh) |
| V7 | Thẻ việc trong chat | "+ Việc", việc chạy nền (đang làm, cần anh, xong), thẻ kết quả đăng vào luồng; routine chạy xong cũng là một thẻ |
| V8 | Trang Việc và routine | Mọi việc của đội: ai nhờ, ai làm, trạng thái, chi phí cả chuỗi, trần tiền; lọc theo bot; routine của từng bot |
| V9 | Hộp duyệt kiểu mới | Mọi thẻ chờ anh, kể cả thẻ phát sinh trong chuỗi bot nhờ bot, ghi rõ ai khởi đầu; hết hạn, nhắc lại |
| V10 | Hồ sơ Aris · Điều phối | Sổ năng lực (bot × loại việc), giới hạn chuỗi (độ sâu, số việc, trần tiền), công tắc Quản đội, bot nào nhận việc từ đồng đội phải hỏi |
| V11 | Hồ sơ bot đủ mục | Mô tả công khai, lời dặn có bản, skill, kết nối, kênh, máy, model, routine, quyền (M3 mới có phần đầu) |

**Đợt vẽ 3: máy, công ty, điện thoại**

| # | Màn | Nội dung chính |
|---|---|---|
| V12 | Máy của bot | Các trạng thái: ngủ, đang thức, đang chạy, người đang cầm lái, lỗi; chọn nơi chạy; máy chung của phòng ban có nhiều bot dùng |
| V13 | Phòng ban (không gian) | Tạo phòng ban mới (menu "+") là có Aris của phòng chào ngay; thanh bên nhóm bot theo phòng như Rakazo, không có nút chuyển phòng |
| V14 | Tìm kiếm | Tìm trong luồng (mọi trang cũ) và trong việc |
| V15 | Điện thoại | Danh bạ, chat, Cần anh, xem màn hình máy của bot |
| V16 | Nhóm bot | Luồng nhóm, ai được nhắc tên thì trả lời (làm sau 9.6) |

**Đợt vẽ 4: công ty, skill và kết nối riêng** (thêm 1/11, mô hình ở plan GĐ9 mục 10)

| # | Màn | Nội dung chính |
|---|---|---|
| V17 | Quản trị › Nhân sự | Danh sách nhân sự, vai trò, phòng ban, số bot và skill riêng; mời, khoá; công tắc cho nhân viên tự tạo bot, tự thêm kết nối |
| V18 | Nhân sự đăng nhập lần đầu | Aris của phòng chào, giới thiệu bot dùng chung, hỏi tạo bot riêng |
| V19 | Thư viện skill | Người tạo, mức chia sẻ (Riêng / Phòng / Công ty), bot dùng; quản trị thấy và tắt được skill của nhân sự; skill xin dùng chung |
| V20 | Cài đặt bot › Skill | Công tắc **Chỉ dùng skill được gán**; danh sách skill được gán và skill từ kho dùng chung |
| V21 | Cài đặt bot › Kết nối | Công tắc **Chỉ dùng kết nối được gán**; kết nối gán thắng kết nối chung cùng dịch vụ |
| V22 | Kết nối ứng dụng | Mọi kết nối với người tạo, mức chia sẻ, bot dùng; quản trị thu hồi được, không xem khoá |
| V23 | Duyệt đưa lên dùng chung | Thẻ trong chat Aris: nội dung skill, đang dùng, kết quả quét, chọn Công ty hay một phòng |
| V24 | Cài đặt › Phòng ban | Phòng ban = không gian (như space của Rakazo); danh sách phòng, trưởng phòng, nhân sự, bot, chi phí so với ngân sách; công tắc bot nhờ được bot phòng khác |
| V25 | Chi tiết một phòng ban | Thành viên, bot của phòng, ngân sách, skill và kết nối của phòng, máy chung, quyền trong phòng (nhân viên tạo bot riêng, skill mới qua trưởng phòng) |

Đợt vẽ 1 đủ để bắt đầu viết mã lát cắt đầu. Đợt 2 vẽ trong lúc làm đợt 1.
