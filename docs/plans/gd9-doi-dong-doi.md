# Plan GĐ9 · Đội đồng đội ngang hàng trên lõi dsh (bản 2, 31/10/2026)

Đọc trước `docs/plans/gd8-chung.md` (luật làm việc chung vẫn giữ). Nền nghiên cứu:

- [kien-truc-bot.md](../nghien-cuu/kien-truc-bot.md), nhất là **mục 9** (bản sửa sau soát độc lập): luồng (bot × người), phiên là trang, việc ở phiên phụ, duyệt bền, bảng người.
- [kien-truc/5-aris-chi-huy-kiem-ke.md](../nghien-cuu/kien-truc/5-aris-chi-huy-kiem-ke.md): mọi chỗ trong mã đang dựa vào "Aris là chỉ huy".
- [kien-truc/6-bot-ngang-hang.md](../nghien-cuu/kien-truc/6-bot-ngang-hang.md): Rakazo và OpenMausBot cho bot làm đồng đội của nhau thế nào.
- [kien-truc/7-opus-soat-ke-hoach.md](../nghien-cuu/kien-truc/7-opus-soat-ke-hoach.md): soát độc lập bản 1, kết luận **duyệt có sửa**; bản 2 này đã sửa theo.
- Giao diện: bản vẽ kiểu OpenMausBot (`design/canvas/Mb*.dc.html`).
- **Quy ước tên**: định danh mới trong mã (bảng, công cụ, hàm, cờ) đặt bằng tiếng Anh; chữ hiển thị cho người dùng vẫn tiếng Việt.

## 1. Người dùng đã chốt

- Giao diện kiểu **OpenMausBot**, kiến trúc kiểu **Rakazo**, lõi giữ **dsh**.
- **Bot là đồng đội ngang hàng của nhau**; chấp nhận bỏ tính năng cũ không hợp.
- **Sửa 31/10**: **Aris vẫn là bot điều phối (Commander)**: hiểu rõ bot nào hợp việc nào, người dùng nhắn Aris thì Aris chia việc cho đúng đồng đội. Aris làm việc này **bằng chính cơ chế đồng đội ngang hàng** (`ask_teammate`, `hand_off_to_teammate`, bản ghi `tasks`), không còn đường giao việc qua đội dsh.
- Mỗi người một luồng với mỗi bot, gộp mọi kênh của người đó; việc dài và routine chạy ở phiên phụ, đăng thẻ kết quả; bỏ "Việc mới" và `/new`.
- Sau này: một công ty trên một server, nhiều nhân sự.

## 2. Mô hình mới, nói gọn

1. **Bot** là đồng đội: lời dặn có bản và hoàn tác, **mô tả công khai** (đồng đội khác đọc để biết nhờ ai việc gì), ký ức của bot, skill, model, máy, connector, routine của chính nó.
2. **Luồng** = (bot, người). Một cửa gửi tin; rảnh thì làm, đang làm thì chen lời; phiên dsh là trang, sang trang bằng phiên mới + tóm tắt.
3. **Việc** = công việc chạy ở phiên phụ, có bản ghi bền của aris (ai nhờ, ai làm, điều kiện xong, trần tiền, trạng thái), xong thì **tự gửi kết quả về** nơi nhờ.
4. **Bot nhờ bot** (`ask_teammate`): tạo một việc cho đồng đội; luồng người nhờ hiện chip "Đã nhờ Mai…", luồng của Mai hiện thẻ "Lâm nhờ: …"; kết quả tự quay về và **gấp gọn dưới chip**. Không đi qua đội dsh.
5. **Chuyển hẳn cho đồng đội** (`hand_off_to_teammate`): người dùng hỏi nhầm bot thì bot chuyển, bot kia trả lời thẳng người dùng; cấm chuyển ngược lại cho người vừa chuyển.
6. **Aris là bot điều phối, đứng trên cơ chế ngang hàng.** Aris có vai `coordinator` và công tắc **"Quản đội"** (`canManageTeam`):
   - **Hiểu đội**: đọc mô tả công khai của từng bot, kèm **sổ năng lực** do aris tự ghi từ kết quả các việc (bot × loại việc: số việc, tỉ lệ xong, thời gian, chi phí, người dùng khen hay sửa). Đây là tính năng "Commander tự học" hôm nay, chuyển sang ghi trên bản ghi `tasks`.
   - **Điều phối**: người dùng nhắn Aris → Aris tự làm nếu việc nhỏ; **chuyển hẳn** cho một bot nếu rõ người hợp; **nhờ một hay nhiều bot** rồi tổng hợp nếu việc cần nhiều người (thay `giao_viec` song song).
   - **Quản đội**: tạo bot mới, sửa lời dặn và model của bot (luôn hỏi người duyệt), xem danh sách đội.
   - Bot khác vẫn nhờ nhau trực tiếp được; Aris không phải trạm trung chuyển bắt buộc.
   - Aris đứng đầu danh bạ bot.
   - **Aris tạo bot mới cho người dùng** (như Chief của Rakazo): lần đầu dùng, Aris chào, hỏi người dùng cần giúp việc gì (thẻ câu hỏi A/B/C), rồi đề xuất và tạo các bot hợp việc (tên, vai trò, lời dặn, linh vật), người dùng duyệt từng bot. Về sau chỉ cần nhắn "tạo cho anh một bot chăm sóc khách Zalo" là Aris tạo, gắn skill từ kho dựng sẵn và hỏi gắn kênh.
   - **Mỗi không gian làm việc có một Aris riêng sẵn sàng nhận việc** (xem mục 9).
