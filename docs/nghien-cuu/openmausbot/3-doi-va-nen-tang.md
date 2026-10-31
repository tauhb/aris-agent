# OpenMausBot: team, organisation, platform and licensing review

Source: `maus-src/repo` at commit 80012e6 (shallow, one commit; package version 0.1.135 in `package.json`). All paths below are relative to that repo root unless they start with `/home/user`. Nothing was run or built; all claims come from reading files. Items marked **[inference]** are mine. Rakazo comparison uses `/home/user/aris-agent/docs/nghien-cuu/rakazo/4-nen-tang.md`.

## 0. Short take

OpenMausBot is a very large TypeScript monorepo (about 900k lines, 40%+ tests). Its core idea differs from Rakazo's: a "bot" is not an LLM loop the platform owns. It is a thin wrapper that drives vendor agent CLIs (Claude Code, Codex, Grok, OpenCode, ACP agents) which keep their own sign-ins (`README.md`, `docs/deploy-vps.md` "Your engine accounts", `Dockerfile` header). State is flat files plus one SQLite file, not Postgres. The product was built single-user first (Electron desktop) and bolted team features on later. Its team model is thoughtful and unusually privacy-careful, but the pieces a company needs most for admin (team creation, invites, billing, roster) live in a **private, unshipped service** ("openmaus-cloud" / "the Admin"), and the one org-level cost control (`budgets`) is behind a paid licence key.

## 1. Licensing, precisely

### 1.1 Apache-2.0 part (everything outside `enterprise/`)
- `LICENSE` is Apache-2.0; `package.json` declares `"license": "Apache-2.0"`. `LICENSING.md`: "open source under the Apache License 2.0, with one carve-out". The project was relicensed from MIT to Apache-2.0 "with the consent of all contributors" (`NOTICE` line 4-5).
- You may use, modify, redistribute and sell it, including a closed product built on it, provided you follow Apache terms (keep licence, mark changes, carry `NOTICE` content). Patent grant included. [inference: standard Apache-2.0 reading; the repo adds no extra restriction.]
- **Trademarks are not licensed.** `LICENSING.md` "Third-party components and trademarks": the names OpenMausBot, MausBot and the mascot belong to Supamaus Software Private Limited; Apache section 6 gives no trademark rights, so a derived product "needs its own name unless a partner agreement says otherwise". The mascot art and names must therefore be removed or replaced in an aris fork.
- Contribution: outside `enterprise/` no CLA or DCO (`LICENSING.md` "Contributions"). Inside `enterprise/`, a CLA (`CLA.md`) grants Milind Soni a perpetual licence to relicense contributions "under any license", modelled on the Apache ICLA.
- Note: the "carve-out" is a split, not a dual licence. Anything not under `enterprise/` is plain Apache, including the whole team machinery in `server/host/`, `shared/bot-access.ts`, `server/team-people.ts`, `server/admin-activity.ts`, `server/workspace-backup*.ts`, `cloudflare/control-plane/` (CODEOWNERS only gives the maintainer review rights there, `.github/CODEOWNERS`; it does not change the licence).

### 1.2 What is in `enterprise/` (source-available, NOT Apache)
Files: `enterprise/LICENSE`, `README.md`, `FEATURES`, `scripts/issue-license.mjs`, and `server/` with `index.ts` (23 lines), `license.ts` (82), `workspace-access.ts` (166) plus three test files. About 785 lines of TS in total (my `wc`). It is small.

Entitlement ids (`enterprise/FEATURES`, same table in `enterprise/README.md`):

| id | unlocks | status |
|---|---|---|
| `whitelabel` | product name, tagline, accent colour, logo, favicon, support link from `brand.json` | shipped |
| `sso` | sign-in via an OIDC company identity provider, with scope mapping | **planned; "nothing checks it yet"** |
| `admin` | Settings > Installations (fleet console) and the optional hosted-workspace sign-in adapter | shipped |
| `budgets` | one monthly spend cap for the whole workspace, refuses new turns at the cap, warning %, admin notices; "not per bot or per section" | shipped |
| `billing` | per-model sell prices, a billable column in Usage > History and CSV, prices replace list prices in estimates | shipped |

