# Plan 8.3 · Bot điều khiển màn hình (computer-use)

Đọc trước `docs/plans/gd8-chung.md`. Đây là việc **rủi ro cao nhất** trong giai đoạn 8, vì bot sẽ bấm và gõ trên máy thật của người dùng. Làm chậm, hỏi nhiều.

## Hiện trạng (Opus đã kiểm trên máy)

- dsh bản đang dùng **không có** công cụ computer-use (đã kiểm ngày 25/10, ghi trong `docs/ke-hoach-trien-khai.md`). Aris đã có trình duyệt tự động qua Playwright MCP (mẫu kết nối `browser`), nhưng công cụ đó chỉ điều khiển trình duyệt, không điều khiển cả máy.
- Trên máy có sẵn:
  - `swiftc` (Command Line Tools, Swift 6.3);
  - `/usr/sbin/screencapture` (có sẵn trong macOS);
  - `cliclick` ở `/opt/homebrew/bin` (người dùng tự cài, máy khác chưa chắc có).
- Codex trên máy có sẵn computer-use riêng của OpenAI: `~/.codex/computer-use/Codex Computer Use.app`, plugin `computer-use@openai-bundled`. Aris đã có bot ngoài Lan chạy Codex (`codex app-server`).

## Điểm dừng 1 · Chọn phương án

Trình bày cho người dùng ba phương án dưới đây, kèm đề xuất. **Chờ người dùng chọn rồi mới làm.**

**A. Giao cho Lan (Codex) dùng computer-use của Codex**
- Ít mã nhất: sửa mô tả năng lực của Lan để Aris biết giao việc "thao tác trên máy" cho Lan, và kiểm tra luồng xin quyền của Codex đi về thanh duyệt của aris.
- Nhược điểm:
  - phụ thuộc ứng dụng và gói cước ChatGPT của người dùng;
  - chỉ một bot dùng được;
  - aris không xem được từng thao tác, chỉ thấy những bước Codex báo về;
  - không chạy được trên máy không có Codex.

**B. Aris tự làm bộ công cụ điều khiển máy (Opus đề xuất)**
- Mọi bot được cấp quyền đều dùng được.
- Duyệt từng thao tác qua hàng rào của aris, xem được màn hình của bot, cầm lái lại được.
- Dùng `screencapture` có sẵn và một chương trình nhỏ viết bằng Swift, dịch ngay trên máy bằng `swiftc`. Không tải tệp nhị phân lạ.
- Nhược điểm:
  - nhiều việc hơn;
  - người dùng phải tự cấp quyền **Trợ năng** và **Ghi màn hình** trong Cài đặt hệ thống;
  - ảnh chụp màn hình tốn token.

**C. Dùng máy chủ MCP computer-use của Codex làm một kết nối trong aris.** Không đề xuất: đó là phần mềm đóng của OpenAI, đã bị tắt trong cấu hình, chỉ chạy được bên trong Codex, và điều khoản sử dụng không rõ.

Phần còn lại của plan viết cho phương án **B**. Nếu người dùng chọn **A**, chỉ làm mục "Nếu chọn A" ở cuối rồi dừng.

## Điểm dừng 2 · Thử khả năng đọc ảnh của model

Trước khi viết công cụ, kiểm tra model trong chuỗi chat có đọc được ảnh không, và mỗi ảnh tốn bao nhiêu token.
- Cách thử: nhờ một bot đọc một ảnh nhỏ, ví dụ ảnh chụp màn hình 1280px, qua cơ chế ảnh sẵn có của aris (Telegram và Playwright MCP đã gửi ảnh cho model).
- Nếu model không đọc được ảnh: báo người dùng. Cách đi khi đó là chỉ dùng cây Trợ năng (AX tree: danh sách nút và ô nhập kèm vị trí), không dùng ảnh; hoặc chọn một model có đọc ảnh cho riêng việc này. **Chờ người dùng quyết.**

## B1. Chương trình phụ `aris-cua`