7. **Chặn vòng lặp và chi phí** (học cả hai bên, và làm hơn cả hai):
   - tối đa 6 bước nhờ nối tiếp (như Rakazo); độ sâu cây tối đa 4, mỗi chuỗi tối đa 24 lần nhờ (như OpenMausBot);
   - **trần tiền cho cả chuỗi** (cả hai sản phẩm đều chưa có): mặc định 1 USD, quá trần thì dừng và hỏi người;
   - không nhờ ngược lại bot đã nhờ mình trong cùng chuỗi; chống nhờ trùng nội dung;
   - **mức duyệt của người khởi đầu đi theo cả chuỗi**: tin của bot khác không bao giờ được tính là "đã duyệt".
8. **Tin của đồng đội là dữ liệu, không phải lệnh tối cao**: bọc như nội dung trích dẫn; người khởi đầu và nguồn được ghi bởi aris, model không giả được.

## 3. Những gì bỏ hay đổi (cần người dùng xác nhận ở Điểm dừng 1)

| # | Tính năng hôm nay (chỉ có nghĩa khi có chỉ huy) | Đề xuất |
|---|---|---|
| 1 | Giao song song 4 bot trong một lời gọi, gom kết quả (`giao_viec`) | **Đổi**: Aris (hay bot bất kỳ) nhờ nhiều đồng đội cùng lúc, kết quả tự quay về, Aris tổng hợp |
| 2 | Giao việc cho cả phòng ban (`giao_phong`, trưởng nhóm lập đội lồng) | **Bỏ** |
| 3 | Phòng nhóm dự án (`moi_noi`, Aris tóm tắt) | **Đổi về sau** thành **Nhóm bot** (luồng loại phòng, ai được nhắc tên thì trả lời), làm ở giai đoạn sau |
| 4 | Driver Kanban tự đẩy thẻ, Aris tự chia thẻ | **Bỏ driver**; giữ **Bảng việc** cho người và bot nhận việc, làm sau |
| 5 | Commander tự học "bot nào hợp việc nào" | **Giữ** (người dùng chốt 31/10): chuyển thành sổ năng lực ghi từ bản ghi `tasks`, Aris dùng để chọn người |
| 6 | Trợ lý ẩn danh của Commander | **Đổi**: mọi bot dùng bot phụ của dsh (`run_subagent`, một tầng) |
| 7 | Duyệt mỗi lần giao việc cho bot X | **Đổi**: công tắc theo bot "nhận việc từ đồng đội phải hỏi người" |
| 8 | Trần tiền mỗi việc (tính theo phiên đội dsh) | **Đổi**: trần trên bản ghi việc + trần cả chuỗi |
| 9 | Chuyển giao một chiều | **Giữ**, thành `hand_off_to_teammate` |
| 10 | Cuộc trò chuyện "chính" với Aris; `/ask`, `aris send` luôn qua Aris; routine gửi kết quả qua Telegram của Aris | **Đổi**: mỗi bot có luồng riêng; `/ask` và `aris send` nhận tham số `--bot` (mặc định Aris); kết quả gửi về kênh người dùng dùng gần nhất |
| 11 | Chỉ Aris được tạo và bật routine | **Đổi**: mỗi bot tạo routine của chính nó (người duyệt) |
| 12 | Bot thường không được lập đội | **Thay** bằng luật chặn vòng lặp và trần chuỗi ở mục 2.7 |
| 13 | Trang Commander, Cài đặt › Commander, cây đội có Commander ở giữa, nút "Aris" ở đầu thanh bên | **Đổi**: thanh bên là danh bạ bot (bản vẽ kiểu OpenMausBot), Aris ghim đầu danh bạ; trang Commander gọn lại thành phần "Điều phối" trong hồ sơ của Aris (sổ năng lực, giới hạn chuỗi, ai được nhờ) |
| 14 | Ký ức "hồ sơ chủ" lưu dưới bot Aris, mọi bot đọc | **Đổi**: ký ức của từng người, chuyển dữ liệu cũ sang người "chủ"; đọc cả hai nơi trong lúc chuyển |
| 15 | Aris được miễn một số quyền (`policyOf`, quyền ghi) | **Đổi**: miễn trừ theo công tắc `canManageTeam`, không theo tên bot |
| 16 | Bộ não: vai chỉ huy được đọc toàn bộ | **Đổi**: quyền đọc theo bot và người, có cấu hình |
| 17 | `channel_send` luôn gửi từ Telegram của Aris | **Đổi**: gửi từ tài khoản kênh của bot, không có thì chuyển qua tài khoản chung kèm tên bot |
| 18 | Một bản ghi xưng hô dùng chung | **Đổi**: xưng hô theo người |
| 19 | Hạn mức theo phòng ban, phân loại chi phí theo `via` (`team`, `dispatch`) | **Đổi**: theo bản ghi `tasks` và chuỗi; phiên việc của đồng đội tính là việc nền để trần ngày của hàng rào bắt được |
| 20 | Bản ghi cũ trong nhật ký (đội dsh, thẻ, phòng) | **Giữ đọc được** cho thống kê và phát lại |

