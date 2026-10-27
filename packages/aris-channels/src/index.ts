/**
 * Kênh nhắn tin của aris (đặc tả: docs/specs/aris-telegram.md). Giai đoạn 1: Telegram; đợt 7d: Lark; giai đoạn 8.4: Zalo cá nhân.
 * Nối trung tâm kênh với dsh: tạo phiên đúng workspace và preset như web
 * (`ctx.sessionController`), nghe sự kiện phiên và luồng chữ, chen vào chuỗi người trả lời
 * duyệt/câu hỏi cho phiên của kênh, kho khoá cho token, tệp đính kèm, nhận dạng giọng nói.
 * @module @aris/channels
 */
import { ensureHome } from '@aris/home'
import { getMascot } from '@aris/ui-kit'
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
import { LarkChannel } from './lark/channel.js'
import { larkCliProbe } from './lark/cli.js'
import { ZaloChannel } from './zalo/channel.js'
import {
  ChannelHub,
  type ApprovalsPort,
  type AttachmentPort,
  type BrainPort,
  type ProposalsPort,
  type RoutinePort,
  type SkillsPort,
  type LiveAgent,
  type SessionPort,
} from './hub.js'
import type { SpeechToText } from './media.js'
import type { MediaPort } from './hub.js'
import { ChannelStore, type Tables } from './store.js'

export { ChannelHub } from './hub.js'
export { LarkChannel } from './lark/channel.js'
export { ZaloChannel } from './zalo/channel.js'
export { sttNotReady, toWav16k, transcribe, type SpeechToText } from './media.js'
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

