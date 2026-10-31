# OpenMausBot: computers, apps and user experience

Source: shallow clone at commit 80012e6 (Apache-2.0 except `enterprise/`). Read-only; nothing was run or built. Paths are relative to the repo root unless noted. **[inference]** marks my reading, not a stated fact. The iOS Swift app is NOT in this clone (no `ios/` dir), so iOS claims come from docs only.

## 0. One paragraph

OpenMausBot (a.k.a. MausBot, formerly OpenGrokBot) is a "Telegram-style chat app where every chat is a real AI agent" (`README.md`, hero alt text). Agents are the user's own `claude`, `codex`, `grok` CLIs (plus ACP engines) spawned by a local harness server on `127.0.0.1:8799`; the React UI only talks HTTP plus one SSE stream (`README.md` "How it works"). The product is a desktop-first Electron app (macOS, Windows, Ubuntu) with a paid "MausBot Cloud" (one always-on Fly machine per customer running the same server), an iOS/Android phone companion, and a web UI the server serves itself. Compared with Rakazo it is local-first and bring-your-own-subscription, and its bot "computer" is a menu of backends rather than one sandbox abstraction.

---

## 1. Bot computers

### 1.1 What "its own cloud computer" is

Not Docker-only and not a VM it builds. There are five places a bot can work (`apps/docs/content/docs/computers/index.mdx`, `README.md` "Agents with hands"):

| Backend | What it is | Key files |
|---|---|---|
| **Boat cloud computer** (default "cloud box") | A hosted Linux desktop from **boat.dev** (README: "Boat ... Each bot's cloud computer, our sponsor"). Created via Boat public API v1 (`POST /sandboxes`, 202, ready ~2 s; stop to archived ~5 s; resume ~8 s; "disk persists, tmux does not") | `server/boat.ts` (header comment), `server/boat-relay.ts`, `server/boat-lifecycle.test.ts` |
| **Local VM** | A per-machine Docker/Podman container built on the third-party `trycua/xfce-cua` XFCE image pinned by digest, with `cua-driver` inside; 4 GiB memory limit, workspace under `<data>/vm-home(s)`; modes shared / per-bot / pool; noVNC viewer on loopback port 6080 | `server/container-computer.ts`, `server/local-vm-seat-pool.ts`, `apps/docs/.../computers/local-vm.mdx` |
| **Own VPS (BYO)** | Docker over SSH alias to the user's x86_64 Linux server; one hardened Cua container per bot; no public port; noVNC reached by temporary loopback SSH tunnel | `server/vps-computer.ts`, `docs/byo-vps.md` |
| **This computer** | The user's own Mac / Windows / Ubuntu-Xorg via `cua-driver`; explicit opt-in | `docs/computer-use-integration.md`, `docs/linux-desktop.md`, `server/local-computer.ts`, `server/your-computer-consent.ts` |
| **Built-in browser** | Bundled `agent-browser` + Chromium headless shell or real Chrome / Chrome for Testing, per-bot isolated persistent profile; "My Chrome" mode lets a Cloud bot act in the user's own Chrome | `docs/browser-packaging.md`, `server/browser/`, `docs/superpowers/specs/2026-10-26-cloud-my-chrome-design.md` |

Plus a phone: USB Android device driven via a "Phone Harness" skill (`apps/docs/content/docs/mobile/android-control.mdx`, `skills/phone-harness`, `electron/android-device.mjs`).

The agent process itself never runs inside the Boat or VPS. For a Boat turn the agent runs on the harness host and gets an MCP server `POST /api/internal/computer/mcp` behind a turn-scoped capability "so the Boat credential never leaves this server" (`server/cloud-computer-tools.ts` line 1). **[inference]** same split as Rakazo: brain outside, hands inside.

### 1.2 Lifecycle

