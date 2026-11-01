# Đặc tả `aris-routine` — routine chạy theo lịch (giai đoạn 4, đợt 1)

> Viết lại bằng lời của aris từ [tinh-nang-aris.md](../tinh-nang-aris.md) mục D4 và kế hoạch giai đoạn 4. Mức mặc định đã duyệt 24/10: giờ Việt Nam, chạy bù nếu trễ dưới 3 giờ, quyền chỉ đọc (việc khác hỏi qua Telegram, quá hạn thì bỏ), lỗi 2 lần liên tiếp thì cảnh báo, trần 0,10 USD mỗi lần chạy, model của bot.

## Vì sao không dùng lịch nhắc của dsh

`dsh-schedule` giao lời nhắc vào **một phiên có sẵn**. Routine thì mỗi lần chạy là **một phiên mới** của bot (ngữ cảnh sạch, quyền chặt, có thể xem lại từng lần), rồi gửi kết quả ra kênh. Nên aris giữ bộ hẹn giờ riêng: một vòng kiểm mỗi 30 giây trong daemon.

## Dữ liệu (kho `aris_routine`)

- **routines**: mã, bot, tên, việc cần làm (lời gửi cho bot), lịch cron 5 trường (phút giờ ngày tháng thứ), múi giờ (mặc định `Asia/Ho_Chi_Minh`), nơi gửi (`telegram` | `none`), quyền (`read`: chỉ đọc, việc khác hỏi; `bot`: theo quyền thường của bot), trần tiền, chạy bù tối đa (giờ), bật/tắt, lần chạy kế (`nextAt`), số lần lỗi liên tiếp, lúc tạo / sửa.
- **runs**: mỗi lần chạy: routine, phiên, lúc theo lịch, lúc bắt đầu / xong, cách khởi (`schedule` | `catchup` | `manual`), kết quả (`running` | `done` | `failed` | `stopped` | `cap` | `missed`), câu trả lời cuối (cắt ngắn), tiền, lỗi. Giữ 50 lần gần nhất mỗi routine.
- **state**: một bản ghi `main` — tạm dừng tất cả.

## Chạy

- Mỗi vòng kiểm: routine bật, chưa tạm dừng tất cả, đến giờ (`nextAt ≤ bây giờ`), không có lần đang chạy ⇒ chạy. Trễ quá mức chạy bù (máy tắt, daemon dừng) ⇒ ghi một lần `missed` và hẹn lần kế; lỡ nhiều nhịp chỉ tính một lần.
- Một lần chạy: tạo phiên mới (tên "Routine · <tên>"), gắn cho bot, gửi lời việc kèm lời dặn "đang chạy tự động, không có người trông: làm xong rồi trả lời kết quả gọn để gửi về; không hỏi lại".
- Quyền `read`: công cụ đọc (đọc tệp, tìm, lệnh bash chỉ đọc, tìm và đọc web, skill) chạy luôn; lệnh bash không chắc chỉ đọc thì **từ chối kèm hướng dẫn viết lại** (không để routine chờ duyệt một lệnh đọc); công cụ khác (ghi tệp, gửi tin, MCP…) thành **hỏi**, thẻ duyệt gửi tới Telegram của bot (nơi nhận `/sethome`, không có thì chat với người dùng); quá hạn hay bot chưa nối Telegram ⇒ từ chối.
- Trần tiền: tiền của phiên vượt trần ⇒ huỷ lượt, kết quả `cap`.
- Quá 15 phút ⇒ huỷ, kết quả `failed` (quá giờ).
- Xong: nơi gửi `telegram` ⇒ gửi "ROUTINE · <tên>" kèm câu trả lời qua nơi nhận của bot. Thẻ báo cáo đẹp (7.2) là đợt 3.
- Lỗi liên tiếp: `failed`, `cap` tăng bộ đếm, `done` đặt lại. Đủ 2 lần ⇒ gửi cảnh báo Telegram một lần, màn 4.1 hiện thanh cảnh báo.
- Vòng học nền và lời nhắc lưu ký ức bỏ qua phiên routine (như phiên kiểm thử skill).

## API `/api/aris/routines`

- `GET`: các routine (kèm lịch đọc được, lần chạy gần nhất), tạm dừng tất cả, lần kế sớm nhất, cảnh báo.
- `GET ?runs=<mã>`: các lần chạy của một routine.
- `POST op`: `create` (bot, tên, việc, cron, múi giờ, nơi gửi, quyền, trần, chạy bù, bật), `update`, `toggle` (`id`, `on`), `delete`, `run` (chạy ngay), `stop` (dừng lần đang chạy), `pause-all` (`on`), `fix` (gửi vào phiên của lần lỗi gần nhất lời nhờ bot tìm nguyên nhân và đề xuất cách sửa).

## Màn 4.1

Dữ liệu thật: tên và lời việc, lịch đọc được ("Thứ 2–6, 07:30"), gửi về, lần chạy gần nhất (xong / lỗi n lần / đang chạy / chạm trần / lỡ), công tắc bật. Tiêu đề: số lịch, lần kế. Tạm dừng tất cả / Chạy lại tất cả. Thanh cảnh báo cho routine lỗi 2 lần trở lên: "Xem lần chạy" mở phiên, "Để <bot> sửa" gửi lời nhờ vào phiên đó rồi mở. Bấm một dòng mở lần chạy gần nhất.

## Đợt 2 · Tạo bằng lời, chế độ chỉ chạy script, công cụ của Commander

### Diễn giải lời (màn 4.2)

