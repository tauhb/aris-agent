/**
 * Bot điều khiển màn hình máy Mac (GĐ8.3, phương án B; đặc tả: docs/specs/aris-computer.md). Lõi thao tác là
 * cua-driver (`cua.ts`), bọc sau `ComputerDriver`; lớp công cụ, lớp an toàn và API ở đây.
 *
 * - Cài đặt theo bot (kho `aris_computer`): bật/tắt (mặc định tắt), chế độ hỏi từng bước hay trong phạm vi, ứng dụng
 *   và loại thao tác được phép.
 * - Hook `tools/pre-execute`: tắt thì từ chối; chặn cứng; trong phạm vi tự làm, ngoài phạm vi từ chối; hỏi từng bước
 *   thì hỏi duyệt (xem màn hình chỉ hỏi lần đầu mỗi phiên). Ảnh chụp và chỗ đánh dấu của việc đang chờ duyệt giữ theo
 *   mã lời gọi để giao diện hiện (`GET /api/aris/computer?preview=<callId>`).
 * - Ảnh chụp chỉ đưa cho model khi model của phiên khai báo đọc được ảnh; không thì chỉ có danh sách phần tử.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { z } from 'zod'
import { loadCua } from './cua.js'
import { doctor, doctorText, type DoctorReport } from './doctor.js'
import { decide } from './gate.js'
import { ACTIONS, cleanSettings, COMPUTER_TOOLS, DEFAULT_SETTINGS, type ComputerSettings } from './policy.js'
import { ComputerRuntime, type Inspected } from './runtime.js'
import { makeTools, NO_IMAGE_NOTE } from './tools.js'
import { ComputerError, type ComputerDriver, type Point, type Rect } from './types.js'

export * from './coords.js'
export * from './doctor.js'
export * from './gate.js'
export * from './keys.js'
export * from './policy.js'
export * from './runtime.js'
export * from './tools.js'
export * from './types.js'

export const name = 'aris-computer'
export const inject = ['storageDomain']

const settingsRecord: z.ZodType<ComputerSettings> = z.object({
  on: z.boolean(),
  mode: z.enum(['ask', 'bounded']),
  apps: z.array(z.string()),
  actions: z.array(z.enum(ACTIONS)),
})

export const computerDomain = defineDomain({
  name: 'aris_computer',
  version: 1,
  layout: 'per-record',
  tables: { settings: domainTable<string, ComputerSettings>(settingsRecord) },
})

interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Việc đang chờ duyệt: ảnh cửa sổ và chỗ đánh dấu, cho thẻ duyệt. */
export interface Preview {
  sessionId: string
  bot: string
  tool: string
  describe: string
  image?: { png: string; width: number; height: number } | undefined
  mark?: Rect | Point | undefined
  at: number
}

/** Dịch vụ cho plugin khác (giao diện, kênh). */
export interface ArisComputer {
  settings(bot: string): ComputerSettings
  preview(callId: string): Preview | undefined
  holder(): { session: string; bot: string } | undefined
  doctor(): Promise<DoctorReport & { text: string }>
}

