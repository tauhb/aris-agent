# Kiểm kê phụ thuộc vào Commander / bot `aris` đặc biệt / singleton toàn cục (31/10/2026)

Phạm vi: chỉ đọc mã `/home/user/aris-agent/packages/aris-*`, `docs/specs`, `docs/ke-hoach-trien-khai.md`, `docs/nghien-cuu/kien-truc-bot.md` (đặc biệt §9). Đường dẫn tính từ `packages/` nếu không có tiền tố. Chỗ suy luận ghi **[suy luận]**. Không đọc tệp khoá. Ký hiệu: **BỎ** = remove, **GIỮ** = keep as-is, **ĐỔI** = convert. Công sức: S (< 1 ngày), M (1–3 ngày), L (> 3 ngày).

## 0. Tóm tắt một đoạn

"Aris là Commander" được mã hoá ở **ba tầng**:

1. **Dữ liệu**: `BotRecord.kind: 'commander' | 'member'`, id cố định `aris` (`aris-bots/src/store.ts:11,116`), và quy ước "phiên không gắn bot = phiên của Aris" (`store.ts:492-495`, `botOf()`).
2. **Hành vi**: bốn công cụ chỉ Commander dùng (`giao_viec`, `chuyen_giao`, `giao_phong`, `moi_noi`, thêm `tao_the`, `tao_routine`, `bat_routine`), luật "bot thường không được `spawn_teammate`", và toàn bộ vòng giao việc dựa trên **đội thử nghiệm của dsh** (`agentTeams`) gắn vào phiên của Aris.
3. **Địa chỉ toàn cục**: khoảng 14 chỗ gọi cứng `sendHome('aris', …)` / `homeAccount() = rtOfBot('aris')` / `store.owners()[0]` / sổ "hồ sơ chủ" lưu dưới `bot = 'aris'`. Đây là các **singleton ẩn** chặn mô hình ngang hàng và chặn cả "bảng người" của §9.2-7.

Phần lớn các gói còn lại (reflect, skills, autonomy, providers, stats, guard, computer, backup, checkpoints) chỉ dùng `'aris'` làm **giá trị dự phòng** khi `botOf()` không trả bot: gần như không phải sửa nếu `botOf()` luôn trả bot thật.

Điều quan trọng nhất cho kế hoạch: **`botOf(sessionId)` trả về `aris` cho mọi phiên chưa gắn thẻ** (`aris-bots/src/store.ts:492`). Trong mô hình luồng, mọi phiên phải có bot (và người). Đổi điểm này là cửa ngõ của mọi thay đổi khác; các nơi `isCommander(sid)` đều suy ra từ nó.

---

## 1. `packages/aris-commander` (~6.000 dòng, 2.077 dòng `index.ts`)

Gói gồm **bốn thứ không liên quan nhau** dồn chung một tên. Tách chúng ra mới quyết được số phận của từng phần:

| Nhóm | Tệp | Là gì | Số phận đề xuất |
|---|---|---|---|
| A. Giao việc qua đội dsh | `dispatch.ts`, `index.ts` (giao_viec 436, chuyen_giao 860, tao_the 511), `learned.ts`, `jobs.ts`, `domain.ts` (dispatch, jobs) | Commander dựng đội dsh, mỗi việc một thành viên | **BỎ** (thay bằng bản ghi việc + `nhan_bot`) |
| B. Phòng nhóm | `room.ts`, `index.ts:1243` (moi_noi), domain `rounds` | Aris mời nhiều bot nói luân phiên trong phiên chính của dự án | **ĐỔI** (thành "luồng phòng") hoặc **BỎ** |
| C. Bot ngoài (Claude Code/Codex) | `external.ts`, `claude-driver.ts`, `codex-driver.ts`, `cli.ts`, `approval.ts`, `index.ts:1792+` | Chạy CLI ngoài, duyệt qua socket, worktree | **GIỮ** nhưng **tách gói** (`aris-external`) |
| D. Hộp duyệt chung | `approvals.ts`, `index.ts:1432` (`arisApprovals`), `hub.opened` 1450 | Danh sách yêu cầu quyền của bot ngoài, bot đội, máy tính | **ĐỔI** (thành duyệt bền theo luồng, §9.2-4) |

### 1.1 Chi tiết từng điểm

