/**
 * Chạy ngầm (đặc tả: docs/specs/aris-daemon.md): socket cục bộ `~/.aris/run/<băm>.sock` cho lệnh
 * `aris`. Giao việc thành một phiên thường trong chat riêng (hiện trong app, Aris nhớ được).
 * @module @aris/daemon
 */
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { ensureHome } from '@aris/home'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import { close, listen, type AskResult, type DaemonPort } from './server.js'

export * from './server.js'

export const name = 'aris-daemon'
export const inject = ['sessionController', 'workspaceRegistry']

/**
 * Đường socket: `~/.aris/run/<băm DSH_HOME>.sock`. Không đặt trong DSH_HOME vì đường Unix socket
 * của macOS tối đa 104 ký tự; băm thư mục dữ liệu để mỗi bản aris một socket riêng.
 */
export function socketPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = resolve(env.DSH_HOME ?? join(homedir(), '.dsh'))
  return join(
    homedir(),
    '.aris',
    'run',
    `${createHash('sha256').update(home).digest('hex').slice(0, 12)}.sock`,
  )
}

interface AgentLike {
  followup(m: unknown): void
  cancel(cause: { kind: 'user' }): void
}

type Block = { type: string; text?: string }
const textOf = (blocks: readonly Block[]) =>
  blocks
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('')
    .trim()

export function apply(ctx: Context): void {
  const started = Date.now()
  const logger = ctx.logger('aris-daemon')

  async function ask(text: string, signal: AbortSignal): Promise<AskResult> {
    const home = await ensureHome(ctx.workspaceRegistry as never)
    const { sessionId } = await ctx.sessionController.create({ workspaceId: home.workspaceId as never })
    const r = await ctx.sessionController.resolveAgent(SessionId(sessionId))
    if ('error' in r) throw new Error(`không mở được phiên ${sessionId}`)
    const agent = r.agent as unknown as AgentLike
    const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    return new Promise<AskResult>((resolve) => {
      let ours = false
      let last = ''
      const off = ctx.on('session/event', (session, event) => {
        if (session.id !== sessionId) return
        if (event.type === 'user/message' && (event.data as { id?: string }).id === message.id) ours = true
        if (!ours) return
        if (event.type === 'assistant/message') {
          const t = textOf(
            (event.data as unknown as { message: { content: readonly Block[] } }).message.content,
          )
          if (t) last = t
        }
        if (event.type === 'turn/end') {
          off()
          resolve({ sessionId, text: last, reason: (event.data as { reason: { kind: string } }).reason.kind })
        }
      })
      signal.addEventListener('abort', () => agent.cancel({ kind: 'user' }), { once: true })
      agent.followup(message)
    })
  }

  const webUrl = () => (ctx.get('webApp') as { getAdvertisedUrl(): string } | undefined)?.getAdvertisedUrl()

  const port: DaemonPort = {
    status() {
      const channels = ctx.get('arisChannels') as { status?(): unknown } | undefined
      return {
        pid: process.pid,
        startedAt: new Date(started).toISOString(),
        uptimeSec: Math.round((Date.now() - started) / 1000),
        web: webUrl() ?? null,
        telegram: channels?.status?.() ?? null,
      }
    },
    loginUrl() {
      const web = webUrl()
      const connection = ctx.get('connection') as { authenticatedUrl(url: string): string } | undefined
      if (!web || !connection) throw new Error('profile này không có giao diện web')
      return connection.authenticatedUrl(web)
    },
    async send(text) {
      const channels = ctx.get('arisChannels') as
        { sendHome(bot: string, md: string): Promise<string> } | undefined
      if (!channels) throw new Error('kênh Telegram chưa bật')
      return channels.sendHome('aris', text)
    },
    ask,
    stop() {
      logger.info('dừng theo lệnh aris stop')
      process.kill(process.pid, 'SIGTERM')
    },
  }

  const path = socketPath()
  ctx.effect(() => {
    let server: Awaited<ReturnType<typeof listen>> | undefined
    mkdir(dirname(path), { recursive: true, mode: 0o700 })
      .then(() => listen(path, port))
      .then(
        (s) => (server = s),
        (e: unknown) => logger.warn('không mở được socket %s: %s', path, String(e)),
      )
    return () => {
      if (server) void close(server, path)
    }
  }, 'aris-daemon: socket')
}
