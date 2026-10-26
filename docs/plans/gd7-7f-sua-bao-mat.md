# Plan đợt 7f phần A2 · Sửa các phát hiện rà soát bảo mật — để Sonnet làm

Nguồn: báo cáo `docs/nghiem-thu/ra-soat-bao-mat-7f.md`. Mã phát hiện S1… trong plan này lấy theo báo cáo đó; đọc kỹ báo cáo trước. Opus đã chốt cách sửa dưới đây. Chỗ nào plan nói "tìm" thì tự đọc mã để làm cho đúng.

Repo: `/Users/hoangbatau/Desktop/working-project/aris-agent/.claude/worktrees/fervent-bose-b47879`.

## Luật bắt buộc

- Không commit, không push, không dùng mạng, không cài gói (chỉ `pnpm install --offline` nếu cần).
- Không đọc giá trị khoá, không mở `.dsh-home/.credentials.yaml`.
- Log daemon chỉ đọc qua `sed 's/token=[^ &"]*/token=***/g'`.
- Không chạy lệnh nguy hiểm thật. Kiểm hàm chặn bằng test vitest với đầu vào giả.
- Chú thích mã viết tiếng Việt có dấu, theo giọng mã sẵn có. Chữ giao diện (nếu có) đặt trong `text.ts`, đủ cả tiếng Anh và tiếng Việt.
- Mỗi sửa có test. Test cũ phải vẫn qua; nếu một test cũ sai vì hành vi đổi có chủ ý thì sửa test và ghi lý do.
- Không làm hỏng việc thường: các ca được phép trong `guard.test.ts`, `acp.test.ts` (ví dụ `rm -rf build` trong cwd, `git push origin main`, `echo rm`, `.env.example`) vẫn phải qua.

## Việc cần sửa

### 1. S2, S3: `hardVerdict` và `protectedPath` (`packages/aris-guard/src/policy.ts`)

- **Chuẩn hoá lệnh trước khi soi.** Viết hàm thuần `shellWords(cmd)` hay `normalizeCommand(cmd, home)`:
  - bỏ dấu `\` đầu từ (`\rm`);
  - thay `$HOME`, `${HOME}`, `"$HOME"` bằng `home`;
  - bỏ tiền tố đường dẫn của lệnh (`/bin/rm` → `rm`, `/usr/bin/security` → `security`);
  - bóc `command`, `builtin`, `exec`, `env VAR=…`, `nice`, `nohup`, `time`, `sudo`, `doas`;
  - tách theo `;`, `&&`, `||`, `|`, `&`, xuống dòng, `(`, `)`, `` ` ``, `$(`;
  - đệ quy vào chuỗi sau `bash -c`, `sh -c`, `zsh -c`, `eval`, `su -c`;
  - với `xargs`, coi phần sau `xargs [cờ]` là một lệnh.
- **`rm` đệ quy:** áp lên mọi đoạn đã tách. Thêm các ca:
  - đích là glob ẩn ở gốc nhà (`.*`);
  - `cd <dir> && rm -r <tương đối>`: theo dõi `cd` đơn giản trong cùng chuỗi để tính đường thật; `cd` tới đâu không rõ thì coi như ngoài cwd.
- **`find … -delete` và `find … -exec rm`:** đường gốc của `find` ngoài cwd thì chặn.
- **`git push`:** chặn cả refspec bắt đầu bằng `+` và trường hợp có `-c x=y` hay `-C dir` trước `push`.
- **`doas`, `su`:** chặn như `sudo`.
- **Keychain:** chặn `security -i` và mọi `security` có `find-*-password`, `dump-keychain`, `export`, `unlock-keychain`, `set-keychain-settings`.
- **`python`, `perl`, `ruby`, `node -e`:** chặn khi chuỗi mã chứa `rmtree(`, `os.remove(`, `unlink(`, `rm_rf`, `rmSync(` kèm một đường tuyệt đối hay `~` ngoài cwd. Đây là chặn "hay gặp"; ghi trong chú thích rằng không thể chặn tuyệt đối.
- **`protectedPath`, thêm:**
  - `.npmrc`, `.git-credentials`, `.docker/config.json`, `.kube`, `.netrc` (đã có);
  - `.zsh_history`, `.bash_history`;
  - `Library/Logs/aris` (log có token);
  - `Library/Application Support/{Google/Chrome,Firefox,Arc,BraveSoftware}`, `Library/Cookies`, `Library/Safari`;
  - `Library/Keychains` (đã có).

  Đọc và ghi đều chặn.
