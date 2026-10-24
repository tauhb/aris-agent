/**
 * Lời nhắc và đọc kết quả của vòng học nền. Thuần: dựng đoạn hội thoại cho model đọc, đọc JSON
 * model trả về thành đề xuất ký ức.
 */
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
}): string {
  return `Bạn là bộ phận tự học của ${o.bot}, một bot trong đội trợ lý AI cá nhân. Đọc lại đoạn làm việc dưới đây (${o.reasons.map((r) => REASON_TEXT[r]).join('; ')}) và chọn tối đa 3 điều đáng nhớ LÂU DÀI để lần sau làm tốt hơn:
- Về người dùng (book "owner"): sở thích, thói quen, quy ước, cách họ muốn được làm việc, người và dự án quan trọng.
- Về cách làm việc của bot (book "notes"): bài học dùng lại được (cách làm hiệu quả, chỗ dễ sai và cách tránh), quy ước, môi trường (nơi để tài liệu, lệnh hay dùng).

Không chọn: tiến độ tạm thời của việc đang làm, chuyện xã giao, bí mật (mật khẩu, khoá, token), điều đã có trong danh sách ký ức hiện có, điều chỉ đúng một lần. Bài học phải tổng quát ("khi … thì …"), không phải nhật ký ("hôm nay bot đã …").

Nhắc tới người dùng thì viết "người dùng", không dùng anh, chị, chủ nhân.

origin: "user" khi người dùng nói ra điều đó; "inferred" khi bạn suy ra từ cách người dùng phản ứng hay từ việc bot làm; "external" khi điều đó chỉ thấy trong kết quả công cụ (trang web, tệp, email) chứ người dùng không nói.

Trả về DUY NHẤT một đối tượng JSON:
{"memories": [{"text": "một câu ngắn", "book": "owner" | "notes", "kind": một trong ${KINDS.join(', ')}, "tier": "core" (cần nhớ mọi lúc) | "archive" (tìm khi cần), "origin": "user" | "inferred" | "external", "why": "vì sao đáng nhớ, một câu", "quote": "trích ngắn lời người dùng hoặc sự việc làm bằng chứng"}]}
Không có gì đáng nhớ thì trả {"memories": []}.

Ký ức hiện có của ${o.bot} (cả đề xuất đang chờ duyệt):
${o.existing.length ? o.existing.map((t) => `- ${t}`).join('\n') : '(trống)'}

Đoạn làm việc:
${o.transcript}`
}

/** Đọc đối tượng JSON trong câu trả lời (có thể trong khối ```json); sai định dạng thì rỗng. */
export function parseReflection(raw: string, limit = 3): { memories: MemoryProposal[] } {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { memories: [] }
  let data: unknown
  try {
    data = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return { memories: [] }
  }
  const list = (data as { memories?: unknown } | null)?.memories
  if (!Array.isArray(list)) return { memories: [] }
  const out: MemoryProposal[] = []
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? clip(v.trim(), n) : undefined)
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const v = x as Record<string, unknown>
    const text = str(v.text, 400)
    // Câu viết cứng cách xưng hô bị bỏ: ký ức phải nói "người dùng".
    if (!text || /\b(chu nhan)\b/.test(fold(text))) continue
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
  return { memories: out.slice(0, limit) }
}
