/**
 * Thanh bên aris, nạp thay `@deepseek-ai/dsh-client-ui-sidebar` (row `ui-sidebar`).
 * Đăng ký đúng slot `sidebar` cùng 7 chỗ cắm con và slot `shell.leading` như gói
 * gốc, để mọi plugin khác của dsh vẫn cắm vào được; phần trình bày theo canvas.
 */
import { mountKitCss } from '@aris/ui-kit/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { EN, NS, VI } from './locale.js'
import { LeadingControls, SidebarRoot } from './SidebarRoot.js'
import { CSS } from './styles.js'
import type { PanelEntry } from './types.js'

// Bối cảnh client của dsh; chỉ khai báo phần thanh bên dùng.
interface ClientContext {
  get(name: string): unknown
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
    subscribe(name: string, fn: () => void): () => void
    entriesOfSlot(name: string): { options: { id: string; order?: number; label?: unknown } }[]
  }
  layout: { toggleSidebar(): void; selectPanel(id: string | null): void }
  locale: {
    register(ns: string, locale: string, dict: Record<string, string>): () => void
    subscribe(fn: () => void): () => void
  }
  shortcuts: { catalog: unknown }
}

export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']

// Phông do theme aris (`@aris/ui-theme`) nạp cho cả app.
function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-sidebar'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  const workspace = ctx.get('uiWorkspace') as {
    startSession(workspaceId?: string): void
    openWorkspace(workspaceId: string): Promise<void>
    openSession(sessionId: string): void
  }
  ctx.effect(() => mountKitCss(), 'aris-ui-sidebar: kit styles')
  ctx.effect(injectStyle, 'aris-ui-sidebar: styles')
  // Chữ của aris theo ngôn ngữ chọn trong Cài đặt; tiếng Trung lùi về tiếng Anh.
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-sidebar: en')
  ctx.effect(() => ctx.locale.register(NS, 'vi', VI), 'aris-ui-sidebar: vi')

  const panels = createSnapshotStore<PanelEntry[]>([])
  const syncPanels = () => {
    const next = ctx.slots
      .entriesOfSlot('sidebar.panellist')
      .map(({ options }) => ({
        id: options.id,
        order: options.order ?? 0,
        label: resolveSlotLabel(options.label as Parameters<typeof resolveSlotLabel>[0]) ?? options.id,
      }))
      .sort((a, b) => a.order - b.order)
    const prev = panels.getSnapshot()
    const same =
      prev.length === next.length &&
      prev.every((p, i) => p.id === next[i]!.id && p.order === next[i]!.order && p.label === next[i]!.label)
    if (!same) panels.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'aris-ui-sidebar: panel entries')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'aris-ui-sidebar: panel labels')

  const injectProps = () => ({
    startSession: (workspaceId?: string) => workspace.startSession(workspaceId),
    toggleSidebar: () => ctx.layout.toggleSidebar(),
    selectPanel: (id: string | null) => ctx.layout.selectPanel(id),
    openProject: (workspaceId: string) => void workspace.openWorkspace(workspaceId),
    openSession: (sessionId: string) => workspace.openSession(sessionId),
    hooks: { panels, shortcuts: ctx.shortcuts.catalog },
  })

  const single = { kind: 'single', scope: 'root' }
  const list = { kind: 'list', scope: 'root' }
  ctx.slots.inject('sidebar', () =>
    ctx.slots.register(
      {
        name: 'sidebar',
        locale: NS,
        children: {
          'sidebar.brand.mark': single,
          'sidebar.brand.name': single,
          'sidebar.toggle.badge': single,
          'sidebar.panellist': list,
          'sidebar.workspaces': single,
          'sidebar.settings': single,
          'sidebar.footer.action': list,
        },
        inject: injectProps,
      },
      SidebarRoot,
    ),
  )
  ctx.slots.inject('shell.leading', () =>
    ctx.slots.register({ name: 'shell.leading', locale: NS, inject: injectProps }, LeadingControls),
  )
  syncPanels()
}
