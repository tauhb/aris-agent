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

## Đợt 2a — nạp: Hộp thư vào, Thủ thư lập bản nạp, duyệt, ghép, nhật ký (xong 25/10)

- Vào: thả tệp vào `hop-thu-vao/` (aris tự thấy), nút "+ Thêm" ở 5.2 (dán chữ, link, chọn tệp `.md`/`.txt`),
  `/note` (ghi nối vào nhật ký hôm nay của Cá nhân, mục "Ghi nhanh · giờ:phút"). Link được tải và đổi sang
  chữ bằng `textutil` của macOS (không tải địa chỉ trong máy). Loại tệp khác vào trạng thái "chưa đọc được"
  (đợt 2b), chỉ lưu hay bỏ được.
- Phân loại: một lần gọi model Flash (giới hạn 3000 token vì model có bước suy nghĩ): không gian, phòng ban,
  tiêu đề, một câu tóm tắt, cờ nhạy cảm. Không phân loại được thì tạm xếp Cá nhân kèm ghi chú.
- Thủ thư lập bản nạp trong phiên riêng cho mỗi nguồn, lần lượt từng nguồn (nguồn của người dùng trước nguồn
  bot gửi), tối đa 10 phút. Công cụ `brain_draft` ghi toàn bộ trang lên bản nháp (lưu trong bảng `batches`
  của kho dữ liệu aris), kèm loại thay đổi, một câu tóm tắt cho mục lục, cảnh báo mâu thuẫn; `brain_read`
  của phiên đó đọc bản nháp trước. aris tự đặt nhãn `tom-tat`, `cap-nhat`.
- Đánh dấu ⚠: Thủ thư báo mâu thuẫn, sửa ý cũ, trang người dùng từng sửa tay (commit "<tên> sửa…"), trang
  Người khi nguồn nhạy cảm. Mức: tự nạp (nhật ký, ghi nhanh, hay chỉ tóm tắt và liên kết; có ⚠ thì không),
  duyệt kỹ (có ⚠ hay đụng thư mục phòng ban), còn lại duyệt nhanh.
- Ghép: chuyển nguồn sang `<không gian>/nguon/<tháng>/` (commit "Lưu nguồn: …"), rồi ghi các trang đã chọn,
  gộp ba chiều bằng `git merge-file` khi trang đổi trong lúc chờ (trùng chỗ thì bỏ trang đó, nút Lập lại),
  viết lại `index.md` (theo loại; Công ty chia theo phòng) và thêm dòng `log.md` (commit "Nạp: …"). Hai
  commit tách riêng để hoàn tác bản nạp không đẩy nguồn về Hộp thư vào.
- Hoàn tác (5.6): `git revert` commit đó; `log.md` vẫn chỉ ghi thêm. Trùng chỗ với thay đổi sau thì không
  hoàn tác và báo.
- Tự nạp nhật ký mỗi ngày từ 23:00 (nhật ký chỉ có tiêu đề thì thôi). Chờ duyệt quá 7 ngày nhắc qua
  Telegram của Aris; quá 30 ngày tự Chỉ lưu. Trần tiền Thủ thư 0,5 USD/ngày (gồm cả phân loại), chạm trần thì
  nguồn chờ sang ngày sau.
- Màn 5.2 và 5.6 dữ liệu thật theo bản vẽ đã duyệt; khác biệt theo câu, hiện chữ đã dựng (đậm, liên kết, chú
  thích).
- Chạy thử thật: ghi chú cuộc gọi về chị Hà (giá mới 2 triệu) ⇒ Thủ thư tạo 4 thay đổi (tóm tắt, Lịch quay
  tháng 11, sửa Chị Hà, bổ sung Kênh YouTube Q4), tự phát hiện mâu thuẫn giá và cảnh báo ngân sách tháng 11
  thiếu, mức duyệt kỹ, 0,0098 USD; Đồng ý ⇒ một commit, mục lục và nhật ký đúng. Link Wikipedia Zettelkasten
  ⇒ phân loại Cá nhân, tiêu đề tiếng Việt, 2 trang mới, duyệt nhanh; hoàn tác ở 5.6 ⇒ trang gỡ, nguồn giữ.
  `/note`, Chỉ lưu, Bỏ với tệp PDF chưa đọc được đều đúng.