- **Lazy**: on "Auto", a conversation uses the Boat only after the bot asks to switch (`select_computer`); Auto never reads, wakes or creates a Boat by itself (`computers/cloud-and-vps.mdx`; tests `server/cloud-computer-lazy.e2e.test.ts`).
- **Auto-sleep**: Boat sleeps after 10 minutes idle with no turn, no routine, nobody watching its screen or holding its desktop; stays on if a routine will run within 30 minutes; wakes in seconds with files and installed apps intact (`cloud-and-vps.mdx`; `server/computer-idle.ts` is a debounced idle timer with busy re-checks ten times per window and exponential retry up to 1 h; `server/boat-auto-sleep.test.ts`).
- **Safety plumbing around billing**: deterministic names `ogb-<env-hash>-...` so another installation never claims your boxes, create idempotency journal, delete journal, inventory with orphan detection (`server/boat.ts`, `boat-create-idempotency.ts`, `boat-delete-journal.ts`, `boat-inventory.test.ts`). Trial accounts retry with a shorter 2 h TTL ceiling (`boat.ts` `TRIAL_BOAT_TTL_SECONDS`).
- **Local VM**: durable mounted workspace + browser profile; renewable ownership lease; image validated by labels, not tag (`local-vm.mdx`, `container-computer.ts`).
- **Cloud home** (MausBot Cloud) is a different layer: one Fly app, one always-on `home` machine, volume at `/data`, TLS at `https://<app>.fly.dev` (`docs/cloud-pro.md` lines 1-30). Some plans sleep when idle; the Admin suspends the machine and Fly restarts it on any request (`cloud-pro.md` "A Cloud that sleeps"). On a Cloud home there is no "This computer" or "Local VM"; bots use the built-in browser and Boat computers (`cloud-pro.md` "Where bots work", `shared/cloud-home.ts`).
- **Self-hosted Cloud**: a `mausbot-connector` container with the Docker socket enrolls with a one-time code from a `curl | sudo sh` installer, minimum 2 CPU / 3.5 GB / 20 GB; talks only outward (`connector/install.sh`, `connector/Dockerfile`, `connector/src/main.ts`).

### 1.3 How the bot controls it

- **Boat**: 10 MCP tools: `screenshot`, `get_screen_size`, `click`, `move`, `drag`, `type_text`, `key_press`, `scroll`, `open_url`, `exec` (`server/cloud-computer-tools.ts` `CLOUD_COMPUTER_TOOLS`). Arguments are validated against JSON schemas with integer-only coordinates "because x and y reach the remote shell unquoted". Calls that time out say "may still have run; take a fresh screenshot before repeating" (`CLOUD_COMPUTER_LATE`). `exec` runs under `env -i` so provider credentials are not in its environment (`boat.ts` `isolatedRemoteCommand`). Reddit is refused from datacenter browsers on purpose (`cloud-computer-tools.ts`, `server/browser/egress/reddit.ts`).
- **Local VM / VPS / own computer**: official `cua-driver mcp` (stdio proxy to a socket daemon), 20+ tools including `get_window_state`, `get_accessibility_tree`, `launch_app`, with an accessibility-element-first, background-input ladder (`ax -> cgevent -> cgevent_hid`) that avoids stealing the user's cursor (`docs/computer-use-integration.md`). Policy: "CUA is the ONLY local desktop-control provider", no cliclick/robotjs/Python server. Version 0.37.0 in the VM image (`container-computer.ts`), 0.19.3 ELF bundled for Ubuntu (`computer-use-integration.md`).
- **Browser**: embedded tiers 1-3 in `computer-use-integration.md` (Electron `WebContentsView` + CDP; "use my real Chrome" via extension; optional Playwright MCP). The shipped path is `agent-browser` per `docs/browser-packaging.md`; **[inference]** the WebContentsView tier was the design, agent-browser the implementation.
- **Saved steps**: replay of a bot's recorded cua-driver tool calls by app/window title/accessibility label, not pixel (`docs/superpowers/specs/2026-10-27-saved-steps-design.md`, referenced from `computer-use-integration.md`).

### 1.4 How the user watches and takes over

- **Computer panel** (screenshot `docs/screenshots/computer-panel.png`): right pane titled "Computer" with the bot's screen thumbnail, buttons **Open desktop** and **Sleep**, a **Runs on** segmented control (Cloud box / This Mac / Off), and a Routines card. Component `src/components/ComputerPanel.tsx`, `CloudScreenPreview.tsx` (click to open live desktop).
- **Live view**: stills are polled; Boat is rate-limited (~1,000 API requests/min per IP, one screen costs two) so the "Team map" shares a global frame budget and never captures while a person holds control (`server/computer-frames.ts`). Live desktop uses noVNC inside the app (`src/novnc.d.ts`, `src/components/DesktopViewer.tsx`); for Boat it asks `POST /sandboxes/{id}/desktop?vnc=1` and falls back to a plain WebSocket that survives P2P-blocking networks (`server/boat.ts` ~line 368). Non-loopback clients see Local VMs through a proxy `/api/desktop-viewer/<target>` with a strict target regex (`shared/desktop-viewer.ts`, `server/desktop-viewer-targets.ts`).
- **Take control**: in-memory control record per bot: while the person holds it "the bot's actions are refused, never queued: a queued click would land on whatever is under it later"; a bot can only ask for hands (`requestHelp`); memory-only on purpose so a hold cannot survive a restart (`server/computer-control.ts` header). Take-control e2e: `server/computer-take-control.e2e.test.ts`.
- **Sign-in handoff**: bot posts a "Sign in needed" card with **Open / Take control / Done**, never asks for passwords in chat; or fills a saved/1Password login itself with `fill_login`, only on the login's own site, without ever showing the bot the password (`computers/index.mdx`).
- **Two-up desktops**: "Open two desktops" watches two bot VMs side by side; only one pane holds interactive control (`local-vm.mdx`).
- **Remote takeover**: a paired desktop/phone can preview and take over a VPS desktop only if a per-device "Cloud desktop access" toggle (default off) is on; the host opens a loopback SSH tunnel and relays noVNC (`docs/desktop-companion.md`).

