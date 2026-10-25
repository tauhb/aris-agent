/**
 * Suy luận hồ sơ chủ nhân ba vòng (giai đoạn 5, đợt 5b; bản vẽ 2.3b): mỗi vài lượt, model rẻ đọc các lượt mới
 * (1) suy ra quan sát về người dùng, (2) tự soát bỏ điều thiếu bằng chứng, (3) hoà giải với hồ sơ hiện có (cùng ý,
 * ngược ý cần hỏi lại, hay mới). Thuần: dựng lời nhắc, đọc JSON trả về; đầu phiên chọn nhận định gần câu đầu nhất.
 */
import {
  AREAS,
  similarity,
  type Area,
  type Insight,
  type InsightOption,
  type Observation,
} from './insights.js'
import { fold } from './signals.js'

/** Suy luận sau mỗi ngần này lượt của một phiên (hay khi phiên đóng, nếu có từ 2 lượt). */
export const PROFILE_EVERY = 6
/** Trần tiền suy luận hồ sơ mỗi ngày cho cả đội (USD). */
export const PROFILE_DAILY_USD = 0.2
/** Đầu phiên nạp tối đa ngần này nhận định. */
export const WARM_MAX = 6

export interface Draft {
  text: string
  area: Area
  quote?: string | undefined
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? clip(v.trim(), n) : undefined)
const hardcoded = (text: string) => /\b(chu nhan)\b/.test(fold(text))

