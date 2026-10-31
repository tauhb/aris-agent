# Kiến trúc "lấy bot làm gốc" cho aris trên lõi dsh (31/10/2026)

Người dùng chốt: **giao diện theo OpenMausBot, kiến trúc theo Rakazo, lõi giữ dsh**. Người dùng thấy aris "làm việc theo phiên", còn Rakazo và OpenMausBot thì "cứ nhắn thẳng cho bot là bot làm". Tài liệu này giải thích vì sao, đề xuất kiến trúc mới và sửa lộ trình GĐ9. Ba báo cáo gốc (có dẫn đường tệp) ở `docs/nghien-cuu/kien-truc/`:

1. [aris hiện tại](kien-truc/1-aris-hien-tai.md): bot, phiên, từng lối vào tạo phiên thế nào.
2. [dsh cho bot liên tục](kien-truc/2-dsh-cho-bot-lien-tuc.md): dsh có gì, thiếu gì, bù bằng plugin ra sao.
3. [Mô hình bot của Rakazo](kien-truc/3-rakazo-mo-hinh-bot.md): phần nào tạo cảm giác "đồng đội", phần nào độc lập với vòng gọi model.
> **Sửa lần 2 (31/10)**: người dùng bỏ mô hình chỉ huy, mọi bot là đồng đội ngang hàng. Plan hiện hành: [plans/gd9-doi-dong-doi.md](../plans/gd9-doi-dong-doi.md).

4. [Bản soát độc lập](kien-truc/4-opus-soat.md) (31/10): kết luận **duyệt có sửa**; mục 9 dưới đây là bản sửa và **thay cho các chỗ mâu thuẫn ở mục 1–6**.

## 1. Chẩn đoán: vì sao aris "theo phiên"

- **Bot của aris chỉ là bản cấu hình** (lời dặn, model, quyền, sổ ký ức). Bot **không có cuộc trò chuyện của riêng mình**; đơn vị trò chuyện duy nhất là **phiên dsh**, gắn với bot bằng một bảng thẻ (`aris_bots.sessions`).
- **Mỗi lối vào tự tạo phiên theo luật riêng**: web "Việc mới" tạo phiên mới; bấm vào bot thì lấy phiên mở gần nhất; Telegram, Zalo, Lark mỗi tài khoản × cuộc chat × chủ đề một phiên, `/new` mới tạo phiên mới; mỗi lần routine chạy một phiên mới; `giao_viec` tạo phiên cho bot được giao; ACP mỗi lần một phiên.
- **Không có "luồng chính" của bot.** Thiết kế "dispatch" trong `phan-tich-kien-truc.md` mục 6.1 (một luồng chính, tự xoay phiên kèm tóm tắt) **chưa từng được làm**.
- **Mất mạch giữa các phiên**: chỉ ký ức lõi, skill, bộ não và công cụ `recall` (bot phải tự gọi) đi qua; nội dung trò chuyện không được tóm sang phiên sau.
- **Duyệt giữ tiến trình**: lượt đang chờ duyệt treo một promise trong bộ nhớ; khởi động lại là mất; thẻ duyệt về chat của Aris chứ không về chat đang nói.
- **Người dùng phải nghĩ về phiên**: nút "Việc mới", "＋ Phiên mới" (5 phiên gần nhất), "Tìm trong mọi phiên", `/new` `/sessions` `/resume` trên Telegram, "có hiệu lực ở phiên mới", "Mở phiên" của routine.

## 2. Rakazo làm khác ở đâu

Rakazo nói thẳng: phần của họ là **"ngôi nhà bền" quanh bot**; vòng gọi model (Pi) chỉ là một mảnh cắm sau giao diện `AgentRuntime`. Mười mảnh tạo cảm giác "đồng đội", xếp theo mức quan trọng (chỉ phần in nghiêng gắn với Pi):

1. **Mỗi bot đúng một luồng** (`Thread.botId` duy nhất); không có nút chọn luồng.
2. **Gửi tin tách khỏi chạy**: một giao dịch ghi tin, rồi hoặc chen vào lượt đang chạy, hoặc tạo việc mới; chạy ngay trong tiến trình, không xếp hàng.
3. **Lượt chạy có trạng thái bền** (chờ, đang chạy, chờ người, xong, lỗi), có hợp đồng thuê và chống chạy hai lần.
4. **Chờ người thì nhả tiến trình**, lưu lượt, trả lời xong chạy tiếp; thao tác ra ngoài có mã chống lặp; nhắc sau 4 giờ, huỷ sau 24 giờ. *(Định dạng lưu lượt gắn với Pi.)*
5. **Trạng thái của bot được nạp mỗi lượt**: lời dặn, công cụ, ký ức, việc dở, tóm tắt, cửa sổ tin gần đây.
6. **Lịch sử vô hạn mà vẫn dùng được**: 50 tin gần nhất nguyên văn, tóm tắt cuốn chiếu, công cụ tìm và đọc lại tin cũ.
7. **Routine, webhook, bot nhắn bot chạy vào cùng luồng**, ghi rõ nguồn.
8. **Máy riêng bền**, một lượt dùng máy một lúc.
9. **"Cần bạn" suy ra từ trạng thái lượt**, không có hộp riêng.
10. Nhắn giữa bot, nhóm bot.