### 1.5 Local computer use on the user's machine

- macOS: bundled Rust `cua-driver` re-signed under the app's Team ID, spawned from Electron main so TCC attributes permissions to OpenMausBot (one prompt), needs Accessibility + Screen Recording; onboarding deep-links System Settings (`computer-use-integration.md`, `electron/cua.mjs`).
- Ubuntu 24.04: GNOME/Xorg opt-in control with a pinned, hash-verified, outside-ASAR CUA ELF; GNOME/Wayland is view-only (portal + PipeWire) and control is **fail-closed** pending issue #345 (`docs/linux-desktop.md`).
- Windows: lending docs say "Windows needs nothing" for permissions (`cloud-pro.md` line ~608); `src/components/WindowsLocalControl.tsx` exists. Details not read.
- Consent: before a bot's first action on the person's own computer in a request, one plain-words question at every approval level (`server/your-computer-consent.ts`, `computer-use-integration.md`). Preview is not permission (`computers/index.mdx` callout).
- **"This computer works for your Clouds"** (`docs/cloud-pro.md` line 576+): the desktop app automatically lends the user's Mac/PC to their own Cloud while the app is running: home-internet connection for sites that block data centres, the user's real Chrome, home folder read/edit (2 MiB read, 256 KiB write, hash-checked, never delete, keys/passwords folders private), and apps+screen once control works; **never the terminal**. A menu-bar indicator shows lending; a bot that needs the PC when it is off posts a "Turn on" card (`server/computer-asks.ts`, `src/computer-ask-preview.tsx`). Folders get a copy on the Cloud (<= 3 GB) so bots still read them while the laptop sleeps (`docs/files.md`).

### 1.6 Isolation, the "bot box"

On a Cloud home every turn runs in an unprivileged **bubblewrap** sandbox: private mount/PID/network namespaces, loopback-only, egress through an HTTP gate that resolves names itself and refuses private/link-local/metadata/Fly addresses, only `/api/internal/*` routes reachable on the server port, environment allow-list, a **credential broker** that swaps provider keys for per-turn tokens bound to bot+conversation, a seccomp filter blocking 34 syscalls, and a boot-time self-check with a mutation test mode (29 checks) (`docs/bot-box.md`, `server/bot-box/`). Cost measured ~5 ms and 3 MB per box. Known gaps are listed honestly (subscription logins visible inside the box, no per-bot Linux user).

---

## 2. Apps

### 2.1 Electron desktop (macOS, Windows, Ubuntu)

- Packaging: `electron-builder.yml` (appId `com.opengrokbot.app`/`com.openmausbot.app`, GitHub provider auto-update; `electron-updater`, "update when quiet" `electron/update-when-quiet*.mjs`). Downloads: signed+notarized macOS .dmg (Apple silicon and Intel), Windows NSIS .exe, Ubuntu .deb and AppImage (`README.md`, `docs/linux-desktop.md`).
- The harness server is embedded and run on Electron's own Node via `ELECTRON_RUN_AS_NODE` (`electron-builder.yml` comments); Electron main supervises it (`electron/server-supervisor.mjs`, `server-child-launch.mjs`), holds a data-dir lease so two apps never share state (`data-dir-lease.mjs`).
- Native extras: Apple on-device dictation, global "Talk" shortcut and panel (`electron/talk-*.mjs`), `openmausbot://` deep links (`docs/desktop-chat-links.md`: `thread/<id>?bot=<id>` and `bot/<id>`), system tray/menu-bar, open-at-login, window state, OS-encrypted credentials (`secure-credentials.mjs`), managed Cloudflare tunnel (`managed-companion-tunnel.mjs`), CUA driver, Android USB (`android-device.mjs`).
- **Environments / places rail**: switchable named local data directories ("APRS Chat" example) and remote servers; a left rail of tiles once the user has two places; "Make <server> my home" moves bots (`docs/superpowers/specs/2026-10-07-local-environments-design.md`, `src/components/PlacesRail.tsx`, `electron/one-home*.mjs`, `src/one-home-preview.tsx`).
- **Desktop-to-desktop companion**: any desktop build can be a client of another desktop host; UI stays local, API crosses a default-deny allowlisted companion boundary via a loopback Electron relay that injects the bearer; six-digit pairing over managed HTTPS or Tailscale (`docs/desktop-companion.md`).
- Update: **Org library** channel for organizations to push bot packages (`docs/desktop-library.md`; **[inference]** this ties to the license-restricted enterprise/hosted-workspace features, see section 8).

