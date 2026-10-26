# Plan đợt 7f phần A · Rà soát bảo mật — để Sonnet làm

Người viết plan: Opus. Người làm: subagent Sonnet 5.5 effort cao. Kết quả là báo cáo, **không sửa mã**. Opus đọc báo cáo, xác minh phát hiện nặng và tự sửa.

Bối cảnh: aris chạy local trên Mac của người dùng. Daemon launchd `vn.aris.daemon` chạy `scripts/dsh.mjs --profile aris`, web ở `127.0.0.1:3201`, `DSH_HOME` = `.dsh-home` trong worktree này. Các gói aris nằm ở `packages/aris-*`. Đặc tả từng gói ở `docs/specs/`.

## Luật bắt buộc

- Không sửa mã, không commit. Chỉ tạo tệp báo cáo `docs/nghiem-thu/ra-soat-bao-mat-7f.md`.
- Không đọc, in hay chép giá trị khoá. Nếu cần kiểm khoá có lọt vào đâu không, chỉ in **số lần gặp và đường tệp**, không in giá trị (ví dụ `grep -l`, `grep -c`). Không mở `.dsh-home/.credentials.yaml`; chỉ được xem quyền tệp bằng `ls -l`.
- Log daemon `~/Library/Logs/aris/daemon.log` có token đăng nhập; mọi lần đọc phải qua `sed 's/token=[^ &"]*/token=***/g'`.
- Không chạy thử tấn công lên dữ liệu thật.
  - Kiểm các hàm chặn (`hardVerdict`, `guestVerdict`, `lowRisk`…) bằng cách gọi hàm với đầu vào giả trong một script `node` tạm ở thư mục scratchpad, hoặc viết test tạm rồi xoá.
  - Không thực thi lệnh nguy hiểm thật.
- Không dùng mạng. Không chạy `pnpm audit`; ghi vào báo cáo là chưa kiểm phụ thuộc.
- Không tắt hay khởi động lại daemon. Không đổi cài đặt nào của aris, macOS, Telegram.
- Không gửi tin Telegram, không gọi model.

## Danh mục kiểm

Với mỗi mục: ghi đã kiểm gì, bằng cách nào, kết quả. Có phát hiện thì ghi mức, nơi (`tệp:dòng`), cách tái hiện an toàn và đề xuất sửa.

1. **Web và đăng nhập**
   - `lsof -nP -iTCP:3201 -sTCP:LISTEN`: chỉ nghe 127.0.0.1?
   - Token đăng nhập nằm ở đâu: URL, log, `app-url`, `aris url`. Token có hết hạn, có đổi mỗi lần khởi động lại không? Xem mã dsh trong `node_modules/.pnpm/@deepseek-ai+dsh-*`, gói web hay server.
   - Cookie phiên đăng nhập có cờ gì (`HttpOnly`, `SameSite`, `Secure`)? Tìm chỗ dsh đặt cookie.
   - **CSRF trên các route `/api/aris/*` (POST):**
     - Một trang web lạ mở trên trình duyệt của người dùng có gửi được POST tới `127.0.0.1:3201/api/aris/guard` (ví dụ `op: stop`), `/api/aris/backup` (`op: set-dir`, `extract`), `/api/aris/acp` (`install`) không?
     - Xét `SameSite` của cookie, việc handler gọi `request.json()` bất kể `content-type` (đơn `text/plain` không cần preflight), và dsh có kiểm `Origin`/`Host` không.
     - Liệt kê mọi route aris đăng ký qua `connection.fetch.register` (grep trong `packages/*/src`).
   - DNS rebinding: dsh có kiểm `Host` header không?
2. **Socket và tiến trình**
   - Quyền của `~/.aris/acp.sock`, `~/.aris/run/*.sock`, `.dsh-home/ari` và các thư mục chứa chúng.
   - Các lệnh qua socket daemon (`/stop`, `/send`, `/ask`, `/login`) trong `packages/aris-daemon`: ai gọi được?
   - Bắt tay ACP (`packages/aris-acp/src/wire.ts`, `index.ts`): kiểm gì trước khi mở phiên?
3. **Quyền tệp**
   - `.dsh-home` và các thư mục con, `.credentials.yaml`, `storages/*`, `sessions/*`, `~/.aris/*`, `~/aris/brain`, tệp sao lưu `.aris`, `aris-keychain.json`.
   - Chỉ ra cái gì đọc được bởi user khác trên máy (other-readable) mà chứa dữ liệu riêng.
4. **Khoá lọt ra ngoài**
   - Grep (chỉ đếm, in đường tệp) các mẫu khoá phổ biến trong `.dsh-home/storages`, `.dsh-home/logs`, `~/Library/Logs/aris`, `~/.aris`, `docs/`, `design/`, lịch sử git (`git log -p | grep -c`).
   - Mẫu cần tìm: `sk-[A-Za-z0-9]{20,}`, `AIza[0-9A-Za-z_-]{30,}`, `xox[bp]-`, token bot Telegram `\d{8,10}:[A-Za-z0-9_-]{35}`, `fal`/`FAL_KEY=` có giá trị.
   - Token đăng nhập web trong `daemon.log`: đã biết. Ghi mức và đề xuất sửa, ví dụ dsh có cờ tắt in URL không, hay aris lọc log.
