# aris-agent — Phân tích mục tiêu và giải pháp kiến trúc (bản 2)

> **Bản 2 — 23/10/2026.** Hoàn thiện từ bản 1 (commit `5453ef8`). Mọi API của DeepSeek Harness nhắc tới dưới đây đã được **đối chiếu với tài liệu gốc** tại commit `687f282` (17/10/2026) của `deepseek-ai/deepseek-harness`: `docs/architecture.md` và `docs/subsystems/*`. Với Hermes Agent, bản 2 chỉ đọc README công khai; **từ 23/10/2026 dự án được phép đọc cả mã nguồn Hermes (MIT) để học thiết kế**, vẫn không sao chép/không import (xem mục 10 và [clean-room-log.md](clean-room-log.md)).
>
> **Đặc tả tính năng chi tiết** (ngang Hermes, đội nhiều bot, danh sách màn hình cần thiết kế): [tinh-nang-aris.md](tinh-nang-aris.md).
>
> Phần phác thảo TypeScript trong tài liệu là **thiết kế riêng của aris**, viết mới; tên `ctx.*` là seam công khai của dsh, còn chữ ký hàm cụ thể của dsh phải tra lại README từng package khi cài đặt.

**Thay đổi chính so với bản 1**

1. Phát hiện 5 giới hạn của dsh làm thay đổi thiết kế (mục 3.2) — quan trọng nhất: webhook runtime *không* có hàng đợi/chống trùng/tiếp tục phiên, và sandbox *không* kiểm soát mạng.
2. Thêm thành phần **`aris-dispatch`** — cửa vào duy nhất cho mọi tác nhân kích hoạt (tin nhắn, lịch, webhook), thay vì để gateway và cron tự tạo phiên.
3. Bộ nhớ chia **2 tầng** và đặt đúng chỗ trong prompt để **không phá prompt cache** của DeepSeek (mục 6.3).
4. Đánh giá skill bằng **phát lại phiên cũ** (fork phiên tại ranh giới turn) — tận dụng log append-only của dsh (mục 6.6).
5. Mô hình bảo mật đầy đủ: mức tin cậy theo nguồn, preset quyền theo loại phiên, duyệt qua chat, chặn mạng ra ngoài khi chạy không giám sát (mục 7).
6. Lộ trình có tiêu chí nghiệm thu đo được và danh sách việc Sprint 0 cụ thể.

---

## 1. Mục tiêu và tiêu chí thành công

| Yêu cầu | Diễn giải kỹ thuật | Đo bằng gì |
|---|---|---|
| **Tự trị** | Tự nhận việc (tin nhắn, lịch, webhook), tự lập kế hoạch, gọi công cụ, chạy nhiều bước, giao việc cho agent con; chỉ hỏi người khi vượt quyền. | % việc hoàn thành không cần can thiệp; số lần hỏi duyệt / việc |
| **Bền bỉ** | Chạy như dịch vụ nền 24/7; tắt máy bật lại không mất gì; nhớ xuyên phiên. | Uptime; khôi phục sau `kill -9` không mất tin nhắn; trả lời đúng câu hỏi về chuyện cũ |
| **Tuỳ biến** | Đổi model, công cụ, tính cách, quyền hạn, kênh bằng cấu hình/plugin, không sửa nhân. | Đổi model/kênh chỉ bằng `cordis.patch.yml` |
| **Tự tiến hoá** | Vòng học khép kín: rút kinh nghiệm → ghi nhớ, tạo/vá skill, hiểu người dùng sâu dần. | Số bước/chi phí cho cùng loại việc giảm theo thời gian; tỉ lệ skill được duyệt; tỉ lệ skill bị rollback |
| **Nhân = DeepSeek Harness** | Dùng nguyên vòng lặp agent, log phiên append-only, công cụ, sandbox của dsh; aris = **profile + bundle plugin**, không fork nhân. | `git diff` với dsh gốc = 0; nâng cấp dsh chỉ đổi số phiên bản |
| **Độc lập với Hermes** | Hermes là nguồn học thiết kế (đọc được cả mã nguồn); toàn bộ mã aris tự viết mới bằng TypeScript, không sao chép/không import. | CI không thấy dependency/tên gói Hermes; nhật ký tham khảo đầy đủ |

## 2. Kết luận chính (đọc nhanh)

1. **Khả thi và hợp lý**: dsh đã có ~60% "phần thân" của một agent bền bỉ (vòng lặp, log, sandbox, duyệt, skill registry, tìm kiếm phiên FTS, lịch, việc nền, agent con, mục tiêu dài hạn). Phần aris phải viết là **"phần não"**: bộ nhớ, mô hình người dùng, vòng học, lò rèn skill, và **lớp điều phối kênh**.
2. **Không fork dsh.** Cordis cho phép gắn plugin vào các extension point đã được tài liệu hoá; aris là một profile `aris` xếp lớp `dsh-base` + `dsh-web-app` + `aris-bundle`.
3. **Nguyên tắc vàng của dsh — "model thấy gì thì log có nấy"** — chính là nền móng cho tự tiến hoá an toàn: mọi ký ức, skill, hồ sơ được nạp vào ngữ cảnh đều truy vết được, và mọi phiên cũ có thể **phát lại** để kiểm thử skill mới.
4. **Phải tự xây `aris-dispatch`** vì webhook runtime của dsh là thử nghiệm, chỉ tạo phiên mới, không hàng đợi, không chống trùng, không trả kết quả — không đủ cho chat liên tục qua Telegram/Lark.
5. **Sandbox của dsh chỉ chặn ghi file, không chặn mạng** ⇒ khi chạy không giám sát (cron, tin nhắn ngoài), daemon phải nằm trong container/VM có **danh sách cho phép mạng ra (egress allowlist)**.
6. **Mọi thứ agent tự tạo đều có phiên bản, qua kiểm thử, và quay lui được**; mặc định người duyệt qua chat; nới dần theo dữ liệu.

