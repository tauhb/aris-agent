# @aris/acp — aris làm agent cho ứng dụng khác qua ACP (giai đoạn 6)

Chốt 26/10: aris chỉ mở ra ngoài qua ACP, như cách aris dùng Claude Code, Codex làm bot ngoài nhưng đảo chiều.
Không có API kiểu OpenAI, MCP server, A2A, cổng mạng. Bản vẽ 6.3b `MatTichHop.dc.html` ("Ứng dụng khác").

## Đường đi

```
Buzz Desktop / IDE ──stdio──▶ aris-acp --bot <tên> ──socket ~/.aris/acp.sock──▶ daemon
                                (khách mỏng: bắt tay rồi chuyển byte)          dsh-acp + bộ quyền khách
```

- `aris-acp` (gói này, `lib/bridge.js`): đọc `--bot`, nối socket nội bộ, gửi một dòng bắt tay
  `{"aris":"acp","v":1,"bot":"lam","cwd":"…","parent":"<tên tiến trình gọi>"}`, đọc một dòng trả lời
  `{"ok":true,"bot":"Lâm"}` hay `{"ok":false,"error":"…"}` (lỗi thì in ra stderr, thoát 1), rồi chuyển
  nguyên byte hai chiều giữa stdio và socket. Không có model, không đọc khoá, không ghi đĩa.
- Daemon (plugin `aris-acp`, chỉ chạy khi có máy chủ web của daemon): nghe socket quyền `0600` trong
  `~/.aris`. Mỗi kết nối hợp lệ là một nhánh plugin `@deepseek-ai/dsh-acp` với `stream` riêng (luồng JSON từng
  dòng trên socket) và model của bot; ngắt socket thì gỡ nhánh. Daemon là chủ duy nhất của bot, ký ức, bộ não,
  kênh; không có tiến trình dsh thứ hai.
- Luồng có "nghe lén" để: lấy `clientInfo` ở `initialize` (tên ứng dụng), bắt `sessionId` ở phản hồi
  `session/new` / `session/resume`, giữ phản hồi đó lại tới khi: chọn preset mặc định cho Agent (dsh-acp tạo
  Agent không qua bộ điều khiển phiên nên thiếu công cụ terminal, tệp), gắn bot (`arisBots.tag(…, 'acp')`), đưa
  phiên vào workspace của thư mục (`resolveByPath` hay `create`, rồi `attachSession`). Model là model riêng của
  bot, không có thì model mặc định của dsh.
- Phiên con (tác nhân con) của phiên khách cũng là khách.

## Bộ quyền khi làm khách

Áp cho mọi phiên đến qua `aris-acp` (phiên "khách"), trong `tools/pre-execute`, trước mọi duyệt:

| Luật | Cách làm | Tắt được |
|---|---|---|
| Danh sách cấm | Từ chối luôn, không hỏi ứng dụng: xoá tệp/thư mục (`rm`, `rmdir`, `find -delete`, `git clean`), `git push --force`, `git reset --hard`, `sudo`, ghi ngoài thư mục được đưa, đọc khoá và mật khẩu (`~/.ssh`, `.env`, `~/.aws`, `~/.aris`, kho khoá của dsh), gửi tin thay người dùng, giao việc cho tác nhân con và bot ngoài (Claude Code, Codex chạy ngoài tầm danh sách cấm) | không |
| Quyền khác hỏi lại ứng dụng | Duyệt của dsh đi qua `session/request_permission` của ACP (dsh-acp); tắt thì aris từ chối mọi việc cần duyệt | có |
| Nội dung gửi đến không tin cậy | Đoạn lời dặn riêng cho phiên khách | có |
| Không tự ghi ký ức, hồ sơ, bộ não | Chặn `memory` (trừ `search`), `brain_note`, `brain_capture`; vòng học nền và hồ sơ chung bỏ qua phiên khách | có |
| Bỏ công cụ của đội | Chặn giao việc, chuyển giao, mời nói, thẻ Kanban, kênh, routine, lịch, đội của dsh, mục tiêu, vòng lặp, `learn`, `xung_ho` | có |

`ask_user_question` luôn bị chặn ở phiên khách: ACP không có câu hỏi dạng chọn nên lời gọi chờ mãi; bot hỏi
bằng lời trong câu trả lời. Danh sách cấm áp cả khi ứng dụng tự duyệt mọi quyền (Buzz Desktop làm vậy). Lời từ chối gửi về ứng dụng nói rõ
"nằm trong danh sách cấm của người dùng".

## Dữ liệu (`aris_acp`)

- `settings`: `enabled` (mặc định tắt), `open` (mã bot mở cho ứng dụng khác, mặc định rỗng), `rules`.
- `log`: mỗi việc của phiên khách: giờ, ứng dụng, bot, phiên, việc, kết quả (`cho-phep`, `ung-dung-duyet`,
  `ung-dung-tu-choi`, `chan`), lý do. Giữ 7 ngày.
- Kết nối đang mở giữ trong bộ nhớ: ứng dụng, phiên bản, bot, thư mục, phiên, lần cuối.

## Đường máy chủ

`GET /api/aris/acp`: trạng thái (bật, socket, lệnh có trong PATH chưa), kết nối, bot (mở hay đóng), luật,
nhật ký hôm nay. `POST`: `enabled`, `bot` (mở/đóng), `rule`, `disconnect` (ngắt một hay tất cả).

## Đưa lệnh vào PATH

`aris-acp` là tệp shell gọi `node` tuyệt đối tới `lib/bridge.js`. Cài vào PATH là thay đổi lâu dài trên máy nên
hỏi người dùng trước. Buzz Desktop không tự quét `aris-acp` (danh sách tự nhận của Buzz là cố định); người dùng
thêm một "custom harness" trong Buzz với lệnh `aris-acp --bot <tên>`.

## Đã chạy trên máy (26/10)

Ứng dụng ACP giả lập (tự duyệt mọi quyền như Buzz) nối `aris-acp --bot khoa` trong một thư mục thử: `initialize`,
`session/new`, `session/prompt` chạy; Khoa tự chạy `ls`, tạo `ghi-chu.md`, không xoá `drafts/cu`; nhờ chạy
`git reset --hard HEAD` thì công cụ trả "aris từ chối: git reset --hard nằm trong danh sách cấm…". Màn 6.3b hiện
nhật ký thật, dải báo việc bị chặn. Ba lỗi bắt được khi chạy thật và đã sửa: thiếu model khi bot không có model
riêng, thiếu công cụ vì Agent chưa có preset, bot giao việc cho Claude Code/Codex (ngoài tầm danh sách cấm),
`ask_user_question` chờ mãi. Chưa thử: Buzz Desktop thật, lệnh `aris-acp` trong PATH.