Mechanism: `OMB_LICENSE_KEY` = `omb1.<claims>.<signature>`, Ed25519, public key baked into `enterprise/server/license.ts`, verified offline; expiry has a 7-day grace period (`enterprise/README.md`). Core calls `entitled("id")` from `server/enterprise.ts`; with no `enterprise/` folder the server answers `{"edition":"oss"}` (`LICENSING.md`). The licence gate is a hook, "no core file imports anything from here" (`enterprise/README.md`).

Terms (`enterprise/LICENSE`): (1) you may read, build, evaluate and modify for evaluation; dev/test/evaluation use is free. (2) Production use of the features requires a key under a separate agreement (features, seats, term). (3) **No redistribution, sublicensing, selling, hosting for third parties or offering as a service**, and no removing or circumventing the licence check; white-labelling or hosting for third parties needs a written partner agreement. (4) Delete the folder and the rest is OSS. Contact is a personal gmail address.

What this means for aris:
- **May** read it to understand the design (it is small and tells you how they did hosted sign-in and licence gating).
- **May not** copy `enterprise/` code into aris, ship it, or bypass the check. Plan to re-implement the concepts from scratch if wanted; the ideas (OIDC, one workspace cap, brand file) are generic and not protected.
- **May** copy anything else (Apache), but must keep Apache notices, and may not reuse the OpenMausBot name or mascot.
- Important consequence: the project deliberately kept per-company controls that a company deployment wants (workspace budget, white-label, SSO) on the paid side. The OSS core does include per-person spend display, audit and sign-in lists (below), so an aris fork would not lose those.

### 1.3 NOTICE and third parties
`NOTICE` lists adapted MIT code (T3 Code by T3 Tools Inc. for the Antigravity ACP integration and the browser egress gate; Cache Tax for prompt-cache keep-warm; hpke-js; WebRTC BSD-3 in the Android app; Simple Icons CC0; models.dev MIT; OpenCode adaptations) with licence texts in `third_party/`. Apache section 4(d) means a redistributor must carry the applicable NOTICE text forward. Copying a file that adapts T3 Code (e.g. `server/browser/egress/`) drags its MIT notice along.

## 2. Team / organisation model

Two separate team models exist, and they must not be confused.

### 2.1 Self-hosted shared server (all OSS, `docs/self-hosting.md`)
- **Accounts/sign-in:** allow-lists of emails or `@domain` entries, two roles: `OMB_SIGNIN_EMAILS` (admin scope) and `OMB_SIGNIN_MEMBER_EMAILS` (client = chat and approvals only); stored in `config.json` `signIn.admins/members` (`docs/self-hosting.md` "Sign in with your email", `server/account-signin.ts` `allowedScopes`). CLI `openmausbot access add`. Settings > People lists users, role, last seen and **what each person spent this month**, with invite links (`docs/self-hosting.md` "Inviting people").
- **Departments:** sidebar sections; a section is shown only if it holds a visible bot/room (`docs/self-hosting.md` "Who can see a bot").
- **Visibility:** per bot `everyone | admins | {people:[emails/@domains]}`; invisible bots answer 404 everywhere (lists, search, SSE, webhooks, routines). Rooms keep their "narrowest audience floor". Bots only coordinate with bots seen by exactly the same people (`docs/self-hosting.md`).
- **Approvals per person:** "Who may answer a card": cards traced to the requesting user are theirs; admins/owner can answer any; each answer is stamped `answeredBy` in the decision log.
- **Audit:** `decisions/YYYY-MM.ndjson` (every approval decision, CSV export, 180-day default retention) and `admin-activity/YYYY-MM.ndjson` (every admin change with before/after, redacted; exported as CSV) (`docs/self-hosting.md` "The decision log", "Admin activity"). This is plain files, 0600, no tamper-proofing, no SIEM forwarding. [inference from absence in the docs]
- **Safety floor:** opt-in never-list for `rm -rf /`, `mkfs`, fork bombs; explicitly "a net, not a sandbox" and not enforced on Windows or when the engine runs in its own no-ask mode (`docs/self-hosting.md` "The safety floor").
- **Weak point:** `docs/verification/shared-workspace-trust.md`: "A hosted or shared workspace runs every bot's shell on the server as the same user". The strong per-turn sandbox (`bot-box`, bubblewrap with seccomp, no network except an egress gate, empty data folder) is **on by default only for the Cloud home roles** (`OMB_CLOUD_ROLE=home|team`), "off everywhere else" (`docs/bot-box.md` "When it is on"). So on a plain self-hosted company server, one staff member's bot shell can read files of other staff. Only the Team Cloud role gets real isolation.
- **Fleet (multi-client on one box):** `openmausbot fleet create acme ...` makes one OS user, one systemd service, one data dir, one brand, one sign-in list, one provider key and one `--cap` per client, with an nftables fence and an auditable root agent (`/var/log/openmausbot/fleet.jsonl`); GUI is the paid `admin` entitlement (`docs/self-hosting.md` "Many client workspaces on one server"). Closest thing to departments-as-tenants, but process-per-tenant, not one shared database.

