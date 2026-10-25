/**
 * Đọc một trang Markdown của bộ não: nhãn đầu trang (YAML), tiêu đề, liên kết `[[...]]`, chữ để lập chỉ
 * mục, đoạn trích quanh từ khoá. Thuần.
 */
import { parse } from 'yaml'

export interface Parsed {
  meta: Record<string, unknown>
  /** Phần thân (bỏ nhãn đầu trang). */
  body: string
  title: string
  /** Tên trang được trỏ tới (`[[ten]]`, `[[ten|chữ hiện]]`, `[[ten#mục]]`), không trùng. */
  links: string[]
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function parsePage(text: string, fallbackTitle: string): Parsed {
  let meta: Record<string, unknown> = {}
  let body = text
  const m = FRONT.exec(text)
  if (m) {
    try {
      const v = parse(m[1]!) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) meta = v as Record<string, unknown>
    } catch {
      // Nhãn đầu trang hỏng: coi như không có, vẫn đọc phần thân.
    }
    body = text.slice(m[0].length)
  }
  const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)?.[1]
  const title = (typeof meta['tieu-de'] === 'string' && meta['tieu-de']) || heading || fallbackTitle
  return { meta, body, title: title.trim(), links: linksOf(body) }
}

/** Tên các trang được trỏ tới trong một đoạn Markdown. */
export function linksOf(md: string): string[] {
  const out = new Set<string>()
  for (const m of md.matchAll(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) {
    const name = m[1]!.trim().replace(/\.md$/i, '')
    if (name) out.add(name.split('/').pop()!)
  }
  return [...out]
}

/** Nhãn dạng chuỗi hoặc danh sách thành danh sách chuỗi. */
export function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

/**
 * Bỏ dấu một ký tự mà giữ nguyên độ dài chuỗi (mỗi ký tự thành đúng một ký tự), để vị trí khớp trên chữ
 * đã bỏ dấu dùng được trên chữ gốc.
 */
export function fold(s: string): string {
  let out = ''
  for (const ch of s) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const one = (ch === 'đ' || ch === 'Đ' ? 'd' : base.length === ch.length ? base : ch).toLowerCase()
    out += one.length === ch.length ? one : ch
  }
  return out
}

/** Chữ đưa vào chỉ mục tìm kiếm: bỏ dấu, chữ thường (bộ tách từ của SQLite không đổi `đ`). */
export const searchText = (s: string) => fold(s.normalize('NFC'))

/** Từ khoá của câu tìm: bỏ dấu, bỏ ký tự đặc biệt của FTS. */
export function terms(query: string): string[] {
  return searchText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 12)
}

/**
 * Từ đệm của câu hỏi tự nhiên ("mình đã quyết gì về…"): xét trên chữ có dấu, vì bỏ dấu rồi thì "có" và
 * "cô", "đã" và "da" trùng nhau.
 */
const FILLER = new Set(
  (
    'mình tôi đã đang sẽ gì về của cho là và với các những một nào khi thì có không được này đó kia ở tại ' +
    'thế sao bao nhiêu như để từ đến trong ra vào rồi chưa hay hoặc mà nhé ạ ơi giúp hãy nhỉ vậy đấy cái ' +
    'việc điều nên phải cần muốn biết'
  ).split(' '),
)

/** Từ khoá chính của câu tìm: bỏ từ đệm (câu toàn từ đệm thì giữ nguyên). */
export function keyTerms(query: string): string[] {
  const words = query
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const kept = words.filter((w) => !FILLER.has(w))
  return terms((kept.length ? kept : words).join(' '))
}

/**
 * Câu truy vấn FTS5 theo từ khoá chính. `all`: mọi từ đều phải có, từ cuối khớp tiền tố; `any`: chỉ cần
 * một từ (tìm nới khi tìm đủ từ không ra).
 */
export function ftsQuery(query: string, mode: 'all' | 'any' = 'all'): string | undefined {
  const ws = keyTerms(query)
  if (!ws.length) return undefined
  return ws.map((w, i) => `"${w}"${i === ws.length - 1 ? '*' : ''}`).join(mode === 'all' ? ' ' : ' OR ')
}

/** Đoạn trích quanh lần khớp đầu tiên (trên chữ gốc), tối đa `width` ký tự. */
export function snippetOf(body: string, query: string, width = 180): string {
  const plain = body
    .replace(FRONT, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\^[^\]\n]*\]:?/g, '')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_m, a: string, b?: string) => b || a)
    .replace(/[#>*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const f = fold(plain)
  // Chỗ khớp nhiều từ khoá khác nhau nhất trong một khung trích.
  const ws = keyTerms(query)
  const lead = Math.floor(width / 3)
  let hit: number | undefined
  let best = 0
  for (const w of ws)
    for (let i = f.indexOf(w), n = 0; i >= 0 && n < 20; i = f.indexOf(w, i + 1), n++) {
      const from = Math.max(0, i - lead)
      const win = f.slice(from, from + width)
      const score = ws.filter((x) => win.includes(x)).length
      if (score > best) [best, hit] = [score, i]
    }
  if (hit === undefined) return plain.slice(0, width) + (plain.length > width ? '…' : '')
  const start = Math.max(0, hit - lead)
  const end = Math.min(plain.length, start + width)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`
}