### 2.2 iOS companion (and Android)

- Thin native Swift client for the Mac's instance; the Mac is the only machine holding agent processes, credentials, SQLite, transcripts (`docs/ios-companion.md`). Pairing by QR from desktop Settings -> Remote access, with computer name confirmed on the phone; fallbacks: nearby Bonjour computers, manual address, six-digit code (two-minute single-use). Device token stored as SHA-256 digest at rest; Keychain on the phone (`companion/README.md`, `ios-privacy.md`).
- Features: bot/room lists, paged transcripts, send/interrupt, unread, approvals and questions with narrow "always allow", resumable SSE, opt-in live Boat view, stills of a Local VM for allowed phones, markdown, secure credential entry by Password AutoFill + QR-pinned **HPKE** encryption, Share extension, multiple saved computers (`ios-companion.md`). Phone tools: the bot can read the person's phone calendar/reminders/contacts/location/home; writes shown in chat; SMS/WhatsApp only open a sheet the person taps Send on (`server/phones/instructions.ts`, `shared/phone-apps.ts`).
- With a paid Cloud, the phone pairs to **My Cloud** instead of the laptop, so it keeps working with the computer off (`cloud-pro.md` "Use My Cloud on your phone").
- Android: APK distribution and "Get the phone app" menu entry (`cloud-pro.md`); Android shares much of the phone surface (`docs/superpowers/specs/2026-09-18-mobile-touch-control-design.md`, `2026-09-25-live-call-bar-design.md`). Android app source not in this clone.

### 2.3 Phone web app

PWA install to Home Screen from the server's HTTPS address (Safari/Chrome), same pairing as a browser; explicitly **no** offline chat, **no** push, no native phone computer control (`docs/phone-web-app.md`; `public/manifest.webmanifest`).

### 2.4 How apps connect (relay and tunnel)

Three trust surfaces: harness `127.0.0.1:8799`, companion sidecar `0.0.0.0:8810` (pairing, default-deny route allowlist per method/path in `companion/src/routes.ts`, response/SSE scrubbing of provider session ids), and a guardian gateway `127.0.0.1:8812` for the tunnel (`docs/ios-companion.md` diagram).

- LAN / Tailscale: direct to the sidecar.
- **Optional hosted HTTPS = Cloudflare Tunnel**: a Cloudflare Worker "control plane" (Better Auth email-OTP, D1) provisions one remotely managed tunnel + opaque DNS name per desktop installation; the desktop runs a bundled outbound `cloudflared`. Hostnames pinned to `c-<32hex>.openmausbot.com|mausbot.si` (`cloudflare/control-plane/README.md`, `src/endpoints.ts`, `docs/desktop-companion.md`). Messages, approvals and screen frames transit Cloudflare but are not stored in the control-plane DB (`docs/ios-privacy.md`). Multiple Cloudflare accounts with capacity balancing and idle reclaim (`README`, migrations 0006-0007).
- A second Worker, `cloudflare/composio-broker`, keeps the shared Composio project key out of builds and gives each install its own Composio session (connected apps; also wakes sleeping Clouds on app events).
- Self-hosted server: `serve --tunnel` managed tunnel, Docker+Caddy, or Tailscale; pairing code instead of passwords; session 30 days renewable to 180 (`docs/deploy-vps.md`, `docs/self-hosting.md`, `docs/plans/remote-workspace.md`).

### 2.5 Push notifications

- Desktop: system notifications suppressed when focused; each carries bot ID + exact task thread ID, and a click must select that bot and task; the harness is "the single owner of interruption policy" with kinds needs-approval / question / needs-your-hands / finished(only if non-empty) / routine-failed. **Proactivity is an explicit trigger, not a hidden heartbeat** (`docs/notification-and-proactivity-qa.md`).
- iOS: live/replayed alerts while the app runs or in a short background grace; closed-app delivery was "not part of this version" in the docs. But code for it now exists: `cloudflare/control-plane/src/push.ts` is an **APNs relay** (device tokens, 50 devices cap, per-hour send limits, kinds approval/question/sign-in/mention, bot/thread ids only, 24 h expiry) and `ios-privacy.md` has a "Closed-app alerts" paragraph. **[inference]** closed-app push is built server-side but gated on project-owned APNs credentials and the optional hosted access; docs lag the code. Phone web app: none (`phone-web-app.md`).

---

## 3. Chat UX

