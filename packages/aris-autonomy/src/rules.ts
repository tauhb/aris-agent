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
  verdict: 'done' | 'continue' | 'blocked' | 'wait'
  reason: string
  /** Điều còn thiếu (continue) hay điều cần người dùng (blocked). */
  missing?: string | undefined
  /** Đang đợi gì (wait). */
  waitingFor?: string | undefined
  /** Đợi bao lâu, giây (wait), đã kẹp trong `WAIT_MIN_SECONDS`–`WAIT_MAX_SECONDS`. */
  waitSeconds?: number | undefined
}

/** Hợp đồng hoàn thành của một mục tiêu (đợt 6): mục tiêu mơ hồ thì chấm cũng mơ hồ. */
export interface Contract {
  /** Xong khi: kết quả cụ thể. */
  done: string
  /** Chứng minh bằng: lệnh, tệp, số liệu cho thấy đã xong. */
  proof: string
  /** Không được làm hỏng. */
  keep?: string | undefined
  /** Phạm vi. */
  scope?: string | undefined
  /** Dừng khi: điều kiện bỏ cuộc hay cần hỏi người dùng. */
  stop?: string | undefined
}

export function contractPrompt(objective: string): string {
  return `Người dùng đặt cho một trợ lý AI mục tiêu nhiều lượt dưới đây. Soạn hợp đồng hoàn thành ngắn để một giám khảo độc lập chấm được khi nào là xong. Chỉ dựa vào câu mục tiêu, không bịa yêu cầu mới; điều mục tiêu không nói thì để rỗng.

Mục tiêu: ${objective}

Trả về DUY NHẤT JSON {"done": "xong khi: kết quả cụ thể", "proof": "chứng minh bằng: lệnh, tệp, số liệu cụ thể cho thấy đã xong", "keep": "không được làm hỏng gì (hoặc rỗng)", "scope": "phạm vi (hoặc rỗng)", "stop": "khi nào dừng để hỏi người dùng (hoặc rỗng)"}. Mỗi trường một câu, tiếng Việt.`
}

export function parseContract(raw: string): Contract | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  try {
    const v = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    // Model hay lặp lại nhãn ("xong khi: …") trong nội dung: bỏ nhãn.
    const str = (x: unknown) =>
      typeof x === 'string'
        ? x
            .trim()
            .replace(/^(xong khi|chứng minh bằng|không được làm hỏng|phạm vi|dừng khi)\s*:\s*/i, '')
            .slice(0, 300)
        : ''
    const done = str(v.done)
    const proof = str(v.proof)
    if (!done || !proof) return undefined
    const opt = (k: 'keep' | 'scope' | 'stop') => (str(v[k]) ? { [k]: str(v[k]) } : {})
    return { done, proof, ...opt('keep'), ...opt('scope'), ...opt('stop') }
  } catch {
    return undefined
  }
}

/** Hợp đồng và tiêu chí thêm, dạng dòng cho bot và giám khảo đọc. */
export function contractText(c: Contract | undefined, subgoals: readonly string[] = []): string {
  return [
    ...(c
      ? [
          `- Xong khi: ${c.done}`,
          `- Chứng minh bằng: ${c.proof}`,
          ...(c.keep ? [`- Không được làm hỏng: ${c.keep}`] : []),
          ...(c.scope ? [`- Phạm vi: ${c.scope}`] : []),
          ...(c.stop ? [`- Dừng khi: ${c.stop}`] : []),
        ]
      : []),
    ...subgoals.map((g, i) => `- Tiêu chí thêm ${i + 1}: ${g}`),
  ].join('\n')
}

/** Tối đa bao nhiêu tiêu chí `/subgoal` cho một mục tiêu. */
export const MAX_SUBGOALS = 10

/** Đọc phần sau `/subgoal`: rỗng thì xem hợp đồng, có chữ thì thêm tiêu chí. */
export const parseSubgoal = (raw: string) =>
  raw.trim() ? ({ kind: 'add', text: raw.trim().slice(0, 300) } as const) : ({ kind: 'show' } as const)

