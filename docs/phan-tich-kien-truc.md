# aris-agent — Phân tích mục tiêu và giải pháp kiến trúc

> Viết ngày 23/10/2026 theo yêu cầu: "Đóng vai Senior AI Engineer… xây AI Agent tự trị cá nhân, bền bỉ, tuỳ biến từ con số 0; nhân thực thi là DeepSeek Harness; tái tạo kiểu clean-room các năng lực tự trị và tự tiến hoá của Hermes Agent; tuyệt đối không chép/import mã Hermes."
> Nguồn đã đọc: README và `docs/architecture.md`, `docs/subsystems/*` của DeepSeek Harness (MIT, TypeScript); **chỉ README công khai** của Hermes Agent (để biết *nó làm gì*), không mở mã nguồn.

## 1. Hiểu đúng mục tiêu

| Yêu cầu | Diễn giải kỹ thuật |
|---|---|
| Tự trị (autonomous) | Agent tự nhận việc (tin nhắn, lịch, webhook), tự lập kế hoạch, gọi công cụ, chạy nhiều bước, giao việc cho agent con, chỉ hỏi người khi vượt quyền. |
| Bền bỉ (persistent) | Sống liên tục như một dịch vụ (daemon) chứ không phải một lần chat; mọi thứ nó biết/làm được ghi lại và khôi phục được sau khi tắt máy. |
| Tuỳ biến | Đổi model, công cụ, tính cách, quyền hạn bằng cấu hình/plugin, không sửa nhân. |
| Tự tiến hoá | Vòng học khép kín: rút kinh nghiệm sau việc khó → ghi nhớ, tạo/cải tiến kỹ năng (skill), hiểu người dùng sâu dần theo thời gian. |
| Nhân = DeepSeek Harness | Dùng nguyên vòng lặp agent, nhật ký phiên append-only, công cụ, sandbox của dsh; aris chỉ là **plugin + profile** cắm vào, không fork nhân. |
| Clean-room với Hermes | Lấy Hermes làm *đặc tả hành vi*, tự thiết kế và tự viết toàn bộ bằng TypeScript trên các "seam" của dsh. |

## 2. DeepSeek Harness cho ta sẵn những gì

- **Cordis — mọi thứ là plugin**: model adapter, tool registry, session log, cả agent loop đều là plugin, thay được bằng cấu hình; đăng ký là "effect" tự gỡ khi plugin unload.
- **Profile + bundle**: một `dsh` đang chạy là cây plugin ghép từ các lớp (bundle `dsh-base` → bundle của mình → `cordis.patch.yml`). ⇒ aris = **một profile `aris`** xếp `dsh-base` + `aris-bundle`.
- **Session log append-only** (`ctx.sessions`): nguồn sự thật duy nhất; quy tắc *"model thấy gì thì phải có trong log"*; fork/resume/transcript/telemetry đều suy ra từ log; có migration định dạng theo thế hệ.
- **Ba loại sự kiện**: session events (bền), `agent/*` (can thiệp việc đang chạy: `agent/pre-step`, `agent/request`, `agent/turn-stopping`…), capability events (`fs/*`, `tools/*`).
- **Capability seam** (Service Definition / Provider / Consumer): thêm năng lực = thiết kế đủ 3 vai.
- Hệ con có sẵn liên quan trực tiếp: `skills` (registry nhiều provider), `session-query` (truy vấn toàn bộ phiên, **SQLite full-text**), `schedule` (nhắc việc bền, giao về đúng phiên), `goal` (mục tiêu trong phiên), `jobs` (việc nền), `subagent` + `agent-team`, `compaction`, `webhook` (webhook ngoài → tạo phiên mới), `mcp`, `sandbox` (macOS Seatbelt, Linux bwrap/Landlock), `approval`, `permission-presets`, `ssh`, `workflow`, `plan`, `otel`.
- Cách chạy: `npx @deepseek-ai/dsh web` (Web UI), `headless`, `sdk` (JSON-RPC), `acp`. Đang **developer preview — sẽ có thay đổi phá vỡ tương thích**.

## 3. Đối chiếu năng lực Hermes → dsh → aris phải xây