/** Đọc đối tượng JSON trong câu trả lời; sai định dạng thì undefined. */
export function jsonOf(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const v = JSON.parse(raw.slice(start, end + 1)) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const NAMING =
  'Nhắc tới người dùng thì viết "người dùng", không dùng anh, chị, chủ nhân. Mỗi câu một ý, ngắn, viết như một nhận định đứng riêng được.'

export function inferPrompt(o: { bot: string; transcript: string }): string {
  return `Bạn là bộ phận hiểu người dùng của ${o.bot}, một bot trong đội trợ lý AI cá nhân. Đọc các lượt làm việc gần đây và rút tối đa 5 QUAN SÁT VỀ NGƯỜI DÙNG (không phải về việc đang làm):
- area "communication": cách họ muốn được trả lời (độ dài, giọng, định dạng, kênh đọc, điều không thích).
- area "work": mục tiêu lớn, dự án họ đang dồn sức, nhịp làm việc (giờ làm sâu, khi nào duyệt), cách họ ra quyết định.
Mỗi quan sát kèm "quote": trích ngắn lời người dùng làm bằng chứng. Không có lời người dùng nào làm bằng chứng thì đừng ghi.
${NAMING}

Trả về DUY NHẤT JSON: {"observations": [{"text": "...", "area": "communication" | "work", "quote": "..."}]}

Các lượt làm việc:
${o.transcript}`
}

export function parseDrafts(raw: string, limit = 5): Draft[] {
  const list = jsonOf(raw)?.observations
  if (!Array.isArray(list)) return []
  const out: Draft[] = []
  for (const x of list) {
    const v = (x ?? {}) as Record<string, unknown>
    const text = str(v.text, 300)
    if (!text || hardcoded(text)) continue
    out.push({
      text,
      area: AREAS.includes(v.area as never) ? (v.area as Area) : 'communication',
      quote: str(v.quote, 300),
    })
  }
  return out.slice(0, limit)
}

export function critiquePrompt(o: { transcript: string; drafts: readonly Draft[] }): string {
  return `Bạn soát lại các quan sát về người dùng vừa rút ra từ đoạn làm việc dưới đây. Với mỗi quan sát, giữ (keep: true) khi có lời người dùng trong đoạn làm bằng chứng rõ và nó nói về con người họ (thói quen, sở thích, mục tiêu), dùng lại được về sau. Bỏ (keep: false, kèm "why" một câu ngắn) khi: chỉ đúng cho việc lần này, đoán mà không có lời người dùng, trích dẫn không khớp, nói về bot chứ không về người dùng, hay quá chung chung.

Trả về DUY NHẤT JSON: {"verdicts": [{"i": số thứ tự quan sát, "keep": true | false, "why": "..."}]}

Quan sát:
${o.drafts.map((d, i) => `${i}. (${d.area}) ${d.text} — bằng chứng: "${d.quote ?? ''}"`).join('\n')}

Đoạn làm việc:
${o.transcript}`
}

export interface Verdict {
  i: number
  keep: boolean
  why?: string | undefined
}

export function parseVerdicts(raw: string, n: number): Verdict[] {
  const list = jsonOf(raw)?.verdicts
  if (!Array.isArray(list)) return []
  const seen = new Set<number>()
  const out: Verdict[] = []
  for (const x of list) {
    const v = (x ?? {}) as Record<string, unknown>
    const i = typeof v.i === 'number' ? Math.round(v.i) : -1
    if (i < 0 || i >= n || seen.has(i)) continue
    seen.add(i)
    out.push({ i, keep: v.keep === true, why: str(v.why, 200) })
  }
  return out
}

export function reconcilePrompt(o: {
  drafts: readonly Draft[]
  profile: readonly { id: string; area: string; text: string; shared: boolean }[]
}): string {
  return `Đối chiếu các quan sát mới về người dùng với hồ sơ hiện có. Với mỗi quan sát:
- "supports" kèm "id" khi cùng ý chính với một nhận định có sẵn, dù viết khác chữ hay thêm chi tiết (ví dụ cùng nói về độ dài câu trả lời, cùng nói về việc đọc trên điện thoại). Chỉ coi là mới khi ý chính chưa có trong hồ sơ;
- "contradicts" kèm "id" khi ngược ý một nhận định có sẵn; thêm "question" hỏi người dùng muốn thế nào và 2–3 "options" ({"label": "nhãn ngắn trên nút", "text": "nhận định đầy đủ nếu chọn"});
- "new" khi chưa có gì tương tự.
${NAMING}

Trả về DUY NHẤT JSON: {"results": [{"i": số thứ tự quan sát, "action": "supports" | "contradicts" | "new", "id": "mã trong ngoặc vuông, không kèm ngoặc", "question": "...", "options": [{"label": "...", "text": "..."}]}]}

Quan sát mới:
${o.drafts.map((d, i) => `${i}. (${d.area}) ${d.text}`).join('\n')}

Hồ sơ hiện có ([chung] là hồ sơ mọi bot đọc):
${o.profile.length ? o.profile.map((p) => `- [${p.id}]${p.shared ? ' [chung]' : ''} (${p.area}) ${p.text}`).join('\n') : '(trống)'}`
}

/** Ghép quan sát đã giữ với kết quả hoà giải thành quan sát cho kho nhận định. */
export function reconciled(raw: string, drafts: readonly Draft[], ids: ReadonlySet<string>): Observation[] {
  const list = jsonOf(raw)?.results
  const by = new Map<number, Record<string, unknown>>()
  if (Array.isArray(list))
    for (const x of list) {
      const v = (x ?? {}) as Record<string, unknown>
      if (typeof v.i === 'number' && !by.has(Math.round(v.i))) by.set(Math.round(v.i), v)
    }
  return drafts.map((d, i) => {
    const v = by.get(i) ?? {}
    // Model hay chép cả dấu ngoặc của danh sách ("[i-…]").
    const raw = typeof v.id === 'string' ? v.id.replace(/[[\]\s"']/g, '') : ''
    const id = ids.has(raw) ? raw : undefined
    const options: InsightOption[] = Array.isArray(v.options)
      ? v.options.flatMap((o) => {
          const label = str((o as Record<string, unknown> | null)?.label, 40)
          const text = str((o as Record<string, unknown> | null)?.text, 300)
          return label && text && !hardcoded(text) ? [{ label, text }] : []
        })
      : []
    return {
      text: d.text,
      area: d.area,
      quote: d.quote,
      ...(v.action === 'supports' && id ? { supports: id } : {}),
      ...(v.action === 'contradicts' && id
        ? { contradicts: id, question: str(v.question, 300), ...(options.length ? { options } : {}) }
        : {}),
    }
  })
}

const effective = (i: Insight) => (i.confirmed ? 1 : i.confidence)

/**
 * Đầu phiên: chọn tối đa `max` nhận định đủ tin gần câu đầu của người dùng nhất. `relevance` (0–1) theo nghĩa
 * khi có vector, không thì theo từ trùng; xếp theo 0,6 × gần + 0,4 × tin cậy.
 */
export function warmPick(
  items: readonly Insight[],
  first: string,
  max = WARM_MAX,
  relevance: (i: Insight) => number = (i) => similarity(i.text, first),
): Insight[] {
  return [...items]
    .map((i) => ({ i, s: 0.6 * relevance(i) + 0.4 * effective(i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.i)
}
