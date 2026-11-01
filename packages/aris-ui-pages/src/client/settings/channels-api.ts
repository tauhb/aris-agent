/**
 * Gọi đường `/api/aris/channels` của gói `@aris/channels` (host). Cookie đăng nhập của dsh đi
 * kèm vì cùng nguồn. Token bot chỉ gửi đi một lần khi kết nối, máy chủ không trả lại.
 */
import { useCallback, useEffect, useState } from 'react'

/** Chỉ trả lời theo tài liệu (GĐ8.7 đợt D): áp cho khách của tài khoản. */
export interface DocsSetting {
  on: boolean
  folders: string[]
  noInfo?: string
}

/** Ai được bot trả lời trong chat riêng: chỉ người đã ghép đôi, hay mọi người là khách. */
export type AccountMode = 'paired' | 'guests'

/** Một tài khoản Telegram (GĐ8.7: một bot nhiều tài khoản; tài khoản cũ có mã là mã bot). */
export interface ChannelBot {
  account: string
  label: string
  mode: AccountMode
  docs: DocsSetting | null
  /** Bot của aris trả lời trên tài khoản này. */
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
  /** Trống là dùng chung mọi tài khoản (chủ nhân, người ghép đôi trước GĐ8.7). */
  account?: string
}

export interface ChannelGroup {
  chatId: number
  account?: string
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
  /** Chỉ dùng được trên tài khoản này; trống là mọi tài khoản của kênh. */
  account?: string
}

/** Trạng thái một tài khoản Zalo cá nhân. */
export type ZaloState = 'connecting' | 'listening' | 'web' | 'retrying' | 'needs-qr'

export interface ZaloHours {
  /** 0 = Chủ nhật … 6 = Thứ bảy. */
  days: number[]
  from: string
  to: string
  offReply?: string
}

export interface ZaloAccount {
  account: string
  label: string
  mode: AccountMode
  hand: boolean
  hours: ZaloHours | null
  skipLabels: string[]
  docs: DocsSetting | null
  bot: string
  /** Mã Zalo của tài khoản. */
  id: string
  name: string
  avatar: string
  state: ZaloState
  error: string | null
  running: boolean
  leftToday: number
}

export interface ZaloLogin {
  key: string
  account?: string
  bot: string
  status: 'waiting' | 'scanned' | 'done' | 'expired' | 'declined' | 'error'
  qrPng?: string
  expiresAt?: number
  name?: string
  avatar?: string
  error?: string
}

export interface ZaloSnapshot {
  accounts: ZaloAccount[]
  logins: ZaloLogin[]
  people: {
    zaloId: string
    name: string
    role: 'owner' | 'member'
    pairedAt: string
    account: string | null
  }[]
  groups: {
    groupId: string
    account: string | null
    title: string
    allowed: boolean
    who: 'allowed' | 'everyone'
    prompt?: string
  }[]
  limits: { perChatMs: number; perMinute: number; perDay: number }
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
  settings: { busy: 'steer' | 'queue' | 'interrupt'; guestMode: boolean; sharedThreads?: boolean }
  lark: LarkSnapshot
  zalo: ZaloSnapshot
  /** Thư mục bộ não chọn được làm nguồn (rỗng khi bộ não chưa chạy). */
  docFolders: { path: string; title: string; pages: number }[]
  /** Câu mặc định khi không tìm thấy thông tin. */
  noInfo: string
}

/** Kết quả thêm phần của vài thao tác (ảnh QR, danh sách nhãn) đi kèm ảnh chụp. */
export type ChannelReply = ChannelSnapshot & {
  qr?: { qrPng: string; expiresAt: number; key: string }
  labels?: string[]
}

const endpoint = () => new URL('api/aris/channels', document.baseURI)

async function call(init?: RequestInit): Promise<ChannelReply> {
  const res = await fetch(endpoint(), { credentials: 'same-origin', ...init })
  const body = (await res.json().catch(() => ({}))) as ChannelReply & { error?: string }
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
  /** Gọi một thao tác; trả kết quả (có ảnh QR, nhãn… khi thao tác trả thêm) hay `undefined` khi lỗi. */
  const ask = useCallback(async (body: Record<string, unknown>): Promise<ChannelReply | undefined> => {
    setBusy(true)
    try {
      const r = await call({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      // `zalo-labels` chỉ trả nhãn, không có ảnh chụp.
      if (r.bots) setData(r)
      setError(null)
      return r
    } catch (e) {
      setError((e as Error).message)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  const act = useCallback(async (body: Record<string, unknown>) => (await ask(body)) !== undefined, [ask])
  return { data, error, busy, act, ask, reload: load }
}
