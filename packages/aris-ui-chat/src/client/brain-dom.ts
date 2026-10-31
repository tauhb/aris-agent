/**
 * Nhãn trang bộ não trong câu trả lời của bot (bản vẽ 5.7 A): như tên thành viên (`mentions-dom.ts`),
 * Markdown của dsh không có chỗ cắm cho chữ thường nên aris thay `[[...]]` trong DOM khi chữ đứng yên;
 * dsh vẽ lại đoạn nào thì trả đoạn đó về nguyên trạng trước. Bấm nhãn mở thẻ xem nhanh.
 */
import { brainUrl, findPage, layerClass, LINK, summaryOf, type BrainPage } from './brain-data.js'

/** Phần trả lời của bot trong khung chat dsh (không gồm phần suy nghĩ, công cụ). */
const SCOPE = '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'
const SKIP = 'code,pre,a,button,textarea,input,[contenteditable],.aris-pg'
const SETTLE_MS = 500

export interface PeekText {
  open: string
  missing: string
  backlinks: (n: number) => string
  layer: (layer: string) => string
  space: (space: string) => string
}

const ICON = {
  page: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path></svg>',
  src: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"></rect><path d="M5 9v10h14V9"></path></svg>',
}

/** Phần tử nhãn: trang có thì bấm được (màu theo lớp), chưa có thì viền chấm. */
export function pageElement(
  doc: Document,
  ref: string,
  shown: string | undefined,
  page?: BrainPage,
): HTMLElement {
  if (!page) {
    const el = doc.createElement('span')
    el.className = 'aris-pg none'
    el.textContent = shown || ref
    return el
  }
  const el = doc.createElement('button')
  el.type = 'button'
  el.className = `aris-pg ${layerClass(page.layer)}`.trim()
  el.dataset.path = page.path
  el.innerHTML = page.layer === 'nguon' ? ICON.src : ICON.page
  el.append(doc.createTextNode(shown || page.title))
  return el
}

/** Thẻ xem nhanh một trang, đặt dưới nhãn; Esc hay bấm ra ngoài thì đóng. */
export function openPeek(
  anchor: HTMLElement,
  page: BrainPage,
  text: PeekText,
  go: (page: BrainPage) => void,
  doc: Document = document,
): () => void {
  doc.querySelector('.aris-peek')?.remove()
  const box = doc.createElement('div')
  box.className = 'aris aris-peek'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-label', page.title)
  const head = doc.createElement('div')
  head.className = 'hd'
  const b = doc.createElement('b')
  b.textContent = page.title
  const layerEl = doc.createElement('span')
  layerEl.className = `lay ${layerClass(page.layer)}`.trim()
  layerEl.textContent = text.layer(page.layer)
  const where = doc.createElement('span')
  where.className = 'mut'
  where.textContent = text.space(page.space)
  head.append(b, layerEl, where)
  const sum = doc.createElement('div')
  sum.className = 'sum'
  sum.textContent = '…'
  const meta = doc.createElement('div')
  meta.className = 'mut'
  const link = doc.createElement('button')
  link.type = 'button'
  link.className = 'go'
  link.textContent = text.open
  link.onclick = () => {
    close()
    go(page)
  }
  box.append(head, sum, meta, link)
  doc.body.append(box)
  const r = anchor.getBoundingClientRect()
  const w = 340
  box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`
  box.style.top = `${r.bottom + 6}px`
  if (r.bottom + 200 > window.innerHeight) box.style.top = `${Math.max(8, r.top - 6 - 180)}px`
  void fetch(brainUrl(`?page=${encodeURIComponent(page.path)}`))
    .then((res) => (res.ok ? res.json() : undefined))
    .then((j: { text?: string; backlinks?: unknown[] } | undefined) => {
      sum.textContent = j?.text ? summaryOf(j.text) || '—' : text.missing
      if (j?.backlinks) meta.textContent = text.backlinks(j.backlinks.length)
    })
    .catch(() => {
      sum.textContent = text.missing
    })
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
  const onDown = (e: MouseEvent) => {
    if (!box.contains(e.target as Node) && e.target !== anchor) close()
  }
  function close() {
    box.remove()
    doc.removeEventListener('keydown', onKey)
    doc.removeEventListener('mousedown', onDown, true)
  }
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('mousedown', onDown, true)
  link.focus()
  return close
}

interface Split {
  full: string
  added: Node[]
}

/**
 * Theo dõi khung chat, thay `[[...]]` trong câu trả lời của bot bằng nhãn trang.
 * @param pages - danh sách trang đã tải (tải lại khi cần).
 * @param peek - bấm nhãn: mở thẻ xem nhanh.
 * @returns hàm gỡ: trả mọi đoạn chữ về nguyên trạng.
 */
export function watchPageLinks(
  pages: () => readonly BrainPage[],
  refresh: () => Promise<unknown>,
  peek: (el: HTMLElement, page: BrainPage) => void,
  doc: Document = document,
): () => void {
  const splits = new Map<Text, Split>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const drop = (node: Text) => {
    const s = splits.get(node)
    if (!s) return
    for (const n of s.added) n.parentNode?.removeChild(n)
    splits.delete(node)
  }

  const decorate = (node: Text, list: readonly BrainPage[]) => {
    const full = node.data
    const added: Node[] = []
    let last = 0
    let after: Node = node
    let first = true
    const push = (n: Node) => {
      after.parentNode!.insertBefore(n, after.nextSibling)
      after = n
      added.push(n)
    }
    for (const m of full.matchAll(LINK)) {
      const before = full.slice(last, m.index)
      if (first) {
        node.data = before
        first = false
      } else if (before) push(doc.createTextNode(before))
      push(pageElement(doc, m[1]!.trim(), m[2]?.trim(), findPage(list, m[1]!)))
      last = m.index + m[0].length
    }
    if (first) return
    if (last < full.length) push(doc.createTextNode(full.slice(last)))
    splits.set(node, { full, added })
  }

  const scan = async () => {
    timer = undefined
    const found: Text[] = []
    for (const scope of doc.querySelectorAll(SCOPE)) {
      const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n as Text
        if (splits.has(t) || !t.data.includes('[[') || t.parentElement?.closest(SKIP)) continue
        found.push(t)
      }
    }
    if (!found.length) return
    // Có tên chưa biết (trang vừa tạo): tải lại danh sách trước khi thay.
    let list = pages()
    if (found.some((t) => [...t.data.matchAll(LINK)].some((m) => !findPage(list, m[1]!)))) {
      await refresh().catch(() => undefined)
      list = pages()
    }
    for (const t of found) if (t.isConnected && !splits.has(t)) decorate(t, list)
    observer.takeRecords()
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData' && r.target instanceof Text) drop(r.target)
      for (const n of r.removedNodes) if (n instanceof Text) drop(n)
    }
    observer.takeRecords()
    if (timer === undefined) timer = setTimeout(() => void scan(), SETTLE_MS)
  })

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('.aris-pg[data-path]')
    if (!(el instanceof HTMLElement)) return
    const page = pages().find((p) => p.path === el.dataset.path)
    if (!page) return
    e.preventDefault()
    peek(el, page)
  }

  observer.observe(doc.body, { subtree: true, childList: true, characterData: true })
  doc.addEventListener('click', onClick)
  timer = setTimeout(() => void scan(), SETTLE_MS)
  return () => {
    clearTimeout(timer)
    observer.disconnect()
    doc.removeEventListener('click', onClick)
    for (const [node, s] of splits) {
      for (const n of s.added) n.parentNode?.removeChild(n)
      node.data = s.full
    }
    splits.clear()
  }
}
