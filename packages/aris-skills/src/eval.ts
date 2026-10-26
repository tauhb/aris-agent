/**
 * Kiểm thử skill bằng chạy lại (giai đoạn 3, đợt 4; đặc tả: docs/specs/aris-skills.md). Phần thuần:
 * luật "chỉ đọc" của phiên kiểm thử, lời chấm và cách đọc, tổng hợp số liệu cho màn 3.3.
 */
import { readOnlyCommand } from '@aris/shell'
import { fold } from './lint.js'

/** Tối đa ca mỗi lần kiểm thử, trần tiền mỗi lần (USD). */
export const MAX_CASES = 5
export const EVAL_USD = 0.2
/** Một lần chạy quá ngần này thì dừng. */
export const RUN_TIMEOUT_MS = 5 * 60_000

export interface RunResult {
  session: string
  /** Số lần gọi model. */
  steps: number
  tokens: number
  /** Câu trả lời cuối (cắt ngắn). */
  answer: string
  /** Lần gọi công cụ bị hộp cát từ chối. */
  denied: number
  pass?: boolean | undefined
  note?: string | undefined
  error?: string | undefined
}

export interface EvalCase {
  request: string
  /** Bản so sánh: bản đang dùng, hoặc không có skill. */
  base?: RunResult | undefined
  /** Bản thử: bản đề xuất (hoặc bản đang dùng khi không có đề xuất). */
  cand?: RunResult | undefined
}

export interface EvalRecord {
  id: string
  skill: string
  /** Bản thử. */
  version: number
  /** Bản so sánh (0: không có skill). */
  base: number
  at: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  cases: EvalCase[]
  usd: number
  cap: number
  /** Lý do dừng sớm hay lỗi. */
  note?: string | undefined
  finishedAt?: string | undefined
}

/** Công cụ phiên kiểm thử được dùng: chỉ đọc. */
export const READ_ONLY_TOOLS = new Set([
  'read',
  'read_image',
  'grep',
  'glob',
  'skill',
  'todo_write',
  'working_directory',
])

/**
 * Lệnh bash chỉ đọc: dùng chung bộ kiểm của hàng rào (`readOnlyCommand` ở `@aris/shell`, đợt 7f, S10) ở chế độ nới.
 * Mỗi đoạn (tách theo `;`, `&&`, `||`, `|`, `&`, xuống dòng) phải là lệnh đọc trong danh sách, không chuyển hướng
 * ghi, không lệnh con, không cờ biến lệnh đọc thành ghi hay chạy chương trình (`find -fprint`, `git diff --output`,
 * `sort -o`, `rg --pre`…). `awk`, `sed` (trừ `sed -n 'Np'`), `git branch|remote|tag` không còn trong danh sách.
 */
export function readOnlyBash(command: string): boolean {
  return readOnlyCommand(command, { lenient: true })
}

/** Lý do từ chối trong phiên kiểm thử (model đọc). */
export const SANDBOX_DENY =
  'Đang chạy kiểm thử skill trong hộp cát: chỉ được đọc (đọc tệp, tìm, lệnh chỉ đọc như git log/status, ls, cat). Không ghi tệp, không chạy lệnh có hiệu ứng, không mạng, không giao việc, không ghi ký ức. Nói ngắn bạn sẽ làm gì ở bước này rồi làm tiếp phần còn lại.'

/** Lời chấm một lần chạy: yêu cầu, skill đang kiểm, câu trả lời cuối. */
export function judgePrompt(o: {
  request: string
  skill: string
  description: string
  answer: string
}): string {
  return `Bạn chấm kết quả của một trợ lý AI trong lần chạy thử (hộp cát chỉ đọc: trợ lý không được ghi tệp hay chạy lệnh có hiệu ứng, nên nếu nó nói rõ bước đó sẽ làm gì thì vẫn tính).

Yêu cầu của người dùng:
${o.request}

Skill liên quan "${o.skill}": ${o.description}

Câu trả lời cuối của trợ lý:
${o.answer || '(không có câu trả lời)'}

Chấm theo những gì làm được trong hộp cát: bước bị chặn mà trợ lý nói rõ (bước đó là gì, vì sao chưa có kết quả) thì không trừ điểm. Câu ghi chú về bước bị hộp cát chặn không tính vào định dạng câu trả lời. Chấm chủ yếu: làm đúng việc người dùng nhờ, làm các bước đọc được, trả lời đúng định dạng người dùng đòi. Trả về DUY NHẤT JSON {"pass": true | false, "note": "lý do một câu"}.`
}

export function parseJudge(raw: string): { pass: boolean; note: string } | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  try {
    const v = JSON.parse(raw.slice(s, e + 1)) as { pass?: unknown; note?: unknown }
    if (typeof v.pass !== 'boolean') return undefined
    return { pass: v.pass, note: typeof v.note === 'string' ? v.note.slice(0, 300) : '' }
  } catch {
    return undefined
  }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const change = (from: number, to: number) => (from ? Math.round(((to - from) / from) * 100) : 0)

/** Số liệu màn 3.3: đạt (bản thử / bản so sánh), số bước và token trung bình, % thay đổi. */
export function summarize(e: Pick<EvalRecord, 'cases'>) {
  const done = e.cases.filter((c) => c.base && c.cand && !c.base.error && !c.cand.error)
  const steps = { base: avg(done.map((c) => c.base!.steps)), cand: avg(done.map((c) => c.cand!.steps)) }
  const tokens = { base: avg(done.map((c) => c.base!.tokens)), cand: avg(done.map((c) => c.cand!.tokens)) }
  return {
    cases: done.length,
    pass: { cand: done.filter((c) => c.cand!.pass).length, base: done.filter((c) => c.base!.pass).length },
    steps: { ...steps, pct: change(steps.base, steps.cand) },
    tokens: { ...tokens, pct: change(tokens.base, tokens.cand) },
  }
}

/** Lời dặn gửi kèm yêu cầu trong phiên kiểm thử (như nhau cho cả hai bản). */
export const EVAL_PREFIX =
  '(Lần chạy thử trong hộp cát chỉ đọc: lệnh ghi tệp, chạy chương trình hay gọi mạng sẽ bị chặn. Bước nào bị chặn thì ghi rõ bước đó, vẫn làm các bước còn lại và trả lời đúng định dạng yêu cầu.)\n\n'

/** Tên ngắn của một ca cho tiêu đề phiên kiểm thử. */
export const caseTitle = (request: string) => {
  const t = request.replace(/\s+/g, ' ').trim()
  return t.length > 48 ? `${t.slice(0, 47)}…` : t
}

/** Có giống một yêu cầu đã có không (bỏ trùng ca). */
export const sameRequest = (a: string, b: string) =>
  fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim()
