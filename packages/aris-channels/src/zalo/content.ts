/**
 * Nội dung tin Zalo: đọc tin vào (chữ, ảnh, tệp, tin thoại) và dựng tin ra (chữ thường, chia theo 2.000 ký tự).
 * Thuần, không gọi mạng.
 */
import type { ZaloInbound } from './types.js'

export interface ZaloResource {
  kind: 'image' | 'file' | 'audio'
  url: string
  name?: string | undefined
}

export interface ParsedMessage {
  /** Chữ của tin: đã bỏ chỗ @ tài khoản này. */
  text: string
  resources: ZaloResource[]
  /** Loại tin chưa đọc được (sticker, danh thiếp, video…): chỉ có khi không có chữ hay tệp nào. */
  unsupported?: string | undefined
  /** Tin có @ chính tài khoản này không. */
  mentionedSelf: boolean
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

/** Đọc một tin vào. `selfId` là mã Zalo của tài khoản (để biết @ nào là gọi mình). */
export function parseMessage(ev: ZaloInbound, selfId: string): ParsedMessage {
  const resources: ZaloResource[] = []
  let raw = ''
  let unsupported: string | undefined
  const body = ev.msgType === 'webchat' ? undefined : json(ev.content)
  if (ev.msgType === 'webchat') raw = ev.content
  else if (ev.msgType.includes('photo')) {
    const href = str(body?.href)
    if (href) resources.push({ kind: 'image', url: href })
    raw = str(body?.title) ?? ''
  } else if (ev.msgType.includes('voice')) {
    const href = str(body?.href)
    if (href) resources.push({ kind: 'audio', url: href })
  } else if (ev.msgType.includes('file')) {
    const href = str(body?.href)
    if (href) resources.push({ kind: 'file', url: href, name: str(body?.title) })
  } else unsupported = ev.msgType
  // Bỏ chỗ @ tài khoản này (từ cuối về đầu để vị trí không lệch), chỗ @ người khác giữ nguyên.
  let text = raw
  const mine = ev.mentions.filter((m) => m.uid === selfId).sort((a, b) => b.pos - a.pos)
  for (const m of mine) text = `${text.slice(0, m.pos)}${text.slice(m.pos + m.len)}`.replace(/^[ \t]+/, '')
  text = text.replace(/[ \t]{2,}/g, ' ').trim()
  return {
    text,
    resources,
    unsupported: text || resources.length ? undefined : unsupported,
    mentionedSelf: mine.length > 0,
  }
}

/** Lệnh `/tên tham số` ở đầu tin (sau khi đã bỏ @ tài khoản). */
export function parseZaloCommand(text: string): { name: string; args: string } | undefined {
  const m = /^\/([A-Za-z_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { name: m[1]!.toLowerCase(), args: (m[2] ?? '').trim() } : undefined
}

// --- Tin ra --------------------------------------------------------------------------------

/** Zalo cho tối đa 2.000 ký tự mỗi tin; cắt ở 1.500 để mỗi tin dễ đọc trên điện thoại (GĐ8.7 đợt A). */
export const ZALO_CHUNK = 1500

/** Dòng phân cách của bảng Markdown (`|---|---|`). */
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/**
 * Markdown thành chữ thường dễ đọc trên Zalo (không hiển thị Markdown): bỏ `**`, `__`, `~~`, dấu mã và tiêu đề `#`;
 * liên kết thành `chữ (địa chỉ)`; bảng thành các dòng gạch đầu dòng; khối mã giữ nội dung, bỏ hàng rào.
 */
export function toPlain(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let header: string[] | undefined
  let inCode = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }
    // Bảng: dòng đầu là tiêu đề cột, dòng phân cách bỏ, các dòng sau thành "- cột: giá trị".
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => inline(c.trim()))
      if (TABLE_RULE.test(line)) continue
      if (!header) {
        header = cells
        continue
      }
      const h = header
      out.push(`- ${cells.map((c, i) => (h[i] ? `${h[i]}: ${c}` : c)).join('; ')}`)
      continue
    }
    header = undefined
    out.push(
      inline(
        line
          .replace(/^\s{0,3}#{1,6}\s+/, '')
          .replace(/^(\s*)[*+]\s+/, '$1- ')
          .replace(/^>\s?/, ''),
      ),
    )
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function inline(s: string): string {
  return s
    .replace(/!?\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) =>
      t && t !== u ? `${t} (${u})` : u,
    )
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
}

/**
 * Chia chữ thành các tin không quá `max` ký tự: ưu tiên ngắt giữa các đoạn (dòng trống), rồi giữa các dòng, rồi giữa
 * các câu, cuối cùng mới cắt giữa chữ.
 */
export function splitText(text: string, max = ZALO_CHUNK): string[] {
  const t = text.trim()
  if (!t) return ['']
  if (t.length <= max) return [t]
  const pieces: string[] = []
  const cut = (s: string, seps: RegExp[]) => {
    if (s.length <= max) {
      pieces.push(s)
      return
    }
    const [sep, ...rest] = seps
    if (!sep) {
      for (let i = 0; i < s.length; i += max) pieces.push(s.slice(i, i + max))
      return
    }
    for (const part of s.split(sep)) if (part.trim()) cut(part, rest)
  }
  cut(t, [/\n{2,}/, /\n/, /(?<=[.!?…。])\s+/])
  // Gộp các phần nhỏ lại cho vừa `max`; ranh giới đoạn giữ dòng trống.
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

/** Markdown của bot thành các tin chữ thường để gửi. */
export const toChunks = (md: string): string[] => splitText(toPlain(md))
