# Plan 8.7 · Nhiều tài khoản kênh cho một bot, bản gọn cho chăm sóc khách hàng

Đọc trước `docs/plans/gd8-chung.md`. Thay cho phần còn dở của plan 8.4 (Zalo): người dùng chốt ngày 27/10/2026.

## Vì sao

Một bot dùng để chăm sóc khách hàng cần nhiều tài khoản Zalo cá nhân, mỗi tài khoản ở nhiều nhóm khác nhau; Telegram cũng vậy. Lark là kênh nội bộ, giữ một ứng dụng mỗi bot.

Hiện gói `@aris/channels` coi bot là một tài khoản kênh: tài khoản khoá theo mã bot, người đã ghép đôi và nhóm dùng chung cả kênh. Plan này đổi gốc: **tài khoản kênh là đơn vị chính, bot chỉ là người trả lời.**

## Đã chốt với người dùng

- Làm theo các đợt A → D dưới đây.
- Ngoài giờ trực: mặc định **giữ tin**, vào giờ thì trả lời; tuỳ chọn gửi một câu đặt sẵn (mặc định tắt).
- Không dùng Telegram Business: "nhường tay cho chủ" chỉ làm cho Zalo cá nhân.
- Connector API của 8.5 để sau (không thuộc plan này).
- **Bản gọn (27/10)**: aris là trợ lý, không thành phần mềm chat support. Chủ đọc và trả lời khách ngay trên app Zalo; aris chỉ trả lời thay, biết nhường tay, và báo chủ qua Telegram. Bỏ hộp thư chung; để sau: bot riêng theo nhóm, Zalo Bot chính thức, ô thử câu ở phần tài liệu.

## Đợt A · Sửa lỗi và làm nhanh (không có giao diện mới)

1. **Bị đá phiên, mạng chết im** (việc 9):
   - Zalo Web đá phiên: đã nhận ra và thử lại chậm; thêm **báo chủ** qua Telegram, tối đa 6 giờ một lần mỗi tài khoản.
   - Mạng chết mà không đóng kết nối: bộ canh 5 phút một lần gọi nhẹ Zalo (`fetchAccountInfo`); lỗi hai lần liền thì coi như mất kết nối, đóng trình nghe cũ rồi thử lại theo lịch sẵn có.
   - Dọn trình nghe cũ trước khi mở trình nghe mới (không để hai trình nghe cùng tài khoản).
   - Telegram: kiểm trường hợp long-polling treo không lỗi; thêm hạn chờ cho mỗi lần `getUpdates`.
2. **Cắt tin dài** (việc 3): 1.500 ký tự, theo đoạn rồi dòng rồi câu; nghỉ một nhịp ngắn giữa các phần. Áp cho Zalo và Telegram.
3. **Gom tin dồn dập** (việc 2): mỗi cuộc chat đợi 5 giây không có tin mới rồi mới đưa cả loạt vào phiên một lần; khách nhắn thêm lúc bot đang soạn thì dừng lượt cũ, làm lại với toàn bộ tin.

Test: bộ canh và báo chủ 6 giờ (đồng hồ giả), cắt 1.500, gom tin và bỏ câu trả lời cũ.

## Đợt B · Lõi nhiều tài khoản

- **Tài khoản kênh** là bản ghi riêng: mã `acc-…`, kênh (`telegram` / `zalo`; Lark giữ như cũ), tên, bot trả lời mặc định, trạng thái, giới hạn tần suất riêng. Một bot có nhiều tài khoản; một tài khoản một bot mặc định.
- Khoá trong Keychain theo tài khoản: `TELEGRAM_<acc>_TOKEN`, `ZALO_<acc>_SESSION`.
- Người đã ghép đôi, nhóm (bật/tắt, lời nhắc), mã ghép đôi, phiên chat, giới hạn gửi tin: **theo tài khoản**. Trả lời luôn ra đúng tài khoản đã nhận tin.
- **Trạng thái cuộc chat**: bot đang trả lời / đang nhường tay / chờ người (khách gặp nhân viên). Chỉ để bot biết khi nào im, không có màn hộp thư.
- **Chuyển dữ liệu cũ** khi khởi động: tài khoản cũ thành tài khoản mới giữ nguyên bot; người, nhóm gán vào tài khoản đó; phiên giữ nguyên. Không phải ghép đôi lại. Có bản sao trước khi chuyển.
- Test: chuyển dữ liệu cũ không mất gì; hai tài khoản cùng bot không lẫn người, nhóm, phiên; mã của tài khoản A không dùng được ở B.

