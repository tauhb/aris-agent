# Đặc tả Commander giao việc (giai đoạn 2, bước 2)

> Dựng trên [aris-bots.md](aris-bots.md) (bot là dữ liệu của aris gắn vào phiên) và Agent Teams của dsh.

## Công cụ `giao_viec` (chỉ Commander)

- Tham số `viec`: tối đa 4 mục, mỗi mục `bot` (tên gọi), `noi_dung` (đủ ngữ cảnh để bot tự làm), `ly_do` (vì sao chọn bot này), `tieu_de` (tuỳ chọn, tên thẻ trên bảng việc).
- Mỗi bot là **một thành viên trong Team của phiên Commander** (`agentTeams`), tên thành viên = tên gọi của bot, nên `@aris/bots` gắn phiên con với bot (tính cách, ký ức, model riêng).
  - Bot chưa có trong đội: tạo thành viên mới (`spawnTeammate`, `fresh`).
  - Bot đã có: nhắn tiếp (`sendMessage`), bot nhớ việc trước trong cùng cuộc.
- Mỗi việc thành một **thẻ trên bảng việc** của Team, gán cho bot (Kanban). Tham số `the` (tuỳ chọn) giao một thẻ có sẵn thay vì tạo thẻ mới: `task-n` (thẻ đã chia, phải sẵn sàng: thẻ nó chờ đã xong) hoặc `c-n` (thẻ người dùng tạo trên Kanban; giao xong thì thẻ của đội thay chỗ). Thẻ sai hoặc đang chờ thì báo trước, không nhắn bot.
- Công cụ trả ngay; Commander đợi bằng `wait_agent` rồi tổng hợp. Câu trả lời của công cụ có mã phiên của từng bot (giao diện vẽ nhánh).
- Giới hạn: tối đa 4 bot mỗi lần, 6 bot chạy cùng lúc; mỗi bot một việc mỗi lần; không giao cho Commander.

## Công cụ `tao_the` (chỉ Commander, bước 3c)

Chia một việc lớn thành tối đa 12 thẻ trên bảng việc của Team, chưa giao ai. Mỗi thẻ có tiêu đề, nội dung, và `sau`: các thẻ phải xong trước (mã `task-n` có sẵn hoặc tiêu đề một thẻ ghi trước trong cùng lần). Sau đó Commander giao từng thẻ sẵn sàng bằng `giao_viec` với `the`.

## Việc lớn của phòng ban: `giao_phong` (chỉ Commander, bước 3d)

- Tham số: `phong` (tên phòng, có hay không chữ "Phòng" đều được), `tieu_de`, `noi_dung` (đủ ngữ cảnh để trưởng nhóm tự chia). Phòng phải có trưởng nhóm.
- aris mở **một phiên mới cho trưởng nhóm** trong cùng workspace với phiên giao (dự án thì nằm trong dự án), đánh dấu là phiên giao việc, rồi gửi bản giao việc. Bản ghi việc lớn ở kho `aris_commander`, bảng `jobs`: phòng, trưởng nhóm, tiêu đề, việc, phiên giao, phiên trưởng nhóm, trạng thái (`running`, `done`, `failed`), báo cáo.
- Trưởng nhóm có ngữ cảnh riêng (`jobContext`): chia việc bằng `tao_the`, giao bằng `giao_viec` **chỉ cho thành viên phòng mình** (giao người ngoài phòng bị từ chối, nêu rõ lý do), tự làm phần nhỏ, cuối cùng trả một báo cáo gọn. Trưởng nhóm được lập đội (`spawn_teammate`) trong phiên việc lớn; Team của phiên đó là bảng việc riêng của phòng.
- Giới hạn: tối đa 3 việc lớn đang chạy cùng lúc.
- **Chốt việc lớn**: đọc thẳng log phiên trưởng nhóm (không đánh thức phiên). Xong khi trưởng nhóm đã xong ít nhất một lượt, có câu trả lời, và phiên trưởng nhóm cùng mọi phiên thành viên của đội đó đều rảnh; câu trả lời cuối của trưởng nhóm là báo cáo. Lượt lỗi thì việc lớn thành `failed`. Xét lại khi trưởng nhóm xong lượt, khi xem danh sách việc lớn, và 5 giây sau khi aris khởi động, nên aris chạy lại giữa chừng vẫn chốt được.
- Chốt xong, báo cáo được gửi vào phiên giao (xếp hàng), Commander đọc và trả lời người dùng.
- `GET /api/aris/commander?jobs=1`: 30 việc lớn gần nhất kèm tiến độ (thẻ xong / tổng thẻ trên bảng việc của trưởng nhóm). Dịch vụ `arisJobs` (`list`, `forWorkspace`, `progressOf`) cho Kanban của dự án.