## 3. DeepSeek Harness — đã kiểm chứng

### 3.1 Những gì dùng nguyên

| Năng lực dsh | Seam / sự kiện | aris dùng để |
|---|---|---|
| Plugin hoá toàn bộ (Cordis 4.0.0-rc.7, vendored dưới `@deepseek-ai/cordis`) | effect tự gỡ khi unload | Mọi thành phần aris là plugin |
| Profile + bundle; `package.json` trường `dsh.profile` / `dsh.bundle`; `cordis.patch.yml` | `dsh --profile aris --dump-config` | Đóng gói aris, cấu hình theo máy |
| Log phiên append-only `SessionEvent`, JSONL có thế hệ + migration | `ctx.sessions`, `session/event` | Nguồn sự thật; mở rộng `SessionEventMap` với sự kiện `aris/*` |
| Vòng lặp turn/step | `agent/pre-step`, `agent/request`, `agent/turn-stopping`, `turn/end` | Gắn nhắc nhở, ghi nhận tín hiệu học |
| Thêm ngữ cảnh cho model | `agent.inject()`; `PromptSection` / `PromptContext` qua `ctx.systemPrompt` | Nạp ký ức, hồ sơ, skill |
| Tool registry có pipeline bảo vệ | `ctx.tools`, `tools/pre-execute` … | Tool `memory_*`, `recall_*`, `skill_*`, `channel_send` |
| Skill registry nhiều provider; provider local quét thư mục + **tự theo dõi thay đổi** (chokidar); định dạng `<tên>/SKILL.md` | `ctx.skills`, `Config.customSkillDirs` | Skill do aris tạo tự hiện lên, không cần khởi động lại |
| Tìm kiếm toàn bộ phiên (SQLite full-text) | `ctx.sessionQuery` (`searchSessions`, `searchEvents`) | `aris-recall` |
| Lưu trữ ngoài log: domain có version + schema zod | `ctx.storage`, `ctx.storageDomain`, `domain/changed` | Ký ức, hồ sơ, lịch, bảng ánh xạ kênh |
| Việc nền | `ctx.jobs` | Chạy reflect/curate không chặn hội thoại |
| Mục tiêu dài hạn trong phiên (event-sourced, có revision) | `ctx.goals` | Việc tự trị kéo dài nhiều turn |
| Agent con / đội agent | `subagent` (`agentPreset`, `depthLimit`), `ctx.agentTeams` (thử nghiệm) | Làm song song, cô lập việc rủi ro |
| Chạy chương trình gọi tool (PTC), workflow do model viết | `ctx.ptcRuntime`, `ctx.workflowEngine` | Tương đương "gộp nhiều bước thành một" |
| Nén ngữ cảnh | `ctx.compaction`, sự kiện `compaction/start|summary|end` | Kích hoạt "lưu ký ức trước khi nén" |
| Sandbox tiến trình (macOS Seatbelt, Linux bwrap/Landlock) | `ctx.sandbox`, mode `read-only` / `workspace-write` / `danger-full-access` | Chạy lệnh an toàn |
| Duyệt hành động, **fail-closed** | `ctx.approval`, waterfall `approval/request`; kết quả `allowed-once|rejected|cancelled|unavailable` | Duyệt qua Telegram/Lark |
| Preset quyền = sandbox + approval | `ctx.permissionPresets` | Preset riêng cho từng loại phiên |
| Fork phiên tại ranh giới turn | `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })` | **Phát lại để đánh giá skill** |
| Model adapter | `ctx.llm` | DeepSeek mặc định, thêm adapter khác |
| Quan sát | `otel`, `token-meter` | Ngân sách chi phí, dashboard |

### 3.2 Giới hạn phát hiện khi đọc tài liệu gốc (ảnh hưởng thiết kế)

| # | Giới hạn | Hệ quả cho aris |
|---|---|---|
| G1 | `ctx.webhookRuntime` nằm trong `packages/experimental`; **không hàng đợi, không retry, không chống trùng, không trạng thái, không trả kết quả**; mỗi rule chỉ có thể **tạo phiên gốc mới**. | Không dùng cho chat. Viết `aris-dispatch` riêng trên `ctx.agents` để *tiếp tục* phiên, chống trùng theo id tin nhắn, xếp hàng theo cuộc hội thoại. Webhook runtime chỉ dùng cho sự kiện một-lần (GitHub…). |
| G2 | `schedule` chỉ giao nhắc nhở **về đúng phiên gốc**. | `aris-cron` tự quản lịch, mỗi lần chạy tạo phiên mới qua `aris-dispatch` và giao kết quả ra kênh. Vẫn dùng `schedule` cho kiểu "nhắc tôi trong phiên này". |
| G3 | `SandboxMode` **chỉ quản lý hiệu ứng file**; mạng và tiến trình nằm ngoài. | Chế độ không giám sát phải chạy trong container/VM có egress allowlist; tool mạng đi qua proxy kiểm soát. |
| G4 | Thay đổi `PromptSection` thay thế `system/message` ở đầu lịch sử ⇒ **mất prompt cache**; `PromptContext` là bản "cache-safe", chỉ ghi lại sau lịch sử khi đổi. | Phần ổn định (tính cách, ký ức lõi, hồ sơ tin cậy cao) → `PromptSection`, **đóng băng theo request series**; phần biến động (ký ức liên quan câu hỏi, ngày giờ, trạng thái kênh) → `PromptContext`. |
| G5 | dsh là **developer preview** ("sẽ có thay đổi phá vỡ tương thích"); Cordis còn rc. | Ghim phiên bản chính xác; chỉ dùng seam công khai; lớp adapter mỏng `aris-compat`; test hợp đồng chạy mỗi lần nâng cấp. |

