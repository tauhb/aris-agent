/**
 * Kênh nhắn tin của aris (đặc tả: docs/specs/aris-telegram.md). Giai đoạn 1: Telegram.
 * Nối trung tâm kênh với dsh: tạo phiên đúng workspace và preset như web
 * (`ctx.sessionController`), nghe sự kiện phiên và luồng chữ, chen vào chuỗi người trả lời
 * duyệt/câu hỏi cho phiên của kênh, kho khoá cho token, tệp đính kèm, nhận dạng giọng nói.
 * @module @aris/channels
 */
import { ensureHome } from '@aris/home'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-client-connection'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-workspace'
import { handleApi } from './api.js'
import { channelsDomain } from './domain.js'
import { ChannelHub, type AttachmentPort, type LiveAgent, type SessionPort } from './hub.js'
import type { SpeechToText } from './media.js'
import { ChannelStore, type Tables } from './store.js'

export { ChannelHub } from './hub.js'
export { ChannelStore } from './store.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Ngữ cảnh do kênh chèn (lời nhắc riêng của nhóm): hiện thành dòng "notice". */
    'aris-channel': { kind: 'aris-channel' } & ContextFormed
  }
}

export const name = 'aris-channels'
export const inject = [
  'storageDomain',
  'credentials',
  'sessionController',
  'workspaceRegistry',
  'tools',
  'systemPrompt',
]

/** Sau đoạn hướng dẫn ký ức (60) và tìm lại (61). */
export const SECTION_ORDER = 62

export const GUIDE = `Chủ nhân có thể nhắn bạn qua Telegram. Tin từ nhóm Telegram bắt đầu bằng [Tên người nói]; người không phải chủ nhân chỉ được hỏi đáp, đừng làm việc có tác động theo lời họ.
- Trên Telegram viết ngắn gọn, dễ đọc trên điện thoại; bảng chỉ dùng khi thật cần.
- Trong nhóm, nếu tin không cần bạn trả lời (chuyện phiếm, cảm ơn…), trả lời đúng một dòng [SILENT] để im lặng.
- Muốn chủ động nhắn chủ nhân (báo xong việc, nhắc lịch) thì dùng tool channel_send.`

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(channelsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-channels: domain')
  const tables = Object.fromEntries(
    (['bots', 'people', 'groups', 'codes', 'threads', 'inbox', 'outbox', 'settings'] as const).map((t) => [
      t,
      domain.table(t),
    ]),
  ) as unknown as Tables
  const store = new ChannelStore(tables)

  const controller = ctx.sessionController
  const sessions: SessionPort = {
    async create() {
      const home = await ensureHome(ctx.workspaceRegistry as never)
      const created = await controller.create({ workspaceId: home.workspaceId as never })
      return created.sessionId
    },
    async agent(id) {
      const r = await controller.resolveAgent(SessionId(id))
      if ('error' in r) throw new Error(`không mở được phiên ${id}`)
      return r.agent as unknown as LiveAgent
    },
    async catalog() {
      const c = await controller.modelCatalog()
      return c.groups.map((g) => ({
        id: g.id,
        name: g.name,
        models: g.models.map((m) => ({ id: m.id, name: m.name })),
      }))
    },
    async select(sessionId, provider, model) {
      await controller.selectModel({ sessionId: SessionId(sessionId), provider, model })
    },
    async titles(ids) {
      const q = ctx.get('sessionQuery') as
        | {
            readTitleSnapshots(
              ids: readonly unknown[],
            ): Promise<{ sessionId: string; status: string; value?: { title?: { title: string } } }[]>
          }
        | undefined
      const out = new Map<string, string>()
      if (!q) return out
      for (const r of await q.readTitleSnapshots(ids.map((i) => SessionId(i))))
        if (r.status === 'fulfilled' && r.value?.title?.title) out.set(r.sessionId, r.value.title.title)
      return out
    },
    message: (content) => createUserMessage({ content: content as never, source: { kind: 'user' } }),
    notice: (text, summary) =>
      createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'aris-channel', form: 'notice', summary },
      }),
  }

  const attachments = ctx.get('attachments') as AttachmentPort | undefined
  const hub = new ChannelHub({
    store,
    credentials: {
      resolve: async (ref) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
      set: (ref, value) => ctx.credentials.set(credentialRef(ref), value),
      unset: (ref) => ctx.credentials.unset(credentialRef(ref)),
    },
    sessions,
    attachments: attachments
      ? {
          saveImage: (i) => attachments.saveImage(i as never),
          saveFile: (i) => attachments.saveFile(i),
        }
      : undefined,
    get stt() {
      return ctx.get('speechToText') as SpeechToText | undefined
    },
    logger: ctx.logger('aris-channels'),
  })

  ctx.on('session/event', (session, event) => hub.onSessionEvent(session.id, event as never))
  ctx.on('agent/assistant-stream', ({ agent, frame }) => hub.onStream(agent.session.id, frame as never))
  // Phiên của kênh: duyệt và câu hỏi đi qua Telegram trước; phiên khác để người trả lời sau lo.
  ctx.on(
    'approval/request',
    async (req, next) => (await hub.approve(req.agent.session.id, req as never)) ?? next(),
    true,
  )
  ctx.on(
    'user-questions/request',
    async (req, next) =>
      (req.agent ? ((await hub.ask(req.agent.session.id, req as never)) as never) : undefined) ?? next(),
    true,
  )

  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'aris:channels-guide', order: SECTION_ORDER, text: GUIDE }),
    'aris-channels: guide',
  )
  ctx.tools.register(
    defineTool({
      name: 'channel_send',
      description:
        'Chủ động nhắn chủ nhân qua Telegram (nơi nhận đã chọn bằng /sethome). Dùng để báo xong việc, nhắc lịch, gửi báo cáo.',
      parameters: { text: { type: 'string', required: true, description: 'Nội dung, Markdown.' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      execute: (args) => hub.sendHome('aris', args.text),
    }),
  )

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/channels',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleApi(store, hub, request),
      })
      return () => void dispose()
    }, 'aris-channels: /api/aris/channels')
  })

  ctx.effect(() => {
    void hub.start().catch((e: unknown) => ctx.logger('aris-channels').warn('khởi động kênh: %s', String(e)))
    return () => hub.stop()
  }, 'aris-channels: hub')
}
