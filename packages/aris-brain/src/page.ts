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

/** Câu truy vấn FTS5: mọi từ đều phải có, từ cuối khớp tiền tố. */
export function ftsQuery(query: string): string | undefined {
  const ws = terms(query)
  if (!ws.length) return undefined
  return ws.map((w, i) => `"${w}"${i === ws.length - 1 ? '*' : ''}`).join(' ')
}

/** Đoạn trích quanh lần khớp đầu tiên (trên chữ gốc), tối đa `width` ký tự. */
export function snippetOf(body: string, query: string, width = 180): string {
  const plain = body
    .replace(FRONT, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const f = fold(plain)
  const hit = terms(query)
    .map((w) => f.indexOf(w))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0]
  if (hit === undefined) return plain.slice(0, width) + (plain.length > width ? '…' : '')
  const start = Math.max(0, hit - Math.floor(width / 3))
  const end = Math.min(plain.length, start + width)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`
}