Giữ nguyên: kho skill và connector chung của đội, trần chi phí cả đội, hàng rào, sao lưu, điểm khôi phục, `/goal` có giám khảo, vòng tự học (đổi đích duyệt), Second Brain, bot ngoài (Claude Code, Codex: tách khỏi gói Commander thành gói riêng).

## 4. Các đợt (bản 2, sau soát lần 2)

Hai công tắc: `threads.v1` theo từng bot (luồng), `teammates.v1` cho cả đội (bot nhờ bot). Bot nhờ nhau xuyên qua hai trạng thái công tắc khác nhau thì phải chạy được.

**9.0 Spike (3–4 ngày, không viết mã sản phẩm).** Đo: thời gian mở lại phiên nguội theo độ dài nhật ký; chen lời khi lượt đang chờ duyệt; lịch hẹn và `/goal` sau sang trang; chi phí mỗi bước theo độ dài ngữ cảnh (chọn ngưỡng sang trang, dự kiến khoảng 100 nghìn token); duyệt bằng tin nhắn Zalo. Kết quả ghi `docs/spikes/gd9-luong-bot.md`. **Điểm dừng 2.**

**9.1a Lát cắt đầu, 2 tuần: "Đồng đội hỏi nhau".** Dựng trên phiên như hôm nay, Commander vẫn chạy, không gỡ gì; người dùng dùng được sớm.
- Mô tả công khai của bot; danh bạ đồng đội nạp vào lời dặn, bọc như dữ liệu trích dẫn.
- Bảng `tasks`; công cụ `ask_teammate` **chỉ chế độ `consult`**, **chỉ trong lượt do chủ đã ghép đôi bắt đầu** (chưa có ký ức theo người thì khách Zalo không được kéo dữ liệu của chủ qua đồng đội).
- Bot được nhờ chạy ở **phiên riêng của aris tạo cho chính bot đó** (không phải bot phụ của dsh: bot phụ tự từ chối duyệt và mượn quyền của bot nhờ); việc gì cần duyệt thì từ chối kèm lời giải thích.
- Giới hạn: độ sâu ≤ 2, ≤ 6 việc mỗi gốc, 0,30 USD mỗi gốc.
- Kết quả tự quay về, có bộ dò lúc khởi động (`outcomeReturnedAt`); bot nhờ chỉ bị đánh thức một lần mỗi lượt.
- Giao diện: chip "Đã nhờ …" và kết quả gấp gọn; thẻ lặng bên bot được nhờ.
- **Gỡ hoặc chặn công cụ đội của dsh cho mọi bot** (hôm nay chặn nằm trong `isCommander`; bỏ chỉ huy mà quên chỗ này thì bot nào cũng lập đội không giới hạn).
- Test giới hạn và kết quả quay về sau khởi động lại. Tắt được bằng một công tắc. Mọi phần dùng lại ở 9.2.