## Đợt C · Bán hàng trên Zalo

1. **Nhường tay cho chủ** (việc 1, chỉ Zalo cá nhân): bật nhận tin chính tài khoản gửi; tin chủ tự gõ (không nằm trong danh sách tin aris vừa gửi) làm cuộc chat đó im 10 phút; tin khách trong lúc đó được giữ; hết 10 phút mà chủ không trả lời thì bot trả lời các tin đang giữ.
2. **Ba nút của model** (việc 4): công cụ "im lặng" (chat riêng lẫn nhóm); "báo chủ" (chuông trên web và Telegram, tối đa 10 phút một lần mỗi cuộc chat); "gặp nhân viên" khi khách gõ (cuộc chat sang trạng thái "người", bot im, báo chủ).
3. **Chế độ khách**: mỗi tài khoản chọn "chỉ người đã ghép đôi" (mặc định) hay "mọi người nhắn riêng là khách" (chỉ hỏi đáp, không làm việc có tác động).
4. **Giờ trực và nhãn** (việc 6): giờ trực theo tài khoản; nhãn Zalo chủ chọn thì bỏ qua (đọc lại nhãn vài phút một lần).
5. **File, phản ứng, tag** (việc 10): nhận và gửi file đã có; thêm nhận và thả cảm xúc, @nhắc thật trong nhóm Zalo.

## Đợt D · Chỉ trả lời theo tài liệu (việc 5)

- Bật theo tài khoản hay theo bot. Nguồn: các thư mục chọn trong bộ não của aris. Bot chỉ được tra trong nguồn đó, không dùng kiến thức ngoài.
- Không thấy thì trả "chưa có thông tin" (giọng theo cách xưng hô đã chọn). Câu trả lời phải dẫn được đoạn tài liệu; không dẫn được thì thay bằng câu trên.
- Tệp khách gửi lưu riêng, **không bao giờ** vào nguồn tra.
- Không cam kết 100% không bịa: ghi rõ trên giao diện.

## Để sau (không làm trong plan này)

- Hộp thư chung cho nhân viên: **bỏ** (app Zalo là nơi đọc và trả lời; nháp AI, nếu cần, gửi kèm tin báo chủ).
- Bot riêng theo từng nhóm.
- Zalo Bot chính thức (`bot.zaloplatforms.com`) cho chủ ra lệnh: Telegram đang làm được việc báo chủ.
- Ô "thử một câu" ở phần trả lời theo tài liệu.

## Bản vẽ (vẽ trước, chờ duyệt)

Chỉ hai màn, đều trong Cài đặt › Kênh và ghép đôi:

| Khung | Đợt | Nội dung |
|---|---|---|
| `KenhTaiKhoan.dc.html` | B, C | Danh sách tài khoản mỗi kênh, "+ Thêm tài khoản" (Zalo: cảnh báo và QR); chi tiết một tài khoản: bot trả lời, trạng thái, ai được trả lời, mã ghép đôi, người đã ghép, nhóm, giờ trực, nhãn bỏ qua, nhường tay cho chủ, giới hạn |
| (trong chi tiết tài khoản) | D | Phần "Chỉ trả lời theo tài liệu": bật/tắt, chọn thư mục nguồn, câu khi không có thông tin |

Hồ sơ bot chỉ thêm một dòng "Kênh bot đang trả lời". Đợt A không có giao diện mới.

## Kiểm tra

Theo `gd8-chung.md`. Phần thử thật cần tài khoản Zalo, Telegram của người dùng: ghi rõ phần chưa thử.

## Tiến độ (27/10/2026)

