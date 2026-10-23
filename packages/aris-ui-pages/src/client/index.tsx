/**
 * Các trang và hộp thoại aris: mỗi trang là một panel `aris-*` trong vùng chính của
 * dsh (trang có mục thanh bên thì đăng ký thêm `sidebar.panellist`), hộp thoại cắm
 * vào lớp phủ `shell.overlay`. Gói nào cũng mở được trang qua `arisNavigate`.
 */
import { mountKitCss, onArisNavigate } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import { EN, NS, VI } from './locale.js'
import type { PageNav, PageProps, Translate } from './page.js'
import {
  ROUTES,
  createNavStore,
  isRoute,
  navigate,
  panelId,
  type NavState,
  type Params,
  type RouteId,
} from './routes.js'
import { Approvals } from './mind/Approvals.js'
import { Memory } from './mind/Memory.js'
import { Runs } from './mind/Runs.js'
import { Skill } from './mind/Skill.js'
import { Skills } from './mind/Skills.js'
import { SettingsPage } from './settings/SettingsPage.js'
import { BotProfile } from './team/Bot.js'
import { CloneBot } from './team/CloneBot.js'
import { CreateBot } from './team/CreateBot.js'
import { CreateRoom, type RoomActions } from './team/CreateRoom.js'
import { TeamMap } from './team/Map.js'
import { OwnerProfile } from './team/Owner.js'
import { Search } from './team/Search.js'
import { NavIcon } from './icons.js'
import { CSS } from './styles.js'

// Bối cảnh client của dsh; chỉ khai báo phần các trang dùng.
interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: { register(ns: string, locale: string, dict: Record<string, string>): () => void }
  layout: { selectPanel(id: string | null): void }
  shortcuts: {
    invoke(id: string, context: { region: 'page'; modal: null; target: null; source: 'menu' }): void
  }
  workspaces: { create(input: { path: string }): Promise<{ workspaceId: string }> }
  get(name: string): unknown
}

export const inject = ['slots', 'locale', 'layout', 'shortcuts', 'workspaces', 'uiWorkspace']

/** Trang đã dựng; trang chưa có ở đây thì chưa đăng ký. */
const PAGES: Partial<Record<RouteId, ComponentType<PageProps>>> = {
  settings: SettingsPage,
  memory: Memory,
  skills: Skills,
  skill: Skill,
  approvals: Approvals,
  runs: Runs,
  map: TeamMap,
  bot: BotProfile,
  owner: OwnerProfile,
}

/** Hộp thoại đã dựng. */
const DIALOGS: Partial<Record<RouteId, ComponentType<PageProps & { rooms: RoomActions }>>> = {
  'create-bot': CreateBot,
  'clone-bot': CloneBot,
  'create-room': CreateRoom,
  search: Search,
}

const EMPTY: Params = {}

type Selector<T> = <R>(select: (value: T) => R) => R

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-pages'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => mountKitCss(), 'aris-ui-pages: kit styles')
  ctx.effect(injectStyle, 'aris-ui-pages: styles')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-pages: en')
  ctx.effect(() => ctx.locale.register(NS, 'vi', VI), 'aris-ui-pages: vi')

  const store = createNavStore()
  const nav: PageNav = {
    go(to, params) {
      if (!PAGES[to] && !DIALOGS[to]) return
      const panel = navigate(store, to, params)
      if (panel) ctx.layout.selectPanel(panel)
    },
    openPanel: (id) => ctx.layout.selectPanel(id),
    openDshSettings: () =>
      ctx.shortcuts.invoke('settings.open', { region: 'page', modal: null, target: null, source: 'menu' }),
    close: () => store.set({ ...store.getSnapshot(), dialog: null }),
  }
  ctx.effect(
    () =>
      onArisNavigate(({ to, params }) => {
        if (isRoute(to)) nav.go(to, params)
      }),
    'aris-ui-pages: navigation',
  )

  // Phòng = workspace của dsh: chọn thư mục, tạo workspace rồi mở nó.
  const workspace = ctx.get('uiWorkspace') as {
    pickDirectory(): Promise<string | null>
    openWorkspace(workspaceId: string): Promise<void>
  }
  const rooms: RoomActions = {
    pickDirectory: () => workspace.pickDirectory(),
    async createRoom(path) {
      const created = await ctx.workspaces.create({ path })
      await workspace.openWorkspace(created.workspaceId)
    },
  }

  // Hộp thoại đang mở vẽ trên lớp phủ của app.
  function DialogHost({ t, useNav }: { t: Translate; useNav: Selector<NavState> }) {
    const dialog = useNav((s) => s.dialog)
    const Dialog = dialog && DIALOGS[dialog.id]
    if (!dialog || !Dialog) return null
    return (
      <div className="aris">
        <Dialog t={t} nav={nav} params={dialog.params} rooms={rooms} />
      </div>
    )
  }
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'aris-dialogs', locale: NS, inject: () => ({ hooks: { nav: store } }) },
      DialogHost,
    ),
  )

  // ⌘K vẫn là bộ tìm phiên của dsh (`session.search`, có dữ liệu thật); hộp "Tìm trong
  // mọi phiên" của aris mở từ nút tìm trên thanh bên, nhận ⌘K khi nối dữ liệu ở giai đoạn 1.

  for (const [id, Page] of Object.entries(PAGES) as [RouteId, ComponentType<PageProps>][]) {
    if (ROUTES[id].kind !== 'page') continue
    function Host({ t, useNav }: { t: Translate; useNav: Selector<NavState> }) {
      const params = useNav((s) => s.params[id] ?? EMPTY)
      return (
        <div className="aris ap-root">
          <Page t={t} nav={nav} params={params} />
        </div>
      )
    }
    const route = ROUTES[id] as { nav?: boolean; order?: number }
    if (route.nav)
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: panelId(id), order: route.order, label: VI[`nav.${id}`] ?? id },
          ({ size, active }: { size: number; active: boolean }) => (
            <NavIcon id={id} size={size} active={active} />
          ),
        ),
      )
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        { name: 'main', key: panelId(id), locale: NS, inject: () => ({ hooks: { nav: store } }) },
        Host,
      ),
    )
  }
}
