# Rakazo: platform and backend review

Source: `rakazo-src/repo` at commit beaed0c (2026-10-31, shallow, one commit). All paths are relative to that repo root. License: Apache-2.0 (`LICENSE`, every `package.json`). Items marked **[inference]** are mine, not stated in the repo.

## 0. One-paragraph take

Rakazo is a large, security-minded TypeScript monorepo (about 770k lines of TS/JS/shell/Python including tests; about 40% is test code). It is a persistent "AI teammate" platform. Each bot has one thread, memory, routines and a computer (Docker, E2B, Daytona, etc.). It is built on Hono + oRPC + Prisma/Postgres + Graphile Worker + Better Auth, with the Pi agent library as the LLM runtime. It is a real multi-tenant product, not a hobby project. Self-hosting is a normal Docker Compose install, but the stack is heavy and its surface area is huge. Today it is in beta (`CHANGELOG.md`: 0.1.0-beta, 2026-08-13).

---

## 1. Architecture in words

### Services (`infra/compose/docker-compose.images.yml`, `docker-compose.yml`, `docker-compose.prod.yml`)

| Service | What it is | Evidence |
|---|---|---|
| `postgres` | Postgres 16 in the published-images stack, Postgres 18 in the prod and source Compose (`CHANGELOG.md` "Changed"). Holds all app data plus the Graphile job queue. Never published on the host. | `docs/self-host.md`, `docker-compose.prod.yml:268` |
| `migrate` | One-shot container. It is the only one holding the DB owner login, so API/worker code cannot bypass row-level security. | `CHANGELOG.md`, `docs/self-host-configuration.md` ("Database roles") |
| `api` | Hono HTTP server (`apps/api/src/app.ts`, `@hono/node-server`). Serves oRPC at `/rpc/*`, Better Auth at `/api/auth/*`, messaging webhooks at `/api/v1/messaging/webhook/<provider>`, the screen proxy, audit export and health. A run starts inside the API process that makes it due (`docs/run-execution.md`). | `apps/api/src/app.ts`, `apps/api/src/router.ts` |
| `worker` | Graphile Worker host plus reconcilers and the agent runtime (`PiAgentRuntime`), all wired in `apps/worker/src/index.ts` (448 lines). Runs jobs, routines, idle-computer sweeps, model-credit reconciliation, audit shipping, cloud-agent polling, purchase polling. | `apps/worker/src/index.ts` |
| `web` | Vite preview of the React 19 SPA. It same-origin-proxies `/api` and `/rpc` to the API, so only `:5173` is exposed (loopback by default). | `docs/self-host.md` |
| `supervisor` | Separate Docker-socket-holding service (`infra/sandboxes/supervisor`, dockerode) that creates "computer" containers. The API never gets a raw Docker socket. | `docs/self-host.md`, `infra/sandboxes/supervisor/package.json` |
| `computer` | Per-bot sandbox containers (`rakazo/computer`) with Xvfb, a window manager and Chromium. 2 GB RAM / 2 CPU / 2048 PIDs per computer by default. | `docs/self-host-docker-computers.md` |
| `caddy` | TLS edge, prod Compose only (`Caddyfile.prod`, Cloudflare variant). | `docker-compose.prod.yml:659` |
| `updater` | Optional root-equivalent sidecar profile that performs upgrades (`infra/updater`). | `docs/self-host-upgrading.md` |
| `pitr` | Optional point-in-time-recovery sidecar. It streams encrypted WAL to S3. | `docker-compose.prod.yml:310`, `CHANGELOG.md` |

Other apps in the monorepo: `apps/desktop` (Electron), `apps/mobile` (Expo / React Native 0.86), `apps/www` (Astro marketing site, hosted separately).

### How they talk
- Clients to API: oRPC over HTTP (`/rpc`), contracts defined in `packages/contracts/src/rpc.ts`.
- Live updates: Postgres LISTEN/NOTIFY fanout (`PostgresRealtimeFanout`, `packages/adapters/src/realtime.postgres.test.ts`). `WAKEUP_DRIVER=graphile` (compose files) means no Redis or message broker is needed.
- Run dispatch: the API process that commits a message starts the run itself (`RunStarter`). If it is shutting down or low on memory, it hands the run to a worker over the realtime channel. Workers also scan for orphaned runs at startup and every 5 s (`docs/run-execution.md`).
- API/worker to supervisor: HTTP with a bearer `SANDBOX_SUPERVISOR_TOKEN` on an internal network. Bot computers sit on per-bot networks that only the supervisor and screen proxy join (`docs/self-host.md`).
- Screen/terminal: a token-protected screen proxy in the API fronts noVNC (`apps/api/src/screen-proxy.ts`, `docs/computer-runtime.md`).
- Optional external: Sentry, Axiom, OTLP, S3 (artifacts and bot homes), Infisical, AWS KMS, Stripe, SMTP, Composio, Pipedream, model providers.

