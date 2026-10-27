---
name: lay-thong-tin-giao-hang
description: Xin đủ thông tin giao hàng sau khi khách đồng ý mua, kiểm lại, rồi tóm đơn để khách xác nhận. Dùng khi khách nói "lên đơn đi", "gửi về địa chỉ…", "ship cho mình", hoặc vừa chốt mua xong.
---

# Lấy thông tin giao hàng

Khách đã đồng ý mua. Việc còn lại: lấy đủ thông tin trong ít lượt nhất, không sai, rồi để khách xác nhận lần cuối.

## Xưng hô

Theo cách xưng hô đã dặn cho bot. Chưa có thì giữ đúng cách gọi trong cuộc trò chuyện.

## Thông tin cần có

1. Tên người nhận
2. Số điện thoại người nhận
3. Địa chỉ đầy đủ: số nhà, đường, phường/xã, quận/huyện, tỉnh/thành
4. Món, số lượng, phân loại (màu, size, gói)
5. Cách thanh toán (chỉ các cách có trong tài liệu)
6. Ghi chú (giờ nhận, gọi trước khi giao…), nếu khách có

## Các bước

1. **Xin một lượt, theo mẫu ngắn** để khách điền một lần, không hỏi từng mục một.
2. **Kiểm thông tin khách gửi**:
   - số điện thoại Việt Nam thường có 10 chữ số, bắt đầu bằng 0; sai dạng thì hỏi lại;
   - địa chỉ thiếu phường/xã hay tỉnh/thành thì hỏi đúng phần thiếu;
   - người nhận khác người đặt thì ghi rõ.
3. **Tóm đơn cho khách xác nhận**: món, số lượng, tổng tiền, phí ship (theo tài liệu), thông tin người nhận.
4. **Khách xác nhận thì báo bước tiếp theo**: lên đơn ở đâu, khi nào có mã vận đơn hay xác nhận (theo tài liệu). Không có công cụ lên đơn thì gửi tóm đơn cho chủ shop.
5. **Không có phí ship hay thời gian giao trong tài liệu** thì nói sẽ báo lại, và báo chủ shop.

## Mẫu xin thông tin

```
Mình gửi giúp em:
- Tên người nhận:
- Số điện thoại:
- Địa chỉ (số nhà, đường, phường/xã, quận/huyện, tỉnh/thành):
- Ghi chú (nếu có):
```

## Mẫu tóm đơn

```
Em tóm đơn để mình kiểm lại:
- [Món] x [số lượng] — [giá]
- Phí ship: [theo tài liệu / em báo lại]
- Tổng: [tổng]
- Người nhận: [tên] — [số điện thoại]
- Địa chỉ: [địa chỉ]
- Thanh toán: [cách]
Mình xác nhận giúp em là đúng nhé.
```

## Ví dụ

Khách: "Gửi về Lan, 090 123 456, 12 Lê Lợi, Huế nhé."

> Dạ em cảm ơn. Số điện thoại mình gửi mới có 9 chữ số, mình kiểm lại giúp em nhé. Và 12 Lê Lợi thuộc phường nào ạ?

## Không được làm

- Không tự đoán phần địa chỉ còn thiếu.
- Không tự tính phí ship, thời gian giao khi tài liệu không có.
- Không xin số thẻ, mã OTP, mật khẩu, ảnh giấy tờ tùy thân.
- Không chép thông tin của khách này sang khách khác, không nhắc thông tin khách trong nhóm chat chung.
- Không báo "đã lên đơn" khi chưa thật sự lên đơn hay chưa gửi cho chủ shop.
