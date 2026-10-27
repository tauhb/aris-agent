# Giai đoạn 8 · Luật chung cho bốn plan

Opus viết năm plan (người dùng chốt ngày 26/10). Sau đó người dùng đổi model của phiên chính sang Sonnet. **Sonnet làm trực tiếp trong phiên chính, không dùng subagent** (không gọi công cụ Agent).

Thứ tự làm, xong plan trước mới sang plan sau:

1. `gd8-1-kho-skill-connector.md`: **kết nối dùng chung làm trước**, rồi kho skill chung của đội (nhập từ GitHub, Claude Code, Codex) và gán skill cho từng bot.
2. `gd8-2-goal-cho-gop-skill.md`: phán quyết "chờ" của `/goal`, gộp skill trùng.
3. `gd8-3-dieu-khien-man-hinh.md`: bot điều khiển màn hình, phương án B, đề xuất lõi cua-driver.
4. `gd8-4-zalo.md`: kênh Zalo cá nhân (`zca-js`).
5. `gd8-5-connector.md`: danh mục connector, đăng nhập OAuth cho MCP hosted, connector API.

## Cách làm mỗi plan

1. Đọc hết plan, đọc các tệp mã mà plan chỉ tới, rồi tóm tắt lại cho người dùng bằng vài dòng.
2. **Gặp "Điểm dừng" trong plan thì dừng và hỏi người dùng.** Đưa các phương án, không tự chọn thay người dùng.
3. **Vẽ trước rồi mới làm.** Phần nào có giao diện mới thì vẽ lên canvas, gửi ảnh chụp, chờ người dùng duyệt rồi mới viết mã giao diện. Phần máy chủ có thể làm song song trong lúc chờ duyệt.
4. Viết mã kèm test, chạy đủ phần "Kiểm tra" ở cuối tệp này.
5. Thử trên aris thật trong trình duyệt của app (cách đăng nhập ở dưới). Gửi ảnh chụp cho người dùng.
6. Commit khi người dùng đồng ý. Dòng ký tên lấy theo hướng dẫn của hệ thống. Không push.

## Canvas (bản vẽ)

- Tệp gốc nằm ở `design/canvas/*.dc.html` và `design/canvas/canvas.json`. Mỗi khung là một tệp `.dc.html`, khai báo trong `canvas.json`: `page`, `x`, `y`, `w`, `h`, `title`, và thêm tên tệp vào `order`.
- Xem trước trên máy: `node <scratchpad>/canvas-serve.mjs design/canvas`, cổng 4317. Nếu scratchpad mất tệp đó thì viết lại một máy chủ tĩnh nhỏ: bỏ qua thư mục, trả `index` rỗng. Mở bằng `mcp__Claude_Browser__preview_start` với tham số `url`.
- Đăng bản vẽ lên artifact `https://claude.ai/artifact/UQ8fU6qsJ4HHNK9LQcYqYV`:
  1. chép các tệp đã sửa vào thư mục đăng `<scratchpad>/artifact-files/dde192ba-bff7-4db2-8257-574cb2f0d20a/project/`;
  2. gọi Artifact với `url`, `root` là thư mục cha của `project`, `file_path` là `<root>/project/canvas.json`, và `files` liệt kê các tệp `.dc.html` mới hay đã sửa;
  3. nếu bị từ chối vì chưa đọc bản đang đăng, gọi Artifact `read` với `paths` trước rồi đăng lại.
- Khuôn tệp `.dc.html`: chép từ một bản vẽ có sẵn cùng loại, ví dụ `KenhLark.dc.html` cho kênh, `PhuKienLinhVat.dc.html` cho trang thư viện. Màu theo `.t-light` / `.t-dark`, chữ dùng `{{you}}`.

## Đăng nhập vào web aris (không để lộ mã)

1. `node scripts/aris.mjs url > <scratchpad>/app-url.txt`. **Không in tệp này ra.**
2. Viết `<scratchpad>/redirect.mjs`: một máy chủ http trên `127.0.0.1:4399`, trả 302 về địa chỉ trong `app-url.txt`, tự tắt sau 60 giây. Chạy bằng Bash với `run_in_background`.
3. Gọi `mcp__Claude_Browser__preview_start` với `url: http://127.0.0.1:4399/`.
4. Xoá `redirect.mjs` ngay sau đó.

Mỗi lần `node scripts/aris.mjs restart` thì mã đăng nhập đổi, phải làm lại từ bước 1. Nếu chỉ sửa giao diện thì `pnpm build` rồi tải lại trang là đủ, không cần khởi động lại.

## Luật an toàn (không được bỏ)

- **Khoá và bí mật:**
  - không đọc, không in, không commit `.dsh-home/.credentials.yaml` và mọi khoá;
  - bí mật lưu vào Keychain qua `@aris/keychain` / dịch vụ `credentials`, như Telegram và Lark đang làm;
  - log daemon chỉ đọc qua `sed 's/token=[^ &"]*/token=***/g'`.