Rakazo **chưa giải** bài toán công ty: bot có một chủ, một luồng; nhiều người chỉ dùng chung qua kênh nhắn (Slack, Telegram) với tên người gửi.

## 3. dsh có đủ để làm "bot liên tục" không

Có phần lớn, không cần sửa lõi:

| Cần | dsh | Ghi chú |
|---|---|---|
| Phiên sống lâu, bền, khởi động lại vẫn tiếp | **Có** | Nhật ký phiên chỉ ghi thêm, lưu từng bước |
| Thu gọn lịch sử dài | **Có** | `dsh-compaction-basic` + cắt kết quả công cụ + đẩy ảnh ra ngoài |
| Giữ cache DeepSeek | **Có** | Phần đầu ổn định theo thiết kế; thu gọn chỉ phá cache một lần |
| Chen lời vào lượt đang chạy | **Có** | `steer`, `followup`, `inject`, `cancel`; aris đã dùng |
| Thứ tự tin, chống trùng | **Có** | Hộp thư nối tiếp + `requestId` |
| Câu hỏi không giữ tiến trình | **Có** (chế độ `timed`) | Trả lời muộn vẫn chen vào được, cả khi phiên đã nguội |
| Lịch hẹn chạy vào đúng phiên | **Có** | `dsh-schedule` |
| Tìm lại trong luồng | **Có** | `dsh-session-query` (SQLite FTS5) |
| Nhận giọng nói | **Có** (thử nghiệm) | SenseVoice |
| Một luồng cho mỗi bot | **Có nền**, thiếu luật | aris tự giữ con trỏ bot → phiên |
| Phiên sống mãi không phình | **Một phần** | Không xoay vòng; aris tự "sang trang" bằng `fork` lúc rảnh |
| **Duyệt nhả tiến trình rồi chạy tiếp** | **Thiếu** | aris tự ghi yêu cầu duyệt, kết thúc lượt, trả lời xong gửi `followup` có `requestId` |
| Việc nền, bot phụ báo kết quả bền | **Một phần** | aris ghi bản ghi việc, xong thì `followup` vào luồng |
| Cầm lái (người đang lái thì bot dừng) | **Thiếu** | Chặn ở `agent/pre-step` khi cờ cầm lái bật |
| Đẩy phiên rảnh khỏi bộ nhớ | **Thiếu** | `aris-daemon` tự dọn, mở lại khi có tin |
| Nhiều người dùng | **Một phần** | `PrincipalMap` mở rộng được; người không phải chủ chưa trả lời duyệt được qua dsh |

**Kết luận**: lõi dsh mạnh hơn Pi ở đúng những chỗ khó (nhật ký bền, chen lời, cache, thu gọn, câu hỏi `timed`, lịch hẹn). Cái aris thiếu là **"ngôi nhà bền" quanh bot**, đúng phần Rakazo tự viết. Phần này làm bằng gói của aris.

## 4. Kiến trúc đề xuất: Luồng (thread) là đơn vị, phiên dsh là trang

```
Người (chủ, nhân sự) ──┐
Kênh (web, Telegram, Zalo, Lark, ACP, điện thoại) ──► gửi(tin) ──► LUỒNG của (bot, người)
Routine, webhook, bot khác, việc nền ───────────────┘                │
                                                                   ├─ trang hiện tại = 1 phiên dsh (steer/followup)
                                                                   ├─ trang cũ (phiên đã sang trang) + tóm tắt nối mạch
                                                                   ├─ VIỆC: việc dài chạy ở phiên phụ, xong đăng thẻ kết quả vào luồng
                                                                   └─ trạng thái: rảnh / đang làm / cần người / lỗi
Bot (dùng chung): lời dặn có bản, ký ức, skill, máy, connector, model, routine
```

