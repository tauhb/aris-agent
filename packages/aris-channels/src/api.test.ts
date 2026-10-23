import { describe, expect, it } from 'vitest'
import { handleApi } from './api.js'
import type { ChannelHub } from './hub.js'
import { memStore } from './store.test.js'

const post = (body: unknown) =>
  new Request('http://x/api/aris/channels', { method: 'POST', body: JSON.stringify(body) })

function fakeHub() {
  const connected: string[] = []
  const hub = {
    api: () => undefined,
    connect: async (_bot: string, token: string) => void connected.push(token),
    disconnect: async () => {},
  } as unknown as ChannelHub
  return { hub, connected }
}

describe('/api/aris/channels', () => {
  it('kết nối: kiểm dạng token, không trả token ra', async () => {
    const store = memStore()
    const { hub, connected } = fakeHub()
    expect((await handleApi(store, hub, post({ op: 'connect', token: 'abc' }))).status).toBe(400)
    const token = '123456:AAHk3-very_long_secret_value_xx'
    const res = await handleApi(store, hub, post({ op: 'connect', token }))
    expect(res.status).toBe(200)
    expect(connected).toEqual([token])
    expect(await res.text()).not.toContain('very_long_secret')
  })

  it('mã ghép đôi, nhóm, cài đặt', async () => {
    const store = memStore()
    const { hub } = fakeHub()
    const code = (await (await handleApi(store, hub, post({ op: 'code', role: 'member' }))).json()) as {
      created: { code: string; role: string }
    }
    expect(code.created.role).toBe('member')
    await handleApi(
      store,
      hub,
      post({ op: 'group', chatId: -100, allowed: true, who: 'everyone', prompt: 'Trả lời ngắn' }),
    )
    expect(store.group(-100)).toMatchObject({ allowed: true, who: 'everyone', prompt: 'Trả lời ngắn' })
    await handleApi(store, hub, post({ op: 'settings', busy: 'queue', guestMode: true }))
    const snap = (await (await handleApi(store, hub, new Request('http://x'))).json()) as {
      settings: unknown
      codes: unknown[]
    }
    expect(snap.settings).toEqual({ busy: 'queue', guestMode: true })
    expect(snap.codes).toHaveLength(1)
    expect((await handleApi(store, hub, post({ op: 'nope' }))).status).toBe(400)
  })
})
