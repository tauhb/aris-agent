# Adversarial review: Plan GĐ9 "Đội đồng đội ngang hàng" (docs/plans/gd9-doi-dong-doi.md)

Reviewer: independent architect, read-only, 31/10/2026. Paths are relative to `/home/user/aris-agent`. dsh docs are cited as `dsh-<pkg> README`. The identifiers follow the current plan text: `ask_teammate`, `hand_off_to_teammate`, tables `threads` / `people` / `tasks`, `threads.send(...)`, `notify(person|thread)`, `start_task`, flag `teammates.v1`, `canManageTeam`, `run_subagent`.

## 0. Verdict

**Approve with changes.** The direction holds up. Peers built from a directory, one async ask tool, automatic result return, provenance, and a hop limit plus a cost limit is what both reference products converged on (`kien-truc/6-bot-ngang-hang.md` §0, §4). Removing the structural Commander also removes the worst problem in the old architecture: the 16-members-for-life dsh agent team inside a thread that never ends.

The plan has real problems, though. In order of severity:

1. **Peers (9.2) ship before the safety rails they need (9.3).** Those rails are approvals that can reach a human from a background task session, idempotency for external sends, and per-person memory. Peers come first, rails second.
2. **The plan has no answer for the Zalo reality.** A bot with no channel account has no outbound path. On a one-Zalo-account shop, `hand_off_to_teammate` and "results to the last-used channel" do not work as written.
3. **Customer-originated chains are unspecified.** A Zalo customer talking to Lâm could make Lâm ask Mai for the owner's data.
4. **The 5–7 week estimate is the inventory's figure for removing the Commander only.** It does not cover threads, people, the send door, durable approvals, rollover, and per-person memory, which the plan now also contains. A realistic figure is about twice that.
5. **A per-bot `teammates.v1` flag fits thread routing but not fleet semantics.** Commander on or off, the `botOf` fallback and the memory book owner are global.

Each of these can be fixed without changing the decisions the owner made.

---

## 1. Must-fixes from the previous review (`kien-truc/4-opus-soat.md` §8)

| # | Must-fix | Status | Notes |
|---|---|---|---|
| M1 | Rollover = new session + summary, never `fork` | **Applied** | 9.3, last bullet |
| M2 | Rollover at ~100k tokens, on topic marker, on config change | **Applied** | Threshold confirmed by spike |
| M3 | Migrate schedules, `/loop`, `/heartbeat`, goals and pending approvals on rollover | **Applied** | 9.3. dsh confirms that reminders are bound to the calling session (`dsh-schedule README`, "A reminder is bound to the calling Agent's Session"), and archiving a session with active reminders is refused, so migration must delete and then recreate them. |
| M4 | Hybrid durable approval + argument-hash grant, used once | **Partly** | The core is there. Missing: "don't re-ask while pending", sequential execution for side-effecting batches, reminder and expiry times, re-validating late grants, Zalo text approval only from the paired identity, and mapping "thôi đừng gửi" to a reject. All of these were in §3 of the previous review. |
| M5 | Idempotency key for every external effect | **Partly (wrong phase)** | It is in 9.3, but 9.2 already lets peers trigger work that may send. `ask_teammate` itself also needs an idempotency key (a re-issued tool call must not create two tasks). The plan's "chống nhờ trùng nội dung" is content dedupe, not effect idempotency. |
| M6 | Take delegation off the Commander's dsh team | **Applied** (the path is dropped) | **But** the guard that stops ordinary bots from calling `spawn_teammate` lives inside `isCommander()` (`aris-commander/src/index.ts:358`). The inventory marks it "BỎ" (§1.1 #3a). If the agent-team tools stay mounted, removing that guard gives *every* bot unbounded dsh teams that bypass the chain limits. The plan must say: unmount the agent-team tool, or deny it for all sessions. |
| M7 | `people` table; person on threads, messages, memory, insights, proposals, approvals, costs from 9.1 | **Partly** | 9.1 adds `people` and `threads`, but the plan never says person is stamped on memory, insights, proposals, approvals, cost entries, or on `tasks`. Peer chains make cost-per-person and approver-per-chain necessary. |
| M8 | Person-private memory by default | **Partly (wrong phase)** | It is in 9.3, after peers. See §2.3. |
| M9 | Scope `recall` / search to (bot, person) | **Applied** (9.3) | |
| M10 | ACP, routine, `/goal`, `/ask`, project work as tasks; remove the `'rt'` rebind | **Applied** (9.3) | The project-workspace (cwd) design is still open (previous §4.1, `aris-projects`). |
| M11 | Per-bot flag, additive tables, dual-written pointer, no log rewrites | **Partly** | Fine for routing. Not workable for the peer and Commander semantics (§6). |
| M12 | Fix F1–F9 in the research | **Applied** | In `kien-truc-bot.md` §9.1. |