1. **Luồng** (gói mới `@aris/threads`, hoặc mở rộng `@aris/bots`): `{ bot, người, loại: riêng | phòng | khách, trang hiện tại, các trang cũ, tóm tắt, trạng thái, lần cuối }`.
   - Chủ hay nhân sự: **mỗi người một luồng riêng với mỗi bot**. Web, Telegram, Zalo, điện thoại của cùng một người **đổ vào cùng một luồng**. Đây là chỗ aris vượt Rakazo (Rakazo chỉ có một chủ).
   - Khách trên Zalo hay Telegram của shop: mỗi khách một luồng loại "khách" (như hiện nay), chủ xem được.
   - Nhóm Telegram, Zalo, nhóm bot: luồng loại "phòng", ghi tên người gửi.
2. **Một cửa gửi tin** `threads.send(thread, message, sender, requestId)`: rảnh thì bắt đầu lượt; đang trò chuyện thì `steer`; đang chạy việc nền thì `followup`. Mọi kênh và giao diện chỉ gọi cửa này. Không còn "Việc mới", không còn `/new`.
3. **Sang trang ngầm**: khi phiên đủ dài và bot đang rảnh, `fork` sang phiên mới, mang tóm tắt và ký ức, giữ phần đầu ổn định để trúng cache. Người dùng chỉ thấy một luồng cuộn mãi; tìm trong luồng tìm được cả các trang cũ.
4. **Việc (task)** cho việc dài hay chạy song song: bot hoặc người bấm **"+ Việc"** (như nút của OpenMausBot) → việc chạy ở phiên phụ, hiện thành thẻ "đang làm" trong luồng; xong thì đăng thẻ kết quả và một dòng tóm tắt vào luồng. Routine, `/goal`, `giao_viec` đều là việc. Luồng chính gọn, cache ổn, bot vẫn làm được nhiều việc cùng lúc (Rakazo chỉ cho một lượt dùng máy một lúc).
5. **Chờ người bền**: duyệt, hỏi, cầm lái, xin khoá đều thành thẻ **trong chính luồng**; lượt kết thúc, nhả bộ nhớ; trả lời xong `followup` có `requestId` để thao tác chỉ chạy một lần; nhắc sau 4 giờ, hết hạn theo loại. Chuông "Cần {you}" và Hộp duyệt lấy từ trạng thái luồng.
6. **Bot mang trạng thái chung**: lời dặn có bản và hoàn tác, ký ức của bot (dùng chung) tách khỏi ký ức của từng người, skill, máy, connector, model, routine. Mỗi lượt nạp đúng thứ tự cố định để giữ cache.
7. **Dọn tiến trình**: bot rảnh lâu thì đẩy khỏi bộ nhớ, có tin thì mở lại; một tiến trình giữ một luồng (đủ cho một server của một công ty).

## 5. Giao diện đi theo (kiểu OpenMausBot)

- Thanh bên là **danh bạ bot**; bấm bot là vào luồng của mình với bot đó. Bỏ hẳn chữ "phiên".
- Đầu luồng: "+ Việc", chọn model, gọi, máy tính. Thẻ câu hỏi A/B/C, thẻ duyệt, thẻ việc ngay trong luồng.
- Tìm kiếm tìm trong luồng (mọi trang) và trong việc.
- Telegram, Zalo: `/new` bỏ hoặc đổi nghĩa thành "bắt đầu chủ đề mới" (chỉ chèn một dấu ngắt trong luồng, không tạo phiên).

## 6. Sửa lộ trình GĐ9

Lộ trình cũ đặt "Chạy bền" (9.1) trước. Sau khi đọc kỹ, **"Luồng bot liên tục" phải làm trước tiên** vì mọi phần khác (chạy bền, máy, công ty, điện thoại) đều gắn vào luồng.

1. **9.1 Luồng bot liên tục** (mới, gộp phần "chạy bền" của 9.1 cũ): gói luồng, một cửa gửi tin, nối mọi lối vào, sang trang ngầm, việc và thẻ kết quả, chờ người bền, trạng thái, dọn tiến trình; chuyển dữ liệu cũ (phiên mở gần nhất của mỗi bot thành trang đầu của luồng, phiên khác thành lịch sử tìm được). Giao diện Văn phòng kiểu OpenMausBot làm cùng đợt này.
2. **9.2 Máy riêng cho bot** (giữ nguyên), gắn vào luồng.
3. **9.3 Công ty nhiều nhân sự**: dễ hơn vì luồng đã có trường "người" từ 9.1.
4. **9.4 Lên server.**
5. Còn lại như cũ: 9.5 Đội tự vận hành, 9.6 Giọng nói, 9.7 App điện thoại, 9.8 Connector lớn.

