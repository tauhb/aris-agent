# Đặc tả bot điều khiển màn hình (giai đoạn 8.3)

> Viết theo plan [gd8-3-dieu-khien-man-hinh.md](../plans/gd8-3-dieu-khien-man-hinh.md), phương án B, lõi B1 (cua-driver). Mã ở `packages/aris-computer/`. Ý tưởng ba chế độ quyền học từ bài so sánh về Hermes Agent (chỉ đọc tài liệu, xem [clean-room-log.md](../clean-room-log.md)); aris bỏ chế độ "không hỏi gì".

## Rủi ro: đọc trước khi dùng

Bot bấm và gõ trên máy thật của người dùng. Vì vậy: **tắt mặc định** theo từng bot, mọi thao tác thay đổi đều hỏi duyệt (trừ khi người dùng chọn "trong phạm vi"), có danh sách chặn cứng, và có trần mỗi lượt.

Lõi cua-driver dùng API không công khai của Apple (SkyLight) để gửi sự kiện ở nền; một bản cập nhật macOS có thể làm hỏng. Ứng dụng tự vẽ (game, Blender) không có cây Trợ năng: bot chỉ bấm được theo toạ độ trên ảnh.

## Lõi thao tác

- Gói `@trycua/cua-driver@0.37.0` (MIT; tệp nhị phân Rust theo máy đi trong gói phụ của npm, bản macOS chip M khoảng 64,5 MB, giấy phép `MIT AND MPL-2.0`; kéo theo `@ubjs/core` và `@ubjs/node` 0.31.0-3, MPL-2.0). Người dùng đồng ý cài ngày 27/10.
- Chạy **trong tiến trình aris** (`CuaDriver.create({ embedded: true })`), không cần cài CuaDriver.app. Vì vậy **macOS tính quyền Trợ năng và Ghi màn hình cho chính tiến trình aris** (tệp `node` mà launchd chạy, xem `aris computer doctor`).
- Lõi nạp khi có lời gọi đầu tiên; nạp lỗi thì thử lại sau một phút. aris vẫn chạy khi không có lõi, công cụ báo "chưa có lõi".
- Thao tác gửi **ở nền** (`Background`): không đưa cửa sổ lên trước, không giành chuột. Ứng dụng không nhận được sự kiện nền thì lõi báo lỗi; aris không tự chuyển sang tiền cảnh.
- Mọi lệnh đi qua giao diện chung `ComputerDriver` (`src/types.ts`); bộ nối cua-driver nằm trọn trong `src/cua.ts`. Đổi lõi sau này không phải sửa lớp công cụ và lớp an toàn.

**Toạ độ.** `x`, `y` bot thấy và gửi là **điểm ảnh của ảnh chụp cửa sổ** lõi trả về (cạnh dài tối đa 1.280 điểm ảnh), gốc ở góc trên trái cửa sổ. Lõi tự đổi ra toạ độ màn hình (Retina, màn hình phụ). Khung phần tử theo toạ độ màn hình được đổi sang khung trên ảnh (`src/coords.ts`) để đánh dấu và để biết bot sắp bấm vào phần tử nào.

## Công cụ cho bot

| Công cụ | Việc | Loại thao tác |
|---|---|---|
| `man_hinh_xem` | Chụp một cửa sổ: danh sách cửa sổ đang mở, phần tử bấm được (mã, vai, nhãn, tâm `@x,y`), ảnh chụp nếu model đọc được ảnh | xem |
| `man_hinh_tim` | Chỉ cây Trợ năng (lọc theo `tu_khoa`), không chụp ảnh | xem |
| `man_hinh_bam` | Bấm theo `phan_tu` (ưu tiên) hay `x`, `y`; nút trái/phải, 1–3 lần | bấm |
| `man_hinh_keo`, `man_hinh_cuon` | Kéo trong cửa sổ, cuộn | bấm |
| `man_hinh_go` | Gõ chữ; có `phan_tu` thì bấm vào ô đó trước | gõ |
| `man_hinh_phim` | Phím tắt (`cmd+shift+s`, `⌘S`, `enter`…) | phím |
| `ung_dung_mo` | Mở ứng dụng (ở nền) | mở |

