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
  office: { kind: 'page', nav: true, order: 5 },
  brain: { kind: 'page', nav: true, order: 6 },
  routine: { kind: 'page', nav: true, order: 7 },
  learn: { kind: 'page', nav: true, order: 8 },
  // `map` và `kanban` không còn trang riêng: `resolveRoute` đưa về Văn phòng.
  map: { kind: 'page' },
  kanban: { kind: 'page' },
  settings: { kind: 'page' },
  memory: { kind: 'page' },
  skills: { kind: 'page' },
  skill: { kind: 'page' },
  approvals: { kind: 'page' },
  runs: { kind: 'page' },
  bot: { kind: 'page' },
  owner: { kind: 'page' },
  'routine-new': { kind: 'page' },
  department: { kind: 'page' },
  'create-bot': { kind: 'dialog' },
  'create-project': { kind: 'dialog' },
  'clone-bot': { kind: 'dialog' },
  'mcp-add': { kind: 'dialog' },
  'mcp-import': { kind: 'dialog' },
  search: { kind: 'dialog' },
} as const satisfies Record<string, Route>

export type RouteId = keyof typeof ROUTES
export type Params = Readonly<Record<string, string>>

export const isRoute = (id: string): id is RouteId => id in ROUTES

/**
 * Đường cũ chuyển sang chỗ mới: Bản đồ đội thành Văn phòng, Kanban thành tab Kanban của Văn phòng (giữ tham số
 * dự án). Hộp duyệt, Ký ức, Thư viện skill vẫn có trang riêng nên không đổi.
 */
export function resolveRoute(to: RouteId, params: Params = {}): { to: RouteId; params: Params } {
  if (to === 'map') return { to: 'office', params }
  if (to === 'kanban') return { to: 'office', params: { ...params, tab: 'kanban' } }
  return { to, params }
}

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
