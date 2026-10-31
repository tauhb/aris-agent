# Adversarial review: "Kiến trúc lấy bot làm gốc" (docs/nghien-cuu/kien-truc-bot.md)

Reviewer: independent architect, read-only. Paths are relative to `/home/user/aris-agent`. dsh package docs are under `node_modules/.pnpm/@deepseek-ai+dsh-<pkg>@0.2.1-rc.2_*/node_modules/@deepseek-ai/dsh-<pkg>/` and cited as `dsh-<pkg> README:line`.

## 0. Verdict

**Approve with changes.** The direction is right. "Thread = (bot, person), dsh session = page, long work in side sessions" fits dsh well, and the three decisions the owner approved hold up. But four parts of the plan, as written, are wrong on dsh or would break features that ship today:

1. **Rollover by `fork` does not do what the plan wants.** A dsh fork copies the whole event prefix from seq 0, so it shrinks nothing.
2. **Durable approvals.** "followup with requestId" dedupes the prompt, not the external effect. The design needs an args-bound grant store.
3. **Commander `giao_viec` breaks in a long-lived Aris thread.** The dsh agent-team allows 16 members per session, ever, and names are never reused.
4. **Shared memory, recall and persona assume a single owner.** In a per-person thread they leak or misattribute.

The fixes are not large. Make the change behind a flag, add pointer tables, and leave the dsh logs alone.

---

## 1. Factual errors in the proposal and the research

| # | Claim | Where | What the code/docs say |
|---|---|---|---|
| F1 | "Sang trang ngầm: `fork` sang phiên mới … giữ phần đầu ổn định"; research 2 §1.2 and row 3 recommend fork to bound cold-resume cost | kien-truc-bot.md §3 table, §4.3, §8; 2-dsh…md:33, :170 | `fork()` "copies an exact inclusive event prefix (default: the last event)" (`dsh-session README:80`). The controller forks "from an exact event prefix; `atSeq` is the inclusive cut" (`dsh-api-session-controller lib/types/commands.d.ts:45-52`). The child carries the full log, shadowed events included. Log size, replay time and surface all stay the same; you only get a second copy. The cache argument for fork also holds for simply continuing the same session. A fork also leaves `/goal` disarmed (`dsh-goal-round-driver README:57`). |
| F2 | "thẻ duyệt về chat của Aris chứ không về chat đang nói" | kien-truc-bot.md §1; 1-aris…md:223 | False for owner turns. `Hub.approve` posts the card in the chat of the current turn (`aris-channels/src/hub.ts:2148-2161`, `approvalCard(rt, chatId, threadId…)` with `turn.last.chatId`). Only unattended sessions go to `home` (`approveHome`, hub.ts:2167-2185, used by routine at `aris-routine/src/index.ts:273-280`). Zalo cannot show buttons: it tells the owner to approve on web and returns `undefined` (`zalo/channel.ts:1478-1492`). |
| F3 | "Câu hỏi không giữ tiến trình: **Có** (chế độ `timed`)" | §3 table | dsh can do it, but aris does not use it. Shipped presets use blocking mode (`dsh-tool-ask-user README:30`), and `packages/aris-bundle/cordis.patch.yml` does not set `mode: timed`. The channel answerers (`hub.ts:2228+` `ask`) await buttons in-process. Turning it on means config plus rewriting the answerers to use the `answer` remote method. |
| F4 | "followup có `requestId` để thao tác chỉ chạy một lần" | §4.5, §3 table | `requestId` dedupes **prompt admission** (session-controller `prompt`). It says nothing about whether the approved tool call runs exactly once. After a turn ends, the model re-issues the call with a new `callId` and possibly different arguments. `dsh-user-approval` has no grant store and "The request carries no tool arguments" (`README:153-155`). |
| F5 | Routines in the thread "như Rakazo (đơn giản hơn nhưng … chỉ một việc một lúc)" | §7.2 | According to the team's own Rakazo report, routine runs "read **no thread history** … post their output into the thread" and different runs are serialized only on the **computer** lease (3-rakazo…md §2). So Rakazo is closer to "side session + result card" than the proposal says. The choice is less of a fork in the road than it is presented. |
| F6 | Takeover ("Cầm lái") listed as missing | §3 table | Missing in dsh, but aris already has a per-lane takeover in Zalo: the owner types and the bot goes quiet for `HAND_MS` = 10 min; "gặp nhân viên" gives `HUMAN_MS` = 2 h (`zalo/channel.ts:174-180, 683-705, 919-935`). It is in-memory, not durable. Generalize it rather than reinvent it. |
| F7 | Entry-point list (web, channels, routine, giao_viec, ACP) | §1 | It misses `aris ask` / daemon `/ask`, which creates a new **untagged** home session on every call (`aris-daemon/src/index.ts:57-65`). These are used by cron scripts, so they pollute "Aris's latest session" today and would pollute a thread tomorrow. It also misses the Telegram routine-card button, which **rebinds the chat thread to the routine run's session** (`hub.ts:1458-1476`). That breaks the one-thread invariant and must go. |
| F8 | "vòng học nền bỏ qua … phiên con, việc được giao" | 1-aris…md:190 | Only partly true. `aris-reflect` skips only *untagged* child sessions: `isHelper` returns false as soon as a session has a bot tag (`aris-reflect/src/index.ts:337-338`), so `team`-tagged sessions **are** reflected. The memory tool, not reflect, downgrades them (`aris-shell/src/trust.ts:45`). |
| F9 | "Giữ cache DeepSeek: phần đầu ổn định; thu gọn chỉ phá cache một lần" | §3 table | True per request, but it misses the real cost driver. A turn on a session whose surface is S tokens pays roughly S cached-input tokens per **step**. With a 1M window, compaction fires near 800k (2-dsh…md:150). An "immortal" thread drifts into hundreds of thousands of tokens per step, slower prefill and worse quality long before compaction helps. When the provider cache expires (overnight, after eviction), the first message re-prefills all of S at full price. |

