/** Dữ liệu sống của Văn phòng: gọi các API có sẵn của aris, đọc lại định kỳ, giữ bản tốt gần nhất khi một lần lỗi. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConvStep } from './chatModel.js'
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
  // Đổi khoá (hay đọc lại) thì bỏ dữ liệu cũ; đổi nhịp đọc thì giữ nguyên dữ liệu đang hiện.
  useEffect(() => setData(null), [key, tick])
  useEffect(() => {
    let alive = true
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

/** Khoảng của cột "Vừa làm gì". */
export type FeedRange = 'today' | '7d'

/** Dòng "Vừa làm gì" (`/api/aris/stats?feed=1`) trong khoảng đã chọn; đọc lại mỗi 5 giây. */
export function useFeed(range: FeedRange): [FeedItem[] | null, () => void] {
  const [data, reload] = usePoll(
    () =>
      getJson<{ feed: FeedItem[] }>('api/aris/stats', {
        feed: '1',
        limit: range === '7d' ? '80' : '50',
        range,
      }),
    5000,
    range,
  )
  return [data?.feed ?? null, reload]
}

/** Kết quả của một phiên (`/api/aris/stats?result=<phiên>`). */
export interface SessionResultView {
  session: string
  bot: string
  botName: string
  title: string
  status: 'running' | 'done' | 'failed' | 'waiting'
  /** Toàn văn câu trả lời cuối của bot. */
  text: string
  files: { path: string; name: string }[]
  at: number
}

/** Đọc kết quả một phiên một lần; `null` là đang đọc, `'error'` là chưa đọc được (phiên không có log). */
export function useResult(session: string | undefined, enabled: boolean): SessionResultView | 'error' | null {
  const [out, setOut] = useState<SessionResultView | 'error' | null>(null)
  useEffect(() => {
    if (!session || !enabled) return
    let alive = true
    setOut(null)
    void getJson<SessionResultView>('api/aris/stats', { result: session }).then((r) => {
      if (alive) setOut(r ?? 'error')
    })
    return () => {
      alive = false
    }
  }, [session, enabled])
  return out
}

/**
 * Trạng thái và kết quả của một phiên con trong khối "Đội đang làm": đọc ngay, rồi đọc lại mỗi 4 giây khi phiên còn
 * chạy hay đang đợi; xong hay lỗi thì thôi. Không có phiên thì không đọc.
 */
export function useBranchResult(session: string | undefined): SessionResultView | null {
  const [out, setOut] = useState<SessionResultView | null>(null)
  useEffect(() => {
    if (!session) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setOut(null)
    const load = async () => {
      const r = await getJson<SessionResultView>('api/aris/stats', { result: session })
      if (!alive) return
      if (r) setOut(r)
      if (!r || r.status === 'running' || r.status === 'waiting') timer = setTimeout(() => void load(), 4000)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [session])
  return out
}

/** Một phiên của bot ở ô chọn phiên (`/api/aris/bots?sessions=<bot>`). */
export interface RecentSession {
  id: string
  title: string
  at: number
  running: boolean
}

/** 5 phiên gần nhất của bot; bot ngoài (không có phiên chat) thì không đọc. */
export function useBotSessions(bot: string, enabled: boolean): RecentSession[] | null {
  const data = usePoll(
    () =>
      enabled
        ? getJson<{ sessions: RecentSession[] }>('api/aris/bots', { sessions: bot })
        : Promise.resolve(null),
    15_000,
    `${bot}:${enabled}`,
  )[0]
  return data?.sessions ?? null
}

/** Hội thoại của một phiên (`/api/aris/stats?replay=<phiên>&text=full`). */
export interface Conversation {
  session: string
  bot: string
  title: string
  running: boolean
  steps: ConvStep[]
}

/**
 * Hội thoại đầy đủ chữ của tin người dùng và tin trợ lý, đọc lại mỗi `ms` mili giây. Bước giao việc của Aris bị cắt chữ
 * thì đọc đủ từng bước để khối "Đội đang làm" đọc được tham số và kết quả. Không có phiên thì không đọc.
 */
export function useConversation(session: string | undefined, ms: number): Conversation | null {
  const full = useRef(new Map<string, ConvStep>())
  const load = async (): Promise<Conversation | null> => {
    if (!session) return null
    const conv = await getJson<Conversation>('api/aris/stats', { replay: session, text: 'full' })
    if (!conv) return null
    const steps = await Promise.all(
      conv.steps.map(async (s) => {
        if (s.type !== 'tool' || s.tool !== 'giao_viec' || (s.bodyFull && s.outFull !== false)) return s
        const key = `${session}:${s.n}`
        const cached = full.current.get(key)
        if (cached) return cached
        const whole = await getJson<ConvStep>('api/aris/stats', {
          replay: session,
          step: String(s.n),
          full: '1',
        })
        if (!whole) return s
        // Lần gọi còn chạy (chưa có kết quả) thì đọc lại ở lần sau.
        if (whole.out !== undefined) full.current.set(key, whole)
        return whole
      }),
    )
    return { ...conv, steps }
  }
  return usePoll(load, ms, session ?? '')[0]
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

/**
 * Gửi tin vào phiên (`session-send`, như Telegram khi nhắn bot): bot đang chạy thì chèn vào việc (`steer`) hay xếp
 * sau (`queue`); phiên rảnh thì chạy luôn.
 */
export const sendToSession = (session: string, text: string, mode: 'steer' | 'queue') =>
  post({ op: 'session-send', session, text, mode })
