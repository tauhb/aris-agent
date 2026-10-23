/**
 * Chi phí model hôm nay cho chân thanh bên, từ `/api/aris/providers/state` (gói `@aris/providers`).
 * Trần ngân sách chưa có (giai đoạn 7) nên chỉ hiện số đã tiêu.
 */
import { useEffect, useState } from 'react'

export function useTodayCost(): number | undefined {
  const [usd, setUsd] = useState<number>()
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(new URL('api/aris/providers/state', document.baseURI), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ cost?: { today?: number } }>) : undefined))
        .then((b) => live && typeof b?.cost?.today === 'number' && setUsd(b.cost.today))
        .catch(() => {})
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  return usd
}
