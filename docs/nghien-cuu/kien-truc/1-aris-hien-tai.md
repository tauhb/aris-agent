# aris hôm nay: "phiên" (session) so với "bot" — hiện trạng kiến trúc

Phạm vi: chỉ đọc mã và tài liệu trong `/home/user/aris-agent` (packages `aris-*`, `docs/specs/*.md`, `docs/phan-tich-kien-truc.md`, `docs/ke-hoach-trien-khai.md`). Đường dẫn dưới đây tính từ `packages/` nếu không có tiền tố khác. Chỗ suy luận ghi **[suy luận]**; chỗ đọc thẳng từ mã thì không đánh dấu.

## 0. Tóm tắt một đoạn

Trong aris, **bot không có hội thoại của riêng mình**. Bot chỉ là một bản ghi cấu hình (tính cách, model, quyền, ký ức riêng). Đơn vị hội thoại duy nhất là **session của dsh**, và bot chỉ "bám" vào session bằng một cái thẻ (`aris_bots.sessions`: sessionId → botId). Mỗi cửa vào (web, Telegram/Lark/Zalo, routine, ACP, giao việc của Commander) tự quyết định lúc nào mở session mới, và không có chỗ nào gom chúng lại thành "một luồng chính của bot". Cái "luồng chính" hiện có chỉ là phép tính ngầm kiểu "session gần nhất mang thẻ bot này". Telegram thì có luồng riêng theo từng cuộc chat. Thiết kế `aris-dispatch` với "luồng chính" và tự xoay session (docs/phan-tich-kien-truc.md mục 6.1) **chưa được xây**; mã thật nằm trong `aris-channels/src/hub.ts` và không có xoay.

Chủ sở hữu cảm thấy "aris làm việc theo session" là cảm nhận đúng với mã hiện tại.

---

## 1. Mô hình dữ liệu

### 1.1 Bot (`aris-bots`)

- Storage domain `aris_bots` (`aris-bots/src/domain.ts`). Các bảng: `bots`, `departments`, `sessions`, `activity`, `owner`, `mcp`, `souls`.
- `botRecord`: `id` (cố định; `aris` cho Commander, `b-xxxxxx` cho bot khác), `kind: 'commander' | 'member'`, `handle` (@tên), `name`, `role`, `description` (Commander dựa vào đây để chọn người), `soul` (tính cách), `mascot`, `model`, `department`, `tools`, `perms`, `models` (model theo việc), `media`, `assignable`, và `external` (Claude Code / Codex / ACP).
- Bot ngoài: ghi chú ngay trong schema "chạy qua plugin của dsh, **không có phiên riêng**" (`domain.ts`, trường `external`). Nút mở chat với bot ngoài trả lỗi "Bot ngoài không có phiên chat riêng; giao việc cho bot qua Aris" (`aris-bots/src/api.ts`, case `'open'`).
- Cách nó "thành bot" trong prompt: ngữ cảnh `aris:bot` (`aris-bots/src/index.ts`, `ctx.systemPrompt.context`, `CONTEXT_ORDER = 290`) gọi `renderPersona(store.botOf(session.id), ...)`. Nghĩa là tính cách được nạp **theo session**, tra bot từ session.
- Docs xác nhận lựa chọn thiết kế: "bot là dữ liệu của aris gắn vào phiên chứ không phải preset của dsh" (docs/ke-hoach-trien-khai.md, "Bước 1 xong 23/10"; docs/specs/aris-bots.md dòng 7). Lý do: thành viên team của dsh dùng chung preset và model với phiên chính.

### 1.2 Session / workspace của dsh

- Session là log append-only của dsh; workspace là thư mục + danh sách `sessionIds`. aris không sửa nhân dsh, chỉ gọi `ctx.sessionController.create/list/resolveAgent/selectModel`.
- Chỗ chat riêng với Aris là workspace "nhà" (`@aris/home`, hàm `ensureHome`), **không phải dự án** (quyết định 11, ghi trong `aris-ui-sidebar/src/client/SidebarRoot.tsx` dòng ~396). Mọi session chat với bot (không thuộc dự án) đều nằm chung workspace này.
- Mỗi session có model riêng (`selectModel` lúc mở), và mỗi session có một agent sống (`agent.status` = `idle | running`).

### 1.3 Cách bot gắn vào session

Có đúng một bảng nối: `sessions` trong `aris_bots` (`sessionRecord = { bot, via: 'open'|'team'|'dispatch'|'acp', at, session }`, `domain.ts`).

- `BotStore.botOf(sessionId)` (`aris-bots/src/store.ts` dòng ~493): có thẻ thì trả bot đó, **không có thẻ thì trả Commander**. Hệ quả: "session không thẻ = session của Aris".
- `BotStore.tag(sessionId, bot, via)` ghi thẻ. Ba chỗ ghi thẻ:
  1. `open(botId)` trong `aris-bots/src/index.ts` (dòng ~399): `sessionController.create` ở workspace nhà → `store.tag(..., 'open')` (trừ Commander, Commander không có thẻ) → `selectModel` theo `store.effectiveModel`. Đây là đường duy nhất để web, Telegram và routine mở "chat riêng với bot".
  2. Sự kiện `team/member` (cùng file, dòng ~385): khi Commander giao việc và tên thành viên team trùng `handle` bot thì session con được gắn bot `via: 'team'`, kịp trước lần gọi model đầu.
  3. `giao_phong` (aris-commander/src/index.ts dòng ~985–992) tạo session cho trưởng nhóm, gắn `'dispatch'`. ACP gắn `'acp'` (`aris-acp/src/index.ts` dòng ~252).
