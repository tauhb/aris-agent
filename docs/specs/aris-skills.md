# Đặc tả `aris-skills` — skill tự tạo và tự vá (giai đoạn 3, đợt 3)

> Viết lại bằng lời của aris từ [tinh-nang-aris.md](../tinh-nang-aris.md) mục C2 và kế hoạch giai đoạn 3. Kiểm thử bằng chạy lại phiên cũ, dọn kho, ghim là đợt 4.

## Mục tiêu

- Sau việc khó, bot đề xuất một skill (`SKILL.md`) của riêng nó: cách làm dùng lại được cho lần sau.
- Người dùng sửa kết quả của một việc đã có skill (ví dụ sửa định dạng báo cáo) thì bot đề xuất bản vá cho skill đó.
- Không skill nào tự có hiệu lực: mỗi bản mới chờ duyệt ở Hộp duyệt (3.4), thẻ Telegram (7.3) hoặc màn chi tiết (3.3); quá 7 ngày thì tự bỏ.
- Mỗi bot chỉ thấy skill của mình.

## Dữ liệu

Kho `aris_skills`, hai bảng:

- `skills`: một dòng mỗi skill của một bot: `bot`, `name` (chữ thường không dấu, nối bằng `-`), `description`, `whenToUse`, `status` (`draft`: chưa có bản nào được duyệt; `active`; `rejected`), `version` (bản đang dùng, 0 khi chưa có), `uses`, `lastUsedAt`.
- `versions`: mỗi bản một dòng: số bản, `body` (Markdown), `description`, `whenToUse`, `status` (`proposed`, `active`, `superseded`, `rejected`), `by` (`reflect`, `user`, `restore`), `why`, `quote`, `sessionId`, cảnh báo của bộ kiểm, lúc tạo và lúc trả lời (`review`: ai, khi nào).

Vòng đời một bản: **đề xuất** → duyệt thì **đang dùng** (bản cũ thành `superseded`) hoặc **bị từ chối**. Khôi phục bản cũ tạo một bản mới (`by: restore`) và dùng ngay. Bước "ứng viên" (đã qua kiểm thử) thêm ở đợt 4.

## Bộ kiểm "bài học, không phải nhật ký"

Chạy khi vòng học đề xuất và khi người dùng sửa:

- Lỗi (bỏ đề xuất): tên sai dạng, thân rỗng hoặc quá 6.000 ký tự, mô tả rỗng.
- Cảnh báo (vẫn giữ, hiện cho người dùng): có ngày cụ thể hoặc "hôm nay, hôm qua, vừa rồi, lần này"; kể lại việc đã làm ("bot đã…", "đã gửi…") nhiều hơn chỉ dẫn; không có mục các bước; nhắc người dùng bằng "anh, chị, chủ nhân" thay vì "người dùng".

## Vòng học đề xuất

Mỗi lần học (gói `@aris/reflect`), model nhận thêm danh sách skill đang dùng của bot (tên, mô tả, thân của skill vừa dùng trong đoạn học) và có thể trả **tối đa một** `skill`:

- `name`, `description`, `whenToUse`, `body` (Markdown: "Khi nào dùng", "Các bước", "Lỗi thường gặp"), `why`, `quote`.
- Trùng tên skill đang có của bot thì là **bản vá** (bản kế tiếp), không thì skill mới.
- Chỉ đề xuất khi đoạn học là việc nhiều bước làm lại được, hoặc người dùng sửa kết quả của việc đã dùng skill. Việc một lần, chuyện trò thì không.

## Nạp skill cho bot

Khi agent được tạo, aris gắn một nguồn skill vào phạm vi của agent đó (`ctx.skills.registerProvider` trong một plugin con mount ở `agent.ctx`). Nguồn liệt kê bản đang dùng của các skill thuộc bot của phiên (tính lại mỗi lần, nên phiên đổi bot vẫn đúng), dsh hiện chúng trong danh mục skill của phiên và nạp thân bằng công cụ `skill`. Duyệt, từ chối, khôi phục đều báo các nguồn làm mới danh mục. Mỗi lần công cụ `skill` nạp một skill của aris thì cộng `uses`.

## Duyệt

