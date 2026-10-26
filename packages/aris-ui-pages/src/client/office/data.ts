/** Dữ liệu sống của Văn phòng: gọi các API có sẵn của aris, đọc lại định kỳ, giữ bản tốt gần nhất khi một lần lỗi. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeedItem } from './model.js'

const url = (path: string, query: Record<string, string> = {}) => {
  const u = new URL(path, document.baseURI)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
  return u
}

async function getJson<T>(path: string, query?: Record<string, string>): Promise<T | null> {
  const res = await fetch(url(path, query), { credentials: 'same-origin' }).catch(() => null)
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null
}

/** Đọc `load` ngay, rồi mỗi `ms` mili giây; `null` (chưa có) thì thôi chờ, `key` đổi thì đọc lại từ đầu. */
export function usePoll<T>(
  load: () => Promise<T | null>,
  ms: number,
  key: string = '',
): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    let alive = true
    setData(null)
    const run = () =>
      void loader.current().then((d) => {
        if (alive && d) setData(d)
      })
    run()
    const timer = setInterval(run, ms)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [ms, key, tick])
  return [data, useCallback(() => setTick((n) => n + 1), [])]
}

/** Token hôm nay (`/api/aris/stats?range=today`). */
export const useTodayTokens = () =>
  usePoll(() => getJson<{ tokens: number }>('api/aris/stats', { range: 'today' }), 15_000)[0]

export interface GuardNow {
  settings: { teamCapUsd: number }
  /** Chi phí hôm nay của cả đội (USD). */
  spent: number
  departments: { id: string; name: string; spent: number; cap: number | null }[]
}

/** Chi phí hôm nay so với trần (`/api/aris/guard`). */
export const useGuardNow = () => usePoll(() => getJson<GuardNow>('api/aris/guard'), 15_000)[0]

/** Dòng "Vừa làm gì" (`/api/aris/stats?feed=1`). */
export function useFeed(): FeedItem[] | null {
  const data = usePoll(
    () => getJson<{ feed: FeedItem[] }>('api/aris/stats', { feed: '1', limit: '30' }),
    5000,
  )[0]
  return data?.feed ?? null
}

export interface ReplayStep {
  n: number
  at: number
  type: string
  title: string
}

/** Vài bước cuối của một phiên đang chạy (`/api/aris/stats?replay=<phiên>`); không có phiên thì không đọc. */
export function useLastSteps(session: string | undefined, count = 4): ReplayStep[] | null {
  const data = usePoll(
    () =>
      session
        ? getJson<{ steps: ReplayStep[] }>('api/aris/stats', { replay: session })
        : Promise.resolve(null),
    5000,
    session ?? '',
  )[0]
  return data ? data.steps.slice(-count) : null
}

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(url('api/aris/commander'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
}

/** Dừng phiên đang chạy, như nút Dừng trong chat. */
export const stopSession = (session: string) => post({ op: 'session-stop', session })

/** Chèn tin vào phiên đang chạy ("Chèn vào việc", như Telegram khi bot đang bận). */
export const steerSession = (session: string, text: string) => post({ op: 'session-steer', session, text })
