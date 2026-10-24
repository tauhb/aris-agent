/**
 * Phần thuần của tự trị (đặc tả: docs/specs/aris-autonomy.md): lời chấm và cách đọc của giám khảo
 * `/goal`, đọc lệnh `/loop` và `/heartbeat`, tự điều nhịp vòng lặp.
 */

/** Bỏ dấu tiếng Việt, viết thường. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
}

// --- Giám khảo /goal -----------------------------------------------------------------

export interface Verdict {
  verdict: 'done' | 'continue' | 'blocked'
  reason: string
  /** Điều còn thiếu (continue) hay điều cần người dùng (blocked). */
  missing?: string | undefined
}

export function judgePrompt(o: {
  objective: string
  round: number
  max: number
  answer: string
  tools: string[]
}): string {
  return `Bạn là giám khảo độc lập cho một trợ lý AI đang làm một mục tiêu nhiều lượt. Đọc mục tiêu và kết quả lượt vừa xong rồi chấm.

Mục tiêu: ${o.objective}
Lượt: ${o.round}/${o.max}
Công cụ trợ lý đã gọi trong lượt: ${o.tools.length ? o.tools.join(', ') : '(không)'}

Câu trả lời cuối của lượt:
${o.answer || '(không có)'}

Chấm:
- "done": mục tiêu đã đạt đủ (có bằng chứng trong câu trả lời: kết quả, tệp, số liệu), không cần làm gì thêm.
- "blocked": không thể tiến tiếp nếu không có người dùng (cần quyết định, cần duyệt, thiếu quyền, thiếu dữ liệu chỉ người dùng có).
- "continue": còn việc trợ lý tự làm được.

Trả về DUY NHẤT JSON {"verdict": "done" | "continue" | "blocked", "reason": "một câu", "missing": "điều còn thiếu hoặc điều cần người dùng, ngắn; rỗng khi done"}.`
}

export function parseVerdict(raw: string): Verdict | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  try {
    const v = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    if (v.verdict !== 'done' && v.verdict !== 'continue' && v.verdict !== 'blocked') return undefined
    const str = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '')
    const missing = str(v.missing, 300)
    return { verdict: v.verdict, reason: str(v.reason, 300) || '—', ...(missing ? { missing } : {}) }
  } catch {
    return undefined
  }
}

const words = (s: string) =>
  new Set(
    fold(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  )
/** Hai câu gần trùng ý (Jaccard theo từ ≥ 0,6). */
export function similar(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return false
  let c = 0
  for (const w of x) if (y.has(w)) c++
  return c / (x.size + y.size - c) >= 0.6
}

/** Bao nhiêu lượt liền giám khảo nêu cùng điều còn thiếu thì coi là không tiến triển. */
export const STUCK_ROUNDS = 3

/** Lượt `continue` mới nhất cùng `STUCK_ROUNDS - 1` lượt trước nêu cùng một điều còn thiếu. */
export function isStuck(history: readonly Verdict[]): boolean {
  const last = history.slice(-STUCK_ROUNDS)
  if (last.length < STUCK_ROUNDS || last.some((v) => v.verdict !== 'continue' || !v.missing)) return false
  return last.every((v) => similar(v.missing!, last[0]!.missing!))
}

// --- /loop và /heartbeat ----------------------------------------------------------------

/** Nhịp tối thiểu (lịch nhắc của dsh), nhịp tự điều tối đa, nhịp tim mặc định (giây). */
export const MIN_SECONDS = 60
export const AUTO_MAX_SECONDS = 900
export const HEARTBEAT_SECONDS = 1800

/** "5m", "90s", "1h", "1h30m" → giây; sai dạng thì undefined. */
export function parseInterval(s: string): number | undefined {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(s.trim())
  if (!m || !s.trim() || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** "5 phút", "1 giờ", "90 giây" cho người đọc. */
export function humanInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} giờ`
  if (seconds % 60 === 0) return `${seconds / 60} phút`
  return `${seconds} giây`
}

export type LoopCommand =
  | { kind: 'list' }
  | { kind: 'stop' }
  | { kind: 'start'; seconds?: number | undefined; task: string }
  | { kind: 'error'; message: string }

const STOP = /^(dung|stop|tat|off|huy)$/

/** Đọc phần sau `/loop`. */
export function parseLoop(raw: string): LoopCommand {
  const text = raw.trim()
  if (!text) return { kind: 'list' }
  if (STOP.test(fold(text))) return { kind: 'stop' }
  const [first, ...rest] = text.split(/\s+/)
  const seconds = parseInterval(first!)
  if (seconds === undefined) return { kind: 'start', task: text }
  const task = rest.join(' ').trim()
  if (!task) return { kind: 'error', message: 'Thiếu việc cần lặp, ví dụ: /loop 5m kiểm tra bản deploy' }
  if (seconds < MIN_SECONDS) return { kind: 'error', message: 'Nhịp tối thiểu là 1 phút.' }
  return { kind: 'start', seconds, task }
}

export type HeartbeatCommand =
  | { kind: 'stop' }
  | { kind: 'start'; seconds: number; focus?: string | undefined }
  | { kind: 'error'; message: string }

/** Đọc phần sau `/heartbeat`. */
export function parseHeartbeat(raw: string): HeartbeatCommand {
  const text = raw.trim()
  if (STOP.test(fold(text))) return { kind: 'stop' }
  const [first, ...rest] = text.split(/\s+/)
  const seconds = first ? parseInterval(first) : undefined
  const focus = (seconds === undefined ? text : rest.join(' ')).trim()
  const s = seconds ?? HEARTBEAT_SECONDS
  if (s < MIN_SECONDS) return { kind: 'error', message: 'Nhịp tối thiểu là 1 phút.' }
  return { kind: 'start', seconds: s, ...(focus ? { focus } : {}) }
}

/** Dấu nhận ra lượt do vòng lặp / nhịp tim của aris gửi. */
export const markerOf = (id: string) => `[aris-loop:${id}]`
export const MARKER_RE = /\[aris-loop:([a-z0-9-]+)\]/

export function loopPrompt(id: string, task: string, seconds: number, auto: boolean): string {
  return `${markerOf(id)} Vòng lặp (${auto ? 'tự điều nhịp' : `mỗi ${humanInterval(seconds)}`}): ${task}\nLàm lại việc này và báo kết quả ngắn. Nếu không có gì mới so với lần trước, trả lời đúng hai chữ: không đổi.`
}

export function heartbeatPrompt(id: string, seconds: number, focus?: string): string {
  return `${markerOf(id)} Nhịp tim (mỗi ${humanInterval(seconds)}): xem lại cuộc này và những việc đang theo dõi${focus ? `, nhất là: ${focus}` : ''}. Có gì người dùng cần biết hay cần làm thì báo ngắn; không có gì thì trả lời đúng một chữ: ổn.`
}

/** Câu trả lời của lượt lặp coi là "không đổi" so với lần trước. */
export function unchanged(answer: string, previous: string | undefined): boolean {
  const a = fold(answer)
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .trim()
  if (/^(khong doi|on)$/.test(a)) return true
  return (
    previous !== undefined &&
    a ===
      fold(previous)
        .replace(/\s+/g, ' ')
        .replace(/[.!]+$/, '')
        .trim()
  )
}

/** Nhịp kế của vòng lặp tự điều nhịp: không đổi thì gấp đôi (tối đa 15 phút), đổi thì về 1 phút. */
export const nextAuto = (seconds: number, same: boolean) =>
  same ? Math.min(AUTO_MAX_SECONDS, Math.max(MIN_SECONDS, seconds * 2)) : MIN_SECONDS