export function judgePrompt(o: {
  objective: string
  round: number
  max: number
  answer: string
  tools: string[]
  contract?: Contract | undefined
  subgoals?: readonly string[] | undefined
}): string {
  const terms = contractText(o.contract, o.subgoals)
  return `Bạn là giám khảo độc lập cho một trợ lý AI đang làm một mục tiêu nhiều lượt. Đọc mục tiêu và kết quả lượt vừa xong rồi chấm.

Mục tiêu: ${o.objective}${terms ? `\nHợp đồng hoàn thành:\n${terms}` : ''}
Lượt: ${o.round}/${o.max}
Công cụ trợ lý đã gọi trong lượt: ${o.tools.length ? o.tools.join(', ') : '(không)'}

Câu trả lời cuối của lượt:
${o.answer || '(không có)'}

Chấm:
- "done": mục tiêu đã đạt đủ (có bằng chứng trong câu trả lời: kết quả, tệp, số liệu), không cần làm gì thêm.${terms ? ' Có hợp đồng thì chỉ chấm "done" khi câu trả lời có bằng chứng cụ thể đúng phần "Chứng minh bằng" và mọi tiêu chí thêm đều đạt; lời khẳng định đã xong mà không kèm bằng chứng thì chưa đủ.' : ''}
- "blocked": không thể tiến tiếp nếu không có người dùng (cần quyết định, cần duyệt, thiếu quyền, thiếu dữ liệu chỉ người dùng có).
- "continue": còn việc trợ lý tự làm được.
- "wait": chỉ khi MỌI phần trợ lý tự làm được đã xong và bước tiếp theo phụ thuộc một tiến trình hay sự kiện bên ngoài đang chạy (CI đang chạy, bản deploy đang lên, đang chờ người khác trả lời email, tệp đang được xuất). Còn việc để làm thì chọn "continue", không chọn "wait".

Trả về DUY NHẤT JSON {"verdict": "done" | "continue" | "blocked" | "wait", "reason": "một câu", "missing": "điều còn thiếu hoặc điều cần người dùng, ngắn; rỗng khi done hay wait", "waiting_for": "đang đợi gì, một câu ngắn (chỉ khi wait)", "wait_seconds": số giây nên đợi, từ ${WAIT_MIN_SECONDS} đến ${WAIT_MAX_SECONDS} (chỉ khi wait)}.`
}

export function parseVerdict(raw: string): Verdict | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  try {
    const v = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    if (v.verdict !== 'done' && v.verdict !== 'continue' && v.verdict !== 'blocked' && v.verdict !== 'wait')
      return undefined
    const str = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '')
    const missing = str(v.missing, 300)
    const reason = str(v.reason, 300) || '—'
    if (v.verdict === 'wait') {
      const waitingFor = str(v.waiting_for, 200)
      // Thiếu điều đang đợi thì không có gì để kiểm lại: coi như còn việc.
      if (!waitingFor) return { verdict: 'continue', reason, ...(missing ? { missing } : {}) }
      const n = Number(v.wait_seconds)
      const waitSeconds = Number.isFinite(n)
        ? Math.min(WAIT_MAX_SECONDS, Math.max(WAIT_MIN_SECONDS, Math.round(n)))
        : WAIT_MIN_SECONDS * 2
      return { verdict: 'wait', reason, waitingFor, waitSeconds }
    }
    return { verdict: v.verdict, reason, ...(missing ? { missing } : {}) }
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

/** Lượt `continue` mới nhất cùng `STUCK_ROUNDS - 1` lượt trước nêu cùng một điều còn thiếu. Lượt chờ không tính. */
export function isStuck(history: readonly Verdict[]): boolean {
  const last = history.filter((v) => v.verdict !== 'wait').slice(-STUCK_ROUNDS)
  if (last.length < STUCK_ROUNDS || last.some((v) => v.verdict !== 'continue' || !v.missing)) return false
  return last.every((v) => similar(v.missing!, last[0]!.missing!))
}

// --- Chờ việc chạy nền (phán quyết `wait`) ----------------------------------------------

/** Khoảng đợi cho phép của một lần chờ (giây): thấp nhất là nhịp tối thiểu của lịch nhắc dsh. */
export const WAIT_MIN_SECONDS = 60
export const WAIT_MAX_SECONDS = 3600
/** Tối đa bao nhiêu lần chờ liên tiếp, và tổng thời gian chờ (giây), cho một mục tiêu. */
export const MAX_WAITS = 8
export const MAX_WAIT_TOTAL_SECONDS = 7200

/** Số lần và số giây đã chờ liên tiếp của mục tiêu (về 0 khi có lượt không phải chờ). */
export interface WaitTally {
  count: number
  seconds: number
}

/** Lần chờ này có được phép không; quá giới hạn thì mục tiêu bị chặn với `message`. */
export function waitPlan(
  tally: WaitTally | undefined,
  seconds: number,
  waitingFor: string,
): { ok: true; tally: WaitTally } | { ok: false; message: string } {
  const t = { count: (tally?.count ?? 0) + 1, seconds: (tally?.seconds ?? 0) + seconds }
  if (t.count > MAX_WAITS || t.seconds > MAX_WAIT_TOTAL_SECONDS)
    return { ok: false, message: `Chờ quá lâu: ${waitingFor}` }
  return { ok: true, tally: t }
}

/** Dấu nhận ra lượt kiểm lại do lịch chờ của mục tiêu gửi. */
export const waitMarkerOf = (goalId: string) => `[aris-goal-wait:${goalId}]`
export const WAIT_MARKER_RE = /\[aris-goal-wait:([^\]\s]+)\]/

export function waitPrompt(goalId: string, waitingFor: string): string {
  return `${waitMarkerOf(goalId)} Kiểm tra lại: ${waitingFor}. Nếu đã có kết quả thì làm tiếp mục tiêu; nếu chưa, nói rõ đang chờ gì.`
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
