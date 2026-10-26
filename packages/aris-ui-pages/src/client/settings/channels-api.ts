/**
 * Gọi đường `/api/aris/channels` của gói `@aris/channels` (host). Cookie đăng nhập của dsh đi
 * kèm vì cùng nguồn. Token bot chỉ gửi đi một lần khi kết nối, máy chủ không trả lại.
 */
import { useCallback, useEffect, useState } from 'react'

export interface ChannelBot {
  bot: string
  username: string
  name: string
  canReadAll: boolean
  voice: boolean
  home: { chatId: number; threadId?: number } | null
  error: string | null
  running: boolean
}

export interface ChannelPerson {
  userId: number
  name: string
  username?: string
  role: 'owner' | 'member'
  pairedAt: string
}

export interface ChannelGroup {
  chatId: number
  title: string
  allowed: boolean
  who: 'allowed' | 'everyone'
  prompt?: string
}

/** Kênh của mã ghép đôi: mỗi mã chỉ dùng được trên đúng kênh đã tạo ra nó. */
export type PairChannel = 'telegram' | 'lark' | 'zalo'

export interface PairCode {
  code: string
  role: 'owner' | 'member'
  expiresAt: number
  channel: PairChannel
}

/** Một ứng dụng Lark đã nối (mỗi bot của aris tối đa một). App Secret không bao giờ trả ra. */
export interface LarkApp {
  bot: string
  appId: string
  name: string
  domain: 'lark' | 'feishu'
  state: 'receiving' | 'connecting' | 'reconnecting' | 'error'
  error: string | null
  running: boolean
}

export interface LarkPerson {
  openId: string
  name: string
  role: 'owner' | 'member'
  pairedAt: string
}

export interface LarkGroup {
  chatId: string
  title: string
  allowed: boolean
  who: 'allowed' | 'everyone'
  prompt?: string
}

export interface LarkSnapshot {
  apps: LarkApp[]
  people: LarkPerson[]
  groups: LarkGroup[]
  /** `lark-cli` có trên máy; null khi không có. */
  cli: { path: string; version: string | null } | null
}

export interface ChannelSnapshot {
  bots: ChannelBot[]
  people: ChannelPerson[]
  groups: ChannelGroup[]
  codes: PairCode[]
  settings: { busy: 'steer' | 'queue' | 'interrupt'; guestMode: boolean }
  lark: LarkSnapshot
}

const endpoint = () => new URL('api/aris/channels', document.baseURI)

async function call(init?: RequestInit): Promise<ChannelSnapshot> {
  const res = await fetch(endpoint(), { credentials: 'same-origin', ...init })
  const body = (await res.json().catch(() => ({}))) as ChannelSnapshot & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export function useChannels() {
  const [data, setData] = useState<ChannelSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    call().then(
      (d) => (setData(d), setError(null)),
      (e: Error) => setError(e.message),
    )
  }, [])
  useEffect(() => {
    load()
    // Người được ghép đôi, nhóm mới… đến từ Telegram: tải lại định kỳ khi trang đang mở.
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])
  const act = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    try {
      setData(
        await call({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      setError(null)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { data, error, busy, act, reload: load }
}