- **Sidebar like contacts** (`docs/screenshots/hero.png`, `computer-panel.png`): search box, rows with a coloured cursor-arrow mascot with a little face, name, timestamp, last-message preview; footer: Automations, Plugins, profile. Right-click: pin, mark unread, edit profile, duplicate, copy conversation ID, hide, delete (`README.md`, `src/components/BotContextMenu*`). Channels and "departments" group bots and rooms; threads per bot (`docs/plans/2026-09-09-independent-threads.md`).
- **Question cards**: "Your bot has a question" card with lettered options A/B/C and a dismiss X; also open (free-text) questions, answered state, secret/sign-in/connector/choice cards; same shell reused in an **Inbox** with tabs "needs-you"/"done" and unread (`src/components/QuestionCard.tsx`, `src/question-cards-preview.tsx`, screenshot `computer-panel.png`). Approval cards "Approval needed" with Allow/Deny, tool name and command, plus narrow "always allow" (`ApprovalCard.tsx`, `docs/approval-levels.md`, `docs/screenshots/approval-card.png`). Approval levels include Ask / Auto (judged) / Just do it (`cloud-pro.md` "Ask first or Just do it"). Dev galleries render real components over fixed fake stores in two skins and any language via URL params (header comments in `src/*-preview.tsx`).
- **Room cards**: in the app a "room card" is a **Cloud-capacity card**, not a chat-room card: "3 tasks waited 6 minutes for memory today. Pro has twice the memory. $49 a month. Upgrade / Not now"; never shown mid-turn, at most weekly, not-now silences two weeks (`docs/cloud-pro.md` "Room card", `src/components/CloudRoomCard.tsx`, `src/room-card-preview.tsx`). Chat rooms (group chats of bots, lead bot, room bulletin, queue, holds, working folder, turn timeout) are separate (`src/components/Room*.tsx`).
- **Usage meter**: sidebar card above the profile shows only when an allowance is >= 80% (amber 80%, red 100%): computer hours, voice characters, decisions, X calls, research dollars, storage GB; Hide-for-now per month/level; Settings -> General shows all; **one-tap Upgrade with a server-computed prorated preview** ("Today you pay $23.40... From Nov 18 it's $99") and a decline-safe confirm (`cloud-pro.md` "Usage meter", `src/components/CloudUsageMeter.tsx`, `src/usage-meter-preview.tsx`). Display only; never grants or limits.
- **Onboarding**: local first-run is two beats "meet" -> "chief" (introduce the Chief of Staff bot) with a guided tour (`src/lib/onboarding.ts`, `src/components/onboarding/`, `src/onboarding-preview.tsx`). Cloud welcome: 4 steps (Bring your stuff; Connect your AI; Files and apps; Ready), resumable on any device via a server-side record, ending with "What should your Cloud do while you're away?" (four idea chips, sent as `/setup <job>`, never a gate, Skip always visible) (`cloud-pro.md` "What the person sees", `src/components/cloud-welcome/`, `CloudIntent.tsx`). Cloud-buy sheet with email-code sign-in and What's-new popup (`src/cloud-buy-preview.tsx`, `CloudAddDialog.tsx`); cancel-plan flow (`CloudCancelPlan.tsx`).
- **One-home**: when a user has several places (This computer, a Cloud, own server), "bring the bots together on one server of your own": copies bots, chats, skills, logins, settings to the home with live progress and failure states ("Move your bots to your Cloud") (`src/one-home-preview.tsx`, `electron/cloud-send*.mjs`, `docs/cloud-pro.md` "This computer's bots move to your Cloud", `src/components/TwoPlacesCard.tsx`).
- **Mascot/avatars**: the brand is a cursor-arrow with a face ("SupaMaus cursor mascots with role-aware expressions", `README.md`). `src/lib/mascot.ts` defines motions and states (idle, happy, curious, drowsy, working, thinking, listening, sleeping, suspicious, proud) mapped to scenarios like "Overnight / async" or "Task completed"; motions arrive/switch for "New bot created"/"Active bot changed" (`src/mascot-preview.tsx`). Ten selectable body shapes rendered from one solved source on desktop and iOS after the two drifted by 14% (`docs/superpowers/specs/2026-08-31-mascot-shape-catalog-design.md`, `scripts/mascot-bodies/`). A custom picture is shown flat, no eyes drawn over it (explicitly rejected after review).
- **Files library**: top-level Files page for Cloud users with lent folders and "Your bots' work" syncing down to `Documents/MausBot/<bot>/<conversation>`; never merges two sides, nothing deleted locally because of a Cloud action; stop-sharing moves the Cloud copy to a 30-day trash (`docs/files.md`, `src/components/FilesView.tsx`, `FilePreviewButton.tsx`, `HtmlFilePreview.tsx`, `TableFilePreview.tsx`).
- **Chat links**: `openmausbot://thread/<id>?bot=<id>` and `bot/<id>` from "Copy link"; opens the exact chat, never sends or interrupts; mismatches show a notice, local-shell only so remote pages never receive them (`docs/desktop-chat-links.md`, `electron/chat-link.mjs`, `src/components/ChatLinks.tsx`).
- **Chat Apps**: bots can render inline HTML (`show_html`) and MCP Apps (SEP-1865) in locked sandbox frames in chat on desktop/iOS/Android; Slack/Telegram get a text fallback (`docs/superpowers/specs/2026-10-14-chat-apps-design.md`).
- Simple vs Advanced interface mode, 10+ named skins (Midnight, Atelier, Foundry, Lagoon, Graphite, Linen, Dusk, Daylight, Meadow "the MausBot look", Pop) (`src/lib/skins.ts`, `src/lib/interface-mode.ts`).
- Team features: shared team Cloud with "Private · only you" conversations deleted not handed over when you leave (`docs/team-cloud.md`).

