# aris-agent — Kế hoạch triển khai

> 23/10/2026. Kế hoạch này nối ba tài liệu: kiến trúc ([phan-tich-kien-truc.md](phan-tich-kien-truc.md)), đặc tả tính năng ([tinh-nang-aris.md](tinh-nang-aris.md)) và thiết kế giao diện (canvas 31 màn, bản sao mã nguồn trong [`design/canvas/`](../design/canvas/)). Nó **thay mục 13 "Lộ trình"** của tài liệu tính năng: thứ tự được sắp lại để anh **dùng được aris qua Telegram ngay từ tuần thứ 3**, rồi mỗi giai đoạn thêm một năng lực lớn. Bốn cách dùng aris (chạy ngầm, giao diện, điều phối, làm agent thành viên) theo mục 15 của tài liệu tính năng được rải vào các giai đoạn, mã M1–M10.

## Nguyên tắc làm

1. **Mỗi giai đoạn kết thúc bằng một thứ chạy được và anh dùng thật.** Không xây hết phần nền rồi mới có giao diện.
2. **Đi theo lát cắt dọc**: mỗi tính năng làm đủ từ đặc tả → dữ liệu → logic → giao diện → kiểm thử, không làm hết tầng này mới sang tầng khác.
3. **Không sửa DeepSeek Harness (dsh)**: mọi thứ là plugin trong profile `aris`. Ghim chính xác phiên bản dsh; nâng cấp có kiểm thử hợp đồng.
4. **Mỗi giai đoạn = một nhánh + một PR**, có danh sách nghiệm thu; anh duyệt bằng cách dùng thử.
5. **Đặc tả trước khi viết mã**: mỗi package có `docs/specs/<tên>.md` viết bằng lời của mình (đúng quy trình tham khảo Hermes).
6. **Giao diện bám canvas**: mã giao diện dùng chung một bộ thành phần (`aris-ui-kit`): màu, chữ, 5 trạng thái, 30 linh vật, thanh bên.
7. **Một lõi, nhiều mặt**: toàn bộ năng lực nằm trong `aris-bundle`; Web UI, Telegram, `aris ask`, ACP, API, A2A, MCP chỉ là các mặt mở ra ngoài. Daemon là chủ duy nhất của trạng thái.

## Tổng quan

| Giai đoạn | Thời lượng | Kết quả anh dùng được | Màn hình |
|---|---|---|---|
| **0 · Nền móng** | 1 tuần | `pnpm aris` mở được Web UI, chat với DeepSeek | — |
| **1 · Một bot dùng hằng ngày** | 2 tuần | Nhắn Aris qua Telegram, Aris nhớ anh, đổi được model; chạy ngầm 24/7 và `aris ask` trong script | 1.1 (chưa có đội), 3.1, 6.2, 6.3 (Telegram) |
| **2 · Đội bot và Commander** | 3 tuần | 5 bot có linh vật, Aris giao việc cho đội **kể cả bot ngoài** (Claude Code, Codex, Hermes…), thấy dòng việc rẽ nhánh và bản đồ 3D | 1.1–1.4, 2.1–2.5 |
| **3 · Tự tiến hoá** | 3 tuần | Bot tự học ký ức, tự đề xuất skill có kiểm thử, anh duyệt qua Telegram | 2.3, 3.2–3.5, 7.1, 7.3 |
| **4 · Tự động** | 2 tuần | Routine 8h sáng tự gửi, Kanban cho dự án dài | 4.1–4.3, 7.2 |
| **5 · Second Brain và đồ thị** | 3 tuần | Ghi âm Telegram → ghi chú có liên kết, hỏi bộ não, đồ thị 2D/3D | 5.1–5.4 |
| **6 · Mở cửa: aris trong nền tảng khác** | 2 tuần | Aris làm agent thành viên trong IDE, **Buzz Desktop**, Open WebUI; gọi và được gọi bởi agent khác (A2A); mở tool cho Claude Desktop/Cursor (MCP) | 6.3 (mục "Mặt tích hợp"), 6.4 |
| **7 · Cứng cáp và lên server** | 2 tuần | Chạy 24/7 trên server, an toàn mạng, ngân sách, Lark + Zalo, đo đối đầu với Hermes | 6.1, 6.4, 6.5 |
| **8 · Mở rộng** | theo nhu cầu | Màn hình của bot, trình duyệt tự động, chat web trên điện thoại, Buzz như kênh nhắn tin… | 6.6, 7.4 |