### 2.2 Team Cloud (`docs/team-cloud.md`, 519 lines): the richest model
This is the machine side of a paid product. The machine code is Apache (under `server/host/`, `server/team-people.ts`, `shared/bot-access.ts`); the **Admin that creates teams, invites people, signs each pairing and bills is a separate private repo** ("openmaus-cloud", `docs/team-cloud.md` intro; `docs/verification/hosted-workspaces.md`: "ships the workspace-side protocol adapter, not a hosted administration console").
- **Roles:** Owner / Admin / Member (`member.role` in the signed pairing claim, `docs/team-cloud.md` "The pairing claim"). Owner/admin get scopes `admin+client`; member gets `client`.
- **Membership authority is external.** The machine has no roster; it trusts a pairing signed by the Admin and ends team sessions within the hour (`TEAM_SESSION_MAX_MS`); removal arrives as a signed `POST /api/cloud/team/member-left` which then **deletes** the person's private chats, memory layers, browsers, connections, uploads and sessions, "Nothing of it is handed to an admin" (`docs/team-cloud.md`).
- **Audience rule (the best idea in the repo):** every conversation has an audience: `team`, `room:<id>` or `member:<person>`. "A turn reads only inputs whose audience includes everyone who will see its answer, and writes only into its own audience." A "New conversation" is private to its starter, invisible even to admins including the Super admin; memory has three layers (team, room, person); each audience has its **own engine HOME and own browser profile** (`engine-homes/<key>`), enforced at one gate for path, query and body (`server/host/team-private.ts`, `visibility-host.ts`) (`docs/team-cloud.md` "The audience rule"). Incidents and escalations from a private chat go to that person only.
- **Bot sharing like a document:** `bot.access = {everyone: none|view|chat|edit, people: {email: level}}` (`shared/bot-access.ts`, `server/host/bot-access-gate.ts`, `docs/team-cloud.md` "Who can use a bot"). "Can edit" never reaches what only an admin sets: approval level, folders, where it runs, department, connecting an app, making a webhook.
- **Ownership/reporting:** every bot has an owner (`reportsTo` email); asks route to the owner, or to admins if unowned, never to admins from a private chat (`server/ask-routing.ts`). One "Chief of Staff" bot per person, with authority exactly over that person's bots. A Team map shows who reports to whom. [This is a human-org-chart-like hierarchy on bots.]
- **Connections scoped `team` or `person`:** an admin chooses per app/MCP server whether one shared connection or one per member; a member's own connection is used only by a turn that "acts for" them, in a chat only they read; personal connections from elsewhere are refused ("Personal connections never enter Acme") (`docs/team-cloud.md` "Connections", `server/host/acting-person.ts`). Storage `people-connections/` (0700), excluded from backups.
- **Admin reads:** signed `GET /api/cloud/team/admin` returns names/states of shared keys, apps and MCP servers, never secrets; usage by person/bot/model; admin activity; a member's private chat shows only as metadata (cost and counts), never titles or words.
- **Never-asleep, per-member phones:** `/api/team/phone-pairing`, paired-devices list, remove per phone.

