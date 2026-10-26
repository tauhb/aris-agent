# Plan Văn phòng làm việc — để Sonnet làm

Người viết plan: Opus. Người làm: Sonnet 5.5 effort cao. Opus soát và commit. Người dùng đã duyệt bản vẽ.

Mục tiêu: Văn phòng là nơi {you} **giao việc, theo dõi, nhận kết quả** mà không phải rời trang.

## Bản vẽ (nguồn sự thật)

Đọc HTML; dữ liệu mẫu nằm ngay trong tệp.

- `design/canvas/VanPhongNhatKy.dc.html`: cột phải "Vừa làm gì". Mỗi dòng có pill tên bot và pill trạng thái. Dòng "Xong" của Minh đang mở sẵn để thấy kết quả. Dòng chờ duyệt có nút ngay trên dòng.
- `design/canvas/VanPhongChatBot.dc.html`: bấm Thơ thì cột phải thành bảng chat gọn với Thơ.
- `design/canvas/VanPhongChatAris.dc.html`: chat với Aris, có khối "Đội đang làm" với nhánh của từng bot.

Thanh bên trái trong bản vẽ là bản vẽ cũ dùng dữ liệu mẫu, **không làm theo phần đó**. Chỉ làm vùng Văn phòng.

## Luật

- Không commit, không push, không dùng mạng, không cài gói, không đọc khoá. Log daemon chỉ đọc qua `sed 's/token=[^ &"]*/token=***/g'`.
- Chữ giao diện nằm trong `office/text.ts`, đủ tiếng Anh và tiếng Việt, dùng `{you}`. Không thêm dòng giải thích ngoài bản vẽ.
- **Không bịa dữ liệu.** Mọi dòng, mọi số, mọi kết quả đều lấy từ API thật. Bản vẽ có mà API chưa có thì thêm API (mục 1). Nếu không thêm được thì bỏ phần đó và ghi vào báo cáo.
- Màu dùng biến `--a-*`. Chuyển động tắt khi bật `prefers-reduced-motion`. Chú thích mã viết tiếng Việt có dấu.
- Giữ chức năng đang có: Drawer, chuông "Cần {you}", 2D/3D, tab Phòng ban và Kanban. Drawer cũ được thay bằng cột phải mới; bỏ hẳn tệp cũ nếu không còn chỗ nào dùng.

## 1. Máy chủ

### 1a. Dòng nhật ký biết phiên

- `aris-bots/src/live.ts`: `ActivityItem` thêm `session?: string`. Ghi mã phiên ở mọi chỗ tạo hoạt động: nhận việc, bắt đầu, xong, vấp, chờ. Gồm cả hoạt động của `aris ask` trong `aris-daemon/src/activity.ts`.
- `aris-stats/src/feed.ts`: `FeedItem` thêm hai trường:
  - `session?: string`;
  - `approval?: string`: mã yêu cầu đang chờ, chỉ có ở dòng xin duyệt còn treo.
- Thêm `kind: 'running'` cho việc đang chạy. Mỗi phiên đang chạy hiện một dòng "Đang làm", lấy từ `live.runningSessions()` và tên phiên. Có test cho hàm thuần gộp feed.

### 1b. Kết quả của một phiên

`GET /api/aris/stats?result=<phiên>` trả về:

```
{ session, bot, title, status, text, files: [{ path, name }], at }
```

- `status`: `running`, `done`, `failed` hay `waiting`.
- `text`: toàn văn câu trả lời cuối của bot, tức bước `assistant` cuối trong dữ liệu phát lại. Giao diện tự cắt khi hiện.
- `files`: các tệp bot đã ghi hay sửa trong phiên. Lấy từ các bước công cụ ghi tệp; xem tên công cụ thật trong dữ liệu phát lại (write, edit…). Bỏ trùng lặp, chỉ lấy đường dẫn tương đối hay tên tệp.
- Hàm rút kết quả là hàm thuần, có test.

### 1c. Đọc hội thoại cho bảng chat

Dùng lại `?replay=<phiên>`, vì nó đã có các bước `user`, `assistant`, `thinking` và `tool`, kèm `body`.
- Nếu `body` bị cắt (`bodyFull: false`) ở tin `user` hay `assistant`, thêm tham số để lấy đủ chữ hai loại tin này.
- Không đổi kết quả mặc định của `replay`, vì trang Phát lại đang dùng.

### 1d. Gửi tin vào phiên

