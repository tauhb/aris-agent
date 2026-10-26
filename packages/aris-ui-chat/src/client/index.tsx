/**
 * Khung chat aris: cắm vào chỗ cắm hội thoại, ô nhập và công cụ của dsh, không thay
 * gói nào (trừ nhãn model "1017" tạm của DeepSeek, row này tắt trong patch).
 */
import { getMascot } from '@aris/ui-kit'
import { arisNavigate, currentTeam, mountKitCss, refreshTeam, registerPersonal } from '@aris/ui-kit/react'
import { DispatchBranches, HeroMark, ModelLabel, SubagentBranch, TriggerButtons } from './Chat.js'
import { EN, NS, VI } from './locale.js'
import { RoomDock, RoomLead, RoomRound, RoomSay } from './Room.js'
import { ApprovalDock } from './External.js'
import { roomLeadDefinition, roomSayDefinition } from './room-data.js'
import { watchMentions, type MentionBot } from './mentions-dom.js'
import { BotReport, HandoffTurn, TurnHead, UserMention } from './Speaker.js'
import { botTriggerSource } from './bot-source.js'
import { botReportDefinition, findMention, handoffDefinition, turnHeadDefinition } from './who-data.js'
import { CSS } from './styles.js'
import { BrainPicker, BrainReadCall, BrainSearchCall, UserPage, brainTriggerSource } from './Brain.js'
import { MediaCall, MediaShow, mediaDefinition } from './Media.js'
import { brainPages, cachedPages, LINK } from './brain-data.js'
import { openPeek, watchPageLinks } from './brain-dom.js'

interface SessionInput {
  focus(): void
  paste(text: string): void
}

// Bối cảnh client của dsh; chỉ khai báo phần khung chat dùng.
interface ClientContext {
  get(name: string): unknown
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: { register(ns: string, locale: string, dict: Record<string, string>): () => void }
  uiConversation: {
    events: { register(definition: unknown): () => void }
    userText: { register(rule: unknown): () => void }
  }
  sessions: {
    list: unknown
    scope(sessionId: string): { get(name: string): unknown } | undefined
  }
}