| Năng lực (theo README Hermes) | dsh có sẵn | aris xây |
|---|---|---|
| Vòng lặp agent, công cụ, nhiều model | ✅ agent-loop, tools, llm adapters | Chỉ cấu hình (DeepSeek mặc định, thêm adapter khác nếu cần) |
| Chạy lệnh an toàn (local/SSH/container) | ✅ sandbox, shell, ssh | Provider Docker sau (giai đoạn 4) |
| Agent con, làm song song | ✅ subagent, agent-team | Preset agent riêng cho aris |
| **Bộ nhớ do agent tự quản + "nhắc" tự lưu** | ❌ | `aris-memory` |
| **Tìm lại hội thoại cũ + tóm tắt** | ⚠️ session-query (FTS) có, chưa có tool tóm tắt | `aris-recall` |
| **Mô hình hoá người dùng xuyên phiên** | ❌ | `aris-user-model` |
| **Tự tạo skill sau việc khó, skill tự cải tiến** | ⚠️ skills registry có, chưa có vòng tạo/cải tiến | `aris-skill-forge` |
| **Vòng học khép kín** (điều phối các mục trên) | ❌ | `aris-reflect` |
| Lịch tự động (cron) giao kết quả ra kênh | ⚠️ schedule chỉ nhắc về phiên cũ | `aris-cron` (tạo phiên mới + giao ra kênh) |
| Sống trên Telegram/Zalo/Lark… (gateway) | ⚠️ webhook vào có, chưa có kênh ra | `aris-gateway-*` |
| Xuất "trajectory" để huấn luyện | ✅ log JSONL | Script xuất |

## 4. Kiến trúc đề xuất

```
                 ┌──────────── Kênh vào / ra ─────────────┐
 Telegram ─┐     │ aris-gateway-telegram / -zalo / -lark  │
 Zalo OA  ─┼──▶  │ (webhook provider adapter + outbound)  │──┐
 Lark     ─┘     └────────────────────────────────────────┘  │ tạo/tiếp tục phiên
 Cron ──────▶  aris-cron ────────────────────────────────────┤ (ctx.webhookRuntime,
                                                              │  ctx.agents)
                      ┌──────── DeepSeek Harness (nhân) ──────▼───────────┐
                      │ agent-loop · tools · sandbox · approval · llm      │
                      │ session log (append-only) · session-query (FTS)    │
                      │ skills · subagent · jobs · schedule · compaction   │
                      └──────▲───────────────▲──────────────▲──────────────┘
                             │ sự kiện       │ prompt        │ tools
          ┌──────────────────┴───┐  ┌────────┴─────────┐  ┌──┴───────────────┐
          │ aris-reflect (vòng   │  │ aris-user-model  │  │ aris-memory      │
          │ học, chạy nền sau    │──▶ (hồ sơ người     │  │ aris-recall      │
          │ turn/end)            │  │  dùng → prompt)  │  │ aris-skill-forge │
          └──────────────────────┘  └──────────────────┘  └──────────────────┘
                 Dữ liệu aris: $DSH_HOME/profiles/aris + storage domains riêng
```

Nguyên tắc xuyên suốt:
1. **Không sửa nhân** — mọi thứ là plugin gắn vào extension point đã được tài liệu hoá (bảng "Where new behavior goes" của dsh). Nâng cấp dsh = đổi phiên bản, chạy test hợp đồng.
2. **Model thấy gì thì log có nấy** — ký ức, hồ sơ người dùng, skill được nạp vào ngữ cảnh đều đi qua system-prompt section hoặc `agent.inject()` và có session event tương ứng ⇒ mọi quyết định của agent tái hiện được.
3. **Mọi thay đổi do agent tự tạo đều có phiên bản và quay lui được** (bộ nhớ, skill, hồ sơ).