- Lỗi tìm ra khi chạy thử và đã sửa: phân loại trả rỗng vì 400 token không đủ cho bước suy nghĩ; commit "Lưu
  nguồn" hỏng vì tệp trong Hộp thư vào chưa từng được git theo dõi; hoàn tác làm mất dòng nạp trong
  `log.md`; cộng tiền song song ghi đè nhau; chọn Chỉ lưu hay Bỏ lúc Thủ thư đang lập bị kết quả lập ghi đè.
- Chưa thử thật: tự nạp nhật ký lúc 23:00 (chờ tới giờ), nhắc 7 ngày và tự Chỉ lưu 30 ngày, gộp ba chiều
  trùng chỗ (đã có bài thử tự động).

## Đợt 2b — đọc tệp, bot gửi vào bộ não, Telegram (phần 1 xong 25/10)

- Đọc tệp chỉ bằng công cụ có sẵn của macOS: Word, RTF, ODT, HTML qua `textutil`; PDF qua PDFKit, PDF scan
  không có lớp chữ thì dựng ảnh từng trang (tối đa 30 trang) rồi nhận dạng chữ bằng Vision; ảnh qua Vision
  (tiếng Việt, tiếng Anh), vẽ lên nền trắng và phóng to gấp đôi khi ảnh nhỏ. PDF và ảnh đi qua một công cụ
  Swift nhỏ, biên dịch lần đầu bằng `swiftc` vào `~/.aris/brain/bin/aris-extract-<mã băm>`. Ghi âm đổi sang
  WAV 16 kHz bằng ffmpeg rồi chép lời bằng dịch vụ chép lời của dsh (cần chuẩn bị mô hình trước bằng nút mic
  trên web; chưa chuẩn bị thì bản nạp báo lỗi rõ, bấm Lập lại sau).
- Chữ trích ra ghi thành tệp đi kèm `.md` cùng tên (frontmatter `loai`, `tep-goc`), đi theo tệp gốc khi lưu
  nguồn hay bỏ. Hộp thư vào bỏ qua tệp đi kèm khi quét.
- Nút "+ Thêm" ở 5.2 nhận mọi loại tệp trên, tối đa 25 MB.
- Công cụ `brain_capture` cho mọi bot (cả Aris): gửi chữ, link, hay một tệp trong thư mục làm việc của bot vào
  Hộp thư vào (`from: bot`, ghi tên bot); không gửi được tệp nằm ngoài thư mục làm việc hay đã nằm trong bộ não.
- Tiêu đề: nguồn không đến từ thư mục, hay tiêu đề trông như tên tệp, thì dùng tiêu đề của bước phân loại.
  Trang tóm tắt đặt tên theo nguồn (`tom-tat-<tên nguồn>.md`) để hai nguồn không đè nhau. Wiki Công ty không
  thuộc phòng nào nằm ở `cong-ty/wiki/chung/`.
- Commit chỉ gồm các đường dẫn còn trên đĩa hay git đang theo dõi, để không cuốn theo tệp khác trong Hộp thư vào.
- Chạy thử thật: PDF báo giá in ấn ⇒ phân loại Công ty, trang tóm tắt ở `chung/`, duyệt ⇒ hai commit, tệp đi
  kèm đi theo. Ảnh chụp báo giá ⇒ nhận dạng đủ chữ. Ghi âm ⇒ báo đúng lỗi chưa chuẩn bị mô hình chép lời.
  Nhờ Aris "lưu vào bộ não" một quy tắc ⇒ Aris gọi `brain_capture`, bản nạp đến từ bot aris, Thủ thư xếp
  Công ty · Tăng trưởng.
- Chưa thử thật: chép lời ghi âm (chờ chuẩn bị mô hình), PDF scan nhiều trang.

### Phần 2 — Telegram (bản vẽ 7.5, xong 25/10)

