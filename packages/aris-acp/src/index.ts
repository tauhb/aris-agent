/**
 * aris làm agent cho ứng dụng khác qua ACP (giai đoạn 6, đợt 6a; đặc tả: docs/specs/aris-acp.md; bản vẽ 6.3b):
 * - Daemon nghe socket nội bộ `~/.aris/acp.sock` (0600); `aris-acp --bot <tên>` là khách mỏng chuyển byte.
 * - Mỗi kết nối là một nhánh `@deepseek-ai/dsh-acp` với luồng trên socket và model của bot; phiên tạo ra được gắn
 *   bot, đưa vào workspace của thư mục ứng dụng đưa sang, hiện trên bản đồ đội như mọi phiên.
 * - Bộ quyền khi làm khách: danh sách cấm áp cả khi ứng dụng tự duyệt; ký ức, công cụ của đội, duyệt theo luật.
 * - Nhật ký việc của phiên khách; `/api/aris/acp` cho màn 6.3b.
 * @module @aris/acp
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ArisBots } from '@aris/bots'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-workspace'
import { acpDomain, type LogRecord, type LogResult, type SettingsRecord, type Table } from './domain.js'
import {
  badGuestCwd,
  cleanRules,
  DEFAULT_RULES,
  describeCall,
  guestGuide,
  guestVerdict,
  shimScript,
  type GuestRules,
} from './policy.js'
import { parseHello, socketPath, socketStream, type Hello, type Message } from './wire.js'

export * from './policy.js'
export { parseHello, socketPath, type Hello } from './wire.js'

export const name = 'aris-acp'
export const inject = ['storageDomain', 'systemPrompt', 'workspaceRegistry']

/** Sau tính cách (290), trước ký ức lõi (300). */
export const CONTEXT_ORDER = 295
/** Giữ nhật ký bấy nhiêu ngày. */
const LOG_DAYS = 7

/** Dịch vụ cho plugin khác: phiên này có phải phiên khách (ký ức, vòng học nền bỏ qua). */
export interface ArisAcp {
  isGuest(sessionId: string | undefined): boolean
  /** Ngắt mọi ứng dụng đang nối (dừng khẩn cấp); trả số kết nối đã ngắt. */
  disconnectAll(): number
}

interface Conn {
  id: string
  sock: Socket
  app: string
  version?: string | undefined
  bot: { id: string; name: string; handle: string }
  cwd: string
  sessions: Set<string>
  at: string
  last: string
  dispose: () => void
}

const DEFAULT_SETTINGS: SettingsRecord = { enabled: false, open: [], rules: DEFAULT_RULES }

/** Tên ứng dụng dễ đọc từ `clientInfo` hay tên tiến trình gọi. */
export function appName(clientName?: string, parent?: string): string {
  const raw = (clientName || parent || '').trim()
  if (!raw) return 'Ứng dụng'
  if (/buzz/i.test(raw)) return 'Buzz Desktop'
  if (/^zed/i.test(raw)) return 'Zed'
  if (/code/i.test(raw) && /vs|visual/i.test(raw)) return 'VS Code'
  return raw.length > 40 ? `${raw.slice(0, 39)}…` : raw
}

