# Plan phụ kiện linh vật — để Sonnet làm

Người viết plan: Opus. Người làm: Sonnet 5.5 effort cao. Opus soát và commit. Người dùng đã duyệt bản vẽ và chọn **phương án A**: phụ kiện là một phần của linh vật, hiện ở mọi nơi có linh vật, kể cả Văn phòng 3D.

## Bản vẽ và tài liệu

- `design/canvas/PhuKienLinhVat.dc.html`: gồm đội hiện tại ở các cỡ 16, 24, 40 và 96; mục "Trong app" (thanh bên, chat, ô chọn phụ kiện trong hồ sơ bot); thư viện 50 dáng với phụ kiện mặc định.
- `design/canvas/PhuKien3D.dc.html`: 10 bot đeo phụ kiện 3D, mã three.js nằm trong `<script>` cuối tệp.
- `docs/plans/phu-kien-linh-vat/acc.py`: **nguồn sự thật của phần vẽ 2D**. Tệp này gồm:
  - 22 hàm vẽ phụ kiện, viết bằng SVG trong hệ toạ độ 0..100;
  - bảng `HAT`: chỗ đặt mũ cho các dáng có đỉnh lõm hay nhọn;
  - bảng `DEFAULT`: phụ kiện mặc định của từng dáng trong 50 dáng;
  - bảng `TINT`: màu phụ kiện, để không trùng màu thân;
  - `ACC`: tên hiện của từng phụ kiện.
- `docs/plans/phu-kien-linh-vat/geo.json`: số đo của từng dáng, đo bằng ảnh raster:
  - `bb`: khung thân;
  - `eb`: khung hai mắt;
  - `ex`, `ey`: tâm mắt;
  - `hx`, `top`: chỗ đặt mũ;
  - `L`, `R`: mép trái và phải ngang tầm mắt;
  - `Lb`, `Rb`: mép trái và phải thấp hơn tầm mắt 16 đơn vị;
  - `bot`: đáy thân dưới tâm mắt.

Mã trong `acc.py` và trong bản vẽ do Opus viết, nên được phép chép và chuyển sang TypeScript.

## Luật

- Không commit, không push, không dùng mạng, không cài gói, không đọc khoá.
- Chữ giao diện có đủ tiếng Anh và tiếng Việt, dùng `{you}` khi cần. Không thêm dòng giải thích ngoài bản vẽ.
- Chú thích mã viết tiếng Việt có dấu, theo giọng mã sẵn có.
- Không phá dữ liệu cũ: bot không có trường phụ kiện thì dùng phụ kiện mặc định của dáng.

## 1. Dữ liệu (`packages/aris-ui-kit`)

- Thêm tệp `src/accessories.generated.ts`, sinh bằng một script mới hoặc mở rộng `scripts/gen-ui-kit.mjs`. Tệp gồm:
  - số đo của 50 dáng, lấy từ `geo.json` và đã áp bảng `HAT`;
  - bảng `DEFAULT`;
  - bảng `TINT`.
  Ghi rõ nguồn ở đầu tệp, như `mascots.generated.ts` đang làm.
- Thêm `src/accessories.ts`. Tệp này chứa:
  - 22 hàm vẽ, chuyển từ `acc.py`, trả về chuỗi SVG;
  - `ACCESSORIES`, danh sách `{ id, name }`;
  - `defaultAccessory(mascotId)`;
  - `accessorySvg(mascotId, accId)`;
  - `resolveAccessory(mascotId, acc)`: nếu `acc` là `undefined` thì trả phụ kiện mặc định; nếu là `'none'` thì trả `null`; còn lại thì dùng chính `acc`.
- Tên phụ kiện nằm trong text của ui-kit, có đủ hai thứ tiếng. Nếu ui-kit chưa có chỗ chứa chữ thì đặt chữ trong `aris-ui-pages`. Mã phụ kiện giữ đúng như trong `acc.py` (`vuong-mien`, `kinh`, `mu-noi`, …).
- Biến CSS `--acc-edge` là viền mảnh để phụ kiện màu tối không chìm vào nền tối:
  - nền sáng thì `transparent`;
  - nền tối thì `rgba(255,255,255,.45)`.
  Đặt biến này trong theme chung, xem `aris-ui-theme`.
- **Test thuần**:
  - mọi dáng trong `MASCOTS` đều có số đo và phụ kiện mặc định;
  - mọi cặp dáng × phụ kiện đều sinh ra SVG hợp lệ (không có `NaN`, không có `undefined`);
  - `resolveAccessory` trả đúng cho cả ba trường hợp.

## 2. Vẽ linh vật có phụ kiện

- `Mascot` (`react/basics.tsx`) thêm prop `accessory?: string`, theo luật của `resolveAccessory`.
  - Có phụ kiện thì `viewBox="-10 -16 120 120"`; không có thì giữ `0 0 100 100`.
  - **Quan trọng:** chỉ chạy `markEyes` trên phần thân, sau đó mới nối SVG phụ kiện. Nếu chạy cả trên phụ kiện, các phần trắng của phụ kiện (quả bông của mũ len, mũ đầu bếp, mũ ngủ, mũ y tá) sẽ chớp như mắt.
- `mascotSvg(id, size, label, accessory?)` theo cùng luật.
- Nơi **chọn dáng** (`MascotPicker`, thư viện dáng khi tạo bot) truyền `accessory="none"`, vì ở đó người dùng đang chọn dáng chứ không chọn phụ kiện.
- **Mọi chỗ khác có bản ghi bot** thì truyền `accessory={bot.accessory}`. Grep mọi chỗ dùng `Mascot`, `mascotSvg` và `.mascot`; danh sách tệp có sẵn ở cuối plan. Chỗ nào chỉ có mã dáng mà không có bot thì để mặc định.
- Kiểu dữ liệu đội ở client (`react/team.ts`, các kiểu `mascot: string`) thêm `accessory?: string`, rồi truyền tiếp xuống mọi nơi.