Tổng: khoảng **18 tuần** cho giai đoạn 0–7.

---

## Giai đoạn 0 · Nền móng (tuần 1)

**Mục tiêu**: có bộ khung chạy được, CI, và trả lời dứt điểm câu hỏi kỹ thuật lớn nhất: *giao diện aris làm bằng plugin Web client của dsh được tới đâu*.

**Việc cần làm**

1. **Monorepo**: Node 22 LTS, pnpm workspace, TypeScript strict, Vitest, ESLint/Prettier.
   ```
   aris-agent/
     profiles/aris/            package.json (dsh.profile), cordis.patch.yml mẫu
     packages/aris-bundle/     package.json (dsh.bundle) + patch
     packages/aris-ui-kit/     màu, chữ, trạng thái, 30 linh vật (SVG + Path2D), thanh bên
     packages/aris-hello/      plugin mẫu
     docs/specs/               đặc tả từng package
     design/canvas/            bản sao thiết kế
   ```
2. **Ghim dsh**: thêm `@deepseek-ai/dsh` phiên bản chính xác; script `pnpm aris` = `dsh --profile aris web`.
3. **Profile `aris`**: xếp lớp `dsh-base` → `dsh-web-app` → `aris-bundle`; kiểm tra bằng `dsh --profile aris --dump-config`.
4. **Plugin mẫu `aris-hello`**: một `PromptSection`, một tool, một sự kiện `aris/hello` trong log phiên — chứng minh đủ ba đường mở rộng và gỡ plugin sạch.
5. **Spike giao diện (2 ngày)**: dựng thử thanh bên + một node chat (thẻ "dòng việc") + canvas 3D bằng cơ chế client module / conversation node / sidebar của Web client dsh.
   - Được ⇒ toàn bộ giao diện aris là plugin của Web client dsh (khuyến nghị: một chỗ, ít mã).
   - Không đủ linh hoạt ⇒ phương án B: app web riêng (React + Vite) nói chuyện với dsh qua `sdk` JSON-RPC. Em báo anh kết quả spike trước khi đi tiếp.
6. **`aris-ui-kit` bản đầu**: chuyển token màu, 5 trạng thái, 30 linh vật từ canvas thành mã dùng chung.
7. **CI**: build, test, lint; chặn dependency có tên `hermes`/từ `nousresearch/*`; quét giấy phép dependency.
8. **Spike "nhiều mặt" (nửa ngày)**: xếp `aris-bundle` lên profile `acp` và `headless` của dsh, chạy thử trong Zed (ACP) và một lệnh `--json`. Chứng minh sớm rằng kiến trúc "một lõi, nhiều mặt" chạy được, tránh phải đập lại ở giai đoạn 6.

**Nghiệm thu**
- `pnpm aris` mở Web UI, chat với DeepSeek; log phiên ghi ra đĩa.
- Sandbox chặn ghi ra ngoài thư mục làm việc.
- `--dump-config` thấy các row của aris; gỡ `aris-hello` không để lại gì.
- Có kết luận spike giao diện (A hay B).
- aris trả lời được trong Zed qua ACP và qua `headless --json`.

**Anh cần chuẩn bị**: khoá API DeepSeek.

---

## Giai đoạn 1 · Một bot dùng hằng ngày (tuần 2–3)