- Cấu hình bot có hiệu lực ở **session mới**, không đổi session đang chạy (để giữ prompt cache): ghi rõ trong chữ giao diện `bot.history`/`bot.modelHint`/kết nối MCP "có hiệu lực ở phiên mới của bot" (`aris-ui-pages/src/client/locale.ts`). MCP của bot được gắn lúc `agent/created` hoặc ngay sau `tag` (`attach`/`attachSession` trong `aris-bots/src/index.ts`).
- Quyền riêng của bot (ghi file, nguy hiểm: hỏi/từ chối, công cụ web/shell) thi hành ở `tools/pre-execute` và `approval/request`, tra bot qua `botOf(session.id)`.

### 1.4 Dự án (`aris-projects`)

- Dự án = **một workspace dsh** + hồ sơ aris (`projectRecord`: `workspace`, `name`, `goal`, `members[]`, `rules`, `mainSession`, `split`, `driver`, `page`) (`aris-projects/src/domain.ts`).
- Có "phiên chính" (`mainSession`): đây là thứ gần nhất với "luồng chính", nhưng chỉ cho **dự án** và chỉ Aris (không phải từng bot). Team của dsh gắn với mã phiên, nên Team của dự án = Team của phiên chính (docs/specs/aris-projects.md dòng 17). "Phiên chính mất thì lần mở sau tạo phiên chính mới."
- Mọi session trong dự án được nạp `<aris-project>` (`aris-projects/src/context.ts`, `renderProject`): tên, thư mục, mục tiêu, thành viên. Riêng phiên chính có "Phòng nhóm" (`moi_noi`, bot nói lần lượt nghe nhau).
- Kanban: thẻ người dùng tạo (`cardRecord`) nằm ở aris cho tới khi Aris giao, vì "bảng việc của Team chỉ ghi được bằng agent đang chạy của phiên chính". Driver đọc bảng từ log phiên chính mỗi 30 giây (docs/specs/aris-projects.md).

### 1.5 Commander và `giao_viec` (`aris-commander`)

- Commander là bot `kind: 'commander'`, id `aris`. Nó là bot "mặc định" cho mọi session không thẻ.
- `giao_viec` (`aris-commander/src/index.ts` dòng ~436; logic thuần ở `aris-commander/src/dispatch.ts`, hàm `dispatch`): với mỗi bot được giao
  - Bot thường: nếu đã có thành viên team trùng handle (trạng thái khác `failed`) trong **session Commander này** thì `team.sendMessage` (nhắn tiếp), không thì `team.spawnTeammate(..., context: 'fresh', provider: 'spawn')`. Mỗi việc là một thẻ `team/task` gán cho bot (`createTask` + `updateTask reassign`). Session của bot con là một session dsh thật, được gắn thẻ bot qua `team/member`.
  - Bot ngoài: `d.external(...)` chạy trọn gói qua CLI (`claude-driver.ts` với `--resume`, `codex-driver.ts`); không có session; kết quả quay về session Commander dưới dạng tin nhắn của team/thông báo (`reportRun`).
  - Giới hạn: tối đa 4 bot mỗi lần gọi (`MAX_PER_CALL`), tối đa 6 bot chạy đồng thời (`MAX_BUSY`, cấu hình được qua `settings().parallel`), đếm theo **bot**, không theo session (`LiveTracker.busyBots`, `aris-bots/src/live.ts` dòng ~209).
  - Bot "nhớ việc trước" **chỉ trong cùng cuộc** (cùng session Commander): chữ trong `dispatch.ts` đầu file và `GUIDE`: "Bot đã làm việc trong cuộc này thì giao tiếp cho chính bot đó (nó nhớ việc trước)". Sang session Commander khác thì spawn lại từ đầu **[hệ quả suy ra từ `listMembers(agent)` gắn với agent của session]**.
- Ngoài `giao_viec`: `chuyen_giao` (kết quả bot hiện thẳng cho người dùng), `giao_phong` (cả phòng, trưởng nhóm chia việc), `tao_the`, `moi_noi`, `tao_routine`. Có "Commander tự học" bot nào hợp loại việc nào (`learned.ts`, `<aris-routing-history>`).

---

## 2. Luồng hội thoại từ mỗi cửa vào tới một session dsh

### 2.1 Web: nút "Việc mới"

- Thanh bên `aris-ui-sidebar/src/client/SidebarRoot.tsx`: nút lớn `session.new` ("Việc mới" / "New task") gọi `startSession()` của dsh (dòng ~474–486). Đây là session dsh trần ở workspace mặc định; **không gắn thẻ bot** nên `botOf` trả Commander ⇒ nó là "việc mới với Aris".
- Bấm "Aris" (`chatWithAris`): lấy các session của workspace nhà đã sắp theo `updatedAt` (`recentSessions` trong `projects.ts`, lọc `blank` và `origin === 'subagent'`), rồi `latestCommanderSession` gọi `op: 'commander-latest'` (`aris-bots/src/api.ts` dòng ~344) trả **session đầu tiên chưa có thẻ bot**. Không có thì `startSession`.
- Bấm bot thường (`chatWith`): `openBotSession(id)` → API `open` → `store.latestOpen(bot)` (`store.ts` dòng ~499): lấy thẻ `via === 'open'` có `at` mới nhất; có thì dùng lại, không thì `open()` tạo mới. Bot ngoài thì mở hồ sơ.
- Bấm dự án: mở session gần nhất của workspace dự án (`latestProjectSession`), không có thì để dsh tạo.
- Phím tắt `session.new` cũng nối vào đây.

### 2.2 Web: bảng chat gọn ở Văn phòng

`aris-ui-pages/src/client/office/ChatPanel.tsx`:

- Session đang xem: `sid = picked ?? running[0] ?? recent?.[0]?.id` (dòng ~238): session người dùng chọn, hoặc session đang chạy của bot, hoặc session gần nhất.
- `SessionPicker`: "Các phiên" (`of.ch.sessions`), tối đa **5** phiên gần nhất (`botSessions` trong `aris-bots/src/index.ts` dòng ~594, `pickSessions(..., 5)` trong `sessions.ts`), mục cuối "＋ Phiên mới" (`NEW_SESSION`).
- Gửi tin: nếu chưa có `sid` thì `openBotSession(desk.id, true)` (fresh) tạo session rồi `sendToSession` → `op: 'session-send'` (`aris-commander/src/index.ts` dòng ~2005, hàm thuần `sessionSend` trong `session-send.ts`).
- Với Aris: `botSessions` = các session trong workspace nhà **không có thẻ bot và không phải session con** — tức gộp cả session do Telegram, routine, `/goal`... của Aris sinh ra **[suy luận từ `botSessions`: lọc `!store.tagOf(id) && !parentSessionId`]**.
- Bot ngoài không có ô nhắn, chỉ có tiến độ lần chạy và nút dừng (`ExternalRun`).

### 2.3 Telegram / Lark / Zalo (`aris-channels`)

- Domain `aris_channels` (`domain.ts`): `threads` (`threadRecord = { key, bot, chatId, threadId?, sessionId, history[≤30], updatedAt }`), `inbox` (hàng đợi bền, `state: queued|running`), `outbox` (giao bền theo từng khúc), `settings.busy`.
- Khoá cuộc trò chuyện `threadKey(tgBotId, chatId, topicId?)` (`store.ts` dòng ~60) = `tg-<tài khoản bot>-<chat>[-t<topic>]`. Lark: `larkThreadKey`, Zalo: `zaloThreadKey`. Hệ quả:
  - Mỗi **tài khoản kênh × mỗi cuộc chat (× mỗi topic)** là một luồng session riêng. Hai tài khoản Telegram khác nhau (GĐ8.7 nhiều tài khoản, mỗi tài khoản trỏ tới một bot aris) không bao giờ chung session dù cùng một chủ nhân.
  - Cả nhóm chat dùng chung một session (key theo chat, không theo người) **[suy luận từ khoá không chứa userId]**.
- `Hub.sessionFor(bot, key, chatId, topic, fresh)` (`hub.ts` dòng ~891): có thread và không `fresh` thì `d.sessions.agent(t.sessionId)` (mở lại, kể cả phiên nguội qua `resolveAgent`); lỗi mở thì cảnh báo log và tạo mới; không thì `d.sessions.create(bot)` → `bindThread` (đẩy session cũ vào `history`). `SessionPort.create` (`aris-channels/src/index.ts` dòng ~90): bot khác Aris thì `arisBots.open(bot)` (session gắn thẻ bot, `via: 'open'`), Aris thì tạo trần ở workspace nhà.
- **Không có xoay tự động.** Tìm `xoay|rotat|quá dài` trong `aris-channels`, `aris-commander`, `aris-memory` không ra logic xoay session. Session Telegram chỉ đổi khi:
  - người dùng gõ `/new` (`command` `'new'` → `sessionFor(..., true)`; chữ "Đã mở phiên mới: bắt đầu lại từ đầu, ký ức lâu dài vẫn giữ nguyên." `copy.ts`),
  - `/resume <số>` (chủ nhân) quay về một trong tối đa 10 phiên cũ của cuộc chat (`threadSessions`, `/sessions`),
  - mở lại phiên lỗi,
  - nút trên thẻ báo cáo routine (`case 'rt'`, dòng ~1458) **gắn lại thread chat sang session của lần chạy routine** để "hỏi tiếp đúng báo cáo đó".
  - Một session Telegram sống bao lâu thì dài bấy lâu, nhờ nén ngữ cảnh của dsh (`compaction`) giữ trong cửa sổ model. Tài liệu có kế hoạch xoay + tóm tắt (docs/phan-tich-kien-truc.md dòng 161) nhưng chưa có mã.
- Đưa tin vào (`Hub.submit`, `hub.ts` dòng ~975–1030): `sessionFor` → (tin riêng của nhóm, tài liệu cho khách thì `agent.inject(notice)`) → `tracker.expect(pending)` → nhánh theo `agent.status` và `settings.busy` (xem mục 5) → `markInbox(running)` → reaction 👀 và gõ "đang soạn" mỗi 4,5 giây.
- Chủ nhân và "người được phép" và khách có mức tin cậy khác nhau (`Trust`: owner/member/guest), quyết định duyệt và công cụ. Khách chung session chat nhưng bị hạn chế **[xem `hub.ts` quanh dòng ~998–1003]**.
- Chủ nhân tương tác "luồng chính" thực tế: chat riêng với bot Telegram là luồng bền, vì key theo chat riêng.

### 2.4 Routine (`aris-routine`)

- `runRoutine` (`aris-routine/src/index.ts` dòng ~345): **mỗi lần chạy mở một session mới** bằng `bots.open(r.bot)` (nên cũng gắn thẻ `'open'`), đổi tên `Routine · <tên>`, gửi `task` như tin người dùng (`mode: 'queue'`), theo dõi trần chi phí `capUsd`, trích kết quả/gợi ý, gửi thẻ Telegram.
- Quyền: `perms: 'read'` (chỉ đọc, việc khác hỏi qua Telegram) hoặc `'bot'`.
- Ghi vào `runs` (`runRecord.sessionId`). Nút "Mở phiên ›" ở trang Routine mở lại session của lần chạy.
- Hệ quả liên quan tới "luồng chính": vì dùng `open()` nên các lần chạy routine của một bot thường **đều là thẻ `via: 'open'` mới nhất** và có thể bị `latestOpen` chọn khi bấm bot trên thanh bên **[suy luận từ mã `latestOpen` không loại routine]**. Với Aris (Commander không thẻ), session routine nằm cùng nhóm "session không thẻ" mà `commander-latest` và danh sách phiên của Aris quét **[suy luận tương tự]**.

### 2.5 `/goal`, `/loop`, `/heartbeat` (`aris-autonomy`)

