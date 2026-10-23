/**
 * Gọi đường `/api/aris/memory` của gói `@aris/memory` (host). Cookie đăng nhập của dsh
 * đi kèm vì cùng nguồn; dsh trả 401/403 khi chưa đăng nhập.
 */
import { useCallback, useEffect, useState } from 'react'

export type MemoryKind =
  'preference' | 'environment' | 'convention' | 'lesson' | 'project' | 'person' | 'event' | 'fact'

export interface MemoryItem {
  id: string
  bot: string
  book: 'notes' | 'owner'
  tier: 'core' | 'archive'
  status: 'active' | 'pending' | 'deleted'
  kind: MemoryKind
  trust: 'user-stated' | 'agent-inferred' | 'external'
  text: string
  source: { sessionId?: string; at: string }
  uses: number
}

export interface MemorySnapshot {
  bot: string
  usage: { notes: { used: number; cap: number }; owner: { used: number; cap: number } }
  core: MemoryItem[]
  archive: MemoryItem[]
  pending: MemoryItem[]
}

export type MemoryOp = 'update' | 'demote' | 'promote' | 'forget' | 'approve' | 'discard'

const endpoint = (bot: string) => new URL(`api/aris/memory?bot=${encodeURIComponent(bot)}`, document.baseURI)

async function call(bot: string, init?: RequestInit): Promise<MemorySnapshot> {
  const res = await fetch(endpoint(bot), { credentials: 'same-origin', ...init })
  const body = (await res.json().catch(() => ({}))) as MemorySnapshot & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

/** Ảnh chụp ký ức của một bot và thao tác trên nó; tải lại khi đổi bot. */
export function useMemory(bot: string) {
  const [data, setData] = useState<MemorySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    setLoading(true)
    call(bot)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [bot])

  useEffect(reload, [reload])

  const act = useCallback(
    async (op: MemoryOp, id: string, text?: string) => {
      try {
        setData(
          await call(bot, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ op, id, text }),
          }),
        )
        setError(null)
        return true
      } catch (e) {
        setError((e as Error).message)
        return false
      }
    },
    [bot],
  )

  return { data, error, loading, reload, act }
}
