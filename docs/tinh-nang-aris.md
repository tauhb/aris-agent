# aris-agent — Đặc tả tính năng (ngang Hermes, chạy trên DeepSeek Harness)

> **23/10/2026.** Tài liệu này trả lời: *aris cần những tính năng gì để có sức mạnh tương đương Hermes Agent, chạy hiệu quả hơn, và thêm năng lực "đội nhiều bot"?*
>
> **Nguồn:** mã nguồn và tài liệu của Hermes Agent (`nousresearch/hermes-agent`, commit `c73cbcc`, 22/10/2026, giấy phép MIT), đọc để học thiết kế; tài liệu DeepSeek Harness (commit `687f282`). Nguyên tắc: **học ý tưởng, không sao chép, không import** — xem mục 12 và [clean-room-log.md](clean-room-log.md).
>
> Kiến trúc nền (các package `aris-*`, seam dsh) nằm ở [phan-tich-kien-truc.md](phan-tich-kien-truc.md). Tài liệu này đi từ góc nhìn **người dùng**: aris làm được gì.

**Ký hiệu**

- **Ưu tiên**: `P0` = bắt buộc cho bản dùng được (MVP) · `P1` = để ngang Hermes · `P2` = làm sau · `—` = không làm.
- **dsh**: ✅ có sẵn trong DeepSeek Harness · ⚠️ có một phần · ❌ aris tự xây.
- 🖥️ **UI-xx** = phần **cần thiết kế giao diện** (danh sách tổng ở mục 11 để anh giao việc design sau).

---

## 1. Hermes thực sự là gì (rút ra sau khi đọc mã)

Hermes là một dự án rất lớn (~1,09 triệu dòng Python, ~20.700 file) và đã trưởng thành. Sức mạnh của nó **không nằm ở vòng lặp agent** (dsh cũng có), mà ở 5 cụm:

| Cụm | Cốt lõi kỹ thuật (đã kiểm chứng trong mã) |
|---|---|
| **Trí nhớ có giới hạn, tự quản** | Hai kho `MEMORY.md` (≤ 2.200 ký tự) và `USER.md` (≤ 1.375 ký tự), nạp vào system prompt dưới dạng **ảnh chụp đóng băng lúc bắt đầu phiên** để giữ prompt cache; agent tự `add/patch/remove`; kho đầy thì tool báo lỗi, buộc agent tự gộp/xoá. |
| **Vòng học chạy nền** | Sau mỗi turn, nếu đủ điều kiện (mặc định **10 lượt người dùng** cho ký ức, **10 vòng gọi tool** cho skill) thì **fork agent** chạy nền, phát lại hội thoại với *cùng tiền tố prompt* để trúng cache, hỏi "có gì đáng lưu thành ký ức/skill không?". Mỗi lần ~30K token; tắt với cron. Có thể chuyển sang model rẻ (gửi bản tóm tắt thay vì toàn bộ, rẻ hơn 3–5×). |
| **Skill tự tạo + Curator** | Tool `skill_manage` (create/patch/write_file…) có linter "ghi bài học, không ghi nhật ký"; Curator chạy khi rảnh mỗi 7 ngày: skill không dùng 14 ngày → `stale`, 30 ngày → `archived`; ghim (pin) và skill được cron tham chiếu thì miễn; có backup/rollback. |
| **Sống ngoài đời** | Gateway ~25 nền tảng (Telegram, Discord, Slack, WhatsApp, Lark, Email…), cron có giao kết quả, `/goal` (vòng lặp có model giám khảo), `/loop`, `/heartbeat`, Kanban nhiều agent, webhook. |
| **Nhiều bot** | **Profile** = một "nhà" riêng (config, khoá API, SOUL, ký ức, skill, cron, phiên); **Bot Mode** = giao diện roster các profile: mỗi bot có avatar, một cuộc chat vĩnh viễn, routine riêng, nhắn cho nhau, **phòng nhóm 2–6 bot** (tối đa 3 vòng, 10 tin/lượt gửi). Một tiến trình gateway có thể phục vụ mọi profile (multiplexing). |

**Điểm yếu của Hermes mà aris có thể vượt qua** (đều có dẫn chứng từ chính tài liệu Hermes):

1. **Ký ức lưu giữa phiên không thấy được cho tới phiên sau** (ảnh chụp đóng băng). Trên Telegram, một chat là *một phiên liên tục* ⇒ người dùng phải tự gõ `/new` mới "làm mới trí nhớ".
2. **Không có tầng ký ức lưu trữ** sẵn — ngoài ~1.300 token lõi chỉ còn tìm kiếm phiên; muốn hơn phải cài provider ngoài (Honcho, Mem0…).
3. **Skill được ghi tự do theo mặc định, không kiểm thử** trước khi dùng (chỉ có linter cảnh báo).
4. **Vòng học kích hoạt theo đếm** (mỗi 10 turn) chứ không theo tín hiệu ⇒ tốn token ở turn vô vị, bỏ lỡ turn quan trọng.
5. **Nặng**: Python, mỗi gateway ~300 MB khi rảnh; độ phức tạp vận hành cao (~70 module `hermes_state_*` quản lý trạng thái SQLite, trong đó có cả các module sửa chữa và khôi phục).

## 2. Định vị aris

> **aris = sức mạnh của Hermes + nền log append-only của dsh + vòng học có kiểm thử + đội bot trong một tiến trình nhẹ, tối ưu cho DeepSeek và người dùng Việt Nam.**

| Trục | Hermes | aris (mục tiêu) |
|---|---|---|
| Nhân | Python, nhiều luồng | TypeScript/Node, hướng sự kiện bất đồng bộ (dsh/Cordis) |
| Nguồn sự thật | SQLite `state.db` + nhiều lớp sửa chữa | Log phiên append-only có thế hệ + migration (dsh); mọi thứ suy ra từ log, **phát lại được** |
| Ký ức mới | Thấy ở phiên sau | Thấy ở **request kế tiếp** mà không phá cache (ngữ cảnh "cache-safe" của dsh) |
| Skill mới | Ghi thẳng | **Kiểm thử bằng phát lại phiên cũ** rồi mới bật; theo dõi tỉ lệ thành công, tự đề xuất rollback |
| Vòng học | Theo bộ đếm | Theo **tín hiệu** (bị sửa sai, nhiều bước, lỗi tool, "nhớ nhé"…) + ngân sách |
| Nhiều bot | Nhiều profile, gateway multiplex | Nhiều bot **trong một tiến trình** (mỗi bot là một scope cô lập, ký ức tách riêng như Hermes), tách tiến trình khi cần cô lập cứng; **bản đồ đội bot** để thấy các bot tương tác |
| Tri thức của chủ nhân | Không có (chỉ ký ức của agent) | **Second Brain** + **đồ thị tri thức** (mục 9) |
| Kênh Việt Nam | Không có Zalo | **Zalo OA**, Lark, Telegram; tiếng Việt có dấu mặc định |
| Model | Đa nhà cung cấp, cache tối ưu cho Claude | Đa nhà cung cấp, **tối ưu prompt cache của DeepSeek** (cache tiền tố tự động) |

## 3. Danh mục tính năng — Lõi agent

