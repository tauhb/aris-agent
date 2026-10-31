/**
 * Sao lưu (giai đoạn 7, đợt 7b; bản vẽ 6.4b): cài đặt, mã khôi phục, lịch, giữ bản ngày và bản tuần. Thuần.
 */
import { createHash, randomBytes } from 'node:crypto'

export interface BackupSettings {
  enabled: boolean
  /** Thư mục cất bản sao lưu, do người dùng chọn. */
  dir: string
  /** Giờ chạy mỗi đêm, `HH:MM` giờ máy. */
  time: string
  keepDaily: number
  keepWeekly: number
  /** Báo qua Telegram khi sao lưu hay diễn tập lỗi. */
  notify: boolean
  /** Mã khôi phục đang dùng (mã băm ngắn; mã thật nằm trong Keychain). */
  codeId?: string | undefined
  codeSetAt?: string | undefined
  /** Mã mới đã tạo, chờ người dùng xác nhận đã cất. */
  pendingCodeId?: string | undefined
}

export const DEFAULT_BACKUP: BackupSettings = {
  enabled: false,
  dir: '',
  time: '02:00',
  keepDaily: 7,
  keepWeekly: 4,
  notify: true,
}

const rec = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
const int = (v: unknown, min: number, max: number, prev: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : prev

/** Cài đặt người dùng sửa được; mã khôi phục, bật tắt đi đường riêng. */
export function cleanBackup(input: unknown, prev: BackupSettings = DEFAULT_BACKUP): BackupSettings {
  const r = rec(input)
  return {
    ...prev,
    time: typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : prev.time,
    keepDaily: int(r.keepDaily, 1, 60, prev.keepDaily),
    keepWeekly: int(r.keepWeekly, 0, 52, prev.keepWeekly),
    notify: typeof r.notify === 'boolean' ? r.notify : prev.notify,
  }
}

// --- Mã khôi phục -------------------------------------------------------------------------------------------

/** Bảng chữ Crockford: không có I, L, O, U cho dễ chép tay. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Mã khôi phục 120 bit: 24 ký tự, sáu nhóm bốn. */
export function newRecoveryCode(rand: (n: number) => Buffer = randomBytes): string {
  const bytes = rand(15)
  let bits = 0
  let acc = 0
  let out = ''
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(acc >> (bits - 5)) & 31]
      bits -= 5
    }
    acc &= (1 << bits) - 1
  }
  return out.match(/.{4}/g)!.join('-')
}

/** Mã người dùng gõ lại: bỏ gạch, khoảng trắng; O → 0, I và L → 1. Không hợp lệ thì undefined. */
export function normalizeCode(input: string): string | undefined {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (s.length !== 24 || [...s].some((c) => !ALPHABET.includes(c))) return undefined
  return s.match(/.{4}/g)!.join('-')
}

/** Mã băm ngắn của mã khôi phục: ghi trong đầu tệp để biết tệp cần mã nào. */
export const codeIdOf = (code: string) =>
  createHash('sha256')
    .update(`aris-backup\n${normalizeCode(code) ?? code}`)
    .digest('hex')
    .slice(0, 10)

// --- Lịch ---------------------------------------------------------------------------------------------------

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface RunState {
  /** Ngày (giờ máy) của lần thử gần nhất. */
  day: string
  attempts: number
  lastAt: number
  ok: boolean
}

/** Tối đa bấy nhiêu lần thử mỗi ngày, cách nhau một giờ. */
export const MAX_ATTEMPTS = 3

/**
 * Tới giờ sao lưu chưa: đã qua giờ hẹn hôm nay, hôm nay chưa có bản tốt, và chưa thử quá số lần (máy ngủ lúc hẹn
 * thì chạy khi máy thức).
 */
export function isDue(
  now: Date,
  s: Pick<BackupSettings, 'enabled' | 'dir' | 'time'>,
  st?: RunState,
): boolean {
  if (!s.enabled || !s.dir) return false
  const [h, m] = s.time.split(':').map(Number) as [number, number]
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false
  if (!st || st.day !== dayKey(now)) return true
  if (st.ok || st.attempts >= MAX_ATTEMPTS) return false
  return now.getTime() - st.lastAt >= 3_600_000
}

// --- Giữ bản ------------------------------------------------------------------------------------------------

/** Tuần (thứ Hai đầu tuần) của một ngày: khoá để gom bản tuần. */
export function weekKey(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return dayKey(x)
}

export type KeepReason = 'daily' | 'weekly'

/**
 * Bản nào giữ: bản mới nhất của mỗi ngày trong `keepDaily` ngày gần nhất có bản, và bản mới nhất của mỗi tuần
 * trong `keepWeekly` tuần gần nhất có bản. Còn lại là bỏ.
 */
export function pickKeep<T extends { at: Date }>(
  copies: readonly T[],
  keepDaily: number,
  keepWeekly: number,
): { keep: Map<T, KeepReason>; drop: T[] } {
  const sorted = [...copies].sort((a, z) => z.at.getTime() - a.at.getTime())
  const keep = new Map<T, KeepReason>()
  const days = new Set<string>()
  const weeks = new Set<string>()
  for (const c of sorted) {
    const d = dayKey(c.at)
    if (days.has(d)) continue
    if (days.size >= keepDaily) break
    days.add(d)
    keep.set(c, 'daily')
  }
  for (const c of sorted) {
    const w = weekKey(c.at)
    if (weeks.has(w)) continue
    if (weeks.size >= keepWeekly) break
    weeks.add(w)
    if (!keep.has(c)) keep.set(c, 'weekly')
  }
  return { keep, drop: sorted.filter((c) => !keep.has(c)) }
}

/** Tên tệp sao lưu: `aris-2026-10-26-0200.aris`. */
export function fileName(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `aris-${dayKey(d)}-${two(d.getHours())}${two(d.getMinutes())}.aris`
}
export const isBackupName = (name: string) => /^aris-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.aris$/.test(name)