Thêm `op: 'session-send'` trong `/api/aris/commander`, nhận `{ session, text, mode: 'steer' | 'queue' }`.
- Mở agent bằng `sessionController.resolveAgent`.
- Agent đang chạy và `mode` là `steer` thì gọi `agent.steer(msg)`.
- Các trường hợp còn lại gọi `agent.followup(msg)`. Phiên rảnh thì chạy luôn.
- Làm theo đúng cách `aris-channels` (Lark, Telegram) đang gửi tin. Kiểm tra độ dài và giới hạn quyền như `session-steer`.
- Tin gửi từ Văn phòng phải hiện trong phiên chat đầy đủ như tin {you} gõ trong chat.
- Có test.

Phiên mới với một bot: dùng `openBotSession(id, true)` có sẵn rồi `session-send`.

### 1e. Danh sách phiên của một bot

Ô chọn phiên trên đầu bảng chat cần 5 phiên gần nhất của bot, gồm mã, tên và thời điểm. Tìm API sẵn có trước (thanh bên, phiên của bot trong hồ sơ). Nếu chưa có thì thêm `GET /api/aris/bots?sessions=<bot>`.

## 2. Bố cục mới (`office/Office.tsx`, `Overview.tsx`, `Office3D.tsx`)

- Vùng Tổng quan chia hai: bên trái giữ phần đang có (Aris, bong bóng, 4 con số, tab phòng ban, các bàn); bên phải là **cột cố định rộng 384px**, viền trái, nền `--a-panel`, cao hết trang.
  - 2D và 3D **dùng chung** cột này. Bỏ khung "Vừa làm gì" nổi ở góc dưới trái của 3D.
  - Màn hẹp dưới khoảng 1100px: cột thành ngăn trượt, có nút mở ở góc phải.
- Trạng thái của cột: `{ view: 'feed' } | { view: 'chat', bot, session? }`.
  - Bấm một bàn hay một bot 3D thì mở chat với bot đó. Bàn đang mở có viền xanh.
  - Bấm Aris (linh vật lớn) thì mở chat với Aris.
  - "‹ Cả đội" quay về nhật ký.
  - Lưu `view` và `bot` cuối vào `localStorage` (bọc `try`).

## 3. Cột "Vừa làm gì" (`office/Feed.tsx` mới, thay `FeedRow.tsx`)

- **Đầu cột:** "Vừa làm gì", pill xanh "N kết quả mới", và ô chọn phạm vi: Hôm nay / 7 ngày.
- **Mỗi dòng gồm:**
  - giờ (mono);
  - linh vật có phụ kiện (`Mascot` với `accessory`);
  - **pill tên bot** theo màu bot, đúng như `.np` trong bản vẽ: nền là màu bot 15%, chữ là màu bot trộn mực;
  - **pill trạng thái**: Đang làm (chấm nháy), Xong, Chờ {you}, Lỗi;
  - một câu ngắn.
- **Dòng Xong có `session`:** bấm vào thì mở rộng tại chỗ, đọc `?result=`.
  - Hiện đoạn đầu của `text`, khoảng 280 ký tự, dạng Markdown gọn (in đậm, xuống dòng). Dùng bộ hiển thị Markdown sẵn có nếu có.
  - Hiện các tệp thành chip. Bấm chip thì mở tệp bằng cách sẵn có trong aris; không có thì sao chép đường dẫn.
  - Ba nút:
    - **Xem đầy đủ**: mở bảng chat ở đúng phiên đó;
    - **Sao chép**: sao chép toàn bộ `text`;
    - **Đã nhận ✓**.
- **Đã nhận và chưa nhận:**
  - dòng Xong chưa nhận có chấm xanh;
  - "Đã nhận" hay mở xem thì đánh dấu đã nhận, lưu trong `localStorage` theo mã phiên;
  - pill "N kết quả mới" đếm số dòng Xong chưa nhận trong phạm vi đang chọn.
- **Dòng chờ duyệt (`approval`):** các nút Từ chối, Duyệt, và Xem. Dùng đúng API duyệt mà chuông "Cần {you}" đang dùng. Duyệt xong thì dòng đổi trạng thái.
- **Dòng hỏi {you}:** nút Trả lời mở bảng chat ở phiên đó.
- **Dòng Lỗi:** bấm vào thì mở bảng chat ở phiên đó.
- Lọc theo tab phòng ban đang chọn ở bên trái, như hiện nay. Tự đọc lại mỗi 5 giây.