### 2.3 Sharing, library, branding, escalations, incidents
| Item | What it is | OSS or paid | Evidence |
|---|---|---|---|
| Share a department | exports a whole department as one `.openmaus.json`: bots, instructions, skills (SKILL.md text only), playbooks, group chats, routines (arrive paused), Chief, MCP addresses with key-like parts redacted, starter notes. Never chat history, keys, models, computers or visibility. Import is additive, skills arrive **off**, connections arrive **off** | OSS | `docs/team-sharing.md` |
| Org library | an organisation Admin publishes packages; desktops see them in Templates > From {Organization}; org-trusted skills arrive on, routines paused; versions, `withdrawnReleases` switch skills off and pause routines; provenance hashes distinguish local edits from publisher changes | client side OSS (`server/org-library.ts`); the publishing **Admin is private** | `docs/org-library.md` |
| Organisation branding | Admin uploads a logo and up to 24 shared bot icons (5 MB per upload, 128 KiB normalised); desktops refresh on heartbeat. Does not change app name, auth or permissions | client OSS, Admin private | `docs/organization-branding.md` |
| White-label (`brand.json`) | name, tagline, accent, logo, favicon, support link | **paid `whitelabel`** | `enterprise/README.md` |
| Team escalations | **bot-level, not human-level.** When a bot's run parks on a gate only a person can lift (peer-approval card, `NEEDS INPUT:`, `raise_escalation`), the person's Chief of Staff bot gets a notice and tells the person where to answer. "The notice assigns nothing"; it never answers in the person's place. Off by default (`features.chiefEscalations`), rate-limited to 3/hour/thread | OSS | `docs/team-escalations.md` |
| Team incidents | a failed or stalled run or routine is reported to the Chief, who may `retry_thread` (twice max), re-delegate or tell the person. Mute after 5 incidents/hour | OSS | `docs/team-incidents.md` |

Important: neither escalations nor incidents are a human approval chain (manager approves staff). "Approval" in OpenMausBot is the vendor engine's permission card answered by the person in the thread, optionally narrowed to the requester or admins.

## 3. Platform

- **Server shape:** one Node 24 process (`package.json` `engines.node >= 24`, pnpm 10.33.0) serving a React 19 SPA, WebSocket (`ws` 8.22.0), no Express/Hono; zod 4.6.7; DuckDB for the "Data" feature (`@duckdb/node-api`); `posthog-js` for analytics; jose for tokens (`package.json`). Bots run **vendor CLIs as subprocesses**, so quality/permissions track those tools.
- **Storage:** no external database. `messages.db` is SQLite (`node:sqlite`, WAL, 0600, `server/message-db.ts`); everything else (bots, groups, config, decisions, admin-activity, sessions, memory) is JSON/NDJSON files in the data dir (`server/store.ts` imports `writeFileAtomic`, `registry-save`; `docs/self-hosting.md`). A message-search worker exists. Backups: full workspace backup (`server/workspace-backup*.ts`, `docs/workspace-backups.md`). No encryption at rest of content (only owner-only file modes); [inference: no Rakazo-style envelope encryption; grep for such a module in `server/` found only `secret-vault.ts`, `cloud-secrets.ts`, `phone-secret.ts`].
- **Concurrency/scale:** single process, files and SQLite: a single-tenant, single-machine design. A company of dozens is plausible, hundreds of concurrent bots is not evidenced. [inference]
- **Sign-in:** (a) pairing code, session 30 days, sliding up to 180 (`docs/deploy-vps.md`); (b) emailed 8-digit code, but **the code is sent by `accounts.openmausbot.com`**, the vendor's hosted account service, "so your server needs no email credentials" (`docs/self-hosting.md`; `server/account-signin.ts` imports `electron/control-plane-client.mjs`). Who is allowed is still decided by your local list, but a company must depend on the vendor's mail service or replace this module; (c) paid hosted-workspace OIDC-like handoff with PKCE to an external identity service and a revocation check on every remote request, fail-closed (`enterprise/server/workspace-access.ts`, `docs/verification/hosted-workspaces.md`). `sso` is only planned.
- **Remote access:** three paths (`docs/deploy-vps.md`): A `serve --tunnel` gives `https://c-xxxx.openmausbot.com` through a Cloudflare tunnel provisioned by the vendor control plane; B own domain via Docker plus Caddy (`compose.yaml`, `deploy/Caddyfile`); C Tailscale (`serve --tailscale`). Loopback-trust is the auth model; behind a proxy it uses `OMB_PUBLIC_URL`; "service" vs "owner" loopback trust matters on shared hosts (`docs/verification/shared-workspace-trust.md`).
- **Cloudflare:** `cloudflare/control-plane/` is a Worker with D1: Better Auth 1.7.7 email OTP, owner-scoped "installations", revocable `omb_install_` credentials, one managed Cloudflare Tunnel per installation, multi-account capacity; it stores no bots or chats (`cloudflare/control-plane/README.md`). `cloudflare/composio-broker/` is a second Worker for connected apps. These are Apache and in the repo, so a company could run its own, but they assume Cloudflare accounts.
- **BYO VPS (`docs/byo-vps.md`) is not "host the server on a VPS".** It means: the agent process stays on your machine, and a **bot's computer** is a Cua Linux-desktop container on a VPS you own, reached by `docker -H ssh://`. Requires the SSH user to be in the `docker` group, which the doc itself calls "root-equivalent". Hosting the whole server on a VPS is `docs/deploy-vps.md` (2 CPU / 4 GB "is plenty", Ubuntu 22/24, Node 24, tested on a Hetzner CX43, `docs/deploy-vps.md` "Hetzner launch check"), and `compose.yaml` (service `omb` + `caddy`, volume `/data`, healthcheck on `/api/health`, `init: true`, `shm_size: 512m`).
- **Cloud Pro / MausBot Cloud (`docs/cloud-pro.md`, 2188 lines):** one Fly.io app + `home` machine + `/data` volume per customer, Starter/Personal/Pro/Max plans, an always-on server with TLS at `*.fly.dev`; `Dockerfile --target cloud-home`, `deploy/fly/`. **"OMB Cloud includes no AI usage"**: the customer signs in with their own Claude/ChatGPT subscription or API key; only a small trial Claude credit is metered by the Admin's relay. Billing, plan changes, pricing pages and the relay are in the private Admin; the repo only holds the machine side contract (signed pairing/health/power reads, contract v1).
- **Billing for a company:** not in the OSS repo. Only per-model sell prices and a billable column (paid `billing`) and usage ledger (`server/usage-ledger.ts`, OSS). No Stripe code was found in the shipped repo (the word appears only in `docs/analytics.md` and two design specs).

