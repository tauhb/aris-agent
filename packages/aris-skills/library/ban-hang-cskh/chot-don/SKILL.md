---
name: chot-don
description: Mời khách chốt đơn nhẹ nhàng khi khách đã thấy hợp, không ép, không giảm giá bừa. Dùng khi khách hỏi "đặt sao", "thanh toán thế nào", "lấy cái này", hoặc đã hỏi xong giá và không còn thắc mắc.
---

# Chốt đơn nhẹ nhàng

Khách đã hỏi kỹ, không còn phản đối: đây là lúc giúp khách ra quyết định dễ nhất có thể. Chốt đơn là dọn đường, không phải đẩy.

## Xưng hô

Theo cách xưng hô đã dặn cho bot. Chưa có thì gọi khách theo cách khách tự xưng; giữ nguyên suốt cuộc trò chuyện.

## Nhận ra lúc nên chốt

- Khách hỏi cách đặt, cách thanh toán, thời gian nhận.
- Khách chọn được món cụ thể ("lấy màu đen size M").
- Khách hỏi xong giá, đã được trả lời, không còn lăn tăn gì.

Chưa thấy những dấu hiệu này thì đừng chốt; quay lại hỏi khách cần gì.

## Các bước

1. **Tóm lại lựa chọn của khách** trong một câu: món, số lượng, giá, ưu đãi (nếu tài liệu có).
2. **Đưa một lựa chọn rõ ràng**, không hỏi "mình có muốn mua không": hỏi "mình lấy 1 hay 2 ạ", "mình thanh toán chuyển khoản hay nhận hàng trả tiền ạ" (chỉ nêu cách thanh toán có trong tài liệu).
3. **Nói bước tiếp theo** thật cụ thể: cần thông tin gì, gửi vào đâu, bao lâu có xác nhận.
4. **Khách đồng ý thì chuyển sang lấy thông tin giao hàng** (skill lấy thông tin giao hàng nếu có).
5. **Khách còn ngập ngừng thì lùi một bước**, hỏi khách còn băn khoăn gì; không nhắc lại lời mời chốt ngay.

## Khuôn trả lời

```
[Tóm lại: món + giá + ưu đãi]
[Một câu hỏi chọn A hay B]
[Bước tiếp theo sau khi khách chọn]
```

Tối đa 3–4 dòng.

## Ví dụ

Khách: "Ok vậy lấy cho mình áo đen size M nhé."

> Dạ em ghi: 1 áo đen size M, 350.000đ, miễn ship đơn từ 300.000đ ạ.
> Mình thanh toán chuyển khoản hay nhận hàng rồi trả tiền ạ? Chọn xong em xin tên, số điện thoại và địa chỉ để lên đơn luôn nhé.

(Chỉ nói miễn ship khi tài liệu ghi.)

Trả lời chưa tốt:

> Dạ mình chốt luôn nhé, kẻo hết hàng ạ! Mua 2 em giảm thêm 10% luôn!

(Tạo gấp gáp giả, tự đặt ưu đãi.)

## Không được làm

- Không tạo khan hiếm, hạn chót giả.
- Không tự thêm ưu đãi, quà, combo khi tài liệu không có.
- Không nêu cách thanh toán, thời gian giao mà tài liệu không ghi.
- Không gửi số tài khoản ngân hàng nếu tài liệu không có; thiếu thì báo chủ shop.
- Không mời chốt lại liên tục khi khách còn phân vân.
