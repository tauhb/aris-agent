# Spike GĐ9.4 · Luồng bot: đo trước khi làm "đồng đội hỏi nhau" (1/11/2026)

Đợt 9.4 của lộ trình bản 3 ([plans/gd9-chung.md](../plans/gd9-chung.md)), tức spike 9.0 của plan bản 2 ([plans/gd9-doi-dong-doi.md](../plans/gd9-doi-dong-doi.md) mục 4). Không viết mã sản phẩm. Kết thúc ở **Điểm dừng 2**: người dùng chọn ở cuối tài liệu.

## Cách đo

- **Số liệu**: một bản chép thư mục dữ liệu thật của aris (191 phiên, 1.165 bước gọi model, từ 21/10 tới 1/11). Chỉ đọc con số token, thời gian, chi phí; không đọc nội dung chat.
  - Giá từng loại token suy ra bằng bình phương tối thiểu từ 275 lần gọi đã ghi tiền thật (bảng `calls` của `@aris/stats`).
  - Mã đo: [`gd9-luong-bot/`](gd9-luong-bot/) (`cost.mjs`, `latency.mjs`, `read.mjs`). Chạy: `node cost.mjs <thư mục dữ liệu>`. Cần lệnh `zstd`.
- **Thử thật**: mã nhánh `claude/busy-volta-05wmgj` chạy trên bản chép dữ liệu, model DeepSeek-V4.1-Flash.
  - Bản chép đã gỡ kênh (Telegram, Zalo, Lark), routine và việc tự trị, để không nhận tin thay bản thật.
  - Bản aris đang dùng chạy song song (lần thử thứ hai) hay tắt tạm (lần thử đầu, khoảng 10 phút).
- **Đọc mã**: `@aris/channels` (Telegram, Zalo), `@aris/commander` (hộp duyệt), `@aris/autonomy` (`/goal`, `/loop`), `@deepseek-ai/dsh-schedule`.

## 1. Chi phí mỗi bước theo độ dài ngữ cảnh

Giá suy ra cho `deepseek-flash`, tính trên 1 triệu token: đầu vào 0,30 USD, đọc lại bộ nhớ đệm 0,006 USD, đầu ra 1,20 USD.

| Ngữ cảnh | Số bước | TB ngữ cảnh | Bộ nhớ đệm trúng | TB token ra | USD mỗi bước | USD mỗi bước nếu đệm trượt |
|---|---|---|---|---|---|---|
| 0–20k | 122 | 18k | 79% | 382 | 0,0017 | 0,0058 |
| 20–40k | 736 | 27k | 91% | 505 | 0,0015 | 0,0087 |
| 40–60k | 169 | 48k | 96% | 631 | 0,0016 | 0,0152 |
| 60–80k | 72 | 69k | 97% | 515 | 0,0016 | 0,0212 |
| 80–100k | 36 | 91k | 98% | 425 | 0,0015 | 0,0280 |
| 100–120k | 16 | 109k | 99% | 1.310 | 0,0027 | 0,0344 |
| 120–150k | 12 | 132k | 99% | 467 | 0,0018 | 0,0401 |
| 150–200k | 2 | 155k | 98% | 446 | 0,0023 | 0,0469 |

Kết luận:

- **Nhờ bộ nhớ đệm của DeepSeek, giá mỗi bước gần như không đổi theo độ dài ngữ cảnh**: khoảng 0,0015–0,0027 USD từ 20 nghìn tới 155 nghìn token. Phần lớn tiền là token đầu ra.
- Rủi ro thật là **bộ nhớ đệm trượt**: đổi phần đầu lời nhắc (lời dặn, danh bạ đồng đội, ký ức nạp sẵn) làm mọi bước sau đắt hơn 5–20 lần tuỳ độ dài.
  - Luồng càng dài thì một lần trượt càng đắt (0,047 USD/bước ở 155k).
  - Vì vậy phần nạp theo người, theo đồng đội phải **đặt sau** phần ổn định (đúng rủi ro 2 của plan).