- **Đợt A** xong (`9f1a47d`).
- **Bản vẽ** hai màn vẽ lại theo bản gọn (`1d14ae5`), người dùng duyệt 27/10 ("Connector không cần": không đưa Zalo vào Connector).
- **Đợt B** xong (`d55e427`). Khác plan: **không chuyển dữ liệu** khi khởi động. Tài khoản có trước GĐ8.7 giữ mã là mã bot; người, nhóm không có tài khoản thì dùng chung; nên không cần bản sao trước khi chuyển và không có bước chuyển nào có thể hỏng. Giới hạn gửi tin theo tài khoản chỉ có ở Zalo (Telegram không có giới hạn riêng).
- **Đợt C** xong (`a5f100a`): nhường tay cho chủ, giờ trực, nhãn bỏ qua, gặp nhân viên (Telegram và Zalo), công cụ im lặng và báo chủ, @nhắc thật trong nhóm Zalo. Khác plan: "báo chủ" chỉ qua Telegram (aris chưa có chuông thông báo trên web); **chưa làm nhận và thả cảm xúc** trên Zalo (để sau). Trạng thái giữ tin nằm trong bộ nhớ: khởi động lại thì tin đang giữ được trả lời ngay.
- **Đợt D** xong (`12deea6`, `18e49b5`): chỉ trả lời theo tài liệu, áp cho khách (chủ và người đã ghép đôi không bị giới hạn, đúng bản vẽ). Kiểm tra là "lượt có tra thấy đoạn tài liệu trong nguồn" chứ không kiểm từng câu trích dẫn; ghi rõ "không cam kết 100%" trên giao diện.
- **Giao diện** xong (`35c79c7`): Cài đặt › Kênh và ghép đôi theo hai bản vẽ; hồ sơ bot có dòng "Kênh bot đang trả lời". Lark hiện trong danh sách, chọn thì khung phải là phần Lark cũ.
- **Đã kiểm**: test tự động (aris-channels 316 test, aris-brain thêm test thư mục), dựng trang Kênh trong Chromium với dữ liệu giả, chụp sáng, tối và màn điện thoại 390 px (không tràn ngang, không lỗi console).
- **Chưa thử thật** (cần tài khoản của người dùng, xem cách thử dưới đây).

### Cách thử thật (trên máy của người dùng)

1. Telegram: Cài đặt › Kênh và ghép đôi › "+ Thêm tài khoản" › Telegram, chọn bot Mai, dán token của một bot mới ở @BotFather. Nhắn bot đó từ một tài khoản Telegram khác: chưa ghép đôi thì bot im, chủ nhận báo; đặt "Mọi người nhắn riêng là khách" rồi nhắn lại thì bot trả lời như khách. Gõ "cho mình gặp nhân viên": bot trả một câu, chủ nhận báo, bot im 2 giờ.
2. Zalo (nên dùng tài khoản phụ): "+ Thêm tài khoản" › Zalo cá nhân, "Tôi hiểu", "Hiện mã QR", quét bằng app Zalo. Thêm tài khoản thứ hai, chọn cùng bot: hai tài khoản phải hiện riêng, mã ghép đôi của tài khoản này nhắn vào tài khoản kia bị từ chối.
3. Nhường tay: khách nhắn tài khoản Zalo, trong lúc bot đang soạn thì chủ tự gõ trả lời trên điện thoại: bot không gửi câu của nó; khách nhắn tiếp trong 10 phút thì bot im; để 10 phút không gõ thì bot trả lời.
4. Giờ trực: đặt giờ trực đã qua trong ngày, bật câu ngoài giờ; khách nhắn thì nhận câu ngoài giờ một lần, bot trả lời khi vào giờ.
5. Nhãn: trên app Zalo gắn nhãn "Gia đình" cho một cuộc chat, chọn nhãn đó ở "Bỏ qua cuộc chat có nhãn"; đợi tối đa 5 phút, nhắn từ cuộc chat đó: bot không trả lời.
6. Tài liệu: tab "Trả lời theo tài liệu", chọn thư mục Sản phẩm, Lưu, bật. Khách hỏi giá có trong tài liệu: bot trả lời đúng; hỏi điều không có: bot trả câu "chưa có thông tin", chủ nhận báo.
7. Nhóm Zalo: bật một nhóm, @ tài khoản trong nhóm: câu trả lời @nhắc người hỏi (người hỏi nhận thông báo).

