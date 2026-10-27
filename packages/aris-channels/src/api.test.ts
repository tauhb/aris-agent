import { describe, expect, it } from 'vitest'
import { handleApi } from './api.js'
import type { ChannelHub } from './hub.js'
import type { LarkChannel } from './lark/channel.js'
import type { ZaloChannel } from './zalo/channel.js'
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
    expect(code.created).toMatchObject({ channel: 'telegram' })
    const lark = (await (
      await handleApi(store, hub, post({ op: 'code', role: 'owner', channel: 'lark' }))
    ).json()) as {
      created: { channel: string }
    }
    expect(lark.created.channel).toBe('lark')
    expect((await handleApi(store, hub, post({ op: 'code', channel: 'sms' }))).status).toBe(400)
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
    expect(snap.codes).toHaveLength(2)
    expect((await handleApi(store, hub, post({ op: 'nope' }))).status).toBe(400)
  })

  describe('Lark', () => {
    const SECRET = 'S3CR3T-never-returned-0123456789'
    function fakeLark() {
      const calls: unknown[] = []
      const lark = {
        connect: async (bot: string, c: unknown) => void calls.push(['connect', bot, c]),
        disconnect: async (bot: string) => void calls.push(['disconnect', bot]),
        status: () => [
          {
            bot: 'aris',
            appId: 'cli_a8f2c4d6e0b13579',
            name: 'Aris',
            domain: 'lark',
            state: 'receiving',
            error: null,
            running: true,
          },
        ],
      } as unknown as LarkChannel
      return { lark, calls }
    }
    const run = (store: ReturnType<typeof memStore>, body: unknown, lark?: LarkChannel) =>
      handleApi(store, fakeHub().hub, post(body), undefined, lark, async () => ({
        path: '/x/lark-cli',
        version: '1.0.0',
      }))

    it('kết nối: chuyển khoá cho kênh Lark, không bao giờ trả App Secret ra', async () => {
      const store = memStore()
      const { lark, calls } = fakeLark()
      const res = await run(
        store,
        {
          op: 'connect-lark',
          bot: 'aris',
          appId: ' cli_a8f2c4d6e0b13579 ',
          appSecret: SECRET,
          domain: 'feishu',
        },
        lark,
      )
      expect(res.status).toBe(200)
      expect(calls).toEqual([
        ['connect', 'aris', { appId: 'cli_a8f2c4d6e0b13579', appSecret: SECRET, domain: 'feishu' }],
      ])
      const text = await res.text()
      expect(text).not.toContain(SECRET)
      expect(JSON.parse(text).lark.apps[0]).toMatchObject({
        state: 'receiving',
        appId: 'cli_a8f2c4d6e0b13579',
      })
      expect((await run(store, { op: 'connect-lark', appId: 'x' }, lark)).status).toBe(400)
      expect((await run(store, { op: 'connect-lark', appId: 'x', appSecret: 'y' })).status).toBe(400)
    })

    it('lỗi khi kết nối trả 400 kèm lời báo', async () => {
      const lark = {
        connect: async () => {
          throw new Error('Lark 10014: app secret invalid')
        },
      } as unknown as LarkChannel
      const res = await run(
        memStore(),
        { op: 'connect-lark', appId: 'cli_a8f2c4d6e0b13579', appSecret: SECRET },
        lark,
      )
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('10014')
    })

    it('gỡ ứng dụng, gỡ người, nhóm Lark', async () => {
      const store = memStore()
      const { lark, calls } = fakeLark()
      await store.redeemLark((await store.createCode('owner', 'lark')).code, { openId: 'ou_a', name: 'A' })
      await run(store, { op: 'disconnect-lark', bot: 'aris' }, lark)
      expect(calls).toEqual([['disconnect', 'aris']])
      await run(store, { op: 'lark-group', chatId: 'oc_g', allowed: true, who: 'everyone', prompt: 'ngắn' })
      expect(store.larkGroup('oc_g')).toMatchObject({ allowed: true, who: 'everyone', prompt: 'ngắn' })
      expect(store.groups()).toEqual([])
      await run(store, { op: 'lark-group-remove', chatId: 'oc_g' })
      expect(store.larkGroups()).toEqual([])
      expect((await run(store, { op: 'lark-group', chatId: 5 })).status).toBe(400)
      expect((await run(store, { op: 'revoke-lark' })).status).toBe(400)
      await run(store, { op: 'revoke-lark', openId: 'ou_a' })
      expect(store.larkPeople()).toEqual([])
    })

    it('ảnh chụp trạng thái: người, nhóm, lark-cli của Lark nằm riêng; Telegram không lẫn', async () => {
      const store = memStore()
      await store.redeemLark((await store.createCode('owner', 'lark')).code, { openId: 'ou_a', name: 'A' })
      await store.upsertLarkGroup('oc_g', { title: 'Nhóm' })
      const snap = (await (
        await handleApi(store, fakeHub().hub, new Request('http://x'), undefined, undefined, async () => ({
          path: '/x/lark-cli',
          version: null,
        }))
      ).json()) as {
        people: unknown[]
        groups: unknown[]
        lark: { people: unknown[]; groups: unknown[]; cli: unknown; apps: unknown[] }
      }
      expect(snap.people).toEqual([])
      expect(snap.groups).toEqual([])
      expect(snap.lark.people).toMatchObject([{ openId: 'ou_a', name: 'A', role: 'owner' }])
      expect(snap.lark.groups).toMatchObject([{ chatId: 'oc_g', title: 'Nhóm', allowed: false }])
      expect(snap.lark.cli).toEqual({ path: '/x/lark-cli', version: null })
      expect(snap.lark.apps).toEqual([])
    })
  })

  describe('Zalo', () => {
    function fakeZalo() {
      const calls: unknown[] = []
      const zalo = {
        loginStart: async (bot: string, opts: unknown) => {
          calls.push(['login-start', bot, opts])
          return { qrPng: 'QR-BASE64', expiresAt: 123, key: 'new-aris' }
        },
        loginStatuses: () => [
          { key: 'new-aris', bot: 'aris', status: 'waiting', qrPng: 'QR-BASE64', expiresAt: 123 },
        ],
        logout: async (account: string) => void calls.push(['logout', account]),
        updateAccount: async (account: string, patch: unknown) => void calls.push(['update', account, patch]),
        status: () => [
          {
            bot: 'aris',
            id: '1001',
            name: 'Tài khoản phụ',
            avatar: 'https://a/b.png',
            state: 'listening',
            error: null,
            running: true,
            leftToday: 300,
          },
        ],
      } as unknown as ZaloChannel
      return { zalo, calls }
    }
    const run = (store: ReturnType<typeof memStore>, body: unknown, zalo?: ZaloChannel) =>
      handleApi(store, fakeHub().hub, post(body), undefined, undefined, undefined, zalo)

    it('đăng nhập QR: trả ảnh QR, cho hỏi lại trạng thái; chưa bật kênh thì báo lỗi', async () => {
      const store = memStore()
      const { zalo, calls } = fakeZalo()
      const res = await run(store, { op: 'zalo-login-start', bot: 'aris' }, zalo)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        qr: { qrPng: string; expiresAt: number; key: string }
        zalo: { logins: unknown[] }
      }
      expect(body.qr).toEqual({ qrPng: 'QR-BASE64', expiresAt: 123, key: 'new-aris' })
      expect(body.zalo.logins).toMatchObject([{ key: 'new-aris', status: 'waiting' }])
      expect(calls).toEqual([['login-start', 'aris', { account: undefined, label: undefined }]])
      const status = (await (await run(store, { op: 'zalo-login-status' }, zalo)).json()) as {
        zalo: { logins: { status: string }[] }
      }
      expect(status.zalo.logins[0]!.status).toBe('waiting')
      await run(store, { op: 'zalo-login-start', bot: 'mai', account: 'acc-abc123', label: ' CSKH 2 ' }, zalo)
      expect(calls.at(-1)).toEqual(['login-start', 'mai', { account: 'acc-abc123', label: 'CSKH 2' }])
      await run(
        store,
        { op: 'account', channel: 'zalo', account: 'acc-abc123', bot: 'tho', mode: 'guests' },
        zalo,
      )
      expect(calls.at(-1)).toEqual(['update', 'acc-abc123', { bot: 'tho', mode: 'guests' }])
      expect((await run(store, { op: 'zalo-login-start' })).status).toBe(400)
    })

    it('lỗi khi đăng nhập trả 400 kèm lời báo', async () => {
      const zalo = {
        loginStart: async () => {
          throw new Error('Zalo chưa trả mã QR')
        },
        loginStatuses: () => [],
        status: () => [],
      } as unknown as ZaloChannel
      const res = await run(memStore(), { op: 'zalo-login-start' }, zalo)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('mã QR')
    })

    it('đăng xuất, gỡ người, bật/tắt nhóm Zalo', async () => {
      const store = memStore()
      const { zalo, calls } = fakeZalo()
      await store.redeemZalo((await store.createCode('owner', 'zalo')).code, { zaloId: '2001', name: 'A' })
      await run(store, { op: 'zalo-logout', account: 'acc-abc123' }, zalo)
      expect(calls).toEqual([['logout', 'acc-abc123']])
      await run(store, { op: 'zalo-group', groupId: '5001', allowed: true, who: 'everyone', prompt: 'ngắn' })
      expect(store.zaloGroup('5001')).toMatchObject({ allowed: true, who: 'everyone', prompt: 'ngắn' })
      expect(store.groups()).toEqual([])
      expect(store.larkGroups()).toEqual([])
      await run(store, { op: 'zalo-group-remove', groupId: '5001' })
      expect(store.zaloGroups()).toEqual([])
      expect((await run(store, { op: 'zalo-group', groupId: 5 })).status).toBe(400)
      expect((await run(store, { op: 'revoke-zalo' })).status).toBe(400)
      await run(store, { op: 'revoke-zalo', zaloId: '2001' })
      expect(store.zaloPeople()).toEqual([])
    })

    it('mã ghép đôi channel zalo; ảnh chụp: người, nhóm, giới hạn của Zalo nằm riêng, Telegram và Lark không lẫn', async () => {
      const store = memStore()
      const created = (await (await run(store, { op: 'code', role: 'owner', channel: 'zalo' })).json()) as {
        created: { code: string; channel: string }
      }
      expect(created.created.channel).toBe('zalo')
      await store.redeemZalo(created.created.code, { zaloId: '2001', name: 'A' })
      await store.upsertZaloGroup('5001', { title: 'Nhóm' })
      const { zalo } = fakeZalo()
      const snap = (await (await run(store, { op: 'zalo-login-status' }, zalo)).json()) as {
        people: unknown[]
        groups: unknown[]
        lark: { people: unknown[]; groups: unknown[] }
        zalo: { accounts: unknown[]; people: unknown[]; groups: unknown[]; limits: unknown }
      }
      expect(snap.people).toEqual([])
      expect(snap.groups).toEqual([])
      expect(snap.lark.people).toEqual([])
      expect(snap.lark.groups).toEqual([])
      expect(snap.zalo.people).toMatchObject([{ zaloId: '2001', name: 'A', role: 'owner' }])
      expect(snap.zalo.groups).toMatchObject([{ groupId: '5001', title: 'Nhóm', allowed: false }])
      expect(snap.zalo.accounts).toMatchObject([{ id: '1001', state: 'listening', leftToday: 300 }])
      expect(snap.zalo.limits).toEqual({ perChatMs: 3000, perMinute: 20, perDay: 300 })
    })

    it('ảnh chụp không bao giờ chứa dữ liệu đăng nhập', async () => {
      const store = memStore()
      await store.putZaloAccount({
        bot: 'aris',
        tgId: 0,
        username: '1001',
        name: 'A',
        tokenRef: 'ZALO_ARIS_SESSION',
        canReadAll: true,
        offset: 0,
        voice: false,
        addedAt: 'x',
        channel: 'zalo',
        botOpenId: '1001',
      })
      const text = await (await handleApi(store, fakeHub().hub, new Request('http://x'))).text()
      expect(text).not.toContain('tokenRef')
      expect(JSON.parse(text).zalo.accounts[0]).toMatchObject({ id: '1001', state: 'connecting' })
    })
  })
})
