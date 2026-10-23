import { describe, expect, it } from 'vitest'
import {
  addressedTo,
  commandAllowed,
  decide,
  parseCommand,
  stripMention,
  type AccessState,
} from './access.js'
import type { TgMessage } from './telegram/types.js'

const BOT = { id: 900, username: 'aris_chunhan_bot' }
const OWNER = 1
const MEMBER = 2
const STRANGER = 3
const GROUP = -1001
const OPEN_GROUP = -1002

function state(over: Partial<AccessState> = {}): AccessState {
  return {
    roleOf: (id) => (id === OWNER ? 'owner' : id === MEMBER ? 'member' : undefined),
    groupRule: (id) =>
      id === GROUP
        ? { allowed: true, who: 'allowed' }
        : id === OPEN_GROUP
          ? { allowed: true, who: 'everyone' }
          : undefined,
    guestMode: false,
    ...over,
  }
}

function msg(from: number, chat: number, text: string, extra: Partial<TgMessage> = {}): TgMessage {
  const entities = [...text.matchAll(/@\w+/g)].map((m) => ({
    type: 'mention',
    offset: m.index,
    length: m[0].length,
  }))
  const cmd = /^\/\w+(@\w+)?/.exec(text)
  if (cmd) entities.unshift({ type: 'bot_command', offset: 0, length: cmd[0].length })
  return {
    message_id: 1,
    from: { id: from, is_bot: false, first_name: 'X' },
    chat: { id: chat, type: chat < 0 ? 'supergroup' : 'private' },
    date: 0,
    text,
    entities,
    ...extra,
  }
}

describe('cửa vào', () => {
  it('chat riêng: chủ nhân và thành viên được, người lạ thì im lặng báo chủ nhân', () => {
    expect(decide(msg(OWNER, OWNER, 'chào'), BOT, state())).toMatchObject({ kind: 'accept', trust: 'owner' })
    expect(decide(msg(MEMBER, MEMBER, 'chào'), BOT, state())).toMatchObject({
      kind: 'accept',
      trust: 'member',
    })
    expect(decide(msg(STRANGER, STRANGER, 'chào'), BOT, state())).toEqual({ kind: 'stranger' })
  })

  it('nhóm: chỉ trả lời khi được @, trả lời vào tin của bot, hoặc lệnh @tên bot', () => {
    expect(decide(msg(OWNER, GROUP, 'mọi người ơi'), BOT, state()).kind).toBe('ignore')
    expect(decide(msg(OWNER, GROUP, '@aris_chunhan_bot tóm tắt giúp'), BOT, state())).toMatchObject({
      kind: 'accept',
      text: 'tóm tắt giúp',
    })
    const reply = msg(OWNER, GROUP, 'thêm ý này', {
      reply_to_message: {
        message_id: 9,
        from: { id: BOT.id, is_bot: true, first_name: 'Aris' },
        chat: { id: GROUP, type: 'supergroup' },
        date: 0,
      },
    })
    expect(decide(reply, BOT, state()).kind).toBe('accept')
    expect(decide(msg(OWNER, GROUP, '/status@aris_chunhan_bot'), BOT, state())).toMatchObject({
      kind: 'accept',
      command: { name: 'status', args: '' },
    })
    // Lệnh không ghi @ trong nhóm: có thể dành cho bot khác, bỏ qua.
    expect(decide(msg(OWNER, GROUP, '/status'), BOT, state()).kind).toBe('ignore')
  })

  it('nhiều bot cùng nhóm: @ bot nào thì chỉ bot đó trả lời', () => {
    expect(addressedTo(msg(OWNER, GROUP, '@lam_nghiencuu_bot tìm giúp'), BOT)).toBe(false)
    const replyButOther = msg(OWNER, GROUP, '@lam_nghiencuu_bot xem tin này', {
      reply_to_message: {
        message_id: 9,
        from: { id: BOT.id, is_bot: true, first_name: 'Aris' },
        chat: { id: GROUP, type: 'supergroup' },
        date: 0,
      },
    })
    expect(addressedTo(replyButOther, BOT)).toBe(false)
    expect(addressedTo(msg(OWNER, GROUP, '@lam_nghiencuu_bot @aris_chunhan_bot cùng làm'), BOT)).toBe(true)
    expect(decide(msg(OWNER, GROUP, '/new@lam_nghiencuu_bot'), BOT, state()).kind).toBe('ignore')
  })

  it('nhóm được phép: mặc định chỉ người được phép; nhóm "mọi thành viên" thì người khác là thành viên', () => {
    expect(decide(msg(STRANGER, GROUP, '@aris_chunhan_bot hi'), BOT, state()).kind).toBe('ignore')
    expect(decide(msg(STRANGER, OPEN_GROUP, '@aris_chunhan_bot hi'), BOT, state())).toMatchObject({
      kind: 'accept',
      trust: 'member',
    })
  })

  it('nhóm lạ: im lặng báo chủ nhân; chế độ khách thì trả lời khi @ đích danh với quyền khách', () => {
    expect(decide(msg(OWNER, -5, '@aris_chunhan_bot hi'), BOT, state())).toEqual({ kind: 'unknown-group' })
    expect(decide(msg(STRANGER, -5, '@aris_chunhan_bot hi'), BOT, state({ guestMode: true }))).toMatchObject({
      kind: 'accept',
      trust: 'guest',
    })
  })

  it('bỏ tin của bot khác và lệnh cho bot khác', () => {
    const fromBot = msg(OWNER, OWNER, 'x', { from: { id: 5, is_bot: true, first_name: 'B' } })
    expect(decide(fromBot, BOT, state()).kind).toBe('ignore')
    expect(parseCommand(msg(OWNER, OWNER, '/model@other_bot x'), BOT)).toMatchObject({ forOther: true })
  })

  it('quyền lệnh: thành viên chỉ dùng lệnh cơ bản', () => {
    expect(commandAllowed('stop', 'member')).toBe(true)
    expect(commandAllowed('model', 'member')).toBe(false)
    expect(commandAllowed('model', 'owner')).toBe(true)
  })

  it('bỏ @tên bot khỏi chữ đưa cho model', () => {
    expect(stripMention('@Aris_ChuNhan_bot tóm tắt @aris_chunhan_bot', BOT)).toBe('tóm tắt')
  })
})
