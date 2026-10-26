# @aris/backup — sao lưu (giai đoạn 7, đợt 7b)

Bản vẽ 6.4b `SaoLuu.dc.html` ("Sao lưu"). Làm ở local (chốt 26/10); thư mục đích do người dùng chọn.

## Bật lần đầu

Ba bước trên màn: chọn thư mục (hộp chọn của macOS hay gõ đường dẫn; phải ghi được, không nằm trong dữ liệu được sao
lưu), cất mã khôi phục (chỉ hiện lúc này), bật. Bật xong chạy bản đầu tiên rồi diễn tập ngay.

## Gồm những gì

| Phần | Gốc | Lấy | Khôi phục |
| --- | --- | --- | --- |
| `dsh` | `DSH_HOME` | `sessions`, `storages`, `attachments`, `llm-deepseek`, `aris-keychain.json` | thay từng mục |
| `brain` | `~/aris/brain` (`ARIS_BRAIN_DIR`) | cả thư mục, cả `.git` | thay cả thư mục |
| `workspace` | `~/aris/workspace` | cả thư mục, trừ `node_modules`, `.venv`, `__pycache__` | thay cả thư mục |
| `projects` | `~/aris/projects` | như trên | thay cả thư mục |
| `aris` | `~/.aris` | `brain` (trừ `bin`), `checkpoints` | `brain` chép đè từng tệp, `checkpoints` thay |

Không gồm: khoá (Keychain, `.credentials.yaml`), plugin đã cài (`profiles`), chỉ mục tìm phiên (dựng lại được),
nhật ký, socket, `~/.aris/worktrees`. SQLite đang mở (có `-wal`) được chụp bằng `sqlite3 .backup` cho nhất quán.

## Tệp `.aris`

`aris-YYYY-MM-DD-HHMM.aris` trong thư mục đích: `ARISBAK1`, độ dài và đầu tệp JSON (thời điểm, máy, mã băm của mã
khôi phục, muối, iv, các phần và số tệp), rồi tar.gz (`/usr/bin/tar`, đường trong gói là `<phần>/…`) mã hoá
AES-256-GCM, cuối là 16 byte thẻ xác thực. Khoá = scrypt(mã khôi phục, muối riêng mỗi tệp, N=2^15). Ghi vào tệp
tạm `.…dang-ghi` rồi đổi tên.

## Mã khôi phục

120 bit, 24 ký tự Crockford (sáu nhóm bốn; gõ lại không phân biệt hoa thường, O→0, I/L→1). Nằm trong Keychain dịch
vụ `aris-backup`, mục `code-<mã băm>`; mã băm ghi trong đầu tệp nên đổi mã thì bản cũ vẫn mở bằng mã cũ (mục cũ giữ
lại). Không API nào trả mã sau khi đã xác nhận cất.

## Lịch, giữ bản

- Mỗi đêm lúc `time` (mặc định 02:00): kiểm mỗi phút; đã qua giờ hẹn mà hôm nay chưa có bản tốt thì chạy (máy ngủ
  thì chạy khi thức). Lỗi thì thử lại sau một giờ, tối đa ba lần một ngày; lần lỗi đầu báo Telegram (qua Aris).
- Giữ bản mới nhất mỗi ngày của `keepDaily` ngày gần nhất (mặc định 7) và bản mới nhất mỗi tuần (thứ Hai đầu tuần,
  tức bản Chủ nhật) của `keepWeekly` tuần (mặc định 4). Chỉ xoá tệp đúng mẫu tên và đọc được đầu tệp.

## Diễn tập khôi phục

Sau bản đầu, mỗi Chủ nhật, và khi đã quá bảy ngày chưa diễn tập: giải mã bằng khoá trong Keychain, giải nén vào thư
mục tạm, đọc mọi tệp JSON của từng kho trong `storages` và `PRAGMA integrity_check` các SQLite, `git fsck` bộ não,
so số tệp với lúc sao lưu (trừ tệp biến mất giữa lúc liệt kê và lúc nén); xong xoá thư mục tạm. Không đạt thì báo
Telegram.

## Khôi phục

- "Giải nén ra…": giải nén một bản vào thư mục người dùng chọn, không đụng dữ liệu đang chạy.
- Đè lên aris: `pnpm aris:cli restore <tệp>` (lệnh `aris restore`), chỉ khi aris đã dừng hẳn. Lấy mã trong Keychain
  hay hỏi người dùng gõ; giải nén vào thư mục tạm, thẻ xác thực đúng mới đụng dữ liệu thật; dữ liệu cũ cất sang
  `<gốc>.truoc-khoi-phuc-<lúc>` (phần thay cả thư mục) hay `<gốc>/.truoc-khoi-phuc-<lúc>/` (phần thay từng mục).

## API `/api/aris/backup`

GET: cài đặt (không có mã), việc đang chạy, lỗi thư mục, ổ còn trống, các phần (số tệp, cỡ), các bản (lúc, cỡ, bản
ngày hay tuần, đã diễn tập, mã cũ), lần sao lưu gần nhất, lần tốt gần nhất, lần diễn tập gần nhất, thư mục mã aris.
POST `op`: `pick-dir`, `set-dir`, `set` (giờ, số bản, báo), `code-new` (mã mới chờ xác nhận, trả mã), `code-confirm`,
`code-cancel`, `enable`, `disable`, `run`, `drill`, `extract`.
