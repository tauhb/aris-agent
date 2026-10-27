# Đặc tả kênh Zalo cá nhân (giai đoạn 8.4)

> Viết theo plan [gd8-4-zalo.md](../plans/gd8-4-zalo.md), cùng khuôn với kênh Lark (`packages/aris-channels/src/lark/`). Đã đọc tài liệu kênh `zalouser` của OpenClaw và README của `zca-js` để biết cách đăng nhập và giới hạn, không chép mã (xem [clean-room-log.md](../clean-room-log.md)). Mã nằm ở `packages/aris-channels/src/zalo/`.

## Rủi ro: đọc trước khi dùng

Zalo cá nhân **không có API chính thức cho bot**. Kênh này dùng thư viện không chính thức [`zca-js`](https://github.com/RFS-ADRENO/zca-js) 2.2.0 (MIT, ghim đúng phiên bản trong `packages/aris-channels`) giả lập Zalo Web. Tác giả thư viện và tài liệu OpenClaw đều cảnh báo **tài khoản có thể bị Zalo khoá hay cấm**. Vì vậy:

- nên thử bằng **tài khoản Zalo phụ** trước, rồi mới dùng tài khoản chính;
- luật ở cửa vào chặt hơn Telegram và Lark (mục "Ai được trả lời"), và gửi tin có giới hạn tần suất cứng.

Thư viện cũng chỉ cho **một trình nghe mỗi tài khoản**: mở Zalo Web trên trình duyệt thì trình nghe của aris bị đóng.

## Đăng nhập

1. Giao diện gọi `zalo-login-start { bot }`; máy chủ gọi đăng nhập QR của `zca-js` và trả `{ qrPng (base64), expiresAt }`. `expiresAt` là ước lượng 100 giây (thư viện không báo giờ hết hạn).
2. Người dùng quét bằng ứng dụng Zalo. Giao diện hỏi `zalo-login-status` vài giây một lần: chờ quét → đã quét (kèm tên và ảnh đại diện Zalo) → đã đăng nhập; hoặc hết hạn / bị từ chối / lỗi. Mã hết hạn thì lần đăng nhập dừng; nút "Tạo mã mới" gọi lại `zalo-login-start` (huỷ lần cũ).
3. Quét xong, **dữ liệu đăng nhập** (cookie, imei, user agent) lưu vào Keychain qua dịch vụ `credentials`, tên `ZALO_<MÃ BOT>_SESSION`, dạng JSON. Không ghi vào bản ghi, tệp thường hay log; ảnh chụp trạng thái của API không bao giờ chứa nó. Kênh rồi đăng nhập lại bằng dữ liệu vừa lưu và bắt đầu nghe.
4. Khởi động lại daemon: đăng nhập bằng dữ liệu đã lưu, không cần quét QR.
5. Mỗi tài khoản Zalo gắn với **một bot** của aris (mặc định Aris); người dùng chọn bot khi kết nối. Một tài khoản Zalo không gắn được với hai bot.
6. Quét lại bằng **cùng tài khoản** thì giữ người đã ghép đôi và nhóm; đổi sang tài khoản khác hay đăng xuất thì bỏ (mã người Zalo khác nhau giữa các tài khoản).

Bản ghi tài khoản nằm trong bảng `bots` của kho `aris_channels` với khoá `zalo-<bot>` (`channel: 'zalo'`, `botOpenId` là mã Zalo của tài khoản, `tokenRef` trỏ tên khoá trong Keychain).

## Ai được trả lời

| Tình huống | Hành vi |
|---|---|
| Chat riêng, người **đã ghép đôi** | Vào phiên như Telegram và Lark |
| Chat riêng, người lạ | **Im lặng.** Báo chủ qua Telegram nhiều nhất **một lần mỗi người mỗi ngày**: «<tên> nhắn Zalo: <trích 80 ký tự>». Không mở phiên, không tốn token |
| Nhóm | **Mặc định tắt.** Nhóm được ghi nhận vào danh sách khi có tin đầu tiên (để hiện công tắc), nhưng im lặng cho tới khi người dùng bật. Nhóm bật thì chỉ trả lời khi tài khoản được **@ nhắc**; người gửi phải đã ghép đôi (hoặc nhóm đặt "mọi người") |
| Tin của chính tài khoản, tin aris vừa gửi, tin cũ hơn lúc kết nối | Bỏ |

Không có chế độ khách. aris **không bao giờ tự nhắn trước** cho người chưa ghép đôi, không gửi hàng loạt, không kết bạn, không tham gia nhóm.

Ghép đôi: `createCode(role, 'zalo')` rồi người kia nhắn mã trong chat riêng (`redeemZalo`). Mã của kênh khác nhắn vào Zalo (và mã Zalo nhắn vào Telegram hay Lark) được trả lời "Mã này dành cho kênh khác." và không bị tính là nhập sai.

Khoá bản ghi: người `zc-<mã người dùng Zalo>`, nhóm `zc-<mã nhóm>`, cuộc trò chuyện `zc-<bot>-<mã>`. Phiên có khoá `zc-…` là phiên Zalo (`isZaloSession`, nguồn "Zalo" trong Thống kê).

## Gửi tin và giới hạn tần suất

- Markdown của bot đổi sang chữ thường (bỏ `**`, `__`, `~~`, dấu mã, tiêu đề `#`; liên kết thành `chữ (địa chỉ)`; bảng thành các dòng gạch đầu dòng; khối mã giữ nội dung) rồi chia theo **2.000 ký tự**, ngắt ở ranh giới đoạn, rồi dòng, rồi câu.
- Giới hạn là hằng số `ZALO_LIMITS` trong `zalo/access.ts`, áp dụng cho mọi tin gửi đi (trả lời, tin hệ thống, ảnh, tệp):
  - tối đa **1 tin mỗi 3 giây** cho một cuộc trò chuyện;
  - tối đa **20 tin mỗi phút** cho cả tài khoản;
  - tối đa **300 tin mỗi ngày**.
- Vượt giới hạn thì **xếp hàng** (các tin nối đuôi nhau trên cả tài khoản). Hết hạn mức ngày thì **dừng gửi** tới hết ngày, bỏ phần còn lại và báo chủ qua Telegram một lần.
- "Đang soạn tin" (`sendTypingEvent` của thư viện) báo khi nhận tin vào phiên, nhiều nhất mỗi 5 giây cho một cuộc trò chuyện.
- Dùng chung với hub: hàng đợi bền (hộp thư vào/ra), `/new` `/stop` `/status` `/sessions` `/resume` `/whoami` `/help`, quyền hạn chế cho người không phải chủ, "Khi bot đang làm mà {you} nhắn thêm", dừng khẩn cấp. Duyệt việc của chủ vẫn ở web (Zalo không có nút bấm trong tin).
- Nhận ảnh, tệp, tin thoại (tải theo đường dẫn trong tin, tối đa 20 MB; tin thoại chép lời bằng `speechToText` nếu có). Sticker, video và các loại khác được báo "chưa đọc được loại tin này".

## Mất kết nối

| Tình huống | Trạng thái | Hành vi |
|---|---|---|
| Trình nghe bị đóng với mã `DuplicateConnection` (thường do mở Zalo Web) | "Zalo Web đang mở, aris tạm ngừng nghe" | Thử lại sau 2 phút, gấp đôi mỗi lần, tối đa 30 phút |
| Đóng vì lý do khác, lỗi mạng khi đăng nhập | "mất kết nối, đang thử lại" | Như trên |
| Dữ liệu đăng nhập hết hạn hay bị Zalo từ chối, hoặc không còn trong Keychain | "Cần quét lại QR" | Không thử lại; báo chủ qua Telegram một lần |

Thời gian chờ chỉ đặt lại khi kết nối đã đứng vững ít nhất 10 phút, nên bị Zalo Web đá ra ngay sau khi nối thì chờ lâu dần, không giành lại liên tục. Câu trả lời dở trong hộp thư ra được gửi nốt khi nối lại, và khi khởi động lại.

## API `/api/aris/channels`

| Thao tác | Việc |
|---|---|
| `zalo-login-start { bot }` | Trả `{ qr: { qrPng, expiresAt } }` cùng ảnh chụp trạng thái |
| `zalo-login-status { bot }` | Chỉ trả ảnh chụp, trong đó `zalo.login` là trạng thái lần đăng nhập gần nhất |
| `zalo-logout { bot }` | Xoá dữ liệu đăng nhập trong Keychain, tài khoản, người đã ghép đôi, nhóm |
| `revoke-zalo { zaloId }` | Gỡ một người đã ghép đôi |
| `zalo-group { groupId, allowed?, who?, prompt? }`, `zalo-group-remove { groupId }` | Bật/tắt nhóm |
| `code { role, channel: 'zalo' }` | Mã ghép đôi riêng của Zalo |

Ảnh chụp có thêm khoá `zalo`: `accounts` (bot, mã Zalo, tên, ảnh đại diện, trạng thái, số tin còn trong ngày), `login`, `people`, `groups`, `limits`. Telegram và Lark không lẫn người hay nhóm của Zalo.

## Ghi chú kỹ thuật

- `zca-js@2.2.0` khai báo sai đường dẫn kiểu (`./index.d.ts`, thực tế ở `dist/index.d.ts`) nên `packages/aris-channels/tsconfig.json` có `paths` trỏ `zca-js` tới `./node_modules/zca-js/dist/index.d.ts`. Lúc chạy dùng ESM `dist/index.js` như bình thường.
- `pako` (phụ thuộc của `zca-js`) có giấy phép `MIT AND Zlib`: `scripts/check-licenses.mjs` có ngoại lệ ghi lý do (Zlib là giấy phép dễ dãi).

## Kiểm thử

Mọi test dùng bản giả của `ZaloConnector`, không gọi mạng (`zalo/*.test.ts`): đăng nhập từ dữ liệu đã lưu; đăng nhập QR (chờ quét, đã quét, hết hạn, tạo mã mới, quét lại cùng/khác tài khoản); ghép đôi và mã khác kênh; người lạ im lặng và báo chủ đúng một lần mỗi ngày; nhóm tắt, nhóm bật không @, nhóm bật có @; bỏ qua tin của chính mình, tin echo, tin cũ, tin trùng; chia tin dài; giới hạn 3 giây, 20 tin mỗi phút, 300 tin mỗi ngày; thử lại 2 phút gấp đôi tới trần 30 phút; Zalo Web mở; chuẩn hoá tin bằng các lớp `UserMessage`/`GroupMessage` thật của `zca-js`.

**Chưa thử thật** (cần tài khoản Zalo thật của người dùng): quét QR, nhận và gửi tin thật, hành vi của Zalo khi mở Zalo Web, dữ liệu đăng nhập có đăng nhập lại được sau khi khởi động lại, dạng thật của nội dung ảnh/tệp/tin thoại (mã chỉ đọc `href` và `title` theo kiểu dữ liệu của thư viện), có bị Zalo hạn chế sau khi dùng một thời gian hay không. Hướng dẫn thử ở cuối plan 8.4.

## Chuyển sang Zalo Bot chính thức (để sau)

[Zalo Bot](https://bot.zaloplatforms.com) dùng token, nhận tin bằng `getUpdates` giống Telegram, không cần máy chủ và không có rủi ro bị khoá, nhưng người khác phải nhắn cho **tài khoản bot** chứ không nhắn thẳng tài khoản cá nhân. Bộ nối có thể dùng lại `zalo/channel.ts`, `access.ts`, `content.ts`: chỉ thay `zalo/sdk.ts` bằng bộ nối gọi Zalo Bot (cùng giao diện `ZaloConnector`: `open` trả `ZaloApi` + `ZaloListener`, `loginQR` thay bằng nhập token).