- Không tạo session mới. Đây là lệnh gõ **trong một session đang có** (`aris-autonomy/src/index.ts`): `goalRecord` khoá theo `sessionId`; giám khảo (model rẻ) chấm cuối mỗi lượt, `done | continue | blocked | wait`; `loopRecord`/`heartbeat` chạy trên lịch nhắc `schedule` của dsh, **đánh thức chính session đó** (`scheduleId`, `sessionId`). Mục tiêu đang chờ việc nền thì tạm dừng và hẹn lịch đánh thức (`waiting`).
- Hệ quả: "việc dài" của một bot bị buộc vào **session nơi gõ lệnh**; người dùng đổi sang session khác thì việc vẫn chạy ở session cũ. Trang "Việc đang chạy" (3.5, `/api/aris/autonomy`) liệt kê theo session.

### 2.6 ACP (`aris-acp`)

- Daemon nghe socket `~/.aris/acp.sock`; `aris-acp --bot <tên>` là khách mỏng. Mỗi kết nối là một nhánh `dsh-acp` dùng model của bot; **mỗi `session/new` (hoặc `resume`/`load` của ứng dụng) tạo session dsh**, gắn thẻ `via: 'acp'` và đưa vào workspace của thư mục `cwd` ứng dụng đưa sang (`resolveByPath`/`create` rồi `attachSession`) (`aris-acp/src/index.ts` dòng ~250–256).
- Phiên khách có bộ quyền riêng (`policy.ts`), và ký ức/vòng học nền bỏ qua phiên khách (`ArisAcp.isGuest`).

### 2.7 Bot ngoài (Claude Code / Codex)

- Không có session dsh. `claude-driver.ts` chạy `claude -p --output-format stream-json`, chuyển xin quyền qua máy chủ MCP `bin/approve-mcp.mjs` và socket cục bộ (`ApprovalHub`, `approval.ts`), làm tiếp bằng `--resume`; `codex-driver.ts` tương tự.
- Mã lần chạy (`runId`) thay cho sessionId; "Aris giao tiếp cho X trong cùng cuộc thì X làm tiếp phiên cũ" (chữ `ext.limitsCli.memory.d`). Trạng thái ở bảng `externals`; kết quả quay lại session Commander giao việc.
- Giới hạn: không chat trực tiếp với bot ngoài; chỉ qua Aris hoặc qua hồ sơ.

---

## 3. Một bot gom bao nhiêu session; có "main thread" không; tìm việc cũ thế nào

### 3.1 Khi nào tạo session mới (đếm theo mã)

| Nguồn | Tạo session mới khi nào |
|---|---|
| Web "Việc mới" | Mỗi lần bấm / phím tắt (session không thẻ = Aris) |
| Web bấm bot | Lần đầu; sau đó dùng lại `latestOpen`. "Việc mới với …" / "＋ Phiên mới" ép `fresh` |
| Văn phòng, gửi tin khi chưa có phiên | Tạo qua `openBotSession(.., true)` |
| Telegram/Lark/Zalo | Lần đầu của mỗi cuộc chat/topic; mỗi `/new`; phiên cũ không mở được |
| Routine | **Mỗi lần chạy** |
| `giao_viec` | Lần đầu giao bot đó trong mỗi session Commander (thành viên team); lần sau nhắn tiếp |
| `giao_phong` | Mỗi lần giao việc lớn cho trưởng nhóm (`sc.create`) |
| ACP | Mỗi `session/new` của ứng dụng |
| Thủ thư (brain ask), kiểm thử skill, nạp bộ não | Phiên phụ riêng (xem `ask.foot` "Mỗi câu hỏi là một phiên của Thủ thư") |
| `/goal` `/loop` | Không tạo, bám session hiện tại |

### 3.2 Ước lượng số session mỗi bot

Không có chỉ số trong mã; đây là **[suy luận]** từ bảng trên:
- Một bot có routine hằng ngày: **≥ 1 session/ngày/routine** (7+ session/tuần chỉ từ routine).
- Mỗi lần bạn bấm "Việc mới" là thêm một session của Aris (không có giới hạn).
- Bot được Commander giao việc: thêm một session con mỗi session Commander có giao bot đó (hiển thị trong bản đồ đội, nhưng `botSessions` đếm chúng vì thẻ `'team'`).
- Telegram: 1 session cho đến khi gõ `/new`. Người dùng ít gõ `/new` thì chỉ có 1 session dài (nén ngữ cảnh), người dùng hay gõ `/new` thì nhiều. Có tối đa 30 mã cũ trong `history`.
- Một ngày dùng đủ kênh có thể sinh 5–15 session cho Aris và vài session cho từng bot **[suy luận]**.

### 3.3 "Main thread" của bot

Không có thực thể nào như vậy. Có 4 khái niệm gần giống, **không nối với nhau**:
1. **Web, bot thường**: "session `via: 'open'` gần nhất" (`BotStore.latestOpen`). Telegram (qua `arisBots.open`) và routine cũng tạo thẻ `'open'`, nên có thể trúng.
2. **Web, Aris**: "session không thẻ gần nhất trong workspace nhà" (`commander-latest`).
3. **Telegram/Lark/Zalo**: thread của từng cuộc chat (`threads[key].sessionId`); độc lập với (1)(2).
4. **Dự án**: `mainSession` (phòng nhóm, chỉ Aris).

Nên "nói chuyện với Minh trên web lúc sáng" và "nhắn Minh trên Telegram lúc chiều" có thể là hai session khác nhau hoặc cùng một, tuỳ phép tính ở (1) và việc có tài khoản Telegram riêng cho Minh hay không **[suy luận]**.

### 3.4 Người dùng tìm việc cũ ở đâu