### Deployment shapes
1. **Local dev / source checkout**: `pnpm install && pnpm sandbox:build && pnpm dev` (`README.md`, `scripts/dev.mjs`).
2. **Single user, published images**: `install-images.sh` pulls `ghcr.io/elie222/rakazo/app` (multi-arch amd64/arm64) and Postgres, generates `.env` with random secrets, and binds to `127.0.0.1:5173`. The desktop app's "This computer" mode runs the same images itself (`docs/self-host.md`).
3. **Public single VM**: `docker-compose.prod.yml` with Caddy and automatic HTTPS, E2B-style remote computers by default, or a Docker overlay `docker-compose.prod.docker.yml`. Includes host hardening (`harden-host.sh`: UFW, fail2ban, no root SSH), systemd backup timers and a CI deploy launcher (`docs/self-host-production.md`, `infra/systemd/`).
4. **Railway template**: root `railway.json` plus `infra/railway/` (Dockerfile, `start.sh`). API, worker and web share one service and a `/data` volume. Postgres has its own volume. Computers run as Railway sandboxes in a separate environment. One app replica only (`infra/railway/README.md`).
5. **Kubernetes** is mentioned only as a *sandbox provider* ("one pod per computer", `docs/self-host-sandbox-providers.md`). There are no Helm charts for the app itself (searched `infra/`).

---

## 2. Data model (`packages/db/prisma/schema.prisma`, 2,214 lines, about 107 models, 189 migrations)

### Tenancy hierarchy
`User` → `Member` (role) → `Organization` → `Space`; `SpaceMember` links a user to a space and requires the corresponding `Member` row (composite FK `[organizationId, userId]`) (`schema.prisma:217-460`). Better Auth's `organization` plugin supplies Organization/Member/Invitation (`packages/auth/src/index.ts`). Nearly all product data hangs off `Space` (`Bot`, `Thread`, `Message`, `Event`, `Run`, `Routine`, `MemoryDocument`, `Computer`, `McpServer`, `Connection`, `Secret`, `Artifact`, `Ticket` and so on, with `onDelete: Cascade`). Spaces are documented as authorization boundaries (`VISION.md` "Trust is explicit", `docs/spaces.md`).

