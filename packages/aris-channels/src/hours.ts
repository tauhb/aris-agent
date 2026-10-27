/**
 * Giờ trực của một tài khoản kênh (GĐ8.7 đợt C) và nhận ra lời "gặp nhân viên". Thuần, theo giờ máy.
 */

export interface Hours {
  /** Thứ trong tuần được trực (0 = Chủ nhật … 6 = Thứ bảy). */
  days: readonly number[]
  /** `HH:MM`. `to` nhỏ hơn `from` là ca qua nửa đêm (ví dụ 20:00 → 02:00). */
  from: string
  to: string
}

const minutes = (hhmm: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? undefined : h * 60 + min
}

/** Giờ trực hợp lệ không (có ít nhất một ngày, giờ đúng dạng, `from` khác `to`). */
export function validHours(h: Hours): boolean {
  const a = minutes(h.from)
  const b = minutes(h.to)
  return a !== undefined && b !== undefined && a !== b && h.days.length > 0
}

/** Lúc `t` có nằm trong giờ trực không. Ca qua nửa đêm tính theo ngày bắt đầu ca. */
export function isOpen(h: Hours, t: number): boolean {
  const a = minutes(h.from)
  const b = minutes(h.to)
  if (a === undefined || b === undefined || a === b) return true
  const d = new Date(t)
  const now = d.getHours() * 60 + d.getMinutes()
  const day = d.getDay()
  if (a < b) return h.days.includes(day) && now >= a && now < b
  // Qua nửa đêm: phần trước nửa đêm thuộc hôm nay, phần sau nửa đêm thuộc ca của hôm qua.
  if (now >= a) return h.days.includes(day)
  if (now < b) return h.days.includes((day + 6) % 7)
  return false
}

/** Lần vào giờ trực kế tiếp kể từ `t` (chính `t` nếu đang trong giờ). Không tìm được trong 8 ngày thì trả `t`. */
export function nextOpen(h: Hours, t: number): number {
  if (isOpen(h, t)) return t
  const a = minutes(h.from)
  if (a === undefined) return t
  const d = new Date(t)
  for (let i = 0; i <= 8; i++) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, Math.floor(a / 60), a % 60, 0, 0)
    if (c.getTime() > t && h.days.includes(c.getDay())) return c.getTime()
  }
  return t
}

/** Khách muốn gặp người thật ("gặp nhân viên", "cho gặp người thật", "/nhanvien"…). */
export function wantsHuman(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim()
  if (/^\/(nhanvien|human|staff)\b/.test(t)) return true
  return /\b(gap|noi chuyen voi|cho (minh |em |toi |tui )?gap|can|muon gap)\s+(nhan vien|nguoi that|nguoi phu trach|tu van vien|admin|chu shop|quan ly)\b/.test(
    t,
  )
}
