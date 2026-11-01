/**
 * Bộ não trong khung chat (giai đoạn 5, đợt 3b; bản vẽ 5.7): danh sách trang để dựng nhãn `[[...]]`,
 * tìm trang theo tên hay tiêu đề, gọi API `/api/aris/brain` của `@aris/brain`.
 */
export interface BrainPage {
  name: string
  title: string
  path: string
  space: 'ca-nhan' | 'cong-ty'
  layer: string
}

export interface PickPage extends BrainPage {
  dept: string | null
  group: string | null
  readable: boolean
}

export const brainUrl = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)

/** Bỏ dấu, chữ thường (như chỉ mục của bộ não; `đ` thành `d`). */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()

/** `[[tên]]`, `[[tên|chữ hiện]]`, `[[tên#mục]]` trong một đoạn chữ. */
export const LINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g

let cache: { at: number; pages: BrainPage[] } | undefined
let loading: Promise<BrainPage[]> | undefined

/** Danh sách trang (giữ 60 giây); lỗi thì danh sách rỗng. */
export function brainPages(): Promise<BrainPage[]> {
  if (cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.pages)
  loading ??= fetch(brainUrl('?names=1'))
    .then((r) => (r.ok ? (r.json() as Promise<{ pages: BrainPage[] }>) : { pages: [] }))
    .then((j) => {
      cache = { at: Date.now(), pages: j.pages }
      return j.pages
    })
    .catch(() => cache?.pages ?? [])
    .finally(() => {
      loading = undefined
    })
  return loading
}

/** Danh sách đã tải (rỗng khi chưa tải xong). */
export const cachedPages = () => cache?.pages ?? []

/** Trang theo `[[tên]]` hay `[[Tiêu đề]]`; trang wiki đứng trước khi trùng. */
export function findPage(pages: readonly BrainPage[], ref: string): BrainPage | undefined {
  const raw = ref.trim().replace(/\.md$/i, '').split('/').pop() ?? ''
  const f = fold(raw)
  const hits = pages.filter((p) => p.name === raw || fold(p.name) === f || fold(p.title) === f)
  return hits.find((p) => p.layer === 'wiki') ?? hits[0]
}

/** Trang khớp chữ gõ (đầu từ của tiêu đề hay tên), cho menu `@`. */
export function matchPages(pages: readonly BrainPage[], query: string, limit = 6): BrainPage[] {
  const q = fold(query)
  if (q.length < 2) return []
  const score = (p: BrainPage) => {
    const t = fold(p.title)
    if (t.startsWith(q) || p.name.startsWith(q.replace(/\s+/g, '-'))) return 0
    if (t.split(/\s+/).some((w) => w.startsWith(q))) return 1
    return t.includes(q) ? 2 : -1
  }
  return pages
    .filter((p) => p.layer === 'wiki')
    .map((p) => [p, score(p)] as const)
    .filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([p]) => p)
}

/** Lớp của trang thành lớp CSS của nhãn: wiki (cam), nguồn (xám), nhật ký (xanh). */
export const layerClass = (layer: string) => (layer === 'nguon' ? 'src' : layer === 'nhat-ky' ? 'jr' : '')

/** Tóm tắt của trang: nhãn `tom-tat` ở đầu trang, không có thì đoạn đầu (bỏ tiêu đề). */
export function summaryOf(text: string, max = 220): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const tom = front && /^tom-tat:\s*"?(.+?)"?\s*$/m.exec(front[1]!)
  const body = (front ? text.slice(front[0].length) : text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'))
  const s = (tom?.[1] ?? body ?? '')
    .replace(LINK, (_m, a: string, b?: string) => b || a)
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}