### Main tables (grouped)
- Identity/auth: `User`, `Session`, `Account`, `Verification`, `Passkey`, `RateLimit`, `UserDevice`, `PushToken`, `SecurityEvent`, `AuditEvent`, `AuditEventForwarding`.
- Bots/chat: `Bot` (name, instructions, model override `modelProvider`/`modelId`/`thinkingLevel`, `disabledBuiltinTools`, `crossSpaceCommunication`, `fleetManagement`), `BotSection`, `ChatGroup(+Member)`, `Thread`, `Message`, `Event`, `Task`, `Run`, `Attempt`, `SteeringMessage`, `Routine`, `ScratchpadItem`, `TaughtSkill`, `AgentSkill`, `AgentImport`, `Board/Ticket/TicketComment`.
- Computers: `Computer`, `ComputerRun`, `ComputerExecutionLease`, `ComputerUpdate`, `AgentHome`, `BrowserProfile`, `Artifact`, `CloudAgent`.
- Memory: `MemoryDocument`, `MemoryRevision`, `SpaceMemoryConfig` (external providers such as Supermemory/Honcho).
- Integrations: `Connection` (Composio/Pipedream-managed accounts, `connectorId` default "composio"), `CapabilityInstall` (plugins, with `source`, `version`, `digest`), `McpServer`, `McpOAuthSession`, `BotMcpServer` (per-bot grant with `allowAllTools`/`allowedTools`), `IntegrationProviderConfig`, `MessagingIdentity/Channel/Installation/Outbound`, `ExternalConversation/Message`.
- Models/billing: `UserModelCredential`, `UserModelPreference`, `SpaceModelPreference`, `*ModelRoleChoice`, `ModelOAuthSession`, `UsageRecord`, `ModelCreditAccount/Entry/Lot`, `BillingAccount`, `BillingAuditEvent`, `Purchase`, `PaymentWallet`, `ReferralCode/Referral`.
- Secrets: `Secret`, `BotSecret`, `VaultCredential`, `AgentSecret`.
- Approvals: `ActionApprovalRule`, `ActionAutoReviewPreference`, `UserActionApprovalRule`, `UserActionAutoReviewPreference`, `AiDataConsent`.
- Per-account vs per-space "availability" join tables: `AgentSkillSpace`, `McpServerSpace`, `CapabilityInstallSpace` (`VISION.md`: items belong to the user's account and are available in all or chosen spaces).

### Isolation mechanics
- **Postgres row-level security** on content tables, with two DB logins (owner for migrations, non-superuser `rakazo_app` for runtime). Each request and background job runs "as" its Space/user. System work uses a named `runAsSystem` scope (`docs/self-host-configuration.md` "Database roles", `packages/db/src/row-security.postgres.test.ts`). If only one login is configured, the app warns that RLS is *not* enforced.
- `UsageRecord`, `BillingAuditEvent` and `AuditEvent` deliberately lack lifecycle FKs so history survives bot or org deletion (comments in the schema). Postgres rejects updates to audit and billing journals through triggers (`docs/self-host-audit-log.md`, `docs/self-host-billing.md`).

### Content encryption (`docs/content-encryption.md`, `packages/db/src/content-crypto.ts`, `content-keys.ts`)
- Envelope encryption. Each Space has a 256-bit data key in `space_keys`, wrapped by a master key with AES-256-GCM. Ciphertext format is `rkz1:<keyId>:<base64url(iv|ct|tag)>`, with table/column/row/space bound as AAD, so moving a value fails to decrypt.
- Encrypted: `messages.blocks`, `events.payload`, history summaries, memory documents and revisions, uploaded and generated files (streamed 64 KiB AES-GCM segments), bot homes in object storage, and credentials.
- **Not yet encrypted** (the doc says "planned next"): external conversation messages, outbound messaging bodies, steering messages, ticket comments, agent skills, taught-skill playbooks and recordings, instruction history. Names, routine prompts, memory paths and timestamps stay plaintext.
- Search over ciphertext uses keyed-HMAC `searchTokens` (word prefixes of 2-10 characters), which leaks word co-occurrence patterns. This is documented as a tradeoff.
- Master keys: derived from `ENCRYPTION_KEY`, or `ENCRYPTION_MASTER_KEYS` (rotatable), or `MASTER_KEY_PROVIDER=aws-kms`. CLI: `content-encryption migrate|rotate|reencrypt|decrypt|export|status`. `.env` secrets can be KMS-"wrapped" (`wrapped:v1:...`).
- Threat model is stated honestly: it does not protect against a compromised running API/worker, or against DB plus master keys together. Losing the keys loses the content.
- `CONTENT_ENCRYPTION` defaults to `on` (`docker-compose.yml`).

---

## 3. Integrations and tool sources

Entry points: `docs/integrations.md`, `docs/self-host-integrations.md`, `docs/build-a-plugin.md`, `README.md` lines 120-135, `VISION.md`.

| Source | How added | Auth | Code |
|---|---|---|---|
| **Composio** (managed catalog) | Operator sets `COMPOSIO_API_KEY` on API+worker; users click Connect in Integrations or ask the bot in chat | Composio hosts the OAuth; Rakazo stores a `Connection` row with provider refs (not tokens). Uses `@composio/core@0.18.1` | `packages/adapters/src/composio-connector.ts`, `composio-batch.ts` |
| **Pipedream Connect** (alternative managed catalog) | `PIPEDREAM_CLIENT_ID/SECRET/PROJECT_ID/ENVIRONMENT` | Pipedream OAuth; token exchange to `/v1/oauth/token`. Above 20 tools it uses a lazy catalog (`pipedream_search_tools` / `load_tool` / `execute_tool`) | `pipedream-connector.ts` |
| **Remote MCP** | In Integrations "+": HTTPS URL, auth none / bearer / API-key header, or OAuth ("Connect OAuth", dynamic client registration, or user-supplied client id/secret; redirect `<web origin>/mcp/oauth/callback`). Verify-and-add tests the connection. | Credentials encrypted in `Secret`; OAuth state in `McpOAuthSession`; client bound to the authorization server on first use | `mcp-connector.ts`, `mcp-oauth.ts`, `remote-mcp.ts`; SDK `@modelcontextprotocol/sdk@1.32.2` |
| **Stdio MCP** | Admin-only (`RAKAZO_ADMIN_EMAILS`), needs `MCP_STDIO_ENABLED=true` and an allowlisted command. `npx` packages are installed once without install scripts into `MCP_PACKAGES_DIR`. | OAuth values injected into env/files via `{{oauth.access_token}}` templates | `mcp-package-installer.ts`, `mcp-transport.ts` |
| **OpenAPI** and **GraphQL** | Point at a spec; operations become tools | Same credential model as MCP | `installed-connectors.ts`, `graphql-connectors.ts` |
| **Treg** | An MCP-type preset (`preset: "treg" \| "custom"` in `installed-connectors.ts:66`): a tool gateway reached with a single access token. "Executor" is a sibling gateway type. Treg is usage-metered; the README says hosted resale needs a written agreement with Treg (https://treg.to/integrate.md). | Bearer token | `installed-connectors.ts`; `README.md:128-134` |
| **Plugins** | `plugin.json` + `mcp.json` in a public GitHub repo (agent-plugins.org schema 1.1.0). Rakazo only reads the files and never executes repo code. Hooks, LSPs, local MCP commands and skill scripts are deliberately not installed (`VISION.md`). A built-in catalog and a submission/review flow exist (`PluginSubmission`, `plugin-marketplace.ts`, `plugin-submissions.ts`). | per-part | `plugin-connectors.ts`, `plugin-installs.ts`, `examples/plugins` |
| **Bot-requested credentials** | A bot calls `request_secret`; a protected card collects the value; later `secret_request` makes the *backend* inject Bearer / header / Basic auth into HTTPS calls. The origin is pinned, redirects are refused, responses are capped and redacted. The model cannot read the value. Optional "command variables" go into the bot's shell. | AES-GCM in `vault_credentials` | `docs/bot-secrets.md` |

Non-tool integrations: messaging (Slack, Telegram, WhatsApp Business, Sendblue iMessage, Photon iMessage, Feishu/Lark) mount only when their env credentials are present. Voice providers: ElevenLabs, OpenAI, Cartesia, Fish Audio, macOS.

**Per-bot permission model**
- Connections and MCP servers belong to the user/space, not the bot. Each bot opts in to servers ("Use in this bot" -> `BotMcpServer` row with `allowAllTools` / `allowedTools`). On first use of a server the bot asks the user in chat to approve or authorize (`docs/integrations.md`).
- `Bot.disabledBuiltinTools` lets you switch off a built-in tool per bot.
- Approvals (`docs/approvals.md`): three modes (Ask / Auto / Never ask), account-wide with optional per-space override, shaped by Allow and Block lists of exact tools or sites (`ActionApprovalRule`). Auto uses an "approval model", falling back to a deployment checker (OpenRouter "Jev" or TypeSafe, optional). Block wins in every mode, with no card. Per-bot allow lists are not in the schema; rules are keyed by space + user. **[inference]** Per-bot differentiation is therefore at the server-assignment/tool level, not the approval-rule level.
- Tool-call counts per turn: `MAX_TOOL_CALLS_PER_TURN`. Large connector toolsets switch to a lazy catalog (`lazy-tool-catalog.ts`, threshold about 20 tools).
- SSRF protection: `assertSafeRemoteUrl` / `createSafeRemoteFetch` (`remote-mcp.ts`). Private endpoints are off unless `MCP_ALLOW_PRIVATE_ENDPOINT=true`. Metadata IPs are always blocked.

---

## 4. Models

### What "Pi" is
Pi is the **agent runtime / LLM library**, consumed as three npm packages pinned at 1.3.0 in `packages/adapters/package.json`: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-telemetry`. `docs/self-host-observability.md` also references "Pi 0.87.1" and a "newer harness" with a legacy Agent adapter. `PiAgentRuntime` is instantiated in `apps/worker/src/index.ts`; `AGENT_RUNTIME=pi` is the Compose default; a `ScriptedAgentRuntime` exists for tests. Pi provides the unified multi-provider streaming API, the model catalog, provider auth (including OAuth for subscriptions) and the tool loop. Rakazo wraps it in `packages/adapters/src/pi-*.ts` (catalog, Anthropic OAuth, Codex catalog, cache protocol, OpenAI-compatible provider). **[inference]** Pi appears to be the pi-mono project by Mario Zechner; the scope name `@earendil-works` is not explained in the repo, and I could not see its license, so verify before depending on it.

### Provider configuration
Three layers (`docs/models.md`, `docs/self-host-models.md`):
1. **Deployment default** for anyone with no connection of their own: `PI_DEFAULT_PROVIDER` (`openrouter` default, model `openai/gpt-6-luna`; or `anthropic`, `claude-sonnet-5`) plus `PI_DEFAULT_MODEL`. Host-credential providers (Bedrock, Vertex) via `PI_DEFAULT_CREDENTIALS=host`.
2. **Per-user connections** (`UserModelCredential`, secret in `Secret`): Settings -> Models. Options are subscription sign-in (ChatGPT or Claude OAuth), API key for OpenAI/Anthropic/Google/OpenRouter and "many others", Ollama Cloud, or "OpenAI-compatible server URL". The Compose file passes through about 40 provider keys that Pi reads itself, including `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `KIMI_API_KEY`, `ZAI_API_KEY`, `MINIMAX_API_KEY`, `QWEN_*`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `FIREWORKS_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, `HF_TOKEN`, Azure OpenAI, Bedrock and Vertex (`docker-compose.yml` lines ~100-150). Also Vercel AI Gateway and Cloudflare AI Gateway (`cloudflare-ai-gateway.ts`).
3. **Operator-local models**: `RAKAZO_LOCAL_MODELS` + `RAKAZO_LOCAL_MODELS_URL` (Ollama, LM Studio, llama.cpp, MLX).

### Can DeepSeek (or any OpenAI-compatible endpoint) be used?
**Yes, in three ways.**
- Via the "OpenAI-compatible" connection: base URL, exact model id, optional key and custom headers (stored encrypted). Chat Completions by default, or the Responses API via `apiProtocol: "responses"`. Advanced toggles: "Supports images", "Supports thinking" (`reasoning_effort`).
- Via Pi's native `DEEPSEEK_API_KEY` (listed in compose, and `pi-models.ts` / `auto-review.test.ts` reference deepseek).
- Via OpenRouter.

Constraints: public hosts must be HTTPS and resolve only to public IPs when keys or headers are sent. `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=0` blocks them. Private or loopback targets need `MCP_ALLOW_PRIVATE_ENDPOINT=true`, plus the deployment owner. A vision flag is needed for screenshot computer tools, and models without vision are marked "Can't read images" in the picker.

### Per-bot / per-routine choice
- `Bot.modelProvider`, `modelId`, `thinkingLevel` (Bot settings -> Advanced). Routines can carry their own model (`docs/models.md`).
- Account-level main model + ordered fallbacks (`model-backups.ts`), "model roles" such as the approval model (`model-roles.ts`, `UserModelRoleChoice`, `SpaceModelRoleChoice`), and per-space override.
- Thinking level from Minimal to Max.

### Cost tracking
- `UsageRecord` stores per call: provider, model, input/output/cache-read/cache-write/reasoning tokens, `costUsd`, `costSource`, `pricingVersion`, `pricingSnapshot`, `callId`, operation kind, parent run and agent. Settings -> Usage shows runs, tokens and cost by model (`docs/models.md`).
- OpenRouter-specific usage and generation-cost reconciliation: `openrouter-usage.ts`, `model-credit-reconciler.ts`.
- Hosted credit mode (reserve an upper estimate, then settle) is detailed in section 5.
- `MODEL_STREAM_MAX_RETRIES` (0-5) and the fallback chain handle provider failure.

---

## 5. Secrets, audit, backups, billing, observability

**Secrets**
- Required env secrets: `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (64 hex), `SCREEN_PROXY_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `SANDBOX_SUPERVISOR_TOKEN`, optionally `RAKAZO_UPDATER_TOKEN`. `install-images.sh` generates them (`docs/self-host-secrets.md`).
- Default `SECRET_STORE=encrypted`: credentials are AES-256-GCM in Postgres, bound to the record (`docs/infisical-secrets.md`). Optional `SECRET_STORE=infisical` stores opaque refs in the same columns and uses a universal-auth machine identity. It has a 256-value, 30 s cache and best-effort remote cleanup. Legacy credentials, OTP codes and OAuth handshakes always use local encryption.
- KMS wrapping of `.env` values and of content keys (section 2).
- `Compose` passes each service only the env keys it reads, and `infra/updater/src/compose-env.test.ts` fails when a key is read but not listed (`docker-compose.yml` header comment).
- Bot-facing credential vault with origin pinning (section 3).

**Audit log** (`docs/self-host-audit-log.md`, `AuditEvent`, `packages/db/src/audit-events.ts`, `apps/api/src/audit-export.ts`)
- Always on, per organization. Records `tool.call`, `approval.decided`, `approval.auto_reviewed`, `approval.policy.changed`, `credential.*`, `space.*`, `auth.*`, `device.*`, `audit_log.exported`.
- Contains no message content, tool arguments or secret values. Labels are copied so rows survive deletions. The table is append-only, enforced by a Postgres trigger. Retention `AUDIT_EVENT_RETENTION_DAYS` (default 365).
- Export: `GET /api/audit-events/export` (JSONL, owner/admin) and an `audit.events` RPC. SIEM forwarding via `AUDIT_LOG_WEBHOOK_URL` (NDJSON, at-least-once, backoff). `infra/compose/audit-ship.py` and a systemd unit also exist. Failed sign-ins and rate limits go to a separate `SecurityEvent` table (default retention set by `SECURITY_EVENT_RETENTION_DAYS`).
- No in-app admin role by design: "App accounts never administer the server" (`VISION.md`).

**Backups** (`docs/self-host-backups.md`, `infra/compose/backup-prod.sh`, `pitr.sh`, `infra/systemd/*`)
- Dev/source: `scripts/backup.sh` / `restore.sh` (pg_dump + `data/` archive).
- Prod: verified `pg_dump` custom-format + appdata tarball under `/var/backups/rakazo`, systemd timer, retention and disk-budget logic, age-encrypted round-trip tested in CI, `backup-drill.sh`, alert units.
- Optional PITR sidecar (encrypted WAL + daily base to S3-compatible storage; `docs/self-host-backups.md#point-in-time-recovery`).
- `upgrade-postgres.sh` migrates 16 -> 18 with verification (and a CI job exercises it).
- You must back up Postgres, `DATA_DIR` **and** the encryption keys together, and keep keys separate.

**Billing** (`docs/self-host-billing.md`, `apps/api/src/billing*.ts`, `packages/db/src/billing.ts`, `model-credits.ts`)
- Optional Stripe, off unless `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. Own-key plan (`BYOK_MONTHLY_PRICE_CENTS` in contracts) or monthly USD credits ($10-$500) with top-ups. A lapsed org's bots and routines stop.
- Credit accounting is journal-based and rigorous: lots (monthly expires, top-ups do not), reserve -> settle, append-only `billing_audit_events` enforced by triggers, refund handling, webhook idempotency, a reconciler.
- Self-hosters can ignore it entirely.

**Observability** (`docs/self-host-observability.md`, `packages/logging`)
- Structured JSON logs to stdout (`LOG_LEVEL`, `LOG_FORMAT`), redaction (`redaction.ts`), request/job correlation IDs, optional Axiom sink (`@axiomhq/js@2.0.0`), Sentry or GlitchTip (`@sentry/node@11.8.0`, separate browser DSN tunneled through the API, no PII), optional OpenTelemetry traces from the worker (OTLP/HTTP; `rakazo.agent.run`, `pi.ai.request`, `pi.agent.tool` spans; prompt content excluded unless `OTEL_CAPTURE_CONTENT=true`), optional product analytics (PostHog-style via `ANALYTICS_*`).
- Health: public `/health` (liveness only) vs `/internal/health`. `rakazo-host-check.timer`, `host-alert.py` and `check-services.py` monitor the host. A diagnostics CLI (`node dist/cli/diagnostics.js`) prints a hashed, secret-free report.
- No Prometheus or metrics endpoint is evident. **[inference]** I did not grep exhaustively for it.

---

## 6. Minimum resources and ops complexity

No document states a "minimum RAM/CPU". The numbers below come from Compose limits and are **[inference]** for totals.

Declared `mem_limit`s (`docker-compose.prod.yml`): postgres 2 GB, api 2 GB (`RAKAZO_API_MEMORY_LIMIT`), worker 2 GB, web 512 MB, migrate 1.5 GB (one-shot), pitr 512 MB (optional), updater 1 GB (optional), caddy 256 MB. The images stack: postgres 2g, api 1.5g, worker 2g, web 512m, and so on. Each Docker computer is capped at 2 GB and 2 CPUs by default (`RAKAZO_COMPUTER_MEMORY`, `RAKAZO_COMPUTER_CPUS`) and runs Chromium. Computers start lazily and idle out (`SANDBOX_IDLE_MS`; Railway: 10 minutes).

Estimates: a **practical floor is about 4 vCPU and 8 GB RAM** for a one-user setup with one active Docker computer, and 16 GB or more with several bots running browsers at once. Limits are ceilings, not reservations, so idle use is lower. Disk: Postgres + `DATA_DIR` (artifacts, bot homes, Docker images including the Chromium computer image, which I have not sized) + backups (default budget 50 GiB, `RAKAZO_BACKUP_MAX_GB`). A UI-only mode exists (`SANDBOX_PROVIDER=none`) that avoids computer cost. Remote computers (E2B, Daytona, Boat, Railway, CreateOS, Novita, Boxd, Kubernetes, Wuying) offload that load, but they then need vendor keys.

Requirements stated: Docker Engine 26+ with Compose, curl, OpenSSL, Node `^22.22.2 || ^24 || >=26` for source builds, pnpm 9.15.0. The docs say a domain and TLS for public use, and a model key.

**Ops complexity: medium-high for something "personal".**
- Dozens of env vars (the API environment block in `docker-compose.yml` alone lists well over 150 keys). The same keys must be mirrored in the API and the worker, and "names you choose" such as `TELEGRAM_BOT_TOKEN_<NAME>` need override files (`docs/self-host-configuration.md`).
- The supervisor needs a Docker socket (`docs/self-host-docker-computers.md`), and strong isolation of computers needs host iptables rules, `restrict-computer-egress.sh`, run via sudo. They do not work on macOS, Windows, Docker Desktop or rootless Docker, where it falls back to `open`.
- Two DB roles and RLS, key-management discipline (losing `ENCRYPTION_KEY` loses everything), manual Postgres 16 -> 18 migration for existing installs, an optional root-equivalent updater sidecar, and the single-replica constraint on Railway.
- Upside: one `install-images.sh`, multi-arch images, `diagnostics` CLI, `check-host.sh`, a long set of runbook-grade docs (53 files in `docs/`), and a tested upgrade path.

---

## 7. Code quality signals

### Size (non-generated `.ts/.tsx/.mjs/.js/.sh/.py`, counted with `find ... | wc -l`; excludes `node_modules`, `generated`, `dist`)

| Package | Files | Test files | LOC | Test LOC |
|---|---|---|---|---|
| `packages/adapters` (runtime, connectors, sandboxes, messaging, executor) | 699 | 351 | 255,518 | 149,846 |
| `apps/mobile` | 621 | 235 | 118,003 | 54,376 |
| `apps/web` | 574 | 272 | 109,319 | 52,884 |
| `apps/api` | 210 | 107 | 72,793 | 43,080 |
| `packages/testkit` | 147 | 82 | 42,489 | 27,814 |
| `packages/core` | 240 | 116 | 41,938 | 22,072 |
| `packages/db` | 136 | 76 | 33,519 | 19,860 |
| `infra/` (compose, sandboxes, updater, scripts) | 81 | 33 | 27,603 | 13,092 |
| `apps/desktop` | 69 | 35 | 13,152 | 7,289 |
| `apps/www` | 59 | 1 | 12,627 | 100 |
| `packages/contracts` | 80 | 31 | 11,354 | 3,455 |
| `packages/chat-ui` | 23 | 10 | 8,031 | 3,911 |
| `packages/ui-web` | 64 | 12 | 6,241 | 842 |
| `packages/auth` | 18 | 6 | 5,097 | 3,150 |
| `packages/adapter-kit` | 22 | 4 | 3,524 | 658 |
| `packages/logging` | 29 | 10 | 2,990 | 1,544 |
| `apps/worker` | 6 | 2 | 675 | 119 |
| `packages/memory` | 3 | 2 | 506 | 327 |
| `scripts` | 12 | 1 | 1,258 | 98 |

Total: about 767k LOC, of which about 400k are tests. Roughly 1,250 test files. The worker is a thin composition root; the real logic sits in `packages/adapters` (about 255k LOC, which is a very large single package).

### Tests and CI
- Vitest 4.1.12 unit tests; `*.postgres.test.ts` run against real Postgres (Testcontainers `@testcontainers/postgresql@12.2.1`); `packages/testkit` provides a model emulator, a fake sandbox, an MCP emulator, a third-party connector emulator and offline harnesses. Policy stated in `VISION.md`: "core tests remain deterministic and offline by default".
- Root scripts: `test`, `test:integration`, `test:e2e`, `test:topology`, `test:canary`, `test:evals`, `test:computer-replay`, `test:flows`, `test:compose-smoke`, `perf:desktop` (`package.json`).
- `.github/workflows` has 15 workflows: `ci.yml` (changed-area detection; production builds + Electron smoke; lint (Biome); translation catalog check; typecheck with cache; unit tests; host-ops safety tests in Python; Windows/macOS/Linux "native computer" matrix; Postgres journeys sharded 2x; Postgres 16->18 upgrade test; Web E2E; publish server images; publish compatible Expo OTA update), `nightly-verification`, `topology-verification`, `playwright`, `computer-replay`, `weekly-dependencies`, `model-catalog-bump`, `review-bot`, release workflows for desktop, Android and iOS, plus screenshot and report publishing.
- Tooling: Biome 2.5.15, TypeScript 7.0.2, Turbo 2.11.10, pnpm 9.15.0 with security overrides and two local patches (`patches/`). `greptile.json` and CodeRabbit are credited in the README, i.e. AI code review is part of the workflow.
- Quirks and risks (fact, not inference): the version list is unusually forward (TypeScript 7, React Native 0.86, Expo 57, Node 26 support, "GPT-6", "Claude Sonnet 5.5"). That matches the commit date of Oct 2026, but it means some pinned versions may differ from what you can easily reproduce today. I could not verify them.

### Key third-party libraries (versions from `package.json` files; licenses are not visible in the repo and are marked as known/inferred where noted)

| Library | Version | Role | License |
|---|---|---|---|
| hono | 4.13.14 | API server | MIT (known) |
| @hono/node-server | 2.1.5 | HTTP adapter | MIT (known) |
| @orpc/server / contract / client / tanstack-query | 1.15.7 | typed RPC | MIT (known) |
| zod | 4.6.7 | schemas | MIT (known) |
| prisma + @prisma/client + adapter-pg | 7.10.1 | ORM | Apache-2.0 (known) |
| pg | 8.23.1 | Postgres driver | MIT (known) |
| graphile-worker | 0.17.3 | job queue | MIT (known) |
| better-auth (+ passkey, expo) | 1.7.12 | auth, orgs, passkeys, email OTP | MIT (known) |
| @earendil-works/pi-agent-core / pi-ai / pi-telemetry | 1.3.0 | agent runtime, LLM API | **unverified** |
| @composio/core | 0.18.1 | managed integrations | MIT (inference) |
| @modelcontextprotocol/sdk | 1.32.2 | MCP client | MIT (known) |
| chat, @chat-adapter/slack, telegram, whatsapp | 4.43.0 | messaging abstraction | unverified |
| @e2b/desktop 2.4.0, @daytona/sdk 0.211.2, @boatdev/sdk 1.11.0, @boxd-sh/sdk 0.2.20, novita-sandbox 2.1.1, railway 3.16.0, @kubernetes/client-node 2.0.1, dockerode 5.0.1 (patched) | | sandbox providers | mixed, unverified |
| @aws-sdk/client-kms, client-s3 | 3.1127.0 | KMS, object storage | Apache-2.0 (known) |
| @sentry/node 11.8.0, @opentelemetry/* (api 1.9.1, sdk-trace-node 2.12.0), @axiomhq/js 2.0.0 | | observability | MIT/Apache (known) |
| stripe (billing; not in the dependency list I printed, so it is probably called via `fetch`) | | **[inference]** | |
| React 19.2.3, react-router-dom 7.18.4, Vite, Tailwind, @base-ui/react 1.9.0, lucide-react 1.60.0, @lingui 6.6.0 | | web | MIT (known) |
| Electron + electron-updater 6.8.11; Expo 57.0.31, React Native 0.86.3 | | clients | MIT (known) |
| sharp 0.35.5, jsdom 30.1.3, @mozilla/readability 0.6.0 | | media, web fetch | Apache / MIT / MPL (known) |
| nodemailer 10.1.7, react-email 6.11.3 | | email | MIT-0 / MIT (known) |
| mermaid 11.17.2 | | diagrams | MIT (known) |
| astro 7.4.1 | | marketing site | MIT (known) |

Third-party SaaS dependencies that are *optional*: Composio, Pipedream, Treg, E2B, Daytona, Stripe, Sentry, Axiom, Infisical, AWS KMS, Expo push, Parallel/Keenable search, PromptLayer-style analytics. `VISION.md` says no hosted vendor may be required for the core product.

---

## 8. CHANGELOG velocity and recent big changes

- `CHANGELOG.md` has only two headings: `[Unreleased]` (about 107 lines, about 90 bullets) and `[0.1.0-beta] - 2026-08-13` ("Initial public beta: web, Electron, Expo clients; Pi runtime; Docker and E2B computers; plugins; one thread, computer, memory, routines, history per bot").
- The migrations directory runs to `20261110120000_external_effects_...` (Nov 2026 timestamp, beyond the commit date, so some are future-dated or the clock is off; **[inference]**). Counting 189 migrations in about 2.5 months of beta is a fast pace.
- Big Unreleased items: AWS KMS key provider and wrapped `.env` secrets; point-in-time recovery sidecar; Postgres 16 -> 18 for prod/source stacks; separate `migrate` container that alone holds the DB owner role; stdio MCP restricted to admins with encrypted args; Photon iMessage (multi-project), Telegram attachments, macOS voices; Ollama Cloud preset; lazy tool catalogs for Pipedream/MCP (more than 20 tools); trusted-proxy logic for sign-in rate limits; many run-queueing and steering fixes; Bedrock model catalog gap-fills; Gemini thought_signature fix.
- The vast majority of entries are "Fixed", i.e. correctness work on agent-run orchestration, secrets and networking edge cases. **[inference]** The product is stabilising rapidly but is still moving fast. Expect breaking operational changes between releases (the changelog itself warns operators to set `RAKAZO_ADMIN_EMAILS` before upgrading and to run a manual Postgres upgrade script).
- Git history is unavailable (shallow clone, single commit), so there is no commit-rate or contributor data. The README "Thanks" section and `AGENTS.md`/`CLAUDE.md` suggest heavy AI-assisted development **[inference]**.

## 9. Vision constraints that matter for adoption (`VISION.md`)
Persistent bots with one thread each; open-source core must run without any hosted vendor; Spaces as hard boundaries; no app-level admin role (operators use env vars); approvals with Allow/Block lists; plugins are data, not code; routines are "scheduled prompts, not a workflow language"; explicitly "not a model provider, hosted-only service, general VM manager, visual workflow builder, or CI system".

## 10. Gaps and unverified items
- Licenses of Pi packages, `chat-*` adapters and sandbox SDKs were not checked.
- Minimum hardware numbers are inferred from Compose limits, not stated by the project.
- I did not read the web or mobile client code, the executor internals, or the Pi runtime wrappers beyond file names and docs.
- No Helm chart, no multi-replica or HA story (Railway: single replica; graphile worker could scale, **[inference]**).
- Treg is described only by the README and a config enum. Whether its tool-gateway behaviour is MCP-only was inferred from the `preset` field on the MCP config schema.
