/**
 * Lời nhắc và đọc kết quả của vòng học nền. Thuần: dựng đoạn hội thoại cho model đọc, đọc JSON
 * model trả về thành đề xuất ký ức.
 */
import { AREAS, type Observation } from './insights.js'
import { fold, type Reason, type TurnLog } from './signals.js'

export const BOOKS = ['owner', 'notes'] as const
export const KINDS = [
  'preference',
  'environment',
  'convention',
  'lesson',
  'project',
  'person',
  'event',
  'fact',
] as const
export const ORIGINS = ['user', 'inferred', 'external'] as const

export interface MemoryProposal {
  text: string
  book: (typeof BOOKS)[number]
  kind: (typeof KINDS)[number]
  tier: 'core' | 'archive'
  origin: (typeof ORIGINS)[number]
  why?: string | undefined
  quote?: string | undefined
}

/** Đầu vào tối đa mỗi lần học (khoảng 20 nghìn token). */
export const MAX_CHARS = 50_000

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Ghép các lượt thành văn bản cho model đọc; quá dài thì giữ phần cuối. */
export function transcriptOf(turns: readonly TurnLog[], maxChars = MAX_CHARS): string {
  const parts: string[] = []
  for (const t of turns) {
    for (const u of t.user) parts.push(`Người dùng: ${u.trim()}`)
    if (t.tools.length)
      parts.push(
        `Bot gọi công cụ: ${t.tools.map((c) => `${c.name}${c.brief ? `(${clip(c.brief, 120)})` : ''}${c.ok ? '' : ' → lỗi'}`).join('; ')}`,
      )
    for (const a of t.assistant) parts.push(`Bot: ${a.trim()}`)
  }
  const out = parts.join('\n\n')
  return out.length > maxChars ? `…${out.slice(out.length - maxChars)}` : out
}

const REASON_TEXT: Record<Reason, string> = {
  corrected: 'người dùng vừa sửa cách bot làm',
  remember: 'người dùng dặn nhớ mà bot chưa ghi',
  praised: 'người dùng khen cách bot vừa làm',
  long: 'bot vừa làm một việc nhiều bước',
  recovered: 'bot gặp lỗi rồi tự tìm ra cách',
  safety: 'đã lâu chưa xem lại',
}

