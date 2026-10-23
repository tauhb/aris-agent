/**
 * Cột phải aris: "Đội bot lúc này" chiếm trang bắt đầu của cột phải dsh (chỗ cắm
 * dạng chuỗi `sidebar.right.tab.guide`), các lối mở Tệp, Terminal… vẫn ở cuối trang.
 */
import { mountKitCss } from '@aris/ui-kit/react'
import { EN, NS, VI } from './locale.js'
import { CSS } from './styles.js'
import { TeamPane } from './TeamPane.js'

// Bối cảnh client của dsh; chỉ khai báo phần cột phải dùng.
interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: { register(ns: string, locale: string, dict: Record<string, string>): () => void }
  layout: { selectPanel(id: string | null): void }
  sidebarRightTabs: { guide(): readonly unknown[]; subscribe(listener: () => void): () => void }
  sidebarRight: { mounted: unknown }
}

export const inject = ['slots', 'locale', 'layout', 'sidebarRightTabs', 'sidebarRight']

/** Trang bản đồ đội (tạm là trang thử của `@aris/web-spike`; G5 thay bằng `@aris/ui-team-map`). */
const MAP_PANEL = 'aris-map'

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-team-pane'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => mountKitCss(), 'aris-ui-team-pane: kit styles')
  ctx.effect(injectStyle, 'aris-ui-team-pane: styles')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-team-pane: en')
  ctx.effect(() => ctx.locale.register(NS, 'vi', VI), 'aris-ui-team-pane: vi')

  const guideEntries = {
    subscribe: (listener: () => void) => ctx.sidebarRightTabs.subscribe(listener),
    getSnapshot: () => ctx.sidebarRightTabs.guide(),
  }
  ctx.slots.inject('sidebar.right.tab.guide', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.tab.guide',
        id: 'aris-team',
        locale: NS,
        // Luôn nhận: trang bắt đầu của cột phải là "Đội bot lúc này".
        select: () => ({}),
        inject: () => ({
          // `mounted`: phiên đang hiện, để biết phiên thuộc dự án nào (màn 1.4).
          hooks: { guideEntries, mounted: ctx.sidebarRight.mounted },
          openMap: () => ctx.layout.selectPanel(MAP_PANEL),
        }),
      },
      TeamPane,
    ),
  )
}
