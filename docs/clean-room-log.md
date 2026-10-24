# Nhật ký tham khảo Hermes

Ghi lại mọi lần đọc tài liệu hoặc mã nguồn của Hermes Agent. Quy tắc hiện hành (từ 23/10/2026): **được đọc cả mã nguồn** (MIT) để học thiết kế; **không sao chép, không import**; thiết kế viết lại bằng lời của mình trước khi cài đặt. Xem mục 10 của [phan-tich-kien-truc.md](phan-tich-kien-truc.md). Trước ngày đó dự án theo clean-room nghiêm ngặt (chỉ đọc README).

| Ngày | Người đọc | Nguồn | Phạm vi đã đọc | Kết quả rút ra |
|---|---|---|---|---|
| ≤ 23/10/2026 | Claude (bản phân tích 1) | README công khai trên GitHub `nousresearch/hermes-agent` | Phần mô tả tính năng | Bảng năng lực trong bản phân tích 1 |
| 23/10/2026 | Claude (bản phân tích 2) | README công khai trên GitHub `nousresearch/hermes-agent` (qua công cụ tóm tắt trang, không mở thư mục mã) | Phần mô tả tính năng và giấy phép | Danh sách năng lực mục 4 (diễn đạt lại); giấy phép MIT; định dạng skill theo chuẩn mở agentskills.io |
| 23/10/2026 | Claude (đặc tả tính năng) | Bản clone `nousresearch/hermes-agent` commit `c73cbcc` (22/10/2026), lưu ngoài repo aris, không chạy mã | Tài liệu `website/docs`: features (memory, skills, curator, honcho, personality, goals, loops, heartbeat, kanban, delegation, cron, tool-search, web-dashboard), profiles, multi-profile-gateways, bot-mode, bot-screen, sessions, security, checkpoints, messaging, context-compression-and-caching, reference (slash commands, toolsets). Mã: `agent/background_review.py` (phần đầu), `agent/turn_context.py` và `agent/turn_finalizer.py` (logic nhắc học), `agent/agent_init.py` (giá trị mặc định nhịp nhắc) | [tinh-nang-aris.md](tinh-nang-aris.md): danh mục tính năng, tham số mặc định đã kiểm chứng, thiết kế đội nhiều bot. Không sao chép mã/prompt |
| 23/10/2026 | Claude (so sánh gateway Telegram trước bước 4) | Bản clone Hermes tại `~/.hermes/hermes-agent` commit `4075c8fd5a` | Chỉ tài liệu: `website/docs/user-guide/messaging/telegram.md`, `messaging/index.md` (không mở mã gateway) | Bảng so sánh tính năng Telegram để bổ sung kế hoạch bước 4 (diễn đạt lại, không sao chép); phát hiện privacy mode của Telegram không giao tin @ thường trong nhóm |
| 24/10/2026 | Claude (đánh giá giai đoạn 3 so với Hermes) | Bản clone Hermes tại `~/.hermes/hermes-agent` commit `4075c8fd5a` | Chỉ tài liệu `website/docs/user-guide/features`: `memory.md` (vòng học nền, `write_approval`, `/journey`, chạy review trên model rẻ), `skills.md` (`/learn`, `skill_manage`, cổng duyệt skill, mục lục Skills Hub), `curator.md` (cách chạy, 30/90 ngày, ân hạn skill chưa dùng, miễn skill cron dùng, gộp skill bằng LLM tắt mặc định, báo cáo mỗi lần chạy), `honcho.md` (biện chứng nhiều lượt, làm nóng đầu phiên), `goals.md` (hợp đồng hoàn thành, `/subgoal`, phán quyết `wait`) | Bảng so sánh trong câu trả lời đánh giá giai đoạn 3 (diễn đạt lại). Không mở mã, không sao chép |

Tài liệu DeepSeek Harness (giấy phép MIT, là nhân được phép dùng) không cần ghi ở đây; bản 2 đối chiếu tại commit `687f282`.

## Nguồn tham khảo khác (không phải Hermes)

| Ngày | Nguồn | Phạm vi đã đọc | Kết quả rút ra |
|---|---|---|---|
| 23/10/2026 | Tako (`~/orca/Tako`, MIT, commit `e91cdca`) | `docs/TIM-HIEU-DU-AN.md` (Commander, 3 lệnh điều phối, giới hạn đồng thời, Auto Task, Driver), `src/main/prompts/chat_commander.md` | Thiết kế vai trò Commander của aris (tinh-nang-aris.md mục 8.4). Không sao chép prompt |
| 23/10/2026 | VoxAgent (`~/Desktop/Vibe Coding/VoxAgent`, chưa xác định giấy phép) | `.agents/skills/cli/references/models-providers.md`, `packages/model-bank/src/types/*`, danh sách `modelProviders` | Thiết kế dữ liệu provider/model (tinh-nang-aris.md mục 3.1). Chưa tái dùng mã hay dữ liệu |
| 23/10/2026 | Hermes — bổ sung | `website/docs/user-guide/features/kanban.md` (orchestrator, auto-decompose), `bot-mode.md` (bot-to-bot) | So sánh trong mục 8.4 |

## 23/10/2026 — Các mặt tích hợp của Hermes (bản c73cbcc đã clone)

Mục đích: đánh giá aris có dùng được như Hermes khi chạy ngầm, làm agent điều phối và làm agent thành viên của nền tảng khác hay không.

Đã đọc (chỉ tài liệu, không mở mã của các module này):
- `website/docs/user-guide/features/acp.md`: ACP qua stdio, IDE, Buzz Desktop, `buzz-acp`; cảnh báo Buzz tự duyệt quyền.
- `website/docs/user-guide/features/api-server.md`: các endpoint tương thích OpenAI, SSE, khoá chống gửi lặp.
- `website/docs/user-guide/messaging/a2a.md`: A2A client/server, mô hình bảo mật.
- `website/docs/developer-guide/programmatic-integration.md`: so sánh ACP, JSON-RPC, API server.
- `website/docs/integrations/buzz.md`, `integrations/index.md`.
- `skills/autonomous-ai-agents/` (chỉ danh sách và phần đầu `opencode/SKILL.md`): Hermes điều khiển Claude Code, Codex, OpenCode qua terminal.

Đối chiếu tài liệu dsh: `docs/cli-help.md` (`acp`, `headless`, `sdk`, `web`), `docs/config-catalog.md` (`dsh-acp`, `dsh-subagent-acp`), `docs/subsystems/mcp.md`.

Kết quả: chỉ rút ra danh mục năng lực (mục 15 của `tinh-nang-aris.md`). Không sao chép mã, schema hay nội dung skill.