## 4. Voice mode

- **Speech out**: ElevenLabs, Fish Audio, Grok (xAI) TTS, built-in Mac voices, or a local Chatterbox server; all bring-your-own key, keys stay on the harness (`README.md` "Bots that talk back", `server/tts/`, `docs/voice-mode.md` which is historical and ElevenLabs-only). A "spoken register" rewrites markdown into speakable text, names artifacts, drops syntax and splits into utterances; tool narration is computed once server-side so chip and speech cannot drift (`voice-mode.md`).
- **Take-turns calls** (original): half-duplex on purpose (no echo cancellation), macOS Apple `SFSpeechRecognizer` endpointing at 850 ms silence, approvals spoken and answered "yes/no" with clear-decision enforcement, rooms don't speak, macOS-only (`voice-mode.md` "Known gaps").
- **Live calls** (newer): OpenAI **GPT-Live** speech-to-speech over WebRTC (renderer holds only the SDP answer and media connection; OpenAI key never leaves the harness; sideband WebSocket appends; the client data channel may only `session.close`), bot stays the brain by "client delegation", works on any desktop OS and phones, needs the user's own OpenAI key, one live call at a time with "busy line" messages naming the client (`server/live-call.ts`, `voice-mode.md` rejected-options table, `cloud-pro.md` "Live calls"). In-room calls are not supported; on a Cloud only Live calls (no Mac dictation).
- Calendar-scheduled calls exist (`server/calendar-calls.ts`). Mac client mode keeps dictation local and sends only the transcript (`desktop-companion.md`).

## 5. Messaging channels

No Telegram/WhatsApp/iMessage bridge in this repo. What exists:
- **Slack**: hosted Slack worker managed in the Admin portal (link generated in `server/hosted-slack.ts`; gated on the hosted-workspace layer; `docs/self-hosting.md` lines ~573-767). The worker is the one session-less loopback client. **[inference]** this is the paid/enterprise path; the Admin is a separate private repo ("openmaus-cloud").
- Connected apps (Composio, 500+ incl. Gmail, Slack, Discord, X, Reddit) are tools, not channels (`README.md`, `docs/composio.md`, `docs/analytics.md` line 54).
- Engines with their own front doors (Hermes Telegram gateway, a Slack bot) can be bound as "the same bot" via `external-runtimes.json` (`docs/self-hosting.md` ~1136).
- Phone tools can open an SMS/WhatsApp compose sheet that needs a tap (`server/phones/instructions.ts`).
- MCP server and `openmausbot` CLI let Claude Desktop/Cursor/scripts drive the team (`docs/mcp-server.md`, `docs/headless-cli.md`).

## 6. Localization and design language

- 16 catalogs registered: en (source, 7,260 lines), de, es, fr, hi, it, ja, ko, pl, pt-br, ru, tr, uk, **vi (Vietnamese, 5,150 lines, about 71% of English by line count)**, zh, zh-tw (`src/locales/index.ts`, line counts). Vietnamese is real UI text (e.g. "Kết nối Whop", `src/locales/vi.json`). Other locales are partial overlays falling back to English (`docs/localization.md`).
- Process: deterministic `pnpm i18n:check` (placeholders, casing, unknown keys) and **source-hash staleness**: a translation made against older English fails the release bump PR; drafts via an optional local Claude CLI tool, never in CI; vocabulary tests enforce product words ("environment", never "workspace") (`docs/localization.md`, `src/locales/words.test.ts`, `source-hashes.json`).
- Design: dark-first near-black ground, a cursor-arrow mascot, lettered option cards, pill composer with mic, gradient bot colours (screenshots). Real theming system: 10 skins with taglines, gallery URLs take `skin=` and `lang=` (`src/lib/skins.ts`, preview files). Typography/tokens not examined in depth. Docs site is Next.js/MDX (`apps/docs`), including a tool called product-screenshot component.
- Copy discipline: plain sentences for money and risk ("Takes about a minute, and stops anything running now"); wording gates in tests.

## 7. What is genuinely strong or polished