| # | Vị trí | Làm gì | Đề xuất | Ghi chú / rủi ro | Công sức |
|---|---|---|---|---|---|
| 1 | `aris-commander/src/index.ts:292-293` `isCommander()` = `botOf(sid).kind !== 'member'` | Định nghĩa "Commander" = mọi phiên không phải bot thành viên, **kể cả phiên chưa gắn thẻ** | **BỎ** | Là điểm rò: 9 chỗ gọi (324, 358, 364, 400, 542, 885, 964, 1264) | S |
| 2 | `index.ts:320-338` ngữ cảnh `aris:commander` | Nạp `GUIDE` giao việc + `learnedContext` chỉ vào phiên Commander; phiên trưởng nhóm đang có `jobOf` nạp `jobContext` | **BỎ** (guide) / **ĐỔI** (learned → gợi ý cho công cụ `nhan_bot`) | `GUIDE`/`CONTEXT_ORDER` định nghĩa quanh dòng 150–195 [suy luận] | S |
| 3 | `index.ts:354-405` chặn `tools/pre-execute` | (a) chặn `spawn_teammate` ở bot thường, (b) Commander tắt `agent` khi `cfg.helpers=false`, (c) giao cho bot trong `cfg.approve` thì hỏi duyệt | **BỎ** (a); **ĐỔI** (c) thành cờ theo bot "cần duyệt khi nhận việc" | (a) là luật "bot thường không tự lập đội": mô hình ngang hàng cho mọi bot nhắn bot khác nên phải bỏ | S |
| 4 | `index.ts:436-510` công cụ `giao_viec` (tối đa 4 bot, song song) → `dispatch()` ở `dispatch.ts:163-285` | Tạo thành viên đội dsh (`spawnTeammate`, dispatch.ts:243), mỗi việc một thẻ, `busyBots`, `MAX_PER_CALL=4`, `MAX_BUSY=6` (dispatch.ts:135-136) | **BỎ** | **Chặn cứng**: đội dsh chỉ 16 thành viên **trọn đời** và không dùng lại tên (kien-truc-bot §9.2-6); trong luồng sống mãi `giao_viec` sẽ hỏng. Thay bằng bản ghi việc (task record) của aris + phiên việc | L |
| 5 | `dispatch.ts:164-165, 188, 199, 205` kiểm tra `me.kind !== 'commander'` / "đã tắt nhận giao việc từ Commander" | Chỉ Commander hoặc trưởng nhóm đang có job được giao; bot `assignable=false` từ chối | **ĐỔI** thành quyền `nhan_bot` theo từng bot (xem §7) | `BotRecord.assignable` (`aris-bots/src/domain.ts:60`) giữ ý nghĩa "nhận việc từ bot khác" | S |
| 6 | `index.ts:511` `tao_the` | Chia việc lớn thành thẻ Kanban (task của đội dsh) | **BỎ** hoặc **ĐỔI** thành "tạo việc" trong bảng việc của aris | Phụ thuộc đội dsh | M |
| 7 | `index.ts:860-945` `chuyen_giao` | Bot đích trả lời, câu trả lời gửi thẳng người dùng (`HANDOFF_RECORD`, `concludeTurn`) | **ĐỔI** thành công cụ ngang hàng `chuyen_cho_bot` (handoff) | Đây chính là "handoff" của mô hình ngang hàng; logic `waitTurn` 15 phút (`HANDOFF_TIMEOUT_MS`, dòng ~111) nên thành việc bất đồng bộ, không giữ lượt | M |
| 8 | `index.ts:948` `giao_phong`, `jobs.ts`, `domain.ts:jobRecord` | Giao việc lớn cho cả phòng ban: trưởng nhóm lập đội lồng, nộp báo cáo; `nested` ≤ 6 | **BỎ**; trưởng nhóm là bot "điều phối" thường, nhận việc qua `nhan_bot` | Trang Phòng ban đọc `?jobs=1` (`ui-pages/team/Department.tsx:77`, `office/data.ts:133`) | M |
| 9 | `index.ts:1243-1340` `moi_noi` + `room.ts` (341 dòng) + domain `rounds` | Phòng nhóm: Aris gọi lần lượt bot trong phiên chính dự án, giới hạn vòng/tin, `stopCommand` | **ĐỔI** thành luồng loại "phòng" (kien-truc-bot §4.1) hoặc hoãn | `Rules.arisSummarizes` trong `aris-projects/src/store.ts:4` | L |
| 10 | `index.ts:585-700` Commander tự học + `learned.ts` | Ghi `outcome`/`answer` mỗi lần giao; thống kê bot × loại việc | **ĐỔI** thành chỉ số trên bản ghi việc; **GIỮ ý tưởng** | Phụ thuộc `awaiting` map theo phiên thành viên | M |
| 11 | `index.ts:620-632` `notify` = `sendHome('aris', …)` | Driver báo kết quả/kẹt về Telegram của Aris | **ĐỔI** thành gửi về kênh gần nhất của người nhận việc | Singleton (xem §9) | S |
| 12 | `index.ts:639-780` + `driver.ts` Driver Kanban | Tự đẩy thẻ trong dự án bật Driver: gọi `dispatch()` vào **phiên chính** của dự án (`resolveAgent(mainSession)`), `slots = parallel - busyBots('aris')` | **BỎ** hoặc **ĐỔI** thành "bot điều phối dự án" nhận việc theo lịch | `busyBots('aris')` dùng chuỗi `'aris'` để loại Commander khỏi đếm (index.ts:397, 671; `aris-bots/src/live.ts:208-212`) | M |
| 13 | `index.ts:397, 671` `busyBots('aris')`, `settings().parallel` | **Giới hạn bận (busy cap)**: số bot chạy cùng lúc ≤ `parallel` (mặc định 6, 1–12) | **ĐỔI** thành giới hạn song song cấp đội (team-level), đếm mọi bot kể cả "điều phối" | Hiện loại Aris khỏi đếm: trong mô hình ngang hàng không còn lý do | S |
| 14 | `settings.ts` (83 dòng), `TaskSpend`, `/api/aris/commander` op `settings` (index.ts:1962) | Cấu hình Commander: `parallel`, `nested`, `budgetUsd` (trần tiền mỗi việc), `helpers`, `approve[]` | **ĐỔI**: `parallel`, `budgetUsd` → cài đặt cấp đội; `approve` → cờ theo bot; `nested`, `helpers` → bỏ | `TaskSpend` theo dõi tiền theo **phiên thành viên** + `arisSpend.onCost` (index.ts:300-310); phải gắn lại vào "việc" | M |
| 15 | `index.ts:1432-1448` `ctx.provide('arisApprovals')` + `ApprovalCenter` (`approvals.ts`) | Hộp duyệt chung: `list`, `answer`, `on`, `ask` cho `source: 'external' \| 'member' \| 'computer'` | **ĐỔI** thành duyệt bền theo luồng (§9.2-4); giữ giao diện `ask`/`list` làm cầu nối khi chuyển | Người dùng: aris-channels (`index.ts:214`), aris-computer (`index.ts:247`), aris-stats (`index.ts:438`), ui-kit inbox | L |
| 16 | `index.ts:1450-1530` `hub.opened(req)` trong `ApprovalHub` | Phân loại yêu cầu theo `run` (`computer:`, `member:<sid>`, bot ngoài) rồi `center.open(...)` | **ĐỔI** cùng #15; **GIỮ** ApprovalHub (`approval.ts`) cho bot ngoài | Bot ngoài vẫn cần socket cục bộ | M |
| 17 | `index.ts:1540-1575` `approval/request` cho thành viên | Chuyển yêu cầu quyền của **phiên con thành viên** về hộp chung; `perms.danger==='deny'` thì từ chối | **ĐỔI**: áp cho mọi phiên có bot, không riêng `members` | Phụ thuộc `members` map (chỉ phiên do `giao_viec` sinh) | M |
| 18 | `index.ts:1792+` `runExternal` + `external.ts`, `claude-driver.ts`, `codex-driver.ts`, `cli.ts` | Chạy Claude Code/Codex trên máy, từng bước, worktree, duyệt, trần tiền | **GIỮ** (tách gói); đổi đầu vào từ "giao_viec" sang "nhắn bot ngoài / tạo việc" | `reportRun` (≈1596) báo "về phiên giao, Aris đọc rồi trả lời" → đổi thành thẻ kết quả trong luồng của người giao | M |
| 19 | `index.ts:1945-2075` `/api/aris/commander` (GET/POST) | Một cửa REST gộp: `external-approve`, `external-stop`, `settings`, `session-stop`, `session-steer`, `session-send`, `room-stop`, `?round`, `?room`, `?external`, `?approvals`, `?externals`, `?jobs`, nhật ký | **ĐỔI**: tách và đổi tên; `session-send`/`steer`/`stop` (dùng bởi Văn phòng, `session-send.ts`) gộp vào "một cửa gửi tin" `threads.send` | Giao diện gọi qua 8 nơi (xem §6) | M |
| 20 | `index.ts:122-130` khai báo `MessageSourceMap['aris-bot']`, `['aris-commander']`, `PluginRecordMap` (`dispatch`, `room-say`, `room-lead`, `handoff`) | Loại nguồn tin / bản ghi plugin mà khung chat vẽ (thẻ nhánh, đầu tin "Aris · Điều phối") | **ĐỔI**: giữ `handoff`, `aris-bot` (thẻ kết quả); bỏ `room-lead`, `dispatch` | Bản ghi cũ trong nhật ký phiên phải còn đọc được (chỉ thêm, không xoá kiểu) | S |
| 21 | `session-send.ts` | Gửi tin vào phiên từ Văn phòng: chen/xếp hàng/dừng | **ĐỔI** thành `threads.send` | §9.3 bỏ ba chế độ bận | M |
| 22 | `package.json` của `aris-bundle` liệt kê `@aris/commander` | Gói nạp | Đổi theo tách gói | | S |