**Mục tiêu**: Aris sống trên Telegram của anh, nhớ anh, đổi được model.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-providers` | Danh mục provider dựng sẵn (DeepSeek, Anthropic, OpenAI, Google, OpenRouter, Ollama…) + **provider tự thêm** (kiểu SDK + URL + khoá); kiểm tra kết nối; năng lực và giá từng model; **model theo việc**; thứ tự dự phòng; xoay vòng khoá. Học cách tổ chức dữ liệu của VoxAgent |
| `aris-memory` | Ký ức 2 tầng: lõi có trần (nạp qua `PromptContext` để có hiệu lực ngay mà không phá cache), lưu trữ (SQLite FTS5); tool `memory` (add/patch/remove/search); nhắc lưu khi turn dài; lưu trước khi nén; sự kiện `aris/memory-op` |
| `aris-recall` | Tìm lại phiên cũ qua `ctx.sessionQuery` + tóm tắt bằng model rẻ, có trích dẫn |
| `aris-dispatch` | Cửa vào duy nhất: chống trùng theo id tin nhắn, hàng đợi bền theo cuộc hội thoại, ánh xạ chat → phiên; 3 chế độ khi bot đang bận (chèn / xếp hàng / dừng và làm mới) |
| `aris-channels` + `aris-gateway-telegram` | Long-polling, ghép đôi chủ nhân bằng mã, gửi/nhận văn bản, ảnh, tệp, ghi âm → chữ |
| Chạy ngầm (M1, M2) | Daemon `launchd` trên Mac, tự khởi động lại, **chủ duy nhất của trạng thái**; socket cục bộ: `aris status`, `aris stop`, `aris send`; `aris ask "…" [--bot] [--json]` chạy một việc rồi thoát (khách mỏng nối vào daemon nếu daemon đang chạy) |

**Giao diện**: 1.1 Chat (khung chat, chọn provider/model, đính kèm, lệnh `/`), 3.1 Ký ức, 6.2 Provider & model, phần Telegram của 6.3.

**Nghiệm thu**
- Nhắn Aris trên Telegram; tắt máy mở lại không mất tin, không trả lời đôi.
- Nói "nhớ là…", ký ức có hiệu lực ngay ở tin kế tiếp; qua phiên mới vẫn nhớ.
- Hỏi lại chuyện tuần trước, trả lời đúng có dẫn nguồn.
- Đổi model giữa chừng bằng viên chọn model hoặc `/model`; thêm được một provider tuỳ chỉnh.
- `aris ask "tóm tắt lịch hôm nay" --json` chạy trong một script cron của hệ thống, kết quả ghi vào cùng log, Aris nhớ được việc đó.

**Rủi ro**: Telegram gửi lại tin khi mạng chập chờn ⇒ chống trùng ngay từ đầu. Prompt cache bị phá ⇒ đo tỉ lệ trúng cache từ ngày đầu.

**Anh cần chuẩn bị**: tạo bot Telegram cho Aris qua BotFather; (tuỳ chọn) khoá Anthropic.

---

## Giai đoạn 2 · Đội bot và Commander (tuần 4–6)

**Mục tiêu**: 5 bot chuyên môn, Aris điều phối, anh thấy cả đội làm việc.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-bots` | Bot = agent preset của dsh + không gian dữ liệu riêng (ký ức, hồ sơ, skill); SOUL; linh vật; model mặc định; quyền; kênh riêng (mỗi bot một token Telegram); tạo / nhân bản / xuất bot |
| `aris-commander` | 3 lệnh chỉ Commander có: `giao_viec` (nhận kết quả, song song), `chuyen_giao` (bot đích trả lời anh), `tro_ly_an` (subagent ẩn danh); định tuyến theo mô tả năng lực, ghi `aris/dispatch` có lý do; giới hạn đồng thời / độ sâu / ngân sách mỗi việc; bot thường chỉ được `hoi_dong_doi` |
| `aris-rooms` | Phòng nhóm 2–6 bot: tối đa 3 vòng, 10 tin mỗi lượt, `@tên`, "cần anh", lệnh dừng một bot, chạy tiếp khi đóng ứng dụng |
| Dòng việc | Node chat "dòng việc rẽ nhánh": vẽ các nhánh giao việc từ sự kiện `aris/dispatch` và các bước của bot con; duyệt ngay trên nhánh |
| Bản đồ 3D | Sơ đồ đội 3D (cột phải 1.1) và tab 1.3, dựng từ trạng thái trực tiếp của các agent |
| **Bot ngoài (M3)** | Thêm Claude Code, Codex, Gemini CLI, OpenCode, Hermes vào đội qua `dsh-subagent-acp`: mỗi bot ngoài có linh vật, mô tả năng lực, thư mục làm việc, ngân sách; yêu cầu quyền của bot ngoài chuyển về hộp duyệt của aris (mặc định từ chối); kết quả và sự kiện của nó hiện trên dòng việc như bot nội bộ |
| Kết nối nền tảng (M4) | Cấu hình MCP server theo bot (GitHub cho Tín, Lark Docs cho Mai…) |

**Giao diện**: 1.1 (đủ: thanh bên đội hình, dòng việc, sơ đồ 3D), 1.2, 1.3, 1.4, 2.1 (chọn linh vật), 2.2, 2.4, 2.5 Commander.

