/**
 * Công tắc "Giao diện mới (GĐ9)": thanh bên danh bạ theo phòng, đầu chat viên tên bot, hồ sơ bot ở khung
 * phải, chuông Hoạt động. Lưu trên trình duyệt; tắt thì aris hiện y như trước GĐ9. Các gói đọc công tắc lúc
 * nạp, nên đổi công tắc thì nạp lại trang.
 */
import { useEffect, useState } from 'react'

/** Khoá lưu công tắc trên trình duyệt. */
export const UI_V2_KEY = 'aris.ui.v2'
const EVENT = 'aris:ui-v2'

type Get = Pick<Storage, 'getItem'>
type Put = Pick<Storage, 'setItem'>

const local = (): (Get & Put) | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Giao diện mới có đang bật không; kho hỏng hay chưa đặt thì coi như tắt. */
export function isUiV2(storage: Get | undefined = local()): boolean {
  try {
    return storage?.getItem(UI_V2_KEY) === '1'
  } catch {
    return false
  }
}

/** Bật hay tắt giao diện mới, báo cho mọi gói đang vẽ. */
export function setUiV2(on: boolean, storage: Put | undefined = local()): void {
  try {
    storage?.setItem(UI_V2_KEY, on ? '1' : '0')
  } catch {
    return
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** Hook: vẽ lại khi người dùng đổi công tắc. */
export function useUiV2(): boolean {
  const [on, setOn] = useState(() => isUiV2())
  useEffect(() => {
    const f = () => setOn(isUiV2())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  return on
}

/** Loại tab hồ sơ bot ở khung phải (đăng ký ở `@aris/ui-team-pane`, mở từ đầu chat). */
export const PROFILE_TAB = 'aris-profile'

/** Sự kiện mở bảng Hoạt động (chuông ở thanh bên phát, `@aris/ui-pages` nghe). */
export const ACTIVITY_OPEN = 'aris:activity-open'

/** Mở bảng Hoạt động từ bất kỳ gói nào. */
export function openActivity(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVITY_OPEN))
}
