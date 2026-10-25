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

## Nạp và duyệt

Luồng một nguồn: **Vào** (`hop-thu-vao/`) → **Trích chữ** (PDF, Word, web ra chữ; ảnh nhận dạng chữ; ghi âm
chép lời; không gọi model) → **Phân loại** (một lần gọi model rẻ: không gian, phòng ban, loại, một câu tóm
tắt, cờ nhạy cảm) → **Lập bản nạp** (Thủ thư viết trên nhánh nháp, wiki thật chưa đổi) → **Duyệt** →
**Ghép** (một commit; cập nhật `index.md`, ghi `log.md`; nguồn sang `nguon/<tháng>/` và từ đó bất biến).
Hoàn tác cả bản nạp bằng một nút ở màn nhật ký.

**Thẻ bản nạp (5.2)**: mỗi nguồn một thẻ; thao tác chia nhóm:

| Nhóm | Ví dụ | Hiển thị |
|---|---|---|
| ⚠️ Cần mắt người | Mâu thuẫn số liệu, sửa nhận định cũ, sửa trang {you} từng sửa tay, trang Người có thông tin nhạy cảm | Mở sẵn, trên cùng |
| Trang mới | Tóm tắt nguồn (luôn có), trang người mới | Một dòng mỗi trang |
| Bổ sung | Thêm ý vào trang có sẵn, có trích nguồn | Một dòng mỗi trang |
| Chỉ thêm liên kết | Gắn `[[nguồn]]` vào nhiều trang | Gom một dòng |

Khác biệt hiện theo câu (thêm xanh, bỏ đỏ, câu thêm có số trích). Bỏ chọn được từng thao tác. Nút: Đồng ý
(ghép phần đang chọn), Nhờ sửa ({you} gõ một câu, Thủ thư làm lại), Chỉ lưu (nguồn vào `nguon/`, wiki
không đổi, nạp lại sau được), Bỏ (xoá khỏi Hộp thư vào, hỏi lại).

**Ba mức duyệt** (chốt 25/10):

| Mức | Áp cho | Cách chạy |
|---|---|---|
| Tự nạp | `/note`, nhật ký của {you}; bản nạp chỉ tạo tóm tắt và thêm liên kết, không sửa ý nào trên trang cũ | Ghép luôn; tổng kết cuối ngày trong nhật ký |
| Duyệt nhanh (mặc định) | Có bổ sung hay trang mới, không có ⚠️ | Thẻ 5.2 và thẻ Telegram 7.4 (Đồng ý, Xem trên web, Chỉ lưu) |
| Duyệt kỹ | Có ⚠️, hoặc nguồn Công ty đụng thư mục phòng ban | Không tự ghép; Telegram chỉ báo kèm "Xem trên web" |

**Thứ tự và tranh chấp**

- Thủ thư lập bản nạp lần lượt; nguồn của {you} trước nguồn bot gửi.
- Các bản nạp lập trên wiki hiện tại, không chờ nhau. Khi ghép, hai bản sửa cùng trang thì git gộp; không
  gộp được thì Thủ thư lập lại riêng các trang vướng ("đã cập nhật theo bản nạp trước"). Phần {you} sửa
  tay luôn được giữ.
- Nguồn lớn chia phần, mỗi bản nạp đụng tối đa khoảng 20 trang.
- Chờ quá 7 ngày thì nhắc; quá 30 ngày tự thành "Chỉ lưu" (nạp lại sẽ lập theo wiki mới nhất).
- Mỗi thẻ ghi tiền lập bản nạp; Thủ thư có trần ngân sách theo ngày, chạm trần thì nguồn chờ hôm sau.

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

## Đợt 1 — kho, chỉ mục, công cụ đọc, Thủ thư, màn 5.1 (xong 25/10)

- Gói `@aris/brain`. Lần đầu chạy tạo khuôn `~/aris/brain` (đổi được bằng `ARIS_BRAIN_DIR`): `AGENTS.md`
  chung và của mỗi không gian (luật, định dạng trang, chú thích `[^n]`, liên kết theo tên tệp), `README.md`,
  `_mau/`, `index.md`, `log.md`, `.gitignore`; mỗi phòng ban một thư mục `wiki/phong-ban/<mã>/_phong-ban.md`
  (phòng mới tự có thư mục sau tối đa một phút). Không ghi đè tệp đã có.