Ngoài ra: dsh có hệ con **`extensions`** cho phép agent tự định nghĩa và chạy gói Cordis mới — đây là đòn bẩy "tự viết tool cho mình", nhưng rủi ro cao ⇒ để giai đoạn 5, luôn cần duyệt.

## 4. Đối chiếu năng lực Hermes → dsh → aris

Danh sách năng lực lấy từ README công khai của Hermes (diễn đạt lại).

| Năng lực (theo README Hermes) | dsh có sẵn | aris xây | Giai đoạn |
|---|---|---|---|
| Vòng lặp agent, nhiều nhà cung cấp model, đổi bằng lệnh | ✅ agent-loop, `ctx.llm` | Cấu hình; lệnh `/model` qua `ctx.commands` | 0 |
| Chạy lệnh local / SSH / container | ✅ sandbox, shell, ssh (⚠️ chưa có container) | Provider shell/fs trỏ vào container | 4 |
| Agent con, làm song song | ✅ subagent, agent-team | Preset agent riêng (researcher, coder, ops) | 2 |
| Gộp nhiều bước bằng script gọi tool | ✅ ptc-runtime, workflow | Chỉ bật & cấp quyền | 0 |
| **Bộ nhớ bền do agent tự quản + tự nhắc lưu** | ❌ | `aris-memory` | 1 |
| **Tìm lại hội thoại cũ + tóm tắt bằng LLM** | ⚠️ FTS có, chưa có tóm tắt | `aris-recall` | 1 |
| **Mô hình người dùng sâu dần xuyên phiên** | ❌ | `aris-user-model` (tự thiết kế, không dùng dịch vụ ngoài) | 1–2 |
| **Tự tạo skill sau việc khó, tự tinh chỉnh khi dùng** | ⚠️ registry có | `aris-skill-forge` | 2 |
| **Vòng học khép kín** | ❌ | `aris-reflect` | 2 |
| Cron bằng ngôn ngữ tự nhiên, giao kết quả ra kênh | ⚠️ chỉ nhắc về phiên cũ | `aris-cron` | 3 |
| Một gateway cho nhiều nền tảng, liên tục xuyên nền tảng, ghi âm → chữ | ⚠️ chỉ webhook vào | `aris-dispatch` + `aris-channels` + `aris-gateway-*` | 3 |
| Xuất trajectory để huấn luyện | ✅ log JSONL | Script xuất + lọc dữ liệu nhạy cảm | 4 |

Định dạng skill: dsh dùng `<tên>/SKILL.md` (tên kebab-case), trùng với chuẩn mở agentskills.io mà README Hermes nhắc tới ⇒ skill aris tạo ra dùng được ở công cụ khác.

## 5. Kiến trúc tổng thể

```
 Telegram ─┐   ┌──────────── aris-gateway-* ────────────┐
 Lark     ─┼─▶ │ xác thực chữ ký · chuẩn hoá tin · voice→text│──┐
 Zalo OA  ─┘   └─────────────────────────────────────────┘  │ TriggerEnvelope
 aris-cron ─────────────────────────────────────────────────┤
 Webhook ngoài (GitHub…) ──────────────────────────────────┤
                                                             ▼
                   ┌──────────────── aris-dispatch ─────────────────┐
                   │ chống trùng · hàng đợi theo cuộc hội thoại      │
                   │ ánh xạ (kênh, chat) → sessionId · chọn preset   │
                   └──────────────┬──────────────────────▲──────────┘
                     ctx.agents   │ tạo/tiếp tục phiên   │ turn/end → trả lời
   ┌──────────────────────────────▼──────────────────────┴──────────────────┐
   │                  DeepSeek Harness (nhân — không sửa)                    │
   │ agent-loop · tools · sandbox · approval · permission-presets · llm     │
   │ sessions (append-only) · sessionQuery (FTS) · skills · jobs · goals    │
   │ subagent · compaction · storage/storageDomain · otel · token-meter     │
   └───▲──────────────────▲───────────────────▲─────────────────▲───────────┘
       │ session/event     │ PromptSection/     │ tools           │ approval/request
       │ turn/end          │ PromptContext      │                 │
 ┌─────┴──────────┐ ┌──────┴────────┐ ┌─────────┴────────┐ ┌──────┴─────────┐
 │ aris-reflect   │ │ aris-memory   │ │ aris-recall      │ │ aris-channels  │
 │ (vòng học,     │─▶ aris-user-    │ │ aris-skill-forge │ │ (gửi ra kênh,  │
 │  chạy nền)     │ │  model        │ │                  │ │  duyệt qua chat)│
 └────────────────┘ └───────────────┘ └──────────────────┘ └────────────────┘
          Dữ liệu: $DSH_HOME/profiles/aris  ·  storage domains aris_*  ·  skills/ (git)
```

**Mô hình tiến trình**: một tiến trình Node duy nhất `dsh --profile aris` (layer `dsh-base` → `dsh-web-app` → `aris-bundle` → `cordis.patch.yml` của máy). Web UI của dsh dùng làm **bảng điều khiển** (xem phiên, duyệt skill, sửa ký ức), chỉ mở qua Tailscale/localhost. Gateway chạy trong cùng tiến trình (plugin), nhận tin bằng long-polling (Telegram) hoặc HTTP trên **WebServer thứ hai tách biệt** (đúng cách dsh làm với GitHub webhook) để không lộ API trình duyệt. Daemon được giám sát bởi `launchd` (Mac) / `systemd` (server).

**Ba nguyên tắc xuyên suốt**