Smaller points: `aris-recall` already writes plugin records with `appendPluginRecord` (`aris-recall/src/index.ts:13,120`), which dsh says outside packages must not do (2-dsh…md:25). That is acceptable today, but don't build thread state on that pattern. The research is otherwise accurate where I checked: `botOf` falls back to Commander (`aris-bots/src/store.ts:493-496`), `latestOpen` (`:499-505`), the non-owner supersede (`hub.ts:1018-1026`), the Telegram 10-minute approval timeout (`hub.ts:345, 2210`), and the approval in-turn requirement (`dsh-user-approval README:153`).

---

## 2. Is the thread model sound on dsh?

**The core idea is sound.** A dsh session is an append-only, crash-safe log with a durable inbox, steer/followup, single-writer locking and cache-stable prefixes. That is a better "page" than Rakazo's approach of rebuilding the prompt each run from a 50-message window. Keep the dsh session as the model context. Don't copy Rakazo's per-run context assembly.

### 2.1 Rollover ("sang trang") must be a new session seeded by a summary, not a fork

- **Mechanism.** At idle (no open turn, no jobs or subagents; use the workspace archive-admission signal), create a new session in the same workspace. Then tag it with the bot and thread (Commander included: today Commander sessions are *untagged*, `aris-bots/src/index.ts:404`). Select the bot's model and inject one seed message: a rollover summary plus the last N user/assistant exchanges verbatim. Then repoint `thread.current`.
- **Cache.** The system prompt and tool schemas are byte-identical, so they still prefix-hit. The seed costs one miss of a few thousand tokens. That is cheaper than keeping a 300k surface warm.
- **When.** Trigger on a **surface-token budget** read from the `contextPressure`/`tokenUsage` projections (e.g. 96–128k), not on compaction. Also roll over on: a user "chủ đề mới" marker, a bot config change (persona, MCP, model, skills; see §6), and agent-team saturation (§4).
- **What rollover must carry or migrate** (none of this is in the plan):
  - `dsh-schedule` tasks are bound to the original session (`dsh-schedule README:12`). Model-created reminders and `/loop`/`/heartbeat` (`aris-autonomy/src/index.ts:531-544`) would keep waking the **old page**. Rollover must recreate them on the new page, or the thread must own scheduling (`aris-routine`) and deliver through `threads.send`.
  - `goalRecord` is keyed by `sessionId` (aris-autonomy).
  - Pending approvals and questions on the old page.
  - Channel `threads.history` (≤30 entries).
  - The memory pre-compaction extraction (`aris-memory/src/watch.ts`) listens for `compaction/summary`. Rollover must fire the same extraction, or the facts in the summarized span are never proposed.
