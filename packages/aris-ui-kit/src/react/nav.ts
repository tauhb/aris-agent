/**
 * Điều hướng giữa các gói aris trên cùng một trang: gói nào cũng phát được yêu cầu
 * "mở trang/hộp thoại X" mà không phụ thuộc gói đang giữ trang đó (`@aris/ui-pages`
 * nghe sự kiện và mở). Mỗi gói client đóng gói riêng bản ui-kit, nên dùng sự kiện
 * DOM thay cho biến dùng chung.
 */
export const NAV_EVENT = 'aris:navigate'

export interface NavRequest {
  /** Mã trang hoặc hộp thoại, ví dụ `settings`, `bot`, `create-bot`. */
  to: string
  params?: Readonly<Record<string, string>> | undefined
}

export function arisNavigate(
  to: string,
  params?: Record<string, string>,
  target: EventTarget = document,
): void {
  target.dispatchEvent(new CustomEvent<NavRequest>(NAV_EVENT, { detail: { to, params } }))
}

/** Nghe yêu cầu điều hướng; trả về hàm gỡ. */
export function onArisNavigate(
  handler: (req: NavRequest) => void,
  target: EventTarget = document,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<NavRequest>).detail)
  target.addEventListener(NAV_EVENT, listener)
  return () => target.removeEventListener(NAV_EVENT, listener)
}

/** Sự kiện báo trang aris vừa mở (để thanh bên tô bot đang xem, như canvas). */
export const ROUTE_EVENT = 'aris:route'

export function announceRoute(
  to: string,
  params?: Record<string, string>,
  target: EventTarget = document,
): void {
  target.dispatchEvent(new CustomEvent<NavRequest>(ROUTE_EVENT, { detail: { to, params } }))
}

/** Nghe trang aris vừa mở; trả về hàm gỡ. */
export function onArisRoute(handler: (req: NavRequest) => void, target: EventTarget = document): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<NavRequest>).detail)
  target.addEventListener(ROUTE_EVENT, listener)
  return () => target.removeEventListener(ROUTE_EVENT, listener)
}