- **Mạng và gói:**
  - được đọc tài liệu trên mạng khi plan cho phép;
  - **không cài gói npm mới nếu người dùng chưa đồng ý**; khi xin, nêu tên gói, phiên bản chính xác và giấy phép;
  - `pnpm install --offline` để liên kết workspace thì được.
- **Máy của người dùng:** không đổi cài đặt bảo mật của macOS, không cấp quyền thay người dùng. Cần quyền gì (Trợ năng, Ghi màn hình) thì viết hướng dẫn để người dùng tự bật.
- **Git:** không `git checkout`, `git stash`, `git reset --hard`, không xoá tệp của người dùng mà chưa hỏi.
- **Mã của người khác:** không chép mã của Hermes Agent. Đọc tài liệu Hermes thì ghi vào `docs/clean-room-log.md`.
- **Chi phí:** mỗi lượt gửi tin thật cho bot đều tốn tiền. Chỉ thử những câu ngắn, báo chi phí sau khi thử.
- **Chữ giao diện:**
  - đủ tiếng Anh và tiếng Việt có dấu;
  - không viết cứng "anh", "chị", "Chủ nhân": dùng `{you}`;
  - không thêm dòng giải thích thừa ngoài bản vẽ.
- **Mã:** chú thích tiếng Việt có dấu, viết giống mã xung quanh (đặt tên, độ dài chú thích). Đặc tả gói cập nhật trong `docs/specs/<gói>.md`.

## Kiểm tra trước khi báo xong mỗi plan

1. `pnpm build`.
2. `npx vitest run`: test cũ phải qua hết.
3. `npx eslint .` và `npx prettier --check .`.
4. `pnpm check:locale`, `pnpm check:licenses`, `pnpm check:deps`.
5. `node scripts/aris.mjs restart`, đợi 15 giây, rồi `node scripts/aris.mjs status`:
   - Telegram phải "đang nhận tin";
   - Lark có thể đang báo hết hạn mức API (lỗi `99991403`), đó là lỗi có sẵn.
6. Thử trên web thật và gửi ảnh chụp cho người dùng.
7. Ghi một đoạn nghiệm thu ngắn vào `docs/ke-hoach-trien-khai.md`, mục giai đoạn 8. Ghi đúng việc đã thử, không nói quá.

## Tiến độ (27/10/2026)

- 8.1 phần B (kết nối MCP dùng chung): xong, commit `012ca88`.
- 8.1 phần A (kho skill chung, nhập skill, gán bot): xong, commit `7e83832` (máy chủ) và `6e2981e` (giao diện). Còn thiếu: kiểm tra bản mới tự động hằng tuần.
- 8.6 đã đẩy lên github.com/tauhb/aris-agent (private).
- 8.2 (`/goal` chờ, gộp skill trùng): xong 27/10, nghiệm thu ở `docs/ke-hoach-trien-khai.md`.
- 8.3 (điều khiển màn hình), 27/10: người dùng chọn lõi B1 cua-driver, đồng ý cài gói. **Đợt 1 xong** trên Cloud (gói `@aris/computer`, công cụ, an toàn, `aris computer doctor`, test; thử lõi thật trên màn hình ảo Linux). Bản vẽ duyệt 27/10, **giao diện xong**. Còn: thử thật trên Mac.
- 8.4 (Zalo cá nhân), cập nhật 27/10: đã cài `zca-js@2.2.0` (người dùng đồng ý), bộ nối, API, kho, Thống kê và test xong, đặc tả ở `docs/specs/aris-zalo.md`. Giao diện làm theo bản vẽ của 8.7 (thay `KenhZalo.dc.html`). Phần thử thật (quét QR, nhắn tin thật) cần tài khoản Zalo của người dùng, chưa làm.
- 8.5 (danh mục connector), 27/10: bản vẽ đã duyệt; danh mục, OAuth, API, giao diện và test xong (đợt 1: Notion, HubSpot, Canva, Meta Ads, Google Workspace). Chưa thử thật với hãng nào. Điểm dừng 3: người dùng chọn để Connector API sang sau (27/10).
- 8.4: người dùng muốn bàn lại cho một bot gắn được nhiều tài khoản kênh (Zalo, Telegram). Đã chốt 27/10 thành plan `gd8-7-nhieu-tai-khoan-kenh.md` (bản gọn, bốn đợt A → D). **Cả bốn đợt A → D và giao diện xong 27/10** (hai màn đã duyệt; "Connector không cần"). Chỉ kiểm bằng test tự động và trang dựng với dữ liệu giả; **chưa thử thật** với tài khoản Telegram, Zalo của người dùng (cách thử ở cuối plan 8.7). Chưa làm: nhận và thả cảm xúc trên Zalo, chuông báo trên web.