- Thanh bên **không** liệt kê session. Có: Việc mới, 4 trang (Văn phòng, Brain, Routine, Tự học), Đội hình (bot, trạng thái "Cần chú ý"/"Rảnh"), Dự án (kèm "N phiên"), ô "Tìm trong mọi phiên" (`search`), Cài đặt.
- Văn phòng → bấm bot → ô chọn phiên 5 phiên gần nhất.
- Trang "Tìm trong mọi phiên" (1.6): tìm toàn văn qua `aris-recall` (`/api/aris/recall`), mở đúng phiên.
- Trang Thống kê → "Nhật ký phiên" (`stats.log`) với "Phát lại" từng bước (`rp.*`).
- Telegram: `/sessions` (10 phiên của cuộc chat) và `/resume <số>`.
- Danh sách session thô của dsh (UI gốc dsh) cũng có `switcher.list` "Các phiên với {name}" (`aris-ui-chat-header`, khóa `switcher.*`, `session.newWith` "Phiên mới với {name}").

---

## 4. Ký ức và liên tục giữa các session

### 4.1 Cái gì mang sang session sau

| Thành phần | Cơ chế (file) | Phạm vi | Có tới session mới không |
|---|---|---|---|
| Bản thân bot (tính cách `soul`, vai trò, xưng hô `ownerRecord`) | `aris:bot` context (`aris-bots/src/index.ts`) | theo bot; xưng hô dùng chung cả đội | Có, đọc lại mỗi lần dựng prompt (nhưng đổi tính cách chỉ có hiệu lực ở phiên mới để giữ cache) |
| Ký ức lõi | `aris:memory` context order 300, `renderCore(itemsFor(store, botOf(sid)))` (`aris-memory/src/index.ts`) | cuốn `owner` (hồ sơ chủ nhân) lưu dưới Aris, dùng chung cả đội; cuốn `notes` riêng từng bot (`books.ts`) | Có, mọi session của bot đó; ghi xong có hiệu lực ở bước kế tiếp |
| Ký ức lưu trữ (archival) | tool `memory action=search` | như trên | Không nạp sẵn; chỉ khi bot gọi |
| Nhận định về chủ nhân | `aris:owner-insights` (`aris-reflect/src/index.ts`); nhận định ≥ 0,8 tin cậy nạp theo bot; đầu phiên chọn "nhận định gần câu đầu nhất" (`warmBySession`, theo nghĩa nếu có khoá embedding) | theo bot | Có |
| Skill | `aris-skills`: kho theo bot, chỉ thấy bản đang dùng của skill thuộc bot (mỗi agent gắn nguồn skill riêng) | theo bot | Có |
| Bộ não | `aris:brain` context (order 60): `GUIDE` + `brainMap(readable(r))`, tool `brain_search`/`brain_read` lọc theo quyền | theo quyền đọc của bot/vai | Có |
| Tìm lại phiên cũ | tool `recall` (`aris-recall/src/index.ts`): `search` (FTS qua `ctx.sessionQuery` + tóm tắt có dẫn nguồn `[S1#12]`), `open` (nguyên văn quanh một tin); chỉ dẫn `GUIDE` trong prompt | toàn bộ phiên | Có, nhưng **bot phải chủ động gọi** (khi người dùng hỏi "hôm trước…") |
| Dự án | `<aris-project>` | mọi session của workspace dự án | Có |

### 4.2 Cái gì bị mất khi sang session mới

- **Toàn bộ nội dung hội thoại** (lịch sử tin nhắn, kết quả công cụ, nháp dở) — nó nằm trong log session cũ. Không có "tóm tắt session trước" tự nạp vào session mới (tài liệu có kế hoạch `xoay + mang theo tóm tắt` nhưng chưa có mã). Bot chỉ khôi phục được nếu: (a) nó đã `memory save`; (b) bạn nhắc "hôm trước"; bot gọi `recall`.
- **Ký ức chỉ vào core nếu người dùng nói ra** (`origin: 'user'` → lưu ngay). Điều bot suy ra hay từ nguồn ngoài thành **đề xuất chờ duyệt**, hết hạn sau **7 ngày** (`PROPOSAL_DAYS`, `expire`) — nghĩa là nếu bạn không vào Hộp duyệt, bài học biến mất.
- Tự nhắc lưu (`nudge.ts`): chỉ kích khi có câu như "nhớ là…", "lần sau", "sai rồi…" (`CUE_RE`) hoặc lượt ≥ 8 lần gọi công cụ; `cooldown` 2 lượt.
- Lưu trước khi nén (`watch.ts`): khi dsh ghi `compaction/summary`, lấy đoạn vừa bị nén nhờ model rút ký ức thành đề xuất (tầng lưu trữ, chờ duyệt).
- Vòng học nền `aris-reflect`: sau mỗi lượt có "dấu hiệu đáng học" chạy model rẻ, tối đa 3 đề xuất, trần 0,30 USD/ngày cho cả đội; nhận định về chủ nhân chạy "sau mỗi n lượt của một phiên hay khi phiên đóng" (`own.noRun`). **Bỏ qua** phiên routine, Thủ thư, kiểm thử skill, phiên con, việc được giao, khách ACP, người lạ Telegram (`aris-reflect/src/index.ts` ~391/484 gọi `isRoutine`; `aris-memory` chú thích dòng ~246) — tức việc làm lúc bạn không có mặt không "dạy" bot.
- Việc Commander giao: bot con "nhớ" việc trước chỉ **trong cùng session Commander** (team/member). Session Commander khác thì bot con bắt đầu lại; chỉ còn ký ức lõi + `<aris-routing-history>` (thống kê loại việc, không phải nội dung).
- Bot ngoài: nhớ qua `--resume` trong cùng cuộc.
- Nhiều tài khoản/kênh: cùng bot nhưng khác thread ⇒ khác session ⇒ không chia sẻ gì ngoài ký ức/skill/bộ não.

---

## 5. Đồng thời và chờ duyệt

### 5.1 Một bot có chạy hai việc cùng lúc được không