## Phòng nhóm của dự án: `moi_noi` (chỉ Aris, phiên chính của dự án, bước 3e)

Phiên chính của dự án là phòng chung (bản vẽ `Phong2.dc.html`); Aris điều phối.

- **Mở cuộc bàn**: người dùng nhắn `@all`, gọi `@tên` một hay vài bot, hoặc bảo cả nhóm bàn. Aris gọi `moi_noi` với `bot` (tên gọi, theo thứ tự nói; bỏ trống là mọi thành viên dự án) và `loi_moi` (cần bàn gì ở vòng này). Mỗi lần gọi là **một vòng**; công cụ đợi hết vòng rồi trả các tin cho Aris.
- **Bot nói lần lượt và nghe được nhau**: mỗi bot là một thành viên trong Team của phiên chính (lần đầu tạo, lần sau nhắn tiếp, nên bot nhớ cả cuộc bàn). Lời mời gửi bot chỉ chứa tin mới trong phòng từ lần trước bot nói (người dùng, Aris, đồng đội). Bot trả lời ngắn, có thể hỏi lại bằng `@tên`; không có ý mới thì trả lời `BỎ LƯỢT` (không tính tin). Câu trả lời cuối của lượt bot (đọc từ sự kiện phiên của bot) là tin trong phòng.
- **Luật của dự án**: tối đa `maxRounds` vòng và `maxMessages` tin của các bot cho mỗi tin của người dùng. Hết vòng hoặc hết tin thì công cụ từ chối mở thêm và bảo Aris tổng hợp. Mỗi bot nói tối đa 4 phút.
- **Bot không được mời nói**: không thuộc dự án, đang làm việc khác, đã bị bảo dừng, hết tin: ghi thành dòng ghi chú có lý do.
- **Điều phối** (ngữ cảnh `aris:project` của phiên chính): vòng sau chỉ mời ai bị hỏi lại hoặc còn ý trái nhau; bàn xong thì Aris gộp ý (nếu `arisSummarizes`); cần người dùng chọn hướng thì hỏi bằng `ask_user_question`; việc sinh ra thì chia thẻ bằng `tao_the`.
- **Lệnh dừng**: tin người dùng "dừng @tên" (khi `stopCommand` bật) bỏ bot đó khỏi các vòng sau tới khi được gọi lại, bot đang nói thì bị dừng; "dừng phòng" và nút **Dừng phòng** dừng cả cuộc bàn (bot đang nói bị dừng, công cụ trả về, Aris tóm tắt ngắn). Chỉ tin người dùng gõ (`source.kind = user`) mới tính; ngữ cảnh chạy dsh ghi vai người dùng thì bỏ qua.
- **Lưu trữ**: bảng `rounds` của kho `aris_commander`, khoá theo mã lần gọi công cụ: vòng, số tin đã dùng, ai đang nói, các tin. Đếm vòng và tin của lượt chỉ trong bộ nhớ; vòng đang chạy lúc aris tắt được ghi là đã dừng.
- **Đường máy chủ**: `GET /api/aris/commander?round=<mã lần gọi>` (một vòng), `GET ?room=<phiên>` (trạng thái phòng), `POST {op: 'room-stop', session}`.
- **Giao diện** (`@aris/ui-chat`): mỗi lần gọi `moi_noi` vẽ thành các tin của bot (linh vật, tên · vai · giờ, chữ đậm, `@tên` nổi màu), ghi chú "bỏ lượt" hay lý do không nói, dấu "đang nghĩ" của bot đang nói. Thanh phòng trên ô nhập (chỉ phiên chính): "Vòng 2/3 · 6/10 tin", ai đang nói, bot đã dừng, nút Dừng phòng khi đang bàn hoặc Gửi cả phòng (chèn `@all`). Cột phải của dự án: bot đang nói hiện "đang nghĩ", bot đã nói, bỏ lượt hay bị dừng trong lượt này hiện đúng như vậy; bot chưa được mời hiện trạng thái chung. Lượt xong thì dsh gập phần công cụ (gồm các tin của bot) vào "Xong sau…"; câu trả lời cuối của Aris tóm lại ai nói gì.

## Thẻ tự đánh dấu xong

Khi một thành viên đội kết thúc lượt bình thường (`turn/end` hoàn tất), aris dùng chính agent của thành viên (chủ thẻ, có quyền) đánh dấu xong **thẻ đang làm cũ nhất** nó giữ. Lượt lỗi thì thẻ giữ nguyên. Giả định: mỗi lần giao là một lượt của bot; bot giữ nhiều thẻ thì lần lượt từng thẻ theo thứ tự giao.

