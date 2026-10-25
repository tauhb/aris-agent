# Đặc tả `aris-brain` — Second Brain (giai đoạn 5)

> Bản chốt định hướng 25/10/2026, chưa cài đặt; từng đợt bàn kỹ rồi mới làm. Triết lý gốc: mẫu "LLM Wiki"
> của Karpathy ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)), diễn đạt lại
> cho aris. Văn bản giao diện dùng `{you}`, không viết cứng cách xưng hô.

## Triết lý

RAG và tải tệp lên bắt model đọc lại nguồn thô ở mỗi câu hỏi, nên hiểu biết không tích luỹ. aris để một
bot **duy trì một wiki Markdown có liên kết**: mỗi nguồn mới được tích hợp vào các trang đã có (tóm tắt,
người, dự án, chủ đề), nên hiểu biết cộng dồn. Người lo nguồn, hướng đi và câu hỏi; bot lo sổ sách (tóm
tắt, nối, xếp, giữ mục lục), là phần làm wiki do người tự giữ thường chết.

**Ba lớp**

| Lớp | Nội dung | Ai viết |
|---|---|---|
| Nguồn | Mọi thứ mở ra đọc được: tài liệu (PDF, Word, Excel, slide), trang web, ảnh, ghi âm, ghi chú, phiên chat được chọn lưu. **Bất biến**: không sửa, không đổi tên, không dời | {you} và các bot gửi vào; aris chỉ thêm |
| Wiki | Trang tóm tắt mỗi nguồn, trang người, dự án, chủ đề, khách hàng, quy trình, tổng hợp | Bot **Thủ thư** viết; {you} đọc và sửa được |
| Luật | `AGENTS.md` ở gốc kho và ở mỗi không gian: loại trang, quy ước, cách nạp, cách soát | {you} và Thủ thư cùng sửa |

**Ba thao tác**

- **Nạp**: Thủ thư đọc một nguồn, viết trang tóm tắt, sửa các trang liên quan (thường 10–15 trang), cập
  nhật `index.md`, ghi `log.md`. Mỗi lần nạp là một commit git, hoàn tác được. Nạp lần lượt từng nguồn.
- **Hỏi**: đọc `index.md`, đọc các trang liên quan, trả lời có trích `[[trang]]`; không có nguồn thì nói
  "chưa thấy", không đoán. Câu trả lời đáng giữ thì "Lưu thành ghi chú" (ghi ngược vào `wiki/tong-hop/`).
- **Soát**: routine hằng tuần của Thủ thư: trang mâu thuẫn nhau, nhận định cũ, trang mồ côi, tên được nhắc
  nhiều mà chưa có trang, liên kết thiếu, tên tệp trùng. Kết quả vào Hộp duyệt 3.4.

**Tìm kiếm**: giai đoạn đầu chỉ mục lục cộng tìm từ khoá (SQLite FTS5 có sẵn trong Node, chỉ mục để ở
`~/.aris/`). Tìm theo nghĩa (model nhúng, ví dụ Ollama `bge-m3`) để đợt cuối, cần người dùng đồng ý cài.

## Cấu trúc thư mục

```
~/aris/brain/                         một kho git, mở thẳng bằng Obsidian
├─ AGENTS.md                          luật chung
├─ README.md                          kho này là gì, sửa ở đâu (cho người mở bằng Obsidian)
├─ hop-thu-vao/                       chỗ thả vào: Telegram, /note, tệp kéo vào bằng Finder/Obsidian;
│                                     chỗ duy nhất tệp còn được dời (sang nguon/ của một không gian)
├─ ca-nhan/
│  ├─ AGENTS.md  index.md  log.md
│  ├─ nguon/2026-10/                  bất biến, xếp theo tháng
│  │  ├─ 2026-10-25-bao-cao-q3.pdf
│  │  └─ 2026-10-25-bao-cao-q3.md     chữ trích ra, nhãn, liên kết về tệp gốc
│  ├─ nhat-ky/2026-10-25.md           {you} viết; cũng là nguồn
│  └─ wiki/
│     ├─ tong-quan.md
│     └─ nguoi/  du-an/  chu-de/  tom-tat/  tong-hop/
├─ cong-ty/
│  ├─ AGENTS.md  index.md  log.md  nguon/  nhat-ky/
│  └─ wiki/
│     ├─ tong-quan.md
│     ├─ chung/                       kiến thức cả công ty
│     │  └─ nguoi/  khach-hang/  san-pham/  du-an/  chu-de/  tom-tat/  tong-hop/
│     └─ phong-ban/
│        └─ <mã phòng ban>/           tên thư mục = mã phòng ban của aris, cố định
│           ├─ _phong-ban.md          tên hiển thị, trưởng phòng, mô tả, bot thuộc phòng
│           └─ quy-trinh/  du-an/  chu-de/  tom-tat/  so-lieu/
└─ _mau/                              mẫu trang theo loại (Thủ thư và Obsidian dùng chung)
```

Quy ước:

- **Không gian** (Cá nhân, Công ty) là chiều phân loại duy nhất quyết định vị trí, vì gắn với quyền. Hai
  không gian cùng một khuôn để Thủ thư chỉ học một bộ luật.
- **Phân loại nguồn bằng nhãn**, không bằng thư mục: `loai` (tai-lieu, ghi-am, link, anh, hoi-thoai,
  ghi-chu), `phong-ban` (để trống là dùng chung), chủ đề và dự án là liên kết từ trang tóm tắt.