- **Có, nếu là hai session khác nhau.** Mỗi session có agent riêng; `LiveTracker.running` giữ `Map<bot, Set<sessionId>>` (nhiều session chạy cùng lúc cho một bot), `busyBots` đếm bot đang chạy (`aris-bots/src/live.ts`). Không có khoá "một bot một việc".
- **Không**, trong **cùng một session**: dsh chỉ chạy một lượt một lúc; tin thêm vào hàng đợi hoặc chèn.
- Giao việc của Commander bị chặn theo số bot chạy đồng thời (`maxBusy`, mặc định 6) và 4 bot/lần; bot đã là thành viên đang `running` trong team thì được nhắn tiếp (không tính "fresh").
- Routine có `failStreak`, `catchupHours`, `capUsd`; chạy tay hay theo lịch mở session riêng nên **chạy song song được với chat đang diễn ra** của cùng bot **[suy luận]**.

### 5.2 Người dùng nhắn khi lượt đang chạy

Gốc là hai primitive của dsh: `agent.steer(message)` (chen vào lượt đang chạy) và `agent.followup(message)` (xếp hàng làm tiếp; session rảnh thì chạy luôn).

- **Web, bảng Văn phòng** (`session-send.ts`, `sessionSend`): mặc định `mode = 'steer'`. Đang chạy + `steer` ⇒ `agent.steer`; `queue` hoặc rảnh ⇒ `agent.followup`. Giao diện: nút "Chèn vào việc" / "Xếp sau" (`of.ch.steer`, `of.ch.queue`). Có dừng khẩn cấp (`@aris/guard`) ⇒ 423.
- **Web, chat gốc dsh**: UI dsh có hàng đợi/steer của riêng nó (không đọc trong phạm vi này).
- **Telegram** (`hub.ts` dòng ~1012–1026), cài đặt chung `settings.busy` (mặc định `steer`, các giá trị `steer | queue | interrupt`): người **không phải chủ nhân** nhắn thêm khi bot đang soạn ⇒ huỷ lượt cũ (`cancel`), không gửi câu trả lời cũ (`superseded`), làm lại với cả tin mới; chủ nhân: `steer` ⇒ `agent.steer`; `interrupt` ⇒ `cancel` + `followup`; còn lại ⇒ `followup`.
- Hàng đợi bền cho tin vào: `inbox` (queued/running); khởi động lại giữa chừng ⇒ báo "♻️ aris vừa khởi động lại giữa chừng, đang làm tiếp tin này" (`T.restarted`). Câu trả lời giao qua `outbox`, 1.500 ký tự/khúc.
- **Không bao giờ** tự mở session mới vì lượt đang bận. Tin luôn đi vào đúng session của cuộc chat đó.
- Nếu muốn song song thật trong cùng bot thì phải ở session khác (mở "Phiên mới" trên web) — Telegram không có lệnh nào cho phép chạy hai session song song cùng một cuộc chat ngoài `/new` (bỏ session cũ, session cũ vẫn có thể còn đang chạy **[suy luận]**).

### 5.3 Chờ duyệt (`arisApprovals`) có giữ tiến trình không

- **Session của chính bạn (web, Telegram, Lark, Zalo)**: `approval/request` là waterfall của dsh, trả lời bằng một Promise. Lượt **dừng tại điểm gọi công cụ**, giữ một Promise đang chờ trong tiến trình Node duy nhất (`dsh --profile aris`); không tạo thêm tiến trình. Telegram: gửi thẻ "Cho phép một lần / Từ chối" cho chủ nhân; **hết 10 phút ⇒ `unavailable`** (dsh chặn hành động, fail-closed) và lượt kết thúc bằng thông báo hết hạn (`hub.ts` dòng ~2196–2225, `T.approvalExpired`). Người không phải chủ nhân ⇒ luôn từ chối. `@aris/bots` bọc waterfall bằng `live.waitStart/waitEnd` để thanh bên hiển thị "Chờ {you}"; bot đặt `perms.danger = 'deny'` ⇒ từ chối ngay.
- **Bot trong đội (session con) và bot ngoài, qua hộp duyệt chung `ApprovalCenter` (`aris-commander/src/approvals.ts`)**: web (thanh duyệt/thanh bên) và Telegram cùng đọc một danh sách, bấm ở đâu trước thì ăn. Thành viên team: `approval/request` được trả lời qua `hub.request` (`aris-commander/src/index.ts` dòng ~1556–1577); **hết 15 phút ⇒ từ chối** (`APPROVAL_TIMEOUT_MS`).
- **Bot ngoài**: tiến trình CLI (`claude -p`) **đang sống và bị treo** chờ máy chủ MCP `approve-mcp.mjs` trả lời qua socket cục bộ `~/.aris/run/ap-<pid>.sock` tới khi người dùng bấm hoặc hết hạn.
- Routine chỉ đọc: "lệnh bash không chắc chỉ đọc trong routine giờ bị từ chối kèm hướng dẫn thay vì chờ duyệt 10 phút" (docs/ke-hoach-trien-khai.md, đợt 2 routine): tức chờ duyệt đã từng là điểm nghẽn khi không có người.
- Thẻ duyệt, thẻ ký ức, thẻ skill, thẻ bộ não cùng gửi tới **chat chính (`home`) của bot Aris**, không theo cuộc chat đang nói chuyện **[theo chữ trong docs/specs/aris-telegram.md: "gửi tới chat chính (`home`) của bot Aris, không có thì tới chủ nhân"]**.

---

## 6. Nơi giao diện lộ khái niệm "session / phiên" cho người dùng

**Thanh bên (`aris-ui-sidebar/src/client/locale.ts`)**
- "Việc mới" / "New task" (`session.new`) — nút chính, kèm phím tắt.
- "Tìm trong mọi phiên" (`search`).
- Dự án: "{count} phiên" (`project.sessions`).
- Đội hình: dòng việc lấy tên phiên đang chạy (`workLine` trong `roster.ts` dùng `titles` của phiên khi không có "task").