**9.1b Nền: người, luồng, một cửa gửi tin.**
- Bảng `people` (nối danh tính Telegram, Zalo, web) và bảng `threads` (bot, person, kind `direct` | `room` | `customer`, trang hiện tại, trang cũ, trạng thái, kênh gần nhất). Chỉ thêm mới, vẫn ghi song song con trỏ cũ; ghi `person` lên mọi bản ghi mới (tin, ký ức, bài học, đề xuất skill, duyệt, chi phí).
- `threads.send(person, bot, message, origin, receiptSeq)`; số thứ tự đóng trước khi chuyển giọng nói hay tải tệp.
- `notify(person | thread)` thay khoảng 14 chỗ gửi cứng về chat của Aris. **Bot không có tài khoản kênh**: gửi qua tài khoản của bot đang giữ cuộc chat đó, kèm tên bot; chuyển hẳn cho đồng đội thì cuộc chat "dính" bot mới cho tới khi người dùng đổi (mỗi tài khoản kênh hôm nay chỉ có một bot).
- `botOf` không còn trả "aris" cho phiên chưa gắn thẻ.

**9.2 Chờ người bền và ký ức theo người (đường ray an toàn, trước khi mở rộng bot nhờ bot).**
- Duyệt cho phiên việc (hôm nay đường duyệt nền duy nhất là đường đội dsh sắp bỏ): thẻ duyệt về **luồng của người nhờ** và chuông "Cần {you}".
- Duyệt bền kiểu lai (chờ ngắn trong lượt; quá hạn lưu yêu cầu với mã băm tham số, cho qua đúng một lần khi model gọi lại) + **mã chống lặp cho mọi thao tác ra ngoài, kể cả chính `ask_teammate`**.
- **Mức duyệt trong chuỗi = mức thấp hơn giữa người khởi đầu và chính sách của bot được nhờ**; quyền đã cấp không bao giờ được thừa kế.
- Ký ức mặc định riêng của người (chuyển "hồ sơ chủ" sang người "chủ", đọc cả hai nơi trong lúc chuyển); `recall` và tìm kiếm chỉ trong (bot, person).
- Khoá tài nguyên theo bot (máy, thư mục dự án); bận tính theo việc; bỏ ba chế độ khi bận (mặc định chen lời, có nút Dừng).