- `POST op: draft` (`text`): model rẻ đọc câu mô tả cùng giờ hiện tại và danh sách bot (mã, tên, vai), trả bản nháp: tên, bot, lịch cron, việc cần làm (lời dặn cho bot, không kèm lịch), gửi về, quyền, chạy bù, cách chạy, lệnh (chế độ script), "rõ ràng" hay câu hỏi cần làm rõ. aris kiểm lại: bot phải có trong đội, cron đọc được; sai thì đánh dấu chưa rõ kèm lý do. Kèm lịch đọc được và 3 lần chạy tới. Tiền ghi sổ phạm vi `routine`.
- `POST op: preview` (`cron`, `tz`): lịch đọc được và 3 lần chạy tới (khi người dùng sửa lịch).
- Màn 4.2: ô mô tả; ngừng gõ chừng 1,5 giây thì diễn giải; thẻ "aris hiểu là" (rõ ràng / cần nói rõ hơn kèm câu hỏi) với từng dòng sửa tại chỗ: tên, bot, lịch (cron, hiện chữ và 3 lần tới), việc, cách chạy, lệnh, gửi về, quyền, chạy bù. Nút: Chạy thử ngay (lưu ở trạng thái tắt nếu chưa lưu rồi chạy một lần, hiện kết quả và mở được phiên), Lưu ở trạng thái tạm dừng, Lưu routine (bật) rồi về 4.1.

### Chế độ chỉ chạy script

- Routine có `mode`: `agent` (bot làm, mặc định) hoặc `script` (chạy một lệnh shell, không dùng AI, không tốn tiền model).
- Lệnh chạy bằng `/bin/sh -c` ở thư mục nhà, môi trường tối thiểu (PATH, HOME, LANG; không mang biến môi trường của daemon), quá 2 phút thì huỷ. Mã thoát 0 là xong; khác 0 là lỗi kèm đuôi đầu ra lỗi.
- Gửi về Telegram **chỉ khi lệnh in ra gì đó** (để "chỉ báo khi số dư dưới 2 triệu" nằm trong chính lệnh). Đầu ra cắt 3.500 ký tự.
- Bản nháp chỉ đặt chế độ script khi người dùng đưa nguyên lệnh; người dùng tự xem lệnh trước khi lưu. Commander không tạo được routine script.

### Công cụ `tao_routine` (chỉ Commander)

- Commander điền: tên, bot, lịch cron, việc, gửi về, quyền, chạy bù. aris kiểm như khi tạo trên web.
- Mặc định lưu ở trạng thái **tắt** và trả lời lịch đọc được, 3 lần chạy tới; người dùng bật ở màn 4.1. `bat: true` thì công cụ thành **hỏi duyệt** (web hay Telegram, như mọi yêu cầu quyền) với tóm tắt routine; được cho phép mới lưu ở trạng thái bật.
- `bat_routine` (chỉ Commander): bật hay tắt routine đã có theo mã (câu trả lời của `tao_routine` có mã); bật thì hỏi duyệt, tắt thì không.

## Đợt 3 · Thẻ báo cáo 7.2 trên Telegram, tab Routine của hồ sơ bot (2.2e)

### Thẻ báo cáo routine (7.2)

- Kết quả lần chạy gửi thành một thẻ: dòng đầu "ROUTINE · <tên>" (gửi qua Aris thì thêm tên bot làm việc), ngày giờ chạy, rồi nội dung. Nội dung dài hơn một tin thì thẻ chỉ có phần đầu, nút **Xem chi tiết** gửi nốt phần còn lại.
- Nút **Hỏi <bot>**: chat Telegram này chuyển sang phiên của lần chạy, tin sau đó là hỏi tiếp bot về đúng báo cáo này (gõ `/new` để về chat mới).
- Nút **gợi ý**: lời dặn mỗi lần chạy cho phép bot kết thúc bằng một dòng `GỢI Ý: <việc tiếp theo>` khi có việc tiếp theo tự nhiên; aris bỏ dòng đó khỏi nội dung và làm thành nút. Bấm thì chat chuyển sang phiên của lần chạy và gửi gợi ý như người dùng tự gõ (đi qua đúng đường nhận tin, quyền như mọi tin).
- Nút hoạt động cả sau khi aris khởi động lại: mã nút mang mã phiên, kênh hỏi `arisRoutine` lấy lại nội dung lần chạy.
- Chế độ script: thẻ không có nút hỏi hay gợi ý (không có phiên).

### Tab Routine của hồ sơ bot (2.2e)

- Tab "Routine · N" giữa "Quyền & kênh" và "Ký ức". `GET /api/aris/routines?bot=<mã>`: routine của bot, 10 lần chạy gần nhất (7 ngày) với tiền, bot có Telegram riêng chưa.
- Đầu tab: số routine, số đang bật, lần kế; "Mọi routine của đội" (4.1), "+ Routine cho <bot>" (4.2 đặt sẵn bot đó).
- Thanh cảnh báo routine của bot lỗi liên tiếp (Xem lần chạy, Để <bot> sửa); bảng routine như 4.1 bỏ cột bot, lịch kèm lần kế; lần chạy gần đây (giờ, routine, kết quả kèm lý do, tiền, Mở phiên); ghi chú cách chạy. Chưa có routine thì lời giải thích và nút tạo.

## Để sau

Driver Kanban (đợt 4, xem aris-projects.md); webhook (giai đoạn 7); gắn skill cho routine, miễn dọn skill được routine dùng.