1. **Không sửa nhân** — chỉ gắn vào extension point trong bảng "Where new behavior goes" của dsh.
2. **Model thấy gì, log có nấy** — mọi ngữ cảnh aris nạp đi qua `PromptSection`/`PromptContext`/`agent.inject()`/kết quả tool (tất cả đều thành session event); mọi thao tác ghi ký ức/skill có sự kiện `aris/*` ⇒ tái hiện được mọi quyết định.
3. **Tự tạo ⇒ có phiên bản, có kiểm thử, quay lui được** (ký ức có revision, skill trong git, hồ sơ có bằng chứng).

## 6. Thiết kế chi tiết

### 6.1 `aris-dispatch` — cửa vào duy nhất

Mọi tác nhân kích hoạt đều được chuẩn hoá thành một "phong bì":

```ts
// Thiết kế aris (phác thảo)
interface TriggerEnvelope {
  id: string                    // id duy nhất từ nguồn (update_id Telegram, message_id Lark, cron-run id)
  source: 'telegram' | 'lark' | 'zalo' | 'cron' | 'webhook' | 'web'
  conversationKey: string       // vd. "telegram:chat:12345" — đơn vị nối tiếp hội thoại
  principal: { id: string; trust: 'owner' | 'paired' | 'external' }
  content: { text: string; attachments?: AttachmentRef[] }
  policy: { mode: 'continue' | 'new-session'; agentPreset: string; permissionPreset: string }
  replyTo?: ChannelAddress      // kết quả gửi về đâu
}
```

Trách nhiệm:

- **Chống trùng**: bảng `aris_dispatch.seen(id)` có TTL — Telegram/Lark gửi lại khi timeout sẽ không tạo việc trùng (G1).
- **Hàng đợi theo `conversationKey`**: lưu bền trong storage domain *trước khi* trả 200 cho nền tảng; xử lý nối tiếp trong một cuộc hội thoại, song song giữa các cuộc. Khởi động lại thì xử lý tiếp phần chưa xong.
- **Ánh xạ phiên**: `conversationKey → sessionId` (bảng `aris_dispatch.bindings`). `continue` ⇒ mở lại phiên và đưa tin vào inbox của agent; phiên quá dài/cũ ⇒ tự xoay sang phiên mới, mang theo tóm tắt (đây là chỗ "liên tục xuyên nền tảng": nhiều `conversationKey` của cùng chủ nhân có thể trỏ về một "luồng chính").
- **Chọn preset theo nguồn**: `owner` qua chat ⇒ `aris-chat`; cron ⇒ `aris-unattended`; `external` ⇒ chỉ đọc, không bao giờ được gọi tool có hiệu ứng.
- **Trả kết quả**: lắng nghe `turn/end` của phiên tương ứng, lấy `assistant/message` cuối, gửi qua `aris-channels`.
- Chỉ đi qua `ctx.agents` (seam công khai). Không dùng `ctx.webhookRuntime` cho chat.

### 6.2 `aris-channels` + `aris-gateway-*`

- **Seam mới `ctx.channels`** (Service Definition) với provider cho từng nền tảng; consumer là tool `channel_send` (cho agent chủ động nhắn) và `aris-dispatch` (trả lời).
- Gateway = provider vào + ra: xác thực chữ ký/secret của nền tảng, chuẩn hoá tin, chuyển ghi âm → chữ (STT), cắt tin theo giới hạn từng nền tảng, gửi file.
- **Ghép đôi chủ nhân**: lần đầu nhắn bot phải nhập mã ghép đôi sinh từ Web UI; chỉ `principal.trust = 'owner'` mới ra lệnh có hiệu ứng.
- **Duyệt qua chat**: đăng ký một answerer trên waterfall `approval/request` — gửi tin có nút *Cho phép một lần / Từ chối*; hết hạn ⇒ trả `unavailable`, mà dsh **fail-closed** nên hành động bị chặn. Đây là hành vi an toàn mặc định cho cron.
- Kênh đầu tiên khuyến nghị: **Telegram** (long-polling ⇒ không cần mở cổng vào máy).

### 6.3 `aris-memory` — bộ nhớ hai tầng

| Tầng | Nội dung | Kích thước | Đặt ở đâu trong prompt |
|---|---|---|---|
| **Lõi (core)** | Sự thật quan trọng, sở thích ổn định, quy ước làm việc | Có trần cứng (vd. 1.500 token) | `PromptSection` "Điều aris nhớ" — **đóng băng theo request series** để giữ cache |
| **Lưu trữ (archival)** | Mọi ký ức khác, chi tiết dự án, sự kiện | Không giới hạn | Không nạp sẵn; tìm theo câu hỏi rồi đưa vào `PromptContext` (cache-safe) hoặc trả qua tool |

Bản ghi:

```ts
interface MemoryItem {
  id: string
  tier: 'core' | 'archival'
  text: string
  kind: 'fact' | 'preference' | 'procedure-hint' | 'project' | 'person'
  provenance: { sessionId: string; seq: number; source: 'user' | 'agent' | 'external' }
  trust: 'user-stated' | 'agent-inferred' | 'external'   // external không bao giờ tự lên core
  revision: number
  supersedes?: string
  lastUsedAt?: string
  createdAt: string
}
```