- Git thật của kho: thay đổi do aris làm commit ngay ("<tên người dùng> sửa <trang>"); thay đổi bằng
  Obsidian gom thành một commit mỗi 10 phút.
- Chỉ mục ở `~/.aris/brain/index.sqlite` (SQLite có sẵn trong Node): mỗi tệp một dòng, liên kết `[[...]]`
  để tính liên kết ngược, tìm toàn văn trên chữ đã bỏ dấu (`đ` đổi thành `d`), tiêu đề nặng gấp 5 thân trang.
  Theo dõi thư mục kho: sửa bên Obsidian thì khoảng nửa giây sau chỉ mục cập nhật. Mất chỉ mục thì quét lại.
- Công cụ `brain_search` (từ khoá, đoạn trích quanh chỗ khớp hiện chữ có dấu) và `brain_read` (theo tên hay
  đường dẫn; trang không được đọc thì trả "không có", không lộ là có tồn tại). Lời dặn ngắn trong ngữ cảnh
  của Aris; đủ ba tầng chỉ dẫn để đợt 3.
- Chặn đường vòng: bot thường dùng `read`, `read_image`, `glob`, `grep`, `str_replace_editor view` vào kho,
  quét thư mục chứa kho (ví dụ `~`), hay bash nhắc tới kho thì bị từ chối kèm hướng dẫn dùng công cụ bộ não.
  Aris và Thủ thư đọc thẳng được.
- Bot Thủ thư (`b-thu-thu`, linh vật trang giấy) tạo một lần: không web, không đọc tệp thường, không bash,
  không ghi tệp, Commander không giao việc. Người dùng xoá thì không tạo lại.
- API `/api/aris/brain`: danh sách tệp của không gian, đọc trang (kèm liên kết ngược, ai đọc được), tìm, lưu
  (từ chối sửa nguồn; tệp vừa đổi bên Obsidian thì báo xung đột, không ghi đè), tạo nhật ký hôm nay, mở bằng
  Obsidian (kho chưa đăng ký làm vault thì mở Obsidian và hướng dẫn "Open folder as vault"; không tự sửa cấu
  hình Obsidian) hay Finder.
- Màn 5.1 dữ liệu thật theo bản vẽ đã duyệt; Markdown hiển thị bằng bộ dựng riêng (không HTML thô). Đồ thị
  quanh trang, gợi ý nối (đợt 4) và "Thả tệp vào Hộp thư vào" (đợt 2) để mờ.
- Chạy thử thật: kho được tạo đủ khuôn và 3 thư mục phòng ban; trang tạo ngoài web hiện ở 5.1; gõ "chi ha"
  ra trang Chị Hà; sửa trên web có gợi ý `[[`, lưu thành tệp và commit; hỏi Aris "Chị Hà là ai" thì Aris tự
  tra và trích `[[chi-ha]]`; Minh (phòng Tăng trưởng) không tìm thấy trang của phòng Vận hành, `read` thẳng
  tệp bị chặn.
- Còn để sau: `[[...]]` trong câu trả lời ở khung chat chưa bấm được (đợt 3); mục lục `index.md` của Công
  ty liệt kê trang mọi phòng ban, nên khi Thủ thư viết mục lục (đợt 2) cần tách theo phòng.

## Đã chốt (25/10)

- Duyệt khi nạp: mặc định {you} duyệt ở Hộp thư vào; `/note` và nhật ký của {you} tự nạp.
- Công ty: mỗi công ty một không gian nếu có nhiều.
- {you} được sửa thẳng trang wiki (Thủ thư coi là chỉ dẫn).
- Tên tệp không dấu nối gạch ngang.
- Tìm từ khoá trước; tìm theo nghĩa để đợt cuối.

## Còn bàn trước khi làm

- Chia đợt cụ thể và bản vẽ cần thêm: 5.1 (chuyển không gian, nhánh Nguồn/Wiki, sửa ghi chú, trạng thái
  trống), 5.2 thành duyệt bản nạp, xem `log.md`, thẻ "Soát bộ não" trong Hộp duyệt, 7.4 Telegram báo đã
  lưu, 5.5 cài đặt (thư mục kho, quyền theo bot).