- **Alternative or complement.** dsh-compaction-basic's `thresholdRatio` can be lowered in the aris profile. That bounds the surface without any aris code, but it is global and does not bound log growth. Use both: compaction as the safety net, rollover as the policy.

### 2.2 Cold resume and idle eviction

Resume replays the whole log (`dsh-session-query` limitations; 2-dsh…md:30). Without rollover a months-long thread gets slower to reopen after each eviction or restart. Rollover fixes that, which makes idle eviction safe. Treat eviction as **could**: one company with tens of bots on one server is unlikely to need it in 9.1. **Measure first**: resume time and RSS per live agent at 10/50/200 MB logs.

### 2.3 Concurrency between the main thread and side tasks

- dsh only serializes **within** a session. A side task and the main thread run in parallel in the same workspace and cwd, so they can edit the same files, and later drive the same bot computer.
- Today `@aris/computer` is "một bot một lúc" (ke-hoach GĐ8.3), which is the right primitive. Make it a per-bot **resource lease** (computer, browser profile, files under a project dir) that tasks acquire. Rakazo's `ComputerExecutionLease` is the right thing to copy here.
- File edits need either a per-task checkout (git worktree, as `aris-checkpoints` hints) or a lease on the project directory. Pick one before 9.2.
- `LiveTracker.busyBots` counts bots, not tasks (`aris-bots/src/live.ts:209`). With side tasks, "bot busy" must be computed per thread *and* per task, or the sidebar lies.

### 2.4 Ordering when web and Telegram arrive together; cross-channel steering

- dsh orders by inbox arrival. The channel adapters do async pre-processing first: STT transcription up to 120 s (`hub.ts:921`), file downloads, and the Zalo 5 s gather (`zalo/channel.ts:174, 812`). A Zalo voice note recorded *before* a web message can therefore land after it.
- `threads.send` should stamp a receipt sequence at ingress, before pre-processing, and release messages to dsh in that order per thread. The per-lane promise chain in Zalo (`zalo/channel.ts:795-804`) already does this for one channel; lift it to thread level.
- **Cross-channel steering** works mechanically. The tracker attributes the turn result to every channel that has a pending message in that turn (`tracker.ts` header: web-only turns are not sent to Telegram), so a Zalo note that steers a web turn gets the answer on Zalo too.
- The semantic risk is a casual message derailing a long run. That is another reason to keep long runs out of the main thread (decision 2), plus a visible "Dừng" button. Make the rule explicit: **steer only into conversational turns; messages during a task card go to the thread, not the task**, unless the user replies on the card.
- **Proactive output is not routed anywhere.** Result cards, routine reports and reminders have no pending channel. They need "deliver to the person's last-active channel; web always shows it". The plan says nothing about this.

### 2.5 Customer threads on the shop's Zalo vs the owner's thread

Keeping customer and group threads separate ("khách", "phòng") is essential. Today a non-owner message *cancels* a running turn (`hub.ts:1018-1021`). That is fine in a 1:1 customer chat, but in a "phòng" thread with several staff, anyone can kill a colleague's turn. Rooms need their own busy policy.

Three missing cross-thread actions:
- The owner's thread should receive the "khách cần người" alert as a card. Today it goes through `d.notify` (`zalo/channel.ts:934`).
- The owner should be able to say "trả lời khách X: …" from their own thread. That needs an owner-only tool that posts into the customer thread, never the other way.
- The owner's own direct Zalo reply (takeover) should be appended to the customer thread as a sourced message, so the bot knows what was promised.

Never let customer-thread content flow into the owner's thread except by quoting, and never let the owner's book flow to customers. That second point matters because the `owner` memory book is shared across bots today (§5).

---

## 3. Durable human waits