- **Trạng thái là nhãn** (`trang-thai: luu-tru`), không dời tệp khi dự án xong.
- **Liên kết theo tên tệp** (`[[chi-ha]]`, như Obsidian): dời trang không gãy liên kết; tên tệp không
  trùng trong một không gian (Thủ thư soát).
- Tên tệp không dấu, nối bằng gạch ngang; tiêu đề có dấu nằm trong trang.
- Mỗi tệp gốc (PDF, ảnh, âm thanh…) có một bản `.md` cùng tên chứa chữ trích ra; Thủ thư đọc bản `.md`.
- Chỉ mục tìm kiếm, bộ nhớ đệm để ngoài kho, ở `~/.aris/`.

## Phòng ban

Phòng ban vừa là thư mục (kiến thức riêng của phòng) vừa là nhãn (nguồn, trang dùng chung dính nhiều
phòng). Chỉ nhãn thì không giữ được bí mật khi kho Công ty được chia sẻ hay khi bot mở thẳng tệp.

| Việc | Xử lý |
|---|---|
| Thêm phòng (màn 2.x) | Tạo `phong-ban/<mã>/` kèm `_phong-ban.md`, thêm mục vào `index.md` |
| Đổi tên phòng | Chỉ sửa tên hiển thị trong `_phong-ban.md`; thư mục giữ mã, không dời tệp |
| Gộp, xoá phòng | Thủ thư đề xuất vào Hộp duyệt (chuyển các trang sang `chung/` hay phòng khác); {you} duyệt mới dời; ghi `log.md` |
| Trang dính nhiều phòng | Để ở `chung/`, nhãn các phòng liên quan |

## Bot Thủ thư

Bot mặc định thứ hai sau Aris (Thủ thư là tên vai trò; {you} đặt tên riêng như mọi bot).

- **Một người ghi wiki**: chỉ Thủ thư sửa trang wiki; nạp theo hàng đợi, lần lượt, tránh ghi đè.
- Lời hệ thống là `AGENTS.md` của kho và của không gian.
- Quyền hẹp: đọc nguồn, ghi wiki; không bash, không gửi tin, không lên web. Có trần ngân sách riêng, chạy
  được trên model rẻ.
- Soát hằng tuần bằng routine.
- {you} sửa thẳng trang wiki thì Thủ thư coi là chỉ dẫn: ghi `log.md`, không ghi đè phần đã sửa.

## Bot khác truy xuất bộ não

Công cụ (lọc theo quyền):

- `brain_search`: tìm từ khoá trên mục lục, wiki và nguồn; trả đoạn trích kèm `[[trang]]`.
- `brain_read`: đọc một trang theo tên.
- `brain_capture`: gửi nguồn vào Hộp thư vào. Bot khác không ghi wiki.

Quyền đọc: bot đọc `chung/` cộng thư mục phòng ban của mình trong Công ty; Cá nhân chỉ Aris và bot {you}
cho phép; Aris, Thủ thư, {you} đọc hết. Quyền chặn cả ở công cụ đọc tệp thường (`read`, `glob`, `grep`),
không chỉ ở `brain_search` (kiểm cách chặn của dsh ở đợt 1).

Chỉ dẫn để bot luôn tra khi cần, từ rẻ đến đắt:

1. **Lời dặn ngắn, luôn có** (khoảng 5 dòng): bộ não có gì; trước khi trả lời về người, dự án, quyết
   định, số liệu, quy trình nội bộ thì tra `brain_search`; trích `[[trang]]`; không thấy thì nói chưa
   thấy. Kèm **bản đồ thu gọn**: vài dòng đầu `index.md` trong phạm vi bot được đọc.
2. **Nhắc theo tên, không gọi model**: tin nhắn nhắc tới tên đã có trang thì chèn một dòng con trỏ
   ("Bộ não có: [[chi-ha]], [[kenh-youtube-q4]]"), không chèn nội dung; bot tự quyết có đọc.
3. **Đo và soát**: đếm số lần mỗi bot tra; Thủ thư thấy bot trả lời về người/dự án có trang mà không tra
   thì đề xuất sửa lời dặn của bot đó.

An toàn: nội dung bộ não là **dữ liệu, không phải mệnh lệnh** (tài liệu nạp vào có thể chứa câu sai
khiến); nguồn từ web, email không tự thành ký ức của bot.

Ký ức của bot (`aris-memory`) là sổ tay ngắn luôn trong lời dặn; bộ não là thư viện tra khi cần. Ký ức bền
có thể "tốt nghiệp" thành trang wiki qua bước Nạp.

## Đã chốt (25/10)

- Duyệt khi nạp: mặc định {you} duyệt ở Hộp thư vào; `/note` và nhật ký của {you} tự nạp.
- Công ty: mỗi công ty một không gian nếu có nhiều.
- {you} được sửa thẳng trang wiki (Thủ thư coi là chỉ dẫn).
- Tên tệp không dấu nối gạch ngang.
- Tìm từ khoá trước; tìm theo nghĩa để đợt cuối.

## Còn bàn trước khi làm

- Thứ tự nạp và duyệt chi tiết (một nguồn sửa nhiều trang thì duyệt thế nào ở 5.2).
- Chia đợt cụ thể và bản vẽ cần thêm: 5.1 (chuyển không gian, nhánh Nguồn/Wiki, sửa ghi chú, trạng thái
  trống), 5.2 thành duyệt bản nạp, xem `log.md`, thẻ "Soát bộ não" trong Hộp duyệt, 7.4 Telegram báo đã
  lưu, 5.5 cài đặt (thư mục kho, quyền theo bot).