- Ngữ cảnh lớn nhất đã gặp là 157k. Nhóm 100–120k có token ra cao bất thường (1.310) vì vài bước viết dài, không phải do ngữ cảnh.

## 2. Thời gian mỗi bước và mở lại phiên nguội

| Ngữ cảnh | Số bước | Trung vị | p90 |
|---|---|---|---|
| 0–40k | 858 | 2,3 s | 7,5 s |
| 40–80k | 241 | 2,9 s | 8,4 s |
| 80–120k | 52 | 2,6 s | 5,7 s |
| trên 120k | 14 | 2,7 s | 5,5 s |

- Thời gian chờ mỗi bước **không tăng theo độ dài ngữ cảnh**: thời gian đi theo số token ra, không theo token vào (vào chủ yếu là đọc đệm).
- Mở lại phiên nguội:
  - Giải nén và đọc nhật ký phiên lớn nhất (711 bản ghi, 2 MB, nén 613 KB) mất 12 ms; trung vị một phiên có 44 bản ghi. Đọc nhật ký không phải chỗ chậm.
  - Thời gian dsh dựng lại trạng thái phiên trên giao diện chưa đo bằng số, nhưng khi thử thì mở lại các phiên cũ trong bản chép đều tức thì.
  - Lượt đầu tiên sau khi mở lại thì bộ nhớ đệm có thể đã hết hạn: tốn một bước giá "đệm trượt" (0,006–0,047 USD tuỳ độ dài).

## 3. Nhắn chen khi lượt đang chờ duyệt

Thử thật: nhờ Aris khôi phục lời dặn của Hằng về bản 1, thẻ duyệt hiện ra, rồi thử gõ thêm tin (ảnh [`the-duyet-che-o-nhap.jpg`](gd9-luong-bot/the-duyet-che-o-nhap.jpg)).

- **Web: không gõ được.**
  - Khi thẻ duyệt hiện, dsh thu ô nhập về cao 0 px; thẻ duyệt thay chỗ ô nhập cho tới khi bấm cho phép hay từ chối.
  - Rakazo thì khác: lượt đứng ở "chờ người", khung chat vẫn gõ được.
- **Telegram: gõ được.**
  - Tin của chủ đến lúc bot đang chạy (kể cả đang chờ duyệt) đi vào `agent.steer` theo cài đặt mặc định "chèn vào việc" (`hub.ts:1022`).
  - Tin chèn chỉ được đọc ở bước sau, tức là sau khi duyệt xong. Người khác nhắn thì lượt cũ bị huỷ và làm lại.
- **Duyệt không bền**:
  - Hộp duyệt của Telegram (`approvals` trong `hub.ts`) và hộp duyệt chung của Commander đều chờ trong bộ nhớ.
  - aris khởi động lại khi đang chờ là mất yêu cầu, lượt dừng.
  - Xác nhận cần "duyệt bền" (9.7) trước khi mở bot nhờ bot chế độ làm việc.
- Khôi phục lời dặn bằng lời chạy đúng: Hằng lên bản 3, ghi "khôi phục từ bản 1".

## 4. Lịch hẹn, `/goal`, `/loop` sau khi sang trang

- Lịch nhắc của dsh (`dsh-schedule`) gắn với **một phiên**: `create(sessionId, request)`, và có lệnh dừng mọi lịch của một phiên.
- `/goal` (bảng mục tiêu của `@aris/autonomy`) và `/loop`, `/heartbeat` (bảng vòng lặp) đều có khoá là mã phiên.
- Routine thì khác: mỗi lần chạy mở phiên mới, chỉ ghi `sessionId` của lần chạy, không bị sang trang ảnh hưởng.
- **Sang trang không cần sửa dsh.** aris làm được bằng cách, khi mở trang mới:
  1. đọc lịch đang chờ của trang cũ, tạo lại trên trang mới, dừng ở trang cũ;
  2. chép bản ghi mục tiêu và vòng lặp sang khoá của trang mới (đổi `sessionId`), xoá bản cũ;
  3. yêu cầu duyệt đang chờ thì phải bền trước (mục 3), nếu không thì sang trang khi có yêu cầu đang chờ sẽ làm mất yêu cầu.