## 4. Ops

- **Deployment shapes:** desktop app (Electron, macOS/Windows/Ubuntu), `npx openmausbot serve` on any Linux, Docker + Caddy, Podman (`deploy/podman`), Fly (`deploy/fly`), fleet of per-client OS users, Tailscale-only, and a headless CLI.
- **Resources:** 2 CPU / 4 GB "plenty" per workspace (`docs/deploy-vps.md`); Chrome needs 512 MB shm. Far lighter than Rakazo's Postgres + worker + supervisor + 2 GB per computer stack. Fleet adds `--memory 1G` per client.
- **CI (`docs/ci.md`, `.github/workflows/` 17 files):** `scripts/ci-scope.mjs` maps changed files to areas and runs only affected jobs (docs, locales, web, server, desktop, control plane, ...); Vitest in 8 shards on Linux, Windows and macOS lanes, packaged-server smokes, a required "CI" gate and a merge queue. A job named "open-source edition builds without enterprise/" proves the OSS cut (`LICENSING.md`).
- **Release (`docs/releasing.md`):** "Prepare next release" opens a version-bump PR; merging triggers Release, which builds signed/notarised macOS (arm64+x64), Windows and Ubuntu from one pinned commit, verifies every artifact, waits for a green CI on the release commit, and assembles a draft. A legacy releases repo is mirrored byte-for-byte because older installed clients bake that updater URL. Version cadence 0.1.135 with PR-per-fix commits (HEAD is "#4027") suggests thousands of merged PRs, heavy AI-assisted workflow [inference].
- **Telemetry (`docs/analytics.md`):** anonymous PostHog (US cloud) events from `posthog-js`, off-switch in Settings > General > Usage analytics; docs say with it off the library is never downloaded. Never sent: keys, names, emails, URLs, paths, ids, prompts. Properties are counts, booleans or fixed word lists (`src/lib/analytics-allowlist.ts`). A daily `app_snapshot` is sent by admin/owner only. The doc does not say whether the default is on or off; [inference: treat as on-by-default and verify in `src/lib/analytics-*`]. For a company fork, remove `posthog-js` entirely.

## 5. Size and quality signals (my `wc`, ts/tsx/mjs/js/sh/swift/kt)

| Dir | Files | Test files | LOC | Test LOC |
|---|---|---|---|---|
| `server/` | 2,272 | 1,166 | 516,237 | 294,909 |
| `src/` (React UI) | 1,639 | 747 | 235,247 | 106,246 |
| `electron/` | 323 | 168 | 64,430 | 37,345 |
| `scripts/` | 274 | 84 | 42,952 | 12,838 |
| `shared/` | 188 | 50 | 20,075 | 5,650 |
| `cloudflare/` | 34 | 10 | 15,767 | 8,000 |
| `companion/` (phone) | 42 | 23 | 8,931 | 5,196 |
| `connector/` | 26 | 7 | 4,819 | 1,049 |
| `evals/` | 41 | 13 | 4,472 | 1,137 |
| `enterprise/` | 7 | 3 | 785 | 442 |
| `docs/` | 239 .md files incl. `docs/verification/` (about 140 checklists) | | | |