Cửa sổ chọn theo `cua_so` (`pid:mã cửa sổ` từ `man_hinh_xem`), không thì theo `ung_dung`, không thì cửa sổ vừa làm, không thì ứng dụng đang ở trước. Mã phần tử hết hạn khi chụp lại cửa sổ đó; mã cũ thì bị từ chối kèm lời dặn chụp lại.

**Model đọc ảnh** (người dùng chốt 27/10): bot luôn nhận danh sách phần tử; ảnh chụp chỉ đính kèm khi model của phiên khai báo đọc được ảnh (cùng cách kiểm như `read_image` của dsh: `llm.resolveModelInfo(...).inputModalities` có `image`). Ảnh lưu qua dịch vụ `attachments` của dsh rồi trả trong kết quả công cụ. Model không đọc ảnh thì kết quả ghi rõ "chỉ dựa vào danh sách phần tử".

## Quyền và an toàn

**Cài đặt theo bot** (kho `aris_computer`, bảng `settings`, khoá là mã bot):

| Trường | Ý nghĩa |
|---|---|
| `on` | Bật điều khiển máy. Mặc định **tắt** |
| `mode` | `ask`: hỏi từng bước (mặc định). `bounded`: trong phạm vi |
| `apps` | Ứng dụng được phép trong chế độ trong phạm vi (tên hay bundle id) |
| `actions` | Loại thao tác được phép trong chế độ trong phạm vi: `xem`, `bam`, `go`, `phim`, `mo` |

**Duyệt** (hook `tools/pre-execute`, `src/gate.ts`), theo thứ tự:
1. Bot chưa bật: từ chối.
2. Tra bối cảnh trên máy (ứng dụng đích, phần tử dưới chỗ bấm, phím). Tham số sai, mã phần tử cũ, thiếu lõi: từ chối kèm lời dặn cho bot, không hỏi người dùng.
3. **Chặn cứng**: từ chối, áp cả khi đã duyệt.
4. Chế độ **trong phạm vi**: ứng dụng và loại thao tác nằm trong danh sách thì tự làm, ngoài danh sách thì **từ chối, không hỏi**.
5. Chế độ **hỏi từng bước**: thao tác thay đổi luôn hỏi, kèm một dòng mô tả ("Khoa muốn điều khiển máy: Bấm AXButton "Ghi chú mới" trong Notes"); xem màn hình chỉ hỏi lần đầu mỗi phiên. Ảnh cửa sổ và chỗ đánh dấu của việc đang chờ duyệt giữ 30 phút theo mã lời gọi (`GET /api/aris/computer?preview=<callId>`) cho thẻ duyệt.
6. Không có chế độ "không hỏi gì".

Lượt có tin của người không phải chủ nhân (khách, người được phép trên kênh) bị hàng rào chung chặn mọi công cụ không phải công cụ đọc, nên khách không điều khiển được máy.

**Chặn cứng** (`src/policy.ts`, xét ở bước duyệt và **xét lại ngay trước khi làm**, vì màn hình có thể đã đổi):
- mọi thao tác, kể cả xem, trong: Cài đặt hệ thống, Keychain Access, Mật khẩu, 1Password, Bitwarden, Terminal, iTerm, Trình cài đặt (theo bundle id hay tên Anh, Việt); mở các ứng dụng đó;
- bấm hay gõ vào ô mật khẩu (vai bảo mật, hay ô nhập có nhãn mật khẩu): đăng nhập để người dùng tự làm bằng "Cầm lái";
- phím khoá máy (`ctrl+cmd+q`), đăng xuất (`cmd+shift+q`, `cmd+option+shift+q`), buộc thoát (`cmd+option+esc`), phím nguồn;
- thao tác khi màn hình đang khoá (`CGSSessionScreenIsLocked` qua `ioreg`);
- kéo thả vào Thùng rác.