- Rủi ro: một lịch bắn đúng lúc đang chuyển (trang cũ đã dừng, trang mới chưa tạo). Cách tránh: tạo ở trang mới trước rồi mới dừng trang cũ, kèm mã chống lặp cho lần bắn.

## 5. Duyệt bằng tin nhắn Zalo

- **Chưa có.**
  - Zalo không có nút bấm trong tin. Khi bot cần chủ duyệt, aris nhắn "việc này cần duyệt trên web" rồi để hộp duyệt ở web lo (`zalo/channel.ts:1476`).
  - Người không phải chủ gọi việc cần duyệt thì bị từ chối ngay.
- Muốn duyệt ngay trong Zalo thì phải dùng chữ: bot gửi tóm tắt kèm mã ngắn ("Trả lời: DUYỆT 4821 hoặc BỎ 4821"), chỉ tin của chủ đã ghép đôi mới được tính. Cần duyệt bền (mục 3) và mã chống lặp; làm cùng 9.7.

## Đề xuất

1. **Ngưỡng sang trang: 100 nghìn token như plan, đo theo ngữ cảnh của bước gần nhất.**
   - Giá không phải lý do để sang trang sớm. Lý do là giới hạn ngữ cảnh của model (đã gặp 157k), độ chính xác khi ngữ cảnh dài, và giá một lần đệm trượt tăng theo độ dài.
   - Trang mới bắt đầu từ tóm tắt khoảng 5–10 nghìn token: bước đầu trang mới khoảng 0,003–0,005 USD.
2. **Phần lời nhắc ổn định đặt trước, phần theo người và theo đồng đội đặt sau**, để không làm trượt bộ nhớ đệm. Thêm một test kiểm thứ tự nạp.
3. **Nhắn chen khi chờ duyệt** (chọn ở Điểm dừng):
   - (A) giữ như dsh: phải bấm duyệt hay từ chối trước khi gõ;
   - (B) **đề xuất**: ô nhập vẫn hiện; gõ khi đang chờ duyệt thì coi như từ chối yêu cầu đó, lấy tin vừa gõ làm lý do và chỉ dẫn mới, lượt chạy tiếp. Gần cách Rakazo và Claude Code; cần tự dựng thẻ duyệt ở `conversation.input.dock` thay cho thẻ của dsh;
   - (C) ô nhập vẫn hiện, tin gõ xếp hàng tới sau khi duyệt xong (như Telegram hôm nay).
4. **Duyệt bền và mã chống lặp (9.7) lên trước "bot nhờ bot chế độ làm việc"**: spike xác nhận duyệt hôm nay mất khi khởi động lại.
5. **Duyệt qua Zalo bằng chữ có mã ngắn**: làm cùng 9.7, chỉ cho chủ đã ghép đôi.
6. **Sang trang chuyển lịch, mục tiêu, vòng lặp như mục 4**, làm ở 9.8; không cần sửa dsh.

## Điểm dừng 2: người dùng chọn

- Ngưỡng sang trang 100k (đề xuất) hay số khác?
- Nhắn chen khi chờ duyệt: A, B (đề xuất) hay C?
- Thứ tự tiếp theo: 9.5 Đồng đội hỏi nhau (chỉ chế độ hỏi ý, như plan), hay đưa 9.7 Duyệt bền lên trước?

**Người dùng chốt (1/11):**

- Nhắn chen khi chờ duyệt: **B**. Gõ tin khi đang chờ duyệt thì từ chối yêu cầu đó, lấy tin làm chỉ dẫn mới.
- Thứ tự: **9.7 Duyệt bền lên trước**, 9.5 Đồng đội hỏi nhau làm sau.
- Ngưỡng sang trang: **70% sức chứa ngữ cảnh của model đang dùng, tối đa 200 nghìn token**, sửa được trong Cài đặt (thay cho 100k cứng).
