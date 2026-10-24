# Đặc tả kênh Telegram (giai đoạn 1, bước 4)

> Viết bằng lời của aris từ [phan-tich-kien-truc.md](../phan-tich-kien-truc.md) mục 6.1–6.2, màn 6.3 của canvas và bảng so sánh với gateway Telegram của Hermes (chỉ đọc tài liệu, xem [clean-room-log.md](../clean-room-log.md)). Không sao chép mã Hermes.

## Gói

Một gói máy chủ **`@aris/channels`** gồm các phần tách theo tệp, để thêm Lark/Zalo sau chỉ cần thêm một cổng:

| Phần | Việc |
|---|---|
| `store` | Kho `aris_channels` (storage domain của dsh, mỗi bản ghi một tệp): tài khoản bot, người được phép, nhóm, mã ghép đôi, ánh xạ cuộc trò chuyện → phiên, hàng đợi vào, hộp thư ra |
| `access` | Quyết định thuần (có kiểm thử): ai được nói, trong nhóm có được gọi không, quyền lệnh |
| `telegram/*` | Gọi Bot API, nhận tin (long-polling), đổi Markdown sang định dạng Telegram, chia tin dài |
| `dispatch` | Cửa vào duy nhất: hàng đợi bền, ánh xạ phiên, trả lời hiện dần, giao bền |
| `answerers` | Duyệt hành động và câu hỏi của bot bằng nút bấm |
| `media` | Ghi âm → chữ, ảnh, tệp, trả lời bằng giọng nói |
| `api` | Đường `/api/aris/channels` cho trang 6.3 |

Các phần cốt lõi của dsh được dùng lại, không viết lại: tạo phiên đúng workspace và preset như web (`ctx.sessionController.create`), lấy agent sống (`resolveAgent`), xếp tin (`agent.followup`), chèn vào việc đang làm (`agent.steer`), dừng (`agent.cancel`), luồng chữ (`agent/assistant-stream`), duyệt (`approval/request`), câu hỏi (`user-questions/request`), kho khoá (`ctx.credentials`), tệp đính kèm (`ctx.attachments`), ghi âm → chữ (`ctx.speechToText`), danh mục model (`sessionController.modelCatalog`, `selectModel`).

## Tài khoản bot

- Mỗi tài khoản bot Telegram thuộc **đúng một** bot của aris (trừ bot ngoài). Aris là cửa vào chính; các bot khác có kênh riêng (giai đoạn 2, bước 5).
- Anh dán token trên trang 6.3. Máy chủ gọi `getMe` để kiểm tra; token đã gắn với bot aris khác thì từ chối. Token lưu trong kho khoá của dsh (`TELEGRAM_<BOT>_BOT_TOKEN`), không bao giờ trả về giao diện.
- `getMe` còn cho biết bot có đọc được mọi tin trong nhóm không (privacy mode). Nhóm được phép mà privacy mode đang bật thì trang 6.3 cảnh báo và hướng dẫn tắt (hoặc đặt bot làm quản trị), vì khi bật, Telegram **không giao tin @tên bot thường** trong nhóm, chỉ giao lệnh `/lệnh@tên_bot` và tin trả lời vào tin của bot.

## Ai được nói chuyện

Nhận diện bằng **mã số người dùng Telegram**, không bằng @username.

| Vai | Có được bằng | Quyền |
|---|---|---|
| Chủ nhân | Nhắn mã ghép đôi (sinh trên 6.3, dùng một lần, 10 phút) | Toàn quyền, mọi lệnh |
| Người được phép | Mã ghép đôi loại "người được phép" | Chat; lệnh giới hạn (`/new`, `/stop`, `/status`, `/help`, `/whoami`); bot không được làm hành động có tác động (duyệt luôn bị từ chối) |
| Người lạ | — | Bot im lặng; báo chủ nhân (tối đa một lần mỗi giờ cho mỗi người lạ) kèm nút **Cho phép / Bỏ qua** |

Kiểm tra nằm ở cửa vào, trước khi tin tới model: người lạ không tốn token, không chèn lệnh được.

## Nhóm

