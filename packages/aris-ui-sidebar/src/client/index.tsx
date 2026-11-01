/**
 * Thanh bên aris, nạp thay `@deepseek-ai/dsh-client-ui-sidebar` (row `ui-sidebar`).
 * Đăng ký đúng slot `sidebar` cùng 7 chỗ cắm con và slot `shell.leading` như gói
 * gốc, để mọi plugin khác của dsh vẫn cắm vào được; phần trình bày theo canvas.
 */
import { arisNavigate, isUiV2, mountKitCss, registerPersonal } from '@aris/ui-kit/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { EN, NS, VI } from './locale.js'
import { LeadingControls, SidebarRoot } from './SidebarRoot.js'
import { SidebarV2 } from './SidebarV2.js'
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
    bind(ns: string): (key: string) => string
  }
  shortcuts: { catalog: unknown; register(command: Record<string, unknown>): () => void }
  sidebarRight: { mounted: unknown }
}

export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts', 'sidebarRight']

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
  // Chữ tiếng Việt có `{you}`: điền cách gọi người dùng theo hồ sơ xưng hô.
  ctx.effect(() => registerPersonal(ctx.locale, NS, 'vi', VI), 'aris-ui-sidebar: vi')

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

  // "Việc mới" không chỉ định dự án thì mở chat riêng với Aris (workspace mặc định, do
  // `@aris/home` tìm hoặc tạo), không rơi vào dự án đang mở. Lỗi thì như dsh: workspace hiện tại.
  let home: string | undefined
  async function startPrivate() {
    try {
      if (!home) {
        const res = await fetch(new URL('api/aris/home', document.baseURI), { method: 'POST' })
        const body = (await res.json()) as { workspaceId?: string; error?: string }
        if (!res.ok || !body.workspaceId) throw new Error(body.error ?? `HTTP ${res.status}`)
        home = body.workspaceId
      }
      workspace.startSession(home)
    } catch (err) {
      console.warn('aris-ui-sidebar: không mở được chat riêng, dùng workspace hiện tại', err)
      workspace.startSession()
    }
  }

  const injectProps = () => ({
    startSession: (workspaceId?: string) =>
      workspaceId ? workspace.startSession(workspaceId) : void startPrivate(),
    toggleSidebar: () => ctx.layout.toggleSidebar(),
    selectPanel: (id: string | null) => ctx.layout.selectPanel(id),
    openProject: (workspaceId: string) => void workspace.openWorkspace(workspaceId),
    openSession: (sessionId: string) => workspace.openSession(sessionId),
    hooks: { panels, shortcuts: ctx.shortcuts.catalog, mounted: ctx.sidebarRight.mounted },
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
          'sidebar.footer.action': list,
        },
        inject: injectProps,
      },
      // Công tắc "Giao diện mới (GĐ9)" đọc lúc nạp: đổi công tắc thì trang nạp lại.
      isUiV2() ? SidebarV2 : SidebarRoot,
    ),
  )
  // Một chỗ cài đặt duy nhất là bánh răng (trang Cài đặt aris, đã gồm các mục của dsh). Thanh bên
  // không khai báo `sidebar.settings` nên vỏ cài đặt của dsh không gắn vào: vỏ đó khai báo lại
  // `settings.section` mà trang Cài đặt aris đã giữ, lần nào cũng bị từ chối. Phím tắt mở cài đặt
  // của vỏ đó (⌘,) aris tự đăng ký, mở trang Cài đặt aris.
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () =>
      ctx.shortcuts.register({
        id: 'settings.open',
        label: () => t('settings'),
        aliases: ['settings', 'preferences', 'cài đặt'],
        defaults: {
          'desktop:macos': { code: 'Comma', modifiers: ['primary'] },
          'desktop:windows': { code: 'Comma', modifiers: ['primary'] },
          'desktop:linux': { code: 'Comma', modifiers: ['primary'] },
          'web:macos': { code: 'Comma', modifiers: ['primary', 'alt'] },
          'web:windows': { code: 'Comma', modifiers: ['primary', 'alt'] },
        },
        regions: ['page', 'editable', 'terminal'],
        resolve: ({ modal }: { modal: string | null }) =>
          modal !== null
            ? { status: 'blocked', reason: 'modal' }
            : { status: 'handled', run: () => arisNavigate('settings') },
      }),
    'aris-ui-sidebar: settings shortcut',
  )
  ctx.slots.inject('shell.leading', () =>
    ctx.slots.register({ name: 'shell.leading', locale: NS, inject: injectProps }, LeadingControls),
  )
  syncPanels()
}