## 4. Bảng chat gọn (`office/ChatPanel.tsx` mới)

- **Đầu bảng:**
  - "‹ Cả đội";
  - linh vật 44px, tên, pill trạng thái;
  - ô chọn phiên: phiên đang chạy hay gần nhất, các phiên gần đây, và "＋ Phiên mới".
  - Mặc định mở phiên đang chạy của bot. Không có thì mở phiên gần nhất. Bot chưa có phiên nào thì để trống, gửi tin đầu tiên sẽ tạo phiên mới.
- **Thân bảng** đọc từ `?replay=` (mục 1c): mỗi 2 giây khi bot đang làm, mỗi 10 giây khi rảnh.
  - Tin `user` là bong bóng tối bên phải.
  - Tin `assistant` là bong bóng xám bên trái, kèm linh vật nhỏ, hiển thị Markdown gọn.
  - Các bước `thinking` và `tool` nằm giữa hai tin gộp thành **một dòng tiến độ**, ví dụ "Đang viết bản nháp 2 · 4 bước · 1 phút 20":
    - lúc đang chạy thì có chấm nháy, chữ là tiêu đề bước cuối;
    - xong rồi thì ghi "N bước · thời gian";
    - bấm vào thì xổ ra danh sách giờ và tiêu đề từng bước.
  - Tự cuộn xuống cuối khi có tin mới, trừ khi {you} đang cuộn lên đọc.
- **Chat với Aris:** khi phiên của Aris có việc giao cho bot khác, hiện khối **"Đội đang làm"** ngay sau tin Aris chia việc.
  - Khối có thanh tiến độ "k/n xong", mỗi bot một nhánh: linh vật, pill tên, pill trạng thái, việc.
  - Nhánh xong có nút **Xem kết quả**, mở bảng chat ở phiên của bot đó.
  - Nhánh chờ duyệt có nút Duyệt và Từ chối.
  - Nguồn: tìm cách khung chat đầy đủ đang vẽ nhánh giao việc trong `aris-ui-chat` (`taskline`, `branch.ts`, `TaskBranch`) và dùng lại dữ liệu đó, gồm các phiên con và việc của bot ngoài. Không viết lại logic giao việc.
- **Ô nhắn:**
  - Textarea 2 dòng. Enter để gửi, Shift+Enter để xuống dòng.
  - Khi bot đang làm, phía trên ô nhắn có nút chọn **Chèn vào việc** / **Xếp sau** (mặc định Chèn vào việc) và nút **■ Dừng**. Nút Dừng dùng `session-stop`; bot ngoài dùng `stopExternalRun`, như Drawer cũ.
  - Gửi bằng `session-send` (mục 1d). Gửi xong thì tin hiện ngay ở dạng "đang gửi" cho đến lần đọc kế tiếp.
  - Dòng dưới ô nhắn có "＋ Tệp" và "Mở phiên đầy đủ ↗".
    - "＋ Tệp": nếu không làm được gọn thì ẩn, ghi vào báo cáo.
    - "Mở phiên đầy đủ ↗": `nav.openSession(session)`.
- Bot ngoài (Claude Code, Codex) vẫn chat được nếu `session-send` hỗ trợ. Nếu không, bảng chỉ hiện tiến độ, ô nhắn đổi thành nút "Mở phiên đầy đủ", và ghi vào báo cáo.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`, có test mới cho:
   - feed có `session`, `running` và `approval`;
   - rút kết quả phiên;
   - `session-send`;
   - hàm thuần gộp bước thành dòng tiến độ;
   - đếm số kết quả chưa nhận.
3. `npx eslint .` và `npx prettier --check .`.
4. `pnpm check:locale`, `pnpm check:licenses`, `pnpm check:deps`.
5. `node scripts/aris.mjs restart`, đợi 15 giây, rồi chạy `status`: Telegram phải "đang nhận tin". Lark báo hết hạn mức API là lỗi đã có từ trước.

Không gửi tin thật cho bot để thử: mỗi lượt tốn tiền model. Opus sẽ tự thử trên web.

## Báo cáo cho Opus

- Các tệp đã sửa và tạo.
- Các API mới, kèm ví dụ dữ liệu trả về.
- Cách lấy nhánh "Đội đang làm" cho Aris.
- Chỗ khác bản vẽ, chỗ bỏ, và lý do.
- Kết quả thật của từng bước kiểm tra.