| # | Tính năng | Hermes làm thế nào | aris trên dsh | dsh | Ưu tiên | UI |
|---|---|---|---|---|---|---|
| A1 | Chat đa model, đổi model trong phiên (`/model`); **không giới hạn số nhà cung cấp** (quyết định 23/10) | Nhiều provider, ghim model theo chat | `ctx.llm` + lớp `aris-providers` thêm provider bằng cấu hình; **tham khảo cách VoxAgent (repo trong máy) quản lý provider — chưa đọc, làm ở bước sau**; DeepSeek mặc định | ⚠️ | P0 | 🖥️ UI-12 |
| A2 | Model phụ cho từng việc nền (nén, tìm kiếm, reflect, giám khảo goal, curator) | Slot `auxiliary.<task>` | `aris-routing`: bảng `task → model` (vd. reflect/recall dùng DeepSeek rẻ, việc khó dùng model mạnh) | ⚠️ | P0 | 🖥️ UI-12 |
| A3 | Dự phòng nhà cung cấp, xoay vòng nhiều API key | Fallback providers, credential pools | Adapter bọc `ctx.llm`: lỗi/giới hạn → key khác → provider khác | ❌ | P1 | 🖥️ UI-12 |
| A4 | Tính cách: `SOUL` (danh tính, slot #1 prompt) + preset tính cách theo phiên | `SOUL.md` + `/personality` | `PromptSection` thứ tự đầu tiên; mỗi bot một SOUL; preset là lớp phủ theo phiên | ⚠️ | P0 | 🖥️ UI-03 |
| A5 | Tệp ngữ cảnh dự án (`AGENTS.md`…) và tham chiếu `@file`, `@url` | Context files, context references | dsh đã đọc AGENTS; thêm mở rộng `@` | ⚠️ | P1 | — |
| A6 | Bộ công cụ (toolsets) bật/tắt theo bot, theo kênh | `toolsets.py`, preset theo nền tảng | Agent preset của dsh (mỗi preset một tập tool riêng) | ✅ | P0 | 🖥️ UI-03 |
| A7 | **Tool search** — nạp schema tool theo nhu cầu khi có nhiều MCP | 3 tool cầu nối, nạp schema khi cần | Tool `tool_search` + đăng ký động trên `ctx.tools`; tiết kiệm token, giữ cache | ❌ | P1 | — |
| A8 | MCP (stdio/HTTP), lọc tool theo server | Có | `dsh-mcp` | ✅ | P0 | 🖥️ UI-11 |
| A9 | Chạy script gọi nhiều tool một lượt | `execute_code` (Python qua RPC) | `ctx.ptcRuntime` + `workflow` | ✅ | P1 | — |
| A10 | Agent con: đơn lẻ, song song (lô), chạy nền trả kết quả sau | `delegate_task`, mặc định tối đa 10 song song | `subagent` (preset riêng, `depthLimit`), giao kết quả qua inbox | ✅ | P0 | 🖥️ UI-14 |
| A11 | Terminal: local, SSH, Docker; tiến trình nền | Nhiều backend | sandbox local + `ssh`; thêm provider Docker | ⚠️ | P1 | — |
| A12 | Checkpoint & `/rollback` file trước khi sửa | Shadow git repo | dsh `worktrees` + snapshot trước thao tác ghi | ⚠️ | P1 | 🖥️ UI-14 |
| A13 | Trình duyệt tự động, computer-use | Nhiều backend browser, cua-driver | `browser-use`, `computer-use` của dsh | ✅ | P2 | — |
| A14 | Nhìn ảnh, đọc tài liệu (PDF/Office) | Vision, document extraction | dsh `attachment`, `office-to-pdf` | ✅ | P1 | — |
| A15 | Giọng nói: ghi âm → chữ, đọc trả lời (TTS) | STT/TTS 10 provider | dsh `voice-input` + provider TTS tiếng Việt | ⚠️ | P1 | — |
| A16 | Tạo ảnh/video | FAL, xAI… | Tool gọi API tạo ảnh | ❌ | P2 | — |
| A17 | Nén ngữ cảnh khi dài; tỉa kết quả tool cũ | 2 lớp nén (50%/85%), tóm tắt có cấu trúc | `ctx.compaction` + **lưu ký ức trước khi nén** | ✅ | P0 | — |
| A18 | Lập kế hoạch (`/plan`), danh sách việc (todo), hỏi làm rõ nhiều lựa chọn | Có | dsh `plan`, `todo`, `user-questions` | ✅ | P0 | — |
| A19 | Lệnh rẽ nhánh/hỏi bên lề (`/branch`, `/btw`), `/retry`, `/undo` | Có | Fork phiên tại ranh giới turn (dsh) | ✅ | P1 | — |

### 3.1 Provider và model — học từ VoxAgent (23/10)

VoxAgent (repo trong máy, `~/Desktop/Vibe Coding/VoxAgent`) có lớp provider rất đầy đủ; aris lấy **thiết kế dữ liệu**, viết lại trên `ctx.llm` của dsh. *Cần kiểm tra giấy phép của VoxAgent trước khi tái dùng nguyên dữ liệu danh mục model.*

| Khía cạnh | VoxAgent làm | aris áp dụng |
|---|---|---|
| Danh mục | ~85 provider dựng sẵn; nguồn `builtin` / `custom` / `remote` | Danh mục dựng sẵn (DeepSeek, Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, vLLM…) + **provider tự thêm không giới hạn** |
| Thêm provider tuỳ chỉnh | Chọn **kiểu SDK** (openai, anthropic, azure, bedrock, google, ollama, router…) + base URL + khoá | Như vậy: phần lớn dịch vụ là "tương thích OpenAI" ⇒ chỉ cần URL + khoá |
| Xác thực | API key hoặc OAuth device flow | API key trước; OAuth sau |
| Cấu hình provider | Khoá, base URL, model dùng để **kiểm tra kết nối**, tải danh sách model từ xa | Như vậy + nút "Kiểm tra" |
| Model | Loại (chat, embedding, tts, stt, image, video, realtime); năng lực (nhìn ảnh, gọi tool, suy luận, tìm web, đầu ra có cấu trúc, tệp, âm thanh); **giá** (vào/ra/cache, bậc thang); bật/tắt từng model, đổi tên hiển thị | Như vậy; **giá dùng cho ngân sách** và gợi ý model rẻ cho việc nền |
| Giới hạn | Số tool tối đa, cỡ payload tool theo provider | Như vậy (quan trọng cho tool search) |
| Điều khiển bằng lệnh | `vx provider/model …` | Lệnh `/model`, `/provider` trong chat + màn 6.2 |

Thêm của aris: **định tuyến theo việc** (chat / Commander / reflect / tóm tắt tìm kiếm / giám khảo goal / nén / eval skill — mỗi việc chọn model riêng), **thứ tự dự phòng** khi provider lỗi, **xoay vòng nhiều khoá**, và **model mặc định theo từng bot**. Màn hình: 6.2.

## 4. Danh mục tính năng — Trí nhớ và hiểu người dùng

### B1. Ký ức lõi (tương đương MEMORY.md + USER.md) — `P0`

- Hai kho: **Ghi chú của aris** (môi trường, quy ước, bài học) và **Hồ sơ chủ nhân** (sở thích, cách giao tiếp). Có trần ký tự; hiển thị trong prompt kèm **% dung lượng** để model tự biết khi nào phải gộp.
- Tool `memory` với `add / patch / remove` (khớp theo đoạn con duy nhất, học từ Hermes vì tiết kiệm token).
- Kho đầy ⇒ tool báo lỗi, agent tự gộp/xoá trong cùng turn (không tự cắt âm thầm).
- **Vượt Hermes**: ký ức mới được đưa vào **phần ngữ cảnh cache-safe** (`PromptContext`) ngay request kế tiếp; tới ranh giới request series hoặc lúc nén thì gộp vào phần đầu prompt. ⇒ Không cần gõ `/new`, không mất cache.

### B2. Ký ức lưu trữ (archival) — `P1` (Hermes không có sẵn)

- Không giới hạn; tìm theo từ khoá (SQLite FTS5) rồi thêm tìm theo ngữ nghĩa sau.
- Mỗi ký ức có nguồn gốc (phiên, vị trí trong log), mức tin cậy (người dùng nói / agent suy ra / nội dung ngoài), số phiên bản.
- Tự động: ký ức lõi lâu không dùng bị hạ xuống lưu trữ; ký ức lưu trữ hay được gọi thì đề xuất nâng lên lõi.

### B3. Tìm lại hội thoại cũ — `P0`

- Ba kiểu gọi (học từ Hermes): **khám phá** (tìm phiên theo từ khoá), **cuộn** (đọc tiếp quanh một vị trí), **duyệt** (liệt kê phiên gần đây).
- Dựa trên `ctx.sessionQuery` (FTS) của dsh; kết quả dài thì model phụ tóm tắt kèm trích dẫn phiên.

### B4. Hiểu người dùng sâu dần (biện chứng) — `P1`

- Hồ sơ là các **nhận định có bằng chứng và độ tin cậy** (xem thiết kế ở tài liệu kiến trúc 6.5).
- Học ý tưởng từ chế độ "biện chứng" mà Hermes dùng qua Honcho, nhưng **tự xây, chạy cục bộ**: mỗi K turn (tham số `nhịp`) chạy một lượt suy luận "người này đang cần gì lúc này?" với độ sâu 1–3 lượt (lượt 2 tự soát lỗ hổng, lượt 3 hoà giải mâu thuẫn); bắt đầu phiên thì "làm nóng" trước.
- Chế độ: `ngữ-cảnh` (tự nạp), `công-cụ` (model tự hỏi khi cần), `kết-hợp`.

### B5. Duyệt ghi nhớ — `P0`

- Công tắc `memory.write_approval`: tắt = ghi tự do; bật = mọi ghi từ ngoài chat trực tiếp (vòng học nền, cron) vào **hàng chờ duyệt**. Lệnh `/memory pending`, `/memory approve`.
- 🖥️ **UI-06 Quản lý ký ức**: xem/sửa/xoá ký ức lõi và lưu trữ, thanh dung lượng, hàng chờ duyệt, lịch sử phiên bản, nguồn gốc (bấm để mở đúng chỗ trong phiên).
- 🖥️ **UI-07 Hồ sơ chủ nhân**: các nhận định, độ tin cậy, bằng chứng; người dùng xác nhận/bác bỏ.

### B6. Cắm bộ nhớ ngoài — `P2`

- Seam `ctx.memory` cho phép thay provider (Mem0, Honcho, máy chủ riêng) mà không đổi tool.

## 5. Danh mục tính năng — Tự tiến hoá

### C1. Vòng học chạy nền (reflect) — `P0`

| Khía cạnh | Hermes | aris |
|---|---|---|
| Khi nào chạy | Đếm: 10 lượt người dùng (ký ức), 10 vòng tool (skill) | **Theo tín hiệu**: người dùng sửa sai, nói "nhớ nhé", turn ≥ N bước, lỗi tool rồi tìm ra cách, khen kết quả; *cộng* lưới an toàn theo bộ đếm; bỏ qua turn ngắn |
| Chạy thế nào | Fork agent, phát lại hội thoại cùng tiền tố để trúng cache | **Fork phiên dsh tại ranh giới turn** (`ctx.agents.create` với `seed`) ⇒ cùng tiền tố, trúng cache tiền tố tự động của DeepSeek; chạy qua `ctx.jobs` |
| Model | Model chính, hoặc model rẻ + bản tóm tắt | Như Hermes; mặc định DeepSeek (rẻ sẵn) |
| Giới hạn | `max_input_tokens` mỗi lần review | Trần token mỗi lần + trần/ngày + công tắc tắt |
| Tool được dùng | Danh sách trắng (ký ức, skill, đọc file) | Như vậy; preset `aris-reflect` chỉ đọc |
| Truy vết | Log dòng | Sự kiện `aris/reflection` trong log phiên |
| Cron | Bỏ qua | Bỏ qua mặc định; bật được cho từng routine |

### C2. Tự viết và vá skill — `P0`

- Tool `skill_manage`: `create`, `patch` (vá đoạn — ưu tiên vì rẻ token), `rewrite`, `write_file`, `remove_file`, `delete`.
- **Linter** khi ghi (học từ Hermes): skill phải là *bài học tổng quát* chứ không phải nhật ký sự cố; cảnh báo khi thân skill quá dài, quá nhiều file tham chiếu.
- Mỗi skill tự thành **lệnh gạch chéo** (`/bao-cao-tuan …`); xếp chồng tối đa 5 skill trong một lệnh; **bộ skill (bundle)** cho tổ hợp hay dùng.
- Định dạng `SKILL.md` theo chuẩn mở agentskills.io (dsh và Hermes đều dùng) ⇒ dùng chéo được.

### C3. Kiểm thử skill bằng phát lại — `P0` (aris vượt Hermes)

- Skill mới/bản vá nằm ở `staging` (dsh không quét) ⇒ fork lại phiên gốc, chạy lại yêu cầu với skill ứng viên trong preset `aris-eval` (không mạng, không hành động có hiệu ứng) ⇒ so số bước, token, lỗi, đạt/không.
- Đạt ⇒ xin duyệt (hoặc tự bật nếu rủi ro thấp và đã bật chế độ tin cậy) ⇒ chuyển sang `active`, commit git.
- Sau khi bật: đo tỉ lệ thành công qua sự kiện `aris/skill-applied`; tụt ⇒ đề xuất rollback.

### C4. `/learn` và `/refine` — `P1`

- `/learn <nguồn>`: biến tài liệu, URL, thư mục, hoặc "điều anh biết" thành skill theo chuẩn viết.
- `/refine`: chạy vòng học thủ công ngay cho phiên hiện tại.

### C5. Curator — người quản thủ thư viện skill — `P1`

- Chạy khi rảnh (mặc định 7 ngày/lần, sau ≥ 2 giờ không hoạt động).
- Pha 1 (không dùng LLM): không dùng 14 ngày → `stale`, 30 ngày → `archived`. Skill **ghim**, skill được routine tham chiếu, skill chưa từng dùng nhưng còn mới ⇒ miễn.
- Pha 2 (tuỳ chọn, tốn token): gộp skill trùng lặp thành skill "ô dù".
- Sao lưu trước mỗi lần chạy, rollback một lệnh; `--dry-run` xem trước.
- 🖥️ **UI-08 Thư viện skill**: danh sách theo trạng thái (đang dùng / cũ / lưu kho / chờ duyệt), số lần dùng, tỉ lệ thành công, diff giữa các phiên bản, kết quả eval, nút duyệt/ghim/rollback.

### C6. Kho skill cộng đồng — `P2`

- Cài skill từ nguồn ngoài **qua quét bảo mật** + duyệt; skill ngoài mặc định không được tự sửa.

## 6. Danh mục tính năng — Tự trị và tự động

| # | Tính năng | Mô tả | aris trên dsh | Ưu tiên | UI |
|---|---|---|---|---|---|
| D1 | **`/goal`** — làm tới khi xong | Sau mỗi turn, model giám khảo (rẻ) chấm `xong / tiếp / bị chặn`; "tiếp" thì tự gửi lời nhắc tiếp tục; ngân sách số turn (mặc định 20) | `ctx.goals` có sẵn phase `active/paused/blocked/complete` + giám khảo qua `aris-routing` | P0 | 🖥️ UI-14 |
| D2 | **`/loop`** — lặp theo nhịp trong phiên | Nhịp cố định (`5m`) hoặc **tự điều nhịp**: bắt đầu 1 phút, kết quả không đổi thì giãn dần tới 15 phút | `aris-loop` dùng timer của Cordis, chèn như tin người dùng | P1 | 🖥️ UI-14 |
| D3 | **`/heartbeat`** — nhịp tim cho phiên | Một lời nhắc định kỳ chỉ chạy khi rảnh; lỡ nhiều nhịp thì gộp thành một | Cùng cơ chế D2 | P1 | — |
| D4 | **Lịch (cron/routine)** | Tạo bằng lời; gắn skill; chạy ở phiên mới; giao kết quả về kênh; tạm dừng/sửa/chạy ngay; **chế độ chỉ chạy script, không LLM**; tạo ở trạng thái tạm dừng để thử; tự chạy lại khi lỡ do model không phản hồi; nhắc xem lại khi lỗi liên tiếp; `aris pause` dừng tất cả | `aris-cron` + `aris-dispatch` (tài liệu kiến trúc 6.8) | P0 | 🖥️ UI-09 |
| D5 | Kanban — bảng việc bền cho nhiều bot | Thẻ việc, phụ thuộc, người nhận (bot), duyệt/yêu cầu sửa, chặn, bình luận, đính kèm; điều phối tự giao thẻ theo mô tả năng lực của bot | `aris-kanban`: storage domain + tool `kanban_*` + điều phối; thẻ có thể chạy ở chế độ `/goal` | P1 | 🖥️ UI-05 |
| D6 | Webhook vào | Vd. GitHub PR → bot review | `ctx.webhookRuntime` (dsh, cho sự kiện một-lần) | P2 | 🖥️ UI-11 |
| D7 | Hook sự kiện | Chạy mã ở các mốc vòng đời (log, cảnh báo, rào chắn tool) | Sự kiện `agent/*`, `tools/*`, `session/event` của dsh — người dùng viết plugin nhỏ | ✅ có sẵn | — |
| D8 | Gợi ý tự động hoá | Đề xuất routine dựa trên thói quen | Reflect phát hiện việc lặp lại theo ngày/giờ ⇒ đề xuất routine (chỉ đề xuất) | P2 | — |

## 7. Danh mục tính năng — Kênh và gateway

| # | Tính năng | Ghi chú | Ưu tiên | UI |
|---|---|---|---|---|
| E1 | **Telegram** | Long-polling, không cần mở cổng; nút inline cho duyệt | P0 | — |
| E2 | **Lark/Feishu** | Đội đang dùng; đọc/bình luận tài liệu Lark | P1 | — |
| E3 | **Zalo OA** | Hermes không có — lợi thế cho Việt Nam | P1 | — |
| E4 | Discord, Slack, Email, WhatsApp | Mở rộng sau | P2 | — |
| E5 | Phiên liên tục theo chat; chuyển phiên giữa kênh (`/handoff`) | `aris-dispatch` ánh xạ chat → phiên | P0 | — |
| E6 | **Khi bot đang bận mà người dùng nhắn tiếp**: `interrupt` (dừng, đọc tin mới) / `queue` (xếp hàng) / `steer` (chèn vào lượt đang chạy sau tool kế tiếp) | Cấu hình theo bot/kênh | P0 | — |
| E7 | Tin ghi âm → chữ, gửi file/ảnh, trả lời bằng giọng | | P1 | — |
| E8 | Token im lặng `[SILENT]` — bot quyết định không trả lời (cho nhóm, routine) | | P1 | — |
| E9 | Ghi đè model/prompt theo kênh, theo nhóm chat | | P1 | 🖥️ UI-11 |
| E10 | **Phân quyền**: danh sách cho phép, **ghép đôi bằng mã** (DM pairing), admin vs người dùng thường | | P0 | 🖥️ UI-11 |
| E11 | API tương thích OpenAI (cho Open WebUI, LobeChat…) | Package `aris-api`; xem mục 15.4 (M7) | P1 | — |
| E12 | Dùng trong IDE, Buzz Desktop (ACP) | dsh có sẵn profile `acp`; profile `aris-acp` + preset "thành viên" (mục 15.4, M6) | P1 | — |
| E13 | Giao hàng tin tin cậy: chống trùng, hàng đợi bền, không mất/không trả lời đôi khi khởi động lại | `aris-dispatch` | P0 | — |

## 8. Tính năng mới: Đội bot (tương đương Profiles + Bot Mode của Hermes, làm tốt hơn)

> **Đã chốt 23/10**: "nhiều bot như grokbot" = **nhiều bot, mỗi bot một nhân vật/chuyên môn riêng**, giống Profiles + Bot Mode của Hermes. Phạm vi: **trợ lý cá nhân, một người dùng** (không làm lớp nhiều người dùng). Ký ức và hồ sơ người dùng **tách riêng theo từng bot, như Hermes**.

### 8.1 Khái niệm

| Khái niệm | Ý nghĩa trong aris |
|---|---|
| **Bot** | Một trợ lý có danh tính riêng: tên, chức danh, mô tả năng lực, avatar, SOUL (tính cách), model, bộ tool/skill/MCP, quyền hạn, ký ức riêng, routine riêng, kênh riêng (vd. một token Telegram riêng) |
| **Chat của bot** | Mỗi bot có **một cuộc chat vĩnh viễn**; `/new` trong đó sẽ **nén** chứ không tạo phiên mới (không bao giờ "quên" mối quan hệ) |
| **Phòng nhóm** | 2–6 bot + chủ nhân cùng bàn một việc |
| **Agent con** | Bản thể tạm thời do một bot sinh ra để làm việc (khác với bot) |

### 8.2 Tính năng

| # | Tính năng | Ưu tiên | UI |
|---|---|---|---|
| F1 | **Tạo bot nhanh**: Tên + Chức danh + Mô tả ⇒ bot tự giới thiệu ở tin đầu tiên. Nâng cao: nhân bản từ bot khác, chọn model, SOUL, chọn skill/tool/MCP, sao chép khoá API | P0 | 🖥️ UI-03 |
| F2 | **Danh sách bot (roster)**: avatar, tin mới nhất, chưa đọc, đang hoạt động, tìm kiếm, ẩn bot, xếp vào nhóm thư mục (Khách hàng, Nội bộ…) | P0 | 🖥️ UI-02 |
| F3 | **Nhân bản bot**: sao chép cấu hình, SOUL, skill, ký ức — **không bao giờ sao chép kênh** (token Telegram) để hai bot không giành nhau một tài khoản | P1 | 🖥️ UI-03 |
| F4 | **Routine theo bot**: lịch gắn với bot phụ trách; kết quả nằm trong chat của bot đó | P0 | 🖥️ UI-09 |
| F5 | **Bot nhắn cho bot**: bot A giao/hỏi bot B qua `@tên`; kết quả trả về A | P1 | — |
| F6 | **Phòng nhóm**: tối đa 6 bot; mỗi tin của chủ nhân kích hoạt tối đa 3 vòng; bot được `@` thì trả lời, không ai được `@` thì ai có ý mới mới nói, không thì im; trần 10 tin/lượt; bot gọi `@chủ-nhân` khi cần quyết định (huy hiệu "cần anh"); lệnh dừng một bot (`dừng @bot`); phòng tiếp tục chạy khi anh đóng ứng dụng | P1 | 🖥️ UI-04 |
| F7 | **Bảng Kanban dùng chung** cho đội bot (D5) — điều phối tự giao thẻ theo mô tả năng lực của bot | P1 | 🖥️ UI-05 |
| F8 | **Ký ức và hồ sơ người dùng tách riêng từng bot** (như Hermes — đã chốt). Khi tạo bot mới có thể *sao chép một lần* ký ức/hồ sơ từ bot khác (như `--clone` của Hermes). Tri thức anh muốn mọi bot cùng dùng thì đặt trong **Second Brain** (mục 9), có phân quyền đọc/ghi theo từng bot | P1 | 🖥️ UI-07 |
| F11 | **Bản đồ đội bot**: thấy trực tiếp bot nào đang làm gì, giao việc cho ai, phòng nào đang bàn; xem lại theo thời gian (mục 9, L1) | P1 | 🖥️ UI-19 |
| F9 | **Giọng riêng** cho từng bot (TTS) | P2 | 🖥️ UI-03 |
| F10 | **Màn hình riêng cho bot** (máy ảo có desktop để bot dùng trình duyệt; anh "cầm lái" khi gặp đăng nhập/2FA rồi trả lại) — tốn ~1,1–1,5 GB RAM/màn hình theo số đo của Hermes | P2 | 🖥️ UI-15 |

### 8.3 Cách xây trên dsh (vì sao nhẹ hơn)

- **Một bot = một agent preset của dsh** + một không gian tên dữ liệu `aris_*:<bot>`. Registry tool và skill của dsh **phân lớp theo scope của preset** ⇒ skill/tool của bot nào chỉ bot đó thấy; SOUL và ký ức nạp qua `PromptSection` theo scope.
- **Mặc định mọi bot chạy trong một tiến trình** (`dsh --profile aris`): chi phí thêm một bot chủ yếu là dữ liệu, không phải một tiến trình mới. Mục tiêu đo: **< 50 MB RAM cho mỗi bot thêm** (Hermes ~300 MB mỗi gateway rảnh, theo tài liệu của Hermes).
- **Cô lập cứng khi cần** (bot cho khách hàng, bot thử nghiệm): chạy bot đó thành **một dsh profile riêng = tiến trình riêng, thư mục dữ liệu riêng**; điều phối qua `aris-dispatch` vẫn như cũ.
- **Quy tắc vàng học từ Hermes**: hai tiến trình không bao giờ ghi chung một kho ký ức của cùng một bot (tránh hai bên "đè" trí nhớ của nhau) — khoá theo bot.
- Bot nhắn cho nhau, phòng nhóm: dựng trên inbox của agent và `ctx.agentTeams` (thử nghiệm) của dsh; trạng thái phòng lưu bền trong storage domain `aris_rooms` để chạy tiếp khi đóng ứng dụng.

### 8.4 Aris là Commander — điều phối các bot khác (đề xuất 23/10)

**Hermes có làm không?** Có các mảnh rời, nhưng không có một "chỉ huy" thường trực trong chat:

| Cơ chế của Hermes | Làm gì | Hạn chế |
|---|---|---|
| `delegate_task` | Sinh agent con **ẩn danh** trong cùng profile, chạy song song | Agent con không có ký ức/skill riêng của bot chuyên môn |
| Kanban + "orchestrator" | Một profile chia việc thành thẻ (`kanban_create`, `kanban_link`), giao cho profile khác theo **mô tả năng lực**; có bộ tự chia việc (auto-decompose); khuyến nghị "orchestrator model mạnh, worker model rẻ"; quy tắc "orchestrator không tự làm" | Chỉ chạy qua bảng Kanban, không phải trong hội thoại thường |
| Bot Mode | `message_agent` cho bot nhắn bot, `@tên`, phòng nhóm có bot chính | Ngang hàng, không ai chịu trách nhiệm kết quả cuối |

**Tako có gì** (dự án trong máy, `~/orca/Tako`, MIT): **Commander** là agent đặc quyền duy nhất trong mọi hội thoại, có thuật toán "định tuyến trước": việc nhẹ thì tự làm; người dùng chỉ định bot nào thì theo; có bot chuyên môn khớp chắc chắn thì giao; còn lại tự làm. Ba lệnh chỉ Commander có:

- `dispatch_to` — giao việc và **nhận kết quả về** để làm tiếp/tổng hợp; nhiều lệnh chạy song song.
- `hand_off_to` — **chuyển giao hẳn**: câu trả lời của bot đích là câu trả lời cuối cho người dùng.
- `run_worker` — trợ lý **ẩn danh, riêng tư**, không lịch sử, không hiện ra với người dùng.

Kèm 3 cổng giới hạn đồng thời (toàn app 10, việc lồng 4, mỗi hội thoại 4), lịch tự động bắn tin vào Commander, và "Driver" tuỳ chọn tự đẩy backlog với rào chắn "thà làm ít còn hơn làm sai".

**Kết luận: nên làm**, vì giao diện đã đặt Aris ở trung tâm, anh chỉ cần nói với một bot (đặc biệt trên Telegram), và đây là chỗ aris **vượt Hermes**: gom ba mảnh rời thành một vai trò rõ ràng. Thiết kế:

| Khía cạnh | aris |
|---|---|
| Ai là Commander | Một cờ đặc quyền gắn cho **một bot** (mặc định Aris), chuyển được sang bot khác. Anh **vẫn chat thẳng** với bất kỳ bot nào — Commander là cửa vào mặc định, không phải cổng bắt buộc |
| Lệnh điều phối (chỉ Commander có) | `giao_viec` (= dispatch, nhận kết quả, song song) · `chuyen_giao` (= hand-off, bot đích trả lời anh) · `tro_ly_an` (= worker ẩn danh, dùng subagent của dsh) · `tao_the` (thẻ Kanban cho dự án dài) |
| Bot thường | Có `hoi_dong_doi` (nhắn hỏi bot khác như `message_agent` của Hermes) nhưng **không được tự giao việc tiếp** ⇒ không có vòng lặp giao qua giao lại |
| Định tuyến | Theo thứ tự: chỉ định của anh → việc nhẹ tự làm → bot có mô tả năng lực/skill khớp → tự làm. Mỗi quyết định ghi sự kiện `aris/dispatch` (ai, vì sao, độ tin cậy) |
| Giới hạn | Tối đa 4 việc song song mỗi hội thoại, 4 việc lồng toàn hệ, độ sâu 1 (bot được giao chỉ dùng được trợ lý ẩn danh), trần lượt và ngân sách theo việc |
| Duyệt | Bot được giao gặp hành động cần duyệt ⇒ đi qua Commander lên anh trong **một** hộp duyệt |
| Ký ức | Bot được giao học vào **ký ức riêng của nó** (như Hermes); Commander học **ai làm tốt việc gì** để định tuyến tốt dần (vòng học riêng cho định tuyến — Hermes và Tako đều không có) |
| Model | Gợi ý theo kinh nghiệm của Hermes: Commander dùng model mạnh, bot làm việc dùng model rẻ; chỉnh theo từng bot |
| Tự đẩy việc (Driver) | Tuỳ chọn, mặc định **tắt**: mỗi nhịp chọn một thẻ Kanban sẵn sàng, đánh thức Commander, rồi dừng |
| Trên dsh | `giao_viec` = đưa tin vào inbox phiên của bot đích qua `ctx.agents` và chờ `turn/end`; `tro_ly_an` = `subagent`; chuyển giao = định tuyến câu trả lời của bot đích ra kênh của anh |

Bảng tính năng bổ sung:

| # | Tính năng | Ưu tiên | UI |
|---|---|---|---|
| F12 | Vai trò Commander + 3 lệnh điều phối + định tuyến có ghi lý do | P0 | 🖥️ UI-20 |
| F13 | Giới hạn đồng thời, độ sâu, ngân sách theo việc được giao | P0 | 🖥️ UI-20 |
| F14 | Học định tuyến (ai làm tốt việc gì) | P1 | 🖥️ UI-20 |
| F15 | Driver tự đẩy backlog (mặc định tắt) | P2 | 🖥️ UI-05 |

## 9. Tính năng mới: Second Brain và đồ thị (đề xuất 23/10)

Hermes chỉ có **ký ức của agent** (thứ bot cần nhớ để làm việc). aris thêm **bộ não thứ hai của chủ nhân**: kho tri thức của anh (ghi chú, dự án, người, tài liệu), bot giúp ghi, sắp xếp, nối và tìm lại. Cả hai được nhìn bằng **đồ thị**.

| | Ký ức của bot | Second Brain |
|---|---|---|
| Của ai | Từng bot, tách riêng | Của anh, mọi bot được phép thì dùng chung |
| Kích thước | Nhỏ, có trần (lõi) + lưu trữ | Lớn, không giới hạn |
| Ai viết | Bot tự viết | Anh viết; bot ghi vào Hộp thư vào, đề xuất sắp xếp |
| Định dạng | Storage domain của dsh | **Thư mục Markdown thường** (mở bằng Obsidian được), có git |

### 9.1 Second Brain

| # | Tính năng | Ưu tiên | UI |
|---|---|---|---|
| K1 | **Ghi nhanh mọi nơi**: chuyển tiếp tin, link, ảnh, ghi âm từ Telegram/Lark/Zalo, hoặc gõ `/note` ⇒ vào **Hộp thư vào** | P1 | 🖥️ UI-17 |
| K2 | **Tự xử lý hộp thư vào** (chạy nền, model rẻ): chép lời ghi âm, tóm tắt link, gắn thẻ, đề xuất chỗ xếp theo PARA (Dự án / Lĩnh vực / Tài nguyên / Lưu trữ), trích thực thể (người, công ty, dự án, ngày hẹn ⇒ gợi ý tạo lịch/việc) | P1 | 🖥️ UI-17 |
| K3 | Ghi chú Markdown với `[[liên kết]]`, **liên kết ngược**, thẻ; mỗi ghi chú ghi nguồn gốc (từ tin nhắn nào, bot nào sửa) | P1 | 🖥️ UI-17 |
| K4 | **Ghi chú hằng ngày tự sinh**: tóm tắt ngày từ chat, routine, việc các bot đã làm | P1 | 🖥️ UI-17 |
| K5 | **Hỏi bộ não**: tìm lai (từ khoá + ngữ nghĩa), trả lời **có trích dẫn** về đúng ghi chú; bot dùng qua tool `brain_search`, `brain_capture` | P1 | 🖥️ UI-17 |
| K6 | **Gợi ý nối** ghi chú liên quan, phát hiện trùng, gom chủ đề — anh bấm "Nối / Bỏ qua" | P2 | 🖥️ UI-17 |
| K7 | **Ôn lại**: mỗi sáng gửi vài ghi chú cũ liên quan việc hôm nay; ghi chú đánh dấu "học" thì nhắc theo lịch giãn cách | P2 | 🖥️ UI-16 |
| K8 | Nhập từ Obsidian / Notion / Apple Notes; xuất toàn bộ | P2 | — |
| K9 | **Phân quyền theo bot**: mặc định mọi bot *đọc* toàn bộ, chỉ *ghi* vào Hộp thư vào; chỉnh được theo thư mục cho từng bot | P1 | 🖥️ UI-03 |

### 9.2 Đồ thị

| # | Đồ thị | Nút và cạnh | Dữ liệu lấy từ | Ưu tiên | UI |
|---|---|---|---|---|---|
| L1 | **Bản đồ đội bot** (trực tiếp + xem lại) | Nút: anh, các bot, phòng. Cạnh: giao việc, tin nhắn, đang chờ duyệt — cạnh chạy hiệu ứng khi đang trao đổi | Sự kiện `aris/trigger`, subagent, inbox giữa các bot trong log dsh | P1 | 🖥️ UI-19 |
| L2 | **Đồ thị tri thức** (toàn cục và quanh một ghi chú) | Nút: ghi chú, người, dự án, khái niệm, ký ức bot, phiên chat, skill. Cạnh: `[[liên kết]]`, thực thể được nhắc, nguồn gốc | Second Brain + trích thực thể + nguồn gốc ký ức | P1 | 🖥️ UI-18 |
| L3 | **Đồ thị học** — "vì sao aris biết điều này" | Phiên → ký ức/skill được tạo hoặc vá → lần dùng sau | Sự kiện `aris/reflection`, `aris/memory-op`, `aris/skill-applied` | P2 | 🖥️ UI-18 |
| L4 | **Đồ thị làm công cụ cho bot** | Tool `graph_neighbors(thực thể)` để bot lần theo quan hệ khi trả lời (GraphRAG nhẹ) | Chỉ mục cạnh của L2 | P2 | — |

So với **Memory Graph** của Hermes Desktop (nối ký ức với skill theo trùng từ vựng): L3 của aris nối theo **nguồn gốc thật** ghi trong log phiên, nên bấm vào cạnh là mở đúng chỗ trong hội thoại đã sinh ra ký ức đó.

**Lưu trữ**: ghi chú là file Markdown trong `brain/` (git); chỉ mục trong SQLite: FTS5 cho từ khoá, bảng vector cho ngữ nghĩa, bảng cạnh cho đồ thị. Việc trích thực thể và gợi ý nối chạy nền qua `ctx.jobs`, có trần token/ngày như vòng học.

## 10. Bảo mật, vận hành và hiệu năng

### 10.1 Bảo mật (ngang Hermes: 8 lớp phòng thủ)

| # | Tính năng | Ưu tiên | UI |
|---|---|---|---|
| G1 | Duyệt lệnh nguy hiểm: chế độ `hỏi / tự động / tắt`; **danh sách cấm cứng** không thể tắt (vd. `rm -rf /`); luật cấm tự đặt; danh sách cho phép vĩnh viễn; hết giờ ⇒ từ chối (dsh fail-closed) | P0 | 🖥️ UI-10 |
| G2 | **Gợi ý luật từ lịch sử duyệt** ("anh đã cho phép lệnh này 12 lần — thêm vào danh sách cho phép?") | P1 | 🖥️ UI-10 |
| G3 | An toàn ghi file: đường dẫn cấm (khoá SSH, `.env`…), giới hạn thư mục ghi | P0 | — |
| G4 | Cô lập container + **chặn mạng ra ngoài theo danh sách cho phép** (sandbox dsh không chặn mạng) | P1 | 🖥️ UI-12 |
| G5 | Kho bí mật: tích hợp Bitwarden / 1Password / lệnh lấy bí mật; MCP chỉ nhận biến môi trường được khai báo | P1 | 🖥️ UI-11 |
| G6 | Quét prompt injection trong tệp ngữ cảnh, nội dung web/email; nội dung ngoài không tự thành ký ức/skill | P0 | — |
| G7 | Che thông tin cá nhân (PII) trong log/telemetry | P1 | — |
| G8 | Nút dừng khẩn cấp: dừng mọi bot, mọi routine, mọi vòng học | P0 | 🖥️ UI-01 |

### 10.2 Vận hành

| # | Tính năng | Ưu tiên | UI |
|---|---|---|---|
| H1 | Chạy như dịch vụ (`launchd`/`systemd`), tự khởi động lại; theo dõi "còn sống" | P0 | — |
| H2 | Bảng điều khiển: trạng thái bot/kênh/routine, cảnh báo | P0 | 🖥️ UI-01 |
| H3 | Thống kê: token, chi phí theo bot / theo việc (chat, reflect, eval, cron), xu hướng | P1 | 🖥️ UI-13 |
| H4 | Nhật ký và xem lại phiên (phát lại từng bước) | P1 | 🖥️ UI-13 |
| H5 | Sao lưu/khôi phục; xuất/nhập một bot (chia sẻ bot cho người khác — "phân phối profile") | P1 | 🖥️ UI-03 |
| H6 | Chạy lô hàng nghìn prompt + xuất trajectory để huấn luyện/đánh giá | P2 | — |
| H7 | Nhập cấu hình/skill từ agent khác (Claude Code, Codex, Cursor) | P2 | — |

### 10.3 Hiệu năng — chỉ tiêu đo được

"Hiệu năng vượt trội" phải chứng minh bằng số. Đề xuất **bộ đo đối đầu** ở giai đoạn 7 của [kế hoạch triển khai](ke-hoach-trien-khai.md): cùng máy, **cùng model DeepSeek**, cùng 30 tác vụ mẫu, chạy Hermes và aris.

| Chỉ tiêu | Mốc của Hermes (theo tài liệu Hermes) | Mục tiêu aris |
|---|---|---|
| RAM tiến trình rảnh | ~300 MB / gateway | ≤ 200 MB cho tiến trình + ≤ 50 MB / bot thêm |
| Độ trễ thêm so với gọi API trực tiếp (tới token đầu) | chưa công bố | ≤ 150 ms |
| Tỉ lệ trúng prompt cache trong chat dài | cao với Claude (cache 1 giờ) | ≥ 80% token đầu vào trúng cache với DeepSeek |
| Ký ức mới có hiệu lực sau | phiên kế tiếp | **request kế tiếp** |
| Chi phí vòng học | ~30K token / lần, theo bộ đếm | ≤ 50% token của Hermes trên cùng bộ tác vụ (nhờ kích hoạt theo tín hiệu + cache) |
| Chất lượng skill | không kiểm thử trước | 100% skill qua eval trước khi bật; tỉ lệ rollback < 10% |
| Tìm phiên cũ | ~20 ms truy vấn FTS5 | ≤ 50 ms (FTS SQLite của dsh) |
| Hoàn thành tác vụ không cần can thiệp | đo trên bộ 30 tác vụ | ≥ Hermes |

## 11. Danh sách màn hình cần thiết kế giao diện

Khuyến nghị: dựng giao diện aris **như plugin của Web client dsh** (dsh cho phép thêm loại node chat, thẻ cài đặt, thanh bên, module client) thay vì làm ứng dụng riêng ⇒ thống nhất một chỗ, ít mã. Trên điện thoại, **Telegram/Zalo là giao diện chính**; web là nơi quản trị.

| Mã | Màn hình | Nội dung chính | Cần ở giai đoạn |
|---|---|---|---|
| **UI-01** | Bảng điều khiển tổng | Trạng thái bot/kênh/routine, chi phí hôm nay, cảnh báo, **nút dừng khẩn cấp** | 3 |
| **UI-02** | Danh sách bot (roster) | Avatar, tin mới nhất, chưa đọc, đang hoạt động, nhóm thư mục, tìm kiếm, ẩn | 3 |
| **UI-03** | Tạo / sửa bot | Form nhanh 3 ô + phần nâng cao (model, SOUL, skill/tool/MCP, quyền, giọng, avatar), nhân bản, xuất/nhập | 3 |
| **UI-04** | Phòng nhóm nhiều bot | Hội thoại chung, trả lời theo luồng, `@` nhắc tên, huy hiệu "cần anh", hoạt động từng bot, cài đặt phòng | 4 |
| **UI-05** | Bảng Kanban | Cột trạng thái, thẻ (người nhận là bot, phụ thuộc, bình luận, đính kèm), tiến độ worker | 4 |
| **UI-06** | Quản lý ký ức | Lõi + lưu trữ, thanh dung lượng, hàng chờ duyệt, lịch sử phiên bản, nguồn gốc | 1 |
| **UI-07** | Hồ sơ chủ nhân (theo từng bot) | Nhận định + độ tin cậy + bằng chứng, xác nhận/bác bỏ, sao chép hồ sơ sang bot khác | 2 |
| **UI-08** | Thư viện skill | Trạng thái vòng đời, thống kê dùng, diff phiên bản, kết quả eval, duyệt/ghim/rollback | 2 |
| **UI-09** | Lịch & routine | Danh sách theo bot, tạo bằng lời → xác nhận bản dịch lịch, lịch sử chạy, tạm dừng/chạy ngay | 3 |
| **UI-10** | Hộp duyệt chung | Duyệt hành động, ký ức, skill ở một nơi; gợi ý luật từ lịch sử duyệt | 2 |
| **UI-11** | Kênh, ghép đôi, kết nối | Token Telegram/Lark/Zalo, mã ghép đôi, danh sách cho phép, MCP, kho bí mật | 3 |
| **UI-12** | Model, ngân sách, mạng | Model chính/phụ theo việc, dự phòng, trần chi phí, danh sách mạng cho phép | 3 |
| **UI-13** | Thống kê & nhật ký | Token/chi phí theo bot và việc, xem lại phiên từng bước | 4 |
| **UI-14** | Theo dõi việc đang chạy | Goal (thanh tiến độ, lý do của giám khảo), loop (đếm ngược), agent con trực tiếp, checkpoint/rollback | 2 |
| **UI-15** | Màn hình của bot | Xem trực tiếp desktop ảo của bot, cầm lái/trả lái | 5 |
| **UI-16** | Mẫu tin nhắn trên Telegram/Zalo | Không phải màn hình, nhưng cần thiết kế: thẻ duyệt có nút, thẻ báo cáo routine, thẻ đề xuất skill, thông báo lỗi | 3 |
| **UI-17** | Second Brain | Cây ghi chú (Hộp thư vào, PARA), trình soạn Markdown, liên kết ngược, gợi ý nối, "Hỏi bộ não" có trích dẫn | 4 |
| **UI-18** | Đồ thị toàn cục | Đồ thị tri thức + đồ thị học, lọc theo loại/thời gian, bấm nút để mở ghi chú/phiên | 4 |
| **UI-19** | Bản đồ đội bot | Đồ thị trực tiếp các bot, cạnh giao việc chạy hiệu ứng, dải hoạt động theo giờ, ngăn chi tiết bot | 3 |
| **UI-20** | Commander | Bot nào được giao việc, giới hạn đồng thời/ngân sách, nhật ký quyết định định tuyến có lý do, điều Commander đã học | 3 |

### 11.1 Ba hướng giao diện đề xuất (23/10)

Bản phác trên canvas thiết kế (riêng tư, chỉ anh xem được): https://claude.ai/artifact/UQ8fU6qsJ4HHNK9LQcYqYV — mỗi bảng có nút đổi sáng/tối.

| Hướng | Ý tưởng | Hợp với |
|---|---|---|
| **A · Studio** | 3 cột: danh sách bot · chat · cột phải "Đội bot lúc này" (đồ thị nhỏ + dòng hoạt động). Giao việc, duyệt, ghi nhớ hiện thành thẻ ngay trong chat | Dùng hằng ngày; gọn, quen thuộc |
| **B · Bản đồ đội bot** | Đồ thị lớn ở giữa là trung tâm; bấm một bot để xem việc, tiến độ, ngân sách, skill; dải hoạt động theo giờ | Theo dõi, "trung tâm điều khiển" |
| **C · Phòng nhóm** | Hội thoại nhiều bot kiểu phòng chat: vòng 2/3, bot bỏ lượt, thẻ "cần anh quyết", thẻ Kanban sinh ra từ phòng | Việc cần nhiều bot bàn |

Ba hướng **không loại trừ nhau**: đề xuất lấy **A làm khung mặc định**, **B là một tab "Bản đồ"**, **C là màn hình của phòng nhóm**. Ngôn ngữ thiết kế chung: font Be Vietnam Pro (đủ dấu tiếng Việt) + JetBrains Mono cho số liệu; nền trung tính, một màu nhấn xanh; mỗi bot một màu nhận diện, dùng nhất quán ở avatar, đồ thị và dòng hoạt động.

### 11.2 Khung đã chốt (bản vẽ lại 23/10)

- **Thanh bên trái**, từ trên xuống: logo · tìm kiếm (⌘K) · thu gọn → nút **Cuộc chat mới** → 6 mục điều hướng (Chat, Bản đồ đội, Phòng nhóm, Second Brain, Routine, Kanban) → danh sách **Bot** (hoặc **Phòng** khi đang ở tab Phòng) → đáy: **Hộp duyệt** có số chờ, và dòng **Chủ nhân** (chi phí hôm nay, nút sáng/tối, Cài đặt). Bỏ 4 nút lưới ở đáy của bản nháp.
- **Khung chat**: hàng chip đính kèm ở trên; nút trái: đính kèm · `/` lệnh và skill · `@` gọi bot · ghi âm; nút phải: **viên chọn provider/model** (mở bảng: tìm kiếm, nhóm theo provider, nhãn nhanh/rẻ/suy luận, "Thêm provider…", mức suy luận, áp dụng cho chat này hay mặc định của bot) · Gửi. Khi bot đang làm: chọn *chèn vào việc đang làm / xếp hàng / dừng và làm mới* + nút Dừng.
- **Cột phải** "Đội bot lúc này" ẩn/hiện được, dẫn sang tab Bản đồ.

### 11.3 Màn chi tiết — 31 bảng, 7 nhóm (đã vẽ đủ 23/10)

Mỗi nhóm là một trang trên canvas thiết kế; thanh bên trái là **một thành phần dùng chung** (trang "Thành phần") nên mọi màn đồng bộ, bấm các mục điều hướng chuyển được giữa các màn khi xem thử.

| Nhóm | Bảng | Số | Trạng thái |
|---|---|---|---|
| **1 · Khung & Chat** | 1.1 Chat + bảng chọn model · 1.2 Khung chat 4 trạng thái (lệnh, @bot, đính kèm, bot đang bận) · 1.3 Bản đồ đội · 1.4 Phòng nhóm | 4 | Đã duyệt |
| **2 · Đội bot & Commander** | 2.1 Tạo bot nhanh · 2.2 Hồ sơ bot (tab Tính cách, Model, Skill & tool, Quyền & kênh) · 2.3 Hồ sơ chủ nhân theo bot · 2.4 Nhân bản / xuất bot · **2.5 Commander** (bot được giao việc, giới hạn, nhật ký định tuyến, điều Commander đã học) | 5 | Đã vẽ |
| **3 · Trí nhớ & tự tiến hoá** | 3.1 Ký ức (lõi / lưu trữ / chờ duyệt) · 3.2 Thư viện skill · 3.3 Chi tiết skill (diff + kết quả chạy lại phiên cũ) · 3.4 Hộp duyệt (có gợi ý luật) · 3.5 Việc đang chạy (mục tiêu, việc được giao, vòng lặp, điểm khôi phục) | 5 | Đã vẽ |
| **4 · Tự động** | 4.1 Danh sách routine · 4.2 Tạo routine bằng lời → xác nhận lịch · 4.3 Kanban (chia việc tự động/thủ công, Driver) | 3 | Đã vẽ |
| **5 · Second Brain & đồ thị** | 5.1 Ghi chú · 5.2 Hộp thư vào · 5.3 Đồ thị toàn cục · 5.4 Hỏi bộ não | 4 | Đã vẽ |
| **6 · Cài đặt & vận hành** | 6.1 Bảng điều khiển · 6.2 Provider & model (80+ provider, model theo việc, dự phòng) · 6.3 Kênh & ghép đôi · 6.4 Ngân sách, duyệt, mạng · 6.5 Thống kê & nhật ký · 6.6 Màn hình của bot | 6 | Đã vẽ |
| **7 · Di động** | 7.1 Thẻ duyệt trên Telegram · 7.2 Thẻ báo cáo routine · 7.3 Thẻ đề xuất ký ức/skill · 7.4 Chat web trên điện thoại | 4 | Đã vẽ |

### 11.4 Revamp nhẹ — giữ bố cục, đổi cảm giác (đề xuất 23/10)

Trang "Revamp nhẹ · đề xuất" trên canvas (bảng R1 ngôn ngữ thiết kế, R2 linh vật và đội hình, R3 màn Chat áp dụng thử). Ba điểm đột phá và năm điểm làm mịn:

| # | Thay đổi | Mục đích |
|---|---|---|
| **1** | **Dòng việc rẽ nhánh trong chat**: khi Commander giao việc, dòng thời gian của tin nhắn tách thành nhánh màu từng bot, hiện từng bước, duyệt ngay trên nhánh, rồi nhập lại ở bước tổng hợp | Thấy đội bot phối hợp mà không phải rời chat |
| **2** | **Linh vật phong cách Grokbot** (theo bộ `bs-grokbot-avatar` của anh, chỉ dùng cho bot): thân một khối màu phẳng, đúng hai mắt trắng, không miệng, không phụ kiện; mỗi bot một dáng trong bảng mẫu A/B — Aris sao bốn cánh (B8, xanh dương), Lâm hình thoi (B2, xanh ngọc), Mai giọt nước (A6, cam), Tín ngũ giác (B1, hổ phách), Dev vuông bo (A3, xanh lá), Hạ trái tim (B5, hồng). **6 dáng mắt theo trạng thái** + vòng trạng thái quanh linh vật; **lớn lên bằng vòng hào quang** (cấp 1–3); **thẻ bot** để xem và chia sẻ | Gắn bó cảm xúc, “bot của mình”; tiến bộ của vòng tự học hiện ra bằng mắt |
| **2b** | **Sơ đồ đội 3D động** ở cột phải màn Chat: Aris lơ lửng ở giữa, các bot xoay quanh trên vòng sàn nghiêng có bóng đổ, đường giao việc chạy hiệu ứng, kéo để xoay, rê chuột xem vai trò | Thấy cả đội “sống” và đang phối hợp |
| **2c** | **Đồ thị Second Brain 3D động** (5.3): ~70 nút trong 5 cụm, tự xoay chậm, kéo để xoay, cuộn để phóng to, nút gần sáng/to hơn nút xa, hạt sáng chạy dọc liên kết, bấm nút để xem chi tiết, lọc theo loại và thời gian. Nút dùng hình học (cầu, tam giác, thoi, vòng), **không dùng linh vật** | Khám phá tri thức như một không gian, không phải sơ đồ phẳng |
| **3** | **Ngữ pháp 5 trạng thái** dùng khắp nơi: Đang làm (vòng quay) · Chờ anh (nửa tròn, “thở”) · Xong (tích) · Vấp (tam giác) · Rảnh (nét đứt) | Liếc là hiểu; phân biệt được cả khi mù màu |
| 4 | **Đội hình** thay danh sách: Commander đứng đầu, bot xếp theo nhóm việc (Nghiên cứu, Vận hành, Sáng tạo, Kỹ thuật) | Thấy cấu trúc đội, không chỉ một danh sách tên |
| 5 | **Chữ**: tiêu đề Lexend, nội dung Be Vietnam Pro, số chữ đều (tabular) | Có cá tính, số liệu thẳng cột |
| 6 | **Icon** riêng lưới 20px nét 1,75: rỗng khi nghỉ, tô đầy nhẹ khi đang ở mục đó | Biết ngay mình đang ở đâu |
| 7 | **Công tắc nói rõ hệ quả** (câu “bật thì sao” dưới mỗi công tắc); ô tích bo tròn mang màu bot | Bớt sợ bấm nhầm |
| 8 | **Pill có dấu nhận diện** (logo provider + tên dễ hiểu “DeepSeek · Nhanh”, tên kỹ thuật khi rê chuột; skill là “con tem” có số phiên bản) và **nhãn nói như người** (“Cho Mai gửi”, “Aris còn nhớ thêm được khoảng 25 điều”, “3 việc đợi anh gật đầu”) | Dễ hiểu, thân thiện, có giọng riêng |

**Đã áp dụng cho cả 31 màn (23/10):** thanh bên dùng chung mới (icon tô đầy khi đang mở, “Đội hình” với linh vật và vòng trạng thái, chế độ danh sách phòng cho tab Phòng nhóm); bảng màu ấm mới cho nền sáng/tối; tiêu đề Lexend; mọi vòng tròn chữ cái của bot đổi thành linh vật; 1.1 Chat lấy theo bản R3 (dòng việc rẽ nhánh, sơ đồ đội 3D) và giữ bảng chọn provider/model; 1.3 Bản đồ đội thành 3D lớn, bấm bot để xem chi tiết; 2.1 Tạo bot có bộ chọn linh vật gợi ý theo vai.

**Thư viện linh vật (trang “Thành phần”):** 30 dáng = 6 đang dùng + 24 dáng mới — 10 dáng còn lại của bảng mẫu A/B (tròn, trứng, viên thuốc ngang, tam giác, mây, lục giác, hình thang, hạt đậu, cỏ bốn lá, bông hoa) và 14 dáng mới cùng phong cách (bát giác, viên thuốc đứng, mái vòm, khiên, chuông, trăng khuyết, sao năm cánh, quả lê, viên ngọc, chữ thập, bánh răng, bong bóng thoại, chiếc lá, vương miện), mỗi dáng có vai gợi ý.

## 12. Cách tham khảo Hermes (thay quy trình clean-room nghiêm ngặt)

Theo chỉ đạo ngày 23/10/2026, dự án **được đọc mã nguồn Hermes** (giấy phép MIT) để học thiết kế. Ràng buộc gốc vẫn giữ nguyên:

1. **Không sao chép, không import** mã, prompt hay test của Hermes; không có dependency Hermes. CI vẫn chặn.
2. Mọi thiết kế viết lại bằng lời của mình trong `docs/specs/` trước khi cài đặt; mã aris viết mới bằng TypeScript trên API dsh.
3. Nếu một thuật toán nhỏ buộc phải chuyển thể sát, ghi rõ nguồn và giữ thông báo bản quyền MIT của Hermes trong `THIRD_PARTY_NOTICES.md` (MIT cho phép, chỉ cần ghi công).
4. Ghi nhật ký đọc trong [clean-room-log.md](clean-room-log.md).

Lưu ý: vì đã đọc mã, aris **không còn là "clean-room" theo nghĩa pháp lý chặt**; với giấy phép MIT điều này không gây rủi ro, miễn là tuân thủ mục 3.

## 13. Lộ trình theo tính năng

> **Đã thay bằng [ke-hoach-trien-khai.md](ke-hoach-trien-khai.md)** (23/10): sắp lại để dùng được qua Telegram từ tuần thứ 3, thêm Commander, provider và Second Brain. Bảng dưới giữ lại để tham khảo.

| Giai đoạn | Tính năng | Màn hình cần design | Kết quả nghiệm thu |
|---|---|---|---|
| **0 — Khung** (1 tuần) | Profile `aris`, DeepSeek, A1, A6, A8, A17, A18, G3 | — | Chat được trên Web UI của dsh |
| **1 — Trí nhớ** (2 tuần) | B1, B3, B5, A2, A4, G6 | UI-06 | Nhớ sở thích qua phiên; ký ức mới có hiệu lực ngay request sau |
| **2 — Tự tiến hoá** (3 tuần) | C1, C2, C3, B4, D1, A10, G1 | UI-07, UI-08, UI-10, UI-14 | Việc khó → đề xuất skill có số liệu eval; lần sau ít bước hơn ≥ 30% |
| **3 — Sống ngoài đời + nhiều bot** (3 tuần) | E1, E5, E6, E10, E13, D4, F1, F2, F4, F11, L1, G8, H1, H2 | UI-01, UI-02, UI-03, UI-09, UI-11, UI-12, UI-16, UI-19 | 3 bot chạy cùng lúc trên Telegram; thấy chúng giao việc cho nhau trên bản đồ; routine 8h sáng tự gửi; `kill -9` không mất tin |
| **4 — Ngang Hermes + Second Brain** (5 tuần) | E2, E3, E7–E9, D2, D3, D5, F3, F5–F8, C4, C5, A3, A7, A9, A11, A12, A14, A15, G2, G4, G5, G7, H3–H5, K1–K5, K9, L2 | UI-04, UI-05, UI-13, UI-17, UI-18 | **Bộ đo đối đầu với Hermes** (mục 10.3) đạt mục tiêu; ghi âm Telegram → ghi chú có liên kết; "Hỏi bộ não" trả lời có trích dẫn |
| **5 — Mở rộng** | A13, A16, B2 nâng cao, B6, C6, D6, D8, E4, E11, F9, F10, H6, H7, K6–K8, L3, L4 | UI-15 | Theo nhu cầu |

**Không làm** (thấy trong Hermes nhưng không phục vụ mục tiêu): thú cưng/skin giao diện terminal, gói đăng ký và thanh toán của Nous Portal, các kênh ít dùng ở Việt Nam (Yuanbao, QQ, WeCom, LINE, SimpleX…), runtime riêng cho Codex.

## 14. Quyết định đã chốt

Ngày 23/10/2026, chủ dự án chốt:

1. **"grokbot"** = đội nhiều bot, mỗi bot một nhân vật/chuyên môn riêng (mục 8).
2. **Phạm vi**: trợ lý cá nhân, **một người dùng**; không làm lớp nhiều người dùng.
3. **Ký ức/hồ sơ người dùng**: tách riêng từng bot, **như Hermes**; tri thức dùng chung đặt ở Second Brain (mục 9).
4. **Thứ tự kênh**: Telegram → Lark → Zalo.
5. **Provider**: hỗ trợ **không giới hạn** nhà cung cấp model; tham khảo cách làm của repo VoxAgent trong máy (chưa đọc).
6. **Thêm tính năng**: Second Brain và đồ thị (mục 9).
7. **Giao diện**: chọn hướng A (giống Grokbot) làm khung, B là tab "Bản đồ đội", C là màn phòng nhóm; đã vẽ lại gọn hơn (mục 11.2).
8. **Bốn cách dùng** (chốt 23/10): aris phải chạy được cả **ngầm** lẫn **có giao diện**, **điều phối nền tảng và agent khác**, và **làm agent thành viên** của nền tảng khác (như Hermes trong Buzz Desktop). Chi tiết ở mục 15.

## 15. Bốn cách dùng aris và đánh giá ngang/vượt Hermes (23/10)

### 15.1 Hermes được dùng theo những cách nào (đọc từ tài liệu và mã Hermes)

| Cách dùng | Hermes làm thế nào |
|---|---|
| Chạy ngầm | Gateway là tiến trình thường trực (systemd/launchd); cron; `batch_runner` chạy hàng loạt; dùng như thư viện Python |
| Có giao diện | CLI/TUI, dashboard web, Bot Mode, ứng dụng desktop |
| **Điều phối nền tảng khác** | Gateway ~30 nền tảng nhắn tin; MCP client; webhook; skill điều khiển **Claude Code, Codex, OpenCode, chính Hermes** qua terminal/tiến trình; **A2A** gọi agent khác (`a2a_call`, `a2a_orchestrate` chia việc cho mọi peer có cùng năng lực) |
| **Làm agent thành viên** | **ACP** qua stdio (VS Code, Zed, JetBrains, **Buzz Desktop** tự phát hiện `hermes-acp` làm runtime); **API tương thích OpenAI** (`/v1/chat/completions`, `/v1/responses`, `/v1/runs` có SSE, khoá chống gửi lặp) cho Open WebUI, LobeChat…; **A2A server** (Agent Card, JSON-RPC, push webhook); **MCP server** (`hermes mcp serve`); JSON-RPC cho host tự viết |

Buzz (Block, dựa trên Nostr) là ví dụ rõ nhất: Hermes vào Buzz theo **ba đường**: ① Buzz Desktop tự khởi chạy Hermes qua ACP; ② cầu nối `buzz-acp` đưa một kênh Buzz vào Hermes chạy trên server; ③ Buzz là một nền tảng nhắn tin như Telegram trong gateway của Hermes (đủ ký ức, skill, duyệt, cron). Tài liệu Hermes cũng cảnh báo: Buzz Desktop **tự duyệt mọi quyền tool**, nên phải giữ agent ở chế độ "chỉ chủ nhân".

### 15.2 dsh đã có sẵn gì cho bốn cách dùng (đã kiểm chứng trong tài liệu dsh)

| dsh có | Ý nghĩa với aris |
|---|---|
| `dsh --profile headless "việc…"` (`--json` ra luồng sự kiện, `--session-id` để nối phiên) | Chạy ngầm một lệnh, dùng trong script, cron hệ thống, CI |
| `dsh --profile acp`: **phục vụ ACP qua stdio** | Làm agent thành viên trong IDE, Buzz Desktop, `buzz-acp` gần như không tốn công |
| `dsh --profile sdk`: **SDK JSON-RPC qua stdio** | Ứng dụng khác nhúng aris như một thư viện (tương đương "thư viện Python" của Hermes) |
| `dsh --profile web`: Web client | Giao diện chính |
| **`dsh-subagent-acp`**: chạy **một agent ACP khác làm bot con** (lệnh, tham số, chính sách quyền, môi trường đã lọc khoá) | Điều phối Claude Code, Codex, Gemini CLI, OpenCode, **cả Hermes** (`hermes acp`) bằng giao thức có cấu trúc, **hơn hẳn** cách Hermes điều khiển qua terminal |
| MCP client, webhook (thử nghiệm) | Gọi tool của nền tảng khác (GitHub, Notion, Lark…), nhận sự kiện ngoài |
| *Không có*: A2A, API tương thích OpenAI, MCP server | aris phải tự xây (mục 15.4) |

### 15.3 Kiến trúc "một lõi, nhiều mặt"

Mọi cách dùng là **cùng một aris**: cùng đội bot, ký ức, skill, Second Brain. Chỉ khác "mặt" mở ra bên ngoài.

```
                       ┌──────────────── aris-core (aris-bundle) ────────────────┐
  Telegram/Lark/Zalo ─►│ dispatch · bots · Commander · memory · reflect · skills │
  Web UI (aris web)  ─►│ brain/graph · cron · kanban · approvals · providers     │
  aris ask (headless)─►│                                                         │
  ACP (IDE, Buzz)    ─►│        daemon giữ quyền ghi trạng thái (một chủ)        │──► bot ngoài qua ACP
  API OpenAI / A2A   ─►│                                                         │   (Claude Code, Codex,
  MCP server         ─►└─────────────────────────────────────────────────────────┘    Gemini, Hermes…)
```

Quy tắc thiết kế:

1. **Daemon là chủ duy nhất của trạng thái.** Các mặt khác (ACP, headless, API) khi daemon đang chạy thì làm **khách mỏng** nối vào daemon qua socket cục bộ; khi daemon tắt thì tự chạy và giữ khoá thư mục dữ liệu. Không bao giờ có hai tiến trình cùng ghi một bot (Hermes cũng khoá cặp relay + danh tính vì lý do này).
2. **Mỗi mặt có preset quyền riêng.** Mặc định khi làm thành viên: chỉ chủ nhân, không có tool nguy hiểm, nội dung đến từ nền tảng là **dữ liệu không tin cậy**, không tự ghi ký ức, và nếu host tự duyệt quyền (như Buzz Desktop) thì aris **vẫn tự áp danh sách cấm của mình**.
3. **Chọn bot theo mặt.** `aris acp --bot lam` mở Lâm trong IDE; Agent Card A2A công bố từng bot như một kỹ năng; model trên API OpenAI là `aris/<bot>`.
4. **Mọi mặt đều ghi log phiên như nhau.** Việc làm từ Buzz hay IDE vẫn hiện trên bản đồ đội, vẫn được vòng học xét.

### 15.4 Việc bổ sung so với kế hoạch cũ

| # | Tính năng | Mặt | Cách làm | Giai đoạn |
|---|---|---|---|---|
| M1 | `aris ask "…"` chạy một việc rồi thoát; `--json`; `--bot` | Chạy ngầm | Profile `aris-headless` = headless của dsh + aris-bundle | 1 |
| M2 | Daemon thường trực + socket điều khiển cục bộ (`aris status`, `aris stop`, `aris send`) | Chạy ngầm | launchd/systemd; dsh `sdk` qua socket | 1 |
| M3 | **Bot ngoài**: thêm Claude Code, Codex, Gemini CLI, OpenCode, Hermes vào đội như một bot; Commander giao việc cho chúng như bot nội bộ; hiện trên bản đồ 3D | Điều phối | `dsh-subagent-acp`, mỗi bot ngoài một cấu hình; quyền mặc định `reject`, chuyển yêu cầu quyền về hộp duyệt của aris | 2 |
| M4 | Bộ kết nối nền tảng qua MCP (GitHub, Notion, Lark Docs, Google…) theo bot | Điều phối | MCP client của dsh, cấu hình theo scope bot | 2 |
| M5 | **A2A client**: gọi agent khác, chia việc cho các peer cùng năng lực | Điều phối | Package `aris-a2a` | 6 |
| M6 | **ACP server** đầy đủ: IDE, **Buzz Desktop**, `buzz-acp` | Thành viên | Profile `aris-acp` = acp của dsh + aris-bundle + preset "thành viên" | 6 (thử ở 0) |
| M7 | **API tương thích OpenAI** (`/v1/chat/completions`, `/v1/responses`, SSE, khoá chống gửi lặp, chọn bot qua `model`) | Thành viên | Package `aris-api` (HTTP + SSE) | 6 |
| M8 | **A2A server**: Agent Card, JSON-RPC, SSE, push có ký HMAC, token theo peer, chống vòng lặp, nhật ký kiểm toán | Thành viên | `aris-a2a` | 6 |
| M9 | **MCP server**: mở `brain_search`, `memory_search`, `giao_viec`… cho agent khác (Claude Desktop, Cursor…) | Thành viên | Package `aris-mcp-server` | 6 |
| M10 | Buzz như một kênh nhắn tin (ngang Telegram) | Thành viên + kênh | `aris-gateway-buzz` (Nostr) | 8 |

🖥️ **Cần vẽ thêm giao diện** (chưa có trên canvas): (a) loại **"bot ngoài"** trong 2.1 Tạo bot: chọn Claude Code/Codex/Gemini/OpenCode/Hermes, thư mục làm việc, ngân sách, chính sách quyền; (b) mục **"Mặt tích hợp"** trong 6.3: bật/tắt ACP, API, A2A, MCP, token, peer tin cậy, bot nào mở ra mặt nào, nhật ký truy cập.

### 15.5 Đánh giá thẳng thắn

**Sau khi bổ sung mục 15.4, aris ngang Hermes ở cả bốn cách dùng, và vượt ở 9 điểm:**

1. Ký ức có hiệu lực ở **request kế tiếp**, không phải phiên sau.
2. Có **tầng ký ức lưu trữ** sẵn.
3. Skill được **kiểm thử bằng phát lại** trước khi bật, có số liệu và quay lui.
4. Vòng học kích hoạt **theo tín hiệu** và có trần ngân sách.
5. **Commander** điều phối có cấu trúc (giao việc / chuyển giao / trợ lý ẩn, giới hạn độ sâu và ngân sách), nhìn được trên dòng việc rẽ nhánh và bản đồ 3D.
6. **Bot ngoài qua ACP**: điều khiển Claude Code, Codex, Hermes bằng giao thức có sự kiện, quyền và huỷ, chứ không đọc chữ trên terminal.
7. **Second Brain + đồ thị** tri thức của chủ nhân (Hermes chỉ có ký ức của agent).
8. **Zalo** và tiếng Việt mặc định.
9. **Log append-only phát lại được**: dễ gỡ lỗi, dễ kiểm toán, dễ khôi phục hơn ~70 module trạng thái SQLite của Hermes.

**Chỗ aris vẫn kém, và cách xử lý:**

| Chỗ kém | Thực tế | Cách xử lý |
|---|---|---|
| Độ rộng kênh | Hermes ~30 nền tảng, aris kế hoạch 4–5 | Ưu tiên theo nhu cầu thật; API OpenAI và A2A mở cửa cho mọi nền tảng còn lại |
| Độ rộng provider | Hermes ~85 provider dựng sẵn | Kiểu SDK "tương thích OpenAI" + URL + khoá phủ phần lớn; danh mục dựng sẵn tăng dần |
| Kho skill dựng sẵn | Hermes có hàng trăm skill | aris dùng chung **định dạng `SKILL.md`** nên anh cài được skill cộng đồng; aris không chép skill của Hermes vào repo |
| Độ trưởng thành | Hermes ~1 triệu dòng, nhiều năm sửa lỗi thực tế | Bám log append-only của dsh, kiểm thử "hỗn loạn" từ giai đoạn 1, chạy thật 14 ngày trước khi gọi là ổn |
| "Hiệu năng vượt trội" | **Hiện mới là chỉ tiêu** (mục 10.3), chưa có số đo | Bộ đo đối đầu ở giai đoạn 7 (30 tác vụ, cùng máy, cùng model); chưa đạt thì chưa tuyên bố |
