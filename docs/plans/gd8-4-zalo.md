# Plan 8.4 · Kênh Zalo cá nhân

Đọc trước `docs/plans/gd8-chung.md`.

Ngày 26/10 người dùng chọn **Zalo cá nhân**: aris đọc và trả lời ngay trên tài khoản Zalo của người dùng, qua thư viện không chính thức `zca-js`.

Làm theo khuôn kênh Lark (`packages/aris-channels/src/lark/`, plan `docs/plans/gd7-7d-lark.md`):
- kênh chạy cạnh Telegram qua `hub.attachPeer`;
- mã ghép đôi riêng cho từng kênh;
- kiểu kênh `'zalo'` đã có trong `store.ts`.

## Thông tin đã kiểm (26/10)

**Thư viện `zca-js`**
- Bản mới nhất 2.2.0, giấy phép **MIT**, repo `github.com/RFS-ADRENO/zca-js`, cập nhật ngày 9/9/2026.
- Gói đi kèm: `ws`, `pako`, `semver`, `crypto-js`, `form-data`, `spark-md5`, `json-bigint`, `tough-cookie`.
- Cách chạy: giả lập Zalo Web, đăng nhập bằng mã QR, nhận tin qua trình nghe sự kiện `message`, gửi bằng API JS.
- **Mỗi tài khoản chỉ chạy được một trình nghe.** Người dùng mở Zalo Web trên trình duyệt thì trình nghe của aris tắt.
- Tin nhắn tối đa 2.000 ký tự.

**Rủi ro:** tác giả thư viện và tài liệu OpenClaw (`docs.openclaw.ai/.../channels/zalouser`) đều cảnh báo **tài khoản có thể bị khoá hay cấm**.

**Cách chính thức để làm sau nếu cần:** Zalo Bot (`bot.zaloplatforms.com`) dùng token, nhận tin bằng `getUpdates` giống Telegram, không cần server. Ghi ở cuối plan.

## Điểm dừng 1 · Xác nhận và xin cài gói

- Nhắc lại rủi ro bị khoá tài khoản bằng **một câu rõ ràng**.
- Đề nghị người dùng **thử bằng một tài khoản Zalo phụ trước**, rồi mới dùng tài khoản chính.
- Xin cài `zca-js@2.2.0`, ghim đúng phiên bản, vào `packages/aris-channels`. Nêu giấy phép MIT và các gói đi kèm.
- Cài xong chạy `pnpm check:licenses`.
- Chờ người dùng đồng ý rồi mới cài.

## 1. Bộ nối `packages/aris-channels/src/zalo/`

Chép khuôn của `lark/`: `channel.ts`, `access.ts`, `content.ts`, `copy.ts`, `sdk.ts` (bọc `zca-js` sau một giao diện nhỏ để test được), `types.ts`.

### 1a. Đăng nhập

- **Bằng QR trên giao diện:**
  - máy chủ gọi đăng nhập QR của `zca-js` và nhận ảnh QR;
  - giao diện đọc ảnh QR qua API (đọc lại vài giây một lần), người dùng quét bằng ứng dụng Zalo;
  - QR hết hạn thì có nút "Tạo mã mới".
- **Dữ liệu đăng nhập** (cookie, imei, user agent) lưu trong **Keychain** với tên `ZALO_<MÃ BOT>_SESSION`, dạng JSON. Không ghi ra tệp thường, không in ra log.
- Khởi động lại thì đăng nhập bằng dữ liệu đã lưu. Hết hạn thì trạng thái là "Cần quét lại QR" và báo chủ qua Telegram.
- Mỗi tài khoản Zalo gắn với **một bot** của aris, mặc định là Aris. Người dùng chọn bot nào trả lời khi kết nối.

### 1b. Nhận tin

- **Nguồn tin:** trình nghe `message` của `zca-js`, gồm tin riêng và tin nhóm. Loại: chữ, ảnh, tệp, tin thoại.
  - Ảnh và tệp tải về theo cách Lark và Telegram đang làm.
  - Tin thoại chép lời bằng cơ chế giọng nói sẵn có, nếu dùng chung được.
- **Bỏ qua:**
  - tin do chính tài khoản gửi, kể cả tin aris vừa gửi, để không lặp;
  - tin cũ hơn lúc kết nối.
- **Danh tính:**
  - khoá người là `zc-<mã người dùng Zalo>`;
  - nhóm khoá theo mã nhóm.
- **Ai được aris trả lời** (quan trọng để giảm rủi ro bị khoá):
  - **chỉ người đã ghép đôi**, tức đã nhắn đúng mã ghép đôi của kênh Zalo;
  - tin của người lạ thì aris **im lặng**, không trả lời; chỉ báo chủ một lần mỗi người mỗi ngày: "<tên> nhắn Zalo cho {you}: <trích 80 ký tự>";
  - **nhóm mặc định tắt**. Người dùng bật từng nhóm, và trong nhóm chỉ trả lời khi tài khoản được @nhắc.
- **Ghép đôi:** `createCode(role, 'zalo')`, `redeem(..., 'zalo')`. Mã của kênh khác thì trả lời "Mã này dành cho kênh khác."

### 1c. Gửi tin

