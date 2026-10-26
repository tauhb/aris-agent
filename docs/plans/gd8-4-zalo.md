# Plan 8.4 · Kênh Zalo

Đọc trước `docs/plans/gd8-chung.md`. Làm theo khuôn của kênh Lark (`packages/aris-channels/src/lark/`, plan `docs/plans/gd7-7d-lark.md`): kênh chạy cạnh Telegram qua `hub.attachPeer`, mã ghép đôi riêng cho mỗi kênh. Kiểu kênh `'zalo'` đã có trong `store.ts`.

## Ba cách đưa Zalo vào aris (Opus đã tra ngày 26/10)

**A. Zalo Bot, nền tảng bot chính thức của Zalo (Opus đề xuất)**
- Tạo bot ở `bot.zaloplatforms.com`, nhận **mã token** dạng `số:bí mật`.
- Nhận tin bằng **hỏi định kỳ** (`getUpdates`), giống Telegram, nên **không cần server hay địa chỉ công khai**. Có webhook nhưng không bắt buộc.
- Gửi được chữ (tối đa 2.000 ký tự mỗi tin) và ảnh/tệp (mặc định tối đa 5 MB). Dùng được trong nhóm khi bot được @nhắc.
- Ưu điểm: chính thức, không rủi ro khoá tài khoản.
- Nhược điểm: người dùng và người khác nhắn cho **tài khoản bot**, không phải tài khoản Zalo cá nhân của người dùng.
- Nguồn đã đọc: tài liệu kênh Zalo của OpenClaw (`docs.openclaw.ai/.../channels/zalo`). Đây là dự án khác, không phải Hermes; chỉ đọc tài liệu, không chép mã.

**B. Zalo cá nhân qua thư viện không chính thức `zca-js`**
- Thư viện giả lập Zalo Web, đăng nhập bằng mã QR, đọc và trả lời ngay trên **tài khoản cá nhân** của người dùng.
- **Rủi ro bị khoá hay cấm tài khoản.** Chính tác giả thư viện cảnh báo điều này; OpenClaw cũng ghi "không chính thức, có thể bị khoá".
- Mỗi tài khoản chỉ chạy được một trình nghe: người dùng mở Zalo Web trên trình duyệt thì aris mất kết nối.
- Phải cài gói npm mới (cần người dùng đồng ý), và **chưa rõ giấy phép**: phải kiểm trước khi cài.

**C. Zalo OA (tài khoản doanh nghiệp đã xác thực)**
- Cần OA đã xác thực và **webhook có địa chỉ công khai**, nên gắn với việc lên server (việc 6 trong danh sách). Để sau.

## Điểm dừng 1 · Chọn cách

Trình bày ba cách trên, đề xuất **A**, rồi **chờ người dùng chọn**.
- Nếu người dùng chọn **B**: nhắc lại rủi ro bị khoá thành một câu rõ ràng. Hỏi người dùng có muốn dùng một tài khoản Zalo phụ để thử trước không. Rồi xin phép cài gói, kèm phiên bản chính xác và giấy phép.
- Có thể làm cả A lẫn B, nhưng làm A trước.

## Phần A · Zalo Bot

### A1. Tìm hiểu API

- Đọc tài liệu chính thức trên `bot.zaloplatforms.com` (được dùng mạng để đọc), ghi vào `docs/specs/aris-zalo.md`:
  - địa chỉ gốc của API;
  - các phương thức `getMe`, `getUpdates` (tham số chờ, offset), `sendMessage`, gửi ảnh và tệp, tải tệp về, `sendChatAction` nếu có;
  - cấu trúc tin đến: mã người gửi, mã cuộc trò chuyện, nhóm hay riêng, @nhắc;
  - giới hạn tần suất.
- Nếu tài liệu khác với mô tả ở trên thì báo người dùng trước khi làm tiếp.
- **Điểm dừng 2:** tóm tắt API cho người dùng. Hướng dẫn người dùng tạo bot và lấy token; người dùng tự dán token vào giao diện (mục A4), **không dán vào chat**.

### A2. Bộ nối `packages/aris-channels/src/zalo/`

Chép khuôn từ `lark/`, gồm các tệp: `channel.ts`, `access.ts`, `content.ts`, `copy.ts`, `sdk.ts` (tự gọi HTTP bằng `fetch`, không cần gói npm), `types.ts`.
- **Kết nối:**
  - nhận token và gọi `getMe` để kiểm tra;
  - lưu tên bot trong store; token lưu trong Keychain với tên `ZALO_<MÃ BOT>_TOKEN`.
- **Nhận tin:**
  - vòng `getUpdates` hỏi định kỳ, offset lưu bền;
  - tin chữ, ảnh, tệp: tải về theo cách Lark và Telegram đang làm.
