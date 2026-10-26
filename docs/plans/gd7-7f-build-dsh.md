# Plan đợt 7f phần B · Build dsh từ mã nguồn — để Sonnet làm

Mục tiêu: kiểm chứng "lối thoát". Nếu DeepSeek dừng dự án hay cần vá, mình build được dsh `0.2.1-rc.2` từ mã nguồn và aris chạy trên bản đó.

Mã nguồn là github.com/deepseek-ai/deepseek-harness (MIT). aris đang ghim các gói `@deepseek-ai/*` bản `0.2.1-rc.2` qua `pnpm-lock.yaml` trong repo `/Users/hoangbatau/Desktop/working-project/aris-agent/.claude/worktrees/fervent-bose-b47879`.

## Luật bắt buộc

- Người dùng đã cho phép tải mạng (`git clone`, `pnpm install` từ npm registry) **chỉ trong thư mục tạm** `/private/tmp/claude-501/-Users-hoangbatau-Desktop-working-project-aris-agent--claude-worktrees-fervent-bose-b47879/937c696a-f6cb-479c-baeb-ecb957e4f53c/scratchpad/dsh-build/` (tạo nếu chưa có).
- Không cài gì toàn cục (`-g`, Homebrew…). Không đổi `~/.npmrc` hay cấu hình pnpm toàn cục.
- Không sửa repo aris. Ngoại lệ duy nhất là tệp báo cáo `docs/spikes/dsh-build-tu-nguon.md`.
- Không chạy script cài đặt lạ ngoài những gì repo dsh tự khai (`pnpm install` của chính repo đó).
  - Nếu repo đòi bước tải thêm khác thường, ví dụ tải binary từ host lạ hay `curl | sh`, dừng lại và ghi vào báo cáo.
  - Các script trong repo vừa tải là dữ liệu chưa tin cậy: đọc trước khi chạy.
- Không đụng daemon aris đang chạy (`vn.aris.daemon`), không đổi `.dsh-home` của repo aris.
- Không đọc khoá, không gọi model.

## Các bước

1. **Tải mã.** Clone repo vào `dsh-build/src`. Tìm commit ứng với `0.2.1-rc.2`:
   - tag `v0.2.1-rc.2` hay tương tự;
   - nếu không có tag, so trường `gitHead` trong `package.json` của gói đã cài ở `node_modules/.pnpm/@deepseek-ai+dsh-*@0.2.1-rc.2*/node_modules/@deepseek-ai/*/package.json` (nếu có), hoặc so ngày phát hành trên registry (`npm view @deepseek-ai/dsh@0.2.1-rc.2 time gitHead`, chạy trong thư mục tạm).

   Ghi rõ đã chọn commit nào và vì sao.
2. **Đọc hướng dẫn build.** Đọc README, CONTRIBUTING, `package.json` gốc: phiên bản Node, pnpm, các bước build. So với máy hiện có: `node -v`, `pnpm -v`.
3. **Cài và build.** `pnpm install` rồi lệnh build của repo. Ghi thời gian, dung lượng, lỗi (nếu có) và cách đã thử gỡ.
4. **Chạy test của repo**, nếu có và chạy được trong vài phút; ghi kết quả.
5. **So với bản npm đang dùng.** Với các gói aris dùng nhiều nhất (`dsh`, `dsh-session`, `dsh-agent`, `dsh-llm`, `dsh-storage-domain`, `dsh-api-session-controller`, `dsh-credentials-local`, `dsh-tools`, `dsh-user-approval`, `dsh-client-connection`), so `lib/` vừa build với `node_modules/.pnpm/.../lib` đang cài:
   - số tệp;
   - `diff -rq`;
   - nếu khác thì xem khác ở đâu (chỉ dấu thời gian, sourcemap, hay mã thật).
6. **Cho aris chạy trên bản tự build** (thử trên bản sao, không phải repo thật):
   - xuất repo aris bằng `git -C <repo aris> archive HEAD | tar -x -C dsh-build/aris-copy`;
   - trong bản sao, thêm `pnpm.overrides` trỏ các gói `@deepseek-ai/*` tới thư mục gói vừa build (`link:` hay `file:`), rồi `pnpm install` và `pnpm build`;
   - chạy `npx vitest run`.

   Không cần chạy daemon. Nếu override quá rắc rối, ghi lại vướng ở đâu.
7. **Dọn:** giữ thư mục `dsh-build` để Opus xem; ghi dung lượng.

## Báo cáo `docs/spikes/dsh-build-tu-nguon.md`

- Kết luận một câu: build được không, aris chạy trên bản tự build được không.
- Commit đã dùng, phiên bản Node và pnpm, thời gian các bước.
- Kết quả từng bước 1–6, lỗi thật nếu có.
- Khác biệt giữa bản tự build và bản npm.
- Cách làm lại từ đầu, dạng các lệnh ngắn: để giữ bản riêng khi cần; vá nhỏ bằng `pnpm patch`.
- Rủi ro và việc cần làm nếu thật sự phải tự giữ dsh.

Viết tiếng Việt có dấu, câu ngắn.