- **Hộp duyệt (3.4)**: loại "Skill": skill nào, bot nào, bản mới hay bản vá, vì sao, số dòng thêm/bớt; Duyệt và bật / Mở chi tiết / Từ chối.
- **Telegram (7.3)**: thẻ "ĐỀ XUẤT SKILL · <bot>": bật `<tên>` vN?, vì sao, nút Bật / Không. Trả lời nơi khác hay hết hạn thì thẻ được sửa.
- **Màn 3.3**: thay đổi so với bản đang dùng (từng dòng thêm/bớt), lý do kèm lối mở đoạn chat, cảnh báo của bộ kiểm; Từ chối / Sửa rồi bật / Duyệt và bật; lịch sử các bản với khôi phục. Chỉ số kiểm thử và ca thử để mờ (đợt 4).
- **Màn 3.2**: danh sách skill của mọi bot, lọc Tất cả / Chờ duyệt / Đang dùng (Ít dùng, Lưu kho, Đã ghim mờ, đợt 4), cột bot, bản (`v2 → v3` khi có bản vá chờ), trạng thái, số lần dùng, cập nhật; "Thành công" để đợt 4.

## API

- `GET /api/aris/skills`: mọi skill (kèm bản đề xuất đang chờ). `?pending=all`: các bản chờ duyệt. `?id=<bot>/<tên>`: một skill, các bản, so sánh bản chờ với bản đang dùng.
- `POST`: `op` = `approve` (`version`, `body?` khi sửa rồi bật), `reject` (`version`), `restore` (`version`).

## Đợt 4 · Kiểm thử, dọn kho

### Kiểm thử bằng chạy lại

- **Ca thử**: yêu cầu thật của người dùng đã dẫn tới skill: lúc vòng học đề xuất (lời người dùng trong các lượt đem học) và mỗi lần skill được dùng (lời người dùng của lượt đó). Giữ 5 ca gần nhất, bỏ trùng.
- **Chạy**: chỉ khi người dùng bấm "Chạy kiểm thử" ở màn 3.3. Mỗi ca chạy hai lần trong phiên mới của đúng bot đó: **bản so sánh** (bản đang dùng; skill mới thì không có skill) và **bản thử** (bản đề xuất, hoặc bản đang dùng khi không có đề xuất). Nguồn skill của phiên kiểm thử chỉ trả đúng bản cần thử.
- **Hộp cát**: phiên kiểm thử chỉ được đọc: `read`, `grep`, `glob`, `skill`, `todo_write`, và `bash` với lệnh chỉ đọc (`git log/status/diff/show`, `ls`, `cat`, `head`, `wc`…, không chuyển hướng ghi). Công cụ khác bị từ chối kèm lời "đang kiểm thử, chỉ được đọc; nêu bạn sẽ làm gì rồi làm tiếp". Không mạng, không giao việc, không ghi ký ức; vòng học bỏ qua phiên kiểm thử.
- **Đo**: số bước (lần gọi model), token, câu trả lời cuối. **Chấm**: một lần gọi model rẻ đọc yêu cầu, mô tả skill và câu trả lời cuối, trả đạt / không kèm lý do; cùng cách chấm cho hai bản.
- **Trần**: tối đa 5 ca, 0,20 USD mỗi lần kiểm thử (tiền các phiên kiểm thử và lần chấm, ghi sổ chi phí phạm vi `eval`). Chạm trần thì dừng ca còn lại, ghi rõ.
- **Kết quả**: bảng `evals` (ca, hai bản, số bước, token, đạt, ghi chú, tiền). Màn 3.3 hiện Đạt (bản thử / bản so sánh), Số bước và Token (% thay đổi), bảng ca thử. Bản đề xuất đã kiểm thử là "ứng viên" (nhãn), vẫn chờ duyệt. Màn 3.2 cột Thành công là tỉ lệ đạt của lần kiểm thử gần nhất.
- Phiên kiểm thử đặt tên "Kiểm thử skill · <tên> · ca N · bản …" để người dùng nhận ra trong danh sách phiên.

### Dọn kho, ghim, tắt, sao lưu