The shape ("end the turn, persist, resume on answer") is right. As specified it is not correct on dsh. Required design:

1. **Hybrid wait.** Keep the in-process `approval/request` await for a short foreground window (e.g. 2–3 min, the `askTimed` pattern). Quick answers then keep the turn intact: exact call, warm cache, no re-planning. Only when the window expires does the answerer return `rejected` with a model-visible reason ("đang chờ {person} duyệt, mã A12; không thử lại; báo người dùng và dừng").
2. **Grant store bound to arguments.** Record `{thread, page, tool, canonicalArgsHash, approver, expiresAt, state}`. Arguments come from `tool/call` events; aris already does this in `aris-commander/src/index.ts:1549-1555` because dsh does not pass arguments. On approval, `followup` a sourced message ("A12 đã được duyệt"). When the model re-issues the call, a `tools/pre-execute` + `approval/request` listener finds a matching *unused* grant and auto-allows **once**. A mismatched hash asks again. That is how "the approved action runs exactly once" becomes true. `requestId` only stops a double prompt.
3. **Don't re-ask while pending.** If the same hash is already pending, block re-asks with a deny-and-explain, or the model will loop.
4. **Mid-batch.** dsh may run the other calls in a batch while one waits. Document that a pending approval produces a rejection result in the batch and that the model re-plans on resume. For side-effecting tools prefer sequential execution, as Rakazo does ("Main-tool batches run sequentially so a pause captures completed preceding calls").
5. **External-effect idempotency.**
   - `exec.callId` is not enough, because a re-issue gets a new id and `TOOL_OUTCOME_UNKNOWN` after a crash invites a retry.
   - Channel send tools need an effect key: (thread, recipient, content hash, ~10-minute window). Check it in the outbox before sending. A double send on Zalo is a real business harm and burns the daily quota (`leftToday`, `zalo/channel.ts:111`).
   - Record each effect before sending and mark it done after, so crash recovery can tell the model "already sent".
6. **Timeouts.** Remind at 4 h and expire by kind (24 h for approvals, 30 min while holding a computer lease), as in Rakazo. **Re-validate stale grants** (prices, stock) when they are approved late: after more than 1 h, the follow-up asks the model to re-check before acting.
7. **Where to answer.** Use one `ApprovalCenter`-style list (`aris-commander/src/approvals.ts`), already "first answer wins" across web and Telegram, made durable. It is visible in every surface of the thread's person. Zalo has no buttons, so the owner needs a text reply ("duyệt A12"). That is safe only in the owner's own thread and only from the paired identity.
8. **A note on steering while waiting.** While the in-process window is open, the agent is `running` and a steer parks until the approval returns (2-dsh…md:203). A user typing "thôi đừng gửi" therefore needs the adapter to map it to *reject* on the open card, not just a steer.

---

## 4. Migration and blast radius

### 4.1 What breaks, by module