**9.3 Đồng đội ngang hàng đầy đủ.**
- `ask_teammate` thêm chế độ `work` và `notify`; `hand_off_to_teammate`; mở cho lượt của nhân sự và kênh khi ký ức theo người đã có.
- Giới hạn chuỗi: **một** giới hạn độ sâu (≤ 3), trần số việc mỗi gốc, trần tiền mỗi gốc tính từ sự kiện chi phí; kết quả quay về được miễn giới hạn; bot được nhờ thiếu thông tin thì trả `needs_input` chứ không hỏi ngược lên chuỗi.
- Bỏ đường giao việc qua đội dsh; tắt `giao_viec`, `giao_phong`, `moi_noi`, Driver sau công tắc. Bot ngoài tách thành gói riêng.
- **Aris điều phối trên cơ chế mới**: vai `coordinator` + `canManageTeam`; sổ năng lực (bot × loại việc) ghi từ `tasks`; Aris tự làm, chuyển hẳn, hay nhờ nhiều bot rồi tổng hợp; giữ giới hạn số bot bận cùng lúc (hôm nay 6) ở cấp đội.

**9.4 Việc và sang trang.**
- Routine, `/goal`, ACP, `/ask`, việc của dự án là việc gắn luồng, đăng thẻ kết quả; bỏ nút routine gắn lại cuộc chat Telegram; tự đẩy thành việc khi lượt quá khoảng 2 phút (`start_task`).
- Sang trang bằng phiên mới + tóm tắt; chuyển lịch hẹn, `/loop`, `/heartbeat`, `/goal`, duyệt đang chờ sang trang mới; rút ký ức lúc sang trang; kết quả quay về luồng chứ không về trang cũ.
- Trang theo dõi (chỉ quản trị): trang, việc, chi phí của một luồng, để gỡ lỗi khi người dùng không còn thấy phiên.

**9.5 Giao diện kiểu OpenMausBot.** Theo bản vẽ đã có, cộng các màn còn thiếu (vẽ trước, **Điểm dừng 3**). Bỏ trang Commander, nút "Việc mới", chữ "phiên"; `/new` thành "chủ đề mới".

**9.6 Gỡ đường cũ.** Sau hai tuần chạy thật với công tắc bật cho mọi bot. **Điểm dừng 4** trước khi gỡ.

Sau 9.6 mới tới: máy riêng cho bot, công ty nhiều nhân sự, lên server, nhóm bot, giọng nói, app điện thoại, connector lớn.

**Ước tính (sửa)**: 5–7 tuần chỉ là phần gỡ chỉ huy; **toàn bộ 9.0–9.6 khoảng 12–16 tuần một người**. Lát cắt 9.1a dùng được sau khoảng 2 tuần.

## 5. Rủi ro lớn nhất

1. **Bot nhờ bot chạy trước đường ray an toàn**: vì vậy 9.1a chỉ `consult`, chỉ lượt của chủ, từ chối mọi việc cần duyệt; 9.2 (duyệt bền, chống lặp, ký ức theo người) phải xong trước 9.3.
2. **Ký ức theo người** đụng phần đầu ổn định của lời dặn (cache DeepSeek): thứ tự nạp cố định, phần theo người đặt sau phần chung.
3. **Gửi trùng cho khách** khi thử lại: mã chống lặp có trước khi bật duyệt bền.
4. **Thay đội dsh bằng bản ghi việc** mà vẫn giữ trần tiền, đếm bận và kết quả quay về sau khởi động lại.
5. **Shop chỉ có một tài khoản Zalo**: bot không có tài khoản kênh vẫn phải trả lời được (chuyển qua tài khoản chung, có tên bot).
6. **Khối lượng test vỡ**: toàn bộ test của gói Commander, `hub.test.ts`, ký ức, bot, dự án, thống kê, bộ não, giao diện.

## 6. Điểm dừng

1. ~~Người dùng xác nhận bảng "bỏ hay đổi", vai của Aris, lát cắt 9.1a~~: **đã chốt 31/10**: Aris giữ vai điều phối (biết bot nào hợp việc nào), phần còn lại theo đề xuất.
2. Kết quả spike.
3. Duyệt bản vẽ các màn còn thiếu của 9.5.
4. Trước khi gỡ đường cũ.

## 7. Kiểm tra

Theo `gd8-chung.md`. Thêm: test luật chặn vòng lặp và trần chuỗi; test không gửi trùng khi thử lại; test kết quả việc quay về sau khởi động lại; thử thật một buổi với Telegram và Zalo của người dùng trước Điểm dừng 4.

## 9. Chief của Rakazo thực chất là gì (đọc mã 31/10, chạy thật 1/11)