1. **Honest, layered security docs and self-checks**: bot box with 29-check self-test and mutation mode, credential broker, egress gate (`docs/bot-box.md`); per-layer "what it does not stop" table.
2. **Human-takeover semantics**: refuse-never-queue while a person drives, in-memory only (`server/computer-control.ts`); handoff cards; paired-device capability off by default.
3. **Computer-ask flow** ("Turn on your computer" card that resumes the waiting call) and **lending model** with never-terminal rule, hash-checked writes, menu-bar indicator (`server/computer-asks.ts`, `cloud-pro.md`).
4. **Billing UX done carefully**: usage meter only at 80%+, hidden per month, prorated preview server-side, once-a-week room offer, never mid-turn (`cloud-pro.md`).
5. **Companion architecture**: separate default-deny sidecar rather than patching the harness; HPKE secrets from phone; stable server identity and pairing codes in URL hash (`companion/README.md`, `docs/plans/remote-workspace.md`).
6. **Boat lifecycle robustness**: idempotent create, deletion journal, orphan inventory, rate-limited frame budget.
7. **Mascot as a system**: states, motions, ten bodies from one source across platforms (`docs/superpowers/specs/2026-08-31-*`).
8. **Dev preview galleries** for every card and flow in two skins and any locale (`*-preview.html`, `src/*-preview.tsx`).
9. **Localization hygiene** with hash-tracked staleness.
10. **Onboarding that survives devices**: server-side onboarding record, resumable welcome, job-first "What should your Cloud do while you're away?".

Weaknesses worth noting: iOS app source absent from the repo; closed-app push unproven; Wayland local control fail-closed; Local VM/BYO VPS are x86 Linux/Docker only; web push none; no consumer messaging channels in OSS; Windows lending/control details unverified here; `docs/voice-mode.md` is stale versus code.

## 8. enterprise/ (license-restricted)

`enterprise/` is source-available under a separate Enterprise License (`LICENSING.md`, `enterprise/LICENSE`): read/build/evaluate and dev/test use free; **production use needs a license key**; hosting for third parties or white-label needs a partner agreement. Contents: `enterprise/server/license.ts` (Ed25519-signed license keys with customer, features, issue/expiry dates, up to 14 grace days), `workspace-access.ts` (hosted sign-in / revocation adapter), `scripts/issue-license.mjs`, `FEATURES` (entitlement ids: whitelabel, sso, billing and others referenced in docs). Without the folder the server reports `{"edition":"oss"}`; a workspace configured for hosted sign-in refuses remote access without it. Related features likely gated (**[inference]** from `docs/organization-branding.md`, `docs/org-library.md`, `docs/self-hosting.md` "billing entitlement"): organization branding, org library, SSO, Sell prices/billable columns. Names OpenMausBot/MausBot and the mascot are trademarks of Supamaus Software Private Limited (`LICENSING.md`). **Rule for us: do not copy `enterprise/` code; also the mascot and marks must not be reused; Apache-2.0 code elsewhere may be reused with NOTICE retained.**

---

## 9. OpenMausBot vs Rakazo

(Rakazo facts from `/home/user/aris-agent/docs/nghien-cuu/rakazo/2-may-tinh-cua-bot.md` and `3-be-mat-san-pham.md`.)