5. **Danh sách cấm cứng** (`packages/aris-guard/src/policy.ts`)
   - Thử lách `hardVerdict` bằng đầu vào giả. Mỗi ca ghi kết quả bị chặn hay lọt.
   - Các ca:
     - `rm -rf "$HOME"`, `rm -rf ~/`, `rm -r -f /Users/x`;
     - `find ~ -delete`, `find . -delete` (trong cwd);
     - `/bin/rm -rf ~`, `command rm -rf ~`, `xargs rm -rf`;
     - `bash -c "rm -rf ~"`, `sh -c 'rm -rf ~'`, `eval "rm -rf ~"`;
     - `python3 -c "import shutil; shutil.rmtree('/Users/x')"`, `perl -e`;
     - `git push -f`, `git push origin +main`, `git push --force-with-lease`, `git -c x=y push --force`;
     - `doas`, `su -c`;
     - `security find-generic-password` kèm đường dẫn đầy đủ `/usr/bin/security`, `security dump-keychain`, `security export`;
     - `cat ~/.ssh/id_rsa`, `cat $HOME/.ssh/id_rsa`, `cat ~/.ssh/../.ssh/id_rsa`, `cp ~/.ssh/id_ed25519 /tmp/x`, `base64 < ~/.aws/credentials`;
     - đọc `.env` qua `read` với đường tương đối có `..`, qua liên kết mềm, qua `grep -r KEY .`;
     - ghi đè `~/.zshrc`, `~/Library/LaunchAgents/*.plist` (tự chạy khi đăng nhập: có nên cấm?).
   - Mục tiêu không phải chặn tuyệt đối; ghi rõ ca nào lọt và ca nào đáng chặn thêm.
6. **Bộ quyền khách ACP** (`packages/aris-acp/src/policy.ts`, `guestVerdict`, `secretPath`): làm như mục 5, thêm ghi ngoài cwd qua `tee`, `>`, `cp`, `mv`, liên kết mềm, `../`.
7. **Chế độ "tự cho việc rủi ro thấp"** (`lowRisk`): tìm lệnh được coi là chỉ đọc nhưng có hại hay lộ dữ liệu.
   - Ví dụ: `find / -name "*.pem"`, `cat ~/.ssh/id_rsa` (cat nằm trong danh sách chỉ đọc!), `git log -p` của repo khác, `grep -r password ~`.
   - Ghi đọc ngoài cwd có bị tự cho không.
8. **Đường nội dung không tin cậy vào ký ức và bộ não (prompt injection)**: nội dung từ `web_fetch`, email, Telegram của người lạ, ứng dụng ACP, tệp người dùng thả vào hộp thư bộ não.
   - Xem `aris-memory` (cờ không tin cậy), `aris-brain` (Thủ thư nạp, `brain_note`), `aris-reflect`.
   - Nội dung lạ có tự thành ký ức, skill hay routine được không? Có đường nào cho nội dung web ra lệnh gửi tin hay chạy lệnh mà không qua duyệt?
9. **Telegram** (`packages/aris-channels`)
   - Ghép đôi: ai ghép được, mã ghép có hết hạn không, giới hạn thử.
   - Tin từ chat lạ hay nhóm lạ xử lý thế nào.
   - Lệnh `/` nào làm được việc nhạy cảm, ví dụ dừng, duyệt.
   - Duyệt qua Telegram có kiểm đúng người không?
10. **Sao lưu** (`packages/aris-backup`)
    - Tham số mã hoá (GCM, nonce ngẫu nhiên, scrypt N).
    - Đầu tệp không mã hoá để lộ gì (đường dẫn, tên máy, số tệp).
    - Khôi phục từ tệp độc: tar có `../` hay đường tuyệt đối thì sao? Thử bằng tệp tar giả **trong thư mục tạm**, gọi `extractBackup` với khoá tạm.
    - API `extract`, `set-dir` có cho ghi ra chỗ nguy hiểm không?
11. **Keychain** (`packages/aris-keychain`)
    - Khoá đi qua stdin dạng hex: có lúc nào nằm trong tham số tiến trình (`ps`) không?
    - Bot có đọc được Keychain qua đường khác `security` không?
12. **Bề mặt khác**
    - `/api/aris/acp` `install` ghi tệp vào `/opt/homebrew/bin`.
    - Các chỗ gọi `execFile`, `spawn`, `osascript`, `exec` trong `packages/*/src`: có chèn lệnh (command injection) từ dữ liệu người dùng hay bot không? Grep `exec(`, `spawn(`, `execFile(`, `shell: true`.
    - Các route đọc tệp theo tham số (đường dẫn do client gửi): có path traversal không? Ví dụ trang bộ não `?page=`, tệp đính kèm, media.

## Báo cáo `docs/nghiem-thu/ra-soat-bao-mat-7f.md`

1. **Tóm tắt:** số phát hiện theo mức.
   - Nặng: lộ khoá, người ngoài máy hay trang web lạ điều khiển được aris.
   - Vừa: bot lách được hàng rào trong việc thường.
   - Nhẹ.
2. **Bảng phát hiện:** mã (S1, S2…), mức, nơi, mô tả, cách tái hiện an toàn, đề xuất sửa (cụ thể tới hàm).
3. **Kết quả từng mục 1–12:** gọn; mục nào ổn thì ghi một dòng vì sao ổn.
4. **Những gì chưa kiểm và lý do:** ví dụ `pnpm audit` cần mạng.

Viết tiếng Việt có dấu, câu ngắn. Xoá mọi script hay test tạm đã tạo trước khi báo xong.