Chạy thật ngày 1/11 trên app Rakazo cho Mac, máy chủ "This computer" (Docker trên Mac), ảnh `ghcr.io/elie222/rakazo/app:v0.3.6`, model có sẵn `openai-codex / gpt-6-luna` (đăng nhập gói ChatGPT), chế độ duyệt mặc định **Ask**. Thử trong không gian thử "Thu GD9"; mỗi điều dưới đây đối chiếu cả giao diện lẫn bảng dữ liệu (`spaces`, `bots`, `runs`, `messages`, `external_effects`, `computers`). Ảnh từng bước: [`docs/nghien-cuu/rakazo/anh-chay-thu/`](../nghien-cuu/rakazo/anh-chay-thu/).

**Chief là ai**

- **Chief là một bot bình thường**, không có gì đặc biệt trong kiến trúc: tạo lúc onboarding với tên "Chief", lời dặn và mô tả **rỗng** (đã thấy trong dữ liệu: độ dài 0), khoá `spawnKey = "onboarding:first"` (duy nhất theo từng không gian) (`apps/web/src/pages/Onboarding.tsx`). Bot nào cũng có `fleetManagement` mặc định bật (`packages/db/prisma/schema.prisma`), nên Chief tạo được bot khác chỉ vì công tắc này và lời mời của onboarding.
- **Lời chào là thẻ câu hỏi do model sinh**, không phải mẫu cố định: lượt có trigger `created` đăng thẻ "Hi Tuan! What would you like Chief to help with?" với bốn lựa chọn A/B/C/D, lựa chọn đổi theo tên không gian (không gian CSKH được "Draft customer replies", "Analyze CSKH data"), rồi lượt đứng ở `waiting_input` (ảnh 08). Lời chào bằng tiếng Anh dù người dùng nói tiếng Việt.
- **Gõ thẳng thay vì bấm lựa chọn** thì tin gõ được ghi làm câu trả lời của thẻ và chính lượt đang chờ chạy tiếp (ảnh 09, 10).
- **Thẻ chào không ai trả lời thì đúng 24 giờ sau tự dừng**, để lại dòng "Stopped. This was still waiting for an answer." trong luồng (ảnh 03, không gian CSKH tạo 29/10, dừng 30/10).

**Không gian mới có Chief không: CÓ** (sửa kết luận đọc mã hôm 31/10)

- Tạo không gian bằng menu **Create → New private space** thì **2,2 giây sau đã có Chief** (`spawnKey = onboarding:first`) đang "Working…", rồi hiện thẻ chào (ảnh 05–08). Không gian CSKH tạo hôm 29/10 cũng có Chief sau 4 giây.
- Lý do trong mã (bản v0.3.6 và `main` giống nhau): đọc mã hôm 31/10 chỉ thấy lối chuyển tự động (`use-space-roster.ts`, chỉ khi cả tài khoản chưa có gì) mà bỏ sót hai lối khác: hộp thoại tạo không gian xong thì **chuyển thẳng tới `/onboarding`** (`apps/web/src/pages/shell/shell-dialogs.tsx`, `NewSpaceDialog.onDone`), và bấm vào một không gian trống ở thanh bên cũng mở onboarding (`sidebar-roster.tsx`, `openSpaceChat(emptySpaceId, "/onboarding")`). Onboarding tạo Chief cho không gian đó.
- Nghĩa là Chief của không gian mới vẫn do **giao diện** tạo: máy chủ tạo không gian với 0 bot (`apps/api/src/routes/spaces.ts`); không gian tạo qua API hay công cụ `create_space` sẽ trống cho tới khi có người mở nó trong app.

**Nhờ Chief tạo bot mới** (ảnh 09, 10)