**Tests sẽ vỡ (aris-commander)**: `dispatch.test.ts`, `settings.test.ts`, `learned.test.ts`, `external.test.ts`, `room.test.ts`, `jobs.test.ts`, `driver.test.ts`, `session-send.test.ts`, `approvals.test.ts`, `claude-driver.test.ts` (có chuỗi `'aris'`), `codex-driver.test.ts`. Nhóm C (external, claude-driver, codex-driver, approvals của bot ngoài) có thể giữ nếu tách gói nguyên vẹn.

---

## 2. `packages/aris-bots`

| # | Vị trí | Làm gì | Đề xuất | Công sức |
|---|---|---|---|---|
| 1 | `store.ts:11` `COMMANDER_ID = 'aris'`; `domain.ts:21-23` `kind: 'commander'\|'member'` | Id và loại cố định | **ĐỔI**: `kind` thành `kind: 'bot'` + cờ `coordinator?: boolean` (hoặc quyền); id `aris` thành bot thường (giữ id cũ cho dữ liệu cũ) | M |
| 2 | `store.ts:116-126` `COMMANDER_DEFAULT` ("Chỉ huy… chia việc lớn cho các bot phù hợp") và `store.ts:171-177` `ensureCommander()` (gọi ở `index.ts:150`) | Bot Aris luôn được tạo lần đầu chạy | **ĐỔI**: tạo bot "Aris" **mặc định** như bot thường (có thể xoá); mô tả không còn "chỉ huy" | S |
| 3 | `store.ts:232` sắp xếp Commander lên đầu | | **BỎ** | S |
| 4 | `store.ts:338` "Không xoá được Commander" | Chặn xoá | **BỎ** (nhưng giữ chặn xoá bot cuối cùng) | S |
| 5 | `store.ts:432-439` `policyOf`: Commander không theo chính sách phòng | Aris không bị chính sách web/ghi/shell của phòng | **ĐỔI**: mọi bot theo chính sách của mình; bot điều phối có thể được gán "phòng" riêng | S |
| 6 | **`store.ts:492-495` `botOf()` mặc định về Aris** | Phiên chưa thẻ = Aris | **ĐỔI** (cốt lõi): luồng quyết bot; `botOf` trả `undefined` hoặc bot của luồng | M |
| 7 | `persona.ts:36-40` `renderPersona` | `me.kind==='commander'` → "chỉ huy đội bot"; thường → "phụ trách {vai} trong đội bot", dòng quyền chỉ cho `member` (47-58) | **ĐỔI**: một câu mở đầu chung; dòng quyền áp cho mọi bot | S |
| 8 | `persona.ts:70` "không nhận giao việc từ Commander"; `persona.ts:93-100` "Phòng ban… để người chỉ huy xếp việc lớn đúng phòng"; "Bot ngoài… nộp kết quả về đây khi xong" | Câu chữ giả định có chỉ huy | **ĐỔI** câu chữ | S |
| 9 | `persona.ts` `renderAddress(owner)` + `store.ts:206-225` `owner()`/`setOwner()` (bảng `owner`, khoá cố định `'main'`) | Hồ sơ xưng hô **một người** cho cả đội; tool `xung_ho` (`index.ts:210`) | **ĐỔI** (singleton): thành thuộc tính của **người** (bảng `người`, §9.2-7) | M |
| 10 | `index.ts:296-300` `cwd()`/`ensureHome` cho MCP; `index.ts:399-417` `open(botId)`: Aris **không được gắn thẻ** (`if bot.kind !== 'commander' → tag`) | Mở phiên chat bot; "mở Aris" tạo phiên trần | **ĐỔI**: gắn thẻ mọi bot | S |
| 11 | `index.ts:243-245` ghi tệp: `bot.kind !== 'commander'` mới áp `perms.write` | Aris được ghi tệp không giới hạn | **ĐỔI**: mọi bot theo `perms` (mặc định của Aris = `anywhere`) | S |
| 12 | `index.ts:391` `team/member` event: bỏ qua nếu `commander`; gắn thẻ `via:'team'` | Gắn bot cho thành viên đội dsh | **BỎ** cùng #4 §1 | S |
| 13 | `index.ts:420-440` `rewrite()` "Nhờ Aris viết lại" dùng `effectiveModel(COMMANDER_ID)` | Model dùng cho viết lại tính cách | **ĐỔI**: dùng model mặc định cấp đội | S |
| 14 | `index.ts:494-515, 598-620` `botSessions()`: nhánh `bot.kind==='commander'` lấy "phiên trần trong nhà chưa thẻ, không phải phiên con" | Danh sách phiên của Aris khác bot khác | **BỎ** nhánh (luồng thay) | S |
| 15 | `api.ts:344-348` op `commander-latest` | Bấm Aris → phiên chưa thẻ gần nhất | **BỎ** | S |
| 16 | `api.ts:352,362` không nhân bản / xuất được Commander; `ui-pages/team/CloneBot.tsx:41` | | **BỎ** chặn | S |
| 17 | `live.ts:84-90, 208-212` `assigned()`, `busyBots(except)` | Theo dõi "việc" từ lúc Commander giao; đếm bot bận trừ Commander | **ĐỔI**: nguồn việc = bản ghi việc | S |
| 18 | `index.ts:134, 300` `sendHome('aris', …)` khi kết nối MCP cần đăng nhập lại | Singleton | **ĐỔI** (§9) | S |
| 19 | `assignable` (`domain.ts:60`), `external.assignable` (`external.ts:61`) | "Commander được giao việc cho bot này" | **ĐỔI** thành "bot khác được nhờ" | S |
| 20 | `mcp.ts:87` `TEAM_OWNER='_doi'` | Kho kết nối dùng chung cả đội | **GIỮ** (đây là "tài nguyên đội", hợp lệ trong mô hình ngang hàng) | — |

