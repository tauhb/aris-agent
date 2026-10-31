# Plan GĐ9 · Đội đồng đội ngang hàng trên lõi dsh (bản 1, 31/10/2026)

Đọc trước `docs/plans/gd8-chung.md` (luật làm việc chung vẫn giữ). Nền nghiên cứu:

- [kien-truc-bot.md](../nghien-cuu/kien-truc-bot.md), nhất là **mục 9** (bản sửa sau soát độc lập): luồng (bot × người), phiên là trang, việc ở phiên phụ, duyệt bền, bảng người.
- [kien-truc/5-aris-chi-huy-kiem-ke.md](../nghien-cuu/kien-truc/5-aris-chi-huy-kiem-ke.md): mọi chỗ trong mã đang dựa vào "Aris là chỉ huy".
- [kien-truc/6-bot-ngang-hang.md](../nghien-cuu/kien-truc/6-bot-ngang-hang.md): Rakazo và OpenMausBot cho bot làm đồng đội của nhau thế nào.
- Giao diện: bản vẽ kiểu OpenMausBot (`design/canvas/Mb*.dc.html`).

## 1. Người dùng đã chốt

- Giao diện kiểu **OpenMausBot**, kiến trúc kiểu **Rakazo**, lõi giữ **dsh**.
- **Bot là đồng đội ngang hàng của nhau**; không còn "Aris chỉ huy" như một kiến trúc riêng. Chấp nhận bỏ tính năng cũ không hợp.
- Mỗi người một luồng với mỗi bot, gộp mọi kênh của người đó; việc dài và routine chạy ở phiên phụ, đăng thẻ kết quả; bỏ "Việc mới" và `/new`.
- Sau này: một công ty trên một server, nhiều nhân sự.

## 2. Mô hình mới, nói gọn

1. **Bot** là đồng đội: lời dặn có bản và hoàn tác, **mô tả công khai** (đồng đội khác đọc để biết nhờ ai việc gì), ký ức của bot, skill, model, máy, connector, routine của chính nó.
2. **Luồng** = (bot, người). Một cửa gửi tin; rảnh thì làm, đang làm thì chen lời; phiên dsh là trang, sang trang bằng phiên mới + tóm tắt.
3. **Việc** = công việc chạy ở phiên phụ, có bản ghi bền của aris (ai nhờ, ai làm, điều kiện xong, trần tiền, trạng thái), xong thì **tự gửi kết quả về** nơi nhờ.
4. **Bot nhờ bot** (`nhan_dong_doi`): tạo một việc cho đồng đội; luồng người nhờ hiện chip "Đã nhờ Mai…", luồng của Mai hiện thẻ "Lâm nhờ: …"; kết quả tự quay về và **gấp gọn dưới chip**. Không đi qua đội dsh.
5. **Chuyển hẳn cho đồng đội** (`chuyen_cho_dong_doi`): người dùng hỏi nhầm bot thì bot chuyển, bot kia trả lời thẳng người dùng; cấm chuyển ngược lại cho người vừa chuyển.
6. **Không có chỉ huy về mặt kiến trúc.** Bot **Aris vẫn còn** (linh vật, tên quen thuộc) nhưng là bot bình thường được bật công tắc **"Quản đội"**: tạo bot mới, sửa lời dặn và model của bot do nó tạo (luôn hỏi người duyệt), xem danh sách đội. Công tắc tắt mặc định ở bot khác, chỉ dùng trong lượt do người bắt đầu.
7. **Chặn vòng lặp và chi phí** (học cả hai bên, và làm hơn cả hai):
   - tối đa 6 bước nhờ nối tiếp (như Rakazo); độ sâu cây tối đa 4, mỗi chuỗi tối đa 24 lần nhờ (như OpenMausBot);
   - **trần tiền cho cả chuỗi** (cả hai sản phẩm đều chưa có): mặc định 1 USD, quá trần thì dừng và hỏi người;
   - không nhờ ngược lại bot đã nhờ mình trong cùng chuỗi; chống nhờ trùng nội dung;
   - **mức duyệt của người khởi đầu đi theo cả chuỗi**: tin của bot khác không bao giờ được tính là "đã duyệt".
8. **Tin của đồng đội là dữ liệu, không phải lệnh tối cao**: bọc như nội dung trích dẫn; người khởi đầu và nguồn được ghi bởi aris, model không giả được.

## 3. Những gì bỏ hay đổi (cần người dùng xác nhận ở Điểm dừng 1)