- **Ít dùng**: skill đang dùng, không được dùng 30 ngày (đợt 6; đợt 4 là 14) (tính từ lần dùng cuối, chưa dùng thì từ lúc bật). Vẫn nạp cho bot, chỉ là nhãn.
- **Lưu kho**: 90 ngày không dùng (đợt 6; đợt 4 là 30) thì người dọn kho tự cất (không nạp cho bot nữa); người dùng cũng tự cất được ("Tắt / cất vào kho"). "Dùng lại" đưa về đang dùng.
- **Ghim**: skill đã ghim không bị dọn.
- Người dọn kho chạy mỗi ngày (lúc khởi động và mỗi 24 giờ); lần chạy gần nhất và lần kế hiện ở màn 3.2.
- **Sao lưu**: tải về tệp `.aris-skills.json` gồm mọi skill và các bản. Quay lui từng skill bằng lịch sử bản (đã có).

## Đợt 6 · Bù so với Hermes: `/learn`, người dọn kho có báo cáo

### `/learn` — học skill từ nguồn

- `/learn <nguồn>` trong chat của một bot: nguồn là thư mục, tệp, URL, hay một quy trình tả bằng lời / vừa làm trong cuộc này. Lệnh không tự đọc gì: nó gửi cho bot một lượt có chuẩn viết skill của aris (tên chữ thường nối gạch, mô tả một câu, các mục Khi nào dùng / Các bước / Lỗi thường gặp / Kiểm tra, bài học tổng quát chứ không phải nhật ký), bot tự gom tài liệu bằng công cụ sẵn có (đọc tệp, tìm, đọc web) rồi gọi công cụ `luu_skill`.
- `luu_skill` chỉ dùng được trong lượt do `/learn` mở (lượt khác bị từ chối kèm lý do). Nó tạo **đề xuất** của bot đó (`by: user`, lý do "Học từ: <nguồn>", 1–3 ca thử là các yêu cầu mẫu bot viết), qua bộ kiểm như mọi đề xuất; trùng tên skill đang có thì thành bản vá. Duyệt như cũ: Hộp duyệt, thẻ Telegram, màn 3.3 (kiểm thử được).
- Màn 3.2: nút "Học skill từ tài liệu…" chưa có bảng nhập (chưa vẽ); nhãn đổi thành hướng dẫn dùng `/learn` trong chat.

### Người dọn kho

- Mốc mới theo Hermes bản đang đối chiếu: 30 ngày không dùng là ít dùng, 90 ngày thì cất kho. Skill chưa dùng tính từ lúc bật. Ghim thì miễn; skill được routine dùng sẽ miễn khi có routine (giai đoạn 4).
- Mỗi lần chạy ghi một báo cáo (bảng `curatorRuns`, giữ 30 lần gần nhất): lúc chạy, skill vừa thành ít dùng, skill đã cất (tên, bot, số ngày không dùng).
- Chạy thử: `GET /api/aris/skills?curator=preview` trả kế hoạch lần tới mà không đổi gì. Màn 3.2 hiện dòng cuối: mốc dọn, kết quả lần gần nhất, và lần tới sẽ cất gì.
- Gộp skill trùng bằng model (Hermes để tắt mặc định) vẫn để sau.

## Đợt 8.1 · Kho skill chung của đội, nhập skill

- Skill của đội có `bot = '_doi'` và `assigned` (`'all'` hoặc danh sách bot). Skill riêng của bot cùng tên thắng skill đội. Số lượt dùng đếm riêng từng bot (`usesBy`).
- Nhập skill từ GitHub (repo, nhánh, thư mục), `~/.claude/skills`, `~/.codex/skills` hoặc một thư mục: quét, chọn, rồi mọi thứ nhập vào đều thành **đề xuất** (`by: import`) kèm nguồn, bản (sha) và cảnh báo nguy hiểm (curl|sh, eval, rm -rf rộng, sudo, đường dẫn bí mật, cụm tiêm lệnh). Duyệt xong thì gán theo lựa chọn lúc nhập.
- Giao diện: Tự học › Thư viện skill (bộ lọc Kho đội, nút "Nhập skill", ô gán bot), trang chi tiết skill đội ("Bot được dùng", nguồn, Kiểm tra bản mới, Chia sẻ cho đội, Trả về làm skill riêng), Hộp duyệt gộp theo lần nhập, hồ sơ bot › Skill & tool (mục "Từ kho đội").
- Chưa làm: kiểm tra bản mới tự động hằng tuần (hiện chỉ bấm tay).