**Tests vỡ**: `store.test.ts`, `soul.test.ts`, `portable.test.ts` (nhắc Commander), `live.test.ts` (`busyBots`). Nhiều bài kiểm thử `ui-pages/team` dựa `kind`.

---

## 3. Ký ức, học, kỹ năng, mục tiêu

### 3.1 `aris-memory`: `DEFAULT_BOT = 'aris'` (singleton ẩn quan trọng nhất)
- `aris-memory/src/books.ts:5` `DEFAULT_BOT = 'aris'`; `:11` `bookOwner(bot, book) = book==='owner' ? DEFAULT_BOT : bot` → **cuốn `owner` ("hồ sơ người dùng") của cả đội lưu dưới bot `aris`**; `:15-17` `itemsFor`: Aris thấy mọi cuốn của mình; bot khác thấy `owner` của Aris + `notes` của chính mình.
- `index.ts:162-165` `botOf` dự phòng `DEFAULT_BOT`; `index.ts:285-292` tool `search` tìm trong sổ Aris rồi lọc.
- `store.ts:30` `CAPS: {notes:2200, owner:1375}`; `store.ts:57` ghi "cuốn `owner` lưu dưới Commander nhưng có thể do bot khác đề xuất".
- **Đề xuất ĐỔI**: kien-truc-bot §9.2-8 đã chốt "ký ức mặc định riêng của người". Cụ thể: `bookOwner(person, 'owner')`, không phải bot; ký ức chung của bot (notes) thành "bot-wide"; ghi từ người lạ không vào hồ sơ chủ. Cần **di trú**: sổ `aris/owner` → người chủ.
- Rủi ro: cao (đụng prompt từng lượt, đề xuất ký ức, vòng học `aris-reflect`). Công sức: **L**.
- Tests vỡ: `memory/books.test.ts` (dòng 26 kiểm `texts('aris')`), `store.test.ts`, `api.test.ts`, `watch.test.ts`, `index.test.ts`.

### 3.2 `aris-reflect` (ai duyệt, ai học)
- `index.ts:185` `botIdOf` dự phòng `'aris'`; `:400, :487` dự phòng `{id:'aris', kind:'commander'}`; `:681` `?bot=` mặc định `'aris'`.
- Học **mọi phiên có bot** (trừ routine, ACP guest, thủ thư, kiểm thử, `isHelper` 337). Nhận định chủ (`aris:owner-insights`, `insights.ts:344`) nạp theo bot, chủ duy nhất.
- Đề xuất ký ức gửi về `proposals.propose({bot, via:'reflect'})` → thẻ Telegram qua `homeAccount()` của Aris (`aris-channels hub.ts:1893-1900`).
- **GIỮ** logic; **ĐỔI** hai điểm: dự phòng `'aris'` (S) và nhận định theo **người** thay vì chủ duy nhất (M, cùng §9.2-7). Tests: `profile.test.ts`.

### 3.3 `aris-skills`
- `index.ts:142` dự phòng `'aris'`; `:87 PROVIDER='aris'` và `:304 source:'aris'` là **tên thư viện**, không phải bot (GIỮ). `runOnce` (`:459-466`) gắn phiên kiểm thử `via:'dispatch'` với bot thật (GIỮ, nhưng `via:'dispatch'` sẽ phải đổi tên, xem §5 stats).
- `store.ts:9 TEAM_OWNER='_doi'`: **GIỮ** (kho skill chung của đội).
- Tests: `eval.test.ts`, `library.test.ts`, `team.test.ts`, `import.test.ts` (chỉ nhắc `TEAM_OWNER`/`'aris'`, không phụ thuộc Commander).