- **Ghi vào các chỗ tự chạy** (chỉ chặn ghi, đọc vẫn được):
  - `~/.zshrc`, `~/.zprofile`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`, `~/.config/fish`;
  - `~/Library/LaunchAgents`, `/Library/LaunchAgents`, `/Library/LaunchDaemons`;
  - `.git/hooks` của bất kỳ repo nào.
- **Phát hiện đường dẫn khoá trong lệnh shell:** dùng lệnh đã chuẩn hoá. Bắt cả `cd ~ ; cat .ssh/x`: theo dõi `cd` như trên. Bắt cả glob mà phần đầu khớp thư mục cấm (`~/.s*/`, `.e*`): nếu từ có `*?[` thì so tiền tố trước ký tự glob với tên cấm, khớp thì chặn. Chặn `git show <rev>:<đường cấm>`.
- **Lệnh in URL đăng nhập web:** chặn `aris url`, `aris open`, `scripts/aris.mjs url|open`, `pnpm aris:cli url|open`.

### 2. S1: `lowRisk` (cùng tệp)

- Tách lệnh theo cả `&` đơn và xuống dòng. Có `<(`, `>(`, `$(`, `` ` `` thì không tự cho (đã có một phần).
- Danh sách chỉ đọc phải chặt hơn:
  - `find`: không có `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint*`, `-fls`;
  - `git diff`, `git log`, `git show`: không có `--output`;
  - `git branch`: chỉ khi không có tham số hay chỉ có `-a`, `-r`, `-v`, `--list`, `--show-current`;
  - `git remote`: chỉ không tham số hay `-v`;
  - `rg`: không có `--pre`;
  - `sort`: không có `-o`;
  - bỏ `echo` (dùng được để ghi qua chuyển hướng).
- **Đọc** (`read`, `cat`, `head`, `grep`…) chỉ tự cho khi đường dẫn nằm trong cwd và không phải đường cấm.
- **Ghi trong cwd** không tự cho nếu là `.git/`, `.envrc`, `.env*`, `.vscode/`, `.idea/`, `package.json` (scripts chạy lúc cài), `Makefile`, `.husky/`, `.github/workflows/`.

### 3. S10: hộp cát kiểm thử skill (`packages/aris-skills/src/eval.ts`)

Dùng lại bộ kiểm chặt của mục 2: xuất `lowRisk` hay một hàm `readOnlyCommand(cmd)` dùng chung. Đừng nhân bản regex; nếu phụ thuộc chéo gói không hợp, chép hàm nhưng ghi chú nguồn và giữ test giống nhau.

### 4. S11: bộ quyền khách ACP (`packages/aris-acp`)

- `cwd` khách khai mà là `/`, thư mục nhà, `~/Library`, thư mục hệ thống, hay chứa `.aris`/`.dsh-home`: từ chối bắt tay, báo lỗi rõ.
  - Có sẵn `tooBroad` ở `aris-checkpoints`; xem dùng lại được không.
- `guestVerdict` dùng bộ chuẩn hoá của mục 1. Thêm chặn:
  - ghi ngoài cwd qua `>`, `>>`, `tee`, `cp`, `mv`, `ln`, `sed -i`, `curl -o`, `wget -O`, `rsync`, `install`;
  - `launchctl`, `kill`, `pkill`, `osascript`, `open`, `aris`, `security`;
  - `bash -c`, `sh -c`, `eval`: đệ quy như mục 1.
- Công cụ ghi tệp (`write`, `edit`…): giải liên kết mềm bằng `realpath` của thư mục cha trước khi so với cwd, nếu tệp nằm ngoài sau khi giải thì chặn. Làm tương tự cho `hardVerdict` ở các công cụ đọc tệp (`read`). Dùng `fs.realpathSync` trên phần đã tồn tại của đường dẫn.

### 5. S4: token đăng nhập web trong log

- Tắt in URL có token: tìm row của web-app dsh (gói chứa `printUrl`) và đặt `printUrl: false` trong `packages/aris-web-bundle/cordis.patch.yml`, theo kiểu các row `config:` đã có.
- Kiểm `scripts/dsh.mjs`, `scripts/aris.mjs`, `aris-daemon`: lệnh `aris url`/`open` lấy URL qua socket `/login`, không phải từ log. Không có gì khác phải đọc URL từ log.
- Đường log đã được cấm ở mục 1.

### 6. S5: ký ức (`packages/aris-memory/src/index.ts`)

- `origin: 'user'` chỉ được tin khi phiên là phiên trò chuyện trực tiếp của người dùng. Phiên **không** tin cậy gồm:
  - phiên nền: routine (`arisRoutine.isRoutine`), Thủ thư (`arisBrain.isLibrarian`), kiểm thử (`arisSkills.isEval`);
  - phiên con có `parentSession`;
  - việc được giao (`tag.via` là `team`/`dispatch`);
  - phiên khách ACP (`arisAcp.isGuest`);
  - phiên Telegram đang xử lý tin của người không phải chủ (mục 8).

  Mẫu nhận diện: `isBackground` trong `aris-guard/src/index.ts`. Trong các phiên đó, `save` với `origin: 'user'` đổi thành đề xuất chờ duyệt, như `inferred`.
- `update` và `forget` trong phiên không tin cậy: không làm ngay. Nếu kho đề xuất có kiểu sửa hay quên thì tạo đề xuất; nếu không thì từ chối với lời báo cho bot. Ghi rõ đã chọn cách nào.

### 7. S6: `brain_note` (`packages/aris-brain`)

- Ghi nguồn (mã bot, mã phiên, loại phiên) vào frontmatter hay thân ghi chú của hộp thư vào, để Thủ thư và người dùng thấy.
- Trong phiên không tin cậy (định nghĩa ở mục 6) thì đánh dấu `nguon: khong-tin-cay`. Thủ thư không tự nạp những ghi chú này vào wiki, chỉ để trong hộp thư vào chờ người dùng xem.
- Tìm chỗ nạp tự động 23:00 (`ingest.ts`) để bỏ qua các ghi chú có dấu đó.

### 8. S9: quyền thật cho người không phải chủ trên Telegram (`packages/aris-channels`)

- Khi hub đang xử lý tin của người có `trust !== 'owner'`, ghi nhận phiên đó đang "bị hạn chế" cho tới hết lượt trả lời.
  - Đưa ra dịch vụ, ví dụ `arisChannels.restricted(sessionId): boolean`. Tìm chỗ hub gửi tin vào phiên và chỗ lượt kết thúc.
- Trong `aris-guard` (`tools/pre-execute`), phiên bị hạn chế chỉ được gọi công cụ đọc:
  - được gọi: `read`, `grep`, `glob`, `brain_search`, `brain_read`, `web_search`, `web_fetch`, `memory` với `action` là `search`/`list`;
  - mọi công cụ khác bị từ chối với lời báo cho bot.

  Liệt kê trong mã thành một tập rõ ràng.
- S19: nút `q:` (trả lời câu hỏi) trên Telegram chỉ người dùng chính bấm được. Tìm xử lý callback.
- S18: mã ghép đôi giới hạn 5 lần thử sai mỗi giờ cho mỗi chat; bảng `strangers` dọn bản ghi cũ hơn 30 ngày.

### 9. S7: SSRF (`packages/aris-brain/src/extract.ts`)

- `safeUrl` phân giải tên miền (`dns.lookup` all) rồi chặn mọi địa chỉ:
  - loopback, private (10/8, 172.16/12, 192.168/16), link-local, CGNAT 100.64/10, 0.0.0.0/8;
  - IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped `::ffff:x`.
- Theo chuyển hướng bằng tay (`redirect: 'manual'`, tối đa 5 bước), kiểm lại từng `Location`.
- Có test cho các dạng địa chỉ. Test không gọi mạng: tách hàm kiểm IP thuần.

### 10. S8: sao lưu (`packages/aris-backup`)

- Mã hoá dùng AAD là toàn bộ byte của đầu tệp (`cipher.setAAD(head)`, `decipher.setAAD(head)`).
  - Tệp cũ chưa có AAD: hiện người dùng chưa bật sao lưu nên không có tệp thật. Đổi `v` thành 2, từ chối `v: 1` với lời báo rõ.
- `restoreBackup` và `extractBackup`:
  - chỉ nhận `id` phần trong tập biết trước: `dsh`, `brain`, `workspace`, `projects`, `aris`;
  - `restoreBackup` chỉ dùng gốc từ `roots` truyền vào (bỏ `p.root` trong đầu tệp); phần không có trong `roots` thì bỏ qua và báo;
  - tên mục trong `entries`/`merge` không được chứa `/` hay `..`.
- Sau khi giải nén vào thư mục tạm, kiểm không có liên kết mềm trỏ ra ngoài thư mục tạm trước khi chuyển (có thì báo lỗi). Truyền thêm cờ `-P` âm của bsdtar (mặc định đã chặn `..` và đường tuyệt đối); ghi chú lại.
- Cập nhật `backup.test.ts`: đầu tệp bị sửa thì giải mã lỗi; `id` lạ thì bị từ chối.

### 11. S20: lệnh `install` của ACP (`packages/aris-acp/src/index.ts`)

Script shim ghi bằng chuỗi shell: thoát đường dẫn đúng cách bằng nháy đơn kèm thay `'` thành `'\''`.

### Không làm trong đợt này (ghi vào báo cáo cuối)

- S12 cookie của dsh;
- S13 quyền `~/aris` (đổi quyền tệp của người dùng, để người dùng quyết);
- S15 ACL Keychain;
- S16;
- S17 phần lộ tên máy (đã có AAD chống sửa).

## Kiểm tra trước khi báo xong

1. `pnpm build`.
2. `npx vitest run`: toàn bộ qua.
3. `npx eslint .` và `npx prettier --check .`.
4. `node scripts/aris.mjs restart`, đợi 12 giây, `node scripts/aris.mjs status`. Xem 40 dòng cuối log (lọc token) không có lỗi nạp.
5. Kiểm `printUrl` đã tắt: sau khi khởi động lại, 40 dòng cuối log không còn dòng `dsh web: http`. Dùng `grep -c`, không in dòng.

## Báo cáo cho Opus

- Từng mục 1–11: đã sửa gì (tệp, hàm), test thêm, chỗ không làm được hay chọn khác plan và lý do.
- Kết quả 5 bước kiểm tra.
- Cập nhật `docs/nghiem-thu/ra-soat-bao-mat-7f.md`: thêm mục cuối "Đã sửa (đợt 7f)" ghi trạng thái từng S1–S20 (đã sửa, để sau, chấp nhận).