- **Lưu trữ**: storage domain `aris_memory` (DomainSpec + zod, có version/migration) để sao lưu cùng dsh; chỉ mục tìm kiếm cho tầng archival dùng SQLite FTS5 riêng (bắt đầu bằng từ khoá; thêm embedding sau nếu cần).
- **Tool cho model**: `memory_save`, `memory_update`, `memory_forget`, `memory_search`. Mỗi lần ghi phát sự kiện `aris/memory-op` vào log phiên.
- **Tự nhắc lưu (nudge)**: listener `agent/turn-stopping` đếm tín hiệu (turn dài, nhiều tool, người dùng sửa sai, người dùng nói "nhớ là…") mà chưa có `memory_save` ⇒ `agent.inject()` một nhắc ngắn ở turn kế tiếp. Nhắc có giới hạn tần suất.
- **Lưu trước khi nén**: khi thấy `compaction/start` của phiên, xếp một job reflect cho đoạn sắp bị nén ⇒ không mất kiến thức khi ngữ cảnh bị tóm tắt.
- **Tinh lọc định kỳ** (job hằng đêm): gộp trùng, giải quyết mâu thuẫn (bản mới `supersedes` bản cũ), hạ cấp ký ức lõi lâu không dùng xuống archival, giữ core dưới trần.
- **Quyền người dùng**: Web UI và lệnh `/memory` để xem, sửa, xoá; xoá là xoá mềm + ghi sự kiện.

### 6.4 `aris-recall` — nhớ lại phiên cũ

- Tool `recall_search(query, since?, limit?)` → `ctx.sessionQuery.searchSessions()` lấy các phiên/sự kiện khớp nhất → một lời gọi **model rẻ** tóm tắt có trích dẫn `(sessionId, seq)` → chỉ phần tóm tắt vào ngữ cảnh.
- Tool `recall_open(sessionId, seq)` để đọc nguyên văn khi cần chính xác.
- Bỏ qua sự kiện `log-only`/`shadowed` khi tóm tắt (dùng `SessionEventSurface` của dsh) để không nhầm nội dung đã bị thay.

### 6.5 `aris-user-model` — hiểu người dùng sâu dần

- Hồ sơ là tập **giả thuyết có bằng chứng**, không phải văn bản tự do:

```ts
interface UserClaim {
  id: string
  facet: 'communication' | 'work-style' | 'goals' | 'expertise' | 'schedule' | 'values'
  claim: string                       // vd. "Thích câu trả lời tiếng Việt có dấu, ngắn, có bảng"
  confidence: number                  // 0..1
  evidence: { sessionId: string; seq: number; polarity: 'supports' | 'contradicts' }[]
  updatedAt: string
}
```

- Cập nhật **chỉ bởi `aris-reflect`** (ngoài luồng hội thoại). Mỗi lần reflect chỉ được tăng/giảm `confidence` theo bằng chứng mới; mâu thuẫn ⇒ giảm và đánh dấu cần hỏi lại.
- Claim `confidence ≥ 0,8` vào `PromptSection` (ổn định, ít đổi); phần thấp hơn chỉ dùng nội bộ cho reflect.
- Có "câu hỏi làm rõ" chủ động: khi một facet quan trọng còn mơ hồ, aris hỏi tối đa 1 câu/ngày ở thời điểm phù hợp.

### 6.6 `aris-skill-forge` — tự tạo và tự tinh chỉnh kỹ năng

**Vòng đời skill**

```
 đề xuất ──▶ nháp ──▶ ứng viên ──(qua eval + duyệt)──▶ đang dùng ──▶ ngừng dùng
                         ▲                                  │
                         └──── bản vá (khi lỗi/bị sửa) ◀────┘
```

- **Thư mục**: `skills/active/` được khai báo trong `Config.customSkillDirs` của provider local ⇒ dsh tự theo dõi và nạp; `skills/staging/` **không** nằm trong danh sách quét ⇒ nháp không bao giờ lọt vào phiên thật. Cả `skills/` là một repo git; mỗi lần đổi là một commit có lý do.
- **Tạo**: `aris-reflect` phát hiện turn "khó" (nhiều bước, nhiều tool, có sửa sai, người dùng khen kết quả) và loại việc có khả năng lặp lại ⇒ viết `SKILL.md` (khi nào dùng, các bước, lỗi thường gặp) + script phụ nếu cần, kèm **ca kiểm thử** rút từ chính phiên đó.
- **Đánh giá bằng phát lại** (điểm mạnh riêng nhờ dsh): fork phiên gốc tại ranh giới turn trước yêu cầu bằng `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })`, chạy lại yêu cầu **với skill ứng viên** trong preset `aris-eval` (sandbox `read-only` hoặc workspace tạm, không mạng, approval luôn `rejected`), rồi so: hoàn thành không, số bước, token, lỗi tool. Model chấm điểm theo rubric + kiểm tra cứng (script trả mã 0, file kỳ vọng tồn tại).
- **Tinh chỉnh**: khi skill được dùng mà tool lỗi, người dùng sửa, hoặc kết quả bị chê ⇒ tạo bản vá (diff) + lý do ⇒ chạy lại bộ ca kiểm thử của skill (bao gồm ca cũ để chống thoái lui).
- **Cổng bật**: mặc định cần duyệt qua chat ("Bật skill `bao-cao-doanh-thu-tuan` v3? Nhanh hơn 40% trên 5 ca thử"). Có thể nới thành tự bật cho skill **rủi ro thấp** (không gọi tool có hiệu ứng ngoài, không cần mạng) đã qua eval.
- **Đo hiệu quả sau khi bật**: sự kiện `aris/skill-applied` ghi mỗi lần dùng; tỉ lệ thành công tụt ⇒ tự đề xuất rollback.

### 6.7 `aris-reflect` — bộ não của vòng tự tiến hoá

- **Kích hoạt**: `turn/end` (bỏ qua turn ngắn), `compaction/start`, và lịch tổng kết cuối ngày.
- **Chạy nền** qua `ctx.jobs` (kind `aris-reflect`), không chặn hội thoại; có ngân sách (N lần/giờ, trần token/ngày) và công tắc tắt toàn cục.
- **Đầu vào**: đoạn log của turn (đã lọc nội dung `external` thành dạng trích dẫn, không thành chỉ thị), ký ức lõi, hồ sơ hiện tại, danh sách skill đã dùng.
- **Đầu ra có cấu trúc** (JSON được kiểm bằng schema; sai schema ⇒ bỏ):

