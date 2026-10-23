/**
 * Gọi đường `/api/aris/providers/state` của gói `@aris/providers` (host): thứ tự dự phòng, vòng
 * khoá, giá, chi phí. Cookie đăng nhập của dsh đi kèm vì cùng nguồn. Giá trị khoá chỉ gửi đi một
 * lần khi thêm, máy chủ không trả lại.
 */
import { useCallback, useEffect, useState } from 'react'

export interface Link {
  provider: string
  model: string
}

export interface PoolKey {
  slot: number
  /** Mã nhận diện 4 ký tự băm từ khoá. */
  fp: string
  addedAt: number
  failedAt?: number
  error?: string
}

export interface Pool {
  provider: string
  ref: string
  active: number
  keys: PoolKey[]
}

export interface Cost {
  today: number
  week: number
  unpriced: boolean
  byModel: { provider: string; model: string; usd: number; calls: number; priced: boolean }[]
}

export interface ProvidersState {
  chain: Link[]
  pools: Pool[]
  cost: Cost
}

/** USD cho mỗi 1 triệu token. */
export interface Price {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

const endpoint = () => new URL('api/aris/providers/state', document.baseURI)

async function call<R>(body?: Record<string, unknown>): Promise<R> {
  const res = await fetch(endpoint(), {
    credentials: 'same-origin',
    ...(body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  const out = (await res.json().catch(() => ({}))) as R & { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out
}

export const fetchProvidersState = () => call<ProvidersState>()

export async function fetchPrices(items: readonly Link[]): Promise<Map<string, Price | null>> {
  const r = await call<{ prices: (Link & { price: Price | null })[] }>({ op: 'prices', items })
  return new Map(r.prices.map((p) => [`${p.provider}\u0000${p.model}`, p.price]))
}

export function useProvidersState() {
  const [data, setData] = useState<ProvidersState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    fetchProvidersState().then(
      (d) => (setData(d), setError(null)),
      (e: Error) => setError(e.message),
    )
  }, [])
  useEffect(() => {
    load()
    // Chi phí và trạng thái khoá đổi theo từng lần gọi model: tải lại định kỳ khi trang mở.
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])
  const act = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true)
      try {
        await call(body)
        setError(null)
        load()
        return true
      } catch (e) {
        setError((e as Error).message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [load],
  )
  return { data, error, busy, act }
}

/** "0,30" kiểu Việt (dấu phẩy thập phân); số nhỏ giữ thêm chữ số. */
export function usd(n: number, locale = 'vi'): string {
  const digits = n === 0 ? 2 : n < 0.01 ? 4 : n < 1 ? 3 : 2
  return n.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: n === 0 ? 2 : Math.min(2, digits),
    maximumFractionDigits: digits,
  })
}