- "Tạo giúp anh một bot chăm sóc khách hàng tên Lan…" → Chief gọi `spawn_bot` **không hỏi duyệt** (chế độ Ask), mất 66 giây. Luồng Chief có thẻ `child_bot` "Lan", trả lời bằng tiếng Việt; luồng của Lan mở đầu bằng dòng "Created by Chief"; Lan hiện ngay trong danh bạ thanh bên.
- Chief tự viết **mô tả công khai** ("Chăm sóc khách hàng: trả lời lịch sự bằng tiếng Việt về giá và lịch giao hàng.") và **lời dặn** khoảng 460 ký tự cho Lan (có cả "không tự đoán khi chưa có dữ liệu"); `parentBotId` = Chief.
- Bot con được tạo với **`fleetManagement` bật** (báo cáo đọc mã [kien-truc/6](../nghien-cuu/kien-truc/6-bot-ngang-hang.md) mục 1.6 ghi "tắt, không kế thừa": thực tế bản v0.3.6 để bật).

**Nhắn khi bot đang làm** (ảnh 11–13)

- Nhờ Lan mở VnExpress lấy 3 tiêu đề; trong lúc Lan "Working…" nhắn chen "lấy thêm giờ đăng". Kết quả: **một lượt duy nhất** chứa cả hai tin của người dùng (tin chen không tạo lượt mới); Lan gọi `message_user` báo "Dạ được ạ, em sẽ lấy thêm giờ đăng…" ngay giữa lượt, rồi trả kết quả có giờ đăng. Nút gửi đổi thành nút Dừng khi bot đang làm.

**Màn hình máy của bot** (ảnh 12, 13)

- Nút màn hình ở góc phải mở khung bên: ảnh màn hình nhỏ của máy (Chromium đang mở VnExpress), nhãn "Team Computer", mục "Routines". Lan dùng `browser_navigate` + `browser_snapshot` (trình duyệt qua CDP), không bấm tọa độ; vào trang mới **không hỏi duyệt**.
- **Mỗi không gian một máy chung** (scope `team`, một container `rakazo-bot-team-…`), mọi bot trong không gian dùng chung; máy của các không gian không dùng tới ở trạng thái `suspended` (ngủ).

**Thẻ duyệt** (ảnh 14–16)

- Nhờ Chief sửa lời dặn của Lan → thẻ "Replace the instructions of Lan?" hiện **ngay trong luồng Chief**, kèm độ dài cũ/mới và **toàn văn lời dặn mới**; chỉ có "Allow once" và "Deny" (không có "luôn cho phép"). Lượt đứng ở `waiting_input`, khung chat vẫn gõ được.
- Bấm "Allow once" → thẻ thành "Allowed once", **chính lượt đó chạy tiếp** tới `completed`; thao tác ghi một dòng `external_effects` có mã chống lặp; lời dặn của Lan có thêm một bản lịch sử "Updated by Chief" (hoàn tác được).

**Bài học cho aris**

- Hướng "mỗi không gian có sẵn một Aris" đúng với trải nghiệm Rakazo, và **aris làm ở máy chủ** (tạo không gian là có Aris, kèm lời dặn đầy đủ tiếng Việt, vai `coordinator`, `canManageTeam`), chắc hơn Rakazo (dựa vào giao diện chuyển trang, không gian tạo bằng API thì trống).
- **Lời chào**: soạn bằng tiếng Việt theo cách xưng hô của người dùng; thẻ A/B/C là gợi ý, gõ tự do cũng trả lời được; **không để thẻ chào thành việc "chờ người" có hạn 24 giờ** rồi hiện dòng "đã dừng" (lời chào không phải việc dở).
- **Tạo bot**: Rakazo không hỏi; plan aris để người dùng duyệt từng bot. Đề xuất: giữ duyệt, nhưng thẻ duyệt hiện đủ tên, mô tả công khai, lời dặn, model, skill sẽ gắn (như thẻ sửa lời dặn của Rakazo hiện toàn văn), và tạo xong đăng thẻ bot con vào luồng Aris.
- **Bot con**: `canManageTeam` **tắt** mặc định, kể cả bot do Aris tạo (Rakazo để bật cho cả bot con).
- **Chen lời** và **duyệt chạy tiếp đúng lượt** của Rakazo khớp với 9.2 (duyệt bền, mã chống lặp) và chen lời của dsh; nên thêm việc bot báo "đã nhận" giữa lượt như `message_user`.
- **Máy chung theo không gian** là mặc định hợp lý cho máy riêng của bot sau 9.6.