```ts
interface ReflectionResult {
  memories: { op: 'save' | 'update' | 'forget'; item: Partial<MemoryItem>; reason: string }[]
  userClaims: { claimId?: string; claim: string; facet: UserClaim['facet']; delta: number; evidenceSeq: number }[]
  skillProposals: { name: string; why: string; sourceTurn: { sessionId: string; turn: number } }[]
  skillPatches: { name: string; diff: string; why: string }[]
  followUps: { text: string; when?: string }[]   // việc nên tự làm tiếp / nhắc người dùng
}
```

- **Áp dụng theo chính sách** (`aris-policy`): ký ức `user-stated` ⇒ tự lưu; `agent-inferred` ⇒ lưu archival, lên core phải qua tinh lọc; skill ⇒ luôn qua forge + eval; `followUps` ⇒ chỉ thành đề xuất trong chat, không tự hành động ở giai đoạn đầu.
- Ghi sự kiện `aris/reflection` (kèm model, token, kết quả áp dụng) ⇒ truy vết được "vì sao aris tự thay đổi".

### 6.8 `aris-cron` — tự động theo lịch

- Người dùng nói tự nhiên ("8h sáng thứ 2–6 tóm tắt email chưa đọc và lịch hôm nay") ⇒ tool `cron_create` chuyển thành bản ghi `{ id, rule (cron/RRULE), timezone: 'Asia/Ho_Chi_Minh', prompt, agentPreset, permissionPreset: 'aris-unattended', deliverTo }` trong storage domain `aris_cron` — **người dùng xác nhận bản dịch lịch** trước khi lưu.
- Đến giờ ⇒ phát `TriggerEnvelope{ source: 'cron', policy.mode: 'new-session' }` vào `aris-dispatch`. Lỡ giờ khi máy tắt ⇒ chính sách bắt kịp: chạy một lần ngay khi bật lại nếu trễ < X giờ, bỏ qua nếu quá hạn.
- Kết quả gửi qua `aris-channels`; nếu phiên cron gặp hành động cần duyệt ⇒ hỏi qua chat, hết hạn thì bị chặn (fail-closed).

### 6.9 Tự trị cho việc dài

- Việc nhiều bước kéo dài: dùng `ctx.goals` (mục tiêu có revision, phase `active|paused|blocked|complete`) để agent tự tiếp tục qua nhiều turn, có điểm dừng khi `blocked` (chờ người).
- Song song: subagent với preset riêng (`researcher` chỉ đọc + web, `coder` workspace-write, `ops` cần duyệt), `depthLimit` = 2.
- Gộp bước: bật `ptc-runtime`/`workflow` để model viết script gọi nhiều tool một lượt.

## 7. Mô hình bảo mật

| Lớp | Biện pháp |
|---|---|
| **Mức tin cậy theo nguồn** | `owner` (chủ nhân đã ghép đôi) · `paired` (người được cho phép, quyền hạn chế) · `external` (web, email, tài liệu, tin nhắn lạ). Nội dung `external` luôn được bọc như dữ liệu trích dẫn; không bao giờ tự thành ký ức lõi, claim hồ sơ, hay skill. |
| **Preset quyền theo loại phiên** | `aris-chat` = `workspace-write` + `ask`; `aris-unattended` (cron/webhook) = `workspace-write` + `ask` qua chat, hết hạn ⇒ chặn; `aris-eval` = `read-only` + luôn từ chối; `aris-readonly` cho `external`. Không preset nào của aris dùng `danger-full-access`. |
| **Mạng (G3)** | Chế độ chạy server: container/VM với egress allowlist (API model, API kênh, các domain người dùng cho phép); tool web đi qua proxy có log. |
| **Bí mật** | Dùng hệ con `credentials` của dsh; không để token trong prompt, ký ức hay skill; reflect lọc chuỗi giống khoá trước khi lưu. |
| **Hành động không thể đảo ngược** (gửi tin cho người khác, xoá, thanh toán, đăng bài) | Luôn qua `ctx.approval`, không bao giờ nằm trong danh sách tự cho phép. |
| **Tự tiến hoá** | Mọi thay đổi có phiên bản; skill qua eval + duyệt; ngân sách reflect; công tắc tắt toàn cục `/aris pause-learning`. |
| **Kiểm toán** | Log phiên append-only + sự kiện `aris/*` + `approval/asked|decided` của dsh ⇒ đủ để trả lời "ai, khi nào, vì sao". |

## 8. Dữ liệu và sự kiện của aris

**Sự kiện phiên mới** (mở rộng `SessionEventMap` bằng declaration merging; đều *log-only*, không thành ngữ cảnh model trừ khi đi qua đường prompt chính thức):

| Sự kiện | Payload chính | Ai ghi |
|---|---|---|
| `aris/trigger` | `envelopeId, source, conversationKey, principal.trust` | aris-dispatch |
| `aris/memory-op` | `op, memoryId, revision, trust` | aris-memory |
| `aris/context-loaded` | danh sách `memoryId`/`claimId`/skill đã nạp cho request | aris-memory, aris-user-model |
| `aris/reflection` | `jobId, model, usage, applied[], rejected[]` | aris-reflect |
| `aris/skill-applied` | `skill, version, outcome` | aris-skill-forge |
| `aris/delivery` | `channel, address, messageRef, status` | aris-channels |

**Storage domains**: `aris_memory`, `aris_user_model`, `aris_dispatch` (seen, queue, bindings), `aris_cron`, `aris_skill_registry` (trạng thái + điểm eval; nội dung skill nằm trong git), `aris_channels` (ghép đôi, địa chỉ).

## 9. Ví dụ một vòng tự tiến hoá trọn vẹn