**Văn phòng (`aris-ui-pages/src/client/office/text.ts`)**
- Ô chọn phiên: "Các phiên" (`of.ch.sessions`), "Phiên chưa đặt tên" (`of.ch.untitled`), "＋ Phiên mới" (`of.ch.new`), "Mở phiên đầy đủ" (`of.ch.openFull`), "Cách gửi: Chèn vào việc / Xếp sau".
- Kanban dự án: "{n} phiên" (`kb.sessions`), "Mở phiên" (`kb.openSession`), "vấp: mở phiên của trưởng nhóm".

**Đầu khung chat (`aris-ui-chat-header`)**
- "Đổi phiên với {name}" (`switcher.open`), "Các phiên với {name}" (`switcher.list`), "Chưa có phiên nào khác." (`switcher.empty`), "Phiên mới" / "Phiên mới với {name}" (`session.new`/`session.newWith`), "Tải nhật ký phiên" (`more.download`), "Đang xuất phiên".

**Trang bot / cài đặt (`aris-ui-pages/src/client/locale.ts`)**
- Hồ sơ bot: "Xoá {name}? Ký ức và các phiên cũ vẫn giữ"; "Áp cho phiên chat mới với bot"; "Thay đổi tính cách có hiệu lực ở phiên mới của {name} để giữ prompt cache cho cuộc chat đang dở"; "Kết nối mới có hiệu lực ở phiên mới của bot"; "Dùng khi phiên của bot đang chạy /goal."
- Hồ sơ chủ nhân: "Đầu phiên mới", "{you} mở phiên với {name}…", "Chạy sau mỗi {n} lượt của một phiên, hay khi phiên đóng".
- Routine: "Mỗi lần chạy là một phiên mới của {name}…", "Mở phiên ›" (`brt.openRun`).
- Tự trị (`/goal`, `/loop`): "Gõ /goal <mục tiêu> trong một phiên chat", "Gõ /loop 5m <việc> hoặc /heartbeat trong một phiên chat", "Mở phiên" (`ap.openSession`, `run.open`).
- Tìm kiếm: "{n} phiên có "{q}"", "mở phiên", "Không phiên nào có "{q}"".
- Thống kê: "Nhật ký phiên" ("mọi phiên đều phát lại được từng bước"), "Phiên chưa đặt tên", "Chưa có phiên nào trong khoảng này", "Phát lại" (`rp.*`).
- Tích hợp ACP: "{n} phiên", "Phiên từ ứng dụng khác chạy trong aris…".
- Sao lưu: "Phiên trò chuyện, tệp đính kèm, dữ liệu các bot".
- Plugin: "Tìm trong mọi phiên", "Mọi phiên dùng chung thay đổi này".
- Skill: "Ca thử (chạy lại phiên cũ)".
- Bộ não: "Mỗi câu hỏi là một phiên của Thủ thư, hỏi tiếp được".

**Telegram/Lark/Zalo (`aris-channels/src/copy.ts` và lệnh)**
- `/new` "Mở phiên mới"; `/status` "Phiên, model, trạng thái"; `/sessions` "Các phiên của cuộc trò chuyện này"; `/resume <số>` "Quay lại một phiên"; thông báo "Đã mở phiên mới: bắt đầu lại từ đầu, ký ức lâu dài vẫn giữ nguyên."; "Đã quay lại phiên: …"; "Số phiên không đúng".

---

## 7. Sơ đồ bằng chữ

```
                         (người dùng)
   ┌─────────┬───────────┬─────────────┬────────────┬──────────────┬─────────────┐
 Web "Việc  Web bấm   Văn phòng   Telegram /    Routine         ACP (Zed,    Commander
  mới"      bot       ChatPanel   Lark / Zalo    (lịch)          Buzz...)     giao_viec
   │          │          │            │             │               │            │
 startSession latestOpen  session    threadKey     bots.open()     session/new   team.spawn
 (không thẻ)  hay open()  -send      → threads[]   MỖI LẦN CHẠY    tag 'acp'     Teammate
   │       tag 'open'      │         sessionFor()   tag 'open'         │         tag 'team'
   │          │            │         /new /resume                     │            │
   └──────────┴────────────┴───────┬─────┴─────────────┴──────────────┴────────────┘
                                   ▼
        MỖI SESSION DSH = 1 log + 1 agent + 1 thẻ bot (aris_bots.sessions; không thẻ = Aris)
        ├─ ngữ cảnh nạp theo thẻ: aris:bot (soul), aris:memory (core: owner chung + notes riêng),
        │    aris:owner-insights, aris:brain, aris:project (nếu thuộc dự án), skill của bot
        ├─ công cụ: memory, recall, brain_*, giao_viec (chỉ Commander), skill, MCP riêng bot
        ├─ vòng đời lượt: followup (xếp) / steer (chen) / cancel; approval/request → Promise chờ
        └─ /goal /loop /heartbeat: bám session này (lịch nhắc đánh thức chính nó)
   Lưu ngoài session (xuyên session): aris_memory, aris_reflect (insights), skill, aris_brain (vault),
        aris_bots, aris_channels (threads → session), aris_routine (runs → session), aris_projects
   Liên session CHỈ qua: ký ức lõi, nhận định, skill, bộ não, và tool recall bot tự gọi.
   Bot ngoài: không session; runId + `--resume` trong cùng cuộc Commander.
```

Ví dụ cụ thể: một tuần với bot Minh (đã có routine hằng ngày và Telegram riêng):
- 7 session routine (`Routine · …`) — mỗi cái một session, mỗi cái gắn thẻ `open`;
- 1 session Telegram (đến khi `/new`);
- n session web (mỗi lần bạn bấm "＋ Phiên mới" hoặc "Việc mới với Minh");
- m session con khi Aris giao việc trong m cuộc Commander khác nhau.

