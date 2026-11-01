/**
 * Tên thành viên trong câu trả lời của bot (bản vẽ 1.7): Markdown của dsh không có chỗ cắm cho chữ
 * thường, nên aris thay `@tên` trong DOM của phần trả lời sau khi chữ đứng yên. dsh (React) vẽ lại
 * đoạn chữ nào thì aris trả đoạn đó về nguyên trạng trước rồi mới thay lại, để không lệch với React.
 */
import { mascotSvg } from '@aris/ui-kit'
import { splitRefs } from './who-data.js'

export interface MentionBot {
  id: string
  handle: string
  name: string
  mascot: string
  /** Phụ kiện của linh vật (xem `resolveAccessory`); bỏ trống là mặc định của dáng. */
  accessory?: string | undefined
  color: string
}

/** Phần trả lời của bot trong khung chat dsh (không gồm phần suy nghĩ, công cụ). */
const SCOPE = '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'
/** Không thay trong mã, liên kết, nút, và trong chính tên đã thay. */
const SKIP = 'code,pre,a,button,textarea,input,[contenteditable],.aris-who'
const SETTLE_MS = 500

/** Phần tử tên thành viên: linh vật, tên, nền theo màu linh vật; bấm mở hồ sơ bot. */
export function mentionElement(doc: Document, bot: MentionBot, title: string): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.className = 'aris-who'
  el.dataset.bot = bot.id
  el.title = title
  el.style.setProperty('--who', bot.color)
  let svg = ''
  try {
    svg = mascotSvg(bot.mascot, 18, '', bot.accessory)
  } catch {
    // Linh vật không còn trong thư viện: chỉ hiện tên.
  }
  el.innerHTML = svg
  el.append(doc.createTextNode(bot.name))
  return el
}

interface Split {
  /** Chữ gốc React đã đặt cho nút chữ này. */
  full: string
  added: Node[]
}

/**
 * Theo dõi khung chat và thay `@tên` thành phần tử tên thành viên.
 * @param bots - đội hiện tại theo `handle` (chữ thường).
 * @param titleOf - chữ gợi ý khi rê chuột lên tên.
 * @param open - mở hồ sơ bot khi bấm.
 * @param withNames - thay cả tên bot viết thẳng không có `@` (giao diện GĐ9).
 * @returns hàm gỡ: trả mọi đoạn chữ về nguyên trạng.
 */
export function watchMentions(
  bots: () => ReadonlyMap<string, MentionBot>,
  titleOf: (bot: MentionBot) => string,
  open: (bot: MentionBot) => void,
  doc: Document = document,
  withNames = false,
): () => void {
  const splits = new Map<Text, Split>()
  let timer: ReturnType<typeof setTimeout> | undefined

  // React đổi chữ thì đoạn đã được trả từ trước (xem observer), nên chữ gốc vẫn là `full`.
  const undo = (node: Text, s: Split) => {
    for (const n of s.added) n.parentNode?.removeChild(n)
    splits.delete(node)
    node.data = s.full
  }
  // dsh vẽ lại hay bỏ đoạn chữ: bỏ phần aris đã chèn, giữ chữ của React.
  const drop = (node: Text) => {
    const s = splits.get(node)
    if (!s) return
    for (const n of s.added) n.parentNode?.removeChild(n)
    splits.delete(node)
  }

  const decorate = (node: Text, team: ReadonlyMap<string, MentionBot>) => {
    const full = node.data
    const names = withNames
      ? new Map([...team].map(([handle, b]) => [b.name, handle]))
      : new Map<string, string>()
    const parts = splitRefs(full, new Set(team.keys()), names)
    if (!parts.some((p) => p.kind === 'mention')) return
    const added: Node[] = []
    let first = true
    let after: Node = node
    for (const p of parts) {
      if (first) {
        node.data = p.kind === 'text' ? p.text : ''
        first = false
        if (p.kind === 'text') continue
      }
      const n =
        p.kind === 'text'
          ? doc.createTextNode(p.text)
          : mentionElement(doc, team.get(p.handle)!, titleOf(team.get(p.handle)!))
      after.parentNode!.insertBefore(n, after.nextSibling)
      after = n
      added.push(n)
    }
    splits.set(node, { full, added })
  }

  const scan = () => {
    timer = undefined
    const team = bots()
    if (team.size === 0) return
    for (const scope of doc.querySelectorAll(SCOPE)) {
      const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      const found: Text[] = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n as Text
        if (splits.has(t) || (!withNames && !t.data.includes('@')) || t.parentElement?.closest(SKIP)) continue
        found.push(t)
      }
      for (const t of found) decorate(t, team)
    }
    observer.takeRecords()
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      // React đổi chữ của một đoạn đã thay: trả về nguyên trạng, lần quét sau thay lại.
      if (r.type === 'characterData' && r.target instanceof Text) drop(r.target)
      for (const n of r.removedNodes) if (n instanceof Text) drop(n)
    }
    observer.takeRecords()
    if (timer === undefined) timer = setTimeout(scan, SETTLE_MS)
  })

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('.aris-who')
    if (!(el instanceof HTMLElement) || !el.dataset.bot) return
    const bot = [...bots().values()].find((b) => b.id === el.dataset.bot)
    if (!bot) return
    e.preventDefault()
    open(bot)
  }

  observer.observe(doc.body, { subtree: true, childList: true, characterData: true })
  doc.addEventListener('click', onClick)
  timer = setTimeout(scan, SETTLE_MS)
  return () => {
    clearTimeout(timer)
    observer.disconnect()
    doc.removeEventListener('click', onClick)
    for (const [node, s] of splits) undo(node, s)
  }
}