### 4.1 `aris-memory` — bộ nhớ do agent tự quản
- Seam mới `ctx.memory` (Definition) + provider SQLite (mặc định) hoặc Markdown files.
- Mục nhớ: `{ id, text, kind: fact|preference|procedure-hint, source: sessionId+seq, trust: user|agent|external, createdAt, revision }`.
- Tool cho model: `memory_save`, `memory_update`, `memory_forget`, `memory_list`.
- Nạp vào prompt qua `ctx.systemPrompt` (section "Điều aris nhớ về anh"), có ngân sách token, chọn theo độ liên quan.
- **"Nhắc tự lưu" (nudge)**: listener `agent/turn-stopping` — nếu turn dài/nhiều tool mà chưa lưu gì, `agent.inject()` một nhắc nhở ngắn ở turn sau.
- Chống "đầu độc bộ nhớ": nội dung đến từ web/email (trust=external) không tự thành ký ức; cần agent dẫn nguồn và mức tin cậy.

### 4.2 `aris-recall` — nhớ lại các phiên cũ
- Dựa trên `session-query` (SQLite FTS) có sẵn: tool `recall_search(query, since?)` trả các đoạn khớp, rồi một lời gọi model rẻ tóm tắt ⇒ chỉ phần tóm tắt vào ngữ cảnh (tiết kiệm token).

### 4.3 `aris-user-model` — hiểu người dùng sâu dần
- Hồ sơ gồm các "giả thuyết" có bằng chứng: `{ claim, confidence, evidence[] (session/seq), updatedAt }` (vd. "anh Tầu thích trả lời tiếng Việt có dấu, ngắn gọn" — 0.9).
- Cập nhật bởi `aris-reflect` (không phải trong lúc chat) ⇒ không làm chậm hội thoại.
- Phần tin cậy cao vào system prompt; phần thấp chỉ để tham khảo khi cần.

### 4.4 `aris-skill-forge` — tự tạo và tự cải tiến kỹ năng
- Skill = thư mục chuẩn (SKILL.md + scripts), đăng ký qua provider `ctx.skills` riêng `aris-skills` (thư mục `skills/` có git).
- **Tạo**: sau một turn "khó" (nhiều bước, nhiều tool, có sửa sai), reflect đề xuất skill → viết bản nháp → chạy thử trên tình huống vừa xong trong sandbox → lưu dạng *đề xuất*.
- **Cải tiến**: khi skill được dùng mà người dùng sửa/phàn nàn hoặc chạy lỗi ⇒ tạo bản vá (diff) + lý do.
- **Cổng an toàn**: mỗi skill có bộ thử nhỏ (eval); bản mới chỉ được bật khi qua thử; mặc định **người duyệt** (qua chat: "Duyệt skill X?"), có thể nới thành tự bật cho skill rủi ro thấp. Mọi phiên bản commit git ⇒ quay lui một lệnh.

### 4.5 `aris-reflect` — vòng học khép kín (bộ não "tự tiến hoá")
- Lắng nghe `turn/end` (session event) → xếp việc nền qua `ctx.jobs` (không chặn hội thoại).
- Đọc log của turn → dùng model rẻ trả về JSON có cấu trúc: `{ memories[], userModelUpdates[], skillProposals[], skillPatches[] }`.
- Áp dụng theo chính sách (tự động / cần duyệt), ghi session event `aris/reflection` để truy vết.
- Ngân sách: tối đa N lần reflect/giờ, bỏ qua turn ngắn; có "công tắc tắt" toàn cục.

### 4.6 `aris-cron` — tự động theo lịch
- Lịch dạng tự nhiên ("8h sáng mỗi ngày tóm tắt email") → bản ghi bền (storage domain riêng) → đến giờ tạo **phiên mới** với preset/permission định sẵn (cùng đường `webhookRuntime`), kết quả giao ra kênh đã chọn.

### 4.7 `aris-gateway-*` — sống trên Telegram / Zalo / Lark
- Vào: provider adapter cho `ctx.webhookRuntime` (xác thực chữ ký từng nền tảng) + rule ánh xạ *người/nhóm chat → phiên đang mở* (tiếp tục hội thoại) hoặc tạo phiên mới.
- Ra: dịch vụ `ctx.channels` (seam mới) để agent/cron gửi tin, file, tin thoại; tôn trọng giới hạn từng nền tảng.
- Bảo mật: chỉ chủ nhân được ghép đôi (pairing code) mới ra lệnh; lệnh nguy hiểm luôn qua `approval`.

