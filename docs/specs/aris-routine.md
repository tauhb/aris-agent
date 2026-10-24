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
- Quyền `read`: công cụ đọc (đọc tệp, tìm, lệnh bash chỉ đọc, tìm và đọc web, skill) chạy luôn; công cụ khác thành **hỏi**, thẻ duyệt gửi tới Telegram của bot (nơi nhận `/sethome`, không có thì chat với người dùng); quá hạn hay bot chưa nối Telegram ⇒ từ chối.
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

## Để sau

Tạo routine bằng lời (4.2), công cụ tạo routine cho Commander, chế độ chỉ chạy script (đợt 2); thẻ báo cáo 7.2, tab Routine của hồ sơ bot (đợt 3); webhook, Driver Kanban (đợt 4); gắn skill cho routine, miễn dọn skill được routine dùng.