type AgentLike = {
  session: { id: string; requestHeader?(): { config?: { provider?: string; model?: string } } | undefined }
  options?: { provider?: string; model?: string }
}
type BotsLike = {
  botOf(sessionId: string | undefined): { id: string; name: string }
  store: { list(): { id: string; name: string }[] }
}
type LlmLike = {
  resolveModelInfo(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<{ inputModalities?: readonly string[] }>
}
type AttachmentsLike = {
  saveImage(i: { data: Uint8Array; mediaType: string; name?: string }): Promise<{
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name?: string
  }>
}

/** Giữ ảnh chờ duyệt tối đa chừng này. */
const PREVIEW_MS = 30 * 60_000
/** Thử nạp lại lõi sau khi lỗi. */
const RELOAD_MS = 60_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-computer')
  const domain = await ctx.storageDomain.open(computerDomain)
  ctx.effect(() => () => void domain.close(), 'aris-computer: domain')
  const table = domain.table('settings') as unknown as Table<ComputerSettings>
  const settingsOf = (bot: string): ComputerSettings => ({ ...DEFAULT_SETTINGS, ...(table.get(bot) ?? {}) })
  const bots = () => ctx.get('arisBots') as BotsLike | undefined
  const botOf = (sessionId: string) => bots()?.botOf(sessionId) ?? { id: 'aris', name: 'Aris' }

  // Lõi nạp khi cần lần đầu (không tốn gì khi chưa bot nào dùng); lỗi thì thử lại sau một phút.
  let driver: ComputerDriver | undefined
  let loadError: { error: string; at: number } | undefined
  let loading: Promise<void> | undefined
  const ensureDriver = async () => {
    if (driver) return
    if (loadError && Date.now() - loadError.at < RELOAD_MS) return
    loading ??= loadCua().then((r) => {
      loading = undefined
      if ('driver' in r) {
        driver = r.driver
        loadError = undefined
        logger.info('đã nạp lõi %s', r.driver.name)
      } else {
        loadError = { error: r.error, at: Date.now() }
        logger.warn('chưa nạp được lõi: %s', r.error)
      }
    })
    await loading
  }
  ctx.effect(() => () => void driver?.close(), 'aris-computer: lõi')

  const runtime = new ComputerRuntime({
    driver: () => driver,
    stopped: () => (ctx.get('arisGuard') as { stopped(): boolean } | undefined)?.stopped() === true,
  })
  const previews = new Map<string, Preview>()
  const viewed = new Set<string>()
  const prune = () => {
    const old = Date.now() - PREVIEW_MS
    for (const [k, v] of previews) if (v.at < old) previews.delete(k)
  }
  const keepPreview = (callId: string, sessionId: string, bot: string, tool: string, i: Inspected) => {
    prune()
    const img = i.win?.image
    previews.set(callId, {
      sessionId,
      bot,
      tool,
      describe: i.describe,
      ...(img
        ? { image: { png: Buffer.from(img.png).toString('base64'), width: img.width, height: img.height } }
        : {}),
      ...(i.mark ? { mark: i.mark } : {}),
      at: Date.now(),
    })
  }

  const runDoctor = async () => {
    const on = [...table.entries()]
      .filter(([, s]) => s.on)
      .map(
        ([id]) =>
          bots()
            ?.store.list()
            .find((b) => b.id === id)?.name ?? id,
      )
    const r = await doctor({
      load: async () => {
        await ensureDriver()
        return driver ? { driver } : { error: loadError?.error ?? 'chưa nạp được lõi' }
      },
      bots: on,
    })
    return { ...r, text: doctorText(r) }
  }

  ctx.provide('arisComputer', {
    settings: settingsOf,
    preview: (callId) => previews.get(callId),
    holder: () => runtime.holder(),
    doctor: runDoctor,
  } satisfies ArisComputer)

  // --- Lượt: đếm lại trần khi bắt đầu, nhả máy khi xong ------------------------------------------
  ctx.on('session/event', (session, event) => {
    const type = (event as { type?: string }).type
    if (type === 'turn/start') runtime.turnStart(session.id)
    else if (type === 'turn/end') runtime.turnEnd(session.id)
  })

  // --- Duyệt ------------------------------------------------------------------------------------
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      if (!COMPUTER_TOOLS.has(exec.name)) return next()
      const sid = (exec.agent as unknown as AgentLike | undefined)?.session.id
      if (!sid) return { kind: 'deny', reason: 'Công cụ điều khiển máy chỉ dùng trong phiên của bot.' }
      const bot = botOf(sid)
      if (settingsOf(bot.id).on) await ensureDriver()
      const d = await decide({
        settings: settingsOf(bot.id),
        bot: bot.name,
        runtime,
        sessionId: sid,
        tool: exec.name,
        args: exec.arguments,
        viewed,
      })
      if (d.kind === 'deny') return { kind: 'deny', reason: d.reason }
      const decision = await next()
      if (decision.kind !== 'allow') return decision
      if (d.kind === 'allow') return decision
      keepPreview(String(exec.callId), sid, bot.name, exec.name, d.inspected)
      return { kind: 'ask', reason: d.reason, displayReason: { en: d.reason, vi: d.reason } }
    },
    true,
  )

  // Việc cần duyệt vào hộp duyệt chung của @aris/commander (chuông Cần anh, Hộp duyệt, thanh duyệt trong chat,
  // Telegram cùng thấy), kèm mã lời gọi để giao diện lấy ảnh cửa sổ và chỗ đánh dấu. Không có hộp chung thì để dsh hỏi.
  ctx.on(
    'approval/request',
    async (raw, next) => {
      const req = raw as unknown as {
        toolName: string
        callId?: unknown
        reason?: string
        signal?: AbortSignal
        agent: { session: { id: string } }
      }
      if (!COMPUTER_TOOLS.has(req.toolName)) return next()
      const center = ctx.get('arisApprovals') as
        | { ask?(o: { run: string; tool: string; input: unknown }, signal?: AbortSignal): Promise<boolean> }
        | undefined
      if (!center?.ask) return next()
      const sid = req.agent.session.id
      const callId = req.callId === undefined ? undefined : String(req.callId)
      const p = callId ? previews.get(callId) : undefined
      const bot = botOf(sid)
      const allow = await center.ask(
        {
          run: `computer:${callId ?? `${sid}-${Date.now()}`}`,
          tool: req.toolName,
          input: {
            bot: bot.id,
            name: bot.name,
            parentSession: sid,
            describe: p?.describe ?? req.reason ?? req.toolName,
            ...(p ? { preview: callId } : {}),
          },
        },
        req.signal,
      )
      if (req.signal?.aborted) return 'cancelled'
      return allow ? 'allowed-once' : 'rejected'
    },
    true,
  )

  // --- Công cụ ----------------------------------------------------------------------------------
  /** Model của phiên có đọc được ảnh không (như `read_image` của dsh: phải khai báo rõ). */
  const imageCapable = async (agent: AgentLike | undefined, signal: AbortSignal) => {
    const routed = agent?.session.requestHeader?.()?.config
    const provider = routed?.provider ?? agent?.options?.provider
    const model = routed?.model ?? agent?.options?.model
    const llm = ctx.get('llm') as LlmLike | undefined
    if (!provider || !model || !llm) return false
    try {
      return (await llm.resolveModelInfo(provider, model, signal)).inputModalities?.includes('image') === true
    } catch {
      return false
    }
  }

  for (const tool of makeTools(async (name, args, exec) => {
    const agent = exec.agent as unknown as AgentLike | undefined
    const sid = agent?.session.id
    if (!sid) throw new ComputerError('Công cụ điều khiển máy chỉ dùng trong phiên của bot.', 'bad-input')
    const bot = botOf(sid)
    if (!settingsOf(bot.id).on)
      throw new ComputerError(`Bot ${bot.name} chưa được bật điều khiển máy.`, 'permission')
    await ensureDriver()
    previews.delete(String(exec.callId))
    const r = await runtime.run(sid, bot.name, name, args, exec.signal)
    if (name === 'man_hinh_xem') viewed.add(sid)
    if (!r.image) return { text: r.text }
    const attachments = ctx.get('attachments') as AttachmentsLike | undefined
    if (!attachments || !(await imageCapable(agent, exec.signal)))
      return { text: `${r.text}\n${NO_IMAGE_NOTE}` }
    const ref = await attachments.saveImage({
      data: r.image.png,
      mediaType: 'image/png',
      name: 'man-hinh.png',
    })
    return { text: r.text, image: { ...ref } }
  }))
    ctx.tools.register(tool)

  // --- API cho giao diện ------------------------------------------------------------------------
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/computer',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const url = new URL(request.url)
          if (request.method === 'GET') {
            const callId = url.searchParams.get('preview')
            if (callId) {
              const p = previews.get(callId)
              return p ? json(p) : json({ error: 'không có ảnh chờ duyệt này' }, 404)
            }
            if (url.searchParams.get('doctor')) return json(await runDoctor())
            // ?screen=<phiên>: ảnh màn hình mới nhất của bot trong phiên, chỗ vừa bấm, các bước, trần, cầm lái.
            const screenOf = url.searchParams.get('screen')
            if (screenOf) {
              const v = runtime.screenView(screenOf)
              if (!v) return json({ active: false })
              const img = v.screen?.image
              return json({
                active: true,
                ...v,
                screen: v.screen
                  ? {
                      ...v.screen,
                      image: img
                        ? {
                            png: Buffer.from(img.png).toString('base64'),
                            width: img.width,
                            height: img.height,
                          }
                        : undefined,
                    }
                  : undefined,
              })
            }
            return json({
              bots: Object.fromEntries([...table.entries()]),
              defaults: DEFAULT_SETTINGS,
              holder: runtime.holder() ?? null,
              driver: driver?.name ?? null,
              loadError: loadError?.error ?? null,
            })
          }
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const bot =
            typeof body.bot === 'string' && /^[a-z0-9-]{1,40}$/.test(body.bot) ? body.bot : undefined
          const session = typeof body.session === 'string' ? body.session : undefined
          switch (body.op) {
            case 'set': {
              if (!bot) return json({ error: 'thiếu bot' }, 400)
              const next = cleanSettings(body.settings, settingsOf(bot))
              await table.put(bot, next)
              return json({ bot, settings: next })
            }
            // Người dùng cầm lái (tự làm, ví dụ đăng nhập), rồi trả lại cho bot chạy tiếp.
            case 'take':
              if (!session) return json({ error: 'thiếu session' }, 400)
              runtime.pause(session)
              return json({ paused: true })
            case 'give':
              if (!session) return json({ error: 'thiếu session' }, 400)
              runtime.resume(session)
              return json({ paused: false })
            default:
              return json({ error: 'thao tác không hợp lệ' }, 400)
          }
        },
      })
      return () => void dispose()
    }, 'aris-computer: /api/aris/computer')
  })
}
