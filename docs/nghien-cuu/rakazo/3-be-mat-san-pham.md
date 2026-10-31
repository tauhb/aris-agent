# Rakazo: product surface and user experience

Source: commit beaed0c, read-only. Paths are relative to the repo root (`rakazo-src/repo`). Statements marked **(inference)** are my reading of code or docs, not stated outright.

## 0. One-paragraph picture

Rakazo is a "persistent bot teammates" product. The web UI is a single-shell chat app: a sidebar of bots, a continuous chat per bot, and a right-hand panel for the bot's computer, routines and settings. The same React app is wrapped by Electron (desktop) and re-implemented natively in Expo (mobile). Chat is not a plain transcript. The server emits typed message blocks (approval cards, question cards, computer hand-off cards, call cards, charts, subagent cards). Cards never block the chat. The visual identity is a small system font UI with a generated, activity-animated bot avatar as the "face" of each bot.

## 1. Web app: routes, navigation, onboarding

### Routes (`apps/web/src/App.tsx`, react-router)

| Route | What it shows | File |
|---|---|---|
| `/` | Marketing-lite welcome: logo-bot, "Your team of always-on agents that you can give real work to", Sign up / Sign in. Signed-in users are redirected to `/app`. | `apps/web/src/pages/Welcome.tsx` |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` | Better Auth screens. Sign-up goes on to `/onboarding`. The sign-in `next=` parameter is honoured only for connector callbacks. | `pages/Auth.tsx` |
| `/onboarding/:step?` | Steps `survey`, `model`, then bot creation (see below). | `pages/Onboarding.tsx` |
| `/app` | The shell with no bot selected. | `pages/Shell.tsx` (1,256 lines) |
| `/app/:botId` | The shell on one bot's chat. | `pages/Shell.tsx` |
| `/app/g/:groupId` | The shell on a group chat. | `pages/Shell.tsx` |
| `/app/artifacts` and `/app/artifacts/:artifactId` | Artifacts library and viewer: grid or list toggle (stored in localStorage), date filter (all, today, week, month), bot filter, search, delete, download. Each artifact has a version count. Previews are PDF, a sandboxed HTML viewer ("Isolated preview, no access to your account"), images and markdown. | `pages/Artifacts.tsx`, `components/PdfViewer.tsx`, `components/SandboxedHtmlViewer.tsx` |
| `/app/board` | Ticket board (title, description, owner, status, priority, comments). Registered only if the server's bootstrap flag `ticketBoardEnabled` is on. | `pages/Board.tsx`, `App.tsx` |
| `/app/x/:linkId` | Nav-link page. I did not read it; **(inference)** a plugin-supplied navigation entry. | `pages/NavLinkPage.tsx` |
| `/integrations/setup`, `/integrations/callback`, `/mcp/oauth/callback`, `/messaging/slack/callback`, `/sso/callback` | OAuth and install landing pages. They are signed-in only, except the SSO callback. | `App.tsx`, `pages/IntegrationSetup.tsx`, `McpOAuthCallback.tsx`, `SlackInstallCallback.tsx` |
| `/admin/plugins` | Admin plugin management. | `pages/AdminPluginsPage.tsx` |
| `*` | Not found. | `pages/NotFound.tsx` |

All authed routes sit behind `SubscriptionGate` (`components/SubscriptionGate.tsx`, paywall in `pages/Paywall.tsx`). Unreachable-server states show a "Reconnecting / Retry now" screen, not a sign-out (`App.tsx`, `SessionUnavailable`).

### Overlays are URL-driven, not routes

`pages/shell-overlay.ts` reads query parameters: `?settings=<section>&space=<id>`, `?integrations`, `?skills`, `?mcp=<serverId>`. A legacy `?messaging` maps to Settings, Messaging. The URL is the only source of truth, so overlays are deep-linkable.

Settings sections (`pages/shell-overlay.ts`, `pages/settings-nav.ts`):
- General
- Space
- Models
- Memory
- Voice
- Approvals (internal id `confirmations`)
- Vault
- Messaging (only if the server has a chat app configured)
- Wallet
- Usage
- Computer
- Billing
- Updates

Some of these are conditional on deployment features.

### Shell layout

- **Left sidebar** (`pages/shell/shell-sidebar.tsx`, `sidebar-header.tsx`, `sidebar-roster.tsx`):
  - Header icons: Search, Activity (run list), Create (+) with New bot, New group chat and New private space.
  - Roster of bots and groups with sections, pinning, drag and drop (`roster-drop.ts`), unread markers and search. A "mini" mode minimizes it.
  - Space switcher (`use-space-switch.ts`).
  - Footer (`components/SidebarFooter.tsx`): account menu with Connect apps, Settings, Skills, Artifacts, Board, Usage, Get the mobile app, Invite friends, Docs, Log out. Also a free-plan banner with Upgrade (`shell-sidebar.tsx`) and an Install update button on desktop.
- **Center**: chat header (`chat-header.tsx`) with bot name, a Call button (or "Open call") and a computer toggle. Below it the transcript (`transcript.tsx`, with "Load earlier messages", "Jump to latest" and a "Working…" live line) and the composer (`composer.tsx`).
- **Right panel** (`side-panel.tsx`, `ResizableSidePanel.tsx`): tabs for `computer`, `routines`, `settings`, plus `create-group`, `group-settings`, `routine` (editor) and `import-agent`.
- **Command palette** (`command-palette.tsx`, Cmd/Ctrl+K): "Search bots, actions, and settings".
- Responsive mobile-web sidebar (`use-mobile-sidebar.ts`). PWA with service worker (`apps/web/src/pwa/`).
- 14 locales via Lingui (`apps/web/src/locales`); the mobile app has 7 of its own (`apps/mobile/lib/locales`).

### Onboarding flow (`pages/Onboarding.tsx`, `components/SignupSurvey.tsx`)

1. **Survey**, shown only if `me.needsSignupSurvey`: personal, work or both; team size; how you heard about it; what you most want help with.
2. **Model step**, shown only if `me.needsModel`. A provider picker that lists, in order: Rakazo credits (if billing is on), OpenAI Codex sign-in, Anthropic sign-in (Claude subscription), OpenAI API, Anthropic API, OpenRouter, Google, then the rest. It also supports OpenAI-compatible endpoints (custom base URL, headers, context window and max tokens, image support, model probing), Cloudflare AI Gateway and Ollama Cloud. It runs a connection preflight with classified failures (`lib/model-connection-preflight.ts`).
3. **First bot**: auto-creates a bot named "Chief", idempotent via `spawnKey "onboarding:first"`, a Web Lock and a module-level promise. Then it navigates to `/app/<botId>`.
4. The first chat can post a `choice` block, an onboarding focus question with lettered options (`message-cards.tsx`, `ChoiceCard`). Docs (`docs/getting-started.md`) say the user then "tells the bot its job in plain words" and the bot asks for what it needs.

## 2. Chat UX

### What a bot's work looks like

The message model is a discriminated union, `MessageBlock` in `packages/contracts/src/events.ts` (about lines 107-300). Block kinds:
- `text`
- `card` (key/value lines)
- `ask` (question, approval, secret, login and settings-undo card)
- `choice`
- `app_connect` and `connect`
- `computer`
- `voice_call` and `call_request`
- `meta`
- `progress` (with an `activity` flag)
- `steps` (collapsed tool list with durations)
- `subagent`
- `child_bot`
- `cloud_agent` (a remote coding agent, with a PR link)
- `skill_draft`
- `chart`
- `mcp_approval`
- `import_setup`
- `image` and `file`
- `handoff`
- `channel_message`
- `bot_message_sent` and `bot_message_received`

Behaviours:
- **Tool activity** (`docs/tool-activity.md`, `components/ToolActivityDisclosure.tsx`): off by default. The toggle is Settings, General, Advanced, "Show tool activity". It is stored in localStorage (`rakazo.showToolActivity`) per browser or desktop install, not synced. A live card starts open and shows the last 6 steps plus a count of earlier ones. When the run ends it folds to one line with a tool count and duration ("Working…" becomes "Done"). A tool-only message renders as a slim line, not a bubble. It is not in mobile. With `find_tool`/`use_tool` (lazy tool loading), the activity UI shows the real tool name (`settings-from-chat-tasks.md` §5).
- **Run status**:
  - A "Working…" line in the transcript (`transcript.tsx`, `liveActivityLine`).
  - The bot avatar animates by activity state: `idle | reading | writing | thinking | computer | working | waiting | error` (`packages/core/src/logo-avatar-activity.ts`, store in `logo-avatar-activity-store.ts`). It is derived from run, tool and provider lifecycle events, and the highest-priority active run wins. Avatars are also shown with a working dot (`--working-dot`).
  - A sidebar **Activity** mode lists every run with status and date filters (`pages/ActivityList.tsx`: "Now" and "Recent" groups).
  - Stop button in the composer.
- **Subagents** appear as cards (Running, Completed, Failed) (`components/SubagentCard.tsx`). Peer bot messages appear as "Messaged X / Message from X" lines that open a view-only exchange (`message-view.tsx` ~l.308-340, `pages/PeerMessagesOverlay.tsx`).
- **Files and artifacts**: files sent by a bot open in a preview (`components/ArtifactFileCard.tsx`). The account-menu **Artifacts** page lists them, with versions (`ArtifactSummary.versionCount`). Images use `ArtifactImage`; charts use `ChartBlockView` (chart spec plus data blocks; `message-cards.tsx`); mermaid diagrams are in `packages/chat-ui/src/mermaid*.ts`.
- **Message actions** (`message-hover-actions.tsx`): React, Reply, Copy, Mark as unread, Speak. Select text to quote (`quote-selection-button.tsx`). `@` mentions bots, groups, routines and apps (`composer-mentions.tsx`); `/` picks a skill; attach files; hold-to-talk mic (`components/composer/HoldToTalk.tsx`); chat model picker (`chat-model-picker.tsx`).
- Markdown rendering is shared web/native in `packages/chat-ui` (`markdown.web.tsx`, `markdown.native.tsx`, tables, link prompt that asks before opening outside links, with a trusted-sites list).

### Approvals UI

Modes (Settings, Approvals; `docs/approvals.md`): **Ask**, **Auto** (an "approval model" judges each action against what you asked), **Never ask**. Approval cards are `ask` blocks rendered by `components/AskCard.tsx`:
- Buttons: Allow once / Allow in this space / Always allow this tool / "Always allow <site>" / Deny / Edit first / Send it.
- The settled state is shown as a label: "Allowed once", "Always allowed", "Denied", "Created", and so on.
- Secret and login cards: masked fields, "Save to Vault", "Continue", or Dismiss (login and secret are variants of `ask`).
- "Update instructions?" card with a diff-like before/after and Apply/Cancel; "Instructions updated" and "Settings updated" cards with **Undo / Restored**.
- Cards never block the chat. If a card is no longer valid the UI says "No longer active".
- Always-ask list that "Always allow" does not skip: instruction/model changes, space creation, steered-by-untrusted-text runs (see `docs/approvals.md`).
- Allow/Block lists with a Preview (`components/ApprovalRulesSettings.tsx`, `ApprovalRulePreview.tsx`). "Block" refuses without a card, in every mode.
- Per-space override via "Customize".

### Take-over of the computer

- The computer panel (`pages/shell/computer-panel.tsx`): a 16:10 live preview with an "Open" pill on hover, "Take control", and states (Booting live desktop…, asleep, failed, stopped). More actions: Stop, Update, Recover, Reset computer (`components/ComputerMaintenanceActions.tsx`).
- Full overlay (`computer-overlay.tsx`): header chip **"Needs you"** (the bot asked for help, with I'm done / Skip) or **"You have control"** (Release control), Stop, Start, and a "Bot screen" iframe.
- The bot asks via a `computer` block ("Needs you" / "Skipped" / "Done" with an Open button) in `message-view.tsx` ~l.595-625.
- Technique: the screen is noVNC served through a capability-URL reverse proxy (`apps/web/src/screen-proxy.ts`, `novnc-html.ts`, `lib/computer-screen.ts`). The iframe is sandboxed without same-origin, and a storage shim is injected into noVNC pages. The proxy strips cookie and authorization headers. Mobile renders the same screen in `react-native-webview` with an on-screen keyboard bar (`apps/mobile/app/computer.tsx`, `components/computer-keyboard-bar.tsx`).
- "Team" vs "Private" computer is per bot (`docs/computer.md`). Team means shared files and tools, but each bot gets its own screen and browser.
- **Teach a task** (web and desktop only): record a demonstration on the bot's screen with "Protected input" for passwords; the bot posts a **Draft skill** card (`skill_draft` block: whenToUse, inputs, steps, howToCheck, whatToReturn, approvalBoundaries, failureHandling) with Save / Test / Add to routine (`docs/skills.md`; `components/teach/*`).

### Notifications

- Web: in-page `Notification` API, only when the window is not focused or visible, with dedupe (`apps/web/src/lib/browser-notifications.ts`, `pages/shell/use-browser-notifications.ts`). This works for finished runs and for group chats. There is a PWA service worker (`apps/web/src/pwa/`) but I found no web-push subscription code. **(inference)** web users get no push while the tab is closed.
- Per-bot toggle "When it finishes or needs input" (`bot-panel.tsx` l.564-573; `notifyOnFinish` field).
- Desktop: dock badge with unread count (`apps/desktop/src/badge.ts`).
- Mobile: Expo push (see section 6).

## 3. Bot creation and settings; spaces and groups

### Create-bot dialog (`pages/shell/create-bot-dialog.tsx`)

Just name plus avatar look and color. The avatar picker offers two sets, "organic" (default, `DEFAULT_NEW_BOT_AVATAR_SET`) and "rakazo" (`packages/contracts/src/bot-avatar.test.ts`), plus an upload (`avatar-studio-popover.tsx`). Seven palette colors (`packages/ui-tokens/src/index.ts`, `botColors`). The job is described in chat afterwards.

### Bot settings panel (`pages/shell/bot-panel.tsx`; docs in `docs/bots-and-chats.md`)

- Name and avatar; Notifications toggle; Open work (the bot's own to-do list); Memory view.
- Tabs: Computer (mode Team/Private, status), Routines, Advanced.
- Advanced:
  - Model (with "Model connections") and Thinking level (default or override; `ModelThinkingOptions`).
  - Memory scope: inherit, isolated or shared.
  - Voice group: "Read replies aloud" and a Voice choice (defaults to the account default).
  - Permissions: "Allow cross-space bot communication" and "Manage the bots it creates" (fleet management).
  - "How other bots see it" (a one-line description other bots read to decide whom to ask).
  - Tools: "Disable a tool" with per-tool re-enable.
  - Instructions with history/restore (`components/InstructionSettings.tsx`).
  - Export and Clear conversation.
- Sidebar context menu (`BotContextMenu.tsx`): Pin, Move to section, Mark as Unread, Duplicate, Archive, Delete. Archived chats can be restored (`archived-chats.tsx`).
- Import an agent from OpenClaw, Hermes or ChatGPT (`import-setup-card.tsx`, `agent-import.tsx`, `docs/import-an-agent.md`) shows a checklist card (`import_setup` block).

### Routines (`pages/RoutineEditor.tsx`)

Name, instruction, model and thinking override, then triggers. Triggers are: schedule (run at), Slack message, "When something changes" (watch a command, check every N minutes, optionally post "No changes"), Git event, and Webhook (POST URL with a rotatable key). Plus run history (`RoutineRunHistory.tsx`). Mobile can pause, delete and review, not create (`docs/mobile-app.md`).

### Spaces, groups, "team"

- **Space** = an isolated workspace (own bots, chats, memory, computer, app connections, saved credentials, skills). It is created through "New private space" (`docs/spaces.md`). Account-level settings (models, voice, approvals, vault) follow you; a space can "Customize" Models, Voice, Approvals or Vault (`pages/SpaceSettingsPanel.tsx`, `SpaceSettingOverrides.tsx`). The name "private space" suggests a shared/team-space concept exists or is planned **(inference)**; `docs/spaces.md` mentions none. Plugin-level "Available in" narrows skills, MCP and plugins per space.
- **Group chat** (`docs/groups.md`, `pages/GroupPanel.tsx`): 2 to 10 bots; the group shares only the conversation, each bot keeps its own memory and computer. With no mention the first bot answers and can pull in others; `@Name` wakes one; `@everyone` wakes all. A group can be renamed or deleted.
- **Team Computer** is the default shared computer inside a space (`docs/computer.md`). "Team" in the product means bots-as-a-team, not multi-human collaboration. I found no human member invitation inside a space. `components/InviteDialog.tsx` exists, but the docs only describe "Invite friends" (a referral link giving a free month; `docs/account.md`).

## 4. Voice

Docs: `docs/voice-and-calls.md`. Code: `apps/web/src/lib/{tts,dictation,call-session,call-pickup,desktop-speech}.ts`, `apps/web/src/components/call/*`, `apps/api/src/voice.ts`, `packages/adapters/src/*-voice.ts`.

- **Providers** (`packages/adapters/src/voice-factory.ts` and siblings): ElevenLabs, OpenAI, Fish Audio (speak and transcribe), Cartesia (speak only), a self-hosted OpenAI-compatible server (Kokoro, Whisper), and macOS `say` voices when the server runs on a Mac (`macos-voice.ts`). The user brings their own key (stored per user: `userVoiceCredential`). Bring-your-own-key is also stated in `README.md`.
- **Speak replies**: "Speak this reply" on each message, or per-bot "Read replies aloud". The client calls `POST /api/voice/speak` and plays audio in an `HTMLAudioElement` (`lib/tts.ts`; `apps/api/src/voice.ts` l.575). A speech summarizer exists (`apps/api/src/speech-summary.ts`), so long replies are probably condensed before TTS **(inference from the name)**.
- **Dictation**: hold the mic and release to send, with slide-up to lock (`HoldToTalk.tsx`). `lib/dictation.ts` uses the browser Web Speech API with a fallback to server transcription through `POST /api/voice/transcribe` (l.608), and a "hold" or "endpoint" mode with its own silence detection (1.2 s). On desktop it uses a native system recognizer (`apps/desktop/src/system-speech.ts`, `apps/desktop/native/speech`, bridged by `lib/desktop-speech.ts`).
- **Calls**: this is **not WebRTC and not a realtime audio API.** I grepped for WebRTC/RTCPeerConnection/realtime in the web, desktop and mobile apps and found only the API's message-fanout bus (`RealtimeFanout`). A call is a client-driven turn loop: the client listens (dictation in endpoint mode), sends the transcript as a normal chat message tagged with a shared `callId` client nonce, subscribes to the thread events stream, waits for the run to finish, then speaks the reply via TTS (`lib/call-session.ts`: phases `ringing | listening | thinking | speaking`, barge-in via `createInterimBargeIn`, an echo guard of 600 ms, and a farewell-detect to hang up). So latency is the sum of STT, LLM and TTS. The shared logic is in `packages/core` (`callClientNonce`, `isFarewell`, `spokenDecision`). Mobile is the same loop in `apps/mobile/lib/call-session.ts` using on-device `expo-speech-recognition` and `expo-speech`, with optional "Device voice" per bot (`lib/device-voice.ts`).
- **Bots calling you**: the bot's `call_request` block with status ringing, answered, declined or missed (and "Call back"). The server guards it: one-to-one chats only, a connected voice provider is required, and a cooldown (`packages/adapters/src/call-request.ts`: `callRequestRefusal`, `phoneCallCooldownMinutes`; an expiry job `callExpireJob`). The "phone call" name is only a setting name; I found no telephony. IncomingCall UI: `components/call/IncomingCall.tsx`; window: `CallWindow.tsx` with Mute, Transcript, Minimize and Hang up. On Android a native foreground-service call (`apps/mobile/lib/call-background.ts`, `RakazoNotifications` module) keeps it alive with the screen off.
- Marketing claim "It calls you: when something needs you, your bot calls you in the app" (`apps/www/src/i18n/home.ts`) is consistent with the code, and it is in-app only.

## 5. Messaging apps

Docs: `docs/messaging-apps.md`, `docs/self-host-integrations.md` (l.129-139). UI: `apps/web/src/pages/MessagingSettingsPanel.tsx`, `ExternalConversationSettings.tsx`, mobile `app/(settings)/messaging.tsx`.

- **Adapter code**: `packages/adapters/src/messaging-platforms.ts` builds a "surface" over the Vercel **Chat SDK** (`chat` package, `@chat-adapter/slack|telegram|whatsapp`, `chat-adapter-sendblue`). The generic wrapper is `chat-sdk-surface.ts` (webhook body cap 256 KB, per-webhook drain, per-platform capability descriptor). Further files: `messaging-delivery.ts` (outbox), `messaging-installations.ts`, `installed-messaging-surface.ts`, `lark/` (Feishu/Lark lazy adapter), `photon/lazy-adapter.ts`, `sendblue-emulator.ts`. Contracts are in `packages/adapter-kit/src/{interfaces,messaging-installations}.ts`. Inbound routing is `apps/api/src/messaging-inbound.ts`, webhook mount `apps/api/src/messaging-webhook.ts`. Provider labels are in `packages/core/src/messaging-providers.ts`.
- **A platform mounts only when its full env credential set is present** (`messagingEnvFromProcess`). Slack, Telegram, WhatsApp, Sendblue, Lark and Photon are env-configured. Telegram supports several named bots (`TELEGRAM_BOT_TOKEN_<NAME>`) and Photon several named projects, each a different number.
- **iMessage / SMS technically**: not self-built. Two vendors:
  - **Sendblue** (`SENDBLUE_*` env, `chat-adapter-sendblue`, webhook at `/api/v1/messaging/webhook/sendblue` with status callbacks). Sendblue provides one phone line that does iMessage, SMS and RCS; messages are labeled by transport (`messagingProviderLabel`, "iMessage" / "SMS" / "RCS"). Group conversations are supported here: "stay sendblue-only" says the comment in `messaging-platforms.ts` ~l.160, with participants and group name parsed from the raw payload.
  - **Photon** (`@photon-ai/chat-adapter-imessage`, "Spectrum"): iMessage inbound over an outbound stream from the API, so no public URL is needed, and optionally a webhook. The user must text first on shared lines, and there are no groups (`self-host-integrations.md` l.129). The stream has a retry ladder of 5 s, 30 s and 120 s (`photon/lazy-adapter.ts`).
- **Linking flow**: Settings, Messaging, pick a bot, "Connect a chat app", get a code, send it from that app within 10 minutes (`docs/messaging-apps.md`; `redeemMessagingLinkCode` in `packages/db/src/messaging.ts`, imported in `messaging-inbound.ts`). A linked sender who pastes a fresh code re-points to another of their own bots. Slack uses a **workspace OAuth install** ("Connect", "Add workspace", "Link DMs", "Disconnect") through `/messaging/slack/callback`. Unlinked senders stay silent unless the deployment enables an "open Poke-style signup line", which auto-provisions an account (`openSignup` in `messaging-inbound.ts`, off by default because strangers' runs would bill the deployment's model key).
- **1:1 commands**: plain `YES` / `NO` / `LEAVE` answer group invites (`packages/core/src/messaging-commands.ts`).
- **Group handling**: adding a bot to a group creates a request; the owner gets a DM invite and approves in Settings, Messaging under Requests (Approve / Decline); approved groups are listed under Conversations (Leave) (`messaging-inbound.ts` header comment, `MessagingSettingsPanel.tsx`). The code upserts channel and members, DMs invites to linked owners, posts one intro when strangers are present, and fans messages out to every approved member bot's own thread. Per-conversation settings (`ExternalConversationSettings.tsx`): Listening (Listen vs Mentions only), Room guidance (free text), and Automated senders (Ignore / Group updates digest / Always act / Treat like a person). There is also Revoke and Pending state per conversation.
- **Message-triggered routines**: a Slack message (and, by the comment, any provider) can start a routine (`RoutineEditor.tsx` l.703 and l.945, `messaging-inbound.ts`).
- Marketing lists Slack as hosted and iMessage/SMS, WhatsApp and Telegram as "selfHosted: true" (`apps/www/src/i18n/home.ts`, `HOME_CHANNELS`). So on rakazo.com only Slack is promised **(inference from the flag)**.
- Attachments: Telegram file_id media is downloaded into thread artifacts (`messaging-inbound.ts`); Telegram photo and upload limits are in `messaging-platforms.ts`.

## 6. Desktop (Electron) and mobile (Expo)

### Desktop (`apps/desktop`, docs `docs/desktop-app.md`)

- It hosts the web UI (same bundle; `desktopBridge()` in `apps/web/src/lib/desktop.ts` detects it, and analytics tags `surface: "desktop"`). Electron 45, electron-updater (background updates and an "Install update" button), Sentry.
- Added over web:
  1. **Server choice** on first run: Rakazo Cloud, "This computer" or "Existing instance" (`src/setup-config.ts`, `setup-store.ts`, `setup-preload.cjs`). "This computer" runs a local Docker Compose stack (`src/local-stack.ts`, `docker-cli.ts`, `docker-compose.images.yml`, loopback port allocation, health timeout 120 s). It keeps running after quit; "Stop Local Stack" is in the app menu.
  2. **Local computer access**: bots run commands on the user's own machine. `src/host-computer.ts` starts an app-private HTTP server (`@rakazo/adapters/host-computer-server`) with a random token and a consent file never sent to the renderer. `src/host-screen.ts` uses a CUA driver (`cua-host-screen`) for macOS Accessibility and Screen Recording, with a locked-screen error. Command guards: `packages/adapters/src/desktop-command-guard.ts`, `desktop-sandbox.ts` and others. The consent prompt is "Allow bots to use this computer?"; the docs warn "bots can run commands without asking" under "Use this Mac".
  3. Native system speech recognition (`system-speech.ts`, `native/speech`), dock badge, passkeys (`passkeys.ts`), OAuth loopback capture for providers whose redirect is `http://localhost:port/callback` (`oauth-callback.ts`), browser-auth, and window chrome with drag regions.
  4. Shortcuts: Cmd+N, Cmd+K, Cmd+, Ctrl+Tab bot switching.
- It talks to the server over the same HTTP/oRPC API as web, with custom headers (`server-request-headers.ts`).

### Mobile (`apps/mobile`, docs `docs/mobile-app.md`)

- Expo SDK 57, React Native 0.86, expo-router. Files in `app/`: inbox `index.tsx`, `thread.tsx`, `group-thread.tsx`, `bot-profile.tsx`, `bot-settings.tsx`, `computer.tsx`, `artifacts.tsx`, `routines.tsx`, `search.tsx`, `share.tsx` (incoming share), `server.tsx` (custom server), `paywall.tsx` and a settings group (account, approvals, billing, integrations, messaging, models, vault, voice, wallet, skills, language, AI data sharing). Native modules in `modules/`: `rakazo-notifications` (Android), `rakazo-file-drop` (Android), `rakazo-fold-regions` and `rakazo-network-cache` (iOS).
- It is a true native re-implementation, not a webview of the web app: it shares only `packages/{chat-ui,contracts,core,ui-tokens}` and a separate API client (`lib/api.ts`). iOS has glass surfaces (`glass-surface.ios.tsx`) and native sheets, segmented controls and swipe rows (`*.ios.tsx`). Foldable and split-view layouts (`lib/fold-layout.ts`, `split-view.ts`).
- Added over web:
  - **Push notifications**: `lib/push.ts` registers an Expo push token (`rpc notifications/registerPush`); the server sends via `packages/adapters/src/expo-push.ts` (Expo push API with receipt checking after 15 minutes, a payload that opens the right bot or group thread). Android also has a native module for categories ("Messages", "Scheduled tasks", "Needs attention") and an optional persistent "live connection" with a promoted ongoing "working" status (`lib/live-notifications.ts`). iOS badge via `lib/app-badge.ts`.
  - Share sheet target on Android, camera and photo attach, on-device speech for calls, an unsent-message outbox persisted to disk (`lib/outbox-disk.ts`, `unsent-sends.ts`), passkeys (`react-native-passkeys`), a consent gate for sending data to AI services (`lib/ai-consent.ts`, "AI data sharing" screen), and an Android foreground service for calls.
  - **Not** on mobile: routine creation/editing, Teach a task, using your own computer, tool activity (all stated in the docs).
  - Live chat updates: the thread event stream is subscribed in the foreground only (`lib/thread-live.ts`), with polling elsewhere (`lib/foreground-poll.ts`, `poll-cadence.ts`); background freshness relies on push.
- Distribution: App Store and a GitHub-hosted Android APK (`README.md`, `docs/mobile-app.md`); release notes in `docs/mobile-release.md`.

## 7. Settings from chat

Planning doc: `docs/settings-from-chat-tasks.md` (checkboxes show status). Implementation files: `packages/adapters/src/own-bot-settings.ts`, `builtin-tools.ts`, `builtin-tool-bridge.ts`, `lazy-tool-catalog.ts`, `run-tool-selection.ts`, `packages/contracts/src/builtin-tools.ts`, `packages/testkit/src/evals/tool-choice.ts`.

- **`update_bot`**: a single write path for the bot's own settings. Called with no fields it returns current settings and the allowed values (connected models, thinking levels); with fields it patches. Settable: instructions, name/avatar/notification fields (per the doc), `model` (loose names like "sonnet" resolve against connected models, with a "connect a provider first" result if none match), `thinking`, `voice`, `readAloud`. Done: `[x]` in the doc. Voices are listed only when a `voice` is passed that matches nothing (because a voice list needs a provider call).
- **Undo**: instructions keep history; model/thinking/voice/readAloud change posts a "Settings updated" card whose undo restores previous values only if the changed ones still hold (`settingsUpdate` in the `ask` block; UI in `AskCard.tsx` ~l.215-256). The old `propose_instructions_update` was removed. Runs not started by the owner (other bots, routines, external messages) still wait for owner approval on self-changes.
- **Deliberately UI-only** (a bot never widens its own powers from chat): credentials, disabled tools, fleet management, cross-space communication, computer mode, approval preferences, and memory scope. User-level settings from chat are `update_preferences` (timezone and marketing emails only, only on runs the user started). Theme is device-local, so it is excluded. Email, password, billing, deletion and approval rules are excluded.
- A prompt rule says "change settings only when the user asks", and evals enforce it (guard cases vs controls, 60+ cases planned). Task 1 (the eval suite) and Task 4 (a built-in `rakazo` help skill that fetches published docs) were still unchecked at this commit; the help skill is "[ ]" **(inference: not shipped)**.
- **Lazy tool loading** is part of the same plan: ~12-15 core tools stay visible; the rest go through `find_tool` (BM25 over names, descriptions and parameter names, returns the top 3 with schemas) and `use_tool` (goes through the same gate, approvals and audit). The tool list never changes mid-run, so the prompt cache survives. A CI test pins the visible list and a byte budget (marked done in the doc). The unchecked item is the full-suite comparison; the doc says "ship only if pass rate holds", so the shipped state is **uncertain**.
- Bots can also create bots and organize them when "Manage the bots it creates" is on (`docs/fleet-management.md`, `fleet-tools.ts`; `child_bot` card).

## 8. Design language

- **Tokens** (`packages/ui-tokens/src/index.ts`, generated `tokens.css`): one semantic palette named in shadcn convention shared by web, Electron and Expo, in dark and light. Key values:
  - Dark: background `#161616`, dialog `#1f1f1f`, sidebar `#0e0e0e`, the foreground `#f5f5f5`.
  - Light: background `#fff`, card `#f2f2f2`, sidebar `#f5f5f5`.
  - Alpha-based neutrals for borders, input, secondary and accent.
  - A single blue serves link, unread, ring and working status; a single green is the "working dot"; success, warning and destructive-fill tokens exist.
  - Radius 0.75rem.
  - The user bubble is a solid fill (light gray in dark, near-black in light).
  - Separate `glass-fill` / `glass-stroke` fall back where native Liquid Glass is unavailable.
- **Type**: system font stack. Web scale 11/12/13/14/17/22/26 px with tight negative tracking on headings, weight 420 for body text on macOS (`ui-web/src/styles.css`). Mobile follows iOS text styles (body 17/22) with Dynamic Type capped at 23 pt (`MAX_FONT_SCALE`).
- **Components**: shadcn-style primitives on Base UI (`packages/ui-web/src/components/ui/*`: dialog, sheet, command, context-menu, select, sidebar, sonner, and others). `components/ai/beautiful-ui.css` and `primitives.tsx` (`BuiCard`, `SuccessPop`, `LoadingState`).
- **Brand**: orange bot mark over a dark ground (`packages/ui-tokens/assets/README.md`, Icon Composer `Rakazo.icon`); the welcome page uses a pill-shaped face with two eye capsules. The marketing hero (`docs/readme-hero.png`) shows a very dark chat UI with colored circular bot avatars with two-eye faces, one per teammate, in pastel palette colors (`#3EC5A8`, `#F5A03C`, `#6A6BF5`, `#9B5CF6`, `#3B82F6`, `#F2622A`, `#D9508A`). The screenshot `docs/screenshots/web-computer.png` shows the three-pane layout: sidebar of bots, chat, and a right panel with a live screen preview, "Take control" and Routines.
- **Especially polished**:
  - The generated, animated bot avatars that reflect real run state (`packages/ui-web/src/logo-avatar*.tsx`, `packages/core/src/logo-avatar-*.ts`, `avatar-motion.ts`, `avatar-shape.ts`), with contrast checks and a traits generator (`logoAvatarTraits`).
  - Onboarding robustness (cross-tab locking for the first bot).
  - Everything that touches trust: sandboxed screen proxy, isolated artifact previews, link-open prompts, remote images off by default, masked secret cards.
  - Native iOS feel on mobile (glass, native sheets, swipe rows); a 14-language web UI; keyboard-first desktop shortcuts; a full-featured artifacts library.
  - Heavy e2e coverage with Playwright (`apps/web/e2e`) including screenshot fixtures for the tool-activity card.

## 9. Marketing site claims vs product (apps/www)

- Astro site (`apps/www/src`): home (`components/HomePage.astro`, copy `i18n/home.ts`, 15+ locales), docs mirroring `docs/*.md`, blog, integrations catalog (1,400+ per `docs/getting-started.md`), alternatives pages (Grok Bot, OpenClaw), `llms.txt`, markdown twins of every page (`*.md.ts`), and a `ProductDemo.tsx` with an animated demo.
- Positioning: "AI teammates you actually own. Your keys, your model, your machine." and "open source Grok Bot alternative" (`site.ts`, `README.md`). Home sections: Self-hosted, Wherever you are (web/desktop/mobile), a roster of template bots (Sales Outbound, Inbox Manager, Talent Scout, Expense Manager, and others; `EN_ROSTER`), "Message them anywhere", and "More than chat" (calls you, works in your apps, remembers, wakes on its own, hands off work, learns by watching).
- Claims that match the code: Teach by watching (`components/teach`), calls, routines and triggers (schedule, webhook, GitHub event, watched change), memory, delegation and groups, per-bot models, and approvals.
- Claims worth checking: "People love it" testimonials are static copy (`i18n/home.ts`, `TESTIMONIALS`). "Open source Grok Bot alternative" is a competitor-keyword play; the "alternatives" pages (`apps/www/src/alternatives.ts`, `vs-points.ts`) are SEO content.

## 10. Notable takeaways for reuse

1. Typed message blocks plus cards that never block are the core UX idea: approvals, questions, secrets, computer hand-off and calls are all first-class transcript items (`packages/contracts/src/events.ts`).
2. Calls are a text-turn loop around STT, chat and TTS with barge-in and an echo guard, so any provider mix works and there is no realtime-audio dependency. The cost is latency.
3. iMessage/SMS are bought, not built (Sendblue or Photon); Slack, Telegram, WhatsApp and Feishu go through one Chat SDK adapter surface with link codes, and group chats go through an owner approval handshake.
4. Settings-from-chat is carefully scoped: model, instructions, voice and notifications can be changed with undo cards, and anything that widens power stays UI-only.
5. Desktop adds a local Docker stack and a host-computer server with consent; mobile adds push (Expo), Android live status and share-in, but intentionally lacks routine authoring, teach and local computer.
6. Unverified or unclear: web push when closed (none found), the built-in `rakazo` help skill status, whether lazy tool loading is enabled by default, and what `/app/x/:linkId` shows in practice.
