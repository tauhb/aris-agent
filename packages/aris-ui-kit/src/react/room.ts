/**
 * Phòng nhóm của dự án (bước 3e, `/api/aris/commander?room=`): vòng, số tin, ai đang nói, bot đã
 * nói gì trong lượt này. Dùng cho thanh phòng trên ô nhập và cột phải của dự án.
 */
import { useCallback, useEffect, useState } from 'react'

export type RoomSpoke = 'say' | 'pass' | 'skip' | 'stopped' | 'error'

export interface RoomStatus {
  project: boolean
  running?: boolean
  round?: number
  maxRounds?: number
  used?: number
  maxMessages?: number
  closed?: boolean
  stopped?: string[]
  /** Theo tên gọi: bot đã nói, bỏ lượt, bị bỏ qua… trong lượt này. */
  spoke?: Record<string, RoomSpoke>
  speaking?: { handle: string; name: string; id: string }
}

const endpoint = (query: string) => new URL(`api/aris/commander?${query}`, document.baseURI)

export async function fetchRoomStatus(sessionId: string): Promise<RoomStatus> {
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

/** Trạng thái phòng của phiên, đọc lại mỗi 3 giây; phiên không phải phòng nhóm thì thôi. */
export function useRoomStatus(sessionId: string | undefined): [RoomStatus | null, () => void] {
  const [room, setRoom] = useState<RoomStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!sessionId) {
      setRoom(null)
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const r = await fetchRoomStatus(sessionId).catch(() => null)
      if (!alive) return
      setRoom(r)
      if (r?.project) timer = setTimeout(() => void load(), 3000)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [sessionId, tick])
  return [room, useCallback(() => setTick((n) => n + 1), [])]
}

/** Một bot trong phòng lúc này: đang nói, đã nói, bỏ lượt, đã dừng; chưa làm gì thì không có. */
export function roomRole(
  room: RoomStatus | null,
  handle: string,
): 'speaking' | 'said' | 'passed' | 'stopped' | undefined {
  if (!room?.project) return undefined
  if (room.running && room.speaking?.handle === handle) return 'speaking'
  if (room.stopped?.includes(handle)) return 'stopped'
  const s = room.spoke?.[handle]
  return s === 'say' ? 'said' : s === 'pass' ? 'passed' : s === 'stopped' ? 'stopped' : undefined
}
