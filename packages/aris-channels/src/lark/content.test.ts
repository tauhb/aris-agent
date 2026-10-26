import { describe, expect, it } from 'vitest'
import { decideLark, type LarkAccessState } from './access.js'
import { hasMarkdown, parseLarkCommand, parseMessage, splitMarkdown, toOutgoing } from './content.js'
import type { LarkInbound } from './types.js'

const BOT = 'ou_bot'

const ev = (over: Partial<LarkInbound>): LarkInbound => ({
  eventId: 'e1',
  messageId: 'om_1',
  chatId: 'oc_1',
  chatType: 'p2p',
  senderOpenId: 'ou_a',
  senderType: 'user',
  messageType: 'text',
  content: '{}',
  mentions: [],
  createTime: 0,
  ...over,
})

describe('đọc tin Lark', () => {
  it('tin chữ: bỏ chỗ @ bot, @ người khác thành @tên', () => {
    const p = parseMessage(
      ev({
        content: JSON.stringify({ text: '@_user_1 hỏi giúp @_user_2 cái này' }),
        mentions: [
          { key: '@_user_1', openId: BOT, name: 'Aris' },
          { key: '@_user_2', openId: 'ou_b', name: 'Thơ' },
        ],
      }),
      BOT,
    )
    expect(p.text).toBe('hỏi giúp @Thơ cái này')
    expect(p.mentionedBot).toBe(true)
  })

  it('tin không @ bot: mentionedBot false', () => {
    const p = parseMessage(
      ev({
        content: JSON.stringify({ text: '@_user_1 chào' }),
        mentions: [{ key: '@_user_1', openId: 'ou_b', name: 'Thơ' }],
      }),
      BOT,
    )
    expect(p.mentionedBot).toBe(false)
    expect(p.text).toBe('@Thơ chào')
  })

  it('bài post: lấy chữ, link, ảnh; nhận cả dạng bọc theo ngôn ngữ', () => {
    const flat = {
      title: 'Báo cáo',
      content: [
        [
          { tag: 'text', text: 'Xem ' },
          { tag: 'a', text: 'tại đây', href: 'https://x.vn' },
        ],
        [{ tag: 'img', image_key: 'img_1' }],
        [
          { tag: 'at', user_id: '@_user_1', user_name: 'Aris' },
          { tag: 'text', text: ' nhé' },
        ],
      ],
    }
    for (const body of [flat, { zh_cn: flat }]) {
      const p = parseMessage(
        ev({
          messageType: 'post',
          content: JSON.stringify(body),
          mentions: [{ key: '@_user_1', openId: BOT, name: 'Aris' }],
        }),
        BOT,
      )
      expect(p.text).toBe('Báo cáo\nXem tại đây (https://x.vn)\nnhé')
      expect(p.resources).toEqual([{ kind: 'image', fileKey: 'img_1' }])
    }
  })

  it('ảnh, tệp, ghi âm thành tài nguyên cần tải', () => {
    expect(parseMessage(ev({ messageType: 'image', content: '{"image_key":"k"}' }), BOT).resources).toEqual([
      { kind: 'image', fileKey: 'k' },
    ])
    expect(
      parseMessage(ev({ messageType: 'file', content: '{"file_key":"f","file_name":"a.pdf"}' }), BOT)
        .resources,
    ).toEqual([{ kind: 'file', fileKey: 'f', name: 'a.pdf' }])
    expect(
      parseMessage(ev({ messageType: 'audio', content: '{"file_key":"a","duration":1500}' }), BOT).resources,
    ).toEqual([{ kind: 'audio', fileKey: 'a', durationMs: 1500 }])
  })

  it('loại tin lạ: ghi nhận để báo; JSON hỏng không ném lỗi', () => {
    expect(parseMessage(ev({ messageType: 'sticker', content: '{"file_key":"x"}' }), BOT).unsupported).toBe(
      'sticker',
    )
    expect(parseMessage(ev({ messageType: 'text', content: 'không phải json' }), BOT)).toMatchObject({
      text: '',
      resources: [],
    })
  })

  it('lệnh ở đầu tin', () => {
    expect(parseLarkCommand('/new')).toEqual({ name: 'new', args: '' })
    expect(parseLarkCommand('/Resume 2')).toEqual({ name: 'resume', args: '2' })
    expect(parseLarkCommand('/status@aris x')).toEqual({ name: 'status', args: 'x' })
    expect(parseLarkCommand('đường dẫn /usr/bin')).toBeUndefined()
    expect(parseLarkCommand('//')).toBeUndefined()
  })
})

