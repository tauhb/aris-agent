/**
 * Markdown của model → HTML mà Telegram hiểu (`parse_mode: HTML`), theo khối để chia tin
 * không cắt ngang thẻ. Bảng: nhỏ thì thành danh sách theo dòng (đọc được trên điện thoại),
 * lớn thì thành khối chữ thẳng cột.
 */

/** Giới hạn một tin của Telegram là 4.096 ký tự; chừa chỗ cho thẻ. */
export const CHUNK = 3800

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;')

/** Định dạng trong dòng: mã, link, đậm, nghiêng, gạch. */
export function inline(md: string): string {
  const codes: string[] = []
  let s = md.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `\uE000${codes.length - 1}\uE000`
  })
  const links: string[] = []
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    links.push(`<a href="${escapeAttr(url)}">${escapeHtml(label)}</a>`)
    return `\uE001${links.length - 1}\uE001`
  })
  s = escapeHtml(s)
    .replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__(?=\S)([^_\n]+?)__/g, '<b>$1</b>')
    .replace(/~~(?=\S)([^~\n]+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)([^_\n]+?)_(?!\w)/g, '$1<i>$2</i>')
  return s
    .replace(/\uE001(\d+)\uE001/g, (_m, i: string) => links[+i]!)
    .replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codes[+i]!)
}

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

/** Bỏ ký hiệu Markdown trong tên cột. */
const plainCell = (c: string) => c.replace(/\*\*|__|~~|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/**
 * Bảng thành danh sách theo dòng: ô đầu in đậm, các ô sau "tên cột: nội dung". Telegram không có bảng,
 * và khối chữ thẳng cột gãy dòng trên điện thoại nên không dùng, kể cả bảng lớn.
 */
export function table(header: string[], rows: string[][]): string {
  const items = rows.map((r) => {
    const [first = '', ...rest] = r
    const lines = [`• <b>${inline(first)}</b>`]
    rest.forEach((c, i) => {
      if (c) lines.push(`   ${escapeHtml(plainCell(header[i + 1] ?? ''))}: ${inline(c)}`)
    })
    return lines
  })
  // Mục nhiều dòng thì cách nhau một dòng trống cho dễ đọc.
  return items.map((l) => l.join('\n')).join(items.some((l) => l.length > 2) ? '\n\n' : '\n')
}

/** Chia Markdown thành các khối HTML (đoạn, khối mã, bảng, trích dẫn…). */
export function blocks(md: string): string[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(para.join('\n'))
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line)
    if (fence) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) code.push(lines[i++]!)
      const lang = fence[1] ? ` class="language-${escapeAttr(fence[1])}"` : ''
      out.push(`<pre><code${lang}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    if (isRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      flush()
      const header = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && isRow(lines[i]!)) rows.push(cells(lines[i++]!))
      i--
      out.push(table(header, rows))
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      out.push(`<b>${inline(heading[1]!)}</b>`)
      continue
    }
    if (/^\s*>/.test(line)) {
      flush()
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      i--
      out.push(`<blockquote>${quote.map(inline).join('\n')}</blockquote>`)
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push('———')
      continue
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      const indent = '   '.repeat(Math.min(3, Math.floor(bullet[1]!.length / 2)))
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(bullet[2]!)
      para.push(
        task
          ? `${indent}${task[1] === ' ' ? '☐' : '☑'} ${inline(task[2]!)}`
          : `${indent}• ${inline(bullet[2]!)}`,
      )
      continue
    }
    para.push(inline(line))
  }
  flush()
  return out
}

/** Một khối quá dài (khối mã, đoạn rất dài) chia theo dòng, giữ thẻ đóng mở đúng. */
function splitBlock(block: string, max: number): string[] {
  if (block.length <= max) return [block]
  const pre = /^<pre>(<code[^>]*>)?([\s\S]*?)(<\/code>)?<\/pre>$/.exec(block)
  const open = pre ? `<pre>${pre[1] ?? ''}` : ''
  const close = pre ? `${pre[3] ?? ''}</pre>` : ''
  const body = pre ? pre[2]! : block
  const room = max - open.length - close.length
  const parts: string[] = []
  let cur = ''
  for (const line of body.split('\n')) {
    let rest = line
    while (rest.length > room) {
      // Dòng đơn quá dài (hiếm): cắt cứng, tránh cắt giữa thực thể &amp;.
      let cut = room
      const amp = rest.lastIndexOf('&', cut)
      if (amp > cut - 6) cut = amp
      if (cur) parts.push(cur)
      parts.push(rest.slice(0, cut))
      cur = ''
      rest = rest.slice(cut)
    }
    if (cur && cur.length + 1 + rest.length > room) {
      parts.push(cur)
      cur = rest
    } else cur = cur ? `${cur}\n${rest}` : rest
  }
  if (cur) parts.push(cur)
  return parts.map((p) => `${open}${p}${close}`)
}

/** Markdown → các tin HTML, mỗi tin không quá `max` ký tự. */
export function toTelegramHtml(md: string, max = CHUNK): string[] {
  const out: string[] = []
  let cur = ''
  for (const block of blocks(md).flatMap((b) => splitBlock(b, max))) {
    if (cur && cur.length + 2 + block.length > max) {
      out.push(cur)
      cur = block
    } else cur = cur ? `${cur}\n\n${block}` : block
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}

/** Bản xem trước khi đang viết: chữ thô, cắt bớt cho vừa một tin. */
export function preview(text: string, max = CHUNK): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

const SILENCE = new Set(['[silent]', 'silent', 'no_reply', 'no reply'])

/** Câu trả lời cuối đúng bằng một dấu hiệu im lặng: không gửi gì (dùng trong nhóm). */
export function isSilent(text: string): boolean {
  return SILENCE.has(text.trim().toLowerCase().replace(/\s+/g, ' '))
}

/** Một bot của đội để đổi `@tên_gọi` khi gửi ra Telegram. */
export interface TeamName {
  /** Mã nội bộ của bot (thẻ đề xuất ký ức tìm bot theo mã). */
  id?: string | undefined
  handle: string
  name: string
  /** Màu linh vật (`#rrggbb`). */
  color?: string | undefined
}

/** Chấm màu emoji gần nhất với màu linh vật (Telegram không có màu chữ tuỳ ý). */
export function colorDot(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return '🩶'
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  if (sat < 0.25) return l > 0.8 ? '⚪' : l < 0.2 ? '⚫' : '🩶'
  const d = max - min
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 345) return '🔴'
  if (h < 45) return '🟠'
  if (h < 70) return '🟡'
  if (h < 165) return '🟢'
  if (h < 200) return '🩵'
  if (h < 255) return '🔵'
  if (h < 300) return '🟣'
  return '🩷'
}

/**
 * `@tên_gọi` của bot trong đội thành chấm màu + tên in đậm (Markdown), trừ trong mã. Không đổi thì
 * Telegram biến `@chữ` thành link tới tài khoản Telegram trùng tên, có khi là người lạ.
 */
export function nameTeam(md: string, team: readonly TeamName[]): string {
  if (!team.length || !md.includes('@')) return md
  const byHandle = new Map(team.map((t) => [t.handle.toLowerCase(), t]))
  // Tách khối mã và mã trong dòng ra, chỉ đổi phần chữ thường.
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(
            /(^|[^\p{L}\p{N}_.@/])@([a-z0-9][a-z0-9-]*)(?![\p{L}\p{N}_-])/giu,
            (all, pre: string, h: string) => {
              const t = byHandle.get(h.toLowerCase())
              return t ? `${pre}${colorDot(t.color)} **${t.name}**` : all
            },
          ),
    )
    .join('')
}
