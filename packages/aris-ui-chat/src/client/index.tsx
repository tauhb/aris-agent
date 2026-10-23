/**
 * Khung chat aris: cắm vào chỗ cắm hội thoại, ô nhập và công cụ của dsh, không thay
 * gói nào (trừ nhãn model "1017" tạm của DeepSeek, row này tắt trong patch).
 */
import { mountKitCss } from '@aris/ui-kit/react'
import { HeroMark, ModelLabel, SubagentBranch, TriggerButtons } from './Chat.js'
import { EN, NS, VI } from './locale.js'
import { CSS } from './styles.js'

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
  sessions: {
    list: unknown
    scope(sessionId: string): { get(name: string): unknown } | undefined
  }
}

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace']

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
  ctx.effect(() => ctx.locale.register(NS, 'vi', VI), 'aris-ui-chat: vi')

  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark', locale: NS }, HeroMark),
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
}