## 10. Công ty nhiều nhân sự: skill và kết nối riêng (người dùng chốt 1/11)

Công ty host aris, quản trị cấp tài khoản cho nhân sự. Nhân sự tự tạo bot, tự xây skill, tự thêm kết nối; quản trị vẫn quản được tất cả.

- **Chủ sở hữu và mức chia sẻ**: mỗi skill và mỗi kết nối ghi người tạo (`owner`) và mức chia sẻ (`share`): *Riêng tôi* / *Phòng ban* / *Dùng chung công ty*.
- **Quản trị**: xem danh sách và nội dung skill của mọi nhân sự, tắt hay thu hồi; với kết nối thì thấy tên, người tạo, bot nào dùng và thu hồi được, **không bao giờ xem được khoá hay token**.
- **Hai công tắc trên mỗi bot** (mặc định tắt):
  - **Chỉ dùng skill được gán** (`skillsOnlyAssigned`): bật thì bot chỉ dùng skill được gán; tắt thì dùng skill được gán cộng kho skill dùng chung (của công ty, và của phòng ban bot thuộc về).
  - **Chỉ dùng kết nối được gán** (`connectorsOnlyAssigned`): bật thì chỉ dùng kết nối được gán; tắt thì dùng kết nối được gán cộng kết nối dùng chung; cùng một dịch vụ (cùng mục danh mục) thì kết nối được gán thắng kết nối chung.
- **Đưa lên dùng chung**: nhân sự bấm "Đề xuất dùng chung", quản trị duyệt (thẻ trong chat của Aris và Hộp duyệt); skill quét nguy hiểm như khi nhập, kết nối dùng chung thì khoá chuyển thành khoá của công ty.
- **So với hôm nay**: skill đội đang là `bot = '_doi'` + `assigned: 'all' | danh sách` và cộng dồn với skill riêng; kết nối đội có phạm vi cả đội / phòng / bot và cộng dồn. Đổi sang mô hình trên: "dùng chung công ty" thay cho `assigned: 'all'`, gán cụ thể thành danh sách gán của bot, thêm hai công tắc; dữ liệu cũ đọc được (skill đội cũ thành *Dùng chung công ty*, chủ là chủ công ty).
- **Phòng ban = không gian** (như space của Rakazo): ranh giới của bot, chat, ký ức chung, máy, skill và kết nối của phòng; mỗi phòng có Aris riêng, tạo ở máy chủ. Khác Rakazo: nhiều nhân sự, trưởng phòng, ngân sách, máy chung.
- **Một bot một phòng gốc** (Rakazo cũng vậy: `bots.spaceId` bắt buộc, bot nhắn sang không gian khác chỉ khi cả hai bot bật `crossSpaceCommunication`). Ký ức chung, máy, lịch sử việc ở phòng gốc. Bot **chia sẻ được** sang phòng khác hay cho từng người theo mức *xem* / *chat* / *sửa* (học từ OpenMausBot); chat của mỗi người vẫn riêng, ký ức theo người nên không lẫn dữ liệu giữa phòng. Bot cần cho cả công ty đặt ở nhóm **Cả công ty**. Bot nhờ bot phòng khác: công tắc của công ty, mặc định tắt; Aris của công ty luôn nhờ được mọi phòng.
- **Thanh bên nhóm theo phòng** như Rakazo: Aris công ty ghim đầu, rồi các nhóm *Cả công ty* và từng phòng người đó thuộc về, tiêu đề chữ thường, gập mở được; bot được chia sẻ hiện trong nhóm phòng nhận kèm "từ <phòng gốc>". Không có nút chuyển phòng.
- **Bản vẽ**: V17–V25 trên canvas GĐ9 (trang "Đợt 4 · Công ty"); thanh bên nhóm theo phòng ở V1 và V13; chia sẻ sang phòng khác ở V11.
- **Đặt vào đợt**: phần công ty nhiều nhân sự (sau 9.6 theo plan hiện tại); hai công tắc làm được sớm hơn trên một chủ vì chỉ đổi cách tính skill và kết nối của bot.
