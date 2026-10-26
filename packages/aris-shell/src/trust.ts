/**
 * Phiên không tin cậy (đợt 7f, S5, S6, S9): phiên không phải chat trực tiếp của người dùng, nên chữ trong đó có thể
 * đến từ nguồn ngoài (trang web, email, người lạ trên Telegram, ứng dụng khác) và không được coi là lời người dùng.
 * Một chỗ nhận diện cho ký ức, bộ não và hàng rào; mẫu của `isBackground` ở `@aris/guard`.
 */

/** Tra dịch vụ theo tên (`ctx.get`). */
export type ServiceGetter = (name: string) => unknown

export interface SessionLike {
  id: string
  header?: { parentSession?: unknown } | undefined
}

/** Loại phiên không tin cậy. */
export type UntrustedKind =
  | 'tac-nhan-con'
  | 'routine'
  | 'thu-thu'
  | 'kiem-thu-skill'
  | 'khach-acp'
  | 'viec-duoc-giao'
  | 'telegram-khong-phai-chu'

const flag = (get: ServiceGetter, svc: string, fn: string, id: string) =>
  (get(svc) as Record<string, ((id: string) => boolean) | undefined> | undefined)?.[fn]?.(id) === true

/**
 * Phiên có phải không tin cậy không; trả loại phiên, hay undefined khi là chat trực tiếp của người dùng
 * (hoặc không có phiên).
 */
export function untrustedKind(
  get: ServiceGetter,
  session: SessionLike | undefined,
): UntrustedKind | undefined {
  if (!session) return undefined
  const id = session.id
  if (session.header?.parentSession) return 'tac-nhan-con'
  if (flag(get, 'arisRoutine', 'isRoutine', id)) return 'routine'
  if (flag(get, 'arisBrain', 'isLibrarian', id)) return 'thu-thu'
  if (flag(get, 'arisSkills', 'isEval', id)) return 'kiem-thu-skill'
  if (flag(get, 'arisAcp', 'isGuest', id)) return 'khach-acp'
  const bots = get('arisBots') as { store?: { tagOf?(id: string): { via?: string } | undefined } } | undefined
  const via = bots?.store?.tagOf?.(id)?.via
  if (via === 'team' || via === 'dispatch') return 'viec-duoc-giao'
  if (flag(get, 'arisChannels', 'restricted', id)) return 'telegram-khong-phai-chu'
  return undefined
}
