# Plan 8.2 · Phán quyết "chờ" của `/goal` và gộp skill trùng

Đọc trước `docs/plans/gd8-chung.md`. Plan này bù hai phần còn thiếu so với Hermes. Cả hai được ghi ở `docs/ke-hoach-trien-khai.md`, dòng "Phần bù Hermes còn lại".

## Phần A · `/goal` biết chờ

### Hiện trạng

- Gói `@aris/autonomy`, tệp `packages/aris-autonomy/src/`.
- Cuối mỗi lượt, giám khảo dùng model rẻ chấm mục tiêu. Bộ luật nằm trong `rules.ts`:
  - `judgePrompt` (khoảng dòng 89) tạo câu hỏi cho giám khảo;
  - `parseVerdict` (khoảng dòng 116) chỉ nhận ba phán quyết `done`, `continue`, `blocked`;
  - `isStuck` chặn mục tiêu khi giám khảo trả `continue` ba lần liền với cùng một điều còn thiếu.
- `index.ts` xử lý phán quyết (khoảng dòng 327–341):
  - `done` thì gọi `port.complete`;
  - `blocked` thì gọi `port.block`;
  - `continue` thì dsh tự gửi lượt kế, kèm lời của giám khảo.
- Tạm dừng và chạy tiếp mục tiêu dùng `port.pause` và `port.resume` (hàm `goalOp`, khoảng dòng 609).
- `/loop` đặt lịch nhắc bền qua cổng `schedule` của dsh. Mỗi lịch nhắc có dấu `[aris-loop:<id>]` (`markerOf`, `MARKER_RE`).
- **Thiếu:** khi bot đang đợi một việc chạy nền (CI, bản build, email trả lời, tệp xuất), giám khảo chỉ có thể trả `continue`. Bot bị thúc chạy lượt rỗng liên tục, tốn tiền, hoặc bị `isStuck` chặn oan.

### A1. Phán quyết mới

- Giám khảo được trả thêm `"verdict": "wait"`, kèm hai trường:
  - `waiting_for`: đang đợi cái gì, một câu ngắn, bắt buộc;
  - `wait_seconds`: đợi bao lâu, từ 60 đến 3600.
- Sửa `judgePrompt`: chỉ chọn `wait` khi **mọi phần bot tự làm được đã xong** và kết quả tiếp theo phụ thuộc một tiến trình hay sự kiện bên ngoài đang chạy. Ví dụ hợp lệ: CI đang chạy, bản deploy đang lên, đang chờ người khác trả lời email. Không chọn `wait` khi bot còn việc để làm.
- `parseVerdict`: nhận `wait`. Nếu `wait_seconds` nằm ngoài khoảng 60–3600 thì đưa về mép gần nhất. Thiếu `waiting_for` thì coi như `continue`.

### A2. Cách chờ

Khi phán quyết là `wait`:
1. Ghi phán quyết vào bản ghi mục tiêu, như các phán quyết khác.
2. `port.pause` mục tiêu, để dsh không gửi lượt kế.
3. Đặt lịch nhắc bền qua `schedule` vào lúc `bây giờ + wait_seconds`, kèm dấu mới `[aris-goal-wait:<id>]`. Nội dung nhắc: "Kiểm tra lại: <waiting_for>. Nếu đã có kết quả thì làm tiếp mục tiêu; nếu chưa, nói rõ đang chờ gì."
4. Khi lịch nhắc tới: `port.resume` mục tiêu, rồi đưa tin nhắc vào phiên. Làm theo cách `/loop` đang chạy lịch nhắc.

Giới hạn:
- **Tối đa 8 lần chờ liên tiếp**, hoặc **tổng thời gian chờ 2 giờ** cho một mục tiêu. Vượt thì `port.block` với lý do "Chờ quá lâu: <waiting_for>".
- Hai giá trị này là hằng số trong `rules.ts`, đặt tên rõ ràng.
- Lượt chờ **không tính vào `isStuck`**.
- Người dùng nhắn vào phiên trong lúc chờ: huỷ lịch nhắc và `resume` ngay.
- `/goal` bị huỷ hay tạm dừng tay: huỷ lịch nhắc.
- Daemon khởi động lại trong lúc chờ: lịch nhắc bền của dsh vẫn còn. Khi nhắc tới, nếu mục tiêu đã khác (đã xong, đã huỷ) thì bỏ qua.

Viết các hàm thuần trong `rules.ts`, mỗi hàm có test: `parseVerdict` (wait), `waitPlan(history, now)` (được chờ tiếp hay phải chặn), `isStuck` (bỏ qua lượt chờ).

### A3. Hiện trạng thái chờ

- **Màn Việc đang chạy** (mục tiêu trong `mind/Runs.tsx` hay chỗ đang vẽ màn 3.5):
  - pill **"Đang chờ"** màu cam nhạt;
  - dòng "Chờ: <waiting_for> · kiểm lại lúc HH:MM";
  - hai nút **"Kiểm ngay"** (huỷ lịch nhắc, chạy tiếp ngay) và **"Thôi chờ"** (tạm dừng hẳn).
- **Văn phòng:**
  - bot có mục tiêu đang chờ thì dòng terminal ghi "⏳ Chờ <waiting_for>";
  - nhật ký có loại dòng mới "Đang chờ";
  - bảng chat hiện một dòng tiến độ "Đang chờ … · kiểm lại lúc HH:MM".
- Thêm `op: 'goal-check-now'` vào API của autonomy.