- Chia tin theo 2.000 ký tự, cắt ở ranh giới đoạn hay câu. Markdown đổi sang chữ thường dễ đọc: bỏ `**`, bảng đổi thành dòng gạch đầu dòng.
- **Giới hạn tần suất**, là hằng số trong `zalo/access.ts`:
  - tối đa 1 tin mỗi 3 giây cho một cuộc trò chuyện;
  - tối đa 20 tin mỗi phút cho cả tài khoản;
  - tối đa 300 tin mỗi ngày.

  Vượt giới hạn thì xếp hàng; vượt giới hạn ngày thì dừng và báo chủ.
- Không bao giờ tự nhắn trước cho người chưa ghép đôi, không gửi hàng loạt, không kết bạn, không tham gia nhóm.
- "Đang soạn tin" (typing): chỉ dùng nếu `zca-js` có, và tối đa mỗi 5 giây một lần.

### 1d. Dùng chung với hub

Dùng lại hàng đợi bền, `/new`, `/stop`, `/status`, quyền hạn chế cho người không phải chủ, "Khi bot đang làm mà {you} nhắn thêm", và dừng khẩn cấp.

### 1e. Mất kết nối

- Trình nghe bị ngắt (thường do người dùng mở Zalo Web): trạng thái là "Zalo Web đang mở, aris tạm ngừng nghe".
- Thử lại chậm: 2 phút, gấp đôi mỗi lần, tối đa 30 phút. Không giành lại kết nối liên tục với Zalo Web.
- Lỗi đăng nhập thì trạng thái là "Cần quét lại QR".

### 1f. Test

Dùng bản giả của `sdk`, không gọi mạng:
- đăng nhập từ dữ liệu đã lưu;
- ghép đôi; mã khác kênh;
- người lạ thì im lặng và báo chủ đúng một lần mỗi ngày;
- nhóm tắt, và nhóm bật nhưng không @nhắc;
- bỏ qua tin của chính mình;
- chia tin dài;
- giới hạn tần suất và giới hạn ngày;
- thử lại khi mất kết nối.

## 2. API `/api/aris/channels`

- `zalo-login-start { bot }` trả `{ qrPng (base64), expiresAt }`.
- `zalo-login-status` trả trạng thái: chờ quét, đã quét, đã đăng nhập (kèm tên và ảnh đại diện Zalo), hoặc hết hạn.
- `zalo-logout` xoá dữ liệu đăng nhập trong Keychain.
- Trạng thái kênh, danh sách người đã ghép đôi, danh sách nhóm (bật/tắt từng nhóm), mã ghép đôi `channel: 'zalo'`.
- Thêm nguồn `zalo` vào `aris-stats`, như đã làm với Lark.

## 3. Giao diện (vẽ trước, chờ duyệt)

Vẽ khung `KenhZalo.dc.html` trên trang `g6`, chép khuôn `KenhLark.dc.html`. Phần Zalo nằm trong Cài đặt › Kênh và ghép đôi, dưới phần Lark.
- **Chưa kết nối:**
  - khung cảnh báo màu cam, đúng một câu: "Không chính thức, tài khoản Zalo có thể bị khoá. Nên thử bằng tài khoản phụ.";
  - ô chọn "Tôi hiểu" và ô chọn bot trả lời;
  - nút **"Hiện mã QR"**, rồi khung QR kèm đếm ngược.
- **Đã kết nối:**
  - ảnh đại diện và tên Zalo, trạng thái;
  - mã ghép đôi riêng của Zalo, người đã ghép đôi (có nút Gỡ);
  - danh sách nhóm có công tắc (mặc định tắt);
  - giới hạn tần suất (chỉ hiện, không sửa);
  - nút Đăng xuất.

**Điểm dừng 2:** chờ người dùng duyệt bản vẽ.

## 4. Thử thật (người dùng ngồi cạnh, nên dùng tài khoản phụ)

1. Người dùng quét QR. Trạng thái phải là "đang nghe".
2. Từ một tài khoản Zalo khác, nhắn mã ghép đôi, rồi nhắn một câu ngắn, rồi gửi một ảnh. Aris trả lời đúng phiên.
3. Từ một tài khoản chưa ghép đôi, nhắn thử: aris im lặng, chủ nhận được thông báo.
4. Mở Zalo Web trên trình duyệt: trạng thái đổi thành "tạm ngừng nghe". Đóng Zalo Web: aris tự nghe lại.
5. Khởi động lại daemon: aris tự đăng nhập lại, không cần quét QR.
6. Báo chi phí, và kiểm tra nguồn "Zalo" trong Thống kê.

## Ghi chép

- Ghi việc đã đọc tài liệu OpenClaw và README của `zca-js` vào `docs/clean-room-log.md`. Không chép mã.
- Viết `docs/specs/aris-zalo.md`: cách đăng nhập, giới hạn, rủi ro, cách chuyển sang Zalo Bot chính thức.

## Để sau (không làm trong plan này)

**Zalo Bot chính thức** (`bot.zaloplatforms.com`): token, `getUpdates`, không rủi ro bị khoá, nhưng người khác phải nhắn cho tài khoản bot. Bộ nối có thể dùng chung `zalo/channel.ts`, chỉ thay `sdk`.