## Đợt 8.2 · Gộp skill trùng

- `duplicateCandidates` (thuần, `merge.ts`): chỉ so skill đang dùng của cùng một bot; điểm = Jaccard theo từ của tên, mô tả, khi nào dùng, cộng 0,25 Jaccard của tiêu đề các mục `##`; lấy cặp từ 0,45, tối đa 10 cặp. `GET ?duplicates=preview` chạy thử, không gọi model.
- `POST { op: find-duplicates }`: với mỗi cặp, model rẻ trả `duplicate` / `overlap` / `distinct`, tên skill giữ lại và (khi `duplicate`) thân gộp. Trần 0,05 USD mỗi lần (`DUP_CAP_USD`). `overlap` chỉ ghi vào báo cáo.
- `duplicate` thành đề xuất bản mới của skill giữ lại: `by: 'merge'`, `mergeOf` là skill bị gộp, qua `lintSkill` và `scanImported`. Không bao giờ tự gộp.
- Duyệt: skill kia được cất (`archivedBy: 'curator'`, `mergedInto`), bot được gán của hai skill đội cộng lại. Từ chối ("Giữ cả hai"): ghi `mergeSkips` vào skill giữ lại, 90 ngày không đề xuất lại (hết hạn chờ không tính).
- Người dọn kho tự tìm vào Chủ nhật (báo cáo có `dupes`). Giao diện: nút "Tìm skill trùng" và dải "N cặp có thể gộp" ở Thư viện skill, thẻ gộp ở Hộp duyệt.

## Đợt 8.8 · Kho skill dựng sẵn tiếng Việt

- Skill do aris viết nằm trong gói: `packages/aris-skills/library/<gói>/<skill>/SKILL.md` và `library/<gói>/pack.json` (`id` trùng tên thư mục, tên, mô tả, `version`, `suggest`, danh sách skill với `name`, `version`, `cases`). Thư mục `library` được đóng kèm gói (`files`).
- `loadLibrary` (`library.ts`) đọc và kiểm cả kho: `pack.json` khớp thư mục, mỗi skill có `SKILL.md` đọc được, tên trong tệp trùng tên thư mục, mô tả có đoạn "Dùng khi…", qua `lintSkill` **không cảnh báo nào**, qua `scanImported`, có 2–3 ca thử; thư mục không có trong danh sách và tên trùng giữa hai gói là lỗi. Test `library.test.ts` đòi kho thật không có lỗi nào.
- Cài (`installFromLibrary`): đi qua `importItems` với nguồn `kind: 'library'` (`pack`, `libVersion`, `path` là `<gói>/<skill>`), rồi duyệt luôn thay người dùng (người dùng đã bấm cài) nên không vào Hộp duyệt. Thành skill của đội, chưa gán bot trừ khi chọn bot lúc cài; ca thử của gói thêm vào skill; skill đã cất thì lấy ra lại.
- Tình trạng (`stateOf`): `none`, `installed`, `update` (kho có `version` lớn hơn bản đã cài), `edited` (skill cùng tên đang dùng không phải bản từ kho: người dùng sửa, vòng học vá hay nhập nơi khác), `archived`. Skill `edited` không bị ghi đè khi cài hay cập nhật, trừ khi `force` (người dùng đồng ý); bản cũ vẫn trong lịch sử bản.
- API: `GET ?library=1` (các gói, nội dung, tình trạng, số đã cài, số có bản mới), `POST { op: library-install, pack, names?, bots?, force? }`.
- Gói hiện có: Bán hàng và chăm sóc khách, Nội dung mạng xã hội, Phễu và marketing (mỗi gói 6 skill). Giao diện tab "Kho dựng sẵn" theo bản vẽ `design/canvas/KhoDungSan.dc.html`.

## Để sau

Bảng nhập cho "Học skill từ tài liệu…" (cần vẽ), nhập lại từ tệp sao lưu.