1. Thứ 2, người dùng nhắn Telegram: "làm báo cáo doanh thu tuần từ file Excel trong Drive". aris mất 14 bước, 2 lần sửa sai định dạng ngày.
2. `turn/end` ⇒ `aris-reflect` chạy nền: lưu ký ức `user-stated` "báo cáo doanh thu gửi dạng bảng, đơn vị triệu đồng"; tăng claim "thích bảng" lên 0,85; đề xuất skill `bao-cao-doanh-thu-tuan`.
3. `aris-skill-forge` viết nháp trong `skills/staging/`, fork phiên thứ 2 tại turn trước yêu cầu, chạy lại trong `aris-eval`: 6 bước, không lỗi.
4. Tin nhắn duyệt: "Bật skill mới? 14 → 6 bước trên ca thử." Người dùng bấm *Cho phép* ⇒ chuyển sang `skills/active/`, commit git, dsh tự nạp.
5. Thứ 2 tuần sau, cùng yêu cầu ⇒ dùng skill, 5 bước. Người dùng: "thêm cột so với tuần trước" ⇒ reflect tạo bản vá v2, eval trên cả 2 ca cũ, xin duyệt.
6. Người dùng: "mỗi sáng thứ 2 tự làm luôn" ⇒ `aris-cron` tạo lịch, kết quả tự gửi về Telegram.

## 10. Quy trình tham khảo Hermes (bắt buộc)

**Thay đổi ngày 23/10/2026**: theo chỉ đạo của chủ dự án, được đọc **cả mã nguồn** Hermes (giấy phép **MIT**) để học thiết kế. Vì vậy aris không còn là clean-room theo nghĩa pháp lý chặt; với MIT điều này không gây rủi ro nếu tuân thủ các bước dưới.

1. **Nguồn được đọc**: README, tài liệu, mã nguồn, test của Hermes — để hiểu thiết kế và tham số đã được kiểm chứng.
2. **Không sao chép, không import**: không dán mã, prompt hay test của Hermes vào aris; không có dependency Hermes.
3. **Đặc tả trung gian**: thiết kế được viết lại bằng lời của mình trong `docs/specs/*.md` trước khi cài đặt; mã aris viết mới bằng TypeScript trên API dsh; prompt hệ thống tự viết.
4. **Chuyển thể sát (ngoại lệ)**: nếu một thuật toán nhỏ buộc phải chuyển thể sát, ghi nguồn và giữ thông báo bản quyền MIT của Hermes trong `THIRD_PARTY_NOTICES.md`.
5. **Chốt chặn CI**: (a) chặn mọi dependency có tên chứa `hermes` hoặc từ repo `nousresearch/*`; (b) quét giấy phép dependency (chỉ cho phép MIT/Apache-2.0/BSD/ISC…).
6. **Nhật ký**: [docs/clean-room-log.md](clean-room-log.md) — đọc gì, ngày nào, ai đọc, rút ra thiết kế nào.

## 11. Kiểm thử và vận hành

| Loại | Nội dung |
|---|---|
| Unit | Logic thuần: chính sách áp dụng reflect, chống trùng, chuyển lịch tự nhiên → cron, tinh lọc ký ức |
| Hợp đồng với dsh | Chạy với phiên bản dsh đã ghim: plugin nạp/gỡ sạch effect, sự kiện `aris/*` ghi đúng, prompt section/context đúng chỗ. Chạy lại mỗi lần nâng cấp dsh. |
| Phát lại (golden) | Một tập phiên mẫu (đã ẩn dữ liệu nhạy cảm) phát lại qua fork ⇒ phát hiện thoái lui hành vi khi đổi prompt/skill/model |
| Eval tự tiến hoá | Bộ ca kiểm thử của từng skill; chỉ số: hoàn thành, số bước, token, lỗi |
| Hỗn loạn | `kill -9` giữa turn, mất mạng, nền tảng gửi lại tin ⇒ không mất tin, không trả lời đôi |
| Quan sát | `otel` + `token-meter`: chi phí theo nguồn kích hoạt, theo thành phần (chat/reflect/recall/eval); cảnh báo vượt ngân sách |
| Sao lưu | Hằng đêm: `$DSH_HOME/profiles/aris` (log phiên + storage) và repo `skills/` ⇒ bản sao mã hoá ngoài máy; diễn tập khôi phục mỗi tháng |
| Nâng cấp dsh | Đọc `docs/upgrade-guide` + changelog ⇒ đổi phiên bản ghim ⇒ test hợp đồng + phát lại ⇒ mới triển khai |

## 12. Rủi ro và cách giảm

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| dsh/Cordis đổi API (preview, rc) | Cao | Ghim chính xác; chỉ dùng seam công khai; adapter mỏng `aris-compat`; test hợp đồng |
| Prompt injection từ web/email đầu độc ký ức, skill | Cao | Mức tin cậy theo nguồn; `external` không thể tự thành ký ức/skill; reflect nhận nội dung ngoài dưới dạng trích dẫn |
| Skill tự sửa làm hỏng hành vi | Trung bình | Staging tách biệt, eval phát lại, duyệt, git rollback, theo dõi tỉ lệ thành công sau khi bật |
| Hành động nguy hiểm khi không giám sát | Cao | Preset không có `danger-full-access`; approval fail-closed; egress allowlist |
| Rò rỉ dữ liệu qua mạng (sandbox không chặn mạng) | Cao | Container + egress allowlist; proxy có log |
| Chi phí chạy nền phình to | Trung bình | Model rẻ cho reflect/recall; giữ prompt cache (G4); ngân sách giờ/ngày; bỏ qua turn ngắn |
| Ký ức phình, mâu thuẫn, lỗi thời | Trung bình | Trần core; tinh lọc hằng đêm; `supersedes`; người dùng xem/sửa được |
| Trả lời đôi / mất tin khi nền tảng gửi lại | Trung bình | Chống trùng theo id + hàng đợi bền trước khi ACK |
| Mất dữ liệu | Thấp | Sao lưu mã hoá + diễn tập khôi phục |