### 3.4 `aris-autonomy` (`/goal`, judge, `/loop`, `/heartbeat`)
- `index.ts:135-136` `botOf` dự phòng `'aris'`; gắn `bot: botOf(sid)` vào mục tiêu (197, 539); chi phí judge ghi `bot:${…}` (351).
- **GIỮ**. Cảnh báo (kien-truc-bot §9.2-3): `/goal`, lịch dsh, `/loop` gắn với **phiên**, phải theo luồng khi "sang trang". Không phụ thuộc Commander. S (dự phòng).

### 3.5 `aris-brain`
- `index.ts:449,557` `botOf` dự phòng `'aris'`; `:557-562, :1057` `readerOf` quy `role:'commander'` nếu `kind==='commander'`; `access.ts:14,26,36` `role!=='member'` → `readsAll` (Commander và Thủ thư đọc hết, bot thường bị lọc theo phòng/quy tắc).
- `:773` `notify` = `sendHome('aris', md)`; `:1419` tool hỏi bộ não `b0.open('aris')` (mở phiên **trần** của Aris để trả lời).
- **ĐỔI**: `role:'commander'` → quyền "đọc toàn bộ" cấp theo bot/vai (điều phối có cờ), `open('aris')` → mở bot được chọn trong cài đặt; `notify` → kênh gần nhất. Tests: `brain.test.ts`. Công sức M.

---

## 4. Kênh, routine, ACP, daemon, projects, guard

### 4.1 `aris-channels` (kênh nhà / duyệt / ghép đôi chủ)
- `hub.ts:511-513` `homeAccount() = rtOfBot('aris')?.id ?? [...runtimes.keys()][0]` ("tài khoản của Aris gửi thẻ duyệt, ký ức, skill, bộ não"). Dùng ở `hub.ts:1812, 1893, 1988, 2106`.
- `hub.ts:1814, 1857, 1895, 1990, 2108, 2181, 2369` nơi nhận = `bot.home?.chatId ?? store.owners()[0]?.userId`: **chủ duy nhất đầu tiên** làm đích mặc định cho thẻ duyệt, thẻ ký ức, thẻ bộ não, routine, `sendHome`.
- `hub.ts:742-745` ghép đôi: chủ ghép lần đầu ⇒ ghi `home` cho tài khoản đó. `store.ts:134-136 owners()`; `domain.ts:78, 117` vai `owner|member` **toàn cục** (không theo bot/người trong công ty).
- `hub.ts:1444-1448, 2154-2160` chỉ `owner` bấm được nút duyệt; người khác nhận `approvalNotOwner`.
- `hub.ts:2363-2380` `sendHome(bot, md)` là API cho mọi plugin; `index.ts:93` `create(bot)`: **bot ≠ 'aris' → `bots.open(bot)`, còn Aris → phiên trần trong nhà** (khác biệt xử lý); `:202` `notify`; `:315` công cụ `channel_send` luôn `sendHome('aris', …)` (nên bot nào gọi cũng nhắn từ Telegram của Aris); `:387` `bot === 'aris'` coi là hợp lệ khi chưa có `arisBots`.
- `index.ts:205-220` dò `arisApprovals` mỗi 5 giây để `watchApprovals`.
- **ĐỔI** (L): (a) `sendHome(person|thread, …)` thay `sendHome('aris')`: đích suy ra từ luồng/người (kênh gần nhất, §9.3); (b) `homeAccount` bỏ; thẻ duyệt về **chính luồng đang nói** (hiện đã đúng cho lượt từ kênh: `approve()` 2143+; sai cho routine/việc nền/bot ngoài); (c) bảng người thay `owners()[0]`; (d) `channel_send` nhận đích. Công sức L vì Telegram/Zalo/Lark đều có bản sao logic home (xem `zalo/channel.ts:1105`, `lark/channel.ts:499` dùng `trust==='owner'`).
- Tests vỡ: `hub.test.ts` (hàng chục chỗ `'aris'`: 194-245, 271, 386, 685, 925, 1110-1129), `store.test.ts`, `api.test.ts`, `zalo/channel.test.ts`, `lark/channel.test.ts`, `tracker.test.ts`, `telegram/format.test.ts`.

### 4.2 `aris-routine`
- `index.ts:155` `via(bot) = telegramBots().includes(bot) ? bot : 'aris'` — **bot không có Telegram riêng thì giao qua Telegram của Aris**, thêm tên bot làm việc vào đầu tin (`:157-158 heading`). `deliver` (:316-321), cảnh báo lỗi 296.
- `:638, :679` công cụ `tao_routine` và `bat_routine` **chỉ Commander**; `draft.ts:97` bot mặc định `bots.find(id==='aris')`.
- **ĐỔI** (M): routine thành "việc định kỳ" gắn luồng của chủ routine; giao kết quả về luồng và kênh gần nhất; mọi bot tạo được routine **cho chính mình** (quyền rộng hơn cần duyệt). Tests: `draft.test.ts:5,37`, routine tests.

### 4.3 `aris-acp` và `aris-daemon`
- `aris-acp/src/index.ts:250-252` phiên ACP tag bot **trừ khi `kind==='commander'`** (Aris = không thẻ). Khách ACP là phiên "guest" (`isGuest`), được reflect/guard bỏ qua. **ĐỔI**: ACP thành việc gắn luồng (§9.2-10). S–M.
- `aris-daemon/src/index.ts:57-84` `ask(text)` luôn tạo phiên trần trong nhà (= Aris), `:113-115` `send` = `sendHome('aris')`. CLI `aris ask`/`aris send` **không có tham số bot**. **ĐỔI** (S–M): thêm `--bot`/`--to`; `ask` thành việc gắn luồng. Tests: `activity.test.ts`.