export function reflectPrompt(o: {
  bot: string
  transcript: string
  existing: readonly string[]
  reasons: readonly Reason[]
  /** Hồ sơ người dùng hiện có của bot (mã, mảng, câu). */
  insights?: readonly { id: string; area: string; text: string }[]
  /**
   * Skill (đợt 3): có được đề xuất skill lần này không (việc nhiều bước, lỗi rồi tìm ra cách, hay
   * vừa dùng skill), skill đang dùng của bot (thân của skill vừa dùng trong đoạn học).
   */
  skills?: { allowed: boolean; active: readonly { name: string; description: string; body?: string }[] }
}): string {
  const sk = o.skills?.allowed ? o.skills : undefined
  return `Bạn là bộ phận tự học của ${o.bot}, một bot trong đội trợ lý AI cá nhân. Đọc lại đoạn làm việc dưới đây (${o.reasons.map((r) => REASON_TEXT[r]).join('; ')}).

PHẦN 1 · memories: chọn tối đa 3 điều đáng nhớ LÂU DÀI để lần sau làm tốt hơn (người dùng sẽ duyệt từng điều):
- Về người dùng (book "owner"): điều người dùng nói rõ hay sự thật về họ (quy ước họ đặt, người và dự án quan trọng). Thói quen, cách họ thích được trả lời mà bạn suy ra từ phản ứng của họ thì để ở PHẦN 2.
- Về cách làm việc của bot (book "notes"): bài học dùng lại được (cách làm hiệu quả, chỗ dễ sai và cách tránh), quy ước, môi trường (nơi để tài liệu, lệnh hay dùng).

Không chọn: tiến độ tạm thời của việc đang làm, chuyện xã giao, bí mật (mật khẩu, khoá, token), điều đã có trong danh sách ký ức hiện có, điều chỉ đúng một lần. Bài học phải tổng quát ("khi … thì …"), không phải nhật ký ("hôm nay bot đã …").

Nhắc tới người dùng thì viết "người dùng", không dùng anh, chị, chủ nhân.

origin: "user" khi người dùng nói ra điều đó; "inferred" khi bạn suy ra từ cách người dùng phản ứng hay từ việc bot làm; "external" khi điều đó chỉ thấy trong kết quả công cụ (trang web, tệp, email) chứ người dùng không nói.

PHẦN 2 · insights: tối đa 3 quan sát về NGƯỜI DÙNG rút từ cách họ làm việc và phản hồi trong đoạn này (không phải điều họ nói thẳng "nhớ là…"). area "communication": cách họ muốn được trả lời (độ dài, giọng, định dạng, điều không thích); area "work": công việc, mục tiêu, dự án, nhịp làm việc của họ. Nếu cùng ý một nhận định có sẵn thì ghi mã vào "supports" (giữ nguyên câu); nếu ngược ý thì ghi mã vào "contradicts", kèm "question" (hỏi người dùng muốn thế nào) và 2–3 "options" ({"label": "nhãn ngắn trên nút", "text": "nhận định đầy đủ nếu chọn"}). Chỉ ghi điều thấy rõ trong đoạn này, không đoán.

${
  sk
    ? `PHẦN 3 · skill: nếu đoạn này là một việc nhiều bước sẽ còn làm lại (báo cáo định kỳ, quy trình, cách xử lý một loại lỗi), viết TỐI ĐA MỘT skill: cách làm dùng lại được cho lần sau, dạng Markdown với các mục "## Khi nào dùng", "## Các bước" (đánh số, mỗi bước một việc cụ thể), "## Lỗi thường gặp". Nếu người dùng vừa sửa kết quả của một việc đã dùng skill có sẵn, viết BẢN VÁ: giữ đúng tên skill đó, thân là toàn bộ skill sau khi sửa. Skill là chỉ dẫn chung, không phải nhật ký: không ghi ngày, không kể "bot đã làm…", gọi là "người dùng". Việc một lần hay chuyện trò thì để "skill": null. Tên skill: chữ thường không dấu, nối bằng "-".

`
    : ''
}Trả về DUY NHẤT một đối tượng JSON:
{"memories": [{"text": "một câu ngắn", "book": "owner" | "notes", "kind": một trong ${KINDS.join(', ')}, "tier": "core" (cần nhớ mọi lúc) | "archive" (tìm khi cần), "origin": "user" | "inferred" | "external", "why": "vì sao đáng nhớ, một câu", "quote": "trích ngắn lời người dùng hoặc sự việc làm bằng chứng"}],
 "insights": [{"text": "một câu về người dùng", "area": "communication" | "work", "quote": "trích ngắn làm bằng chứng", "supports": "mã nếu cùng ý", "contradicts": "mã nếu ngược ý", "question": "...", "options": [{"label": "...", "text": "..."}]}]${sk ? ',\n "skill": {"name": "ten-skill", "description": "dùng khi nào, một câu", "whenToUse": "dấu hiệu nên dùng", "body": "Markdown", "why": "vì sao cần skill hay bản vá này", "quote": "trích ngắn làm bằng chứng"} | null' : ''}}
Phần nào không có gì thì để mảng rỗng.

Ký ức hiện có của ${o.bot} (cả đề xuất đang chờ duyệt):
${o.existing.length ? o.existing.map((t) => `- ${t}`).join('\n') : '(trống)'}

Nhận định hiện có của ${o.bot} về người dùng:
${o.insights?.length ? o.insights.map((i) => `- [${i.id}] (${i.area}) ${i.text}`).join('\n') : '(trống)'}
${
  sk
    ? `
Skill đang dùng của ${o.bot}:
${sk.active.length ? sk.active.map((s) => `- ${s.name}: ${s.description}${s.body ? `\n<skill name="${s.name}">\n${s.body}\n</skill>` : ''}`).join('\n') : '(chưa có)'}
`
    : ''
}
Đoạn làm việc:
${o.transcript}`
}

