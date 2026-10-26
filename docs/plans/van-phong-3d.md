# Plan Văn phòng 3D (và hai chỗ sót) — để Sonnet làm

Người viết plan: Opus. Người làm: Sonnet 5.5 effort cao. Opus soát và commit.

## Bản vẽ

`design/canvas/VanPhong3D.dc.html` là bản vẽ của chế độ 3D. Nó đã chạy được three.js thật: toàn bộ cảnh nằm trong `build(T, el)` ở phần `<script>`. **Dùng chính mã đó làm điểm xuất phát.** Mã này do Opus viết cho bản vẽ, nên được phép chép và sửa lại thành TypeScript trong repo.

Thư viện đã cài sẵn: `three@0.160.0` và `@types/three@0.160.0` trong `packages/aris-ui-pages`. **Không cài thêm gói nào.** Không dùng `OrbitControls` hay các addon khác; xoay, phóng to và bấm chọn tự viết như trong bản vẽ.

## Luật

- Không commit, không push, không dùng mạng, không đọc khoá.
- Chữ giao diện nằm trong `text.ts`, có đủ tiếng Anh và tiếng Việt, dùng `{you}`.
- Không bịa dữ liệu.
- Màu theo sáng tối của app: đọc lớp hoặc biến theme hiện có, xem cách `Office` hay các trang khác biết đang sáng hay tối. Khi người dùng đổi sáng tối thì cảnh tự đổi theo.
- Chuyển động phải tôn trọng `prefers-reduced-motion`. Khi bật, bot đứng yên ở chỗ của mình và không đi lại.
- Dọn dẹp đầy đủ khi rời trang: `cancelAnimationFrame`, `renderer.dispose()`, dispose geometry và material, gỡ listener.
- three chỉ được tải khi người dùng bật 3D: dùng `import('three')` động nếu `scripts/build-client.mjs` (esbuild) cho phép tách gói. Nếu không tách được thì import tĩnh cũng được, nhưng phải ghi dung lượng `lib/client.js` trước và sau vào báo cáo.

## Việc 1 · Chế độ 3D trong trang Văn phòng (`packages/aris-ui-pages/src/client/office/`)

- Bật nút 3D đang để "Sắp có". Nút 2D/3D lưu lựa chọn vào `localStorage` (bọc `try`), mặc định là 2D.
- Thêm component `Office3D.tsx`, chỉ dùng cho tab Tổng quan:
  - **Cảnh như bản vẽ:** sàn, hai tường, cửa kính có đèn thành phố khi tối, thảm theo từng phòng ban, bàn có laptop (màn sáng khi bot đang làm), bàn chỉ huy, bàn họp, sofa, tủ, cây, đèn bàn khi tối.
  - **Khu và bàn dựng từ dữ liệu thật:** mỗi phòng ban một khu, mỗi bot một bàn. Số khu và số bàn thay đổi theo đội thật. Chia khu theo lưới tự tính để không chồng nhau.
  - **Bot:** nhân vật bo tròn dạng capsule, màu lấy từ màu linh vật của bot (xem `@aris/ui-kit` có bảng màu linh vật không; không có thì lấy màu chính của SVG linh vật). Có mắt.
  - **Vị trí theo trạng thái thật:**
    - đang làm: ngồi sau bàn mình, nhún;
    - chờ {you}: đứng ở cửa, nhảy nhẹ;
    - rảnh: ngồi trên sofa, nghiêng;
    - Aris đang làm: đi qua lại giữa bàn chỉ huy và bàn của bot được giao việc gần nhất (nếu biết), nếu không thì đứng ở bàn chỉ huy.
  - **Đổi trạng thái thì bot đi tới chỗ mới,** nội suy vài giây, không nhảy cóc.
  - **Nhãn tên:** thẻ HTML đặt theo vị trí chiếu 3D sang màn hình, như bản vẽ. Gồm chấm trạng thái, tên, và dấu "!" hoặc "z".
  - **Tương tác:** kéo để xoay, cuộn để phóng to (có giới hạn), bấm vào bot thì mở **cùng ngăn kéo** của 2D (`Drawer`). Dùng lại component, không viết lại.
  - **Lớp phủ:** 3 con số nhỏ ở góc trên trái (token, chi phí, chờ {you}); khung "Vừa làm gì" 4 dòng ở góc dưới trái, dùng lại dữ liệu feed của 2D.
  - **Không có WebGL** thì hiện một dòng thông báo và quay về 2D.
- Hiệu năng:
  - giới hạn `devicePixelRatio` ở 2;
  - shadow map 1024;
  - dừng vòng lặp khi tab trình duyệt bị ẩn (`document.hidden`).

## Việc 2 · Số trên mục Tự học (`packages/aris-ui-sidebar`)

Hiện số này chỉ đếm yêu cầu xin quyền. Cần đếm **mọi thứ chờ duyệt trong Hộp duyệt**, cùng nguồn mà trang Hộp duyệt dùng để ra số trên tab của nó: đề xuất ký ức, skill… Tìm trong `mind/Learn.tsx` và trang `approvals` để thấy nguồn.

## Việc 3 · Cột "Vừa làm gì" trống khi việc chạy qua `aris ask`

Việc giao qua socket daemon `/ask` (xem `packages/aris-daemon`) không ghi vào hoạt động của bot nên không lên feed. Thêm ghi hoạt động "nhận việc" và "xong" cho phiên `/ask`, theo cách các phiên khác đang ghi trong `aris-bots` (`live.activity`). Viết test cho phần này.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`, có test cho hàm thuần chia khu và bàn (`layoutOffice`) và hàm chọn chỗ đứng theo trạng thái.
3. `npx eslint .` và `npx prettier --check .`.
4. `pnpm check:licenses` và `pnpm check:deps`.
5. `node scripts/aris.mjs restart`, đợi 15 giây, rồi `status` (Telegram phải "đang nhận tin").

## Báo cáo cho Opus

- Các tệp đã sửa.
- Dung lượng `lib/client.js` của `aris-ui-pages` trước và sau.
- Đã tách được gói three hay chưa.
- Chỗ nào khác bản vẽ.
- Kết quả thật của từng bước kiểm tra.
