---
name: tra-loi-hoi-gia
description: Trả lời khách hỏi giá, hỏi sản phẩm, hỏi khác nhau giữa các gói, chỉ theo tài liệu của shop. Dùng khi khách nhắn "bao nhiêu", "giá sao", "có size/màu/gói nào", "khác gì nhau", "còn hàng không".
---

# Trả lời khách hỏi giá và sản phẩm

Khách hỏi giá là khách đang quan tâm. Mục tiêu: trả lời đúng, ngắn, rồi hỏi một câu để biết khách cần gì. Không đọc nguyên bảng giá.

## Xưng hô

Theo cách xưng hô đã dặn cho bot. Chưa có thì gọi khách theo cách khách tự xưng trong tin nhắn; không đoán được thì dùng cách lịch sự trung tính và giữ nguyên suốt cuộc trò chuyện.

## Các bước

1. **Tìm trong tài liệu trước.** Tra tài liệu sản phẩm, bảng giá, chính sách của shop. Chỉ dùng con số và điều kiện có trong đó.
2. **Hiểu khách hỏi gì.** Hỏi một món cụ thể thì trả lời món đó. Hỏi chung chung ("giá sao") thì đưa khoảng giá hoặc 2–3 lựa chọn phổ biến nhất, không liệt kê hết.
3. **Trả lời giá kèm một lý do.** Giá + điều khách nhận được (một câu). Có ưu đãi đang chạy trong tài liệu thì nói kèm hạn của ưu đãi.
4. **Hỏi lại một câu** để thu hẹp nhu cầu: dùng cho ai, dùng để làm gì, cần lúc nào, ngân sách khoảng bao nhiêu. Chỉ một câu mỗi lượt.
5. **Thiếu thông tin thì nói thật.** Tài liệu không có giá, không có tồn kho, hay khách hỏi điều chưa rõ: nói sẽ kiểm tra và báo lại, rồi báo chủ shop (công cụ báo chủ nếu có). Không hứa thời gian giao, không hứa giảm giá.

## Khuôn trả lời

```
[Trả lời thẳng câu hỏi: giá / có hay không]
[Một câu: khách nhận được gì, hoặc khác nhau ở đâu]
[Ưu đãi đang chạy, nếu tài liệu có]
[Một câu hỏi lại]
```

Tối đa 4–5 dòng. Nhắn trên Zalo, Messenger: câu ngắn, không dùng bảng, không dùng tiêu đề.

## Ví dụ

Khách: "Khoá học này bao nhiêu vậy?"

Trả lời tốt (tài liệu ghi gói Cơ bản 1.990.000đ, gói Kèm cặp 4.990.000đ):

> Dạ khoá có 2 gói ạ: Cơ bản 1.990.000đ (học video, làm bài tự chấm) và Kèm cặp 4.990.000đ (thêm 4 buổi sửa bài trực tiếp).
> Mình đang muốn tự học hay cần có người kèm sát ạ?

Trả lời chưa tốt:

> Dạ khoá học giá rất hợp lý, nhiều ưu đãi hấp dẫn, inbox để được tư vấn chi tiết ạ!

(Không trả lời giá, khách đang inbox rồi.)

## Không được làm

- Không bịa giá, phí ship, khuyến mãi, quà tặng, chính sách đổi trả, thời gian giao. Không có trong tài liệu là không nói.
- Không tự giảm giá hay "xin sếp giảm" khi chưa được dặn.
- Không so sánh chê bai đối thủ.
- Không dồn nhiều câu hỏi một lượt.
- Không gửi cả bảng giá dài khi khách mới hỏi chung.
