# GĐ9.6a · Người, luồng, một cửa báo tin

Phần đầu của "9.1b Nền: người, luồng, một cửa gửi tin" trong plan bản 2 ([gd9-doi-dong-doi.md](gd9-doi-dong-doi.md) mục 4).

## Hôm nay

- Kênh (`@aris/channels`) có bảng người đã ghép đôi và bảng cuộc chat → phiên, mỗi kênh một kiểu.
- Đội bot (`@aris/bots`) ghi "phiên nào của bot nào" (bảng `sessions`); web mở "phiên gần nhất" của bot (`latestOpen`).
- Tin báo cho chủ đi qua `sendHome` (gửi cứng về Telegram) ở bảy chỗ:
  - `@aris/backup`, `@aris/bots`, `@aris/brain`, `@aris/commander`, `@aris/guard`;
  - `@aris/routine` (ba chỗ), `@aris/daemon` (hai chỗ).
- Chat với Mai trên web và trên Telegram là hai phiên khác nhau.

## Đợt này làm

1. **Bảng `people` và `threads`** trong kho `aris_bots`.
   - `people`: người (chủ, thành viên, khách) kèm các danh tính `web`, `telegram`, `zalo`, `lark`.
   - `threads`: luồng (bot, người, loại `direct` | `customer` | `group`, kênh). Mỗi luồng có trang hiện tại (phiên đang dùng) và các trang cũ.
   - Chỉ thêm mới, các bảng cũ vẫn ghi song song.
   - Lúc khởi động: tạo người "chủ", dựng luồng web của chủ với từng bot từ phiên gần nhất.
2. **Ghi luồng**:
   - web mở chat với bot (thao tác `open`);
   - Telegram, Zalo, Lark gắn một cuộc chat với phiên: người của cuộc chat được nối danh tính kênh, luồng được cập nhật.
3. **Một luồng cho chủ trên mọi kênh** (công tắc "Luồng chung", mặc định tắt; ở trang Kênh):
   - bật thì tin của chủ nhắn riêng cho bot trên Telegram đi vào cùng phiên với chat web của chủ với bot đó, và ngược lại;
   - tắt thì mỗi kênh một luồng như trước.
   - Zalo và Lark chỉ ghi luồng ở đợt này, chưa dùng chung.
4. **Một cửa báo tin `notify`** (`arisNotify` ở `@aris/channels`):
   - nhận (bot, người, nội dung), mặc định người là chủ;
   - gửi qua Telegram (tài khoản của bot, không có thì tài khoản chính, kèm tên bot), không có Telegram thì qua Lark của chủ;
   - bảy chỗ gọi `sendHome` đổi sang `notify`, giữ `sendHome` khi chưa có `notify`.

## Để sau (ghi vào nghiệm thu)

- `threads.send` một cửa cho mọi tin vào (web, kênh) với số thứ tự nhận.
- Luồng chung cho Zalo, Lark; báo tin qua Zalo; ghi `person` lên mọi bản ghi mới (tin, ký ức, chi phí).
- `botOf` thôi trả Aris cho phiên chưa gắn bot.
- Ký ức theo người (9.7 còn lại).

## Kiểm tra

- Test thuần cho kho người và luồng: nối danh tính, đổi trang, tìm luồng theo phiên, luồng riêng và luồng chung.
- Thử thật trên bản chép dữ liệu:
  - mở chat với bot trên web → có luồng;
  - khởi động lại → web mở đúng trang hiện tại;
  - `notify` không có kênh thì trả "chưa có nơi nhận".
- Luồng chung qua Telegram thật cần bot Telegram của người dùng: thử khi người dùng cho phép (bản chép không có kênh).