## 7. Người dùng đã quyết (31/10): đồng ý cả ba đề xuất dưới đây; yêu cầu một lượt soát độc lập trước khi lên plan 9.1

1. **Một người, một luồng với mỗi bot, gộp mọi kênh** (web, Telegram, Zalo của chính người đó): đề xuất **có**.
2. **Việc dài và routine chạy ở phiên phụ, đăng kết quả vào luồng** (đề xuất), hay chạy thẳng trong luồng như Rakazo (đơn giản hơn nhưng luồng rối và chỉ một việc một lúc).
3. **Bỏ "Việc mới" và `/new`**, thay bằng "+ Việc" và dấu "chủ đề mới": đề xuất **có**.

## 8. Giới hạn

- Báo cáo do sub agent viết, có đánh dấu suy luận. Các điểm của dsh chưa đọc sâu: `dsh-workflow`, `dsh-acp*`, `dsh-api-job-controller`. Việc chen lời khi lượt đang chờ duyệt là suy luận, cần thử trước khi làm.
- Chưa đo chi phí mở lại phiên nguội khi nhật ký dài; "sang trang" được đề xuất một phần vì lý do này.

## 9. Bản sửa sau soát độc lập (31/10) — thay cho các chỗ mâu thuẫn ở trên

Đã tự kiểm lại trong mã: `fork` của dsh chép nguyên phần đầu nhật ký (`dsh-session` README, mục Fork); yêu cầu duyệt của dsh không mang tham số công cụ và không có kho quyền (`dsh-user-approval` README, Known limitations); thẻ duyệt Telegram về đúng cuộc chat đang nói (`aris-channels/src/hub.ts`, hàm duyệt), không phải chat của Aris.

### 9.1 Sửa chỗ sai

- **Thẻ duyệt** đã về đúng chat đang nói (chỉ routine mới về chat của Aris). Mục 1 viết sai.
- **Câu hỏi `timed`** của dsh có, nhưng aris **chưa bật** ở đâu cả.
- **Lối vào** còn thiếu: lệnh `/ask` của daemon và nút routine trên Telegram (gắn lại cuộc chat vào phiên của routine).
- **Zalo đã có nhường tay cho chủ** (chỉ giữ trong bộ nhớ), không phải "thiếu hẳn".
- **Vòng tự học có học** từ phiên được Commander giao việc.
- **Cache**: thu gọn chỉ phá cache một lần là đúng, nhưng mỗi bước vẫn trả tiền cho cả ngữ cảnh; với cửa sổ 1 triệu token, thu gọn tới quá muộn (gần 800 nghìn token).

### 9.2 Sửa thiết kế (bắt buộc)

1. **Sang trang = phiên mới + tóm tắt**, không bao giờ dùng `fork`.
2. **Khi nào sang trang**: ngữ cảnh vượt khoảng 100 nghìn token, người dùng bấm "chủ đề mới", hay đổi cài đặt bot (lời dặn, model, connector). Như vậy "chủ đề mới" có tác dụng thật, và câu "có hiệu lực ở phiên mới" thành "áp dụng từ tin sau".
3. **Chuyển theo khi sang trang**: lịch hẹn của dsh, `/loop`, `/heartbeat`, mục tiêu `/goal`, duyệt đang chờ; hoặc giữ chúng ở cấp luồng. Hiện chúng gọi về đúng phiên cũ.
4. **Duyệt bền kiểu lai**: chờ ngắn trong lượt như bây giờ; quá hạn thì lưu yêu cầu kèm **mã băm tham số công cụ**, kết thúc lượt; người duyệt xong thì gửi `followup`, model gọi lại đúng công cụ đó, aris tự cho qua **một lần** nếu tham số khớp.
5. **Mã chống lặp cho mọi thao tác ra ngoài** (gửi Zalo, Telegram, tin cho khách, thao tác tốn tiền): không bao giờ gửi hai lần khi thử lại hay khi kết quả không rõ.
6. **Đưa `giao_viec` ra khỏi đội dsh của phiên Commander**: đội dsh chỉ nhận tối đa 16 thành viên trọn đời (tính cả lần lỗi) và không dùng lại tên; trong một luồng sống mãi, giao việc sẽ hỏng vĩnh viễn. Thay bằng bản ghi việc của aris và phiên việc riêng.
7. **Bảng `people`** nối danh tính Telegram, Zalo, web của cùng một người; ghi `person` vào luồng, tin, ký ức, bài học, đề xuất skill, duyệt và chi phí **ngay từ 9.1** (hôm nay mọi thứ là `chủ`). Không có bảng này thì quyết định "một người một luồng gộp mọi kênh" không làm được, và 9.3 phải viết lại.
8. **Ký ức mặc định riêng của người**: hôm nay "nhớ là…" của bất kỳ ai đều vào cuốn "hồ sơ chủ" dùng chung cho mọi bot. Đưa lên ký ức chung của bot thì phải qua duyệt.
9. **`recall` và tìm kiếm chỉ trong (bot, người)**: hôm nay tìm trong mọi phiên, kể cả phiên của khách.
10. **ACP, routine, `/goal`, `/ask`, việc của dự án đều là "việc" gắn với luồng**; bỏ việc nút routine gắn lại cuộc chat Telegram.
11. **Có công tắc theo từng bot** (`teammates.v1`): chỉ thêm bảng mới, vẫn ghi song song con trỏ cũ, không sửa nhật ký dsh; tắt công tắc là về đúng cách cũ.