describe('quyền ở cửa vào Lark', () => {
  const state = (over: Partial<LarkAccessState> = {}): LarkAccessState => ({
    roleOf: (id) => (id === 'ou_owner' ? 'owner' : id === 'ou_member' ? 'member' : undefined),
    groupRule: (id) => (id === 'oc_ok' ? { allowed: true, who: 'allowed' } : undefined),
    guestMode: false,
    ...over,
  })
  const run = (e: Partial<LarkInbound>, text: string, mentioned: boolean, st = state()) =>
    decideLark(ev(e), { text, resources: [], mentionedBot: mentioned }, st)

  it('chat riêng: đã ghép thì nhận, chưa thì người lạ', () => {
    expect(run({ senderOpenId: 'ou_owner' }, 'chào', false)).toMatchObject({ kind: 'accept', trust: 'owner' })
    expect(run({ senderOpenId: 'ou_x' }, 'chào', false)).toEqual({ kind: 'stranger' })
    expect(run({ senderOpenId: 'ou_member' }, '/new', false)).toMatchObject({
      kind: 'accept',
      trust: 'member',
      command: { name: 'new' },
    })
  })

  it('bot và ứng dụng khác bị bỏ qua', () => {
    expect(run({ senderType: 'app', senderOpenId: 'ou_owner' }, 'x', false).kind).toBe('ignore')
  })

  it('nhóm: không @ thì bỏ qua; nhóm lạ thì báo; nhóm được phép tuỳ người gửi', () => {
    const g = { chatType: 'group', chatId: 'oc_ok' }
    expect(run({ ...g, senderOpenId: 'ou_owner' }, 'x', false).kind).toBe('ignore')
    expect(run({ ...g, senderOpenId: 'ou_owner' }, 'x', true)).toMatchObject({
      kind: 'accept',
      trust: 'owner',
    })
    expect(run({ ...g, senderOpenId: 'ou_x' }, 'x', true).kind).toBe('ignore')
    expect(run({ chatType: 'group', chatId: 'oc_new', senderOpenId: 'ou_owner' }, 'x', true).kind).toBe(
      'unknown-group',
    )
  })

  it('nhóm lạ + chế độ khách: trả lời với quyền khách khi được @', () => {
    const st = state({ guestMode: true })
    expect(run({ chatType: 'group', chatId: 'oc_new', senderOpenId: 'ou_x' }, 'x', true, st)).toMatchObject({
      kind: 'accept',
      trust: 'guest',
    })
    expect(run({ chatType: 'group', chatId: 'oc_new', senderOpenId: 'ou_x' }, 'x', false, st).kind).toBe(
      'ignore',
    )
  })

  it('nhóm cho mọi thành viên: người chưa ghép thành member', () => {
    const st = state({ groupRule: () => ({ allowed: true, who: 'everyone' }) })
    expect(run({ chatType: 'group', chatId: 'oc_ok', senderOpenId: 'ou_x' }, 'x', true, st)).toMatchObject({
      kind: 'accept',
      trust: 'member',
    })
  })
})

describe('tin Lark gửi ra', () => {
  it('nhận ra Markdown', () => {
    expect(hasMarkdown('Chào bạn nhé')).toBe(false)
    expect(hasMarkdown('Giá **490k**')).toBe(true)
    expect(hasMarkdown('- một\n- hai')).toBe(true)
    expect(hasMarkdown('xem [link](https://x.vn)')).toBe(true)
    expect(hasMarkdown('dùng `npm i`')).toBe(true)
    expect(hasMarkdown('# Tiêu đề')).toBe(true)
  })

  it('chữ thường thành tin text, có Markdown thành thẻ', () => {
    expect(toOutgoing('xin chào')).toEqual({ msgType: 'text', content: '{"text":"xin chào"}' })
    const card = toOutgoing('**đậm**')
    expect(card.msgType).toBe('interactive')
    expect(JSON.parse(card.content)).toEqual({
      schema: '2.0',
      body: { elements: [{ tag: 'markdown', content: '**đậm**' }] },
    })
  })

  it('chia theo đoạn, không phần nào vượt giới hạn, không mất chữ', () => {
    const paras = Array.from({ length: 10 }, (_, i) => `Đoạn ${i}: ${'a'.repeat(400)}`)
    const parts = splitMarkdown(paras.join('\n\n'), 1000)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 1000)).toBe(true)
    expect(parts.join('\n\n')).toBe(paras.join('\n\n'))
    expect(splitMarkdown('ngắn')).toEqual(['ngắn'])
    expect(splitMarkdown('  ')).toEqual([''])
  })

  it('dòng quá dài và khối mã quá dài vẫn chia được, khối mã giữ hàng rào', () => {
    const long = 'b'.repeat(2500)
    const parts = splitMarkdown(long, 1000)
    expect(parts.every((p) => p.length <= 1000)).toBe(true)
    expect(parts.join('')).toBe(long)

    const code = '```ts\n' + Array.from({ length: 60 }, (_, i) => `const v${i} = ${i}`).join('\n') + '\n```'
    const cp = splitMarkdown(code, 300)
    expect(cp.length).toBeGreaterThan(1)
    for (const p of cp) {
      expect(p.length).toBeLessThanOrEqual(300)
      expect((p.match(/```/g) ?? []).length % 2).toBe(0)
    }
    expect(cp.join('\n')).toContain('const v59 = 59')
  })
})