| Module | Breaks / needs change |
|---|---|
| `aris-channels` hub, zalo, lark (+ `hub.test.ts`, channel tests) | `sessionFor` / `bindThread` per chat key; `/new`, `/sessions`, `/resume`; `'rt'` rebind; approval and question answerers; `turnOf` trust; typing and outbox keyed by session |
| `aris-bots` store, api, index (+ `store.test`, `portable.test`) | `latestOpen`, `open`, `commander-latest`, `botSessions` (5 sessions), Commander untagged default, "có hiệu lực ở phiên mới" semantics |
| `aris-commander` dispatch (+ `dispatch.test`, `room.test`) | **Team roster is per Lead session** (`TeamId = SessionId`) with **`maxMembers` 16 "including failed ones"** and names that are never reused (`dsh-experimental-agent-team README:51,60,126`). `dispatch.ts:237-244` respawns under the same handle after a failure, which then fails forever on that page. A continuous Aris thread exhausts delegation. |
| `aris-routine` | A session per run is fine as a side session, but "Mở phiên", the Telegram card rebind and `approveHome` need a thread target |
| `aris-autonomy` | `/goal` runs in the same session by design (`dsh-goal-round-driver README:12,126`). In the main thread it would hold the thread "running" for hours, so it must spawn a task session. Loops are bound to the session. |
| `aris-projects` | `mainSession` + Kanban driver reads that log; the project's Team = the main session's Team. A project is a **workspace (cwd)**, and a thread page lives in `home`, so "work on project X" from the thread must open a task in the project workspace. Needs a design. |
| `aris-acp` (+ `acp.test`) | ACP clients own session lifecycle (`session/new`, `load`). **Do not** route ACP into the thread (the §4 diagram does). Keep ACP sessions as tasks linked to the thread. |
| `aris-reflect` | `warmStart` once per session (`index.ts:267-276`). With long pages, insights picked from the *first ever* message go stale. Rollover and eviction re-warm. Profile runs on `session/disposed` (`:316-324`). |
| `aris-memory` | Pre-compaction extraction must also run on rollover; the default `book: 'owner'` is shared (§5) |
| `aris-recall` | Searches **all** sessions, excluding only the current one (`index.ts:109-113`). It needs thread/person scope and must include old pages of the same thread first. |
| `aris-stats`, replay, skills cases | Still work per session; the UI wording ("Nhật ký phiên") needs a thread view |
| `aris-daemon` `/ask` | Route to the thread or to a task |
| UI: `aris-ui-sidebar` SidebarRoot, `aris-ui-pages` office ChatPanel and Office (+ `panels.test.tsx`), `aris-ui-chat-header` switcher, `aris-ui-chat` Speaker (`openBotSession`), team Map and Bot | Every "Phiên" affordance. The full dsh chat view renders one session, so infinite scroll across pages needs an aris renderer or a visible page divider. |

### 4.2 Incremental, reversible order (flag `threads.v1`, per bot)

0. **Spike (3–4 days, no product code).** Measure:
   - cold-resume time vs log size;
   - steer during an approval wait;
   - a schedule after rollover;
   - agent-team behavior after 16 members;
   - per-step cost vs surface;
   - Zalo text approvals.
1. **Data, additive only.**
   - New `aris_threads` table `{id, bot, person, kind: rieng|phong|khach, pages[], current, state, lastChannel, flags}` and a `people` table mapping channel identities (Telegram userId per account, Zalo id, web login) to a person. Today the owner is `person: owner`.
   - Backfill: page 1 = the owner's Telegram private thread for that bot if it exists, else `latestOpen`, else the newest untagged home session for Aris. Every other session becomes a searchable old page.
   - dsh logs untouched. Keep `aris_channels.threads` dual-written so turning the flag off restores the old routing exactly.
2. **One send door.** `threads.send(person, bot, msg, origin, receiptSeq)` with steer/followup rules. Channels and the web Office call it when the flag is on. Add proactive delivery to the last-active channel.
3. **Tasks.** Routine runs, `/goal`, `giao_viec`, ACP and `/ask` become task sessions tagged `{thread, task}` and post a result card. Remove the `'rt'` rebind. Move `giao_viec` off the Commander session's agent team: either a team inside each task session, or direct bot-to-bot sessions with an aris task record.
4. **Durable approvals** (§3), then timed questions.
5. **Rollover** as a new session plus summary, with schedule and goal migration and recall scope.
6. **UI.** Remove "Việc mới", `/new` → topic marker, keep `/sessions` behind an admin "Lịch sử trang" for one release.
7. **Remove old paths** after two weeks of real use with the flag on for all bots.

---

## 5. Company mode readiness (9.3)

The plan says per-person memory will be "tách" (§4.6) but designs none of it. Today:

- **Memory.** The `owner` memory book is one shared book stored under Commander and read by every bot (`aris-memory/src/books.ts:4,11,17`), and it is the **default** book on `save` (`aris-memory/src/index.ts:243`). An employee saying "nhớ là tôi…" would write into the boss's profile, and every bot would read it.
- **Persona.** Rendered with a single global `store.owner()` (`aris-bots/src/index.ts:197`), so every staff member gets addressed as the owner.
- **Insights.** `aris-reflect` keys owner insights by bot (+ shared), not by person.
- **Recall.** Unscoped across all sessions, so staff could recall the boss's chats and customer chats.
- **Trust.** Decided per *session* (`aris-shell/src/trust.ts:32-47`), not per sender.
- **Review.** Reflect and skill proposals go to the single owner's review box. In company mode, a boss reviewing proposals would read staff's private conversation content.