| Topic | OpenMausBot | Rakazo |
|---|---|---|
| Brain location | Local CLIs (Claude/Codex/Grok) spawned by harness; user's own subscriptions | API/worker process ("Pi" runtime); BYO keys/models, Rakazo credits |
| Bot computer | Menu: Boat (boat.dev) cloud desktop, Local VM (Cua XFCE container), own VPS over SSH, own computer, built-in browser | One `SandboxProvider` interface, 11 providers (docker, e2b, novita, daytona, boat, ...); one Linux desktop image |
| Persistence | Boat disk persists across archive; Local VM mounted dir; no portable cross-provider home | Portable home exported file-by-file, checkpointed, AES-256-GCM encrypted, provider migration cheap |
| Control tools | Boat: 10 MCP tools; Cua: 20+ accessibility-first tools | `computer_observe/act`, DOM-ref `browser_*`, `shell`, loop guards |
| Browser | agent-browser/Chrome per-bot profiles, "My Chrome" | Hand-rolled CDP client on the visible Chromium |
| Watch/takeover | noVNC in app; polled stills; refuse-never-queue; per-device remote viewer | noVNC via encrypted capability-URL proxy, leases+fences in Postgres, `waiting_takeover` run state |
| Local computer | cua-driver on macOS + Ubuntu Xorg, consent, auto-lending to Cloud (Chrome, folders, home IP) | Electron host bridge + outbound user-device websocket; cua-driver macOS only; owner-only runs |
| Sandbox hardening | bubblewrap bot box, credential broker, seccomp, egress gate with self-check | Docker CapDrop ALL, per-bot network, optional iptables egress, vault + redaction; Team computer not isolated between bots |
| Desktop app | Electron macOS/Windows/Ubuntu, embedded harness, places rail, deep links, companion mode | Electron wrapping the same web app, optional local Docker stack |
| Mobile | Native Swift iOS (source not here) + Android + PWA; QR pairing; HPKE secrets; APNs relay | Expo native iOS/Android, Expo push, share sheet, outbox, foldables |
| Connectivity | Cloudflare Tunnel via Worker control plane, Tailscale, pairing codes | Normal hosted web/API; self-host compose |
| Messaging channels | None in OSS (hosted Slack in Admin); phone-compose tools | Slack, Telegram, WhatsApp, Sendblue iMessage/SMS/RCS, Lark via Chat SDK with link codes and group approval |
| Voice | TTS from 5 providers; take-turns (Mac STT); GPT-Live WebRTC realtime | Text-turn loop STT-chat-TTS with barge-in; providers ElevenLabs/OpenAI/Fish/Cartesia/Kokoro; bot-calls-you |
| Chat UX | Cursor-mascot contacts, lettered question cards, inbox, rooms, chat apps (HTML/MCP Apps) | Typed message blocks, avatars animated by run state, approvals, artifacts library, teach-a-task |
| Billing UX | Usage meter + prorated one-tap upgrade + room card | Paywall gate, allowance accounting ($0.20/h notional) |
| Onboarding | Meet/Chief beats; resumable Cloud welcome with first-job prompt | Survey, model picker with preflight, auto-created first bot "Chief" |
| Localization | 16 catalogs incl. Vietnamese (~71%), hash-based staleness check | 14 locales (Lingui); mobile 7 |
| Design | 10 skins, mascot system, preview galleries | shadcn tokens shared across web/Electron/Expo, state-animated avatars |
| License | Apache-2.0 + restricted `enterprise/` | Apache-2.0 |

## 10. Strengths of OpenMausBot worth taking

1. **Lending the user's own PC to the Cloud** (home IP, real Chrome, folders with hash-checked writes, never terminal, indicator, "Turn on" ask card). Concrete fix for datacenter-blocked sites; adapt with Rakazo's existing user-device gateway.
2. **Credential broker + egress gate + bot-box self-check**: swap provider keys for per-turn tokens; mutation-tested security checks. Rakazo's Team computers explicitly lack isolation; a bwrap-style layer for shell tool is a gap-filler.
3. **Refuse-never-queue takeover rule** and handoff card wording; add alongside Rakazo's leases.
4. **Usage meter / room card / prorated upgrade**: show at 80%+, hide per month, never mid-turn, weekly cap.
5. **Resumable server-side onboarding record** and "What should it do while you're away?" first-job box with example chips and visible Skip.
6. **Companion default-deny allowlist**, QR pairing with name confirmation, HPKE-encrypted secret entry from phone.
7. **Dev preview galleries** (state/skin/lang by URL) for cards; speeds design review and i18n QA.
8. **i18n source-hash staleness gate** plus vocabulary tests, directly useful for Vietnamese (vi pack could be a starting point; review tone before reuse, `src/locales/vi.json`).
9. **Spoken register** (markdown-to-speakable, tool narration from one source) for voice.
10. **Chat Apps** (inline sandboxed HTML/MCP Apps) and `openmausbot://` style deep links.
11. **Place rail / one-home move** UX if Rakazo adds multiple servers.

## 11. Where Rakazo is stronger

- **Provider abstraction**: one interface, conformance suite, 11 providers, provider-agnostic portable encrypted home vs Maus's per-backend code (Boat-specific `server/boat*.ts`).
- **Computer image and control**: single reproducible Debian image, dual-channel (DOM refs plus pixels) browser control, loop guards, uncertain-outcome semantics.
- **Screen security**: encrypted scope-bound capability URLs rechecked every ~1 s; Postgres leases/fences.
- **Messaging reach**: Slack, Telegram, WhatsApp, iMessage/SMS/RCS, Lark with link codes; Maus has essentially none.
- **Mobile maturity**: shipped Expo push, Android live notifications, outbox, foldables; Maus iOS push still conditional, PWA has none.
- **Voice**: bot-initiated calls; broader STT/TTS provider mix; a single provider-agnostic call loop.
- **Product breadth in-repo**: artifacts library, ticket board, teach-a-task skill drafts, settings-from-chat with undo, lazy tool loading.
- **Fully open**: no `enterprise/` carve-out or private Admin dependency (Maus Cloud's Admin, Slack and billing live in a closed repo).
- **Vendor independence**: Maus's default computer depends on boat.dev and Cloudflare control-plane accounts.

## 12. Gaps and unknowns

Not read: iOS/Android source, `server/index.ts`, Windows control details, `skills/`, `enterprise/FEATURES` full list, per-engine drivers. Boat is a third-party paid service; its pricing was not found in-repo.
