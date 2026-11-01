# Đóng góp cho aris-agent

Cảm ơn bạn đã muốn góp tay. Mọi đóng góp đều được chào đón: báo lỗi, đề xuất, sửa tài liệu, dịch, viết skill, sửa mã.

_English: issues and pull requests in English are welcome too._

## Báo lỗi và đề xuất

Mở một issue, ghi rõ:

- bạn đã làm gì, mong đợi gì, thực tế ra sao;
- phiên bản Node, hệ điều hành, model đang dùng;
- log liên quan. **Xoá mọi khoá API, token, mã đăng nhập trước khi dán.**

## Gửi pull request

1. Fork repo, tạo nhánh từ `main`.
2. Cài và build:

   ```bash
   pnpm install
   pnpm build
   ```

3. Sửa, thêm test cho phần thay đổi.
4. Chạy kiểm tra đầy đủ, phải qua hết:

   ```bash
   pnpm check
   ```

   Lệnh này build, lint, kiểm định dạng (Prettier), chạy test, kiểm độ phủ bản dịch, phụ thuộc và giấy phép.

5. Mở pull request vào `main`, mô tả thay đổi gì và vì sao.

## Quy ước

- **Giấy phép:** đóng góp của bạn được phát hành theo giấy phép MIT của dự án.
- **Gói npm mới:** ghi tên, phiên bản chính xác và giấy phép trong pull request. Chỉ nhận gói có giấy phép tương thích MIT (`pnpm check:licenses` sẽ báo).
- **Mã của dự án khác:** không sao chép mã hay prompt từ dự án khác vào aris. Học thiết kế thì được, nhưng viết lại bằng cách của mình. Nếu có tham khảo, ghi vào [docs/clean-room-log.md](docs/clean-room-log.md).
- **Bí mật:** không commit khoá, token, `.dsh-home/` hay dữ liệu người dùng.
- **Chữ trên giao diện:** đi qua bộ bản dịch, không viết cứng; xưng hô dùng `{you}` thay vì cố định "anh/chị".
- **Phong cách mã:** theo mã xung quanh; Prettier và ESLint quyết định định dạng.