**Design now, in 9.1, so 9.3 is not a rewrite.** All of it is cheap fields and filters:

1. `person` on every thread, on every inbound message (`MessageSource` with sender id), on every memory item, insight, skill proposal, approval and cost ledger entry.
2. Memory scopes `bot-shared | person-private | bot-learned(from person)`. Default writes in a person thread go to `person-private`. Promotion to `bot-shared` is a proposal reviewed **by the same person first**, with provenance shown ("học từ An"). That follows OpenMausBot's rule: "a turn may only read what everyone who sees the answer may see".
3. Persona address (`xưng hô`) per person, resolved from the thread.
4. Recall and search scoped to `(bot, person)` by default. Owner-wide search is an explicit privileged tool, not the default.
5. Approver = thread person (later: delegation chain), stored on the grant.
6. Room threads: reads limited to memory visible to all members; trust per *turn sender*.

The dsh multi-principal pieces (`PrincipalMap`, `registerPolicy`) only matter if staff use the dsh web gateway directly. The aris-owned identity layer above is needed either way.

---

## 6. Simplicity for the user

What the plan gets right: bots as contacts, one scroll, cards in-line, no "phiên".

What adds complexity:

- **"+ Việc" is "Việc mới" renamed.** The user must still choose "message or task?". Make promotion automatic:
  - the model gets a `bat_dau_viec` tool;
  - aris auto-promotes a turn that exceeds ~2 min or N tool calls into a task card ("Mình làm việc này ở nền, xong báo");
  - "+ Việc" is just a shortcut.
- **"Chủ đề mới" must mean something.** If it only draws a divider, users will see the bot still "remembering" old context and conclude it is broken. Make it trigger a rollover (new page plus summary). That is the hidden `/new` without the word "phiên".
- **Config edits.** Today they say "có hiệu lực ở phiên mới". With no visible sessions, say "áp dụng từ tin sau" and trigger a rollover on persona, model or MCP change. Otherwise users will never see their edits take effect.
- **Busy modes.** Today there are three (`steer | queue | interrupt`, `settings.busy`). Drop them: steer by default plus a "Dừng" button.

What is missing for "just message the bot":

- proactive delivery to the right channel;
- unread state per thread;
- "Cần {you}" derived from thread and task state (the plan says this; make it the *only* inbox);
- approvals answerable from the channel you are on (Zalo text);
- a first-message onboarding per bot;
- search that just works without knowing pages exist.

---

## 7. Missing pieces, priorities, cuts, and what to reject

**Missing:**
- an identity/people table (the whole design depends on knowing that Telegram user 123 and Zalo id 456 are the same person);
- outbound routing;
- resource leases;
- schedule and goal migration on rollover;
- Commander team saturation;
- projects vs. thread cwd;
- an `/ask` entry point;
- an effect-idempotency table;
- an observability page per thread (pages, tasks, costs) for debugging, since the user no longer sees sessions.

**Priorities.** Agree that 9.1 must come before 9.2/9.3. Inside 9.1, the order is: people + thread pointer + send door → tasks → durable approvals → rollover → UI. The OpenMausBot-style Office redesign should be 9.1b. Bundling a full UI redesign with a routing rewrite doubles the blast radius.

**Cut or defer from 9.1:**
- idle eviction (measure first);
- the generic takeover ("cầm lái") beyond what Zalo has; it belongs to 9.2 with the computer lease;
- Lark parity (do it after Telegram and Zalo prove the model);
- infinite cross-page scroll (a page divider with "xem trang trước" is enough at first).

**Reject rather than copy:**
- Rakazo's per-run prompt rebuild from a DB message window. It fights dsh's append-only cache model, which is aris's advantage.
- Rakazo's one-owner-per-bot data model.
- Rakazo's Postgres/encryption stack for now (the plan already defers it).
- OpenMausBot's "mặc định toàn quyền, có nút hoàn tác". Undo does not exist for a message sent to a customer or an ad budget change.
- OpenMausBot's CLI-as-runtime (irrelevant with dsh).
- Merging *group* or *customer* channels into a person's thread. The plan already keeps them separate; keep that rule hard.