Total about 913k LOC, test share about 52% in `server/`. Strengths: `*.e2e.test.ts` for visibility, wire privacy and audience rules (`server/bot-visibility.e2e.test.ts`, `server/bot-wire-privacy.e2e.test.ts`, `server/cloud-team-people.e2e.test.ts`), golden admission test, evals, and a verification-doc per feature. Weaknesses: `server/` is a flat directory with over 2,000 files; the 2,188-line cloud-pro doc and 1,282-line self-hosting doc are signs of accreted complexity; no real database layer; stringent coupling to vendor CLIs and to the vendor's cloud for sign-in/tunnel/billing. TypeScript 5.8, Vite 7, Vitest 4.1, Electron 43 (`package.json`).

## 6. Genuinely strong for a company deployment

1. **The audience rule and private-by-default chats** (`docs/team-cloud.md`): clear, tested confidentiality semantics, with per-person engine HOME, browser profile and memory layer, and deletion-on-leave. This is more rigorous than most open products.
2. **Per-bot sharing levels** none/view/chat/edit with an explicit list of what even "edit" cannot do (`shared/bot-access.ts`, `server/host/bot-access-gate.ts`), enforced at a single gate by path, query and body, returning 404 for hidden things.
3. **Team vs person connection scopes** with "acting person" logic: a bot uses Ada's Gmail only when Ada's own words started the turn in Ada's own chat (`server/host/acting-person.ts`).
4. **Bot box** (bubblewrap + seccomp + egress gate + capability-token harness, `docs/bot-box.md`): real per-turn isolation of shell, MCP processes and browser.
5. **Audit trio in OSS**: decision log with `answeredBy`, admin activity with redacted before/after, per-person usage; CSV export (`docs/self-hosting.md`).
6. **Department export/import with secret scrubbing** and additive, off-by-default import (`docs/team-sharing.md`); org library with withdrawal and local-edit hashes (`docs/org-library.md`).
7. **Lightweight ops:** 2 CPU/4 GB, one process, files plus SQLite, 20-minute VPS guide, fleet mode for per-client isolation.
8. **Open-core boundary engineering:** the OSS build is CI-proven without `enterprise/` and the hosted sign-in "fails closed" (`LICENSING.md`).

## 7. OpenMausBot vs Rakazo

| Topic | OpenMausBot | Rakazo (`4-nen-tang.md`) | Better for aris |
|---|---|---|---|
| Licence | Apache-2.0 plus source-available `enterprise/` (licence key, no hosting for others); trademark reserved | Apache-2.0 throughout, no carve-out | Rakazo (clean; Maus gates budgets/SSO/white-label) |
| Stack | Single Node process, vendor CLIs as engines, files + SQLite | Hono/oRPC, Postgres + Prisma, Graphile worker, own Pi runtime | Rakazo for a platform; Maus lighter |
| Tenancy | Process-per-client (fleet), or one workspace; no org/space model in the DB | `User > Member > Organization > Space`, `SpaceMember` composite FK | Rakazo |
| Isolation | Audience rule in app logic; bot-box sandbox only on Cloud roles; self-host shares one OS user | Postgres row-level security with two DB roles; per-space data keys; per-bot network computers | Rakazo (data); Maus (per-turn shell sandbox idea) |
| Roles | Owner/Admin/Member + per-bot none/view/chat/edit + bot owner/reportsTo | Better Auth org roles; "no app admin" philosophy; env admin | Maus for per-bot sharing UX; Rakazo for org roles in DB |
| Private data per person | Excellent: private chats invisible to admins, memory layers, personal connections, deletion on leave | Space-level; user-owned model/MCP/skills with availability per space; per-user approval rules | Maus |
| Approvals | Vendor permission cards answered by requester/admin; levels Ask/Auto-edits/Approve-for-me/Full; safety floor | Ask/Auto/Never with Allow/Block lists per user+space, approval model, deployment checker | Rakazo for policy; Maus for who-may-answer |
| Budgets | One workspace monthly cap, **paid** (`budgets`); per-person spend only displayed | Credit lots, reserve then settle, per-org Stripe billing, append-only journal | Rakazo |
| Audit log | NDJSON files, CSV export, 180-day retention, not tamper-proof | Append-only Postgres table with triggers, JSONL export, SIEM webhook, 365-day retention | Rakazo |
| Encryption | Owner-only file modes, secret vault | AES-GCM envelope per space, KMS option | Rakazo |
| Sign-in | Email allow-list via vendor's account service; paid hosted handoff; SSO only planned | Better Auth (email OTP, passkeys, orgs); self-hostable | Rakazo |
| Billing/cloud | Fly machine per customer, private Admin, no AI included | Optional Stripe credits in repo | Rakazo (code available) |
| Ops weight | 2 CPU/4 GB, one process | 4 vCPU/8 GB floor, 6+ services, 150+ env vars | Maus |
| Backups | Workspace backup files | pg_dump + PITR sidecar, restore drills | Rakazo |
| CI/release | Scope-based CI, signed desktop releases | 15 workflows, Postgres journeys, upgrade test | Tie |
| Telemetry | PostHog anonymous, off-switch | Optional Sentry/Axiom/OTel, no phone-home required | Rakazo |
| Escalation / incidents | Chief-of-Staff bot loop (bot-level) | Tickets/boards, audit events | Maus has the novel idea |
| Code size | about 913k LOC, flat `server/` | about 767k LOC, packaged monorepo | Rakazo more structured |

