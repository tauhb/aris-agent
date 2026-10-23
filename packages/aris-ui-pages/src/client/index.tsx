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
import { SettingsPage } from './settings/SettingsPage.js'
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
}

export const inject = ['slots', 'locale', 'layout', 'shortcuts']

/** Trang đã dựng; trang chưa có ở đây thì chưa đăng ký. */
const PAGES: Partial<Record<RouteId, ComponentType<PageProps>>> = {
  settings: SettingsPage,
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
      if (!PAGES[to]) return
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
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        { name: 'main', key: panelId(id), locale: NS, inject: () => ({ hooks: { nav: store } }) },
        Host,
      ),
    )
  }
}