- **Nhóm được phép** (theo mã nhóm). Bot được thêm vào nhóm lạ: im lặng, nhắn riêng cho chủ nhân nút **Cho phép nhóm / Rời nhóm**.
- Trong nhóm được phép, bot chỉ xử lý tin khi: có `@tên_bot` (thực thể mention), trả lời vào tin của chính bot, hoặc `/lệnh@tên_bot`. Tin @ bot khác thì bỏ qua: hai bot aris cùng nhóm không chen nhau.
- **Ai được gọi bot** trong nhóm, chọn theo nhóm: *chỉ người được phép* (mặc định) hoặc *mọi thành viên* (người ngoài danh sách chỉ được hỏi đáp, như "người được phép").
- **Chế độ khách** (tắt mặc định): nhóm lạ vẫn được trả lời khi @ đích danh, quyền như người lạ được hỏi đáp; mỗi lần @ là một lượt riêng.
- **Lời nhắc riêng cho nhóm**: một đoạn hướng dẫn gắn với nhóm, đưa vào ngữ cảnh mỗi lượt của nhóm.
- **Chủ đề (forum topic)**: mỗi chủ đề một phiên riêng.
- **Im lặng chủ động**: trong nhóm, nếu câu trả lời cuối của bot đúng bằng `[SILENT]` hoặc `NO_REPLY` thì không gửi gì.

## Cuộc trò chuyện → phiên

- Khoá cuộc trò chuyện `tg:<mã tài khoản bot>:<mã chat>[:<chủ đề>]`. Có mã tài khoản bot nên hai bot không bao giờ dùng chung phiên.
- Chat riêng mở phiên trong **workspace chat riêng** (`@aris/home`); nhóm cũng vậy trừ khi nhóm được gắn với một dự án.
- `/new` mở phiên mới; `/sessions` liệt kê các phiên của cuộc trò chuyện này, `/resume <số>` quay lại một phiên (nhiều phiên trong một chat).
- Tên phiên do dsh đặt như trên web; phiên hiện bình thường trong app.

## Hàng đợi và khi đang bận

- Tin vào được ghi vào **hàng đợi bền** trước khi xử lý; vị trí đọc (`offset`) lưu sau khi ghi. Tin lặp (cùng `update_id`) bị bỏ.
- Mỗi cuộc trò chuyện xử lý nối tiếp, các cuộc chạy song song.
- Nhắn thêm khi bot đang làm (chọn trên 6.3, như canvas): **chèn vào việc** (`steer`, mặc định), **xếp hàng** (`followup`), **dừng và làm mới** (`cancel` rồi gửi tin mới).
- Khởi động lại: tin chưa xong được làm tiếp, kèm một dòng báo "aris vừa khởi động lại, đang làm tiếp".

## Trả lời

- Thả 👀 vào tin của anh khi bắt đầu, 👍 khi xong, 😢 khi lỗi (Telegram chỉ cho một bộ emoji cảm xúc cố định, không có ✅ ❌). Kèm "đang gõ…".
- Chữ hiện dần: một tin xem trước được sửa dần (không rung chuông), xong thì xoá tin xem trước và gửi câu trả lời cuối (rung chuông). Chỉ câu trả lời cuối, thẻ duyệt và câu hỏi mới rung chuông.
- Câu trả lời gồm **mọi đoạn trả lời của lượt** theo thứ tự (viết, gọi công cụ, viết tiếp; tin chèn giữa lượt), không chỉ đoạn cuối. Tin xem trước cũng nối các đoạn đã chốt với đoạn đang viết; lượt xong khi tin xem trước còn đang gửi thì đợi có mã tin rồi xoá.
- Lượt kết thúc vì aris tắt giữa chừng (`interrupted`): không báo lỗi, giữ tin trong hàng đợi để làm lại khi chạy lên.
- Markdown → HTML của Telegram: in đậm, nghiêng, mã, khối mã, link, trích dẫn, danh sách. **Bảng**: luôn đổi thành danh sách theo dòng (ô đầu in đậm, "tên cột: nội dung"); khối chữ thẳng cột gãy dòng trên điện thoại nên không dùng. Tin dài hơn 4.096 ký tự thì chia ở chỗ xuống dòng.
- **Giao bền**: câu trả lời cuối ghi vào hộp thư ra trước khi gửi. Máy tắt lúc chưa gửi: lần sau gửi lại. Tắt đúng lúc đang gửi: gửi lại kèm ghi chú "♻️ có thể trùng". Tối đa 3 lần, trong 24 giờ.

## Lệnh

| Lệnh | Việc | Ai dùng |
|---|---|---|
| `/start`, `/help` | Giới thiệu, danh sách lệnh | Mọi người được phép |
| `/whoami` | Vai và quyền của mình | Mọi người được phép |
| `/new` | Phiên mới | Mọi người được phép |
| `/stop` | Dừng việc đang làm | Mọi người được phép |
| `/status` | Phiên, model, số lượt | Mọi người được phép |
| `/model` | Chọn model bằng nút (nhà cung cấp → model) | Chủ nhân |
| `/sessions`, `/resume <số>` | Các phiên của cuộc trò chuyện | Chủ nhân |
| `/sethome` | Chọn chat này làm nơi nhận báo cáo routine và tin bot chủ động gửi | Chủ nhân |
| `/voice on\|off` | Trả lời kèm giọng nói | Chủ nhân |