### 4.4 `aris-projects`
- `context.ts:61-63` "Thành viên: **Aris chủ trì**; …" và `me.kind==='commander'` thì mới được hướng dẫn giao việc/tao_the/`moi_noi`; bot khác thấy "Bạn là thành viên dự án".
- `domain.ts:26` "không gồm Aris: Aris luôn chủ trì"; `domain.ts:30` `mainSession` (phiên chính duy nhất của dự án, tạo ở `api.ts:53-59 ensureMain`); `index.ts:103` `isMember = kind==='member'`; `store.ts:57-60` `members` ≤ 12; `store.ts:4 Rules.arisSummarizes`; `api.ts:151-160` `card-dispatch` gửi lời nhắc vào `mainSession`; `board.ts` gấp sự kiện đội dsh trong `mainSession` thành thẻ Kanban (`teamOf` index.ts:109-118).
- **ĐỔI** (L): `mainSession` thành "luồng phòng của dự án" (hoặc luồng của bot điều phối dự án); thẻ Kanban đọc từ **bản ghi việc** không phải sự kiện đội dsh; `members` gồm mọi bot (kể cả Aris). Tests: `projects.test.ts` (nhắc cả `Commander` và `'aris'`).

### 4.5 `aris-guard` / `aris-stats` / `aris-providers` / `aris-computer`
- **Guard** `index.ts:96-106` `isBackground`: phiên con, routine, thủ thư, kiểm thử, ACP guest, và `via==='team'|'dispatch'` là "nền" (trần chi phí `teamCapUsd` chế độ `capMode:'background'` chỉ chặn nền). `:158-159` báo ngân sách `sendHome('aris')`. **GIỮ** logic; **ĐỔI** `via` (khi `via:'team'/'dispatch'` biến mất, "việc" phải có cờ nền tương đương) và đích báo. `teamCapUsd` là **trần cấp đội, hợp lệ** (team-level setting). S–M.
- **Stats** `policy.ts:83-95` `classify`: `via==='dispatch'` → nguồn `commander`; `via==='team'||parent` → `giao`. `index.ts:164-168` tên bot giao việc tra "bot của phiên Commander đã giao việc lớn". **ĐỔI** (M): nguồn `commander` → `bot` (bot khác giao); tests `stats.test.ts`, `index.test.ts` (nhắc Commander, `arisJobs`, `arisApprovals`). Nhật ký/feed Văn phòng gọi `arisApprovals.list`.
- **Providers** `index.ts:185, 385` hạn mức phòng chỉ áp cho `kind==='member'`; `:461` phạm vi chi phí `bot:aris`; `:515` dự phòng; **ĐỔI** nhỏ (S): áp cho mọi bot.
- **Computer** `index.ts:123` dự phòng `{id:'aris'}`; `:234-247` việc duyệt máy đi qua `arisApprovals.ask` → hộp duyệt chung (**ĐỔI** cùng #15 §1; trong kien-truc-bot §9.2-4 "Duyệt bền"). Khoá máy theo bot (§9.3) vẫn cần.
- **Backup** `index.ts:86` `sendHome('aris')`; `archive.ts:47` `'aris'` là phần dữ liệu, **GIỮ** (chỉ sửa đích gửi). **Checkpoints** `index.ts:68,161` tác giả git `aris`: **GIỮ**.

---

## 5. Giao diện (aris-ui-*)

`team.commander` là **trường cấu trúc cứng** trong `TeamView` (`aris-ui-kit/src/react/team.ts:404, 428, 453`): `cmd = d.bots.find(kind==='commander')`, `others = kind !== 'commander'`. Mọi màn hình đọc nó.

| Khu vực | Vị trí | Làm gì | Đề xuất | Công sức |
|---|---|---|---|---|
| Mô hình đội | `ui-kit/src/react/team.ts:395-470` (`commander`, `members` "mọi bot trừ Commander"), `COMMANDER` hằng dự phòng | | **ĐỔI**: `bots` phẳng; bỏ `commander` | M (lan rộng) |
| Thanh bên | `ui-sidebar/SidebarRoot.tsx:420,516-523` (hàng Aris riêng đầu danh sách, `viewedBot ?? 'aris'` dòng 435), `roster.ts` ("không gồm Commander") | Aris là mục cố định, "Cần chú ý/Rảnh" chỉ cho thành viên | **ĐỔI**: danh bạ bot phẳng (đúng ý OpenMausBot §5) | M |
| Panel đội | `ui-team-pane/TeamPane.tsx:110,271-287,396-413` + `TeamOrbit.tsx`, `orbit.ts` (Aris ở tâm, bot quay quanh), `locale.ts` ("commander") | Cây đội: Aris gốc, phòng ban là cành | **ĐỔI**: đồ thị ngang hàng/danh sách; bỏ trung tâm | M |
| Đầu chat | `ui-chat-header/Header.tsx:85,112,116,206` | Nhãn vai "Commander" cho Aris; `actions.startSession` cho Aris | **ĐỔI** | S |
| Chat | `ui-chat/index.tsx:130-147`, `Room.tsx:16,119` (`bots.find(kind==='commander')` làm "người dẫn" phòng), `branch.ts:63`, `room-data.ts`, `who-data.ts:6,209`, `Speaker.tsx` | Vẽ thẻ nhánh `giao_viec`, phòng nhóm, handoff | **ĐỔI**: thẻ nhánh → thẻ việc/kết quả; phòng nhóm theo luồng phòng; handoff giữ | M |
| Văn phòng | `ui-pages/office/{model,layout,Overview,ChatPanel,Office3D,scene3d,data,chatModel,feedModel}.ts*` (commander ở bàn trung tâm, `commander: i===0`, `of.ch.coordinating`, `?jobs=1`, `?external=`) | Cảnh 3D, dòng "Vừa làm gì", bảng chat gọn chen/dừng bot | **ĐỔI**: bàn điều phối là bot có cờ; bảng chat gọi `threads.send` | M |
| Bản đồ đội/phòng ban | `team/Map.tsx:33-66`, `Department.tsx` (216, 379, `jobs=1`, "Giao việc lớn"), `CreateProject.tsx:38,102`, `Bot.tsx`, `BotPerms.tsx:20,198`, `BotTools.tsx:333`, `CloneBot.tsx`, `team/text.ts` (12 chỗ), `team/demo.ts:77,158` | Aris luôn có trang riêng khác; quyền/công cụ Commander ẩn | **ĐỔI** | M |
| Cài đặt › Commander | `settings/Commander.tsx` (421 dòng), `SettingsPage.tsx:34`, `settings/text.ts` (20 chỗ) | Trang cấu hình Commander (parallel, nested, trần tiền, trợ lý ẩn, bot cần duyệt, nhật ký định tuyến, thống kê tự học) | **BỎ** trang; chuyển `parallel`/`budget` sang "Đội" | M |
| Hộp duyệt | `mind/Approvals.tsx` (948 dòng; 4 chỗ Commander; `api/aris/commander?approvals=all`), `mind/Runs.tsx:109`, `ui-kit/inbox.ts:43`, `mind/names.ts` | Hộp duyệt chung, chuông "Cần {you}" | **ĐỔI** nguồn dữ liệu sang trạng thái luồng (§4.5 plan) | M |
| Kanban | `auto/Kanban.tsx` (626 dòng; `team.commander` 86; op `card-dispatch`) + `ui-kit/dispatch.ts` | Bảng việc dự án: thẻ do Commander chia | **ĐỔI**: thẻ = bản ghi việc | M |
| Routine UI | `auto/RoutineNew.tsx:239` `botOptions({commander:true})`, `Routine.tsx` | Chọn bot (Aris đứng đầu) | **ĐỔI** `options.tsx:31-37` | S |
| Kênh | `settings/Channels.tsx:269-278` (`target='aris'`, nhãn "mục vào chính" `ch.mainEntry`), `ChannelAccounts.tsx:972-976` | Tài khoản Telegram "chính" = Aris | **ĐỔI**: tài khoản gắn bot/người | S |
| Khác | `mind/Memory.tsx:148` mặc định xem sổ `'aris'`; `team/Search.tsx:13,42,59,136` lọc "aris"; `settings/Guard.tsx:50` 'aris' trong danh sách chặn (đây là thư mục `~/.aris`, **GIỮ**) | | **ĐỔI** nhỏ | S |

**Tests UI sẽ vỡ**: `ui-kit/kit.test.tsx`, `ui-kit/inbox.test.ts`, `ui-kit/ui-kit.test.ts`, `ui-sidebar/sidebar.test.ts`, `ui-pages/office/model.test.ts`, `office/panels.test.tsx`, `office/layout.test.ts`, `ui-chat/branch.test.ts`. (Các `accessories.test.ts`, `accessory3d.test.ts` chỉ nhắc `'aris'` là linh vật: không vỡ.)

---

## 6. Tài liệu / thiết kế nhắc Commander

- `docs/specs/aris-commander.md` (36 lần): toàn bộ spec (giao_viec, chuyen_giao, giao_phong, moi_noi, duyệt tập trung, tự học) → **viết lại hoặc lưu trữ**. Còn ảnh hưởng: `aris-bots.md` (16), `aris-routine.md` (5), `aris-stats.md` (5), `aris-projects.md` (4), `aris-autonomy.md` (2), `aris-telegram.md`, `aris-computer.md`, `aris-brain.md`, `aris-reflect.md`, `aris-providers.md` (1 mỗi cái).
- `docs/ke-hoach-trien-khai.md` (23 lần: GĐ2 "Đội bot và Commander", bảng gói `aris-commander` dòng ~195, `aris-kanban` ~268, rủi ro 214).
- `docs/tinh-nang-aris.md` (21), `docs/giao-dien/ban-do.md` (6), `docs/plans/revamp-cai-dat.md` (4), `gd7-7c-quan-sat.md` (4), `phu-kien-linh-vat.md` (2).
- `design/canvas/Commander.dc.html` (+ ~30 canvas nhắc 1–2 lần: `Kanban`, `HopDuyet`, `HoSoBot`, `TaoBot`, `canvas.json`): bản vẽ giao diện cần sửa lại cho mô hình ngang hàng.

---

## 7. Tính năng chỉ có nghĩa khi có Commander (cần chủ xác nhận bỏ)

1. **Giao việc song song 4 bot trong một lời gọi và thu kết quả có tổng hợp** (`giao_viec` + `wait_agent`). Nếu bỏ: mô hình mới là bot nhắn/nhờ bot khác lần lượt; "tổng hợp nhiều bot" phải do bot điều phối tự làm bằng nhiều lần `nhan_bot` + chờ thẻ kết quả.
2. **Việc lớn cho cả phòng ban** (`giao_phong`, trưởng nhóm lập đội lồng, `nested` ≤ 6, báo cáo về phiên Aris).
3. **Phòng nhóm của dự án** (`moi_noi`, vòng, giới hạn tin, `/stop`, Aris tóm tắt `arisSummarizes`).
4. **Driver Kanban tự đẩy thẻ** + chế độ chia việc tự động/thủ công (Commander chia thẻ người dùng tạo).
5. **Commander tự học** (thống kê bot × loại việc, gợi ý chọn người).
6. **Trợ lý ẩn danh** (`agent`, `helpers`) cho Commander.
7. **Duyệt mỗi lần giao việc cho bot X** (`approve[]`).
8. **Trần tiền mỗi việc** (`TaskSpend`, `budgetUsd`) đang tính theo phiên thành viên của đội dsh.
9. **Chuyển giao một chiều "bot đích trả lời thẳng người dùng"** — **không mất**, được đổi thành handoff ngang hàng.
10. **Nút bấm Aris trên thanh bên = vào cuộc trò chuyện "chính"**; `/ask` và `aris send` luôn đi qua Aris; bot không có Telegram riêng giao kết quả qua Telegram của Aris (routine `via`).
11. **Chỉ Aris được tạo/bật routine** (`tao_routine`, `bat_routine`).
12. **Ràng buộc "bot thường không lập đội"**; mô hình mới cho phép bot nhắn bot, nên mất kiểm soát chi phí vòng lặp bot ↔ bot **[suy luận]**; cần giới hạn độ sâu/số lượt nhắn giữa bot (chống vòng lặp), cùng `teamCapUsd` của guard.

---

## 8. Singleton ẩn chặn mô hình ngang hàng

| Singleton | Vị trí | Hậu quả |
|---|---|---|
| Bot mặc định cho phiên không thẻ | `aris-bots/src/store.ts:492` `botOf` | Mọi phiên mới/nhà/`/ask`/ACP đều là Aris; nhiều gói dùng dự phòng `'aris'` (autonomy:136, skills:142, reflect:185/400/487, brain:449/557, providers:461/515, computer:123) |
| "Sổ hồ sơ chủ" dưới `aris` | `aris-memory/src/books.ts:5-17`, `store.ts:57` | Một chủ cho cả đội; chặn ký ức riêng của người |
| Chủ duy nhất | `aris-channels/src/store.ts:134 owners()`, dùng trong `hub.ts` 7 chỗ; vai `owner\|member` toàn cục (`domain.ts:78,117`) | Thẻ duyệt, ký ức, bộ não, routine mặc định gửi cho `owners()[0]` |
| Tài khoản Telegram nhà | `hub.ts:511` `homeAccount()`; `hub.ts:2363` `sendHome`; 14 chỗ `sendHome('aris')`: `aris-commander:630`, `aris-bots/index.ts:134`, `aris-channels/index.ts:202,315`, `aris-guard:159`, `aris-daemon:115`, `aris-brain:773`, `aris-backup:87`, `aris-routine/index.ts:155` | Mọi thông báo hệ thống đi bằng tài khoản Aris |
| Hồ sơ xưng hô duy nhất | `aris-bots/store.ts:206-225` bảng `owner` khoá `'main'` | Một cách xưng hô cho mọi người |
| Mô hình nhận định chủ duy nhất | `aris-reflect` `insights.forBot(bot)` | Không tách theo người |
| Phiên chính duy nhất mỗi dự án | `aris-projects` `mainSession` | Chưa là luồng |
| Workspace "nhà" duy nhất | `@aris/home` `ensureHome` (dùng ở bots:401, channels:94, daemon:58, brain, ACP) | Mọi phiên trần/nhà chung một nơi [suy luận: cần theo bot hoặc người trong luồng] |
| Đội dsh trong phiên Aris | `agentTeams` `spawnTeammate`, 16 thành viên/đời | Giao việc hỏng vĩnh viễn trong luồng sống mãi |
| `via` rời rạc | `'team'`, `'dispatch'`, `'open'`, `'acp'` (`aris-bots/domain.ts` SessionRecord) | Guard, stats, UI dựa vào giá trị này để phân loại nền/giao |

---

## 9. Thứ tự đề xuất để gỡ (giảm rủi ro)

1. **Không xoá gì trước**: thêm bảng `người`, luồng (cờ `threads.v1`), `botOf` mới song song (§9.2-11). Thêm `coordinator` làm cờ mới, **chưa** bỏ `kind`.
2. Đổi **địa chỉ gửi** (`sendHome('aris')` → đích theo luồng/người): thay 14 điểm bằng một hàm `notify(person|thread)`; chưa đổi hành vi (S mỗi chỗ, gom thành M).
3. Thêm công cụ ngang hàng `nhan_bot` / `chuyen_cho_bot` (từ `chuyen_giao`) chạy trên **bản ghi việc**, không dùng đội dsh. Cho phép mọi bot.
4. Đổi `isCommander` thành kiểm tra quyền (`coordinator` hoặc cờ `can.delegate`); tắt `giao_viec`/`giao_phong`/`moi_noi`/Driver sau cờ.
5. Di trú ký ức `aris/owner` → người; `DEFAULT_BOT` biến mất.
6. Duyệt bền thay `arisApprovals`; gỡ `/api/aris/commander` theo từng op.
7. UI: bỏ `team.commander`, thanh bên danh bạ phẳng, xoá trang Commander.
8. Gỡ `kind:'commander'`, `COMMANDER_ID`, `isCommander`, gói con A/B của aris-commander sau hai tuần chạy thật.

**Ước tính tổng**: ~L ×6, M ×18, S ×30 (khoảng 5–7 tuần một người, chưa tính UI 9.1b). Phần rủi ro nhất: (i) ký ức theo người (đụng prompt cache vì phần đầu ổn định), (ii) thay hộp duyệt bằng duyệt bền, (iii) thay đội dsh bằng bản ghi việc mà vẫn giữ trần tiền và đếm bận.

## 10. Giới hạn của bản kiểm kê

- Chưa đọc từng dòng `aris-commander/src/index.ts` (2.077 dòng), `room.ts`, `claude-driver.ts`; số dòng `GUIDE`/`CONTEXT_ORDER` và `reportRun` là suy luận từ vị trí gần nhất. Chưa chạy `pnpm test` nên danh sách test vỡ suy từ `grep` (ba mức: nhắc Commander, nhắc `'aris'`, nhắc `agentTeams`).
- `aris-ui-pages` có hàng trăm chuỗi dịch (`text.ts`) nhắc "Aris"/"Commander": liệt kê theo tệp, không theo dòng.
- Không kiểm tra dữ liệu thật trong `~/.aris` (kích thước sổ `aris/owner`, số phiên chưa thẻ) nên chi phí di trú chưa đo.