### A4. Bản vẽ

Sửa khung màn Việc đang chạy đang có, hoặc thêm khung `GoalCho.dc.html`, với mục tiêu ở trạng thái chờ. Vẽ thêm một bàn trong Văn phòng ở trạng thái chờ. **Điểm dừng:** chờ người dùng duyệt.

### A5. Thử thật

- Giao Khoa một `/goal`, ví dụ: "chạy `sleep 120 && echo xong > /tmp/aris-cho.txt` ở nền, rồi báo khi tệp có chữ xong".
- Kỳ vọng:
  - giám khảo trả `wait` khoảng 60–180 giây;
  - mục tiêu tạm dừng, có lịch nhắc;
  - lịch tới thì mục tiêu chạy tiếp và kết thúc `done`.
- Ghi lại số lượt và chi phí. Thử thêm nút "Kiểm ngay".

## Phần B · Gộp skill trùng

### Hiện trạng

- `SkillStore` có `curatePlan`/`curate` (`store.ts`) để cất skill lâu không dùng. Mốc là `STALE_DAYS = 30` và `ARCHIVE_DAYS = 90`.
- Người dọn kho chạy hằng ngày (`index.ts` khoảng dòng 623–642), mỗi lần ghi một báo cáo.
- Chưa có cách phát hiện skill trùng nhau.

### B1. Tìm cặp nghi trùng (không tốn tiền)

Hàm thuần `duplicateCandidates(skills)`:
- chỉ so các skill **cùng một bot**, trạng thái `active` hay `draft`;
- điểm giống = Jaccard trên tập từ đã bỏ dấu (`fold` có sẵn trong autonomy, hoặc chép hàm tương đương) của `name`, `description` và `whenToUse`, cộng thêm điểm nếu tiêu đề các mục `##` trong thân bài trùng nhau;
- lấy các cặp có điểm từ 0,45 trở lên, mỗi lần tối đa 10 cặp;
- có test, với số liệu mẫu cho cả trường hợp trùng và không trùng.

### B2. Model xác nhận và soạn bản gộp

- Với mỗi cặp, gọi model rẻ (Flash, cùng cách gọi với vòng học nền `@aris/reflect` hay giám khảo). Model trả JSON:

  ```
  { "relation": "duplicate" | "overlap" | "distinct", "keep": "<tên giữ lại>", "reason": "...", "merged": "<thân bài gộp>" }
  ```

  Chỉ có `merged` khi `relation` là `duplicate`.
- Trần chi phí: **0,05 USD mỗi lần chạy**, cộng vào trần học nền của cả đội. Hết trần thì dừng và ghi vào báo cáo.
- Bản gộp phải qua `lintSkill` và bộ quét của plan 8.1 (nếu đã có).

### B3. Đề xuất gộp, chờ duyệt

- Tạo một loại đề xuất mới "gộp", hiện trong Hộp duyệt:
  - tiêu đề "Gộp «A» và «B» thành «A»";
  - lý do;
  - phần khác biệt giữa bản gộp và từng bản cũ;
  - hai nút **Gộp** và **Giữ cả hai**.
- Nếu Hộp duyệt chỉ nhận đề xuất bản mới của một skill thì làm như sau:
  - tạo đề xuất bản mới cho skill giữ lại, với `by: 'merge'`;
  - kèm `mergeOf: <id skill bị gộp>` trên `VersionRecord`;
  - khi duyệt thì cất skill kia, đặt `archivedBy: 'curator'` và lý do "đã gộp vào A";
  - khi từ chối thì ghi nhớ cặp đó, **không đề xuất lại trong 90 ngày**.
- `relation` là `overlap`: chỉ ghi vào báo cáo của người dọn kho, không tạo đề xuất.
- Không bao giờ tự gộp.

### B4. Khi nào chạy

- Người dọn kho hằng tuần, vào Chủ nhật, gộp chung với lần chạy hằng ngày.
- Nút **"Tìm skill trùng"** ở Thư viện skill, kèm `?curator=preview` để chạy thử không tốn tiền: chỉ chạy B1, chưa gọi model.
- Gửi tin Telegram tuần cùng báo cáo đang có, chỉ khi có đề xuất.

### B5. Bản vẽ

Thêm khung `GopSkill.dc.html`, gồm:
- thẻ đề xuất gộp trong Hộp duyệt;
- dải "N cặp có thể gộp" trong Thư viện skill.

**Điểm dừng:** chờ người dùng duyệt.

### B6. Thử thật

- Tạo hai skill gần giống nhau cho một bot, qua đề xuất `by: 'user'` hay qua nhập từ plan 8.1.
- Chạy "Tìm skill trùng", duyệt đề xuất gộp, kiểm tra skill thứ hai đã bị cất. Báo chi phí.

## Test bắt buộc

- Phần A: `parseVerdict` có `wait` (kẹp `wait_seconds`, thiếu `waiting_for`), `waitPlan` (8 lần chờ, 2 giờ), `isStuck` bỏ qua lượt chờ. Xử lý dấu `[aris-goal-wait:…]`, kể cả khi mục tiêu đã đổi lúc lịch nhắc tới.
- Phần B: `duplicateCandidates`, đọc JSON trả về của model (kể cả JSON hỏng), luồng duyệt và từ chối gộp, không đề xuất lại cặp đã từ chối.
- Cập nhật `docs/specs/aris-autonomy.md` và `docs/specs/aris-skills.md`.