## Duyệt và câu hỏi

- Phiên gắn với Telegram mà bot cần duyệt một hành động: gửi thẻ có **Cho phép một lần / Từ chối** cho chủ nhân. Hết 10 phút chưa bấm: trả `unavailable`, dsh chặn hành động (fail-closed). Người không phải chủ nhân gọi bot thì mọi duyệt đều bị từ chối.
- Bot hỏi lại (`ask_user_question`): mỗi lựa chọn một nút, thêm nút **Khác (gõ trả lời)**; câu hỏi nhiều lựa chọn thì bấm chọn rồi **Xong**. Câu hỏi mở thì tin kế tiếp là câu trả lời.

## Ghi âm, ảnh, tệp, giọng nói

- **Ghi âm** → ffmpeg đổi sang WAV 16 kHz → `ctx.speechToText` của dsh (bộ voice-input) → chữ, gửi cho bot kèm dòng "(ghi âm)". Thiếu ffmpeg hoặc thiếu bộ nhận dạng thì báo lý do.
- **Ảnh** → `ctx.attachments.saveImage` → khối ảnh trong tin. **Tệp** (≤ 20 MB, giới hạn của Bot API) → `saveFile` → khối tệp.
- **Trả lời bằng giọng nói** (`/voice on`, chỉ trên Mac): `say` đọc câu trả lời → ffmpeg đổi sang OGG Opus → `sendVoice`, gửi kèm bản chữ.

## Bot chủ động nhắn

Tool `channel_send` cho bot gửi tin tới **nơi nhận** (`/sethome`) của chủ nhân. Dùng cho routine ở bước sau.

## Trang 6.3 Kênh và ghép đôi

Thêm bot Telegram (dán token), trạng thái và cảnh báo privacy mode; sinh mã ghép đôi (chủ nhân / người được phép) và đồng hồ hết hạn; danh sách đã ghép đôi (thu hồi); danh sách nhóm (cho phép, ai được gọi, chế độ khách, lời nhắc riêng); cách xử lý khi đang bận.

## Kênh riêng của từng bot và chuyển giao

- Trang 6.3: thêm bot Telegram thì chọn bot của aris (bot chưa có kênh, không phải bot ngoài), dán token. Danh sách hiện mọi tài khoản đã gắn: Aris "cửa vào chính", bot khác "chat riêng". Hồ sơ bot (2.2) hiện kênh riêng của bot.
- Nhắn riêng tài khoản của một bot là nói chuyện với bot đó: phiên mới tạo qua `arisBots.open` (phiên trong chat riêng gắn với bot, model riêng của bot), nên bot dùng tính cách, ký ức và quyền của nó. Người đã ghép đôi dùng chung cho mọi tài khoản: không ghép đôi lại, chỉ cần bấm Start với bot mới một lần.
- Nhóm có nhiều bot của aris: bot nào được `@` thì bot đó trả lời (cửa vào đã lo).
- Chuyển giao (`plugin:aris/handoff` trong lượt): tracker giữ câu trả lời của bot đích là một đoạn riêng có người nói. Khi giao: đoạn của bot của phiên gửi như thường; đoạn chuyển giao mở đầu bằng `@tên_gọi · chức danh` (thành tên thành viên). Chat riêng: kèm nút link "Nhắn tiếp với …" tới tài khoản của bot đích nếu có. Nhóm: gửi bằng tài khoản của bot đích nếu có, hộp thư ra ghi bot dự phòng để gửi thay khi tài khoản đó không gửi được vào nhóm (403/400).

## Thẻ duyệt tập trung

Kênh nghe hộp duyệt chung của `@aris/commander` (`arisApprovals`): yêu cầu quyền mới của bot ngoài hay bot trong đội thành thẻ theo bản vẽ 7.1, gửi tới chat chính (`home`) của bot Aris, không có thì tới chủ nhân: "🔐 CẦN DUYỆT · [chấm màu] Tên", việc xin làm, lệnh hoặc tệp, lý do, "Tự từ chối sau 15 phút", nút Cho phép / Từ chối (`ax:<mã>:y|n`, chỉ chủ nhân bấm). Yêu cầu xong ở đâu thì thẻ được sửa: "Đã cho phép trên web", "Đã từ chối", "Hết 15 phút, đã từ chối", "Việc đã dừng".

## Để sau

Webhook thay long-polling (khi chạy trên server), tệp lớn hơn 20 MB (Bot API cục bộ), chủ đề riêng trong chat 1-1 (Bot API 9.4), Lark và Zalo.
