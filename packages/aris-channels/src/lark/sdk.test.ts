import { describe, expect, it } from 'vitest'
import { larkCliProbe } from './cli.js'
import { redact, sdkLogger, toInbound, toLarkError } from './sdk.js'
import { LarkError } from './types.js'

const SECRET = 'S3CR3T-never-in-logs-0123456789'

describe('SDK Lark: không để lộ App Secret', () => {
  it('logger chỉ nhận chuỗi và Error.message, bỏ đối tượng (SDK có thể ghi cả thân yêu cầu chứa khoá)', () => {
    const lines: string[] = []
    const log = sdkLogger({ warn: (m, ...a) => lines.push([m, ...a].join(' ')) }, SECRET)
    // Dạng SDK thật ghi khi lấy token lỗi: mảng chứa cấu hình yêu cầu có app_secret.
    log.error([
      {
        message: 'Request failed',
        config: { data: JSON.stringify({ app_id: 'cli_x', app_secret: SECRET }) },
      },
    ])
    log.error(`token lỗi ${SECRET}`, new Error(`hỏng ${SECRET}`))
    log.info('im lặng')
    log.debug('im lặng')
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain(SECRET)
    expect(lines[0]).toContain('***')
  })

  it('redact che mọi chỗ; khoá rỗng thì để nguyên', () => {
    expect(redact(`a ${SECRET} b ${SECRET}`, SECRET)).toBe('a *** b ***')
    expect(redact('abc', '')).toBe('abc')
  })

  it('lỗi: lấy mã và lời của Lark, không lấy cấu hình yêu cầu; mã khoá sai là fatal', () => {
    const axiosLike = {
      message: 'Request failed with status code 400',
      config: { data: JSON.stringify({ app_secret: SECRET }) },
      response: { status: 400, data: { code: 10014, msg: 'app secret invalid' } },
    }
    const e = toLarkError(axiosLike, SECRET)
    expect(e).toBeInstanceOf(LarkError)
    expect(e).toMatchObject({ code: 10014, fatal: true })
    expect(e.message).toBe('Lark 10014: app secret invalid')
    expect(toLarkError({ response: { data: { code: 99991672, msg: 'no scope' } } }, SECRET).fatal).toBe(false)
    expect(toLarkError({ response: { status: 502 } }, SECRET).message).toBe('Lark trả HTTP 502')
    const net = toLarkError(new Error(`ECONNRESET ${SECRET}`), SECRET)
    expect(net.message).not.toContain(SECRET)
    expect(net.fatal).toBe(false)
    const same = new LarkError('x')
    expect(toLarkError(same, SECRET)).toBe(same)
  })
})

describe('sự kiện im.message.receive_v1', () => {
  it('chuẩn hoá về LarkInbound', () => {
    const inbound = toInbound({
      event_id: 'e1',
      sender: { sender_id: { open_id: 'ou_a' }, sender_type: 'user' },
      message: {
        message_id: 'om_1',
        chat_id: 'oc_1',
        chat_type: 'group',
        message_type: 'text',
        content: '{"text":"@_user_1 hi"}',
        create_time: '1700000000000',
        root_id: 'om_root',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' }, name: 'Aris' }],
      },
    })
    expect(inbound).toEqual({
      eventId: 'e1',
      messageId: 'om_1',
      chatId: 'oc_1',
      chatType: 'group',
      senderOpenId: 'ou_a',
      senderType: 'user',
      messageType: 'text',
      content: '{"text":"@_user_1 hi"}',
      rootId: 'om_root',
      mentions: [{ key: '@_user_1', openId: 'ou_bot', name: 'Aris' }],
      createTime: 1700000000000,
    })
  })
})

describe('dò lark-cli', () => {
  it('có thì trả đường dẫn và phiên bản; không có thì null; nhớ kết quả 60 giây', async () => {
    let now = 0
    let finds = 0
    const probe = larkCliProbe({
      find: (n) => (finds++, n === 'lark-cli' ? '/opt/homebrew/bin/lark-cli' : undefined),
      version: async () => '1.2.3',
      now: () => now,
    })
    expect(await probe()).toEqual({ path: '/opt/homebrew/bin/lark-cli', version: '1.2.3' })
    await probe()
    expect(finds).toBe(1)
    now += 61_000
    await probe()
    expect(finds).toBe(2)
    const none = larkCliProbe({ find: () => undefined })
    expect(await none()).toBeNull()
  })
})