- Mã nguồn đặt trong gói mới `packages/aris-computer/native/main.swift`. Chỉ dùng thư viện của Apple: CoreGraphics, ApplicationServices, AppKit.
- Lệnh `pnpm aris:cli computer setup`, hoặc tự chạy lần đầu dùng: dịch bằng `xcrun swiftc -O`, ra tệp `~/.aris/bin/aris-cua`. Ghi kèm mã băm (sha256) của mã nguồn đã dịch; mã nguồn đổi thì dịch lại.
- **Giao tiếp:** mỗi lệnh là một lần chạy, nhận tham số JSON qua stdin và trả JSON qua stdout. Các lệnh:
  - `screens`: các màn hình, kích thước, tỉ lệ điểm ảnh;
  - `windows`: cửa sổ đang mở (ứng dụng, tiêu đề, vị trí), dùng `CGWindowListCopyWindowInfo`;
  - `front`: ứng dụng đang ở trước;
  - `move x y`, `click x y [left|right] [count]`, `drag x1 y1 x2 y2`, `scroll dx dy`;
  - `type "chữ"`: gõ theo Unicode bằng `CGEventKeyboardSetUnicodeString`, có tiếng Việt;
  - `key "cmd+shift+4"`;
  - `ax-at x y`: phần tử dưới con trỏ (vai trò, nhãn, có phải ô mật khẩu không, kiểu `AXSecureTextField`);
  - `ax-tree [app]`: cây Trợ năng rút gọn, tối đa 300 nút;
  - `idle`: số giây kể từ lần cuối người dùng tự động chuột hay phím (`CGEventSourceSecondsSinceLastEventType`).
- **Ảnh chụp:** dùng `screencapture -x -t png` (cả màn hình, hoặc `-R` cho một vùng). Thu nhỏ về cạnh dài tối đa 1280px. Trả về đường dẫn tệp và tỉ lệ đổi toạ độ.
- **Quyền:** lần đầu chạy, nếu thiếu quyền Trợ năng (`AXIsProcessTrusted`) hay Ghi màn hình, thì trả lỗi rõ ràng. Giao diện hiện hướng dẫn ba bước và nút "Mở Cài đặt", nút này chỉ chạy `open "x-apple.systempreferences:..."`. **Không tự cấp quyền.** Cần thử xem macOS tính quyền cho `aris-cua` hay cho tiến trình daemon (node dưới launchd), rồi viết đúng vào hướng dẫn.

## B2. Công cụ cho bot (`@aris/computer`)

Viết bằng `defineTool`, tên tiếng Việt như các công cụ khác của aris:
- `man_hinh_xem`: chụp màn hình và trả ảnh cho model, kèm danh sách cửa sổ và ứng dụng đang ở trước;
- `man_hinh_bam`, `man_hinh_keo`, `man_hinh_cuon`;
- `man_hinh_go`, `man_hinh_phim`;
- `man_hinh_tim`: cây Trợ năng của ứng dụng đang ở trước, để bấm theo nhãn thay vì đoán toạ độ;
- `ung_dung_mo`: chạy `open -a "<tên>"`.

Toạ độ trong công cụ tính theo **ảnh đã thu nhỏ**; công cụ tự đổi sang toạ độ thật.

## B3. Quyền và an toàn

- **Bật theo bot:** thêm `tools.computer` vào hồ sơ bot, mặc định tắt. Chỉ bot được bật mới thấy các công cụ `man_hinh_*`. Aris có giao việc thì cũng chỉ giao cho bot đã bật.
- **Duyệt:**
  - `man_hinh_xem` và `man_hinh_tim` là thao tác chỉ đọc. Lần đầu mỗi phiên thì hỏi, sau đó tự làm.
  - Mọi thao tác bấm, gõ, phím, kéo, cuộn và mở ứng dụng đều **hỏi duyệt từng lần**. Thẻ duyệt kèm ảnh chụp có đánh dấu chỗ sẽ bấm.
  - Người dùng có thể chọn "Tự làm trong ứng dụng X trong phiên này". Lựa chọn này hết hiệu lực khi phiên kết thúc.
