/**
 * Lịch cron 5 trường (phút giờ ngày tháng thứ) theo múi giờ: đọc, tính lần chạy kế, viết thành chữ
 * cho màn 4.1 (đặc tả: docs/specs/aris-routine.md). Thuần.
 */

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh'

export class CronError extends Error {}

export interface CronSpec {
  minute: ReadonlySet<number>
  hour: ReadonlySet<number>
  dom: ReadonlySet<number>
  month: ReadonlySet<number>
  /** 0 = Chủ nhật … 6 = Thứ 7. */
  dow: ReadonlySet<number>
  domAny: boolean
  dowAny: boolean
}

function field(text: string, min: number, max: number, what: string): Set<number> {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) throw new CronError(`Không đọc được ${what}: "${part}".`)
    const step = m[4] ? Number(m[4]) : 1
    const lo = m[1] === '*' ? min : Number(m[2])
    const hi = m[1] === '*' ? max : m[3] ? Number(m[3]) : m[4] ? max : lo
    if (step < 1 || lo < min || hi > max || lo > hi)
      throw new CronError(`${what} ngoài khoảng ${min}–${max}: "${part}".`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

/** Đọc biểu thức cron 5 trường; sai thì ném `CronError` (lời tiếng Việt). */
export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) throw new CronError('Lịch cron cần đúng 5 trường: phút giờ ngày tháng thứ.')
  const dow = field(f[4]!, 0, 7, 'thứ')
  if (dow.has(7)) {
    dow.delete(7)
    dow.add(0)
  }
  return {
    minute: field(f[0]!, 0, 59, 'phút'),
    hour: field(f[1]!, 0, 23, 'giờ'),
    dom: field(f[2]!, 1, 31, 'ngày'),
    month: field(f[3]!, 1, 12, 'tháng'),
    dow,
    domAny: f[2] === '*',
    dowAny: f[4] === '*',
  }
}

const formats = new Map<string, Intl.DateTimeFormat>()
/** Lệch giờ (phút) của múi giờ tại một thời điểm. */
export function offsetMinutes(at: Date, tz: string): number {
  let fmt = formats.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formats.set(tz, fmt)
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]))
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
}

const dayMatches = (s: CronSpec, d: Date) => {
  const dom = s.dom.has(d.getUTCDate())
  const dow = s.dow.has(d.getUTCDay())
  // Như cron: cả hai trường cùng giới hạn thì một trong hai khớp là được.
  if (!s.domAny && !s.dowAny) return dom || dow
  return dom && dow
}

/** Lần chạy kế sau `after` (không tính đúng phút `after`). Không có trong 5 năm tới thì undefined. */
export function nextRun(spec: CronSpec, after: Date, tz: string = DEFAULT_TZ): Date | undefined {
  const off = offsetMinutes(after, tz)
  // Làm việc trên "giờ treo tường" biểu diễn bằng UTC.
  const d = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + (off + 1) * 60_000)
  const limit = d.getTime() + 5 * 366 * 86_400_000
  while (d.getTime() < limit) {
    if (!spec.month.has(d.getUTCMonth() + 1)) {
      d.setUTCMonth(d.getUTCMonth() + 1, 1)
      d.setUTCHours(0, 0, 0, 0)
    } else if (!dayMatches(spec, d)) {
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(0, 0, 0, 0)
    } else if (!spec.hour.has(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0)
    } else if (!spec.minute.has(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0)
    } else {
      const at = new Date(d.getTime() - off * 60_000)
      // Múi giờ có giờ mùa hè: lệch giờ lúc chạy khác lúc bắt đầu tính thì chỉnh lại.
      const real = offsetMinutes(at, tz)
      return real === off ? at : new Date(d.getTime() - real * 60_000)
    }
  }
  return undefined
}

const DAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const two = (n: number) => String(n).padStart(2, '0')

function days(dow: ReadonlySet<number>): string {
  const list = [...dow].sort((a, b) => (a || 7) - (b || 7))
  const keys = list.map((d) => d || 7)
  const run = keys.every((k, i) => i === 0 || k === keys[i - 1]! + 1)
  if (run && list.length >= 3) {
    const a = keys[0]!
    const b = keys.at(-1)!
    return b === 7 ? `${DAY[a]} – Chủ nhật` : `Thứ ${a + 1}–${b + 1}`
  }
  return list.map((d) => DAY[d]).join(', ')
}

/** Lịch đọc được cho màn 4.1 ("Thứ 2–6, 07:30"); kiểu lạ thì trả nguyên biểu thức. */
export function humanCron(expr: string): string {
  let s: CronSpec
  try {
    s = parseCron(expr)
  } catch {
    return expr
  }
  const f = expr.trim().split(/\s+/)
  const every = /^\*\/(\d+)$/
  if (f[3] !== '*') return expr
  if (f[1] === '*' && f[2] === '*' && f[4] === '*') {
    const m = every.exec(f[0]!)
    if (m) return `Mỗi ${m[1]} phút`
    if (s.minute.size === 1) return `Mỗi giờ, phút ${two([...s.minute][0]!)}`
    return expr
  }
  if (s.minute.size !== 1 || s.hour.size !== 1) return expr
  const time = `${two([...s.hour][0]!)}:${two([...s.minute][0]!)}`
  if (s.domAny && (s.dowAny || s.dow.size === 7)) return `Mỗi ngày, ${time}`
  if (s.domAny) return `${days(s.dow)}, ${time}`
  if (s.dowAny && s.dom.size === 1) return `Ngày ${[...s.dom][0]} hằng tháng, ${time}`
  return expr
}
