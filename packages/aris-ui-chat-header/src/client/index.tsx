/**
 * Đầu khung chat aris, cắm vào ba slot đầu khung mà
 * `@deepseek-ai/dsh-client-ui-conversation` khai báo; không thay thế gói nào của dsh.
 */
import { mountKitCss, registerPersonal } from '@aris/ui-kit/react'
import { Leading, NewSessionButton, SessionSwitcher } from './Header.js'
import { EN, NS, VI } from './locale.js'
import { MoreMenu, type LogDownloadState } from './MoreMenu.js'
import { CSS } from './styles.js'

// Bối cảnh client của dsh; chỉ khai báo phần đầu khung dùng.
interface ClientContext {
  get(name: string): unknown
  inject(deps: string[], fn: (scope: ClientContext) => void): void
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: { register(ns: string, locale: string, dict: Record<string, string>): () => void }
  shortcuts: { catalog: unknown }
  sidebarRight: { mounted: unknown }
}

export const inject = ['slots', 'uiWorkspace', 'locale', 'shortcuts', 'sidebarRight']

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-chat-header'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  const workspace = ctx.get('uiWorkspace') as { openSession(target: string): void; startSession(): void }
  ctx.effect(() => mountKitCss(), 'aris-ui-chat-header: kit styles')
  ctx.effect(injectStyle, 'aris-ui-chat-header: styles')
  // Chữ của aris theo ngôn ngữ chọn trong Cài đặt; tiếng Trung lùi về tiếng Anh.
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-chat-header: en')
  // Chữ tiếng Việt có `{you}`: điền cách gọi người dùng theo hồ sơ xưng hô.
  ctx.effect(() => registerPersonal(ctx.locale, NS, 'vi', VI), 'aris-ui-chat-header: vi')

  const actions = () => ({
    openSession: (sessionId: string) => workspace.openSession(sessionId),
    startSession: () => workspace.startSession(),
    hooks: { shortcuts: ctx.shortcuts.catalog },
  })

  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register(
      {
        name: 'conversation.header.leading',
        locale: NS,
        // Phiên đang hiện ở vùng chính, để biết phiên thuộc dự án nào.
        inject: () => ({ hooks: { mounted: ctx.sidebarRight.mounted } }),
      },
      Leading,
    ),
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

  // Nút "…": thay menu của dsh-session-log-export (bỏ "Góp ý", thêm "Mở hồ sơ").
  ctx.inject(['sessionLogDownload'], (scope) => {
    const logs = scope.get('sessionLogDownload') as {
      store: unknown
      download(sessionId: string): Promise<void>
      dismiss(sessionId: string): void
    }
    scope.slots.inject('conversation.session.header.utilities', () =>
      scope.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'session-log-download',
          priority: -1,
          locale: NS,
          inject: () => ({
            hooks: { logDownload: logs.store as LogDownloadState },
            download: (sessionId: string) => void logs.download(sessionId),
            dismiss: (sessionId: string) => logs.dismiss(sessionId),
          }),
        },
        MoreMenu,
      ),
    )
  })
}