---

## 8. Required changes

### Must

1. **Replace fork-based rollover with "new session + summary seed".** Reason: `fork` copies the full prefix (`dsh-session README:80`), so it bounds nothing and disarms goals.
2. **Trigger rollover on a surface-token budget (~100k) and on topic markers or config changes.** Reason: per-step input cost and latency grow with the surface, and with a 1M window compaction arrives far too late.
3. **Migrate `dsh-schedule` tasks, `/loop`/`/heartbeat`, goal records and pending approvals on rollover, or own them at thread level.** Reason: schedules deliver to their original session.
4. **Implement durable approvals as a hybrid foreground wait plus an argument-hash grant store with single-use auto-allow on re-issue.** Reason: `requestId` only dedupes prompts, and dsh approvals carry no arguments and no grants.
5. **Add an external-effect idempotency key for channel sends and other side-effecting tools.** Reason: re-issue and `TOOL_OUTCOME_UNKNOWN` retries can send a Zalo or customer message twice.
6. **Move `giao_viec` off the long-lived Commander session's agent team.** Reason: 16 members ever, including failed ones, and names that are never reused, would permanently break delegation in a continuous thread.
7. **Add a `people` identity table and put `person` on threads, messages, memory, insights, proposals, approvals and costs now.** Reason: decision 1 cannot work without cross-channel identity, and 9.3 would otherwise be a rewrite.
8. **Make person-private the default memory scope and stop defaulting `save` to the shared `owner` book in person threads.** Reason: today any user's "nhớ là…" lands in the shared owner profile read by all bots.
9. **Scope `recall` and search to (bot, person) by default.** Reason: it currently searches every session, including customers' and other people's.
10. **Keep ACP, routines, `/goal`, `/ask` and project work as task sessions linked to the thread, and remove the Telegram `'rt'` rebind.** Reason: they own their lifecycle or cwd, and the rebind breaks the one-thread invariant.
11. **Ship behind a per-bot flag with additive tables, a dual-written legacy pointer and no dsh log rewrites.** Reason: a routing change touching about 15 packages must be reversible in one switch.
12. **Correct F1–F9 in the proposal before writing the 9.1 plan.** Reason: the plan inherits the research's errors (approval routing, timed questions, fork).

### Should

1. **Stamp a per-thread receipt sequence before STT and download pre-processing.** Reason: cross-channel order otherwise follows processing time, not send time.
2. **Define proactive outbound routing to the person's last-active channel.** Reason: result cards and reminders otherwise reach nobody off-web.
3. **Add a per-bot resource lease (computer, project directory) for tasks.** Reason: side tasks and the main thread run in parallel on the same files and screen.
4. **Make task promotion automatic and keep "+ Việc" as a shortcut.** Reason: a manual choice re-creates "Việc mới".
5. **Make "chủ đề mới" perform a rollover.** Reason: a cosmetic divider would contradict what users expect.
6. **Give room threads their own busy policy and per-sender trust.** Reason: today any non-owner message cancels the running turn.
7. **Run memory extraction on rollover as well as on compaction.** Reason: `watch.ts` only listens for `compaction/summary`.
8. **Split the OpenMausBot-style UI into 9.1b.** Reason: it halves the blast radius and lets routing ship and be verified first.
9. **Spike before planning (cold resume, steer during approval, team cap, schedule after rollover).** Reason: §8 of the proposal admits these are unverified.

### Could

1. **Idle eviction.** Reason: only after measurements show memory pressure.
2. **Enable `ask_user_question` timed mode and port the channel answerers to the `answer` remote method.** Reason: it gives durable questions almost for free once approvals are done.
3. **Lower the global compaction `thresholdRatio` as a safety net.** Reason: it bounds the surface even if rollover fails.
4. **An admin-only "Lịch sử trang" view.** Reason: debugging without re-exposing sessions to normal users.
5. **Append the owner's direct Zalo replies (takeover) into the customer thread as sourced messages.** Reason: the bot then knows what the human promised.
