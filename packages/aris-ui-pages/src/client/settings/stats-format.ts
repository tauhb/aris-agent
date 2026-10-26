/** Định dạng số, giờ và thời gian cho màn Thống kê (6.5) và Phát lại phiên (6.5b). Thuần. */

/** Dấu thập phân theo ngôn ngữ (`sx.dec`). */
const withDec = (s: string, dec: string) => (dec === '.' ? s : s.replace('.', dec))

/** Số token gọn: 200 → 0,2K; 38.200 → 38,2K; 1,2 triệu → 1,2M. */
export function fmtTokens(n: number, dec = ','): string {
  if (!(n > 0)) return '0'
  if (n < 1_000_000) return `${withDec((n / 1000).toFixed(1), dec)}K`
  return `${withDec((n / 1_000_000).toFixed(1), dec)}M`
}

/** Số nguyên có dấu phân cách hàng nghìn (dấu thập phân là phẩy thì nghìn là chấm, và ngược lại). */
export const fmtInt = (n: number, dec = ','): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, dec === ',' ? '.' : ',')

/**
 * Tiền USD: từ 0,01 trở lên hai số lẻ; nhỏ hơn thì ba số lẻ (0,003), dưới 0,001 thì `<0,001`, để việc có tốn tiền
 * không hiện thành 0,00.
 */
export function fmtUsd(n: number, dec = ',', small = true): string {
  if (!(n > 0)) return withDec('0.00', dec)
  if (small && n < 0.001) return `<${withDec('0.001', dec)}`
  return withDec(n.toFixed(small && n < 0.01 ? 3 : 2), dec)
}

const two = (n: number) => String(n).padStart(2, '0')

/** `HH:MM`. */
export const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** `HH:MM:SS`. */
export const clockSec = (ms: number): string => `${clock(ms)}:${two(new Date(ms).getSeconds())}`

/** `dd/mm`. */
export const dateShort = (ms: number): string => {
  const d = new Date(ms)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`
}

export const sameDay = (a: number, b: number): boolean =>
  dateShort(a) === dateShort(b) && Math.abs(a - b) < 366 * 86_400_000

/** Giờ của một dòng nhật ký: hôm nay chỉ giờ, ngày khác kèm `dd/mm`. */
export const logTime = (ms: number, now = Date.now()): string =>
  sameDay(ms, now) ? clock(ms) : `${dateShort(ms)} ${clock(ms)}`

/** Thời gian chạy: dưới 10 giây một số lẻ, tới 1 phút số giây, sau đó phút và giây. */
export function fmtDuration(
  ms: number,
  sec: (n: string) => string,
  min: (m: number, s: number) => string,
  dec = ',',
): string {
  if (ms < 10_000) return sec(withDec((ms / 1000).toFixed(1), dec))
  if (ms < 60_000) return sec(String(Math.round(ms / 1000)))
  const total = Math.round(ms / 1000)
  return min(Math.floor(total / 60), total % 60)
}

/** Nhãn một ngày của biểu đồ: thứ trong tuần (từ `weekdays` bắt đầu Chủ nhật) hay `dd/mm`. */
export function dayLabel(day: string, style: 'week' | 'date', weekdays: readonly string[]): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return style === 'week' ? (weekdays[date.getDay()] ?? day) : `${two(d)}/${two(m)}`
}