---

## 8. Điểm đau với trải nghiệm "chỉ cần nhắn cho bot"

1. **Bot không phải là thứ bạn nhắn tin cho; session mới là.** Mỗi cửa vào có luật chọn/tạo session riêng (`latestOpen`, `commander-latest`, `threadKey`, `runRoutine`, `team/member`). Không có một API "gửi tin cho bot X" duy nhất sẽ tự quyết session. Muốn có, phải xây mới (đó đúng là vai trò `aris-dispatch` trong docs/phan-tich-kien-truc.md 6.1, chưa có mã).
2. **Không có "main thread" mỗi bot**; các phép "session gần nhất" bị nhiễu bởi routine, Telegram, giao việc, ACP: bấm bot trên web có thể mở lại session của một lần chạy routine hay của Telegram **[suy luận từ `latestOpen` và `commander-latest`]**. Với Aris, "session không thẻ gần nhất" còn gồm các session phụ không thẻ **[suy luận]**.
3. **Kênh nào session đó.** Web và Telegram cùng bot có thể là hai ngữ cảnh khác nhau; nhiều tài khoản Telegram → nhiều luồng; nhóm chat chung một session. Chủ nhân chuyển kênh giữa chừng là mất mạch.
4. **Telegram không xoay session.** Session sống mãi cho tới `/new`; nén ngữ cảnh của dsh làm mất chi tiết đoạn đầu mà không có tóm tắt "đời trước" nạp lại; người dùng phải biết gõ `/new`, `/sessions`, `/resume` — khái niệm "phiên" lộ ra ngay trên điện thoại.
5. **"Việc mới" là hành động của người dùng, không của hệ thống.** Phải tự quyết "bắt đầu việc mới hay tiếp việc cũ"; nút chính trên thanh bên là "Việc mới", ô chọn phiên "＋ Phiên mới", Telegram `/new` — tất cả đẩy việc quản lý phiên cho người dùng.
6. **Không có danh sách "việc" tổng hợp theo thời gian trên thanh bên.** Muốn tìm thì vào Văn phòng → bot → chọn 1 trong 5 phiên, hoặc "Tìm trong mọi phiên". Tên phiên thường là "Phiên chưa đặt tên" (`of.ch.untitled`).
7. **Ký ức xuyên session yếu hơn cảm giác.** Chỉ có (a) điều bạn nói ra ở dạng "nhớ là…" lưu ngay; (b) điều bot suy ra chờ duyệt 7 ngày; (c) `recall` chỉ khi bot nhớ phải gọi. Không có tóm tắt tự nạp "hôm qua ta làm gì" (không có "đầu ngày/đầu phiên" tóm tắt, chỉ có nhận định về chủ nhân). Kỳ vọng của người dùng "bot nhớ cuộc nói chuyện hôm qua" không được đảm bảo.
8. **Việc nền không dạy bot.** Routine, phiên con, việc được giao bị loại khỏi vòng học (`isRoutine`, nguồn "không tin cậy"); bot hoàn thành 30 lần mà không rút kinh nghiệm.
9. **Commander giao việc bị buộc vào session Commander.** Bot con "nhớ" chỉ trong cùng cuộc; kết quả chảy ngược qua team/tin nhắn vào session Commander; mở session Aris mới là mất danh sách "ai đang làm gì" trong cuộc đó (thanh bên vẫn hiện nhờ `LiveTracker`/`activity` nhưng chi tiết nằm trong session cũ).
10. **Việc dài (`/goal`, `/loop`) bám session.** Người dùng sang session khác hoặc kênh khác thì việc vẫn ở session cũ; phải vào trang "Việc đang chạy" mới thấy.
11. **Duyệt gắn vào session nhưng thông báo đi về `home`.** Người dùng đang chat với bot X trên kênh Y nhận thẻ duyệt ở chat chính của Aris; hết 10/15 phút là lượt chết. Trong lúc chờ, session đó đứng (lượt bị treo), nên "cứ nhắn tiếp" sẽ vào hàng đợi `followup` chứ không giải quyết được việc.
12. **Thông điệp hai tầng.** Thanh bên có "Đội hình" theo bot (khái niệm tốt cho "nhắn bot") nhưng nút chính là "Việc mới" và dòng phụ là "phiên": hai mô hình tinh thần chồng nhau. Cài đặt còn nói "có hiệu lực ở phiên mới" — người dùng phải hiểu session để biết khi nào chỉnh sửa bot áp dụng.
13. **Đồng thời không được báo trước.** Hai tin cho cùng bot ở hai session chạy song song, người dùng không biết; ngược lại trong một session, tin thứ hai bị "chèn" hoặc "xếp sau" tuỳ cài đặt (`steer` mặc định có thể làm lệch hướng việc đang làm).

## 9. Điều cần lưu ý khi thiết kế bước tiếp theo

- Các mảnh đã có và dùng lại được: `threads` (key → session, `history`), `inbox`/`outbox` bền, `sessionSend` (steer/followup), `LiveTracker` (bot nào đang chạy session nào), `botOf`, ký ức/nhận định/skill/bộ não theo bot, `recall`, `reportRun`/`ApprovalCenter` tập trung.
- Chỗ cần quyết: đơn vị mới "luồng của bot" (một thread cố định mỗi bot × chủ nhân, xuyên kênh) và quy tắc xoay/tóm tắt; session chỉ là chi tiết bên trong. Hiện không có bảng nào mô tả "thread của bot" ngoài `aris_channels.threads` (theo cuộc chat) và `aris_bots.sessions` (thẻ).
- Mọi phép "session gần nhất" (`latestOpen`, `commander-latest`, `botSessions`, `chatWithAris`) cần loại session có nguồn không phải hội thoại (routine, giao việc, ACP, Thủ thư) nếu giữ nguyên mô hình session.