- **Danh tính:**
  - khoá người là `zl-<mã người dùng>`;
  - trong nhóm, bot chỉ trả lời khi được @nhắc.
- **Ghép đôi:** `createCode(role, 'zalo')`, `redeem(..., 'zalo')`. Mã của kênh khác thì trả lời "Mã này dành cho kênh khác."
- **Gửi tin:**
  - chia tin dài theo 2.000 ký tự, cắt ở ranh giới đoạn hay câu;
  - Markdown đổi sang chữ thường dễ đọc, vì Zalo Bot không hiển thị Markdown (kiểm lại theo tài liệu).
- Dùng lại cơ chế chung của hub: hàng đợi bền, `/new`, `/stop`, `/status`, người lạ thì báo chủ, quyền hạn chế, "Khi bot đang làm mà {you} nhắn thêm", dừng khẩn cấp.
- **Tự kết nối lại:** bắt đầu 15 giây, gấp đôi mỗi lần, tối đa 5 phút, như `startOrRetry`.
- **Test** dùng bản giả của `sdk` (không gọi mạng):
  - ghép đôi;
  - tin vào đúng phiên;
  - lượt xong thì trả lời;
  - mã khác kênh;
  - nhóm không @nhắc thì im lặng;
  - người lạ;
  - chia tin dài;
  - offset không đọc lại tin cũ khi khởi động lại.

### A3. API `/api/aris/channels`

Thêm cho Zalo những gì Lark đang có:
- `connect-zalo { bot, token }`;
- `disconnect`;
- trạng thái kênh;
- danh sách người đã ghép đôi;
- mã ghép đôi với `channel: 'zalo'`.

### A4. Giao diện (vẽ trước, chờ duyệt)

Vẽ khung `KenhZalo.dc.html` trên trang `g6`, chép khuôn `KenhLark.dc.html`:
- **Chưa kết nối:** 3 bước tạo bot ở `bot.zaloplatforms.com`, ô Token (`type=password`), nút **Kết nối**.
- **Đã kết nối:** tên bot, trạng thái, mã ghép đôi riêng của Zalo, người đã ghép đôi (có nút Gỡ), dòng Nhóm.
- Phần Zalo nằm trong Cài đặt › Kênh và ghép đôi, dưới phần Lark.

**Điểm dừng 3:** chờ người dùng duyệt bản vẽ.

### A5. Thử thật

- Người dùng dán token và bấm Kết nối.
- Người dùng nhắn mã ghép đôi cho bot trên Zalo.
- Người dùng nhắn thử một câu ngắn, rồi gửi một ảnh. Thử thêm trong nhóm, nếu nền tảng cho bot vào nhóm.
- Kiểm tra phiên, câu trả lời và nguồn "Zalo" trong Thống kê. Phải thêm nguồn `zalo` vào `aris-stats`, như đã làm với Lark.

## Phần B · Zalo cá nhân (chỉ làm nếu người dùng chọn và đồng ý cài gói)

- Kiểm giấy phép `zca-js` bằng `npm view zca-js license` và tệp LICENSE trong gói. Báo người dùng, chờ đồng ý, rồi cài **đúng một phiên bản** vào `packages/aris-channels`.
- **Đăng nhập bằng QR trên giao diện:** hiện ảnh QR, người dùng quét bằng ứng dụng Zalo. Dữ liệu đăng nhập (cookie, imei) lưu trong Keychain, không lưu tệp thường.
- **Giảm rủi ro bị khoá:**
  - **chỉ trả lời người đã ghép đôi**, không bao giờ tự nhắn trước cho người lạ;
  - mỗi cuộc trò chuyện tối đa 1 tin mỗi 3 giây, tối đa 300 tin mỗi ngày;
  - không gửi hàng loạt;
  - nhóm thì mặc định tắt.
- Trình nghe bị ngắt (người dùng mở Zalo Web) thì báo "Zalo trên trình duyệt đang mở, aris tạm ngừng nghe" và thử lại chậm, không tranh với Zalo Web.
- **Giao diện:** khung cảnh báo màu cam, ghi đúng một câu "Không chính thức, tài khoản có thể bị khoá", kèm ô xác nhận "Tôi hiểu" trước nút Kết nối.
- Dùng chung khuôn bộ nối và test với phần A, chỉ khác `sdk`.

## Ghi chép

- Ghi việc đã đọc tài liệu OpenClaw và tài liệu Zalo vào `docs/clean-room-log.md`, như với Hermes cho nhất quán. Không chép mã.
- Cập nhật `docs/specs/aris-telegram.md` (phần kênh chung) hoặc tạo `docs/specs/aris-zalo.md`.