/** Skill mới hay bản vá vòng học đề xuất (đợt 3). */
export interface SkillProposal {
  name: string
  description: string
  whenToUse?: string | undefined
  body: string
  why?: string | undefined
  quote?: string | undefined
}

export interface Reflection {
  memories: MemoryProposal[]
  insights: Observation[]
  skill?: SkillProposal | undefined
}

/** Tên skill hợp lệ từ chữ bất kỳ ("Báo cáo tuần" → "bao-cao-tuan"). */
export const slug = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')

const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? clip(v.trim(), n) : undefined)
/** Câu viết cứng cách xưng hô bị bỏ: ký ức và nhận định phải nói "người dùng". */
const hardcoded = (text: string) => /\b(chu nhan)\b/.test(fold(text))

/** Đọc đối tượng JSON trong câu trả lời (có thể trong khối ```json); sai định dạng thì rỗng. */
export function parseReflection(raw: string, limit = 3): Reflection {
  const empty: Reflection = { memories: [], insights: [] }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return empty
  let data: unknown
  try {
    data = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return empty
  }
  if (!data || typeof data !== 'object') return empty
  const { memories, insights, skill } = data as { memories?: unknown; insights?: unknown; skill?: unknown }
  const s = skill && typeof skill === 'object' ? (skill as Record<string, unknown>) : undefined
  const name = s && typeof s.name === 'string' ? slug(s.name) : ''
  const body = s && typeof s.body === 'string' ? s.body.trim() : ''
  const description = str(s?.description, 300)
  return {
    memories: Array.isArray(memories) ? memoriesOf(memories, limit) : [],
    insights: Array.isArray(insights) ? insightsOf(insights, limit) : [],
    ...(name && body && description
      ? {
          skill: {
            name,
            description,
            whenToUse: str(s!.whenToUse, 300),
            body,
            why: str(s!.why, 300),
            quote: str(s!.quote, 300),
          },
        }
      : {}),
  }
}

function insightsOf(list: unknown[], limit: number): Observation[] {
  const out: Observation[] = []
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const v = x as Record<string, unknown>
    const text = str(v.text, 300)
    if (!text || hardcoded(text)) continue
    const options = Array.isArray(v.options)
      ? v.options.flatMap((o) => {
          const label = str((o as Record<string, unknown> | null)?.label, 40)
          const t = str((o as Record<string, unknown> | null)?.text, 300)
          return label && t && !hardcoded(t) ? [{ label, text: t }] : []
        })
      : []
    out.push({
      text,
      area: AREAS.includes(v.area as never) ? (v.area as Observation['area']) : 'communication',
      quote: str(v.quote, 300),
      supports: str(v.supports, 40),
      contradicts: str(v.contradicts, 40),
      question: str(v.question, 300),
      ...(options.length ? { options } : {}),
    })
  }
  return out.slice(0, limit)
}

function memoriesOf(list: unknown[], limit: number): MemoryProposal[] {
  const out: MemoryProposal[] = []
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const v = x as Record<string, unknown>
    const text = str(v.text, 400)
    if (!text || hardcoded(text)) continue
    const origin = ORIGINS.includes(v.origin as never) ? (v.origin as MemoryProposal['origin']) : 'inferred'
    out.push({
      text,
      book: BOOKS.includes(v.book as never) ? (v.book as MemoryProposal['book']) : 'notes',
      kind: KINDS.includes(v.kind as never) ? (v.kind as MemoryProposal['kind']) : 'lesson',
      // Điều chỉ thấy ở nguồn ngoài không bao giờ lên lõi.
      tier: v.tier === 'core' && origin !== 'external' ? 'core' : 'archive',
      origin,
      why: str(v.why, 300),
      quote: str(v.quote, 300),
    })
  }
  return out.slice(0, limit)
}