## 5. Quy trình clean-room (bắt buộc)
1. Chỉ đọc **tài liệu công khai mô tả hành vi** của Hermes (README, trang docs người dùng). Không mở thư mục mã nguồn, không đọc issue/PR có code.
2. Viết lại thành **đặc tả hành vi bằng lời của mình** (`docs/specs/*.md`) — đây là đầu vào duy nhất cho phần cài đặt.
3. Toàn bộ mã aris viết mới bằng TypeScript trên API của dsh; không có dependency `hermes*`; CI chặn import/tên gói Hermes và kiểm tra giấy phép dependency.
4. Ghi nhật ký nguồn tham khảo (`docs/clean-room-log.md`): đọc gì, ngày nào, ai đọc.

## 6. Rủi ro và cách giảm
| Rủi ro | Giảm thiểu |
|---|---|
| dsh còn developer preview, đổi API | Ghim phiên bản; chỉ dùng seam công khai; lớp adapter mỏng; test hợp đồng chạy mỗi lần nâng cấp |
| Agent tự sửa skill làm hỏng hành vi | Eval bắt buộc, duyệt người, git versioning, rollback |
| Bộ nhớ bị nhiễm (prompt injection từ web/email) | Mức tin cậy theo nguồn, không tự ghi ký ức từ nội dung ngoài, có màn xem/xoá ký ức |
| Hành động nguy hiểm khi tự chạy (xoá file, gửi tin, tiêu tiền) | sandbox `workspace-write`, permission preset chặt cho phiên cron/gateway, approval qua chat |
| Chi phí model khi chạy nền | Model rẻ cho reflect/recall; ngân sách theo giờ/ngày; token-meter + otel |
| Mất dữ liệu | Dữ liệu aris trong `$DSH_HOME/profiles/aris`, sao lưu định kỳ |

## 7. Lộ trình
| Giai đoạn | Nội dung | Kết quả kiểm chứng |
|---|---|---|
| 0 — Khung (≈1 tuần) | Monorepo pnpm/TS, profile `aris` (dsh-base + aris-bundle rỗng), chạy `dsh --profile aris web` với DeepSeek | Chat được, log phiên ghi ra đĩa, sandbox hoạt động |
| 1 — Trí nhớ | aris-memory, aris-recall, aris-user-model (cập nhật thủ công trước) | Hỏi lại chuyện tuần trước trả lời đúng; nhớ sở thích qua phiên mới |
| 2 — Tự tiến hoá | aris-reflect + aris-skill-forge (duyệt người) | Sau 1 việc khó → có đề xuất skill; lần sau dùng skill nhanh hơn |
| 3 — Sống ngoài đời | aris-gateway (Telegram/Lark/Zalo), aris-cron, chạy daemon trên server | Nhắn từ điện thoại; báo cáo 8h sáng tự gửi |
| 4 — Cứng cáp | Quyền hạn, ngân sách, otel, sao lưu, provider Docker | Chạy 2 tuần liên tục không cần can thiệp |

## 8. Cấu trúc thư mục dự kiến
```
aris-agent/
  profiles/aris/            # package.json (dsh.profile) + cordis.patch.yml
  packages/
    aris-bundle/            # bundle ghép mọi plugin aris
    aris-memory/            # ctx.memory + provider sqlite + tools
    aris-recall/
    aris-user-model/
    aris-reflect/
    aris-skill-forge/
    aris-cron/
    aris-channels/          # seam ctx.channels
    aris-gateway-telegram/  aris-gateway-lark/  aris-gateway-zalo/
  skills/                   # skill do aris tạo (git riêng)
  docs/specs/  docs/clean-room-log.md
```

## 9. Cần anh Tầu quyết
1. **Model chính**: a) DeepSeek (rẻ, đúng hệ sinh thái dsh — đề xuất), b) Claude, c) cả hai (DeepSeek chạy nền, Claude cho việc khó).
2. **Kênh nói chuyện đầu tiên**: a) Telegram (dễ nhất), b) Lark (đội đang dùng), c) Zalo OA.
3. **Chạy ở đâu**: a) máy Mac khi phát triển rồi chuyển lên server Oracle (đề xuất), b) server ngay từ đầu.
4. **Mức tự trị khi sửa skill**: a) luôn hỏi anh duyệt (đề xuất ban đầu), b) tự bật skill rủi ro thấp đã qua thử.
