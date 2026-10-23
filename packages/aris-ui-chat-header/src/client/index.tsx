/**
 * Đầu khung chat aris, cắm vào ba slot đầu khung mà
 * `@deepseek-ai/dsh-client-ui-conversation` khai báo; không thay thế gói nào của dsh.
 */
import { NewSessionButton, BotIdentity, SessionSwitcher } from './Header.js'
import { EN, NS, VI } from './locale.js'
import { CSS } from './styles.js'

// Bối cảnh client của dsh; chỉ khai báo phần đầu khung dùng.
interface ClientContext {
  get(name: string): unknown
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: { register(ns: string, locale: string, dict: Record<string, string>): () => void }
  shortcuts: { catalog: unknown }
}

export const inject = ['slots', 'uiWorkspace', 'locale', 'shortcuts']

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
  // Chữ của aris theo ngôn ngữ chọn trong Cài đặt; tiếng Trung lùi về tiếng Anh.
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-chat-header: en')
  ctx.effect(() => ctx.locale.register(NS, 'vi', VI), 'aris-ui-chat-header: vi')

  const actions = () => ({
    openSession: (sessionId: string) => workspace.openSession(sessionId),
    startSession: () => workspace.startSession(),
    hooks: { shortcuts: ctx.shortcuts.catalog },
  })

  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register({ name: 'conversation.header.leading', locale: NS }, BotIdentity),
  )
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'aris-session-switcher',
        order: -1000,
        locale: NS,
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
        locale: NS,
        inject: actions,
      },
      NewSessionButton,
    ),
  )
}
