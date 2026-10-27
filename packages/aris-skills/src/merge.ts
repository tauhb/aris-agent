/**
 * Gộp skill trùng (đặc tả: docs/specs/aris-skills.md, đợt 8.2). Phần thuần: tìm cặp nghi trùng không tốn tiền,
 * lời nhờ model xác nhận và đọc kết quả. Không bao giờ tự gộp: kết quả thành đề xuất chờ duyệt.
 */
import { fold } from './lint.js'

export interface DupSkill {
  id: string
  bot: string
  name: string
  description: string
  whenToUse?: string | undefined
  /** Thân của bản đang dùng. */
  body: string
}

export interface DupPair {
  a: DupSkill
  b: DupSkill
  score: number
}

/** Điểm giống từ ngần này trở lên là nghi trùng; mỗi lần chạy xét tối đa ngần này cặp. */
export const DUP_THRESHOLD = 0.45
export const DUP_MAX_PAIRS = 10
/** Cặp đã bị từ chối gộp thì không đề xuất lại trong ngần này ngày. */
export const MERGE_SKIP_DAYS = 90
/** Trần tiền model cho một lần tìm skill trùng (USD). */
export const DUP_CAP_USD = 0.05

const words = (s: string) =>
  new Set(
    fold(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  )

const jaccard = (x: ReadonlySet<string>, y: ReadonlySet<string>) => {
  if (!x.size || !y.size) return 0
  let c = 0
  for (const w of x) if (y.has(w)) c++
  return c / (x.size + y.size - c)
}

/** Tiêu đề các mục `##` của thân skill (bỏ dấu, viết thường). */
export const headingsOf = (body: string): Set<string> =>
  new Set(
    body
      .split('\n')
      .map((l) => /^#{2,3}\s+(.+?)\s*$/.exec(l)?.[1])
      .filter((h): h is string => !!h)
      .map((h) =>
        fold(h)
          .replace(/[^a-z0-9 ]+/g, '')
          .trim(),
      ),
  )

/** Điểm giống của hai skill: Jaccard theo từ của tên, mô tả, khi nào dùng; cộng 0,25 Jaccard của tiêu đề mục. */
export function similarity(a: DupSkill, b: DupSkill): number {
  const text = (s: DupSkill) => words(`${s.name.replace(/-/g, ' ')} ${s.description} ${s.whenToUse ?? ''}`)
  const base = jaccard(text(a), text(b))
  const heads = jaccard(headingsOf(a.body), headingsOf(b.body))
  return Math.min(1, base + 0.25 * heads)
}

/** Khoá của một cặp, không phụ thuộc thứ tự. */
export const pairKey = (x: string, y: string) => [x, y].sort().join('|')

/** Cặp nghi trùng trong cùng một bot, điểm cao trước. `skip` là các khoá cặp bỏ qua. */
export function duplicateCandidates(
  skills: readonly DupSkill[],
  skip: ReadonlySet<string> = new Set(),
): DupPair[] {
  const out: DupPair[] = []
  for (let i = 0; i < skills.length; i++)
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i]!
      const b = skills[j]!
      if (a.bot !== b.bot || skip.has(pairKey(a.id, b.id))) continue
      const score = similarity(a, b)
      if (score >= DUP_THRESHOLD) out.push({ a, b, score })
    }
  return out.sort((x, y) => y.score - x.score).slice(0, DUP_MAX_PAIRS)
}

export interface MergeAnswer {
  relation: 'duplicate' | 'overlap' | 'distinct'
  /** Tên skill giữ lại (một trong hai). */
  keep: string
  reason: string
  /** Thân gộp; chỉ có khi `duplicate`. */
  merged?: string | undefined
}

export function mergePrompt(a: DupSkill, b: DupSkill): string {
  const show = (s: DupSkill) =>
    `Tên: ${s.name}\nMô tả: ${s.description}${s.whenToUse ? `\nKhi nào dùng: ${s.whenToUse}` : ''}\nThân:\n${s.body.slice(0, 6000)}`
  return `Hai skill của cùng một trợ lý AI có vẻ trùng nhau. Đọc và kết luận.

=== Skill A ===
${show(a)}

=== Skill B ===
${show(b)}

Phân loại:
- "duplicate": cùng một việc, cùng cách làm; giữ một skill là đủ. Khi đó soạn "merged": thân skill gộp, giữ mọi bước và lưu ý có giá trị của cả hai, bỏ phần lặp, viết tiếng Việt, chuẩn Markdown, có mục "Khi nào dùng", "Các bước", "Lỗi thường gặp", "Kiểm tra" nếu bản gốc có.
- "overlap": chồng nhau một phần nhưng mỗi skill còn việc riêng; để nguyên cả hai.
- "distinct": hai việc khác nhau.

"keep" là tên skill giữ lại (đúng tên A hoặc B, ưu tiên skill rõ hơn hay đang được dùng nhiều hơn).

Trả về DUY NHẤT JSON {"relation": "duplicate" | "overlap" | "distinct", "keep": "<tên A hoặc B>", "reason": "một câu", "merged": "<thân gộp, chỉ khi duplicate>"}.`
}

/** Đọc kết quả của model; JSON hỏng, tên lạ, thiếu thân gộp khi `duplicate` thì bỏ (undefined). */
export function parseMerge(raw: string, names: readonly [string, string]): MergeAnswer | undefined {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s < 0 || e <= s) return undefined
  try {
    const v = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    if (v.relation !== 'duplicate' && v.relation !== 'overlap' && v.relation !== 'distinct') return undefined
    const str = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '')
    const keep = str(v.keep, 80)
    const reason = str(v.reason, 300) || '—'
    if (v.relation !== 'duplicate')
      return { relation: v.relation, keep: names.includes(keep) ? keep : names[0], reason }
    const merged = str(v.merged, 24_000)
    if (!names.includes(keep) || !merged) return undefined
    return { relation: 'duplicate', keep, reason, merged }
  } catch {
    return undefined
  }
}