## 13. Lộ trình

> Lộ trình chi tiết theo từng tính năng và màn hình (có thêm đội nhiều bot) nằm ở [tinh-nang-aris.md mục 13](tinh-nang-aris.md#13-lộ-trình-theo-tính-năng); bảng dưới là khung kỹ thuật.

| Giai đoạn | Nội dung | Tiêu chí nghiệm thu |
|---|---|---|
| **0 — Khung** (≈1 tuần) | Monorepo pnpm/TS; ghim dsh; profile `aris` (dsh-base + dsh-web-app + aris-bundle rỗng); DeepSeek làm model; CI chặn dependency Hermes; test hợp đồng đầu tiên | `dsh --profile aris web` chạy; chat được; log phiên ra đĩa; sandbox chặn ghi ngoài workspace; `--dump-config` thấy row của aris |
| **1 — Trí nhớ** (≈2 tuần) | aris-memory (2 tầng, nudge, lưu trước khi nén), aris-recall, aris-user-model (cập nhật thủ công), Web UI xem/sửa ký ức | Phiên mới vẫn nhớ sở thích; trả lời đúng ≥ 8/10 câu hỏi về chuyện tuần trước; prompt cache hit không giảm sau khi thêm ký ức |
| **2 — Tự tiến hoá** (≈3 tuần) | aris-reflect, aris-skill-forge (staging, eval phát lại, duyệt), preset subagent | Sau một việc khó có đề xuất skill kèm số liệu eval; lần sau cùng việc giảm ≥ 30% số bước; rollback một lệnh |
| **3 — Sống ngoài đời** (≈2 tuần) | aris-dispatch, aris-channels, gateway Telegram (rồi Lark), duyệt qua chat, aris-cron; daemon `launchd`/`systemd` | Nhắn từ điện thoại; báo cáo 8h sáng tự gửi; `kill -9` không mất tin, không trả lời đôi |
| **4 — Cứng cáp** (≈2 tuần) | Container + egress allowlist, ngân sách + otel dashboard, sao lưu + diễn tập, xuất trajectory | Chạy 14 ngày liên tục không can thiệp; chi phí trong ngân sách; khôi phục thành công từ bản sao lưu |
| **5 — Mở rộng** | Tự viết tool qua hệ con `extensions` (luôn duyệt), embedding cho archival, thêm Zalo OA | Tuỳ ưu tiên |

**Sprint 0 — việc cụ thể**

1. `pnpm init` monorepo, `tsconfig` strict, Vitest, ESLint.
2. Ghim `@deepseek-ai/dsh` phiên bản chính xác; script `pnpm aris` = `dsh --profile aris`.
3. `profiles/aris/package.json` với `dsh.profile` = `[dsh-base, dsh-web-app, aris-bundle]`; `packages/aris-bundle` với `dsh.bundle` trỏ tới patch rỗng.
4. Plugin mẫu `aris-hello`: một `PromptSection` + một tool + một sự kiện `aris/*` — để chứng minh cả ba đường mở rộng chạy và gỡ sạch.
5. CI: build, test, chặn dependency Hermes (mục 10.5), quét giấy phép.
6. `docs/specs/` khởi tạo đặc tả hành vi cho memory và recall (từ README, bằng lời của mình).

## 14. Cấu trúc thư mục

```
aris-agent/
  profiles/aris/              # package.json (dsh.profile) + cordis.patch.yml mẫu
  packages/
    aris-bundle/              # bundle ghép mọi plugin aris (dsh.bundle)
    aris-compat/              # adapter mỏng quanh API dsh có rủi ro thay đổi
    aris-policy/              # chính sách tin cậy, ngân sách, cổng duyệt (thuần, dễ test)
    aris-dispatch/            # TriggerEnvelope, chống trùng, hàng đợi, ánh xạ phiên
    aris-channels/            # seam ctx.channels + tool channel_send + approval answerer
    aris-gateway-telegram/  aris-gateway-lark/  aris-gateway-zalo/
    aris-memory/              # 2 tầng, tools, nudge, tinh lọc
    aris-recall/
    aris-user-model/
    aris-reflect/
    aris-skill-forge/         # staging, eval phát lại, vòng đời
    aris-cron/
  skills/                     # repo git riêng: active/ (được dsh quét), staging/ (không quét)
  docs/
    phan-tich-kien-truc.md    # tài liệu này
    clean-room-log.md
    specs/                    # đặc tả hành vi viết lại bằng lời của mình
```

## 15. Quyết định cần chốt (kèm đề xuất mặc định)

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| 1 | Model chính | **DeepSeek cho mọi thứ ở giai đoạn 0–2**; thêm Claude cho việc khó khi đã có số liệu | Đúng hệ sinh thái dsh, rẻ, prompt cache tốt; adapter khác thêm sau chỉ bằng cấu hình |
| 2 | Kênh đầu tiên | **Telegram** | Long-polling không cần mở cổng; API ổn định; Lark làm thứ hai |
| 3 | Nơi chạy | **Mac khi phát triển (giai đoạn 0–2), server trong container từ giai đoạn 3** | Chạy không giám sát cần egress allowlist (G3), dễ làm trên server |
| 4 | Mức tự trị khi sửa skill | **Luôn duyệt**; sau ≥ 20 lần duyệt với tỉ lệ rollback thấp thì nới cho skill rủi ro thấp | Có dữ liệu rồi mới nới |
| 5 | Ngân sách chạy nền | Đề xuất trần **5 USD/ngày** cho reflect + eval, cảnh báo ở 80% | Cần người dùng chốt con số |
