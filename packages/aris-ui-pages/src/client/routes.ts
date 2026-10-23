/**
 * Bảng định tuyến các trang và hộp thoại aris theo sơ đồ điều hướng của canvas.
 * Trang chiếm vùng chính (`main`, mã panel `aris-*`); hộp thoại phủ lên app.
 */
export type RouteKind = 'page' | 'dialog'

export interface Route {
  kind: RouteKind
  /** Có mục riêng trên thanh bên. */
  nav?: boolean
  /** Thứ tự mục thanh bên. */
  order?: number
}

export const ROUTES = {
  map: { kind: 'page', nav: true, order: 5 },
  brain: { kind: 'page', nav: true, order: 6 },
  routine: { kind: 'page', nav: true, order: 7 },
  kanban: { kind: 'page', nav: true, order: 8 },
  settings: { kind: 'page' },
  memory: { kind: 'page' },
  skills: { kind: 'page' },
  skill: { kind: 'page' },
  approvals: { kind: 'page' },
  runs: { kind: 'page' },
  bot: { kind: 'page' },
  owner: { kind: 'page' },
  'routine-new': { kind: 'page' },
  'create-bot': { kind: 'dialog' },
  'create-room': { kind: 'dialog' },
  'clone-bot': { kind: 'dialog' },
  search: { kind: 'dialog' },
} as const satisfies Record<string, Route>

export type RouteId = keyof typeof ROUTES
export type Params = Readonly<Record<string, string>>

export const isRoute = (id: string): id is RouteId => id in ROUTES

/** Mã panel dsh của một trang aris. */
export const panelId = (id: RouteId) => `aris-${id}`

/** Trạng thái điều hướng: tham số của từng trang và hộp thoại đang mở. */
export interface NavState {
  params: Readonly<Partial<Record<RouteId, Params>>>
  dialog: { id: RouteId; params: Params } | null
}

/** Kho trạng thái nhỏ theo chuẩn `useSyncExternalStore` (getSnapshot/subscribe). */
export function createNavStore(initial: NavState = { params: {}, dialog: null }) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: NavState) {
      state = next
      for (const l of listeners) l()
    },
  }
}

export type NavStore = ReturnType<typeof createNavStore>

/** Áp một yêu cầu điều hướng: trang thì ghi tham số và trả mã panel cần mở; hộp thoại thì mở hộp. */
export function navigate(store: NavStore, to: RouteId, params: Params = {}): string | undefined {
  const state = store.getSnapshot()
  if (ROUTES[to].kind === 'dialog') {
    store.set({ ...state, dialog: { id: to, params } })
    return undefined
  }
  store.set({ params: { ...state.params, [to]: params }, dialog: null })
  return panelId(to)
}
