# Đặc tả kênh Zalo cá nhân (giai đoạn 8.4, nhiều tài khoản và bán hàng ở 8.7)

> Viết theo plan [gd8-4-zalo.md](../plans/gd8-4-zalo.md) và [gd8-7-nhieu-tai-khoan-kenh.md](../plans/gd8-7-nhieu-tai-khoan-kenh.md), cùng khuôn với kênh Lark (`packages/aris-channels/src/lark/`). Đã đọc tài liệu kênh `zalouser` của OpenClaw và README của `zca-js` để biết cách đăng nhập và giới hạn, không chép mã (xem [clean-room-log.md](../clean-room-log.md)). Mã nằm ở `packages/aris-channels/src/zalo/`.

## Rủi ro: đọc trước khi dùng

Zalo cá nhân **không có API chính thức cho bot**. Kênh này dùng thư viện không chính thức [`zca-js`](https://github.com/RFS-ADRENO/zca-js) 2.2.0 (MIT, ghim đúng phiên bản trong `packages/aris-channels`) giả lập Zalo Web. Tác giả thư viện và tài liệu OpenClaw đều cảnh báo **tài khoản có thể bị Zalo khoá hay cấm**. Vì vậy:

- nên thử bằng **tài khoản Zalo phụ** trước, rồi mới dùng tài khoản chính;
- luật ở cửa vào chặt hơn Telegram và Lark (mục "Ai được trả lời"), và gửi tin có giới hạn tần suất cứng.

Thư viện cũng chỉ cho **một trình nghe mỗi tài khoản**: mở Zalo Web trên trình duyệt thì trình nghe của aris bị đóng.

## Đăng nhập

1. Giao diện (Cài đặt › Kênh và ghép đôi › "+ Thêm tài khoản" › Zalo cá nhân, đánh dấu "Tôi hiểu") gọi `zalo-login-start { bot, label? }` (quét lại: thêm `account`); máy chủ gọi đăng nhập QR của `zca-js` và trả `{ qrPng (base64), expiresAt, key }`. `expiresAt` là ước lượng 100 giây (thư viện không báo giờ hết hạn); `key` là mã của lần đăng nhập (`new-<bot>` khi thêm mới, mã tài khoản khi quét lại).
2. Người dùng quét bằng ứng dụng Zalo. Giao diện hỏi `zalo-login-status` 2 giây một lần và đọc `zalo.logins` theo `key`: chờ quét → đã quét (kèm tên và ảnh đại diện Zalo) → đã đăng nhập (kèm `account`); hoặc hết hạn / bị từ chối / lỗi. Nút "Tạo mã mới" gọi lại `zalo-login-start` (huỷ lần cũ cùng `key`).
3. Quét xong, **dữ liệu đăng nhập** (cookie, imei, user agent) lưu vào Keychain qua dịch vụ `credentials`, tên `ZALO_<MÃ TÀI KHOẢN>_SESSION`, dạng JSON. Không ghi vào bản ghi, tệp thường hay log; ảnh chụp trạng thái của API không bao giờ chứa nó. Kênh rồi đăng nhập lại bằng dữ liệu vừa lưu và bắt đầu nghe.
4. Khởi động lại daemon: đăng nhập bằng dữ liệu đã lưu, không cần quét QR.
5. **GĐ8.7: một bot có nhiều tài khoản Zalo.** Mỗi tài khoản có mã riêng (`acc-…`), tên do người dùng đặt ("CSKH 1") và **một bot trả lời** (đổi được sau). Tài khoản có trước GĐ8.7 giữ mã là mã bot, không phải chuyển dữ liệu.
6. Cùng một tài khoản Zalo chỉ thêm được một lần: quét lại bằng tài khoản đã có thì dùng lại mã tài khoản đó (giữ người đã ghép đôi và nhóm). Quét lại một tài khoản bằng **tài khoản Zalo khác** thì bỏ người đã ghép đôi và nhóm riêng của tài khoản cũ.

Bản ghi tài khoản nằm trong bảng `bots` của kho `aris_channels` với khoá `zalo-<mã tài khoản>` (`channel: 'zalo'`, `account` là mã tài khoản khi khác mã bot, `bot` là bot trả lời, `label`, `mode`, `hand`, `hours`, `skipLabels`, `docs`, `botOpenId` là mã Zalo của tài khoản, `tokenRef` trỏ tên khoá trong Keychain).

## Ai được trả lời

| Tình huống | Hành vi |
|---|---|
| Chat riêng, người **đã ghép đôi** (chủ nhân, hay người được phép của tài khoản này) | Vào phiên như Telegram và Lark |
| Chat riêng, người lạ, tài khoản đặt "Chỉ người đã ghép đôi" (mặc định) | **Im lặng.** Báo chủ qua Telegram nhiều nhất **một lần mỗi người mỗi ngày**: «<tên> nhắn Zalo: <trích 80 ký tự>». Không mở phiên, không tốn token |
| Chat riêng, người lạ, tài khoản đặt "Mọi người nhắn riêng là khách" (GĐ8.7) | Vào phiên với vai **khách**: chỉ hỏi đáp, không làm việc có tác động |
| Nhóm | **Mặc định tắt.** Nhóm được ghi nhận vào danh sách khi có tin đầu tiên (để hiện công tắc), nhưng im lặng cho tới khi người dùng bật. Nhóm bật thì chỉ trả lời khi tài khoản được **@ nhắc**; người gửi phải đã ghép đôi (hoặc nhóm đặt "mọi người") |
| Tin của chính tài khoản, tin aris vừa gửi, tin cũ hơn lúc kết nối | Bỏ |

Nhóm không có chế độ khách. aris **không bao giờ tự nhắn trước** cho người chưa ghép đôi, không gửi hàng loạt, không kết bạn, không tham gia nhóm.

Ghép đôi: `createCode(role, 'zalo', account?)` rồi người kia nhắn mã trong chat riêng (`redeemZalo`). Mã của kênh khác nhắn vào Zalo (và mã Zalo nhắn vào Telegram hay Lark) được trả lời "Mã này dành cho kênh khác."; mã của tài khoản khác được trả lời "Mã này dành cho tài khoản khác."; cả hai không bị tính là nhập sai. **Chủ nhân dùng chung** mọi tài khoản; người được phép và nhóm **theo tài khoản** (GĐ8.7). Mã do trang tài khoản tạo chỉ dùng được trên tài khoản đó.

Khoá bản ghi: người `zc-<mã tài khoản>-<mã người dùng Zalo>` (chủ nhân và người ghép đôi trước GĐ8.7: `zc-<mã người>`, dùng chung), nhóm `zc-<mã tài khoản>-<mã nhóm>` (nhóm cũ: `zc-<mã nhóm>`), cuộc trò chuyện `zc-<mã tài khoản>-<mã>`. Trả lời luôn ra đúng tài khoản đã nhận tin. Phiên có khoá `zc-…` là phiên Zalo (`isZaloSession`, nguồn "Zalo" trong Thống kê).

## Gửi tin và giới hạn tần suất

- Markdown của bot đổi sang chữ thường (bỏ `**`, `__`, `~~`, dấu mã, tiêu đề `#`; liên kết thành `chữ (địa chỉ)`; bảng thành các dòng gạch đầu dòng; khối mã giữ nội dung) rồi chia theo **1.500 ký tự** (Zalo cho tối đa 2.000; cắt sớm cho dễ đọc, GĐ8.7 đợt A), ngắt ở ranh giới đoạn, rồi dòng, rồi câu. Giữa các phần có nhịp nghỉ của giới hạn 3 giây.
- Giới hạn là hằng số `ZALO_LIMITS` trong `zalo/access.ts`, áp dụng cho mọi tin gửi đi (trả lời, tin hệ thống, ảnh, tệp):
  - tối đa **1 tin mỗi 3 giây** cho một cuộc trò chuyện;
  - tối đa **20 tin mỗi phút** cho cả tài khoản;
  - tối đa **300 tin mỗi ngày**.
- Vượt giới hạn thì **xếp hàng** (các tin nối đuôi nhau trên cả tài khoản). Hết hạn mức ngày thì **dừng gửi** tới hết ngày, bỏ phần còn lại và báo chủ qua Telegram một lần.
- "Đang soạn tin" (`sendTypingEvent` của thư viện) báo khi nhận tin vào phiên, nhiều nhất mỗi 5 giây cho một cuộc trò chuyện.
- Dùng chung với hub: hàng đợi bền (hộp thư vào/ra), `/new` `/stop` `/status` `/sessions` `/resume` `/whoami` `/help`, quyền hạn chế cho người không phải chủ, "Khi bot đang làm mà {you} nhắn thêm", dừng khẩn cấp. Duyệt việc của chủ vẫn ở web (Zalo không có nút bấm trong tin).
- Nhận ảnh, tệp, tin thoại (tải theo đường dẫn trong tin, tối đa 20 MB; tin thoại chép lời bằng `speechToText` nếu có). Sticker, video và các loại khác được báo "chưa đọc được loại tin này".

## Bán hàng trên Zalo (GĐ8.7 đợt C)

aris là trợ lý, không thành phần mềm chat support: chủ đọc và trả lời khách ngay trên app Zalo; aris trả lời thay, biết nhường tay, và báo chủ qua Telegram. Mọi phần dưới đây áp cho **người không phải chủ nhân** (khách, người được phép); tin của chủ nhân không bị giữ hay chặn.

- **Nhường tay cho chủ** (mặc định bật, `hand: false` để tắt): kênh bật `selfListen` để nhận cả tin chính tài khoản gửi (cờ `fromSelf`). Tin chủ tự gõ trên điện thoại trong một cuộc chat làm cuộc chat đó **im 10 phút**: lượt bot đang soạn dừng và không gửi; tin khách trong lúc im được **giữ** trong hàng đợi bền. Chủ gõ thêm thì các tin đang giữ coi như chủ đã lo (bỏ) và đếm lại 10 phút; hết 10 phút mà chủ không gõ thì bot trả lời cả loạt tin đang giữ một lần. Tiếng vọng của tin aris vừa gửi không bị coi là chủ gõ: nhận ra bằng mã tin, bằng số tin đang gửi dở của cuộc chat, và bằng chữ trùng tin aris gửi trong 60 giây.
- **Giờ trực** (`hours: { days, from, to, offReply? }`, theo giờ máy; `to` nhỏ hơn `from` là ca qua nửa đêm): ngoài giờ thì **giữ tin**, vào giờ thì trả lời. `offReply` (mặc định tắt) gửi một lần mỗi đợt ngoài giờ cho mỗi cuộc chat. Đổi giờ trực thì xét lại các cuộc chat đang giữ.
- **Nhãn bỏ qua** (`skipLabels`, tên nhãn đặt trên app Zalo, không phân biệt hoa thường): cuộc chat mang nhãn thì bot không đụng tới, kể cả không báo chủ về người lạ. Đọc lại nhãn (`getLabels`) mỗi 5 phút; đọc lỗi thì dùng bản cũ.
- **Gặp nhân viên**: khách gõ "gặp nhân viên", "cho gặp người thật", "tư vấn viên", "/nhanvien"… (có dấu hay không dấu) thì bot trả một câu "Đã báo người phụ trách, sẽ có người trả lời sớm.", báo chủ qua Telegram, rồi **im cuộc chat đó 2 giờ** tính từ tin cuối của khách. Telegram có cùng hành vi.
- **Công cụ của model** (đăng ký trong `index.ts`, dùng được cho Telegram và Zalo): `channel_silence` (lượt này không gửi gì, cả chat riêng lẫn nhóm), `channel_notify_owner` (một dòng báo chủ qua Telegram kèm tên tài khoản và người đang chat, nhiều nhất **10 phút một lần** mỗi cuộc chat). Chưa có chuông trên web: aris chưa có hệ thống thông báo web, nên báo chủ chỉ qua Telegram.
- **@nhắc thật trong nhóm**: câu trả lời đầu tiên trong nhóm mở đầu bằng `@<tên người hỏi>` và gửi kèm `mentions` của `zca-js` (người hỏi nhận thông báo như khi bị @ trên app).
- Trạng thái giữ tin, gặp nhân viên, đã báo chủ nằm trong bộ nhớ: khởi động lại thì tin đang giữ được trả lời ngay khi chạy lên.

## Chỉ trả lời theo tài liệu (GĐ8.7 đợt D)

Bật theo tài khoản (`docs: { on, folders, noInfo? }`, cả Telegram lẫn Zalo), áp cho **khách** (chưa ghép đôi); chủ nhân và người đã ghép đôi không bị giới hạn. Mã ở `src/docs.ts` (`DocsGate`), phía bộ não ở `@aris/brain` (`arisBrain.scope`, `hits`, `folders`).

- Mỗi lượt của khách: phiên nhận lời dặn "chỉ trả lời theo tài liệu" và bộ não giới hạn `brain_search`, `brain_read` của phiên vào các **thư mục nguồn** đã chọn. Công cụ khác bị chặn ở `tools/pre-execute` (chỉ còn `brain_search`, `brain_read`, `channel_silence`, `channel_notify_owner`).
- Lượt xong mà **không tra thấy gì** trong nguồn: câu trả lời của model được thay bằng câu "chưa có thông tin" (`noInfo`, mặc định không dùng đại từ, người dùng sửa theo cách xưng hô của mình) và báo chủ qua Telegram (theo giới hạn 10 phút của "báo chủ").
- Tệp khách gửi chỉ vào kho đính kèm của phiên, không bao giờ vào bộ não, nên không thể thành nguồn.
- **Không cam kết 100%**: kiểm tra là "lượt có tra thấy đoạn tài liệu trong nguồn", không kiểm từng câu; model vẫn có thể diễn giải sai đoạn đã tra. Giao diện ghi rõ điều này.

## Mất kết nối

| Tình huống | Trạng thái | Hành vi |
|---|---|---|
| Trình nghe bị đóng với mã `DuplicateConnection` (thường do mở Zalo Web) | "Zalo Web đang mở, aris tạm ngừng nghe" | Thử lại sau 2 phút, gấp đôi mỗi lần, tối đa 30 phút |
| Đóng vì lý do khác, lỗi mạng khi đăng nhập | "mất kết nối, đang thử lại" | Như trên |
| Dữ liệu đăng nhập hết hạn hay bị Zalo từ chối, hoặc không còn trong Keychain | "Cần quét lại QR" | Không thử lại; báo chủ qua Telegram một lần |

**GĐ8.7 đợt A:**
- Bị đá phiên (`DuplicateConnection`): báo chủ qua Telegram, tối đa **6 giờ một lần** mỗi tài khoản.
- **Mạng chết im** (kết nối không đóng nhưng không còn tin về): bộ canh 5 phút một lần gọi nhẹ Zalo (`fetchAccountInfo`); lỗi hai lần liền thì đóng trình nghe và thử lại theo lịch trên.
- Mở trình nghe mới thì đóng trình nghe cũ của cùng tài khoản trước (không để hai trình nghe).
- **Gom tin dồn dập**: tin của người không phải chủ đợi cuộc chat im 5 giây rồi mới vào phiên (lệnh, mã ghép đôi, tin của chủ không đợi). Khách nhắn thêm khi bot đang soạn thì dừng lượt cũ, lượt cũ không gửi gì ra (cả chữ dở lẫn "Đã dừng"), lượt mới trả lời cả loạt tin.

Thời gian chờ chỉ đặt lại khi kết nối đã đứng vững ít nhất 10 phút, nên bị Zalo Web đá ra ngay sau khi nối thì chờ lâu dần, không giành lại liên tục. Câu trả lời dở trong hộp thư ra được gửi nốt khi nối lại, và khi khởi động lại.

## API `/api/aris/channels`

| Thao tác | Việc |
|---|---|
| `zalo-login-start { bot, account?, label? }` | Trả `{ qr: { qrPng, expiresAt, key } }` cùng ảnh chụp trạng thái; không có `account` là thêm tài khoản mới |
| `zalo-login-status` | Chỉ trả ảnh chụp, trong đó `zalo.logins` là các lần đăng nhập QR còn trong bộ nhớ |
| `zalo-logout { account }` | Xoá dữ liệu đăng nhập trong Keychain, tài khoản, người được phép và nhóm riêng của tài khoản; tài khoản cuối cùng thì xoá cả chủ nhân và nhóm dùng chung của Zalo |
| `account { channel: 'zalo', account, bot?, label?, mode?, hand?, hours?, skipLabels?, docs? }` | Đổi bot trả lời, tên, ai được trả lời, nhường tay, giờ trực (`null` là bỏ), nhãn bỏ qua, chỉ trả lời theo tài liệu |
| `zalo-labels { account }` | `{ labels }`: tên các nhãn trên app Zalo (để chọn nhãn bỏ qua) |
| `revoke-zalo { zaloId, account? }` | Gỡ một người đã ghép đôi |
| `zalo-group { groupId, account?, allowed?, who?, prompt? }`, `zalo-group-remove { groupId, account? }` | Bật/tắt nhóm |
| `code { role, channel: 'zalo', account? }` | Mã ghép đôi riêng của Zalo (có `account` thì chỉ dùng được trên tài khoản đó) |

Ảnh chụp có thêm khoá `zalo`: `accounts` (mã tài khoản, tên, bot, chế độ, nhường tay, giờ trực, nhãn bỏ qua, tài liệu, mã Zalo, tên Zalo, ảnh đại diện, trạng thái, số tin còn trong ngày), `logins`, `people` và `groups` (có `account`, trống là dùng chung), `limits`; ở gốc có `docFolders` (thư mục bộ não chọn làm nguồn) và `noInfo` (câu mặc định). Telegram và Lark không lẫn người hay nhóm của Zalo.

## Ghi chú kỹ thuật

- `zca-js@2.2.0` khai báo sai đường dẫn kiểu (`./index.d.ts`, thực tế ở `dist/index.d.ts`) nên `packages/aris-channels/tsconfig.json` có `paths` trỏ `zca-js` tới `./node_modules/zca-js/dist/index.d.ts`. Lúc chạy dùng ESM `dist/index.js` như bình thường.
- `pako` (phụ thuộc của `zca-js`) có giấy phép `MIT AND Zlib`: `scripts/check-licenses.mjs` có ngoại lệ ghi lý do (Zlib là giấy phép dễ dãi).

## Kiểm thử

Mọi test dùng bản giả của `ZaloConnector`, không gọi mạng (`zalo/*.test.ts`, `hours.test.ts`, `docs.test.ts`). GĐ8.7: nhường tay (giữ tin, chủ gõ thêm thì bỏ tin giữ, dừng lượt đang soạn, tiếng vọng, tắt nhường tay), giờ trực (giữ tin, câu ngoài giờ một lần, chủ không bị giữ, vào giờ thì trả lời), nhãn bỏ qua và đọc lại 5 phút, gặp nhân viên, im lặng và báo chủ 10 phút, @nhắc thật trong nhóm, chỉ trả lời theo tài liệu (giới hạn nguồn, thay câu khi không tra thấy, chủ và người đã ghép đôi không bị giới hạn), hai tài khoản không lẫn người, nhóm, phiên. Từ 8.4: đăng nhập từ dữ liệu đã lưu; đăng nhập QR (chờ quét, đã quét, hết hạn, tạo mã mới, quét lại cùng/khác tài khoản); ghép đôi và mã khác kênh; người lạ im lặng và báo chủ đúng một lần mỗi ngày; nhóm tắt, nhóm bật không @, nhóm bật có @; bỏ qua tin của chính mình, tin echo, tin cũ, tin trùng; chia tin dài; giới hạn 3 giây, 20 tin mỗi phút, 300 tin mỗi ngày; thử lại 2 phút gấp đôi tới trần 30 phút; Zalo Web mở; chuẩn hoá tin bằng các lớp `UserMessage`/`GroupMessage` thật của `zca-js`.

**Chưa thử thật** (cần tài khoản Zalo thật của người dùng): `selfListen` có báo đúng tin chủ tự gõ trên điện thoại (và tiếng vọng tin aris gửi) hay không, `getLabels` trả đúng mã cuộc chat cho chat riêng và nhóm, @nhắc thật hiện đúng trên app, chế độ tài liệu với bộ não thật; quét QR, nhận và gửi tin thật, hành vi của Zalo khi mở Zalo Web, dữ liệu đăng nhập có đăng nhập lại được sau khi khởi động lại, dạng thật của nội dung ảnh/tệp/tin thoại (mã chỉ đọc `href` và `title` theo kiểu dữ liệu của thư viện), có bị Zalo hạn chế sau khi dùng một thời gian hay không. Hướng dẫn thử ở cuối plan 8.4.

## Chuyển sang Zalo Bot chính thức (để sau)

[Zalo Bot](https://bot.zaloplatforms.com) dùng token, nhận tin bằng `getUpdates` giống Telegram, không cần máy chủ và không có rủi ro bị khoá, nhưng người khác phải nhắn cho **tài khoản bot** chứ không nhắn thẳng tài khoản cá nhân. Bộ nối có thể dùng lại `zalo/channel.ts`, `access.ts`, `content.ts`: chỉ thay `zalo/sdk.ts` bằng bộ nối gọi Zalo Bot (cùng giao diện `ZaloConnector`: `open` trả `ZaloApi` + `ZaloListener`, `loginQR` thay bằng nhập token).