## 3. Bản ghi bot và API (`packages/aris-bots`)

- Thêm `accessory: z.string().optional()` vào `botRecord`, lưu mã phụ kiện hoặc `'none'`.
- `store.ts`:
  - nhận `accessory` khi tạo và khi sửa bot, giống `mascot`;
  - giá trị lạ (không có trong danh sách phụ kiện, cũng không phải `'none'`) thì bỏ qua, giữ giá trị cũ.
- `portable.ts`: xuất và nhập kèm `accessory`.
- Trả `accessory` ở mọi API đang trả `mascot`: `/api/aris/bots`, đội cho thanh bên, các API của Văn phòng.
- Có test cho store và portable.

## 4. Hồ sơ bot (`aris-ui-pages/src/client/team/Bot.tsx`)

Làm theo khung "Hồ sơ bot · Thơ" trong bản vẽ: dưới ô chọn dáng có mục **Phụ kiện**.
- Lưới ô chọn gồm "Không đeo" và 22 phụ kiện. Mỗi ô là linh vật của bot đeo phụ kiện đó; tên phụ kiện hiện ở `title` và `aria-label`.
- Ô đang chọn có viền xanh.
- Lưu cùng nút Lưu hiện có: thêm `accessory` vào danh sách trường `dirty`.
- Đổi dáng thì giữ phụ kiện đã chọn. Nếu bot đang dùng mặc định (`accessory` rỗng) thì phụ kiện tự theo mặc định của dáng mới.
- Bấm vào phụ kiện thì ảnh lớn của bot đổi ngay.
- Bàn phím đi được giữa các ô chọn. Bot ngoài cũng chọn được phụ kiện.

## 5. Văn phòng 3D (`office/scene3d.ts`)

- Bỏ phần phụ kiện viết riêng cho `commander`, `mai`, `dev` và `ha`. Thay bằng bảng builder 3D cho **cả 22 phụ kiện**, đọc theo `resolveAccessory(actor.mascot, actor.accessory)`.
  - 10 builder đã có trong `PhuKien3D.dc.html` (đối tượng `ACC` trong script); chép sang.
  - 12 builder còn lại tự dựng cùng phong cách:
    - mũ tiệc, mũ đầu bếp, mũ tốt nghiệp, mũ ngủ, mũ y tá, mũ rộng vành;
    - mầm cây, nơ cài tóc, nơ cổ, tai nghe không mic, bút chì giắt tai, huy hiệu.
  - Dùng khối đơn giản (cylinder, cone, sphere, torus, box). Màu lấy từ `TINT` hay màu mặc định của hàm 2D tương ứng.
- `Actor` thêm `accessory`, và `model.ts` truyền xuống.
- Geometry và material của phụ kiện phải được dispose khi bỏ bot, như `extras` đang làm.

## 6. Bot của đội hiện tại

Không cần migration: bot không có trường `accessory` thì dùng mặc định của dáng. Bot Lan (dáng `bong-bay`) có mặc định là mũ tiệc, nhưng bản vẽ chọn mũ len. Opus sẽ đặt lại trong hồ sơ bot sau khi soát, Sonnet không cần sửa dữ liệu thật.

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`.
3. `npx eslint .` và `npx prettier --check .`.
4. `pnpm check:locale`, `pnpm check:licenses`, `pnpm check:deps`.
5. `node scripts/aris.mjs restart`, đợi 15 giây, rồi chạy `status`: Telegram phải "đang nhận tin". Lark đang báo hết hạn mức API của Lark, lỗi này đã có từ trước.

## Báo cáo cho Opus

- Các tệp đã sửa và tạo.
- Danh sách chỗ đã truyền `bot.accessory`, và các chỗ để mặc định vì không có bot.
- Dung lượng `lib/client.js` của `aris-ui-kit` và `aris-ui-pages`, trước và sau.
- Chỗ khác bản vẽ, và 12 builder 3D mới trông thế nào (mô tả ngắn).
- Kết quả thật của từng bước kiểm tra.

## Tệp đang dùng linh vật (để grep)

`aris-ui-chat-header/Header.tsx`; `aris-ui-chat`: `Chat.tsx`, `External.tsx`, `Room.tsx`, `Speaker.tsx`, `bot-source.tsx`, `branch.ts`, `index.tsx`, `mentions-dom.ts`; `aris-ui-kit`: `BotPicker.tsx`, `TeamOrbit.tsx`, `basics.tsx`, `layout.tsx`, `taskline.tsx`, `team.ts`; `aris-ui-pages`: `auto/Kanban.tsx`, `auto/Routine.tsx`, `auto/RoutineNew.tsx`, `brain/Ask.tsx`, `brain/Soat.tsx`, `mind/Approvals.tsx`, `mind/Runs.tsx`, `mind/Skills.tsx`, `mind/names.ts`, `office/*`, `options.tsx`, `settings/Channels.tsx`, `settings/Commander.tsx`, `settings/Integrations.tsx`, `settings/Model.tsx`, `settings/Replay.tsx`, `settings/Stats.tsx`, `team/*`, `ui.tsx`; `aris-ui-sidebar/SidebarRoot.tsx`. Phía máy chủ có thể trả `mascot` ở: `aris-acp`, `aris-brain`, `aris-channels`, `aris-stats` (để trả kèm `accessory` nếu giao diện cần).
