# Plan đợt 7d · Kênh Lark — để Sonnet làm

Người viết plan: Opus. Người làm: Sonnet 5.5 effort cao. Opus soát và commit.

## Hướng đã chốt với người dùng

- **Kênh chat Lark dùng SDK chính thức** `@larksuiteoapi/node-sdk@1.75.0`, đã cài trong `packages/aris-channels`. Nhận tin qua **kết nối dài** (`WSClient` + `EventDispatcher`, sự kiện `im.message.receive_v1`). Không cần server, không cần webhook.
- **Công cụ email, lịch, tài liệu cho bot dùng Lark MCP.** Đợt này chưa làm phần này; chỉ chừa chỗ trên giao diện (xem mục 4).
- **lark-cli không bắt buộc.** Nếu máy có `lark-cli` thì aris báo là bot dùng được qua lệnh shell, còn không có thì thôi (mục 5).

Bản vẽ: `design/canvas/KenhLark.dc.html` (khung 6.3c, có hai trạng thái "Lần đầu" và "Đã kết nối"). Đọc HTML; dữ liệu mẫu nằm trong `<script>` cuối tệp.

## Luật

- Không commit, không push. Không cài gói nào khác; SDK đã cài sẵn. Không dùng mạng, trừ khi chạy test thật lúc người dùng đã dán khoá (đợt này không có khoá, nên không gọi Lark thật).
- Không đọc khoá, không in khoá. App Secret đi qua `credentials` service, tức Keychain (`@aris/keychain`), như token Telegram đang làm.
- Chữ giao diện có đủ tiếng Anh và tiếng Việt, dùng `{you}`. Chú thích mã viết tiếng Việt có dấu.
- Không bịa dữ liệu.

## 1. Bộ nối Lark (`packages/aris-channels`)

- Đọc kỹ cách Telegram đang chạy: `hub.ts`, `telegram/api.ts`, `store.ts`, `domain.ts`, `api.ts`, `copy.ts`. Làm Lark theo **cùng khuôn**, dùng lại hub chung (định tuyến tin vào phiên, ghép đôi, hàng đợi bền, lệnh `/new` `/stop` `/status`, người lạ, quyền hạn chế, "Khi bot đang làm mà {you} nhắn thêm"). Chỗ nào hub đang viết cứng cho Telegram thì tách thành giao diện bộ nối (`ChannelAdapter`) có hai bản Telegram và Lark. **Không phá Telegram**: test của Telegram phải qua nguyên vẹn.
- Bộ nối Lark làm các việc sau:
  - **Kết nối:**
    - nhận `appId`, `appSecret` và miền (`larksuite.com` cho Lark quốc tế, `feishu.cn` cho Feishu; xem tham số `domain` của SDK);
    - kiểm khoá bằng một lời gọi nhẹ (lấy thông tin bot);
    - lưu `appId` và tên trong store, còn `appSecret` lưu vào kho khoá với tên `LARK_<MÃ BOT>_APP_SECRET`.
  - **Nhận tin:** `WSClient` với `EventDispatcher`, đăng ký `im.message.receive_v1`. Tin chữ (`text`) đọc nội dung; tin `post` thì lấy phần chữ; ảnh và tệp thì tải về như Telegram đang làm với ảnh, nếu SDK cho tải dễ.
  - **Gửi tin:** `im.message.create` (hay `reply`) dạng `text`. Câu trả lời dài hay có Markdown thì gửi dạng `interactive` (thẻ có markdown) hoặc `post`; chọn cách đơn giản, có giải thích trong mã.
  - **Danh tính:**
    - người dùng nhận ra bằng `open_id`; khoá người trong store là `lk-<open_id>`;
    - nhóm nhận ra bằng `chat_id`;
    - trong nhóm, bot chỉ trả lời khi được @nhắc, giống chính sách nhóm của Telegram.
  - **Ghép đôi:** dùng mã kênh `'lark'` sẵn có (`createCode(role, 'lark')`, `redeem(..., 'lark')`). Mã Telegram nhắn sang Lark thì trả lời "Mã này dành cho kênh khác."
  - **Tự kết nối lại:** khi mất kết nối, thử lại với thời gian chờ tăng dần, như Telegram đang làm với `startOrRetry`.
  - **Dừng khẩn cấp và hàng rào:** áp y như Telegram (`arisGuard.stopped()`, phiên bị hạn chế với người không phải chủ).
- **Test có fake thay cho SDK.** Tách phần gọi SDK sau một giao diện nhỏ để test được, không gọi mạng. Cần test:
  - ghép đôi Lark;
  - tin vào thì vào đúng phiên;
  - lượt xong thì trả lời;
  - mã khác kênh bị từ chối;
  - nhóm không @ thì im lặng;
  - người lạ thì báo chủ.

## 2. API (`/api/aris/channels`)

Thêm các thao tác cho Lark theo kiểu của Telegram:
- `connect-lark { bot, appId, appSecret, domain }`;
- `disconnect`;
- trạng thái ứng dụng: đang nhận tin, lỗi, đang thử lại;
- danh sách người đã ghép trên Lark;
- tạo mã với `channel: 'lark'`.

## 3. Giao diện (`packages/aris-ui-pages/src/client/settings/Channels.tsx`)

Phần Lark làm theo bản vẽ:
- **Chưa kết nối:**
  - bên trái là 5 bước, kèm danh sách quyền:
    - `im:message`, `im:message:send_as_bot`, `im:chat:read`, `contact:user.base:readonly`;
    - sự kiện `im.message.receive_v1`, chọn "kết nối dài";
  - bên phải là ô App ID, ô App Secret (`type=password`), nút chọn "Lark quốc tế / Feishu" và nút **Kết nối**.
- **Đã kết nối:**
  - danh sách ứng dụng (tên, `appId` rút gọn, trạng thái) và nút "+ Thêm ứng dụng";
  - **Ghép đôi**: mã cho {you} hay mã cho người khác, ghi "chỉ dùng được trên Lark";
  - **Người đã ghép đôi trên Lark**, có nút Gỡ;
  - dòng **Nhóm**.

## 4. Chừa chỗ cho Mai đọc email, lịch

Dòng "Mai đọc email, lịch" trong bản vẽ: đợt này chỉ hiện chữ "làm ở bước sau qua Lark MCP", không có nút. Ghi vào báo cáo.

## 5. lark-cli (tuỳ chọn)

Nếu trong PATH có `lark-cli` (tìm theo cách `aris-commander` dò các CLI ngoài), phần Lark hiện thêm một dòng nhỏ "lark-cli · có trên máy · bot dùng được qua lệnh shell". Không có thì không hiện gì. Không chạy `lark-cli` với lệnh nào ngoài `--version`.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`. Test Telegram cũ phải qua hết.
3. `npx eslint .`, `npx prettier --check .`.
4. `pnpm check:locale`, `pnpm check:licenses`, `pnpm check:deps`.
5. `node scripts/aris.mjs restart`, đợi 15 giây, rồi `status` (Telegram phải "đang nhận tin").

## Báo cáo cho Opus

- Các tệp đã sửa.
- Cách tách bộ nối khỏi hub.
- Cách gửi tin dài.
- Chỗ chưa làm được.
- Kết quả thật của từng bước kiểm tra.
- Danh sách địa chỉ hay cấu hình mà người dùng cần nhập trên trang Lark (nếu có).