/** Chỗ đặt lệnh `aris-acp` có trong PATH, nếu có. */
export function findOnPath(
  pathEnv = process.env.PATH ?? '',
  extra: readonly string[] = [],
): string | undefined {
  for (const dir of [...pathEnv.split(':'), ...extra]) {
    if (!dir) continue
    const p = join(dir, 'aris-acp')
    if (existsSync(p)) return p
  }
  return undefined
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-acp')
  const domain = await ctx.storageDomain.open(acpDomain)
  ctx.effect(() => () => void domain.close(), 'aris-acp: domain')
  const settingsT = domain.table('settings') as unknown as Table<SettingsRecord>
  const logT = domain.table('log') as unknown as Table<LogRecord>
  const settings = (): SettingsRecord => {
    const s = settingsT.get('main')
    return s ? { ...DEFAULT_SETTINGS, ...s, rules: cleanRules(s.rules) } : DEFAULT_SETTINGS
  }
  const rules = (): GuestRules => settings().rules
  const bots = () => ctx.get('arisBots') as ArisBots | undefined

  const conns = new Map<string, Conn>()
  /** Phiên khách → kết nối của nó. */
  const guests = new Map<string, Conn>()

  async function log(
    conn: Conn,
    session: string,
    what: string,
    result: LogResult,
    extra: Partial<LogRecord> = {},
  ) {
    const id = `l-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
    await logT
      .put(id, {
        id,
        at: new Date().toISOString(),
        app: conn.app,
        bot: conn.bot.name,
        session,
        what: what.slice(0, 200),
        result,
        ...extra,
      })
      .catch((e: unknown) => logger.warn('ghi nhật ký: %s', String(e)))
    conn.last = new Date().toISOString()
  }
  // Dọn nhật ký cũ.
  ctx.effect(() => {
    const prune = () => {
      const since = Date.now() - LOG_DAYS * 86_400_000
      for (const [k, r] of logT.entries()) if (Date.parse(r.at) < since) void logT.delete(k)
    }
    prune()
    const timer = setInterval(prune, 6 * 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-acp: dọn nhật ký')

  /** Kết nối của một phiên khách; phiên con (tác nhân con) của phiên khách cũng là khách. */
  const guestOf = (sid: string | undefined, agent?: { session: { header?: { parentSession?: string } } }) => {
    if (!sid) return undefined
    const direct = guests.get(sid)
    if (direct) return direct
    const parent = agent?.session.header?.parentSession
    const inherited = parent ? guests.get(String(parent)) : undefined
    if (inherited) guests.set(sid, inherited)
    return inherited
  }
  ctx.provide('arisAcp', {
    isGuest: (sid: string | undefined) => !!guestOf(sid),
    disconnectAll: () => {
      const n = conns.size
      for (const c of conns.values()) c.sock.destroy()
      return n
    },
  } satisfies ArisAcp)

  // --- Bộ quyền khi làm khách ----------------------------------------------------------------------
  /** Lời gọi đã hỏi ứng dụng: callId → kết quả. */
  const asked = new Map<string, 'allowed' | 'rejected'>()
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const sid = exec.agent?.session.id
      const g = guestOf(sid, exec.agent as never)
      if (!g || !sid) return next()
      const what = describeCall(exec.name, exec.arguments)
      const v = guestVerdict(exec.name, exec.arguments, g.cwd, rules())
      if (v) {
        await log(g, sid, what, 'blocked', { reason: v.what, callId: String(exec.callId) })
        return { kind: 'deny', reason: v.reason }
      }
      const d = await next()
      const a = asked.get(String(exec.callId))
      asked.delete(String(exec.callId))
      const result: LogResult =
        d.kind === 'deny' || d.kind === 'cancel'
          ? a === 'rejected'
            ? 'app-rejected'
            : 'blocked'
          : a === 'allowed'
            ? 'app-approved'
            : 'allowed'
      await log(g, sid, what, result, {
        callId: String(exec.callId),
        ...(d.kind === 'deny' && result === 'blocked' ? { reason: d.reason.slice(0, 160) } : {}),
      })
      return d
    },
    true,
  )
  ctx.on(
    'approval/request',
    async (req, next) => {
      const g = guestOf(req.agent.session.id, req.agent as never)
      if (!g) return next()
      // Tắt "hỏi lại ứng dụng": aris tự từ chối mọi việc cần duyệt của phiên khách.
      if (!rules().ask) {
        if (req.callId) asked.set(String(req.callId), 'rejected')
        return 'rejected'
      }
      const out = await next()
      if (req.callId) asked.set(String(req.callId), out === 'allowed-once' ? 'allowed' : 'rejected')
      return out
    },
    true,
  )
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:guest',
        order: CONTEXT_ORDER,
        text: (c) => {
          const g = guestOf(c?.agent?.session.id, c?.agent as never)
          return g ? guestGuide({ app: g.app, bot: g.bot.name, rules: rules(), cwd: g.cwd }) : ''
        },
        interpolate: false,
      }),
    'aris-acp: lời dặn khách',
  )

  // --- Phiên của kết nối ---------------------------------------------------------------------------
  async function adopt(conn: Conn, sid: string) {
    if (conn.sessions.has(sid)) return
    conn.sessions.add(sid)
    guests.set(sid, conn)
    // dsh-acp tạo Agent không qua bộ điều khiển phiên nên chưa có preset (công cụ terminal, tệp…): chọn preset
    // mặc định trước lượt đầu, như phiên mở từ web.
    const presets = ctx.get('agentPresets') as
      | {
          resolve(id?: string): Promise<{ id: string }>
          select(agent: unknown, id: string): Promise<string>
          composedPreset?(ctx: unknown): string | undefined
        }
      | undefined
    const agent = (ctx.get('agents') as { get(id: string): { ctx: unknown } | undefined } | undefined)?.get(
      sid,
    )
    if (presets && agent && !presets.composedPreset?.(agent.ctx))
      await presets
        .resolve()
        .then((p) => presets.select(agent, p.id))
        .catch((e: unknown) => logger.warn('chọn preset cho phiên %s: %s', sid, String(e)))
    const b = bots()
    if (b && b.store.get(conn.bot.id)?.kind !== 'commander')
      await b.tag(sid, conn.bot.id, 'acp').catch((e: unknown) => logger.warn('gắn bot: %s', String(e)))
    try {
      const reg = ctx.workspaceRegistry
      const ws = (await reg.resolveByPath(conn.cwd)) ?? (await reg.create(conn.cwd, basename(conn.cwd)))
      if (!ws.sessionIds.includes(SessionId(sid))) await ws.attachSession(SessionId(sid))
    } catch (e) {
      logger.warn('đưa phiên %s vào workspace %s: %s', sid, conn.cwd, String(e))
    }
    await log(conn, sid, `Mở phiên trong ${conn.cwd.replace(homedir(), '~')}`, 'session-opened')
  }

  // --- Socket nội bộ (chỉ trong daemon có máy chủ web) ---------------------------------------------
  ctx.inject(['connection', 'agents', 'sessions', 'llm', 'sessionPersistence'], (ctx) => {
    let server: Server | undefined
    const path = socketPath()

    const startConn = async (sock: Socket, hello: Hello, rest: string) => {
      const reply = (o: unknown) => sock.write(`${JSON.stringify(o)}\n`)
      const b = bots()
      const s = settings()
      if (!s.enabled)
        return void (reply({ ok: false, error: 'aris đang tắt cho ứng dụng khác.' }), sock.end())
      if ((ctx.get('arisGuard') as { stopped?(): boolean } | undefined)?.stopped?.())
        return void (reply({ ok: false, error: 'aris đang dừng khẩn cấp.' }), sock.end())
      const want = hello.bot.toLowerCase().replace(/^@/, '')
      const bot =
        b?.store.byHandle(want) ??
        b?.store.get(want) ??
        b?.store.list().find((x) => x.name.toLowerCase() === want)
      if (!bot) return void (reply({ ok: false, error: `Không có bot "${hello.bot}".` }), sock.end())
      if (!s.open.includes(bot.id))
        return void (reply({
          ok: false,
          error: `${bot.name} chưa mở cho ứng dụng khác (Cài đặt › Ứng dụng khác).`,
        }),
        sock.end())
      // Ứng dụng tự khai `cwd`: từ chối khi quá rộng, hệ thống, chứa dữ liệu aris, hay không phải thư mục (đợt 7f, S11).
      const badCwd =
        badGuestCwd(hello.cwd) ??
        (statSync(hello.cwd, { throwIfNoEntry: false })?.isDirectory()
          ? undefined
          : 'Thư mục làm việc không tồn tại.')
      if (badCwd) return void (reply({ ok: false, error: badCwd }), sock.end())
      reply({ ok: true, bot: bot.name })

      const conn: Conn = {
        id: randomUUID().slice(0, 8),
        sock,
        app: appName(undefined, hello.parent),
        bot: { id: bot.id, name: bot.name, handle: bot.handle },
        cwd: hello.cwd,
        sessions: new Set(),
        at: new Date().toISOString(),
        last: new Date().toISOString(),
        dispose: () => undefined,
      }
      const pending = new Map<string, { method: string; params: Record<string, unknown> }>()
      const tap = {
        in(m: Message) {
          conn.last = new Date().toISOString()
          const params = (m.params ?? {}) as Record<string, unknown>
          if (m.method === 'initialize') {
            const ci = params.clientInfo as { name?: string; title?: string; version?: string } | undefined
            if (ci?.name || ci?.title) conn.app = appName(ci.title || ci.name, hello.parent)
            if (ci?.version) conn.version = ci.version
          }
          if (
            m.id !== undefined &&
            (m.method === 'session/new' || m.method === 'session/resume' || m.method === 'session/load')
          )
            pending.set(String(m.id), { method: String(m.method), params })
        },
        out(m: Message): Promise<void> | undefined {
          if (m.id === undefined || !('result' in m)) return undefined
          const p = pending.get(String(m.id))
          if (!p) return undefined
          pending.delete(String(m.id))
          const sid =
            ((m.result ?? {}) as { sessionId?: string }).sessionId ??
            (typeof p.params.sessionId === 'string' ? p.params.sessionId : undefined)
          if (sid) return adopt(conn, sid)
        },
      }
      const stream = socketStream(sock, rest, tap)
      // Model riêng của bot, không có thì model mặc định của dsh.
      const model =
        b?.store.effectiveModel(bot.id) ??
        (await (
          ctx.get('sessionController') as
            { modelCatalog(): Promise<{ default?: { provider?: string; model?: string } }> } | undefined
        )
          ?.modelCatalog()
          .then((c) =>
            c.default?.provider && c.default.model
              ? { provider: c.default.provider, model: c.default.model }
              : undefined,
          )
          .catch(() => undefined))
      const acp = await import('@deepseek-ai/dsh-acp')
      const fiber = (ctx as unknown as { plugin(p: unknown, c: unknown): { dispose(): unknown } }).plugin(
        acp,
        {
          stream,
          ...(model ? { provider: model.provider, model: model.model } : {}),
        },
      )
      conn.dispose = () => void fiber.dispose()
      conns.set(conn.id, conn)
      sock.on('close', () => {
        conn.dispose()
        conns.delete(conn.id)
        for (const sid of conn.sessions) guests.delete(sid)
      })
    }

    const listen = () => {
      if (server) return
      mkdirSync(dirname(path), { recursive: true })
      if (existsSync(path)) {
        try {
          unlinkSync(path)
        } catch {
          // Không xoá được: listen sẽ báo lỗi.
        }
      }
      server = createServer((sock) => {
        let head = ''
        const onData = (d: Buffer) => {
          head += d.toString('utf8')
          const i = head.indexOf('\n')
          if (i < 0) {
            if (head.length > 4096) sock.destroy()
            return
          }
          sock.off('data', onData)
          sock.pause()
          const hello = parseHello(head.slice(0, i))
          if (!hello) {
            sock.end(`${JSON.stringify({ ok: false, error: 'Bắt tay sai.' })}\n`)
            return
          }
          void startConn(sock, hello, head.slice(i + 1))
            .catch((e: unknown) => {
              logger.warn('kết nối ACP: %s', String(e))
              sock.destroy()
            })
            .finally(() => sock.resume())
        }
        sock.on('data', onData)
        sock.on('error', () => undefined)
      })
      server.on('error', (e) => logger.warn('socket ACP: %s', String(e)))
      server.listen(path, () => {
        try {
          chmodSync(path, 0o600)
        } catch {
          // Thư mục ~/.aris đã chỉ người dùng đọc được.
        }
      })
    }
    const close = () => {
      for (const c of conns.values()) c.sock.destroy()
      server?.close()
      server = undefined
      if (existsSync(path)) {
        try {
          unlinkSync(path)
        } catch {
          // Bỏ qua.
        }
      }
    }
    ctx.effect(() => {
      if (settings().enabled) listen()
      return close
    }, 'aris-acp: socket')

    // --- /api/aris/acp ------------------------------------------------------------------------------
    const BRIDGE = fileURLToPath(new URL('./bridge.js', import.meta.url))
    const installTargets = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')]
    const state = () => {
      const s = settings()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const log = [...logT.entries()]
        .map(([, r]) => r)
        .filter((r) => Date.parse(r.at) >= today.getTime())
        .sort((a, b) => b.at.localeCompare(a.at))
      const b = bots()
      return {
        enabled: s.enabled,
        listening: !!server?.listening,
        socket: path.replace(homedir(), '~'),
        command: findOnPath(process.env.PATH, installTargets) ?? null,
        rules: s.rules,
        connections: [...conns.values()].map((c) => ({
          id: c.id,
          app: c.app,
          version: c.version ?? null,
          bot: c.bot,
          cwd: c.cwd.replace(homedir(), '~'),
          sessions: [...c.sessions],
          at: c.at,
          last: c.last,
          busy: [...c.sessions].some((sid) => b?.live.sessionState(sid) === 'running'),
        })),
        bots: (b?.store.list() ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          handle: x.handle,
          role: x.role,
          mascot: (x as { mascot?: string }).mascot ?? null,
          accessory: (x as { accessory?: string }).accessory ?? null,
          kind: x.kind,
          open: s.open.includes(x.id),
        })),
        log,
      }
    }
    const save = async (patch: Partial<SettingsRecord>) => {
      const next = { ...settings(), ...patch }
      await settingsT.put('main', next)
      if (next.enabled) listen()
      else close()
    }
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/acp',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          if (request.method !== 'POST') return json(state())
          let body: Record<string, unknown>
          try {
            body = (await request.json()) as Record<string, unknown>
          } catch {
            return json({ error: 'JSON không hợp lệ' }, 400)
          }
          switch (body.op) {
            case 'enabled':
              await save({ enabled: body.on === true })
              break
            case 'bot': {
              const id = typeof body.bot === 'string' ? body.bot : ''
              if (!bots()?.store.get(id)) return json({ error: 'Không có bot này.' }, 400)
              const open = new Set(settings().open)
              if (body.on === true) open.add(id)
              else open.delete(id)
              await save({ open: [...open] })
              break
            }
            case 'rule':
              await save({ rules: cleanRules({ [String(body.rule)]: body.on === true }, settings().rules) })
              break
            case 'disconnect':
              for (const c of conns.values()) if (!body.id || c.id === body.id) c.sock.destroy()
              break
            case 'install': {
              // Đặt lệnh aris-acp vào PATH (người dùng bấm ở màn 6.3b).
              const dir = installTargets.find((d) => existsSync(d)) ?? installTargets[2]!
              try {
                mkdirSync(dir, { recursive: true })
                writeFileSync(join(dir, 'aris-acp'), shimScript(process.execPath, BRIDGE), { mode: 0o755 })
              } catch (e) {
                return json(
                  { error: `Không ghi được vào ${dir}: ${e instanceof Error ? e.message : String(e)}` },
                  409,
                )
              }
              break
            }
            default:
              return json({ error: 'op không hợp lệ' }, 400)
          }
          return json(state())
        },
      })
      return () => void dispose()
    }, 'aris-acp: /api/aris/acp')
  })
}