**Phần chạy** (`src/runtime.ts`):
- **Một bot một lúc** điều khiển máy; phiên khác chờ (tối đa 10 phút) tới khi lượt của bot đang làm xong. Bot giữ máy mà 2 phút không thao tác thì tự nhả.
- **Trần mỗi lượt**: 40 ảnh chụp và 150 thao tác (đọc cây không tính là ảnh). Chạm trần thì báo bot dừng và hỏi người dùng.
- **Cầm lái**: người dùng bấm "Cầm lái" (`POST { op: 'take', session }`) thì bot của phiên đó chờ tới khi "Trả lại" (`op: 'give'`), tối đa 30 phút.
- **Người dùng đang dùng máy** (động chuột hay phím trong 2 giây, `HIDIdleTime` qua `ioreg`): lõi nền chỉ tạm dừng khi người dùng đang ở **đúng ứng dụng** bot làm; lõi tiền cảnh thì luôn tạm dừng. Chờ tối đa 1 phút rồi báo "người dùng đang dùng máy".
- **Dừng khẩn cấp** của aris (`arisGuard.stopped()`): không điều khiển máy.

## API `/api/aris/computer`

| Thao tác | Việc |
|---|---|
| `GET` | Cài đặt theo bot, mặc định, ai đang giữ máy, tên lõi đã nạp, lỗi nạp lõi |
| `GET ?doctor=1` | Báo cáo kiểm tra (như `aris computer doctor`) |
| `GET ?preview=<callId>` | Ảnh cửa sổ (base64) và chỗ đánh dấu của việc đang chờ duyệt |
| `POST { op: 'set', bot, settings }` | Đổi cài đặt của bot |
| `POST { op: 'take' \| 'give', session }` | Cầm lái / Trả lại |

Dịch vụ `arisComputer` cho plugin khác: `settings(bot)`, `preview(callId)`, `holder()`, `doctor()`.

## `aris computer doctor`

Lệnh dòng lệnh gọi daemon qua socket (`POST /computer-doctor`). Kiểm: hệ điều hành, lõi nạp được, quyền Trợ năng, quyền Ghi màn hình, và in **đường dẫn tiến trình được macOS tính quyền** (`process.execPath` của daemon) cùng lệnh mở đúng trang Cài đặt hệ thống (`open "x-apple.systempreferences:…Privacy_Accessibility"`, `…Privacy_ScreenCapture`). **Không tự cấp quyền.**

## Kiểm thử

- Tự động (`src/*.test.ts`, lõi giả `FakeDriver`, không đụng máy thật): phân tích phím tắt và tổ hợp nguy hiểm; đổi toạ độ (Retina thu nhỏ, màn hình phụ toạ độ âm), phần tử dưới điểm bấm; chặn cứng (ứng dụng, ô mật khẩu, Thùng rác, phím, màn hình khoá); hai chế độ quyền (theo ứng dụng, theo loại thao tác); xem chỉ hỏi lần đầu; khoá một bot một lúc và tự nhả; trần ảnh và thao tác, đếm lại mỗi lượt; cầm lái; người dùng đang dùng máy (nền và tiền cảnh); dừng khẩn cấp; lỗi rõ khi thiếu lõi, mã cũ, toạ độ ngoài ảnh; tám công cụ và khối ảnh trong kết quả; `computer doctor`; đường `/computer-doctor` của daemon.
- **Đã thử lõi thật trên Linux** (máy Cloud, màn hình ảo Xvfb, xterm), 27/10: liệt kê cửa sổ, chụp cửa sổ, bấm theo toạ độ, gõ chữ, phím tắt, cuộn; trọn đường đi duyệt → làm (xem thì hỏi, gõ thì hỏi kèm mô tả, phím khoá máy bị chặn); ảnh chụp sau khi gõ cho thấy lệnh đã chạy trong xterm. Máy Cloud không có bus Trợ năng nên chưa thử đọc phần tử và bấm theo mã.
- **Chưa thử trên Mac** (cần máy của người dùng, B-5 của plan): quyền Trợ năng và Ghi màn hình (macOS tính cho tiến trình nào khi chạy dưới launchd), cây Trợ năng và bấm theo mã phần tử, gửi nền có thật không giành chuột, đọc `HIDIdleTime` và màn hình khoá, tên vai của ô mật khẩu trên macOS, số token mỗi ảnh.

## Chưa làm (đợt sau của plan)

- Giao diện: thẻ duyệt có ảnh và vùng đánh dấu, khung ảnh màn hình mới nhất trong bảng chat, nút Cầm lái / Trả lại, Hồ sơ bot › Quyền › Điều khiển máy. Cần vẽ trước, chờ duyệt (Điểm dừng 3).
- Ghi lần chặn vào nhật ký chặn của `@aris/guard` (hiện chỉ trả lý do cho bot).
