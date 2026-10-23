/**
 * Nhận diện aris ở những chỗ dsh viết cứng tên mình: tiêu đề tab trình duyệt
 * ("Tên phiên — DeepSeek Harness") và biểu tượng tab.
 */
import { THEMES } from '@aris/ui-kit'

export const PRODUCT = 'aris'
const DSH_PRODUCT = 'DeepSeek Harness'

/** Đổi tên sản phẩm ở cuối tiêu đề mà dsh đặt; tiêu đề khác giữ nguyên. */
export function arisTitle(title: string): string {
  if (title === DSH_PRODUCT) return PRODUCT
  const suffix = ` — ${DSH_PRODUCT}`
  return title.endsWith(suffix) ? `${title.slice(0, -suffix.length)} — ${PRODUCT}` : title
}

/** Dấu aris (khối tròn hai mắt) cho biểu tượng tab, hợp nền sáng hoặc tối của trình duyệt. */
export function faviconHref(theme: 'light' | 'dark'): string {
  const { ink, panel } = THEMES[theme]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M50 8C76 8 92 24 92 50C92 76 76 92 50 92C24 92 8 76 8 50C8 24 24 8 50 8Z" fill="${ink}"/>` +
    `<path d="M52 36L48 50M65 34L61 48" stroke="${panel}" stroke-width="9" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Giữ tiêu đề tab mang tên aris mỗi khi dsh đặt lại; trả về hàm gỡ. */
export function keepArisTitle(doc: Document = document): () => void {
  const sync = () => {
    const next = arisTitle(doc.title)
    if (next !== doc.title) doc.title = next
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(doc.head, { subtree: true, childList: true, characterData: true })
  return () => {
    observer.disconnect()
    if (doc.title === PRODUCT || doc.title.endsWith(` — ${PRODUCT}`))
      doc.title = doc.title === PRODUCT ? DSH_PRODUCT : `${doc.title.slice(0, -PRODUCT.length)}${DSH_PRODUCT}`
  }
}

/** Thay biểu tượng tab của dsh (bản sáng và tối theo `media`); trả về hàm khôi phục. */
export function useArisFavicon(doc: Document = document): () => void {
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
  const original = links.map((l) => l.href)
  for (const l of links) l.href = faviconHref(l.media.includes('dark') ? 'dark' : 'light')
  return () => links.forEach((l, i) => (l.href = original[i]!))
}