**Nghiệm thu**
- "Tóm tắt 3 đối thủ rồi xếp lịch họp" ⇒ Aris giao Lâm và Mai song song, anh thấy hai nhánh chạy, duyệt lời mời họp ngay trên nhánh hoặc trên Telegram.
- Phòng nhóm 3 bot bàn một việc, dừng sau tối đa 3 vòng.
- Nhắn thẳng cho Lâm qua bot Telegram riêng của Lâm vẫn được.
- Bot thường không thể giao việc tiếp (không có vòng lặp).
- "Sửa lỗi đăng nhập trong repo X" ⇒ Aris giao cho bot ngoài Claude Code, anh thấy từng bước trên nhánh, duyệt lệnh nguy hiểm trên Telegram.

**Rủi ro**: chi phí tăng khi nhiều bot chạy ⇒ trần ngân sách mỗi việc từ đầu; Commander giao sai ⇒ nhật ký định tuyến có lý do để chỉnh.

**Anh cần chuẩn bị**: token Telegram cho các bot muốn có kênh riêng (Lâm, Mai…); cài sẵn agent ngoài muốn dùng (Claude Code, Codex, Hermes…) cùng tài khoản của chúng.

---

## Giai đoạn 3 · Tự tiến hoá (tuần 7–9)

**Mục tiêu**: bot giỏi dần theo thời gian mà vẫn an toàn.

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-reflect` | Vòng học chạy nền qua `ctx.jobs`, kích hoạt theo **tín hiệu** (bị sửa sai, "nhớ nhé", nhiều bước, lỗi rồi tìm ra cách) + lưới an toàn theo bộ đếm; fork phiên để trúng prompt cache; đầu ra JSON có schema; trần token/lần và /ngày |
| `aris-user-model` | Nhận định về anh có độ tin cậy và bằng chứng; chỉ vòng học được cập nhật; ≥ 0,8 mới vào prompt |
| `aris-skill-forge` | Tạo/vá skill (`SKILL.md`), linter "bài học, không phải nhật ký"; **kiểm thử bằng chạy lại phiên cũ** trong sandbox không mạng; vòng đời nháp → ứng viên → đang dùng; Commander học "ai làm tốt việc gì" |
| `aris-curator` | Skill không dùng 14 ngày → ít dùng, 30 ngày → lưu kho; ghim; sao lưu và quay lui |
| `aris-approvals` | Hộp duyệt chung (hành động, ký ức, skill); thẻ duyệt có nút trên Telegram; hết hạn ⇒ từ chối; gợi ý luật từ lịch sử duyệt |
| Tự trị | `/goal` (giám khảo chấm sau mỗi lượt), `/loop`, `/heartbeat` |

**Giao diện**: 2.3 Hồ sơ chủ nhân, 3.2 Thư viện skill, 3.3 Chi tiết skill (diff + kết quả chạy lại), 3.4 Hộp duyệt, 3.5 Việc đang chạy, 7.1 và 7.3 (thẻ Telegram).

**Nghiệm thu**
- Sau một việc khó, nhận được đề xuất skill có số liệu kiểm thử; duyệt trên Telegram; lần sau cùng việc ít bước hơn ≥ 30%.
- Sửa định dạng báo cáo 2 lần ⇒ bot tự đề xuất bản vá skill.
- Nội dung từ web/email không bao giờ tự thành ký ức.
- Chi phí vòng học nằm trong trần đã đặt.

**Rủi ro**: skill tự sửa làm hỏng hành vi ⇒ bắt buộc kiểm thử + duyệt + quay lui một lệnh.

---

## Giai đoạn 4 · Tự động (tuần 10–11)

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-cron` | Tạo routine bằng lời → hiện bản dịch lịch để xác nhận; chạy ở phiên mới với quyền chặt; giao kết quả ra kênh; chạy bù khi máy tắt; chế độ chỉ chạy script không dùng AI; báo khi lỗi liên tiếp; tạm dừng tất cả |
| `aris-kanban` | Bảng việc bền dùng chung cho đội: thẻ, phụ thuộc, người nhận là bot; Commander tự chia việc (tự động/thủ công); Driver mặc định tắt |
| Webhook | Sự kiện ngoài (vd. GitHub) tạo phiên qua `ctx.webhookRuntime` |

**Giao diện**: 4.1 Routine, 4.2 Tạo routine, 4.3 Kanban, 7.2 Thẻ báo cáo routine.

**Nghiệm thu**: 8h sáng thứ 2–6 Mai tự gửi tóm tắt email và lịch về Telegram; một dự án được chia thành thẻ, các bot làm lần lượt theo phụ thuộc.

---

## Giai đoạn 5 · Second Brain và đồ thị (tuần 12–14)