Shoulds, briefly. **Applied**: receipt sequence before speech-to-text, last-active delivery, auto-promotion (`start_task`), "chủ đề mới" triggers a rollover, memory extraction at rollover, UI split out (9.4), spike. **Missing**:
- the **per-bot resource lease** (computer, project directory). Peers make this worse: Mai's peer task and Mai's main thread can now drive Mai's computer at the same moment.
- **dropping the three busy modes** (`settings.busy` steer | queue | interrupt).
- **busy per task** (`LiveTracker.busyBots` counts bots, `aris-bots/src/live.ts:209`).
- a **per-thread observability view** (pages, tasks, costs). With sessions hidden and chains crossing bots, this becomes a must for debugging.

---

## 2. Is the peer model sound?

### 2.1 What a task physically is (not specified, and the obvious choice is wrong)

The plan says a peer job is a `tasks` record running "ở phiên phụ". It must say that this is a **top-level dsh session that aris creates for the *assignee* bot**, tagged `{bot: assignee, person, task, thread}`. It must **not** be a dsh subagent of the requester's page. Using `run_subagent`/dsh-subagent for peers fails in four ways:

- A delegated child's "operations that require approval are rejected automatically" (`dsh-subagent README`, fixed child statement). A peer could never ask the human for anything.
- A child joins the parent's preset unless an independent `agentPreset` is given, and it inherits the parent's permission roots and cwd. That runs Lâm's permissions under Mai's name.
- `maxActiveSubagents` slots and parent delivery are process-local. Parent delivery also targets the parent **page**, which a rollover may already have closed.
- `maxDepth` defaults to 1.

`run_subagent` is fine for one-level anonymous helpers inside a bot (table row 6). Peers need aris's own session.

### 2.2 Loops and cost

- **The limits are redundant and miss the unwind rule.** In a tree, "6 consecutive hops" and "depth 4" measure the same path. Pick one: **depth ≤ 3** for a small-business team. Keep at most **12 tasks per root**, plus the cost cap. Add Rakazo's **unwind exemption**: the automatic result going back to the requester is never blocked by the cap, or chains deadlock at the limit (`6-bot-ngang-hang.md` §5).
- **The ancestor ban blocks legitimate clarifying questions.** Mai needs to ask Lâm "khách nào?". Model that as task status `needs_input` on the same record, answered by the requester, not as a new `ask_teammate` back up the chain.
- **The hidden cost is the requester wake, not the peer run.** Every returned result is a new model turn of the requester over its whole thread page, up to ~100k tokens. Fan-out to three peers means three full-context wakes. Join results: wake the requester **once** when all tasks started in the same turn have settled, or after a short debounce. Count the wake toward the chain cap.
- **The 1 USD chain cap needs accounting that does not exist yet.** Cost must be attributed per `tasks.rootId` from the providers' cost events on every session in the chain. This was the old `TaskSpend`, keyed on dsh team members (`aris-commander/src/index.ts` record/`taskSpend.start`). "Quá trần thì dừng và hỏi người" also needs a durable question (9.3). In 9.2, over the cap must simply mean **stop and report**.
- **The daily team cap can miss peer tasks.** `aris-guard` with `capMode: 'bg'` stops only sessions that `isBackground` recognises (`via === 'team' | 'dispatch'`, sub-sessions, routine…, `aris-guard/src/index.ts:96-120`). Those `via` values disappear. Peer and task sessions must be classified as background explicitly, or the daily cap stops nothing.

### 2.3 Privacy between bots and between people

