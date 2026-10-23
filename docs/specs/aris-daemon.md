# Đặc tả chạy ngầm (giai đoạn 1, bước 5)

> Viết theo [ke-hoach-trien-khai.md](../ke-hoach-trien-khai.md) mục "Chạy ngầm (M1, M2)" và [phan-tich-kien-truc.md](../phan-tich-kien-truc.md) mục 3 (mô hình tiến trình).

## Mục tiêu

- aris chạy suốt trên Mac, không cần mở terminal: bot Telegram luôn trả lời, routine sau này luôn chạy.
- Máy khởi động lại, aris bị lỗi văng ra: tự chạy lại.
- Một tiến trình duy nhất giữ trạng thái (phiên, ký ức, kênh). Không có hai bản aris cùng ghi một thư mục, không có hai nơi cùng nhận tin một bot Telegram.
- Dùng được từ dòng lệnh và từ script cron: `aris ask "…" --json`.

## Thành phần

| Phần | Việc |
|---|---|
| LaunchAgent `vn.aris.daemon` | macOS chạy `dsh --profile aris` khi đăng nhập, chạy lại khi văng (`KeepAlive`, cách nhau ít nhất 10 giây). Log ở `~/Library/Logs/aris/daemon.log` |
| Plugin máy chủ `@aris/daemon` | Socket cục bộ `~/.aris/run/<băm thư mục dữ liệu>.sock` (thư mục `0700`, socket `0600`: chỉ tài khoản của anh mở được; không đặt trong thư mục dữ liệu vì đường Unix socket của macOS tối đa 104 ký tự), phục vụ lệnh `aris` |
| Lệnh `aris` (`scripts/aris.mjs`) | Cài/gỡ LaunchAgent, bật/tắt/khởi động lại, trạng thái, log, mở web, gửi Telegram, giao việc |

Socket không đi qua mạng nên không cần token; quyền tệp là lớp bảo vệ. Web vẫn chỉ nghe `127.0.0.1`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `aris install` | Ghi LaunchAgent (đường dẫn node, repo, cổng, PATH có ffmpeg) và nạp vào launchd |
| `aris uninstall` | Gỡ khỏi launchd, xoá tệp LaunchAgent (giữ nguyên dữ liệu) |
| `aris start` / `aris stop` / `aris restart` | Nạp / gỡ khỏi launchd / buộc chạy lại |
| `aris status` | launchd có giữ không, tiến trình, thời gian chạy, cổng web, bot Telegram; mã thoát 1 khi không chạy |
| `aris logs [-f]` | Xem log (theo dõi liên tục với `-f`) |
| `aris open` / `aris url` | Mở web đã đăng nhập / in đường đăng nhập mới |
| `aris send "…"` | Gửi Telegram tới nơi nhận (`/sethome`) |
| `aris ask "…" [--json]` | Giao một việc cho Aris và in câu trả lời cuối; thành một phiên trong chat riêng (hiện trong app, Aris nhớ được). Cần aris đang chạy: bản headless của dsh tắt kho khoá và không có kênh, nên không dùng làm đường dự phòng |

`--json` in một dòng JSON `{ sessionId, text, reason }`; mã thoát 0 khi lượt hoàn tất, 1 khi lỗi, bị dừng hoặc aris không chạy.

## Một chủ duy nhất

- Có daemon đang chạy (socket trả lời) thì `pnpm aris` (máy chủ phát triển) từ chối khởi động và chỉ cách dùng `aris open`.
- `aris install` từ chối khi cổng web đang có tiến trình khác giữ.
- Socket đang có bản aris trả lời thì bản sau không chiếm (bản ACP cũng nạp plugin này); tệp socket còn sót của bản đã văng thì bị xoá.

## Đường của socket

| Đường | Việc |
|---|---|
| `GET /status` | pid, thời gian chạy, địa chỉ web (không có token), bot Telegram |
| `POST /login` | Đường đăng nhập web mới (`connection.authenticatedUrl`) |
| `POST /send` `{ text }` | Gửi tới nơi nhận của Aris trên Telegram |
| `POST /ask` `{ text }` | Phiên mới trong chat riêng, chờ lượt xong, trả `{ sessionId, text, reason }`; người gọi ngắt kết nối thì dừng lượt |
| `POST /stop` | Thoát êm (launchd sẽ chạy lại nếu còn được nạp; muốn tắt hẳn dùng `aris stop`) |

## Để sau

Chạy trên server Linux (systemd, container có egress allowlist) ở giai đoạn sau; Windows chưa hỗ trợ.