**Việc cần làm**

| Package | Nội dung |
|---|---|
| `aris-brain` | Kho ghi chú Markdown (mở được bằng Obsidian, có git); Hộp thư vào nhận tin chuyển tiếp, link, ảnh, ghi âm từ Telegram/Lark/Zalo hoặc `/note`; xử lý nền: chép lời, tóm tắt, gắn thẻ, đề xuất chỗ xếp, trích người/dự án/ngày hẹn |
| Tìm kiếm | SQLite FTS5 + chỉ mục vector (model nhúng qua `aris-providers`, có thể chạy Ollama trên máy); "Hỏi bộ não" trả lời có trích dẫn; tool `brain_search`, `brain_capture`; phân quyền đọc/ghi theo bot |
| `aris-graph` | Chỉ mục cạnh: `[[liên kết]]`, thực thể, nguồn gốc ký ức; gợi ý nối; đồ thị quanh ghi chú (2D) và đồ thị toàn cục (3D) |

**Giao diện**: 5.1 Ghi chú (đồ thị 2D quanh ghi chú), 5.2 Hộp thư vào, 5.3 Đồ thị toàn cục 3D, 5.4 Hỏi bộ não; phần "Từ Second Brain" trong menu đính kèm.

**Nghiệm thu**: gửi một ghi âm Telegram ⇒ có ghi chú đã chép lời, xếp đúng dự án, nối với ghi chú liên quan; "Hỏi bộ não" trả lời đúng kèm nguồn; mở thẳng thư mục bằng Obsidian được.

---

## Giai đoạn 6 · Mở cửa: aris trong nền tảng khác (tuần 15–16)

**Mục tiêu**: aris làm được mọi điều Hermes làm khi được nhúng vào hệ thống khác, cùng một lõi và một bộ dữ liệu.

**Việc cần làm**

| Package / mặt | Nội dung |
|---|---|
| Preset "thành viên" | Bộ quyền dùng khi aris chạy trong nền tảng khác: chỉ chủ nhân, bỏ tool nguy hiểm, nội dung đến là không tin cậy, không tự ghi ký ức, **tự áp danh sách cấm kể cả khi host tự duyệt mọi quyền** (Buzz Desktop làm vậy) |
| `aris-acp` (M6) | Profile = acp của dsh + aris-bundle + preset thành viên; `aris acp --bot <tên>`; tên lệnh `aris-acp` trên PATH để **Buzz Desktop tự phát hiện** như runtime; chạy được sau `buzz-acp` trên server |
| `aris-api` (M7) | HTTP + SSE tương thích OpenAI: `/v1/chat/completions`, `/v1/responses`, `/v1/models` (mỗi bot là một model `aris/<bot>`); khoá chống gửi lặp; sự kiện tool trong luồng; bearer token; mặc định chỉ nghe `127.0.0.1` |
| `aris-a2a` (M5, M8) | Client: `a2a_discover`, `a2a_call`, chia việc cho mọi peer cùng năng lực; Server: Agent Card (mỗi bot một kỹ năng), JSON-RPC, SSE, push webhook có ký HMAC, token theo peer, giới hạn tốc độ, trần số lượt qua lại, nhật ký kiểm toán |
| `aris-mcp-server` (M9) | Mở `brain_search`, `brain_capture`, `memory_search`, `giao_viec` cho Claude Desktop, Cursor…; từng tool bật/tắt riêng |
| Giao diện | Mục "Mặt tích hợp" trong 6.3: bật/tắt từng mặt, token, peer tin cậy, bot nào được mở ra mặt nào; nhật ký truy cập |

**Nghiệm thu**
- Buzz Desktop tìm thấy aris trong Settings → Runtimes và chat được với Lâm; lệnh xoá tệp bị chặn dù Buzz tự duyệt.
- Open WebUI nối vào `aris-api`, chọn được model `aris/mai`.
- Một Hermes khác gọi aris qua A2A và ngược lại; hai bên không chat qua lại quá trần đã đặt.
- Claude Desktop tìm được ghi chú trong Second Brain qua MCP.
- Mọi việc làm qua các mặt này đều hiện trên bản đồ đội và trong log phiên.

**Rủi ro**: mở cổng mạng ⇒ mặc định chỉ localhost, mở ra ngoài phải có token và cấu hình rõ ràng. Hai tiến trình cùng ghi một bot ⇒ daemon là chủ duy nhất, các mặt khác là khách mỏng.

