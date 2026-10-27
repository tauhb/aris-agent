# Plan 8.3 · Bot điều khiển màn hình (computer-use) · phương án B

Đọc trước `docs/plans/gd8-chung.md`.

Ngày 26/10 người dùng chọn **phương án B**: aris tự có bộ công cụ điều khiển máy. Họ cũng muốn tham khảo những repo đang làm việc này tốt. Đây là việc **rủi ro cao nhất** trong giai đoạn 8, vì bot bấm và gõ trên máy thật. Làm chậm, hỏi nhiều.

## Hiện trạng (Opus đã kiểm trên máy)

- dsh bản đang dùng **không có** công cụ computer-use. Aris đã có trình duyệt tự động qua Playwright MCP (mẫu kết nối `browser`), nhưng chỉ cho trình duyệt.
- Trên máy có:
  - `swiftc` (Swift 6.3);
  - `screencapture`;
  - `cliclick` (`/opt/homebrew`);
  - Node, dùng được thư viện Node có sẵn bản cho máy.

## Tham khảo (Opus đã tra ngày 26/10)

Chỉ đọc tài liệu và kiến trúc. **Không chép mã của Hermes.** Ghi việc đã đọc vào `docs/clean-room-log.md`.

1. **Hermes Agent** (MIT), đọc qua bài so sánh tháng 9/2026 ([codenote.net](https://codenote.net/en/posts/computer-use-agents-macos-windows-selection-notes-2026/)):
   - **Kiến trúc:** Hermes chỉ là lớp điều phối. Bộ công cụ `computer_use` gọi **cua-driver** qua MCP (stdio). Model nào cũng dùng được.
   - **Lệnh:** `computer-use install | status | doctor` để cài driver và báo thiếu quyền.
   - **Ba chế độ quyền:**
     - `standard`: hỏi từng thao tác. Đây là mặc định; `click`, `type`, `drag`, `scroll`, `key`, `focus_app` đều phải duyệt.
     - `bounded`: chỉ cho các thao tác nằm trong một danh sách năng lực khai báo trước, ngoài danh sách thì từ chối.
     - `unrestricted`: không hỏi, chỉ nên dùng trong máy ảo.
   - Chặn cứng lệnh nguy hiểm.
   - **Aris học theo ý tưởng này,** tự viết mã của mình.
2. **cua-driver** của trycua: **MIT**, npm `@trycua/cua-driver` 0.37.0 ("Rust-backed Cua Driver SDK and embedded Node host"), repo `github.com/trycua/cua`.
   - Lớp thao tác dùng chung: chụp màn hình, đọc phần tử giao diện (Accessibility), gửi chuột và phím. Có SDK cho TypeScript, máy chủ MCP và dòng lệnh.
   - **Ưu điểm lớn:** trên macOS, nó gửi sự kiện theo từng tiến trình (PID) qua API Trợ năng và SPI SkyLight, **không di chuyển con trỏ của người dùng**. Bot làm "nền" được trong lúc người dùng vẫn dùng máy, dù không bảo đảm với mọi ứng dụng.
   - **Nhược điểm:** dùng SPI không công khai của Apple nên có thể hỏng khi cập nhật macOS; không chạy được với ứng dụng tự vẽ (Blender, game).
3. **Peekaboo** (steipete), MIT, Swift: dòng lệnh và máy chủ MCP cho macOS.
   - Chụp cửa sổ hay màn hình, `click --on "<nhãn>"` (tìm phần tử theo nhãn rồi bấm), gõ phím.
   - Cài bằng Homebrew hoặc `npx @steipete/peekaboo` (cần Node 22 trở lên). Bản 3 đang beta.
   - Thao tác ở tiền cảnh (di chuyển con trỏ thật).
4. **UI-TARS Desktop** và **Agent S** (Apache-2.0): chỉ dựa vào ảnh chụp, mặc định một màn hình. Chỉ tham khảo cách nhắc model và cách bám toạ độ, không dùng làm lõi.

## Cập nhật 27/10 (kiểm lại trên npm)

- `@trycua/cua-driver@0.37.0`: MIT, gói chính 1,1 MB. Tệp nhị phân Rust đi theo **gói phụ tuỳ chọn của npm** theo máy (`@trycua/cua-driver-darwin-arm64@0.37.0`: `MIT AND MPL-2.0`, 64,5 MB khi giải nén), tải từ npm lúc `pnpm install`, không tải thêm lúc chạy (cần xác nhận lại trên Mac). Kéo theo `@ubjs/core` và `@ubjs/node` bản `0.31.0-3` (MPL-2.0, có trong danh sách cho phép của `check:licenses`).
- Peekaboo đã lên bản **4.9.7** (MIT), không còn là bản 3 beta.
- **Chia việc theo nơi làm:**
  - *Làm được trên Cloud* (không cần Mac): gói `@aris/computer` với `ComputerDriver` và bản giả, đổi toạ độ, phân tích phím tắt, lớp an toàn (chặn cứng, hai chế độ quyền, khoá một bot, trần thao tác, tạm dừng khi người dùng dùng máy), các công cụ `man_hinh_*`, thẻ duyệt có ảnh đánh dấu, phần logic của `computer doctor`, test, đặc tả, bản vẽ, giao diện.
  - *Cần máy Mac của người dùng*: nối cua-driver thật, quyền Trợ năng và Ghi màn hình (macOS tính cho tiến trình nào), chế độ nền có thật không giành chuột, `computer doctor` thật, toàn bộ B-5.
- **Thứ tự đợt:** (1) Cloud: lõi giả, an toàn, công cụ, test → (2) bản vẽ, chờ duyệt → (3) giao diện → (4) trên Mac: nối lõi thật, doctor, thử thật B-5.

## Điểm dừng 1 · Chọn lõi thao tác

Trình bày cho người dùng, đề xuất **B1**, rồi chờ người dùng chọn:
- **B1. cua-driver (đề xuất):**
  - giống cách Hermes làm và làm được ở nền, nên bot không giành chuột của người dùng;
  - cần **cài gói** `@trycua/cua-driver@0.37.0` (MIT, kéo theo tệp nhị phân Rust dựng sẵn); phải xin người dùng đồng ý và kiểm giấy phép các gói đi kèm (`pnpm check:licenses`);
  - nếu gói tải thêm tệp nhị phân lúc cài hay lúc chạy, phải báo rõ: tải từ đâu, kích thước bao nhiêu.
- **B2. Peekaboo:**
  - trưởng thành, đọc giao diện theo nhãn tốt;
  - nhưng thao tác tiền cảnh (giành chuột) và bản 3 còn beta;
  - cũng cần cài.
- **B3. Tự viết `aris-cua` bằng Swift:** dịch ngay trên máy bằng `swiftc`, không phụ thuộc ai, nhưng nhiều việc nhất, mặc định thao tác tiền cảnh, và phải tự lo phần đọc cây Trợ năng.

Dù chọn lõi nào, aris cũng bọc lõi đó sau một giao diện chung `ComputerDriver`. Đổi lõi sau này không phải sửa lớp công cụ và lớp an toàn.

## Điểm dừng 2 · Thử khả năng đọc ảnh của model

- Kiểm tra model trong chuỗi chat có đọc được ảnh chụp màn hình không, và mỗi ảnh 1280px tốn bao nhiêu token.
- Nếu không đọc được: chỉ dùng cây Trợ năng (danh sách phần tử và nhãn), hoặc chọn một model có đọc ảnh cho riêng việc này. **Chờ người dùng quyết.**

## B-1. Gói `@aris/computer`

- **`ComputerDriver`** (giao diện chung): `screens`, `windows`, `frontApp`, `screenshot(region?, maxEdge=1280)`, `axTree(app|pid, limit=300)`, `elementAt(x, y)`, `click(target)`, `drag`, `scroll`, `type(text)`, `key(combo)`, `openApp`, `focusApp`, `userIdleSeconds`.
  - `target` là một trong ba dạng: `{ x, y }` theo toạ độ ảnh, `{ element: <mã phần tử từ axTree> }`, hoặc `{ label: "<nhãn>", app }`.
  - Nếu lõi không có `userIdleSeconds` thì đọc bằng một dòng Swift hoặc `ioreg -c IOHIDSystem`.
- **Bộ nối lõi đã chọn:** gọi qua SDK TypeScript, hoặc chạy máy chủ MCP của lõi bằng stdio như Hermes. Chọn cách ít phụ thuộc hơn sau khi đọc tài liệu của lõi.
- **Lệnh `pnpm aris:cli computer doctor`:** kiểm tra lõi, quyền Trợ năng, quyền Ghi màn hình, model đọc ảnh, và in hướng dẫn. **Không tự cấp quyền.** Nút "Mở Cài đặt" chỉ chạy `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"`, hoặc `…?Privacy_ScreenCapture`.
- Ghi rõ macOS tính quyền cho tiến trình nào (tệp nhị phân của lõi hay daemon node dưới launchd). Thử thật rồi viết đúng vào hướng dẫn.

## B-2. Công cụ cho bot

Tên tiếng Việt như các công cụ khác của aris:
- `man_hinh_xem`: ảnh chụp và danh sách cửa sổ;
- `man_hinh_tim`: cây Trợ năng rút gọn, có mã phần tử;
- `man_hinh_bam`, `man_hinh_keo`, `man_hinh_cuon`, `man_hinh_go`, `man_hinh_phim`;
- `ung_dung_mo`.

Lời dặn trong mô tả công cụ: **ưu tiên bấm theo phần tử hay nhãn** lấy từ `man_hinh_tim`; chỉ dùng toạ độ khi không có cách khác. Toạ độ tính theo ảnh đã thu nhỏ; công cụ tự đổi sang toạ độ thật.

## B-3. Quyền và an toàn (học theo ý tưởng của Hermes, viết theo kiểu aris)

- **Bật theo bot:** hồ sơ bot có `tools.computer`, mặc định tắt. Thêm mức quyền `computerMode`:
  - **Hỏi từng bước** (mặc định): mọi thao tác thay đổi đều hỏi duyệt, kèm ảnh chụp có đánh dấu chỗ sẽ bấm. `man_hinh_xem` và `man_hinh_tim` chỉ hỏi lần đầu mỗi phiên.
  - **Trong phạm vi:** người dùng chọn trước các ứng dụng được phép (ví dụ Ghi chú, Finder, Lịch) và loại thao tác được phép. Trong phạm vi thì tự làm, ngoài phạm vi thì **từ chối**, không hỏi.
  - **Không có chế độ "không hỏi gì".**
- **Chặn cứng**, nằm trong `@aris/guard` cạnh danh sách cấm cứng đang có:
  - gõ vào ô mật khẩu (phần tử bảo mật);
  - thao tác trong các ứng dụng: Cài đặt hệ thống, Keychain Access, 1Password, Bitwarden, Terminal, iTerm, Trình cài đặt (Installer);
  - phím tắt khoá máy, đăng xuất, tắt máy;
  - thao tác khi màn hình đang khoá;
  - kéo thả vào Thùng rác.
- **Một bot một lúc** điều khiển máy; các phiên khác xếp hàng.
- **Người dùng giành lại quyền:**
  - lõi chạy tiền cảnh: thấy người dùng vừa động chuột hay phím trong vòng 2 giây thì bot **tạm dừng** và báo "{you} đang dùng máy";
  - lõi chạy nền (cua-driver): vẫn tạm dừng nếu người dùng đang thao tác **trong đúng ứng dụng** mà bot đang làm;
  - nút dừng khẩn cấp dừng ngay mọi thao tác.
- **Trần:** mỗi lượt tối đa 40 ảnh chụp và 150 thao tác. Vượt thì dừng và hỏi.

## B-4. Màn hình của bot (vẽ trước, chờ duyệt)

Đọc bản vẽ cũ `ManHinhBot.dc.html` (màn 6.6), rồi sửa theo bảng chat gọn của Văn phòng:
- trong bảng chat có khung ảnh màn hình mới nhất của bot, đánh dấu chỗ vừa bấm; bấm vào thì phóng to;
- nút **"Cầm lái"** cho người dùng tự làm, ví dụ đăng nhập hay nhập mã 2FA; nút **"Trả lại"** cho bot chạy tiếp;
- thẻ duyệt thao tác có ảnh và vùng đánh dấu, hiện ở bảng chat và ở chuông "Cần {you}";
- **Hồ sơ bot › Quyền**: công tắc "Điều khiển máy", chọn chế độ, danh sách ứng dụng được phép, và trạng thái quyền của macOS kèm nút Hướng dẫn.

**Điểm dừng 3:** chờ người dùng duyệt bản vẽ.

## B-5. Thử thật (người dùng ngồi cạnh)

1. Người dùng bật cho Khoa, tự cấp quyền theo `computer doctor`.
2. Việc thử: "Mở Ghi chú, tạo ghi chú 'aris thử điều khiển máy', chụp màn hình xác nhận." Duyệt từng bước.
3. Nhờ bot mở Cài đặt hệ thống thì phải bị chặn.
4. Đặt chế độ Trong phạm vi chỉ gồm Ghi chú: bot tự làm, không hỏi; nhờ mở Safari thì bị từ chối.
5. Thử giành lại quyền theo kiểu của lõi đã chọn.
6. Báo số ảnh, số token, chi phí.

## Test bắt buộc

- Đổi toạ độ (Retina, nhiều màn hình).
- Phân tích phím tắt.
- Chặn cứng: ứng dụng, ô mật khẩu, khoá máy.
- Hai chế độ quyền: phạm vi theo ứng dụng và theo loại thao tác.
- Khoá một bot một lúc, trần thao tác.
- Lỗi rõ ràng khi thiếu lõi hay thiếu quyền.
- Một `ComputerDriver` giả để test lớp công cụ mà không đụng máy thật.
- Viết `docs/specs/aris-computer.md`.

## Tiến độ (27/10/2026)

- **Điểm dừng 1**: người dùng chọn **B1 cua-driver** và đồng ý cài `@trycua/cua-driver@0.37.0`.
- **Điểm dừng 2**: người dùng chốt theo đề xuất: bot luôn đọc danh sách phần tử (cây Trợ năng); ảnh chụp chỉ đính kèm khi model của phiên đọc được ảnh.
- **Đợt 1 (Cloud) xong**: gói `@aris/computer` (lõi giả và bộ nối cua-driver, tám công cụ, chặn cứng, hai chế độ quyền, một bot một lúc, trần, cầm lái, tạm dừng khi người dùng dùng máy, API, `aris computer doctor`), test tự động, đặc tả `docs/specs/aris-computer.md`. Đã thử lõi thật trên màn hình ảo Linux (xterm). Khác plan:
  - lõi chạy trong tiến trình aris, nên quyền macOS tính cho tiến trình aris (không cần CuaDriver.app);
  - giao diện chung theo đúng cách cua-driver làm việc: theo cửa sổ (`pid:mã cửa sổ`), toạ độ là điểm ảnh của ảnh chụp cửa sổ; không có `elementAt` và `userIdleSeconds` trong lõi nên aris tự tính (`coords.ts`, `ioreg`);
  - chặn cứng nằm trong `@aris/computer` (không trong `@aris/guard`), vì phải biết ứng dụng dưới chỗ bấm lúc chạy; chưa ghi vào nhật ký chặn của hàng rào.
- **Đợt 2 (bản vẽ)**: ba khung `design/canvas/MayChat.dc.html` (chat với bot: màn hình mới nhất, thẻ duyệt, Cầm lái / Trả lại, tin bị chặn), `MayDuyet.dc.html` (chuông Cần anh: thẻ duyệt có ảnh và vùng đánh dấu, lần đầu xem màn hình, dòng vừa chặn), `HoSoBotMay.dc.html` (Hồ sơ bot › Quyền › Điều khiển máy). Thay cho bản vẽ cũ `ManHinhBot.dc.html` (desktop ảo trên máy chủ). Người dùng **duyệt 27/10**.
- **Đợt 3 (giao diện) xong**: khung màn hình của bot và Cầm lái / Trả lại trong bảng chat của Văn phòng, thẻ duyệt có ảnh và viền cam ở chuông "Cần anh", bảng chat và Hộp duyệt, thẻ Điều khiển máy trong Hồ sơ bot › Quyền. Yêu cầu duyệt đi vào hộp duyệt chung của `@aris/commander` (thêm `arisApprovals.ask`), nên Telegram cũng nhận thẻ. Khác bản vẽ: hạn tự từ chối là 15 phút (hạn của hộp duyệt chung), không phải 30.
- **Còn lại**: đợt 4 (thử thật trên Mac theo B-5).