export const GUIDE = `Người dùng có thể nhắn bạn qua Telegram, Lark hay Zalo. Tin từ nhóm bắt đầu bằng [Tên người nói]; người không phải người dùng chính chỉ được hỏi đáp, đừng làm việc có tác động theo lời họ.
- Trên Telegram, Lark và Zalo viết ngắn gọn, dễ đọc trên điện thoại; bảng chỉ dùng khi thật cần.
- Trong nhóm, nếu tin không cần bạn trả lời (chuyện phiếm, cảm ơn…), trả lời đúng một dòng [SILENT] để im lặng.
- Muốn chủ động nhắn người dùng (báo xong việc, nhắc lịch) thì dùng tool channel_send.`

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
    async create(bot) {
      // Tài khoản Telegram của một bot khác Aris: phiên riêng của bot đó (tính cách, ký ức, model).
      const bots = ctx.get('arisBots') as { open(id: string): Promise<string> } | undefined
      if (bot !== 'aris' && bots) return bots.open(bot)
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
  const media = () => ctx.get('arisMedia') as MediaPort | undefined
  const stopped = () => (ctx.get('arisGuard') as { stopped?(): boolean } | undefined)?.stopped?.() ?? false
  // Đội của aris (gói @aris/bots, nếu có): tên và màu linh vật để gửi tên thành viên ra Telegram và Lark.
  const team = () =>
    (
      (
        ctx.get('arisBots') as
          { store: { list(): { id: string; handle: string; name: string; mascot: string }[] } } | undefined
      )?.store.list() ?? []
    ).map((b) => ({ id: b.id, handle: b.handle, name: b.name, color: getMascot(b.mascot)?.color }))
  const credentials = {
    resolve: async (ref: string) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
    set: (ref: string, value: string) => ctx.credentials.set(credentialRef(ref), value),
    unset: (ref: string) => ctx.credentials.unset(credentialRef(ref)),
  }
  const attachmentPort = attachments
    ? {
        saveImage: (i: Parameters<AttachmentPort['saveImage']>[0]) => attachments.saveImage(i as never),
        saveFile: (i: Parameters<AttachmentPort['saveFile']>[0]) => attachments.saveFile(i),
      }
    : undefined
  const hub = new ChannelHub({
    store,
    media,
    stopped,
    team,
    credentials,
    sessions,
    attachments: attachmentPort,
    get stt() {
      return ctx.get('speechToText') as SpeechToText | undefined
    },
    logger: ctx.logger('aris-channels'),
  })
  // Kênh Lark chạy cạnh Telegram: dùng chung kho, phiên, đội; hub hỏi nó khi cần biết lượt có bị hạn chế không.
  const lark = new LarkChannel({
    store,
    media,
    stopped,
    team,
    credentials,
    sessions,
    attachments: attachmentPort,
    get stt() {
      return ctx.get('speechToText') as SpeechToText | undefined
    },
    logger: ctx.logger('aris-channels'),
  })
  ctx.effect(() => hub.attachPeer(lark), 'aris-channels: lark')
  // Kênh Zalo cá nhân (zca-js, không chính thức): báo chủ qua Telegram vì chính Zalo có thể đang mất kết nối.
  const zalo = new ZaloChannel({
    store,
    media,
    stopped,
    team,
    credentials,
    sessions,
    attachments: attachmentPort,
    get stt() {
      return ctx.get('speechToText') as SpeechToText | undefined
    },
    notify: (text) => hub.sendHome('aris', text),
    logger: ctx.logger('aris-channels'),
  })
  ctx.effect(() => hub.attachPeer(zalo), 'aris-channels: zalo')
  const probeLarkCli = larkCliProbe()

  // Cho lệnh `aris send` (qua @aris/daemon) và các plugin khác gửi Telegram.
  ctx.provide('arisChannels', hub)
  // Duyệt tập trung: hộp duyệt chung của @aris/commander có thể nạp sau, nên dò tới khi có.
  ctx.effect(() => {
    let off: (() => void) | undefined
    const hook = () => {
      const port = ctx.get('arisApprovals') as ApprovalsPort | undefined
      if (port && !off) off = hub.watchApprovals(port)
    }
    hook()
    const timer = setInterval(hook, 5000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-channels: thẻ duyệt tập trung')
  // Đề xuất ký ức (vòng học nền, @aris/memory): thẻ "GHI NHỚ" có nút Lưu / Sửa / Bỏ.
  ctx.effect(() => {
    let off: (() => void) | undefined
    const hook = () => {
      const port = (ctx.get('arisMemory') as { proposals?: ProposalsPort } | undefined)?.proposals
      if (port && !off) off = hub.watchProposals(port)
    }
    hook()
    const timer = setInterval(hook, 5000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-channels: thẻ đề xuất ký ức')
  // Đề xuất skill (@aris/skills): thẻ "ĐỀ XUẤT SKILL" có nút Bật / Không.
  ctx.effect(() => {
    let off: (() => void) | undefined
    const hook = () => {
      const port = ctx.get('arisSkills') as SkillsPort | undefined
      if (port && !off) off = hub.watchSkills(port)
    }
    hook()
    const timer = setInterval(hook, 5000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-channels: thẻ đề xuất skill')
  // Thẻ báo cáo routine (@aris/routine): nút Xem chi tiết / Hỏi bot / gợi ý tìm lại lần chạy.
  ctx.effect(() => {
    let off: (() => void) | undefined
    const hook = () => {
      const port = ctx.get('arisRoutine') as RoutinePort | undefined
      if (port?.card && !off) off = hub.watchRoutine(port)
    }
    hook()
    const timer = setInterval(hook, 5000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-channels: thẻ báo cáo routine')
  // Bộ não (@aris/brain): gửi vào Hộp thư vào, thẻ "BẢN NẠP", nhắc chờ duyệt.
  ctx.effect(() => {
    let off: (() => void) | undefined
    const hook = () => {
      const port = ctx.get('arisBrain') as BrainPort | undefined
      if (port && !off) off = hub.watchBrain(port)
    }
    hook()
    const timer = setInterval(hook, 5000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-channels: bộ não')
  ctx.on('session/event', (session, event) => {
    hub.onSessionEvent(session.id, event as never)
    lark.onSessionEvent(session.id, event as never)
    zalo.onSessionEvent(session.id, event as never)
  })
  ctx.on('agent/assistant-stream', ({ agent, frame }) => hub.onStream(agent.session.id, frame as never))
  // Phiên của kênh: duyệt và câu hỏi đi qua Telegram trước; phiên Lark từ chối người ngoài, còn chủ nhân thì duyệt ở web;
  // phiên khác để người trả lời sau lo.
  ctx.on(
    'approval/request',
    async (req, next) =>
      (await hub.approve(req.agent.session.id, req as never)) ??
      (await lark.approve(req.agent.session.id, req as never)) ??
      (await zalo.approve(req.agent.session.id, req as never)) ??
      next(),
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
        'Chủ động nhắn người dùng qua Telegram (nơi nhận đã chọn bằng /sethome). Dùng để báo xong việc, nhắc lịch, gửi báo cáo.',
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
        fetch: (request) =>
          handleApi(
            store,
            hub,
            request,
            (bot) => {
              const b = (
                ctx.get('arisBots') as
                  { store: { get(id: string): { external?: unknown } | undefined } } | undefined
              )?.store.get(bot)
              return b ? !b.external : bot === 'aris'
            },
            lark,
            probeLarkCli,
            zalo,
          ),
      })
      return () => void dispose()
    }, 'aris-channels: /api/aris/channels')
  })

  ctx.effect(() => {
    void hub.start().catch((e: unknown) => ctx.logger('aris-channels').warn('khởi động kênh: %s', String(e)))
    void lark.start().catch((e: unknown) => ctx.logger('aris-channels').warn('khởi động Lark: %s', String(e)))
    void zalo.start().catch((e: unknown) => ctx.logger('aris-channels').warn('khởi động Zalo: %s', String(e)))
    return () => {
      hub.stop()
      lark.stop()
      zalo.stop()
    }
  }, 'aris-channels: hub')
}
