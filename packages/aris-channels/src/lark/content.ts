/**
 * Nội dung tin Lark: đọc tin vào (chữ, bài `post`, ảnh, tệp, ghi âm) và dựng tin ra (chữ thường hay thẻ Markdown).
 * Thuần, không gọi mạng.
 */
import type { LarkInbound, LarkMention, LarkOutgoing } from './types.js'

export interface LarkResource {
  kind: 'image' | 'file' | 'audio'
  fileKey: string
  name?: string | undefined
  /** Độ dài ghi âm (ms). */
  durationMs?: number | undefined
}

export interface ParsedMessage {
  /** Chữ của tin: đã bỏ chỗ @ bot, chỗ @ người khác thành `@tên`. */
  text: string
  resources: LarkResource[]
  /** Loại tin chưa đọc được (sticker, thẻ, tin hợp nhất…): chỉ có khi không có chữ hay tệp nào. */
  unsupported?: string | undefined
  /** Tin có @ chính bot này không. */
  mentionedBot: boolean
}

const obj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

function json(s: string): Record<string, unknown> | undefined {
  try {
    return obj(JSON.parse(s))
  } catch {
    return undefined
  }
}

/** Đổi chỗ giữ chỗ `@_user_1` trong chữ: bot mình thì bỏ, người khác thành `@tên`. */
function fillMentions(text: string, mentions: readonly LarkMention[], botOpenId: string | undefined): string {
  let out = text
  for (const m of mentions) {
    const isBot = botOpenId !== undefined && m.openId === botOpenId
    // Bỏ cả khoảng trắng liền sau chỗ @ bot, để "@bot nhé" thành "nhé" chứ không thành " nhé".
    out = isBot
      ? out.replace(new RegExp(`${m.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*`, 'g'), '')
      : out.split(m.key).join(`@${m.name ?? 'người dùng'}`)
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

/** Bài `post`: ghép tiêu đề và các đoạn; nhận cả dạng bọc theo ngôn ngữ (`zh_cn`, `en_us`…). */
function postToText(
  body: Record<string, unknown>,
  mentions: readonly LarkMention[],
  resources: LarkResource[],
): string {
  const inner = Array.isArray(body.content)
    ? body
    : (Object.values(body)
        .map(obj)
        .find((v) => v && Array.isArray(v.content)) ?? body)
  const title = str(inner.title)?.trim()
  const rows = Array.isArray(inner.content) ? inner.content : []
  const lines = rows.map((row) => {
    if (!Array.isArray(row)) return ''
    return row
      .map((el) => {
        const e = obj(el)
        switch (e?.tag) {
          case 'text':
          case 'md':
            return str(e.text) ?? ''
          case 'a': {
            const label = str(e.text) ?? ''
            const href = str(e.href)
            return href && href !== label ? `${label} (${href})` : label
          }
          case 'at': {
            const id = str(e.user_id) ?? ''
            if (id === 'all') return '@all'
            // Trong tin nhận, `user_id` thường là chỗ giữ chỗ `@_user_1`: để `fillMentions` lo.
            return mentions.some((m) => m.key === id) ? id : `@${str(e.user_name) ?? 'người dùng'}`
          }
          case 'img': {
            const key = str(e.image_key)
            if (key) resources.push({ kind: 'image', fileKey: key })
            return ''
          }
          case 'code_block':
            return `\`\`\`\n${str(e.text) ?? ''}\n\`\`\``
          default:
            return ''
        }
      })
      .join('')
  })
  return [title, ...lines].filter((l) => l !== undefined && l !== '').join('\n')
}

/** Đọc một tin vào. `botOpenId` là `open_id` của bot (để biết @ nào là gọi bot). */
export function parseMessage(ev: LarkInbound, botOpenId: string | undefined): ParsedMessage {
  const body = json(ev.content) ?? {}
  const resources: LarkResource[] = []
  let raw = ''
  let unsupported: string | undefined
  switch (ev.messageType) {
    case 'text':
      raw = str(body.text) ?? ''
      break
    case 'post':
      raw = postToText(body, ev.mentions, resources)
      break
    case 'image': {
      const key = str(body.image_key)
      if (key) resources.push({ kind: 'image', fileKey: key })
      break
    }
    case 'file':
    case 'media': {
      const key = str(body.file_key)
      if (key) resources.push({ kind: 'file', fileKey: key, name: str(body.file_name) })
      break
    }
    case 'audio': {
      const key = str(body.file_key)
      if (key)
        resources.push({
          kind: 'audio',
          fileKey: key,
          durationMs: typeof body.duration === 'number' ? body.duration : undefined,
        })
      break
    }
    default:
      unsupported = ev.messageType
  }
  const text = fillMentions(raw, ev.mentions, botOpenId)
  return {
    text,
    resources,
    unsupported: text || resources.length ? undefined : unsupported,
    mentionedBot: botOpenId !== undefined && ev.mentions.some((m) => m.openId === botOpenId),
  }
}

/** Lệnh `/tên tham số` ở đầu tin (sau khi đã bỏ @ bot). */
export function parseLarkCommand(text: string): { name: string; args: string } | undefined {
  const m = /^\/([A-Za-z_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { name: m[1]!.toLowerCase(), args: (m[2] ?? '').trim() } : undefined
}

// --- Tin ra --------------------------------------------------------------------------------

/** Giới hạn ký tự một tin: thẻ của Lark tối đa khoảng 30 KB; chừa chỗ để mỗi tin vẫn dễ đọc trên điện thoại. */
export const LARK_CHUNK = 3500

/** Chữ có ký hiệu Markdown cần hiển thị đẹp (đậm, mã, tiêu đề, danh sách, link, bảng). */
export function hasMarkdown(text: string): boolean {
  return /\*\*|__|~~|`|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|\[[^\]\n]+\]\([^)\s]+\)|^\s*\|.*\|\s*$|^>\s/m.test(
    text,
  )
}

/**
 * Chia Markdown thành các phần không quá `max` ký tự: ưu tiên ngắt giữa các đoạn (dòng trống), không cắt giữa khối
 * mã khi còn tránh được; đoạn quá dài thì cắt theo dòng, rồi theo ký tự. Khối mã bị cắt thì đóng và mở lại hàng rào.
 */
export function splitMarkdown(md: string, max = LARK_CHUNK): string[] {
  const text = md.trim()
  if (!text) return ['']
  if (text.length <= max) return [text]
  // 1. Tách thành khối: đoạn văn hay khối mã nguyên.
  const blocks: string[] = []
  let cur: string[] = []
  let fence: string | undefined
  const flush = () => {
    if (cur.length) blocks.push(cur.join('\n'))
    cur = []
  }
  for (const line of text.split('\n')) {
    const f = /^\s*```(\S*)/.exec(line)
    if (f) fence = fence === undefined ? f[1] : undefined
    if (!line.trim() && fence === undefined) flush()
    else cur.push(line)
  }
  flush()
  // 2. Khối quá dài thì cắt theo dòng, dòng quá dài thì cắt theo ký tự. Khối mã: mỗi phần được bọc lại bằng hàng rào.
  const pieces: string[] = []
  for (const b of blocks) {
    if (b.length <= max) {
      pieces.push(b)
      continue
    }
    const lines = b.split('\n')
    const open = /^\s*```/.test(lines[0] ?? '') ? lines[0]!.trim() : undefined
    if (open) {
      lines.shift()
      if (lines.at(-1)?.trim() === '```') lines.pop()
    }
    const wrap = (body: string) => (open ? `${open}\n${body}\n\`\`\`` : body)
    const room = max - (open ? open.length + 5 : 0)
    let part = ''
    for (const line of lines) {
      const pending = part ? `${part}\n${line}` : line
      if (pending.length <= room) {
        part = pending
        continue
      }
      if (part) pieces.push(wrap(part))
      part = ''
      for (let i = 0; i < line.length; i += room) {
        const slice = line.slice(i, i + room)
        if (i + room < line.length) pieces.push(wrap(slice))
        else part = slice
      }
    }
    if (part) pieces.push(wrap(part))
  }
  // 3. Gộp các phần nhỏ lại cho vừa `max`.
  const out: string[] = []
  let buf = ''
  for (const p of pieces) {
    if (buf && buf.length + 2 + p.length > max) {
      out.push(buf)
      buf = p
    } else buf = buf ? `${buf}\n\n${p}` : p
  }
  if (buf) out.push(buf)
  return out
}

/**
 * Một phần câu trả lời thành tin Lark. Cách đơn giản: chữ không có Markdown thì gửi tin chữ thường; có Markdown thì gửi
 * thẻ (`interactive`, schema 2.0) chứa một khối `markdown`, Lark tự hiển thị đậm, danh sách, mã, link. Thẻ không cần
 * nút bấm nên không đòi gói nhận sự kiện thẻ; chọn thẻ thay cho `post` vì `post` chỉ hiểu một phần Markdown.
 */
export function toOutgoing(chunk: string): LarkOutgoing {
  if (!hasMarkdown(chunk)) return { msgType: 'text', content: JSON.stringify({ text: chunk }) }
  return {
    msgType: 'interactive',
    content: JSON.stringify({ schema: '2.0', body: { elements: [{ tag: 'markdown', content: chunk }] } }),
  }
}