- Chỉ người dùng chính, trong chat riêng với bot. `/note <nội dung>` ghi nhanh vào nhật ký hôm nay. Tin chuyển
  tiếp thì bot hỏi "Lưu vào bộ não?" (Lưu vào bộ não / Không, chỉ hỏi); lưu thì ghi thêm nguồn gốc (người hay
  kênh gửi gốc), trừ khi tin chỉ là một link (để bộ não tải trang). Ảnh, tệp, ghi âm kèm chú thích bắt đầu bằng
  "lưu" thì lưu luôn. Trả lời "lưu" (hay "lưu vào bộ não") vào một tin bất kỳ thì lưu tin đó: cách này dành cho
  ghi âm, vì ứng dụng Telegram không cho ghi chú thích vào ghi âm. Tin thường vẫn là trò chuyện.
- Nguồn gửi từ Telegram ghi `from: telegram`, `by: <bot nhận>`. Khi Thủ thư lập xong, bot gửi thẻ "BẢN NẠP": mức
  duyệt, tiêu đề, nơi, loại, tóm tắt, các thay đổi, dòng ⚠. Duyệt nhanh có Đồng ý / Xem trên web / Chỉ lưu;
  duyệt kỹ hay không có thay đổi chỉ có Xem trên web / Chỉ lưu. "Xem trên web" hiện lời chỉ đường (điện thoại
  không mở được web chạy trên máy). Bản nạp xong ở đâu (Telegram hay web) thì thẻ được sửa thành Đã nạp / Chỉ
  lưu / Đã bỏ / Đang lập lại. Tự nạp thì không gửi thẻ, chỉ báo đã nạp; lỗi và hết tiền trong ngày cũng báo.
- Nhắc bản chờ quá 7 ngày (mọi nguồn) gửi qua bot, có nút "Xem các bản chờ" gửi lại thẻ của từng bản (tối đa 10).
- Nối hai gói: `@aris/brain` cung cấp dịch vụ `arisBrain` (sự kiện bản nạp đổi trạng thái, nhắc; thêm nguồn, ghi
  nhanh, duyệt, chỉ lưu); `@aris/channels` dò dịch vụ này như các thẻ khác.
- Khác bản vẽ (bản vẽ đã sửa theo, v94): tin hệ thống không dùng đại từ ("xong sẽ gửi thẻ duyệt", không "em
  gửi"); ghi âm lưu bằng cách trả lời "lưu"; lưu tin chuyển tiếp thì câu hỏi đổi thành câu báo đã vào Hộp thư
  vào; báo nhận ghi âm không nói "đã chép lời" vì chép lời chạy lúc Thủ thư lập bản nạp; nút nhắc là "Xem các bản
  chờ".
- Thử tự động: hai bài thử ở `hub.test.ts` (gửi vào bộ não; thẻ, Đồng ý, sửa thẻ, tự nạp, nhắc).

## Đã chốt (25/10)

- Duyệt khi nạp: mặc định {you} duyệt ở Hộp thư vào; `/note` và nhật ký của {you} tự nạp.
- Công ty: mỗi công ty một không gian nếu có nhiều.
- {you} được sửa thẳng trang wiki (Thủ thư coi là chỉ dẫn).
- Tên tệp không dấu nối gạch ngang.
- Tìm từ khoá trước; tìm theo nghĩa để đợt cuối.
- Đợt 3 (chốt 25/10, bản vẽ 5.4 vẽ lại và 5.7 mới): Thủ thư trả lời ở 5.4, mỗi câu hỏi một phiên; tìm cả trong
  ký ức các bot (phiên chat cũ để sau); trang {you} chọn bằng "Từ Second Brain" thì bot được đọc trong lượt đó dù
  ngoài quyền; nhắc theo tên bật cho mọi bot, lọc theo quyền, tối đa 5 trang; tầng 3 đợt này chỉ đếm lượt tra.

## Còn bàn trước khi làm

- Chia đợt cụ thể và bản vẽ cần thêm: 5.1 (chuyển không gian, nhánh Nguồn/Wiki, sửa ghi chú, trạng thái
  trống), 5.2 thành duyệt bản nạp, xem `log.md`, thẻ "Soát bộ não" trong Hộp duyệt, 7.4 Telegram báo đã
  lưu, 5.5 cài đặt (thư mục kho, quyền theo bot).
