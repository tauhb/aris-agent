# Kênh Telegram cho một agent AI: cách aris đã làm

> Tài liệu để dựng lại kênh Telegram của aris trên một ứng dụng khác (ví dụ Tako). Viết theo bản đã chạy thử thật ngày 24/10/2026, gồm cả các lỗi lộ ra khi thử và cách sửa. Không phụ thuộc DeepSeek Harness (dsh): chỗ nào aris dùng dịch vụ có sẵn của dsh, tài liệu ghi là **nền tảng cần cung cấp** và mô tả việc của nó, để bên Tako tự nối vào phần tương ứng.

## Mục lục

1. [Kết quả người dùng thấy](#1-kết-quả-người-dùng-thấy)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Các phần và việc của từng phần](#3-các-phần-và-việc-của-từng-phần)
4. [Nền tảng cần cung cấp](#4-nền-tảng-cần-cung-cấp)
5. [Dữ liệu lưu bền](#5-dữ-liệu-lưu-bền)
6. [Tài khoản bot và token](#6-tài-khoản-bot-và-token)
7. [Ai được nói chuyện: ghép đôi, người lạ, nhóm](#7-ai-được-nói-chuyện-ghép-đôi-người-lạ-nhóm)
8. [Nhận tin: long-polling và hàng đợi bền](#8-nhận-tin-long-polling-và-hàng-đợi-bền)
9. [Cuộc trò chuyện và phiên](#9-cuộc-trò-chuyện-và-phiên)
10. [Đưa tin vào agent, khi agent đang bận](#10-đưa-tin-vào-agent-khi-agent-đang-bận)
11. [Theo dõi lượt và trả lời](#11-theo-dõi-lượt-và-trả-lời)
12. [Định dạng: Markdown sang HTML của Telegram](#12-định-dạng-markdown-sang-html-của-telegram)
13. [Giao bền và khởi động lại](#13-giao-bền-và-khởi-động-lại)
14. [Duyệt hành động và câu hỏi bằng nút](#14-duyệt-hành-động-và-câu-hỏi-bằng-nút)
15. [Ghi âm, ảnh, tệp, trả lời bằng giọng nói](#15-ghi-âm-ảnh-tệp-trả-lời-bằng-giọng-nói)
16. [Lệnh](#16-lệnh)
17. [Bot chủ động nhắn](#17-bot-chủ-động-nhắn)
18. [Trang cài đặt](#18-trang-cài-đặt)
19. [Lỗi đã gặp khi chạy thật và cách sửa](#19-lỗi-đã-gặp-khi-chạy-thật-và-cách-sửa)
20. [Danh sách thử thật](#20-danh-sách-thử-thật)
21. [Để sau](#21-để-sau)

---

## 1. Kết quả người dùng thấy

- Người dùng tạo bot qua @BotFather, dán token vào trang cài đặt của app, bấm "Mã người dùng chính" rồi nhắn mã đó cho bot. Từ đó Telegram của họ là **chủ nhân** của bot.
- Nhắn bot như nhắn người: bot thả 👀 vào tin, hiện "đang gõ…", chữ trả lời **hiện dần trong một tin xem trước**, xong thì thay bằng câu trả lời chốt định dạng đẹp (in đậm, mã, danh sách) và thả 👍.
- Mỗi cuộc trò chuyện Telegram là một phiên của agent, hiện cả trong app (xem lại, nhắn tiếp từ web được).
- Bot cần làm việc có tác động (chạy lệnh ghi ra ngoài, gửi tin…) thì gửi **thẻ duyệt có nút** Cho phép một lần / Từ chối.
- Tắt máy hay app khởi động lại giữa chừng: không mất tin, không trả lời đôi.
- Người lạ nhắn bot: bot im lặng, báo chủ nhân kèm nút cho phép.

## 2. Nguyên tắc thiết kế

1. **Kênh chỉ là một cái cửa.** Mọi trí khôn (model, công cụ, ký ức, quyền) nằm ở agent của app. Kênh chỉ: nhận tin, quyết định ai được nói, đưa tin vào đúng phiên, theo dõi lượt, giao câu trả lời. Thêm Lark, Zalo sau này chỉ là thêm một cửa nữa với cùng khung.
2. **Kiểm tra ở cửa vào, trước khi tin tới model.** Người lạ không tốn token, không chèn lệnh được.
3. **Nhận diện bằng mã số người dùng Telegram**, không bằng @username (username đổi được).
4. **Ghi bền trước, làm sau.** Tin vào ghi vào hàng đợi rồi mới dời vị trí đọc; câu trả lời ghi vào hộp thư ra rồi mới gửi. Tắt máy ở bất kỳ điểm nào cũng khôi phục được.
5. **Mỗi cuộc trò chuyện xử lý nối tiếp, các cuộc chạy song song.**
6. **Không viết lại thứ nền tảng đã có**: tạo phiên, xếp tin cho agent, luồng chữ, duyệt, câu hỏi, kho khoá, tệp đính kèm, nhận giọng nói đều dùng của nền tảng.
7. **Phần quyết định viết thành hàm thuần có kiểm thử** (ai được nói, định dạng, theo dõi lượt), tách khỏi phần gọi mạng.
8. **Token không bao giờ ra khỏi kho khoá**: không trả về giao diện, không ghi log, không nằm trong lỗi.

## 3. Các phần và việc của từng phần

| Phần | Việc |
|---|---|
| `store` | Kho lưu bền: tài khoản bot, người được phép, nhóm, mã ghép đôi, ánh xạ cuộc trò chuyện → phiên, hàng đợi vào, hộp thư ra, cài đặt |
| `access` (thuần) | Tin này có tới bot không, ai đang nói, với quyền gì |
| `telegram/api` | Gọi Bot API: `getMe`, `getUpdates`, `sendMessage`, `editMessageText`, `deleteMessage`, `setMessageReaction`, `sendChatAction`, `getFile`/tải tệp, `sendVoice`, `answerCallbackQuery`, `leaveChat`. Gặp 429 thì chờ đúng `retry_after` rồi thử lại (tối đa 3 lần) |
| `telegram/format` (thuần) | Markdown → HTML của Telegram, chia tin dài, nhận "im lặng" |
| `tracker` (thuần) | Theo sự kiện của phiên: lượt nào chứa tin của kênh, chữ đang viết, câu trả lời khi lượt xong |
| `hub` | Nối mọi thứ: vòng nhận tin, làn theo cuộc trò chuyện, gửi tin vào agent, giao trả lời, duyệt, câu hỏi, lệnh, khôi phục khi khởi động |
| `media` | Ghi âm → chữ, chữ → giọng nói (OGG Opus) |
| `api` | Đường HTTP cho trang cài đặt (chỉ chủ nhân của app gọi được) |
| Công cụ `channel_send` | Cho agent chủ động nhắn tới nơi nhận của chủ nhân |

## 4. Nền tảng cần cung cấp

Kênh cần các dịch vụ sau từ app. Cột phải là thứ aris dùng của dsh, để bên Tako tìm phần tương đương.

| Việc | Aris dùng (dsh) |
|---|---|
| Tạo phiên mới trong không gian làm việc mặc định | `sessionController.create` |
| Lấy agent đang sống của một phiên (mở lại phiên nguội nếu cần) | `sessionController.resolveAgent` |
| Gửi tin làm lượt mới / xếp hàng | `agent.followup(message)` |
| Chèn tin vào việc đang làm | `agent.steer(message)` |
| Dừng việc đang làm | `agent.cancel({ kind: 'user' })` |
| Chèn ngữ cảnh (lời nhắc riêng của nhóm) không thành tin của người dùng | `agent.inject(notice)` |
| Sự kiện lưu bền của phiên: bắt đầu lượt, tin người dùng (kèm mã tin), tin trả lời của agent (theo từng bước), kết thúc lượt (kèm lý do) | `session/event` với `turn/start`, `user/message`, `assistant/message`, `turn/end` |
| Luồng chữ đang viết (từng mảnh) | `agent/assistant-stream` (frame `start`, `chunk` với `text-delta`) |
| Agent xin duyệt một hành động, chờ câu trả lời | sự kiện `approval/request` trả `allowed-once` / `rejected` / `cancelled` / `unavailable` |
| Agent hỏi lại người dùng (có lựa chọn) | sự kiện `user-questions/request` |
| Kho khoá bí mật | `credentials.resolve/set/unset` |
| Lưu ảnh, tệp thành khối đính kèm của tin | `attachments.saveImage/saveFile` |
| Giọng nói → chữ | `speechToText` (SenseVoice chạy trên CPU, cần tải mô hình một lần) |
| Danh mục model và chọn model cho phiên | `sessionController.modelCatalog`, `selectModel` |
| Tên phiên (cho `/sessions`) | truy vấn tiêu đề phiên |
| Lưu trữ bền theo bản ghi | storage domain |

**Lý do của sự kiện kết thúc lượt** cần phân biệt được: xong (`completed`), người dùng dừng (`aborted`), lỗi, và **bị cắt vì app tắt giữa chừng** (`interrupted`). Điểm cuối rất quan trọng, xem [mục 13](#13-giao-bền-và-khởi-động-lại).

## 5. Dữ liệu lưu bền

| Bản ghi | Trường chính |
|---|---|
| **Bot** | mã bot trong app, `tgId`, `username`, tên, **tham chiếu tới token trong kho khoá** (không phải token), `canReadAll` (privacy mode), `offset` (vị trí đọc `getUpdates`), `home` (chat nhận tin chủ động), `voice`, lỗi gần nhất |
| **Người** | `userId` Telegram, tên, username, vai `owner` hoặc `member`, lúc ghép đôi |
| **Nhóm** | `chatId`, tên, `allowed`, `who` (`allowed` hay `everyone`), lời nhắc riêng, lúc đã báo chủ nhân |
| **Mã ghép đôi** | mã, vai, hết hạn |
| **Cuộc trò chuyện** | khoá, bot, `chatId`, chủ đề, `sessionId` hiện tại, lịch sử các phiên |
| **Hàng đợi vào** | mã `<bot>-<update_id>`, bot, nguyên update, trạng thái `queued`/`running`, lúc nhận |
| **Hộp thư ra** | mã, bot, `chatId`, chủ đề, trả lời vào tin nào, **các phần HTML đã chia**, số phần đã gửi, trạng thái `pending`/`sending`, số lần thử, lúc tạo |
| **Cài đặt** | cách xử lý khi bận, chế độ khách, lúc đã báo về từng người lạ |

## 6. Tài khoản bot và token

- Dán token trên trang cài đặt → máy chủ gọi `getMe` để kiểm. Token đã gắn với bot khác của app thì từ chối.
- Lưu token vào kho khoá dưới tên kiểu `TELEGRAM_<BOT>_BOT_TOKEN`; bản ghi bot chỉ giữ tên tham chiếu.
- `getMe` trả `can_read_all_group_messages`. Nếu `false` (privacy mode bật) mà có nhóm được phép, trang cài đặt cảnh báo: Telegram **không giao tin @tên bot thường** trong nhóm, chỉ giao `/lệnh@tên_bot` và tin trả lời vào bot. Hướng dẫn tắt privacy mode qua @BotFather hoặc đặt bot làm quản trị.
- Mỗi tài khoản bot Telegram thuộc đúng một bot của app. Nhiều bot (mỗi bot một tài khoản Telegram) chạy song song, mỗi bot một vòng nhận tin.
- Token sai (401) hoặc nơi khác đang nhận tin bằng cùng token (409): dừng vòng nhận tin của bot đó, ghi lỗi vào bản ghi bot để trang cài đặt hiện.

## 7. Ai được nói chuyện: ghép đôi, người lạ, nhóm

### Vai

| Vai | Có được bằng | Quyền |
|---|---|---|
| Chủ nhân | Nhắn mã ghép đôi loại chủ nhân | Toàn quyền, mọi lệnh, được duyệt hành động |
| Người được phép | Mã ghép đôi loại "người khác" | Chat; lệnh giới hạn (`/new`, `/stop`, `/status`, `/help`, `/whoami`); mọi yêu cầu duyệt bị từ chối |
| Người lạ | — | Bot im lặng; báo chủ nhân tối đa một lần mỗi giờ mỗi người, kèm nút **Cho phép hỏi đáp / Bỏ qua** |

### Mã ghép đôi

- Sinh trên trang cài đặt, bảng chữ dễ đọc (bỏ 0/O, 1/I/L): `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Dùng một lần, hết hạn sau 10 phút.
- Chỉ nhận trong **chat riêng**. Đúng mã thì lưu người đó với vai của mã, trả lời xác nhận. Chủ nhân đầu tiên ghép đôi thì chat riêng đó thành `home` (nơi nhận tin chủ động).

### Quyết định ở cửa vào (hàm thuần `decide`)

Theo thứ tự:

1. Không có người gửi hoặc người gửi là bot → bỏ qua.
2. Lệnh `/lệnh@bot_khác` → bỏ qua.
3. **Chat riêng**: chưa ghép đôi → người lạ; có vai → nhận với vai đó.
4. Kênh phát (channel) → bỏ qua.
5. **Nhóm**: chỉ xử lý khi tin **gọi bot này**:
   - có `@tên_bot` (thực thể mention), hoặc `text_mention` trỏ tới bot;
   - hoặc trả lời vào tin của chính bot;
   - hoặc `/lệnh@tên_bot`.
   Tin @ một bot khác (username Telegram của bot luôn tận cùng bằng `bot`) thì bỏ qua, kể cả khi nó trả lời vào tin của bot này. Nhờ vậy nhiều bot của app cùng nhóm không chen nhau.
6. Bỏ `@tên_bot` khỏi chữ trước khi đưa cho model.
7. Nhóm chưa được phép: nếu bật **chế độ khách** và tin @ đích danh bot thì nhận với quyền khách; không thì báo chủ nhân (kèm nút **Cho phép nhóm / Rời nhóm**) và im lặng.
8. Nhóm được phép: người có vai → nhận với vai đó; nhóm đặt "mọi thành viên" → nhận với quyền người được phép; còn lại bỏ qua.

### Nhóm

- Bot được thêm vào nhóm (`my_chat_member`): lưu nhóm, nếu chưa được phép thì báo chủ nhân kèm nút.
- Trong nhóm, tin đưa cho model có tiền tố người nói: `[Tên @username] nội dung`.
- Người không phải chủ nhân: thêm dòng nhắc vào tin gửi model "Người này không phải người dùng chính: chỉ trả lời câu hỏi, không làm việc có tác động như gửi tin, sửa tệp, chạy lệnh." (Nút duyệt vẫn chặn cứng, dòng nhắc chỉ để model khỏi thử.)
- Lời nhắc riêng của nhóm: chèn làm ngữ cảnh (không thành tin của người dùng) mỗi lượt của nhóm.
- **Im lặng chủ động** trong nhóm: câu trả lời cuối đúng bằng `[SILENT]`, `silent`, `NO_REPLY` hoặc `no reply` (không phân biệt hoa thường) thì không gửi gì.
- Diễn đàn có chủ đề (forum topic): mỗi chủ đề một phiên riêng; trả lời luôn kèm `message_thread_id`.
- Trong nhóm, câu trả lời gửi dạng trả lời vào tin của người gọi; trong chat riêng thì không.

## 8. Nhận tin: long-polling và hàng đợi bền

Vòng nhận tin cho mỗi bot:

```
lặp tới khi dừng:
  updates = getUpdates(offset = bản ghi bot.offset, timeout = 25 giây,
                       allowed_updates = [message, callback_query, my_chat_member])
  với mỗi update u:
    ghi hàng đợi vào { id: "<bot>-<u.update_id>", update: u, state: queued }   ← trước
    lưu bot.offset = u.update_id + 1                                           ← sau
    xếp u vào làn của cuộc trò chuyện
  lỗi 401/409: ghi lỗi, dừng bot
  lỗi khác: chờ lùi dần 1 giây, gấp đôi, tối đa 30 giây
```

- **Ghi hàng đợi trước, dời offset sau**: tắt máy ở giữa thì lần sau Telegram giao lại, và mã `<bot>-<update_id>` trùng nên không xử lý hai lần.
- **Làn**: mỗi cuộc trò chuyện (khoá ở mục 9) một chuỗi Promise; tin của cùng cuộc chạy nối tiếp, các cuộc chạy song song.
- Xử lý một update xong mà tin **không** vào agent (lệnh, người lạ, ghép đôi…) thì xoá khỏi hàng đợi ngay. Tin đã vào agent thì đánh dấu `running` và **giữ trong hàng đợi tới khi lượt trả lời xong** (xem mục 13).

## 9. Cuộc trò chuyện và phiên

- Khoá: `tg:<mã tài khoản bot>:<mã chat>[:<chủ đề>]`. Có mã tài khoản bot nên hai bot không bao giờ dùng chung phiên.
- Chưa có phiên thì tạo trong không gian làm việc mặc định (chat riêng của app); phiên hiện bình thường trong app, tên phiên do app đặt như mọi phiên khác.
- Mở lại phiên cũ lỗi (đã xoá…) thì ghi log và mở phiên mới.
- `/new` mở phiên mới cho cuộc trò chuyện; `/sessions` liệt kê các phiên đã có (giữ trong `history`); `/resume <số>` quay lại.

## 10. Đưa tin vào agent, khi agent đang bận

1. Dựng nội dung: chữ (kèm tiền tố người nói trong nhóm, dòng nhắc giới hạn quyền) + khối ảnh/tệp + chữ chép từ ghi âm.
2. Nếu tin được làm lại sau khi khởi động (mục 13): trả lời trước một dòng "♻️ aris vừa khởi động lại giữa chừng, đang làm tiếp tin này."
3. Lấy agent của phiên; nếu nhóm có lời nhắc riêng thì chèn làm ngữ cảnh.
4. Tạo tin (có mã) và **báo trước cho tracker** "tin mã X thuộc kênh, cuộc trò chuyện Y, tin Telegram Z".
5. Theo cách xử lý khi bận (chọn trên trang cài đặt):
   - agent rảnh → `followup`;
   - đang bận và chọn **chèn vào việc** (mặc định) → `steer`;
   - đang bận và chọn **dừng và làm mới** → `cancel` rồi `followup`;
   - đang bận và chọn **xếp hàng** → `followup`.
6. Đánh dấu hàng đợi `running`, thả 👀 vào tin, bắt đầu "đang gõ…" (gửi `typing` mỗi 4,5 giây tới khi lượt xong).

## 11. Theo dõi lượt và trả lời

### Tracker (hàm thuần)

- `turn/start`: mở lượt mới cho phiên, rỗng.
- `user/message` có mã trùng tin đã báo trước: gắn tin đó vào lượt đang mở (một lượt có thể chứa nhiều tin của kênh: tin chèn, tin gửi lúc app tắt).
- `assistant/message`: lấy phần chữ của tin, **thêm vào danh sách đoạn trả lời của lượt** (không thay thế). Xoá chữ đang viết của bước đó.
- `turn/end`: nếu lượt chứa tin của kênh thì trả `{ các tin của kênh, chữ = mọi đoạn nối bằng dòng trống, lý do }`.
- Lượt không chứa tin của kênh (người dùng gõ trên web vào cùng phiên) thì **không** gửi ra Telegram.

> Bài học: bản đầu chỉ giữ đoạn **cuối**. Lượt có nhiều bước (viết một đoạn, gọi công cụ, viết tiếp) và lượt có tin chèn giữa chừng đều mất các đoạn trước trong bản chốt. Phải giữ **mọi** đoạn theo thứ tự.

### Chữ hiện dần

- Từ luồng chữ: frame `start` (mỗi lần gọi model) mở chữ đang viết mới; frame `chunk` loại `text-delta` cộng dồn. Bỏ qua phần suy nghĩ (`reasoning-delta`).
- Chữ hiện = **các đoạn đã chốt của lượt + chữ đang viết**, nối bằng dòng trống. (Không thì khi bot viết sang bước mới, phần đã trả lời biến mất khỏi tin xem trước.)
- Chưa đủ 20 ký tự thì chưa hiện.
- Một tin xem trước cho mỗi phiên: lần đầu `sendMessage` (không rung chuông, `disable_notification`), sau đó `editMessageText`, tối đa mỗi 1,2 giây, cuối có ký tự `▌`. Tin xem trước là chữ thường, cắt ngắn nếu quá dài.
- **Lưu lại Promise của lần gửi đang chạy.** Khi lượt xong: huỷ hẹn giờ, **chờ lần gửi đang chạy xong** (để có mã tin), rồi mới `deleteMessage`.

> Bài học: lượt xong đúng lúc tin xem trước đang trên đường gửi thì chưa có mã tin để xoá, tin xem trước "4 ạ. Mẹo: **để điện ▌" bị sót lại cạnh bản chốt.

### Giao câu trả lời khi lượt xong

1. Dừng "đang gõ", xoá tin xem trước (như trên).
2. **Lý do `interrupted` (app tắt giữa lượt): dừng ở đây.** Không báo lỗi, không xoá hàng đợi; tin sẽ được làm lại khi app chạy lên.
3. Xoá các tin của lượt khỏi hàng đợi vào.
4. Thả cảm xúc vào các tin của lượt: 👍 nếu xong, 😢 nếu không. (Telegram chỉ cho một bộ emoji cảm xúc cố định; ✅ ❌ không nằm trong bộ.)
5. Chữ rỗng: `aborted` → "Đã dừng việc này."; lỗi → "Bot gặp lỗi: <lý do>"; xong mà rỗng → không gửi.
6. Trong nhóm mà câu trả lời là "im lặng" → không gửi.
7. Đổi sang HTML và chia phần (mục 12), **ghi hộp thư ra**, rồi gửi (mục 13). Câu trả lời chốt có rung chuông.
8. Bật trả lời bằng giọng nói, chat riêng, chủ nhân → gửi thêm tin giọng nói (mục 15).

## 12. Định dạng: Markdown sang HTML của Telegram

- Dùng `parse_mode: HTML` (ít ký tự phải thoát hơn MarkdownV2). Thoát `&`, `<`, `>` trong chữ.
- Hỗ trợ: in đậm `<b>`, nghiêng `<i>`, gạch `<s>`, mã `<code>`, khối mã `<pre><code class="language-x">`, link `<a href>`, trích dẫn `<blockquote>`, tiêu đề → in đậm, danh sách → dòng có `•` hoặc số.
- Tắt xem trước link (`link_preview_options.is_disabled`).
- **Bảng**: Telegram không có bảng. **Mọi bảng thành danh sách theo dòng**: ô đầu in đậm sau dấu `•`, mỗi ô sau một dòng "Tên cột: nội dung" (ô rỗng bỏ qua). Mục nhiều dòng thì cách nhau một dòng trống.

> Bài học: bản đầu đổi bảng lớn thành khối chữ thẳng cột (`<pre>` với `│`, `┼`). Trên điện thoại khối này gãy dòng, không đọc được. Luôn dùng danh sách.

- **Chia tin dài**: giới hạn của Telegram là 4.096 ký tự; chia ở khoảng 3.800 ký tự theo khối (đoạn, khối mã, danh sách). Khối mã dài quá thì chia theo dòng và **giữ thẻ mở/đóng** `<pre><code>` ở mỗi phần.
- Gửi HTML bị Telegram từ chối (400 lỗi phân tích thực thể) thì gửi lại dạng chữ thường (bỏ thẻ, giải thoát ký tự).

## 13. Giao bền và khởi động lại

### Hộp thư ra

```
ghi { chunks, sent: 0, state: pending, attempts: 0 }      ← trước khi gửi
với mỗi phần i từ sent:
  ghi state = sending
  sendMessage(phần i)                                      (phần đầu trả lời vào tin của người gọi nếu ở nhóm)
  ghi sent = i + 1
xong: xoá bản ghi
```

### Khi app chạy lên (`recover`)

1. Hộp thư ra: bản ghi quá 3 lần thử hoặc quá 24 giờ thì bỏ. Còn lại gửi tiếp từ phần `sent`; nếu đang `sending` (tắt đúng lúc gửi) thì phần đó gửi lại kèm dòng đầu "♻️ Câu trả lời khôi phục sau khi khởi động lại, có thể trùng."
2. Hàng đợi vào: mọi tin còn lại xếp lại vào làn; tin đang `running` (đã vào agent mà chưa có trả lời) được làm lại kèm dòng báo khởi động lại.

### Tắt giữa lượt

Khi app tắt lúc agent đang làm, nền tảng kết thúc lượt với lý do `interrupted`. Kênh **phải bỏ qua** lượt đó: không báo lỗi, không xoá hàng đợi. Nếu không, tuỳ thời điểm tắt, người dùng nhận "Bot gặp lỗi: interrupted" và tin bị đánh dấu đã xong nên không được làm lại.

> Kết quả thử thật: tắt app, gửi hai tin, bật lại → hai tin vào cùng một lượt, một câu trả lời đầy đủ. Khởi động lại giữa lúc bot đang viết bài → tin được làm lại, chỉ một bài, không báo lỗi, không sót tin xem trước. Phía app, tin của người dùng hiện hai lần trong phiên (lần bị cắt và lần làm lại), đây là cái giá của việc làm lại.

## 14. Duyệt hành động và câu hỏi bằng nút

### Duyệt

- Nghe yêu cầu duyệt của nền tảng. Phiên không thuộc kênh thì bỏ qua (để người trả lời khác lo, ví dụ giao diện web).
- Người gọi lượt không phải chủ nhân → từ chối ngay.
- Gửi thẻ cho chủ nhân (có rung chuông): công cụ, lệnh hoặc tệp, lý do; nút **Cho phép một lần / Từ chối**. Dữ liệu nút ngắn (giới hạn 64 byte của `callback_data`): `ap:<mã yêu cầu>:y` và `ap:<mã yêu cầu>:n`.
- Bấm nút: kiểm người bấm là chủ nhân (người khác bấm thì báo "Chỉ người dùng chính bấm được."; riêng nút trả lời câu hỏi thì ai trong cuộc cũng bấm được), `answerCallbackQuery`, sửa thẻ ghi kết quả và bỏ nút, trả `allowed-once` hoặc `rejected`.
- 10 phút không ai bấm → `unavailable` (nền tảng chặn hành động: mặc định từ chối).

### Câu hỏi của agent

- Mỗi lựa chọn một nút, thêm nút **✏️ Khác (gõ trả lời)**. Câu hỏi nhiều lựa chọn: bấm chọn (đánh dấu) rồi **Xong**.
- Câu hỏi mở hoặc bấm "Khác": tin chữ kế tiếp trong cuộc trò chuyện là câu trả lời (không thành tin mới cho agent).

### Các nút khác dùng chung cơ chế

`pa:<id>` / `px:<id>` cho phép hoặc bỏ qua người lạ; `ga:<chat>` / `gl:<chat>` cho phép hoặc rời nhóm; nút chọn model của `/model`.

## 15. Ghi âm, ảnh, tệp, trả lời bằng giọng nói

- **Ghi âm** (`voice`, `video_note`): tải tệp → ffmpeg đổi sang WAV mono 16 kHz → nhận giọng nói → chữ, đưa vào tin dạng "🎙️ (ghi âm) <chữ>". Giới hạn 120 giây xử lý.
  - Bộ nhận giọng nói chưa chuẩn bị (chưa tải mô hình) thì báo tiếng Việt kèm cách bật, **không** đưa nguyên lời báo tiếng Anh của thư viện. Lỗi khác báo "Chưa nghe được ghi âm: <lý do>".
- **Ảnh**: lấy bản lớn nhất trong `photo` → lưu thành khối ảnh của tin. Chữ chú thích (`caption`) là phần chữ của tin.
- **Tệp** (`document`, `audio`): tối đa 20 MB (giới hạn tải của Bot API); lớn hơn thì báo gửi qua web.
- **Trả lời bằng giọng nói** (`/voice on`, chỉ chủ nhân, chat riêng): bỏ ký hiệu Markdown, bỏ khối mã và bảng, cắt 2.000 ký tự → `say` của macOS → ffmpeg sang OGG Opus → `sendVoice`, gửi sau bản chữ.

## 16. Lệnh

| Lệnh | Việc | Ai dùng |
|---|---|---|
| `/start`, `/help` | Danh sách lệnh theo vai | Người được phép trở lên |
| `/whoami` | Vai, mã người dùng, mã chat | Người được phép trở lên |
| `/new` | Phiên mới | Người được phép trở lên |
| `/stop` | Dừng việc đang làm | Người được phép trở lên |
| `/status` | Phiên (tên, mã), model, rảnh/đang làm, cách xử lý khi bận | Người được phép trở lên |
| `/model` | Chọn model bằng nút: nhà cung cấp → model, 8 model mỗi trang | Chủ nhân |
| `/sessions`, `/resume <số>` | Các phiên của cuộc trò chuyện, quay lại một phiên | Chủ nhân |
| `/sethome` | Chọn chat này làm nơi nhận tin chủ động | Chủ nhân |
| `/voice on\|off` | Trả lời kèm giọng nói | Chủ nhân |

Người không đủ quyền gõ lệnh của chủ nhân thì nhận "Lệnh này chỉ người dùng chính dùng được." Khi thêm bot, đăng ký menu lệnh với Telegram (`setMyCommands`) chỉ gồm các lệnh ai cũng dùng được; lệnh của chủ nhân vẫn gõ tay được.

## 17. Bot chủ động nhắn

Công cụ `channel_send` cho agent gửi tin tới `home` của bot (chat chọn bằng `/sethome`, mặc định là chat riêng của chủ nhân đầu tiên). Dùng cho báo cáo định kỳ, nhắc việc. Đi qua hộp thư ra như câu trả lời thường.

## 18. Trang cài đặt

- **Telegram**: trạng thái (đang chạy / lỗi), nút **Thêm bot Telegram** (dán token), cảnh báo privacy mode, gỡ bot.
- **Ghép đôi thiết bị mới**: nút **Mã người dùng chính** và **Mã cho người khác**, hiện mã kèm đồng hồ hết hạn.
- **Đã ghép đôi**: danh sách người, vai, thu hồi.
- **Nhóm**: danh sách nhóm đã gặp; cho phép; ai được gọi bot; lời nhắc riêng; công tắc **chế độ khách**.
- **Khi đang bận**: chèn vào việc / xếp hàng / dừng và làm mới.
- Đường HTTP của trang chỉ cho chủ nhân của app (đã đăng nhập) gọi. Không bao giờ trả token.

## 19. Lỗi đã gặp khi chạy thật và cách sửa

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Tin đầu chỉ có đoạn cuối, cụt ý; nhắn chen mấy câu thì bản chốt chỉ trả lời câu cuối (lúc hiện dần thì thấy đủ) | Tracker giữ đúng một biến "chữ cuối" | Giữ danh sách mọi đoạn trả lời của lượt; tin xem trước cũng nối các đoạn đã chốt |
| Bảng thành khối chữ có `│ ┼` gãy dòng trên điện thoại | Bảng lớn đổi sang `<pre>` thẳng cột | Mọi bảng thành danh sách "ô đầu in đậm, tên cột: nội dung" |
| Tin xem trước có `▌` sót lại cạnh bản chốt | Lượt xong khi lần gửi tin xem trước chưa trả về mã tin | Lưu Promise lần gửi; khi dọn thì chờ nó xong rồi mới xoá |
| Có thể nhận "Bot gặp lỗi: interrupted" và tin không được làm lại | Lượt bị cắt vì app tắt bị coi như lỗi thường, hàng đợi bị xoá | Lý do `interrupted` thì bỏ qua lượt, giữ hàng đợi để làm lại |
| Ghi âm báo "Prepare the local speech provider before recording" | Bộ nhận giọng nói chưa tải mô hình; lời báo tiếng Anh của thư viện | Nhận diện lời báo, trả lời tiếng Việt kèm cách chuẩn bị |
| (Không phải lỗi) Lệnh chỉ đọc như `ls ~/Desktop` chạy không xin duyệt | Phiên ở mức "ghi trong thư mục làm việc": đọc mọi nơi, chỉ hỏi khi ghi ra ngoài hoặc dùng mạng | Thử nút duyệt bằng lệnh ghi ra ngoài thư mục làm việc |

Ba lỗi đầu đều có kiểm thử: bỏ bản sửa thì kiểm thử báo lỗi.

## 20. Danh sách thử thật

1. Dán token, ghép đôi chủ nhân; trang cài đặt hiện bot đang chạy, người đã ghép đôi.
2. Nhắn thường: 👀, "đang gõ…", chữ hiện dần trong **một** tin, bản chốt định dạng đẹp, 👍; phiên mới hiện trong app.
3. Câu hỏi khiến bot gọi công cụ rồi viết tiếp: bản chốt có **đủ** các đoạn.
4. "Nhớ là…", rồi `/new` và hỏi lại: phiên mới nhớ đúng.
5. Bảng lớn: thành danh sách dễ đọc.
6. Ảnh kèm câu hỏi; ghi âm (khi chưa và khi đã chuẩn bị giọng nói).
7. Lệnh ghi ra ngoài thư mục làm việc: thẻ duyệt có nút; bấm Từ chối rồi thử lại bấm Cho phép.
8. Gửi yêu cầu dài rồi nhắn chen: tin chen được đưa vào việc đang làm, bản chốt trả lời đủ.
9. `/status`, `/help`, `/model`, `/new`, `/sessions`, `/resume`, `/stop`.
10. Tắt app, gửi hai tin, bật lại: trả lời đúng một lần.
11. Khởi động lại giữa lúc bot đang viết: một bài, không trùng, không sót tin xem trước, không báo lỗi.
12. Người lạ nhắn: bot im lặng, chủ nhân nhận thẻ có nút.
13. Thêm bot vào nhóm: chủ nhân nhận thẻ; cho phép rồi @ bot trong nhóm thì trả lời vào tin; tin @ bot khác thì bot này im.

## 21. Để sau

- Webhook thay long-polling khi chạy trên server.
- Tệp lớn hơn 20 MB (Bot API chạy cục bộ).
- Chủ đề riêng trong chat 1-1.
- Mỗi bot của app một tài khoản Telegram riêng, bot nhận việc trả lời thẳng người dùng (aris làm ở giai đoạn 2, bước 5).
- Lark, Zalo dùng cùng khung (cửa vào, hàng đợi, tracker, hộp thư ra).