### 7.1 Strengths of OpenMausBot worth taking
1. The audience rule, as a design spec: three audiences, "a turn reads only what everyone who sees the answer may see", mayRead/mayWrite at one gate (`docs/team-cloud.md`). Re-implement on top of Rakazo-like RLS.
2. Per-bot sharing levels and the "what even edit cannot do" list (`shared/bot-access.ts`).
3. `team` vs `person` connection scope plus "acting person" attribution ("using Ada's Gmail").
4. Offboarding that deletes personal data instead of handing it to admins, and an explicit `member-left` webhook.
5. Admin read that exposes names/states, never secrets, and shows private chats as metadata only.
6. Department export with secret scrubbing and additive, disabled-by-default import; org library with withdrawal.
7. Who-may-answer-a-card rule traced through delegation chains (`docs/self-hosting.md`).
8. Bot-box per-turn sandbox pattern, if aris runs vendor CLIs.
9. Fleet mode as a cheap hard-isolation option for clients.

### 7.2 Where Rakazo is stronger
Real multi-tenant data model (organizations, spaces, members) in Postgres with RLS; envelope encryption; append-only audit and billing journals; Stripe credit accounting; per-user approval policies with Block lists; self-hostable auth (passkeys, OTP, orgs) with no vendor service; no licence gate; backup/PITR discipline; typed RPC contracts and a more structured monorepo.

### 7.3 Which is the better reference for aris's company/multi-staff model?
**Rakazo is the better structural reference; OpenMausBot is the better reference for the privacy and sharing semantics.** Reasons:
- aris needs admin-issued accounts, departments, per-person budgets and a durable audit trail. In OpenMausBot those are either paid (`budgets`, `sso`, `admin`), planned, or in a private service (team creation, invites, billing, roster). What the repo ships is the *client/machine half*; copying only that leaves the control plane unspecified.
- OpenMausBot's team boundary is app-logic over files (a flat file store, same OS user unless the Cloud bot box is on). An audit-grade company needs the guarantees Rakazo gets from RLS and encryption.
- Licensing: Rakazo is clean Apache. With Maus you must avoid `enterprise/` and the trademark, and any "per-company" feature you want from it you must build yourself.
- However, Maus has solved human-facing questions Rakazo's report does not show: private-by-default conversation audiences, sharing levels, personal connections, leave-the-company cleanup. Use these as the product spec, built on Rakazo-style tenancy.
- Neither provides per-person approval *chains* (manager approves staff) or per-person budgets; aris will have to design those. Maus's closest hooks: `answeredBy`, `reportsTo` and per-person usage; Rakazo's: `UserActionApprovalRule` and credit lots. [inference]

Caveats: this review did not read the UI (`src/`), the `electron/` code or the private Admin; the licence of `third_party/` items was only read from `NOTICE`; the PostHog default state was not verified; no Stripe code was found but the private Admin may have it.
