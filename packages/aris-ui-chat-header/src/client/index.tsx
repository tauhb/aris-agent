/**
 * Đầu khung chat aris, cắm vào ba slot đầu khung mà
 * `@deepseek-ai/dsh-client-ui-conversation` khai báo; không thay thế gói nào của dsh.
 */
import { NewSessionButton, BotIdentity, SessionSwitcher } from './Header.js'
import { CSS } from './styles.js'

// Bối cảnh client của dsh; chỉ khai báo phần đầu khung dùng.
interface ClientContext {
  get(name: string): unknown
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  shortcuts: { catalog: unknown }
}

export const inject = ['slots', 'uiWorkspace', 'shortcuts']

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-chat-header'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  const workspace = ctx.get('uiWorkspace') as { openSession(target: string): void; startSession(): void }
  ctx.effect(injectStyle, 'aris-ui-chat-header: styles')

  const actions = () => ({
    openSession: (sessionId: string) => workspace.openSession(sessionId),
    startSession: () => workspace.startSession(),
    hooks: { shortcuts: ctx.shortcuts.catalog },
  })

  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register({ name: 'conversation.header.leading' }, BotIdentity),
  )
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'aris-session-switcher',
        order: -1000,
        inject: actions,
      },
      SessionSwitcher,
    ),
  )
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'aris-new-session',
        order: -1000,
        inject: actions,
      },
      NewSessionButton,
    ),
  )
}