- **Context passed to the peer.** Specify that the assignee gets the brief, the quoted human request and `doneWhen` only, never the requester's thread history. Rakazo prompts with "the relevant task, not unrelated chat history".
- **Whose scope the assignee reads.** The task carries `person = origin person`, and the assignee reads only (assignee, that person) memory. The plan does not say this. In company mode, without it, staff B's request through Lâm reaches Mai's memory of the owner.
- **Customer and room origins.** Lâm serves a customer on the shop's Zalo. The customer writes "hỏi bạn kế toán doanh thu tháng này". Today the `owner` book is shared by all bots (`aris-memory/src/books.ts:11-17`) and is not split until 9.3, so Mai answers from owner data and Lâm relays it to the customer. **9.2 must allow `ask_teammate` only in turns whose origin is a paired owner-trusted person.** Guest, customer and room threads get no peer tools until person memory and per-origin policy exist. This is the most dangerous gap in the plan.

### 2.4 Prompt injection

Item 8 (peer text is quoted data, origin written by aris) is right. Add three things:

- **Taint.** A peer result that touched web, files, customer messages or connectors taints the requester's run. Treat tool results from `ask_teammate` as untrusted, like Rakazo's `toolResultTaintsRun`.
- **Tool exposure by trigger.** Runs started by a peer, routine or webhook do not get `canManageTeam` tools, account settings, routine creation, or `hand_off_to_teammate` to a human channel.
- **Escaping.** Escape the peer body and the bot's public description, including look-alike wrapper tags. The directory is written by bots, so it is untrusted text injected into every prompt.

### 2.5 Approval inheritance

"Mức duyệt của người khởi đầu đi theo cả chuỗi" is ambiguous and could be read as *widening*. Write it as:

- the effective level at each hop is `min(origin person's level, assignee bot's own policy)`;
- **grants are never inherited**;
- a peer message never approves.

Approval cards from a peer task must show up **where the human is**: the requester's visible thread and the "Cần {you}" list, labelled "Mai (Lâm nhờ, cho yêu cầu '…')". They should not appear only in Mai's thread, which the owner may never open.

Today there is **no approval route for a background peer session** at all. The `ApprovalCenter` path handles `member:<sid>` sessions only, i.e. dsh team members (`aris-commander/src/index.ts:1540-1575`). That path is being removed. So 9.2 must either generalise it to any task session, or run peer tasks with `ask → deny + explain` until 9.3.

### 2.6 Results after restart

"Kết quả tự quay về (cả khi khởi động lại)" needs a mechanism:
- a `tasks.outcomeReturnedAt` field;
- a boot reconciler that finds tasks still `running` whose session is not live and either cold-resumes them with a "continue" follow-up or marks them failed;
- in every case it posts **one** result or status message to the requester's *thread*, not the old page, under an effect key.

External side effects in a resumed task need the effect key, which brings us back to the M5 sequencing.

### 2.7 What the human sees

- The "Lâm nhờ" card in Mai's thread should be an **aris-rendered card from `tasks`**. It should not be a dsh message appended to Mai's main page, which would cost context and alter Mai's conversation. It produces **no unread badge and no Telegram/Zalo push**. Only user-facing outcomes notify, as in Rakazo (`completionMarksUnread`).
- **The requester relays substance.** When results return, the requester must restate the actual result and distinguish "đã giao" from "đã xong". Copy Rakazo's wake prompt rule.

### 2.8 `hand_off_to_teammate` on channels

The old `chuyen_giao` blocks the turn for up to 15 minutes (`HANDOFF_TIMEOUT_MS`, `aris-commander/src/index.ts:119, 912-915`). The plan wants the handoff to be async. That is right, but then three things must be defined:
- **Which account delivers Mai's reply.** On Zalo the person is talking to the account bound to Aris. Each channel account has exactly one bot (`aris-channels/src/domain.ts:40-41`).
- **Whether the chat becomes sticky to Mai** and for how long.
- **How the person goes back** to the first bot.

Without stickiness, the person's next message goes to Aris again, so a handoff lasts one reply.

---

## 3. Is removing the Commander right for this product?

Mostly yes. Architecturally, the Commander is a fan-out on a dsh team that breaks in long-lived threads, plus about a dozen singletons. But for a Vietnamese small-business owner who lives on Zalo, **"just tell Aris" is the product**. Usually there is one Zalo account, so one bot effectively *is* the front door. The plan should say this out loud and design for it:

- Aris is the default bot, and the first thread is created with it.
- Its persona says "đầu mối: nhận việc, nhờ đồng đội, tổng hợp". That is the "Chief for free" approach (`6-bot-ngang-hang.md` §6.4).
- Bots without an account are reached **through** the account bot, with name-tagged relay.