- **Chặn cứng**, không duyệt được:
  - gõ vào ô mật khẩu (`AXSecureTextField`);
  - thao tác trong các ứng dụng: Cài đặt hệ thống, Truy cập Chuỗi khoá (Keychain Access), 1Password, Bitwarden, Terminal, iTerm. Muốn chạy lệnh thì dùng công cụ `bash` có hàng rào;
  - phím tắt khoá máy, đăng xuất, tắt máy;
  - thao tác khi màn hình đang khoá.

  Danh sách này để ở `@aris/guard` cạnh danh sách cấm cứng đang có.
- **Một bot một lúc:** chỉ một phiên được điều khiển máy tại một thời điểm, các phiên khác xếp hàng.
- **Người dùng giành lại quyền:**
  - nếu `idle` dưới 2 giây (người dùng đang tự dùng chuột hay phím), bot tự **tạm dừng** và báo "{you} đang dùng máy". Chạy tiếp khi người dùng bấm "Trả lại";
  - nút dừng khẩn cấp (`arisGuard.stopped()`) dừng mọi thao tác ngay.
- **Trần:** mỗi lượt tối đa 40 ảnh chụp và 150 thao tác. Vượt thì dừng và hỏi.

## B4. Màn hình của bot (vẽ trước, chờ duyệt)

Vẽ khung `ManHinhBot.dc.html` trên trang `vp`. Đã có bản vẽ cũ `ManHinhBot.dc.html` (màn 6.6): đọc trước, rồi sửa theo bảng chat gọn của Văn phòng.
- Trong **bảng chat gọn** của Văn phòng, khi bot đang dùng công cụ màn hình:
  - phía trên dòng tiến độ có một khung ảnh màn hình mới nhất, cỡ nhỏ, đánh dấu chỗ vừa bấm;
  - bấm vào ảnh thì phóng to.
- Nút **"Cầm lái"** tạm dừng bot để người dùng tự làm, ví dụ đăng nhập hay nhập mã 2FA; nút **"Trả lại"** cho bot chạy tiếp.
- Thẻ duyệt thao tác hiện cả ở bảng chat lẫn ở chuông "Cần {you}".
- **Hồ sơ bot › Quyền** có công tắc "Điều khiển máy" kèm trạng thái quyền của macOS: đã cấp / chưa cấp, nút Hướng dẫn.

**Điểm dừng 3:** chờ người dùng duyệt bản vẽ.

## B5. Thử thật (có người dùng ngồi cạnh)

1. Người dùng bật "Điều khiển máy" cho một bot, ví dụ Khoa, và tự cấp quyền theo hướng dẫn.
2. Việc thử an toàn: "Mở ứng dụng Ghi chú (Notes), tạo ghi chú mới với nội dung 'aris thử điều khiển máy', rồi chụp màn hình xác nhận." Duyệt từng bước.
3. Thử chặn cứng: nhờ bot mở Cài đặt hệ thống thì phải bị từ chối.
4. Thử giành lại quyền: rê chuột giữa chừng thì bot phải tạm dừng.
5. Báo số ảnh chụp, số token, chi phí.

## Test bắt buộc

- Đổi toạ độ giữa ảnh thu nhỏ và màn hình thật, kể cả màn Retina và nhiều màn hình.
- Phân tích phím tắt (`cmd+shift+4`…).
- Luật chặn cứng (ứng dụng, ô mật khẩu), luật duyệt (chỉ đọc hay thay đổi), "tự làm trong ứng dụng X".
- Khoá một bot một lúc, trần thao tác.
- Không có `swiftc` hay thiếu quyền thì trả lỗi rõ ràng.
- Mã Swift không có test tự động, nhưng phải có lệnh `aris-cua selftest`: chạy `screens`, `front`, `idle`, không bấm gì.
- Viết `docs/specs/aris-computer.md`.

## Nếu chọn A

- Sửa mô tả năng lực của Lan trong `aris-bots` (hồ sơ bot) để Aris giao việc "thao tác ứng dụng trên máy" cho Lan.
- Kiểm tra cấu hình Codex của người dùng có bật plugin computer-use không: **chỉ đọc và báo**, không sửa `~/.codex/config.toml`.
- Thử một việc nhỏ với người dùng ngồi cạnh. Ghi rõ những gì aris thấy và không thấy được.