| # | Tính năng hôm nay (chỉ có nghĩa khi có chỉ huy) | Đề xuất |
|---|---|---|
| 1 | Giao song song 4 bot trong một lời gọi, gom kết quả (`giao_viec`) | **Đổi**: bot nhờ nhiều đồng đội, kết quả tự quay về; bot nhờ tự tổng hợp |
| 2 | Giao việc cho cả phòng ban (`giao_phong`, trưởng nhóm lập đội lồng) | **Bỏ** |
| 3 | Phòng nhóm dự án (`moi_noi`, Aris tóm tắt) | **Đổi về sau** thành **Nhóm bot** (luồng loại phòng, ai được nhắc tên thì trả lời), làm ở giai đoạn sau |
| 4 | Driver Kanban tự đẩy thẻ, Aris tự chia thẻ | **Bỏ driver**; giữ **Bảng việc** cho người và bot nhận việc, làm sau |
| 5 | Commander tự học "bot nào hợp việc nào" | **Bỏ** (mô tả công khai của bot thay thế) |
| 6 | Trợ lý ẩn danh của Commander | **Đổi**: mọi bot dùng bot phụ của dsh (một tầng) |
| 7 | Duyệt mỗi lần giao việc cho bot X | **Đổi**: công tắc theo bot "nhận việc từ đồng đội phải hỏi người" |
| 8 | Trần tiền mỗi việc (tính theo phiên đội dsh) | **Đổi**: trần trên bản ghi việc + trần cả chuỗi |
| 9 | Chuyển giao một chiều | **Giữ**, thành `chuyen_cho_dong_doi` |
| 10 | Cuộc trò chuyện "chính" với Aris; `/ask`, `aris send` luôn qua Aris; routine gửi kết quả qua Telegram của Aris | **Đổi**: mỗi bot có luồng riêng; `/ask` và `aris send` nhận tên bot (mặc định Aris); kết quả gửi về kênh người dùng dùng gần nhất |
| 11 | Chỉ Aris được tạo và bật routine | **Đổi**: mỗi bot tạo routine của chính nó (người duyệt) |
| 12 | Bot thường không được lập đội | **Thay** bằng luật chặn vòng lặp và trần chuỗi ở mục 2.7 |
| 13 | Trang Commander, Cài đặt › Commander, cây đội có Commander ở giữa, nút "Aris" ở đầu thanh bên | **Bỏ**; thanh bên là danh bạ bot phẳng (bản vẽ kiểu OpenMausBot) |
| 14 | Ký ức "hồ sơ chủ" lưu dưới bot Aris, mọi bot đọc | **Đổi**: ký ức của từng người, chuyển dữ liệu cũ sang người "chủ" |

Giữ nguyên: kho skill và connector chung của đội, trần chi phí cả đội, hàng rào, sao lưu, điểm khôi phục, `/goal` có giám khảo, vòng tự học (đổi đích duyệt), Second Brain, bot ngoài (Claude Code, Codex: tách khỏi gói Commander thành gói riêng).

## 4. Các đợt (thứ tự theo phụ thuộc, có công tắc `doi.v1` theo từng bot)

**9.0 Spike (3–4 ngày, không viết mã sản phẩm).** Đo: thời gian mở lại phiên nguội theo độ dài nhật ký; chen lời khi lượt đang chờ duyệt; lịch hẹn và `/goal` sau sang trang; chi phí mỗi bước theo độ dài ngữ cảnh (để chọn ngưỡng sang trang, dự kiến khoảng 100 nghìn token); bot phụ dsh từ một phiên việc; duyệt bằng tin nhắn Zalo. Kết quả ghi `docs/spikes/gd9-luong-bot.md`. **Điểm dừng 2.**

**9.1 Nền: người, luồng, một cửa gửi tin.**
- Bảng `nguoi` (nối danh tính Telegram, Zalo, web; hôm nay chỉ có "chủ") và bảng `luong` (bot, người, loại riêng | phòng | khách, trang hiện tại, trang cũ, trạng thái, kênh gần nhất). Chỉ thêm mới, vẫn ghi song song con trỏ cũ.
- `luong.gui(người, bot, tin, nguồn, số thứ tự nhận)`: web và kênh gọi khi công tắc bật; số thứ tự đóng trước khi chuyển giọng nói hay tải tệp.
- Một hàm `bao(người | luồng)` thay khoảng 14 chỗ gửi cứng về chat của Aris.
- `botOf` không còn trả "aris" cho phiên chưa gắn thẻ: phiên mới luôn có bot thật.

