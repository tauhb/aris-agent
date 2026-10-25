/**
 * Hiển thị Markdown của bộ não (đúng phần định dạng `AGENTS.md` quy định): tiêu đề, đoạn, danh sách,
 * trích dẫn, khối mã, bảng, kẻ ngang; chữ đậm, nghiêng, mã, liên kết, `[[trang]]`, chú thích `[^1]`.
 * Chỉ dựng phần tử React, không chèn HTML thô.
 */
import type { ReactNode } from 'react'

export interface LinkTarget {
  /** Trang có trong kho không (không có thì vẽ mờ). */
  exists(name: string): boolean
  open(name: string): void
}

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; depth: number }[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

export interface Doc {
  blocks: Block[]
  /** Chú thích `[^n]: ...` theo thứ tự xuất hiện. */
  notes: { id: string; text: string }[]
}

/** Bỏ nhãn đầu trang `---…---`. */
export const stripFront = (md: string) => md.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '')

/** Một giá trị trong nhãn đầu trang (dòng `khoa: giá trị`), đủ cho vài nhãn hiển thị. */
export function frontValue(md: string, key: string): string | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m) return undefined
  const line = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(m[1]!)
  const v = line?.[1]?.trim().replace(/^["']|["']$/g, '')
  return v || undefined
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function parseMarkdown(md: string): Doc {
  const lines = stripFront(md).split(/\r?\n/)
  const blocks: Block[] = []
  const notes: Doc['notes'] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const t = line.trim()
    if (!t) {
      flush()
      continue
    }
    if (t.startsWith('```')) {
      flush()
      const body: string[] = []
      for (i++; i < lines.length && !lines[i]!.trim().startsWith('```'); i++) body.push(lines[i]!)
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    const note = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(t)
    if (note) {
      flush()
      notes.push({ id: note[1]!, text: note[2]! })
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(t)
    if (h) {
      flush()
      blocks.push({ kind: 'h', level: h[1]!.length, text: h[2]! })
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush()
      blocks.push({ kind: 'hr' })
      continue
    }
    if (t.startsWith('>')) {
      flush()
      const body = [t.replace(/^>\s?/, '')]
      while (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('>'))
        body.push(lines[++i]!.trim().replace(/^>\s?/, ''))
      blocks.push({ kind: 'quote', text: body.join(' ') })
      continue
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1]!.trim())) {
      flush()
      const head = cells(t)
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith('|'); i++) rows.push(cells(lines[i]!))
      i--
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      const ordered = /\d/.test(item[2]!)
      const items = [{ text: item[3]!, depth: Math.floor(item[1]!.replace(/\t/g, '  ').length / 2) }]
      while (i + 1 < lines.length) {
        const next = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i + 1]!)
        if (!next) break
        items.push({ text: next[3]!, depth: Math.floor(next[1]!.replace(/\t/g, '  ').length / 2) })
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    para.push(t)
  }
  flush()
  // Mục "## Nguồn" chỉ chứa chú thích: trang đã vẽ riêng phần nguồn, bỏ tiêu đề trống.
  const last = blocks[blocks.length - 1]
  if (notes.length && last?.kind === 'h' && /^ngu[oồ]n$/i.test(last.text.trim())) blocks.pop()
  return { blocks, notes }
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[\[[^\]\n]+\]\])|(\[\^[^\]]+\])|(\[[^\]\n]+\]\([^)\s]+\))/g

/** Chữ trong dòng thành phần tử React. */
export function Inline({ text, links }: { text: string; links: LinkTarget }): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const key = k++
    const s = m[0]
    if (m[1]) out.push(<code key={key}>{s.slice(1, -1)}</code>)
    else if (m[2])
      out.push(
        <b key={key}>
          <Inline text={s.slice(2, -2)} links={links} />
        </b>,
      )
    else if (m[3])
      out.push(
        <i key={key}>
          <Inline text={s.slice(1, -1)} links={links} />
        </i>,
      )
    else if (m[4]) {
      const inner = s.slice(2, -2)
      const [target = '', alias] = inner.split('|')
      const name = target.split('#')[0]!.trim().replace(/\.md$/i, '').split('/').pop()!
      const ok = links.exists(name)
      out.push(
        <a
          key={key}
          href="#"
          className={ok ? 'ap-wl' : 'ap-wl missing'}
          title={ok ? undefined : name}
          onClick={(e) => {
            e.preventDefault()
            if (ok) links.open(name)
          }}
        >
          {alias?.trim() || target.trim()}
        </a>,
      )
    } else if (m[5])
      out.push(
        <sup key={key} className="ap-fn">
          {s.slice(2, -1)}
        </sup>,
      )
    else if (m[6]) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s)!
      const href = mm[2]!
      const safe = /^(https?:|mailto:)/i.test(href)
      out.push(
        safe ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {mm[1]}
          </a>
        ) : (
          <span key={key}>{mm[1]}</span>
        ),
      )
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

export function Markdown({ doc, links }: { doc: Doc; links: LinkTarget }) {
  return (
    <>
      {doc.blocks.map((b, i) => {
        switch (b.kind) {
          case 'h': {
            const Tag = (b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
            return (
              <Tag key={i}>
                <Inline text={b.text} links={links} />
              </Tag>
            )
          }
          case 'p':
            return (
              <p key={i}>
                <Inline text={b.text} links={links} />
              </p>
            )
          case 'quote':
            return (
              <blockquote key={i}>
                <Inline text={b.text} links={links} />
              </blockquote>
            )
          case 'code':
            return <pre key={i}>{b.text}</pre>
          case 'hr':
            return <hr key={i} />
          case 'table':
            return (
              <div key={i} className="ap-mdtable">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>
                          <Inline text={c} links={links} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, n) => (
                          <td key={n}>
                            <Inline text={c} links={links} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul'
            return (
              <List key={i}>
                {b.items.map((it, j) => (
                  <li key={j} style={it.depth ? { marginLeft: it.depth * 18 } : undefined}>
                    <Inline text={it.text} links={links} />
                  </li>
                ))}
              </List>
            )
          }
        }
      })}
    </>
  )
}
