/**
 * Tạo routine bằng lời (giai đoạn 4, đợt 2; đặc tả: docs/specs/aris-routine.md): lời nhắc cho model
 * rẻ, đọc và kiểm bản nháp. Thuần.
 */
import { CronError, DEFAULT_TZ, humanCron, nextRun, parseCron } from './cron.js'
import { CATCHUP_HOURS } from './rules.js'

export interface BotBrief {
  id: string
  name: string
  handle: string
  role?: string | undefined
}

export interface Draft {
  title: string
  bot: string
  cron: string
  tz: string
  task: string
  deliver: 'telegram' | 'none'
  perms: 'read' | 'bot'
  catchupHours: number
  mode: 'agent' | 'script'
  command?: string | undefined
  /** Đủ rõ để lưu; chưa rõ thì `question` nói cần làm rõ gì. */
  clear: boolean
  question?: string | undefined
}

const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

/** Giờ treo tường ở múi giờ, cho model biết "bây giờ". */
export function wallClock(at: Date, tz: string = DEFAULT_TZ): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday))
  return `${WEEKDAY[dow]}, ${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

export function draftPrompt(text: string, now: Date, bots: readonly BotBrief[]): string {
  return `Người dùng muốn tạo một routine (việc tự chạy theo lịch) cho đội bot của họ. Dịch câu mô tả thành bản nháp.

Bây giờ: ${wallClock(now)} (giờ Việt Nam).
Các bot (mã · tên · vai):
${bots.map((b) => `- ${b.id} · ${b.name}${b.role ? ` · ${b.role}` : ''}`).join('\n')}

Câu mô tả: ${text}

Quy tắc:
- "bot": mã bot người dùng nhắc tên; không nhắc thì chọn bot hợp vai nhất, không rõ thì "aris".
- "cron": 5 trường "phút giờ ngày tháng thứ" theo giờ Việt Nam (thứ: 0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7). "các ngày trong tuần" là 1-5. Không nói giờ thì để "clear": false và hỏi.
- "task": lời dặn cho bot mỗi lần chạy, viết như giao việc, giữ đủ điều kiện người dùng nói (lọc gì, định dạng gì); không nhắc lịch, không nhắc gửi Telegram.
- "title": tên ngắn dưới 60 ký tự.
- "deliver": "telegram" trừ khi người dùng nói không cần gửi.
- "perms": "read" (chỉ đọc, việc khác phải hỏi) trừ khi người dùng nói rõ cho bot tự gửi, ghi hay làm thay; khi đó "bot".
- "catchupHours": số giờ trễ tối đa vẫn chạy bù khi máy tắt; mặc định ${CATCHUP_HOURS}; người dùng nói "lỡ thì thôi" thì 0.
- "mode": "script" CHỈ khi người dùng đưa nguyên câu lệnh shell (thường trong dấu \`) và nói chạy lệnh đó không cần AI; "command" là đúng câu lệnh đó, không thêm bớt. Còn lại "agent" và bỏ "command".
- "clear": false khi thiếu giờ chạy hay không biết làm gì; "question" là một câu hỏi ngắn để người dùng nói rõ.

Trả về DUY NHẤT JSON {"title": "...", "bot": "...", "cron": "...", "task": "...", "deliver": "telegram" | "none", "perms": "read" | "bot", "catchupHours": 3, "mode": "agent" | "script", "command": "...", "clear": true | false, "question": "..."}.`
}

/** Đọc và kiểm bản nháp; JSON hỏng thì undefined. Bot lạ hay cron sai thì đánh dấu chưa rõ kèm lý do. */
export function parseDraft(raw: string, bots: readonly BotBrief[]): Draft | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  let v: Record<string, unknown>
  try {
    v = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
  } catch {
    return undefined
  }
  const str = (k: string, max: number) =>
    typeof v[k] === 'string' ? (v[k] as string).trim().slice(0, max) : ''
  const issues: string[] = []
  let bot = str('bot', 60)
  const known = bots.find(
    (b) => b.id === bot || b.handle === bot || b.name.toLowerCase() === bot.toLowerCase(),
  )
  if (known) bot = known.id
  else {
    if (bot) issues.push(`Không có bot "${bot}" trong đội.`)
    bot = bots.find((b) => b.id === 'aris')?.id ?? bots[0]?.id ?? 'aris'
  }
  const cron = str('cron', 120)
  try {
    parseCron(cron)
  } catch (err) {
    issues.push(err instanceof CronError ? `Lịch chưa đọc được: ${err.message}` : 'Lịch chưa đọc được.')
  }
  const mode = v.mode === 'script' && str('command', 2000) ? 'script' : 'agent'
  const hours =
    typeof v.catchupHours === 'number' && v.catchupHours >= 0 && v.catchupHours <= 48
      ? v.catchupHours
      : CATCHUP_HOURS
  const question = [str('question', 300), ...issues].filter(Boolean).join(' ')
  return {
    title: str('title', 120) || 'Routine mới',
    bot,
    cron,
    tz: DEFAULT_TZ,
    task: str('task', 4000),
    deliver: v.deliver === 'none' ? 'none' : 'telegram',
    perms: v.perms === 'bot' ? 'bot' : 'read',
    catchupHours: hours,
    mode,
    ...(mode === 'script' ? { command: str('command', 2000) } : {}),
    clear: v.clear !== false && !issues.length && (mode === 'script' || !!str('task', 10)),
    ...(question ? { question } : {}),
  }
}

/** Lịch đọc được và vài lần chạy tới (màn 4.2, câu trả lời của công cụ). */
export function preview(cron: string, tz: string = DEFAULT_TZ, after = new Date(), n = 3) {
  const spec = parseCron(cron)
  const next: string[] = []
  let t: Date | undefined = after
  for (let i = 0; i < n && t; i++) {
    t = nextRun(spec, t, tz)
    if (t) next.push(t.toISOString())
  }
  return { when: humanCron(cron), next }
}