**9.2 Đồng đội ngang hàng.**
- Mô tả công khai của bot; danh bạ đồng đội nạp vào lời dặn (gắn nhãn "do đồng đội tự viết").
- Bản ghi `viec` (ai nhờ, ai làm, chế độ làm | hỏi ý | báo, điều kiện xong, trần tiền, chuỗi, trạng thái, kết quả); công cụ `nhan_dong_doi`, `chuyen_cho_dong_doi`; kết quả tự quay về (cả khi khởi động lại); chặn vòng lặp và trần chuỗi.
- Bỏ đường giao việc qua đội dsh; tắt `giao_viec`, `giao_phong`, `moi_noi`, Driver sau công tắc.
- Bot Aris thành bot thường + công tắc "Quản đội"; công cụ tạo bot, sửa bot con (luôn duyệt).
- Bot ngoài tách thành gói riêng.

**9.3 Việc và chờ người bền.**
- Routine, `/goal`, ACP, `/ask`, việc của dự án đều là việc gắn luồng, đăng thẻ kết quả; bỏ nút routine gắn lại cuộc chat Telegram; tự đẩy thành việc khi lượt quá khoảng 2 phút.
- Duyệt bền kiểu lai (chờ ngắn trong lượt, quá hạn thì lưu yêu cầu với mã băm tham số, cho qua đúng một lần khi model gọi lại) + **mã chống lặp cho mọi thao tác ra ngoài**; thẻ "Cần {you}" lấy từ trạng thái luồng và việc; sau đó bật câu hỏi `timed`.
- Ký ức mặc định riêng của người (chuyển cuốn "hồ sơ chủ" sang người "chủ"); `recall` và tìm kiếm chỉ trong (bot, người).
- Sang trang bằng phiên mới + tóm tắt (ngưỡng từ spike, "chủ đề mới", đổi cài đặt bot); chuyển lịch hẹn, `/loop`, `/heartbeat`, `/goal`, duyệt đang chờ sang trang mới; rút ký ức lúc sang trang.

**9.4 Giao diện kiểu OpenMausBot.** Theo bản vẽ đã có, cộng các màn còn thiếu (vẽ trước, **Điểm dừng 3**): chip "Đã nhờ …" và kết quả gấp gọn, thẻ "… nhờ" trong luồng bot nhận, danh bạ đồng đội, công tắc "Quản đội", trang việc. Bỏ trang Commander, nút "Việc mới", chữ "phiên"; `/new` thành "chủ đề mới"; giữ "Lịch sử trang" cho quản trị một bản phát hành.

**9.5 Gỡ đường cũ.** Sau hai tuần chạy thật với công tắc bật cho mọi bot: gỡ `kind: 'commander'`, gói con giao việc qua đội dsh, trang và API cũ. **Điểm dừng 4** trước khi gỡ.

Sau 9.5 mới tới các giai đoạn đã bàn: máy riêng cho bot, công ty nhiều nhân sự, lên server, nhóm bot, giọng nói, app điện thoại, connector lớn.

**Ước tính**: khoảng 5–7 tuần một người cho 9.1–9.3 và 9.5 (6 hạng mục lớn, 18 vừa, 30 nhỏ theo kiểm kê), cộng 9.4 giao diện.

## 5. Rủi ro lớn nhất

1. **Ký ức theo người** đụng phần đầu ổn định của lời dặn (cache DeepSeek): thứ tự nạp phải cố định, phần theo người đặt sau phần chung.
2. **Thay hộp duyệt bằng duyệt bền** mà không gửi trùng: mã chống lặp phải có trước khi bật.
3. **Thay đội dsh bằng bản ghi việc** mà vẫn giữ trần tiền, đếm bot bận và kết quả quay về sau khởi động lại.
4. **Chi phí bot nhờ bot**: trần chuỗi và chặn vòng lặp phải có ngay từ lần đầu bật.
5. **Khối lượng test vỡ**: toàn bộ test của gói Commander, `hub.test.ts`, test ký ức, bot, dự án, thống kê, bộ não, giao diện. Mỗi đợt chạy đủ bộ kiểm theo `gd8-chung.md`.

## 6. Điểm dừng

1. Người dùng xác nhận bảng "bỏ hay đổi" (mục 3) và cách giữ bot Aris là bot thường có công tắc "Quản đội".
2. Kết quả spike (có thể đổi ngưỡng sang trang, cách duyệt bền).
3. Duyệt bản vẽ các màn còn thiếu của 9.4.
4. Trước khi gỡ đường cũ.

## 7. Kiểm tra

Theo `gd8-chung.md`. Thêm: test luật chặn vòng lặp và trần chuỗi; test không gửi trùng khi thử lại; test kết quả việc quay về sau khởi động lại; thử thật một buổi với Telegram và Zalo của người dùng trước Điểm dừng 4.
