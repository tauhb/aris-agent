/**
 * Gọi đường `/api/aris/recall` của gói `@aris/recall` (host) cho hộp "Tìm trong mọi phiên".
 * Cookie đăng nhập của dsh đi kèm vì cùng nguồn. Gõ xong một nhịp mới tìm, lần tìm cũ
 * về sau lần mới thì bỏ.
 */
import { useEffect, useState } from 'react'

export interface RecallHit {
  sessionId: string
  title: string
  time: number
  seq: number
  snippet: string
  cwd?: string | undefined
}

export type RecallState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; hits: RecallHit[] }
  | { status: 'error'; query: string; error: string }

/** Chờ sau phím gõ cuối, mili giây. */
const DEBOUNCE = 250

export async function searchRecall(query: string, signal?: AbortSignal): Promise<RecallHit[]> {
  const url = new URL(`api/aris/recall?q=${encodeURIComponent(query)}&limit=20`, document.baseURI)
  const res = await fetch(url, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  const body = (await res.json().catch(() => ({}))) as { hits?: RecallHit[]; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body.hits ?? []
}

export function useRecallSearch(query: string): RecallState {
  const [state, setState] = useState<RecallState>({ status: 'idle' })
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading', query: q })
    const abort = new AbortController()
    const timer = setTimeout(() => {
      searchRecall(q, abort.signal).then(
        (hits) => setState({ status: 'ready', query: q, hits }),
        (err: Error) => {
          if (!abort.signal.aborted) setState({ status: 'error', query: q, error: err.message })
        },
      )
    }, DEBOUNCE)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [query])
  return state
}

/** Tách đoạn trích quanh chỗ khớp để tô sáng (không phân biệt hoa thường). */
export function highlight(snippet: string, query: string): [string, string, string][] {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return [[snippet, '', '']]
  const re = new RegExp(`(${words.join('|')})`, 'giu')
  const parts: [string, string, string][] = []
  let last = 0
  for (const m of snippet.matchAll(re)) {
    parts.push([snippet.slice(last, m.index), m[0], ''])
    last = m.index + m[0].length
  }
  if (!parts.length) return [[snippet, '', '']]
  parts[parts.length - 1]![2] = snippet.slice(last)
  return parts
}