This keeps the old experience with no structural Commander.

**Value lost** (beyond the plan's table):

1. **Same-turn join.** `giao_viec` + `wait_agent` gave the Commander all results inside one turn, with an immediate synthesis. The replacement is async with extra wakes, so answers come later and cost more for "hỏi 3 bot rồi tổng hợp".
2. **One entry point** for non-technical owners (above).
3. **Routine and system delivery through Aris's Telegram** for bots without their own account (`aris-routine/src/index.ts:155` `via()`). "Kênh dùng gần nhất" has no answer for an account-less bot.
4. **Per-delegation approval and the learned routing stats.** These are small losses.
5. **Kanban driver automation** for owners who use projects.

**Missing from the table** (all in the inventory, and each changes behaviour silently):

- **Aris's special permissions.** The Commander is exempt from department policy (`aris-bots/src/store.ts:432-439` `policyOf`) and writes files without `perms.write` (`aris-bots/src/index.ts:243-245`). Turning Aris into an ordinary bot changes what it can do unless these are migrated into explicit `perms` on the Aris record.
- **Second Brain read-all.** `role: 'commander'` → `readsAll` (`aris-brain` `access.ts:14,26,36`). Who reads all of the Second Brain afterwards? Add it as a table row; probably a `canManageTeam`-like flag.
- **`channel_send` always sends from Aris's Telegram** (`aris-channels/src/index.ts:315`), whichever bot calls it.
- **Address singleton.** The `owner` table with key `'main'` (`aris-bots/src/store.ts:206-225`) needs to move to `people`.
- **Department quotas.** In `aris-providers` they apply only to `kind === 'member'`.
- **`via`-based classification.** Guard and stats classify by `via` (§2.2 above).
- **Old dsh team tools.** The fate of `spawn_teammate`/`send_message` for all bots (M6 above).
- **Old log record types** (`dispatch`, `room-lead`, `handoff`) must stay renderable after 9.5.

Agree with: drop `giao_phong` and the Driver, defer rooms, drop learned routing.

**Cut from 9.2**: "Bot ngoài tách gói riêng" is a pure refactor and belongs in 9.5. The `canManageTeam` create/edit-bot tools can wait, because the owner already creates bots in the UI.

---

## 4. Phasing and estimate

**Hidden dependencies:**

| Needs | Is in | Used by |
|---|---|---|
| Approval routing for task sessions | 9.3 (durable) | 9.2 peers that do anything gated |
| Effect idempotency | 9.3 | 9.2 (peer sends, retries after restart) |
| Person-private memory | 9.3 | 9.2 (privacy of peer answers, company mode) |
| Durable question ("hỏi người khi quá trần") | 9.3 | 9.2 chain cap |
| Task engine (record, session, card, reconciler) | built in 9.2 | 9.3 reuses it for routine, `/goal`, ACP, `/ask` |
| Delivery for account-less bots | not planned | 9.1 `notify`, 9.2 handoff |
| Resource lease | not planned | 9.2 (peer task and main thread on one computer) |
| Live Zalo test | not done (`gd8-chung.md` progress: 8.4/8.7 "chưa thử thật") | spike item "duyệt bằng Zalo" and the whole Zalo story |

**Proposed order:**

- **9.0** Spike. Add two measurements: the cost of a requester wake with ~100k tokens of context, and a two-hop peer chain end to end.
- **9.1** People, threads, send door, `notify`, `botOf` without the fallback, delivery for account-less bots.
- **9.2a** Task engine: `tasks`, aris-created assignee sessions, result card, reconciler, background classification for the guard, routing of task approvals to the person, effect keys for channel sends.
- **9.2b** Peers, **owner-origin turns only**:
  - `consult` and `notify` first (no external effects);
  - `work` only after effect keys exist;
  - routine, `/goal`, ACP and `/ask` move onto the engine.
- **9.3** Durable approvals, person memory, recall scope, rollover.
- **9.4** UI.
- **9.5** Removal.

**The estimate is not credible.** The "~L×6, M×18, S×30, 5–7 weeks" figure is from `5-aris-chi-huy-kiem-ke.md` §9, and that inventory covers *only* Commander dependencies. The plan puts it on top of the entire §9 thread architecture as well: people, send door, durable approvals, rollover, person memory, recall. The previous review treated that architecture as a whole phase on its own. Realistic sizing:

| Work | Estimate |
|---|---|
| Spike | 1 week |
| 9.1 | 2–3 weeks |
| 9.2 | 3–4 weeks |
| 9.3 | 3–4 weeks |
| 9.4 | 2–3 weeks |
| Soak before 9.5 | 2 weeks |

That is **~12–16 calendar weeks**. It also matters that work runs in one Sonnet session without subagents and with four owner stop points (`gd8-chung.md`). Say so to the owner now.

---

## 5. Simplicity for the owner

**Simpler**: a flat contact list, no "phiên", no "Việc mới", no Commander page.

**More complex, and how to avoid it:**

- **Card flood.** Every request produces a chip, a received card, a result card and possibly an approval card, across two or more threads. Fold everything under the chip in the requester's thread, keep received cards silent, and show nothing at all for `notify`-mode tasks unless the owner opens the task page.
- **Settings creep**: `canManageTeam`, per-bot "nhận việc từ đồng đội phải hỏi người", chain cap, hop limits, and possibly the busy modes. Ship fixed defaults. Expose at most the chain cap (under Ngân sách) and the per-bot "hỏi trước khi nhận việc".
- **Bots chatting with each other** is the main risk to trust: the owner sees spend without knowing why. Fix the depth at 3, give the requester one wake per turn, and show the chain cost in each folded result ("3 bot · 0,04 USD").
- **Where did my answer go?** After a handoff on Zalo, the reply must come back in the same Zalo chat, with a visible name tag.

---

## 6. Reversibility: per-bot `teammates.v1`

Mixed states:

- **Lâm (on) asks Mai (off).** This works if the task engine is independent of the assignee's flag: Mai's task session is just a tagged session.
- **Legacy Aris (Commander, off) delegates with `giao_viec` to Lâm (on).** Lâm then runs as a dsh team member, outside `tasks`, the chain cap and `outcomeReturnedAt`. A chain mixing both systems has **no common budget or depth counter**.
- **Global behaviour does not follow a per-bot flag.** `isCommander` is derived from `botOf`, whose fallback is global. The `owner` memory book has one owner. The `spawn_teammate` guard is keyed on Commander status.

**Recommendation: split into two flags.**

- `threads.v1` **per bot** covers routing, threads and pages, as the previous review proposed.
- `teammates.v1` **fleet-wide** covers peer tools on, Commander tools off, and agent-team tools unmounted. While it is off, peers are disabled. While it is on, `giao_viec` is disabled. Never both.

**Memory migration** (aris/owner → person) is one-way unless reads are dual for the flag's lifetime. Read both books and write to the person book, so turning the flag off still sees new facts.

---

## 7. Cuts and the first 2-week slice

**Cut or postpone:**
- splitting out the external-bot package (to 9.5);
- `canManageTeam` create/edit tools (later);
- fan-out from all bots (only owner-origin);
- `work` mode before effect keys;
- the "Lịch sử trang" admin view (replace it with the observability view);
- Office 3D changes beyond removing the central desk;
- rooms and the Kanban board (already deferred).

**First 2-week slice: "Đồng đội hỏi nhau".** Ship on today's sessions, without threads, with the Commander still running:

1. **Days 1–2.** Add `publicDescription` to bots. Inject an escaped directory labelled "do đồng đội tự viết", capped at 40 bots and 8k characters.
2. **Days 3–6.** Add the `tasks` table and `ask_teammate`:
   - `consult` mode only;
   - turns from the paired owner only;
   - the assignee runs in an aris-created session tagged with that bot, with the brief and quoted request only;
   - inside that session, any `ask` approval becomes deny + explain;
   - idempotency key on the tool call; depth ≤ 2; ≤ 6 tasks per root; 0.30 USD per root, attributed from cost events;
   - the session is classified as background for the guard.
3. **Days 7–8.** Automatic result return with `outcomeReturnedAt` and a boot reconciler. Wake the requester once per turn after all its tasks settle, and require it to relay the substance.
4. **Days 9–10.** A minimal UI: a "Đã hỏi Mai…" chip with the result folded underneath, and a silent card on Mai's side. Tests for loop limits, cap, dedupe and the restart return.

The owner gets the headline benefit (any bot can consult any other, with cost visible and bounded) in two weeks. Nothing is removed, so turning it off is one switch. Every piece is reused in 9.2a/b: the engine, directory, reconciler and chip. The slice also produces the real data the spike lacks: wake cost and chain behaviour.

---

## 8. Required changes

### Must

1. **Specify that a task runs in an aris-created top-level session of the assignee bot, never a dsh subagent of the requester page.** Reason: subagents auto-reject approvals, inherit the requester's preset and permissions, and deliver to a page that a rollover may have closed.
2. **Allow `ask_teammate`/`hand_off_to_teammate` only in turns started by a paired owner-trusted person until person memory and per-origin policy exist.** Reason: a customer on Zalo could otherwise pull owner data through a peer.
3. **Move approval routing for task sessions and effect idempotency (including the `ask_teammate` call itself) ahead of, or into, 9.2, and ship peers `consult`-first.** Reason: the only background approval path today belongs to the dsh team path being removed, and peers can trigger sends.
4. **Unmount or globally deny the dsh agent-team tools when the Commander guard is removed.** Reason: the `spawn_teammate` guard lives in `isCommander()`, and dropping it would give every bot unbounded teams outside the chain limits.
5. **Define delivery for bots without a channel account (relay through the account bot with a name tag) and sticky handoff on a channel chat, including how to return.** Reason: one-account Zalo shops otherwise lose results and handoffs.
6. **Define approval inheritance as `min(origin level, assignee policy)`, grants never inherited, and cards shown in the requester's visible thread and "Cần {you}".** Reason: the current wording can be read as widening, and cards in Mai's thread are never seen.
7. **Specify chain accounting and limits: one depth limit (≤3), tasks per root, a cost cap from cost events per `rootId`, an unwind exemption for results, `needs_input` instead of asking back up the chain, and background classification for the guard.** Reason: the current limits overlap, can deadlock, and the daily cap would not see peer sessions.
8. **Specify the restart mechanism (`outcomeReturnedAt`, boot reconciler, delivery to the thread not the page, one return under an effect key).** Reason: "returns after restart" has no design.
9. **Split the flag: `threads.v1` per bot, `teammates.v1` fleet-wide (peers on means Commander tools off), plus dual-read memory during migration.** Reason: mixed chains would bypass budgets, and the Commander, `botOf` and owner-book semantics are global.
10. **Add the missing table rows (Aris's permission exemptions, Brain read-all, `channel_send` via Aris, the address singleton, department quotas, `via` classification, old record types) and get owner confirmation at Điểm dừng 1.** Reason: each changes behaviour silently.
11. **Re-estimate at ~12–16 weeks and tell the owner.** Reason: 5–7 weeks is the Commander-only inventory figure, not the threads + peers scope.

### Should

1. **Wake the requester once per turn after all its tasks settle, and require it to relay the substance.** Reason: per-result full-context wakes are the real cost multiplier.
2. **Send the assignee only the brief, the quoted request and `doneWhen`; scope its reads to (assignee, origin person).** Reason: privacy between bots and people.
3. **Taint the requester after peer results; hide management and account tools in peer, routine and webhook runs; escape descriptions.** Reason: injection through the directory and results.
4. **Make received cards aris-rendered and silent, with no unread or push.** Reason: avoid card floods and polluting Mai's context.
5. **Add the per-bot resource lease before `work`-mode peers.** Reason: peer tasks and the main thread can drive the same computer or files.
6. **Give Aris an explicit "đầu mối" persona and make it the default first thread.** Reason: it keeps the "just tell Aris" value without a structural Commander.
7. **Add a per-thread observability view (pages, tasks, chain costs).** Reason: sessions are hidden and chains cross bots.
8. **Add spike measurements for requester-wake cost and a two-hop chain, and do a live Zalo test before relying on Zalo approvals.** Reason: Zalo has never been tested live.

### Could

1. **Move the external-bot package split and the `canManageTeam` tools to 9.5 or later.** Reason: neither delivers owner value now.
2. **Drop the three busy modes now (steer by default, plus Dừng).** Reason: a simpler mental model.
3. **Show chain cost in each folded result.** Reason: it builds trust in bot-to-bot spend.
4. **Add fan-out with a join (OpenMausBot-style) later.** Reason: it recovers the "hỏi 3 bot rồi tổng hợp" quality of `giao_viec`.
