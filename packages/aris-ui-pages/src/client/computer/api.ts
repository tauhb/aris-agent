/**
 * Gọi `/api/aris/computer` của gói `@aris/computer` (GĐ8.3): cài đặt điều khiển máy theo bot, kiểm quyền macOS, ảnh
 * chờ duyệt, ảnh màn hình mới nhất của một phiên, Cầm lái / Trả lại.
 */
import { useCallback, useEffect, useState } from 'react'

export type ComputerAction = 'xem' | 'bam' | 'go' | 'phim' | 'mo'
export const COMPUTER_ACTIONS: readonly ComputerAction[] = ['xem', 'bam', 'go', 'phim', 'mo']

export interface ComputerSettings {
  on: boolean
  mode: 'ask' | 'bounded'
  apps: string[]
  actions: ComputerAction[]
}

export interface ComputerState {
  bots: Record<string, ComputerSettings>
  defaults: ComputerSettings
  holder: { session: string; bot: string } | null
  driver: string | null
  loadError: string | null
}

export interface DoctorCheck {
  id: 'os' | 'driver' | 'ax' | 'screen' | 'detail' | 'vision'
  name: string
  ok: boolean | null
  detail: string
  fix?: string
}

export interface DoctorReport {
  platform: string
  process: { pid: number; execPath: string }
  checks: DoctorCheck[]
  bots: string[]
  text: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export type Mark = Rect | { x: number; y: number }

/** Ảnh cửa sổ (PNG base64) và chỗ đánh dấu. */
export interface Shot {
  png: string
  width: number
  height: number
}

export interface Preview {
  sessionId: string
  bot: string
  tool: string
  describe: string
  image?: Shot
  mark?: Mark
  at: number
}

export interface ScreenView {
  active: boolean
  screen?: { window: string; app: string; title: string; at: number; image?: Shot; mark?: Mark }
  steps?: { at: number; text: string }[]
  shots?: number
  actions?: number
  limits?: { shots: number; actions: number }
  paused?: boolean
  holder?: { session: string; bot: string }
}

const endpoint = (query = '') => new URL(`api/aris/computer${query ? `?${query}` : ''}`, document.baseURI)

async function getJson<T>(query: string): Promise<T | null> {
  const res = await fetch(endpoint(query), { credentials: 'same-origin' }).catch(() => null)
  return res?.ok ? ((await res.json()) as T) : null
}

export async function computerPost(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  return !!res?.ok
}

/** Cài đặt điều khiển máy của mọi bot (`null` khi gói chưa bật). */
export function useComputerState(): [ComputerState | null, () => void] {
  const [state, setState] = useState<ComputerState | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void getJson<ComputerState>('').then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [tick])
  return [state, useCallback(() => setTick((n) => n + 1), [])]
}

export const fetchDoctor = () => getJson<DoctorReport>('doctor=1')

/** Ảnh chờ duyệt của một lời gọi (đọc một lần). */
export function usePreview(id: string | undefined): Preview | null {
  const [p, setP] = useState<Preview | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    void getJson<Preview>(`preview=${encodeURIComponent(id)}`).then((x) => alive && setP(x))
    return () => {
      alive = false
    }
  }, [id])
  return p
}

/** Ảnh màn hình mới nhất của bot trong phiên, đọc lại mỗi `everyMs`. */
export function useScreen(sessionId: string | undefined, everyMs = 3000): [ScreenView | null, () => void] {
  const [view, setView] = useState<ScreenView | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!sessionId) {
      setView(null)
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const v = await getJson<ScreenView>(`screen=${encodeURIComponent(sessionId)}`)
      if (!alive) return
      setView(v)
      timer = setTimeout(() => void load(), everyMs)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [sessionId, everyMs, tick])
  return [view, useCallback(() => setTick((n) => n + 1), [])]
}
