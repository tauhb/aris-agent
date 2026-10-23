/**
 * Lưu trước khi nén: khi dsh nén một đoạn hội thoại, đọc lại đoạn đó (còn nguyên trong
 * nhật ký) và nhờ model rút ra ký ức đáng giữ. Ký ức rút ra là bot suy ra nên vào lưu
 * trữ, không tự lên lõi.
 */
import { BOOKS, KINDS, fold, type Book, type Kind } from './store.js'

export interface TranscriptLine {
  seq: number
  role: 'user' | 'assistant'
  text: string
}

export interface Candidate {
  text: string
  book: Book
  kind: Kind
}

/** Ghép đoạn hội thoại thành văn bản cho model đọc, cắt bớt khi quá dài (giữ phần cuối). */
export function transcriptText(lines: readonly TranscriptLine[], maxChars = 24000): string {
  const out = lines.map((l) => `${l.role === 'user' ? 'Người dùng' : 'Bot'}: ${l.text.trim()}`).join('\n\n')
  return out.length > maxChars ? `…${out.slice(out.length - maxChars)}` : out
}

export function reflectPrompt(transcript: string, existing: readonly string[]): string {
  return `Bạn là bộ phận trí nhớ của trợ lý cá nhân. Đoạn hội thoại dưới đây sắp được tóm tắt để tiết kiệm ngữ cảnh. Hãy rút ra những điều đáng nhớ LÂU DÀI mà nếu mất sẽ đáng tiếc: sở thích, thói quen, quy ước làm việc của người dùng; người, dự án, sự kiện quan trọng; bài học về cách làm. Bỏ qua tiến độ tạm thời của việc đang làm, chuyện xã giao, và bí mật (mật khẩu, khoá, token).

Không lặp lại điều đã có trong danh sách ký ức hiện có.

Trả về DUY NHẤT một mảng JSON, mỗi phần tử {"text": "một câu ngắn", "book": "owner" (về người dùng) hoặc "notes" (môi trường, quy ước, bài học), "kind": một trong ${KINDS.join(', ')}}. Không có gì đáng nhớ thì trả về [].

Ký ức hiện có:
${existing.length ? existing.map((t) => `- ${t}`).join('\n') : '(trống)'}

Đoạn hội thoại:
${transcript}`
}

/** Đọc mảng JSON trong câu trả lời của model (có thể nằm trong khối \`\`\`json). Sai định dạng thì bỏ. */
export function parseCandidates(raw: string, limit = 8): Candidate[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let data: unknown
  try {
    data = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Candidate[] = []
  for (const x of data) {
    if (!x || typeof x !== 'object') continue
    const { text, book, kind } = x as Record<string, unknown>
    if (typeof text !== 'string' || !text.trim() || text.length > 400) continue
    out.push({
      text: text.trim(),
      book: BOOKS.includes(book as Book) ? (book as Book) : 'owner',
      kind: KINDS.includes(kind as Kind) ? (kind as Kind) : 'fact',
    })
  }
  return out.slice(0, limit)
}

const tokens = (s: string) =>
  new Set(
    fold(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  )

/** Mức trùng giữa hai câu (Jaccard theo từ đã bỏ dấu). */
export function overlap(a: string, b: string): number {
  const x = tokens(a)
  const y = tokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / (x.size + y.size - common)
}

/** Bỏ ký ức gần trùng với ký ức đã có hoặc với nhau. */
export function dedupe(
  candidates: readonly Candidate[],
  existing: readonly string[],
  threshold = 0.6,
): Candidate[] {
  const kept: Candidate[] = []
  for (const c of candidates) {
    const seen = [...existing, ...kept.map((k) => k.text)]
    if (!seen.some((t) => overlap(t, c.text) >= threshold)) kept.push(c)
  }
  return kept
}
