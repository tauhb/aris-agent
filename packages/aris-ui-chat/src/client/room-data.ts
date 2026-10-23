/**
 * Phòng nhóm của dự án (bước 3e): đọc một vòng (`moi_noi`) và trạng thái phòng từ
 * `/api/aris/commander`, đổi thành dòng để vẽ. Thuần, không phụ thuộc React.
 */
import type { ChatKey } from './locale.js'

export interface RoomEntry {
  bot: string
  handle: string
  name: string
  role?: string
  at: string
  kind: 'say' | 'pass' | 'skip' | 'stopped' | 'error'
  reason?: 'not-member' | 'busy' | 'no-messages' | 'user-stopped' | 'interrupted' | 'timeout'
  text: string
}

export interface RoundData {
  callId: string
  session: string
  round: number
  maxRounds: number
  used: number
  maxMessages: number
  status: 'running' | 'done' | 'stopped'
  speaking?: string
  entries: RoomEntry[]
}

export interface RoomStatus {
  project: boolean
  running?: boolean
  round?: number
  maxRounds?: number
  used?: number
  maxMessages?: number
  closed?: boolean
  stopped?: string[]
  speaking?: { handle: string; name: string; id: string }
}

const endpoint = (query: string) => new URL(`api/aris/commander?${query}`, document.baseURI)

export async function fetchRound(callId: string): Promise<RoundData | null> {
  const res = await fetch(endpoint(`round=${encodeURIComponent(callId)}`), { credentials: 'same-origin' })
  if (!res.ok) return null
  return ((await res.json()) as { round: RoundData | null }).round
}

export async function fetchRoom(sessionId: string): Promise<RoomStatus> {
  const res = await fetch(endpoint(`room=${encodeURIComponent(sessionId)}`), { credentials: 'same-origin' })
  if (!res.ok) return { project: false }
  return (await res.json()) as RoomStatus
}

export async function stopRoom(sessionId: string): Promise<void> {
  await fetch(endpoint(''), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'room-stop', session: sessionId }),
  })
}

/** Dòng ghi chú (không phải tin) cho bot không nói ở vòng này. */
export function noteKey(e: RoomEntry): ChatKey {
  if (e.kind === 'pass') return 'room.pass'
  switch (e.reason) {
    case 'not-member':
      return 'room.notMember'
    case 'busy':
      return 'room.busy'
    case 'no-messages':
      return 'room.noMessages'
    case 'user-stopped':
      return 'room.userStopped'
    case 'interrupted':
      return 'room.interrupted'
    case 'timeout':
      return 'room.timeout'
    default:
      return 'room.error'
  }
}

/** Một đoạn chữ trong tin: thường, đậm (`**x**`) hay gọi tên (`@x`). */
export interface TextPart {
  kind: 'text' | 'bold' | 'mention'
  text: string
}

/** Tách tin của bot thành đoạn: đậm kiểu Markdown và `@tên` được làm nổi. */
export function textParts(text: string): TextPart[] {
  const out: TextPart[] = []
  const re = /\*\*([^*]+)\*\*|(@[a-z0-9-]+)/gi
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push(m[1] !== undefined ? { kind: 'bold', text: m[1] } : { kind: 'mention', text: m[2]! })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** Giờ:phút của một tin. */
export function clock(at: string): string {
  const d = new Date(at)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
