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

/** Bỏ dấu một ký tự ("á" → "a", "đ" → "d"), giữ nguyên độ dài để tra ngược vị trí. */
const foldChar = (c: string) => {
  const f = c
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
  return f.length === 1 ? f : c.toLowerCase().slice(0, 1) || c
}

/** Tách đoạn trích quanh chỗ khớp để tô sáng (không phân biệt hoa thường và dấu). */
export function highlight(snippet: string, query: string): [string, string, string][] {
  const chars = [...snippet]
  const folded = chars.map(foldChar).join('')
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) =>
      [...w]
        .map(foldChar)
        .join('')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
  if (!words.length) return [[snippet, '', '']]
  const re = new RegExp(`(${words.join('|')})`, 'gu')
  const parts: [string, string, string][] = []
  let last = 0
  for (const m of folded.matchAll(re)) {
    // `folded` dài đúng bằng số ký tự của đoạn trích nên vị trí dùng chung được.
    const start = [...folded.slice(0, m.index)].length
    const end = start + [...m[0]].length
    parts.push([chars.slice(last, start).join(''), chars.slice(start, end).join(''), ''])
    last = end
  }
  if (!parts.length) return [[snippet, '', '']]
  parts[parts.length - 1]![2] = chars.slice(last).join('')
  return parts
}