**Anh cần chuẩn bị**: (tuỳ chọn) cài Buzz Desktop hoặc một relay Buzz; Open WebUI nếu muốn dùng.

---

## Giai đoạn 7 · Cứng cáp và lên server (tuần 17–18)

**Việc cần làm**
1. **Lên server**: container, `systemd`, egress allowlist (chỉ cho các API cần thiết), proxy có nhật ký cho tool mạng.
2. **Ngân sách và an toàn**: trần chi phí ngày, ngưỡng báo, danh sách cấm cứng, luật cho phép, kho bí mật (1Password/Bitwarden), nút dừng khẩn cấp.
3. **Quan sát**: otel + token-meter; bảng điều khiển; thống kê chi phí theo bot và việc; phát lại phiên từng bước.
4. **Sao lưu**: hằng đêm, mã hoá, diễn tập khôi phục.
5. **Kênh**: Lark (nhóm, tài liệu), Zalo OA.
6. **Đo đối đầu với Hermes**: cùng máy, cùng model DeepSeek, 30 tác vụ mẫu; so RAM, độ trễ, tỉ lệ trúng cache, chi phí vòng học, tỉ lệ hoàn thành không cần can thiệp (chỉ tiêu ở mục 10.3 tài liệu tính năng).
7. **Rà soát bảo mật** toàn bộ trước khi để chạy không giám sát.

**Giao diện**: 6.1 Bảng điều khiển, 6.3 (đủ Lark, Zalo), 6.4 Ngân sách–duyệt–mạng, 6.5 Thống kê & nhật ký.

**Nghiệm thu**: chạy liên tục 14 ngày không cần can thiệp; chi phí trong ngân sách; khôi phục thành công từ bản sao lưu; số đo đối đầu đạt chỉ tiêu.

**Anh cần chuẩn bị**: chọn server (đề xuất Oracle Cloud), ứng dụng Lark, Zalo OA đã xác thực.

---

## Giai đoạn 8 · Mở rộng (theo nhu cầu)

- 6.6 Màn hình của bot (desktop ảo, cầm lái khi gặp đăng nhập/2FA).
- Trình duyệt tự động, computer-use (dsh có sẵn `browser-use`, `computer-use`).
- 7.4 Chat web trên điện thoại (PWA).
- Buzz như một kênh nhắn tin ngang Telegram (M10); thêm Discord, Slack, WhatsApp khi cần.
- Bot tự viết tool qua hệ con `extensions` của dsh (luôn cần duyệt).
- Nhập cấu hình/skill từ Claude Code, Codex, Cursor; kho skill cộng đồng; xuất trajectory để huấn luyện.

---

## Việc xuyên suốt mọi giai đoạn

| Việc | Cách làm |
|---|---|
| Kiểm thử | Unit cho logic thuần; **kiểm thử hợp đồng** với phiên bản dsh đã ghim; **phát lại phiên mẫu** để bắt thoái lui khi đổi prompt/skill/model; kiểm thử "hỗn loạn" (`kill -9`, mất mạng, tin gửi lại) cho kênh |
| Đặc tả | `docs/specs/<package>.md` trước khi code; cập nhật nhật ký tham khảo khi đọc Hermes/Tako/VoxAgent |
| Nâng cấp dsh | Đọc hướng dẫn nâng cấp → đổi phiên bản ghim → chạy kiểm thử hợp đồng + phát lại → mới hợp nhất |
| Giao diện | Mọi màn dùng `aris-ui-kit`; đối chiếu canvas trước khi đóng giai đoạn |
| Chi phí | Theo dõi từ giai đoạn 1; mỗi tính năng nền có trần token riêng |

## Anh cần chuẩn bị (tổng hợp)

| Khi nào | Việc |
|---|---|
| Giai đoạn 0 | Khoá API DeepSeek |
| Giai đoạn 1 | Bot Telegram cho Aris (BotFather); máy Mac để chạy nền; tuỳ chọn khoá Anthropic |
| Giai đoạn 2 | Bot Telegram riêng cho các bot muốn có kênh riêng |
| Giai đoạn 2 | Agent ngoài muốn đưa vào đội (Claude Code, Codex, Hermes…) đã cài và đăng nhập |
| Giai đoạn 6 | (Tuỳ chọn) Buzz Desktop hoặc relay Buzz; Open WebUI |
| Giai đoạn 7 | Server; ứng dụng Lark; Zalo OA đã xác thực; chốt trần ngân sách ngày |