## Nhật ký định tuyến

- Bản ghi `plugin:aris/dispatch` trong log phiên Commander: bot, tiêu đề, việc, lý do, phiên của bot, thẻ.
- Kho `aris_commander` (bảng `dispatch`) cho trang 2.5: `GET /api/aris/commander` trả 50 lần giao gần nhất.

## Luật đội

- Chỉ phiên của Commander (phiên chưa gắn bot) dùng được `giao_viec`.
- Bot thường không tự lập đội: `spawn_teammate` bị chặn ở phiên của bot thường (móc `tools/pre-execute`). Bot vẫn nhắn đồng đội được (`send_message`). Trưởng nhóm phòng ban lập Team riêng trong phiên việc lớn (bước 3d).
- Hướng dẫn giao việc (khi nào tự làm, khi nào giao, giao song song hay nối tiếp) là ngữ cảnh động `aris:commander`, chỉ nạp ở phiên của Commander.

## Xếp mức việc: nhỏ, vừa, lớn

Hướng dẫn `aris:commander` bắt Commander xếp việc theo thước đo đếm được, không theo cảm giác:

| | Việc nhỏ | Việc vừa | Việc lớn |
|---|---|---|---|
| Số phần độc lập | 1 | 1 (hoặc vài phần rời, mỗi phần một chuyên môn) | từ 2 trở lên |
| Kỹ năng | Commander tự làm được | đúng chuyên môn một bot | nhiều vai trong cùng một phòng |
| Độ dài | vài bước | một lượt làm việc dài | nhiều lượt, cần tổng hợp |
| Cách làm | tự làm | `giao_viec` (nối tiếp thì `tao_the`) | `giao_phong` |

Luật: lời người dùng là trên hết; đứng giữa hai mức thì chọn mức nhỏ hơn; việc lớn mà không phòng nào đủ chuyên môn thì chia thẻ, giao từng bot; không xếp được thì hỏi lại một câu; khi giao thì nói một câu đã xếp mức nào và vì sao. Để xếp đúng phòng, `<aris-bot>` liệt kê phòng ban kèm việc phòng lo và trưởng nhóm.

Chạy thử thật (24/10): dịch một câu → nhỏ, tự làm; một bài Facebook → vừa, Thơ; chiến dịch ra mắt (nghiên cứu, 5 bài, kịch bản bán) → lớn, phòng Tăng trưởng; tìm hiểu đối thủ rồi viết bài so sánh → vừa, 2 thẻ nối tiếp Minh → Thơ.

## Model của bot

Phiên của bot được giao việc (gắn qua đội) chạy bằng model riêng của bot, nếu có (`@aris/providers` đổi cấu hình gọi ở `agent/request`, trước thứ tự dự phòng). Phiên anh chat thẳng với bot đã chọn model lúc mở nên không bị đè.

## Trạng thái trực tiếp (`@aris/bots`)

Suy từ sự kiện phiên của bot: đang chạy là "đang làm", đang đợi duyệt hoặc câu hỏi là "chờ anh", lượt vừa xong là "xong" hoặc "lỗi" (hiện 30 phút), còn lại "rảnh". Việc gần đây: 30 mục gần nhất (nhận việc, xong, lỗi, chờ anh). Chỉ giữ trong bộ nhớ. `GET /api/aris/bots?live=1`.

## Giao diện

- Trang Phòng ban: thẻ "Việc lớn phòng đang nhận" (tiêu đề, dự án, tiến độ, trạng thái, nút Mở phiên trưởng nhóm).
- Kanban của dự án: việc lớn là một thẻ có nhãn "Phòng X", thanh tiến độ, nằm ở cột Đang làm hoặc Chờ theo trạng thái phiên trưởng nhóm, xong thì sang Xong.
- Thanh bên: trạng thái và việc đang làm của từng bot.
- Sơ đồ 3D, Bản đồ đội: trạng thái thật.
- Cột phải: việc gần đây thật.
- Khung chat: mỗi lần `giao_viec` vẽ các nhánh theo bot (đã nhận → đang làm → xong), bấm để mở phiên của bot.
- Trang Commander (2.5): bot nhận việc, giới hạn, quyết định định tuyến gần đây từ nhật ký.

## Để sau

- `chuyen_giao` (bot nhận việc trả lời thẳng chủ nhân): bước 5, cùng kênh riêng của bot.
- Duyệt ngay trên nhánh: giai đoạn 3 (Hộp duyệt).
- Trần ngân sách mỗi việc: giai đoạn 7.