### 9.3 Nên làm

- Đóng số thứ tự nhận tin **trước** khi chuyển giọng nói thành chữ hay tải tệp, để tin từ hai kênh giữ đúng thứ tự gửi.
- Gửi kết quả và nhắc việc về **kênh người đó dùng gần nhất**.
- **Khoá tài nguyên theo bot** (máy, thư mục dự án) cho việc phụ chạy song song với luồng chính.
- **Tự đẩy thành việc**: lượt dài quá khoảng 2 phút hay quá nhiều bước thì aris tự chuyển thành thẻ việc ("làm ở nền, xong báo"); model có công cụ `start_task`; nút "+ Việc" chỉ là lối tắt. Người dùng không phải chọn "nhắn hay giao việc".
- Bỏ ba chế độ khi bot đang bận (chen, xếp hàng, ngắt): mặc định chen, có nút **Dừng**.
- Luồng phòng (nhóm) có luật bận riêng và tin cậy theo người gửi.
- Rút ký ức cả lúc sang trang, không chỉ lúc thu gọn.
- **Tách giao diện kiểu OpenMausBot thành 9.1b**, làm sau khi phần định tuyến chạy ổn: giảm một nửa rủi ro.
- **Spike trước khi lên plan** (3–4 ngày, không viết mã sản phẩm): thời gian mở lại phiên nguội theo độ dài nhật ký, chen lời khi đang chờ duyệt, lịch hẹn sau sang trang, đội dsh sau 16 thành viên, chi phí mỗi bước theo độ dài ngữ cảnh, duyệt bằng tin nhắn Zalo.

### 9.4 Để sau hay bỏ khỏi 9.1

- Để sau: đẩy phiên rảnh khỏi bộ nhớ (đo trước), cầm lái chung (thuộc 9.2 cùng khoá máy), Lark (sau khi Telegram và Zalo chạy ổn), cuộn vô hạn qua các trang (đầu tiên chỉ cần vạch trang và "xem trang trước").
- Không chép: dựng lại ngữ cảnh mỗi lượt từ cơ sở dữ liệu như Rakazo (đánh vào cache, lợi thế của dsh); mô hình một chủ một bot của Rakazo; "mặc định toàn quyền, có nút hoàn tác" của OpenMausBot (tin đã gửi cho khách thì không hoàn tác được); gộp nhóm hay khách vào luồng riêng của một người.

### 9.5 Thứ tự làm 9.1 (sau sửa)

0. **Spike** (đo, không viết mã sản phẩm).
1. **Dữ liệu chỉ thêm mới**: bảng `threads` và bảng `people`; luồng đầu tiên của mỗi bot = cuộc chat Telegram riêng của chủ với bot đó nếu có, không thì phiên mở gần nhất; các phiên khác thành trang cũ tìm được.
2. **Một cửa gửi tin** và gửi kết quả về kênh dùng gần nhất.
3. **Việc**: routine, `/goal`, `giao_viec`, ACP, `/ask` thành phiên việc gắn luồng, đăng thẻ kết quả.
4. **Duyệt bền** và mã chống lặp; sau đó câu hỏi `timed`.
5. **Sang trang** bằng phiên mới + tóm tắt, chuyển lịch hẹn và mục tiêu, giới hạn `recall`.
6. **Giao diện tối thiểu**: bỏ "Việc mới", `/new` thành "chủ đề mới"; giữ "Lịch sử trang" cho quản trị một bản phát hành.
7. **Gỡ đường cũ** sau hai tuần chạy thật với công tắc bật cho mọi bot.
8. **9.1b**: giao diện kiểu OpenMausBot.