export const inject = [
  'slots',
  'locale',
  'sessions',
  'uiWorkspace',
  'uiConversation',
  'sidebarRight',
  'inputTriggers',
]

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-chat'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  const workspace = ctx.get('uiWorkspace') as { openSession(sessionId: string): void }
  ctx.effect(() => mountKitCss(), 'aris-ui-chat: kit styles')
  ctx.effect(injectStyle, 'aris-ui-chat: styles')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-chat: en')
  // Chữ tiếng Việt có `{you}`: điền cách gọi người dùng theo hồ sơ xưng hô.
  ctx.effect(() => registerPersonal(ctx.locale, NS, 'vi', VI), 'aris-ui-chat: vi')

  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.brand.mark',
        locale: NS,
        // Phiên đang hiện ở vùng chính, để lấy linh vật của bot phiên đó.
        inject: () => ({ hooks: { mounted: (ctx.get('sidebarRight') as { mounted: unknown }).mounted } }),
      },
      HeroMark,
    ),
  )

  // Ô nhập của phiên: chèn "/" hoặc "@" tại con trỏ để mở đúng menu lệnh / gọi của dsh.
  const inputOf = (sessionId: string): SessionInput | undefined => {
    const actx = ctx.sessions.scope(sessionId)
    const conversation = actx?.get('conversation') as { input: { for(a: unknown): SessionInput } } | undefined
    return actx && conversation?.input.for(actx)
  }
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'aris-triggers',
        order: 100,
        locale: NS,
        inject: (sessionId: string) => ({
          insert: (text: string) => {
            const input = inputOf(sessionId)
            input?.focus()
            input?.paste(text)
          },
        }),
      },
      TriggerButtons,
    ),
  )

  ctx.slots.inject('conversation.input.model.label', () =>
    ctx.slots.register({ name: 'conversation.input.model.label', locale: NS }, ModelLabel),
  )

  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'subagent',
        // dsh đã có hiển thị chung cho `subagent` ở mức 0; mức thấp hơn được vẽ thay.
        priority: -1,
        locale: NS,
        inject: () => ({
          hooks: { sessions: ctx.sessions.list },
          openSession: (sessionId: string) => workspace.openSession(sessionId),
        }),
      },
      SubagentBranch,
    ),
  )

  // Commander giao việc (`giao_viec` của @aris/commander): mỗi bot một nhánh.
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'giao_viec',
        priority: -1,
        locale: NS,
        inject: () => ({
          hooks: { sessions: ctx.sessions.list },
          openSession: (sessionId: string) => workspace.openSession(sessionId),
        }),
      },
      DispatchBranches,
    ),
  )

  // Phòng nhóm của dự án (`moi_noi` của @aris/commander): tin của các bot trong một vòng.
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'moi_noi', priority: -1, locale: NS }, RoomRound),
  )

  // Mỗi tin trong phòng là một dòng riêng của bot (không gập vào lượt của Aris).
  ctx.uiConversation.events.register(roomSayDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'aris-room-say', locale: NS }, RoomSay),
  )
  // Đầu tin "Aris · Điều phối" trước câu trả lời của Aris sau một vòng, tách khỏi tin của bot.
  ctx.uiConversation.events.register(roomLeadDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'aris-room-lead', locale: NS }, RoomLead),
  )

  // Ai đang nói (bản vẽ 1.7): đầu tin mỗi lượt theo bot của phiên.
  ctx.uiConversation.events.register(turnHeadDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: 'aris-turn-head',
        locale: NS,
        inject: (sessionId: string) => ({ sessionId }),
      },
      TurnHead,
    ),
  )
  // Kết quả bot gửi về phiên (nguồn `aris-bot`): thẻ của bot thay cho dòng "đánh thức lượt".
  ctx.uiConversation.events.register(botReportDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'aris-bot-report', locale: NS }, BotReport),
  )

  // Chuyển giao (bản vẽ 1.8): câu trả lời của bot đích thành lượt riêng của bot đó.
  ctx.uiConversation.events.register(handoffDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: 'aris-handoff',
        locale: NS,
        inject: () => ({ openSession: (sessionId: string) => workspace.openSession(sessionId) }),
      },
      HandoffTurn,
    ),
  )

  // `@tên` của bot trong đội: tên thành viên trong tin của người dùng (quy tắc chữ của dsh)…
  const teamBots = (): ReadonlyMap<string, MentionBot> =>
    new Map(
      currentTeam().bots.map((b) => [
        b.handle.toLowerCase(),
        {
          id: b.id,
          handle: b.handle,
          name: b.name,
          mascot: b.mascot,
          accessory: b.accessory,
          color: getMascot(b.mascot)?.color ?? '#64748B',
        },
      ]),
    )
  ctx.effect(() => {
    // Quy tắc nhớ kết quả theo chữ, nên đăng ký lại khi đội đổi tên gọi.
    let handles = ''
    let off: (() => void) | undefined
    const sync = () => {
      const now = new Set(teamBots().keys())
      const key = [...now].sort().join(',')
      if (key === handles) return
      handles = key
      off?.()
      off = ctx.uiConversation.userText.register({
        id: 'aris-bot',
        order: 20,
        match: (text: string, from: number) => {
          const hit = findMention(text, from, now)
          return hit && { id: 'aris-bot', start: hit.start, end: hit.end, data: { handle: hit.handle } }
        },
      })
    }
    void refreshTeam().then(sync, () => undefined)
    const timer = setInterval(sync, 30_000)
    return () => {
      clearInterval(timer)
      off?.()
    }
  }, 'aris-ui-chat: user mentions')
  ctx.slots.inject('conversation.user.text.node', () =>
    ctx.slots.register({ name: 'conversation.user.text.node', key: 'aris-bot', locale: NS }, UserMention),
  )
  // Menu `@` của ô nhập: nhóm "Đội bot" đứng đầu (linh vật, tên, chức danh); chọn thì chèn `@tên_gọi `.
  ctx.effect(() => {
    const dict = () => (document.documentElement.lang.startsWith('vi') ? VI : EN)
    const triggers = ctx.get('inputTriggers') as { registerSource(src: unknown): () => void }
    return triggers.registerSource(
      botTriggerSource({
        section: () => dict()['who.section'],
        external: (agent) =>
          dict()['who.external'].replace('{agent}', dict()[`ext.agent.${agent}` as keyof typeof EN] ?? agent),
      }),
    )
  }, 'aris-ui-chat: @ bots')
  // …và trong câu trả lời của bot (Markdown của dsh không có chỗ cắm cho chữ thường).
  ctx.effect(
    () =>
      watchMentions(
        teamBots,
        (b) => b.name,
        (b) => arisNavigate('bot', { id: b.id }),
      ),
    'aris-ui-chat: reply mentions',
  )

  // --- Bộ não trong khung chat (giai đoạn 5, bản vẽ 5.7) ----------------------------------------
  const dict = () => (document.documentElement.lang.startsWith('vi') ? VI : EN)
  const spaceLabel = (s: string) => dict()[`brain.space.${s}` as keyof typeof EN] ?? s
  // `[[...]]` trong tin của người dùng thành nhãn trang…
  ctx.uiConversation.userText.register({
    id: 'aris-page',
    order: 30,
    match: (text: string, from: number) => {
      const re = new RegExp(LINK.source, 'g')
      re.lastIndex = from
      const m = re.exec(text)
      if (!m) return undefined
      return {
        id: 'aris-page',
        start: m.index,
        end: m.index + m[0].length,
        data: { ref: m[1]!.trim(), shown: m[2]?.trim() ?? '' },
      }
    },
  })
  ctx.slots.inject('conversation.user.text.node', () =>
    ctx.slots.register({ name: 'conversation.user.text.node', key: 'aris-page', locale: NS }, UserPage),
  )
  // …và trong câu trả lời của bot; bấm nhãn mở thẻ xem nhanh, "Mở ở Brain" mở trang ở 5.1.
  ctx.effect(
    () =>
      watchPageLinks(cachedPages, brainPages, (el, page) =>
        openPeek(
          el,
          page,
          {
            open: dict()['brain.open'],
            missing: dict()['brain.missing'],
            backlinks: (n) => dict()['brain.backlinks'].replace('{n}', String(n)),
            layer: (l) => dict()[`brain.layer.${l}` as keyof typeof EN] ?? l,
            space: spaceLabel,
          },
          (p) => arisNavigate('brain', { view: 'notes', space: p.space, path: p.path }),
        ),
      ),
    'aris-ui-chat: brain links',
  )
  ctx.effect(() => {
    void brainPages()
    return () => undefined
  }, 'aris-ui-chat: brain pages')
  // Dòng công cụ "Tra bộ não", "Đọc trang".
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      { name: 'tool.call.toolview', key: 'brain_search', priority: -1, locale: NS },
      BrainSearchCall,
    ),
  )
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      { name: 'tool.call.toolview', key: 'brain_read', priority: -1, locale: NS },
      BrainReadCall,
    ),
  )
  // Ảnh, video bot tạo (đợt 5c, bản vẽ 1.9): dòng riêng của lượt, ngoài phần gọi công cụ đã gập.
  ctx.uiConversation.events.register(mediaDefinition)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'aris-media', locale: NS }, MediaShow),
  )
  const ImageCall = (p: Parameters<typeof MediaCall>[0]) => <MediaCall {...p} kind="image" />
  const VideoCall = (p: Parameters<typeof MediaCall>[0]) => <MediaCall {...p} kind="video" />
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'tao_anh', priority: -1, locale: NS }, ImageCall),
  )
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'tao_video', priority: -1, locale: NS }, VideoCall),
  )
  // Nút "Từ Brain" ở ô nhập; nhóm "Trang bộ não" trong menu `@`.
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'aris-brain',
        order: 110,
        locale: NS,
        inject: (sessionId: string) => ({
          sessionId,
          insert: (text: string) => {
            const input = inputOf(sessionId)
            input?.focus()
            input?.paste(text)
          },
        }),
      },
      BrainPicker,
    ),
  )
  ctx.effect(() => {
    const triggers = ctx.get('inputTriggers') as { registerSource(src: unknown): () => void }
    return triggers.registerSource(
      brainTriggerSource({ section: () => dict()['brain.section'], place: (p) => spaceLabel(p.space) }),
    )
  }, 'aris-ui-chat: @ brain pages')

  // Thanh phòng trên ô nhập ở phiên chính của dự án: vòng, số tin, Dừng phòng.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'aris-room',
        order: 20,
        locale: NS,
        inject: (sessionId: string) => ({
          sessionId,
          insert: (text: string) => {
            const input = inputOf(sessionId)
            input?.focus()
            input?.paste(text)
          },
        }),
      },
      RoomDock,
    ),
  )

  // Bot ngoài xin quyền: thanh duyệt trên ô nhập của phiên giao việc (luôn hiện).
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'aris-approvals',
        order: 15,
        locale: NS,
        inject: (sessionId: string) => ({ sessionId }),
      },
      ApprovalDock,
    ),
  )
}
