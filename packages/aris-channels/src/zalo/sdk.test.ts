import { GroupMessage, UserMessage, type TGroupMessage, type TMessage } from 'zca-js'
import { describe, expect, it } from 'vitest'
import { sdkConnector, toInbound } from './sdk.js'

const raw = (over: Partial<TMessage>): TMessage =>
  ({
    msgId: '9001',
    cliMsgId: '1',
    msgType: 'webchat',
    uidFrom: '2001',
    idTo: '1001',
    dName: 'Hoàng Bá Tầu',
    ts: '1700000000000',
    content: 'xin chào',
    ...over,
  }) as TMessage

describe('thư viện zca-js: chuẩn hoá tin vào', () => {
  it('tin riêng', () => {
    const m = new UserMessage('1001', raw({}))
    expect(toInbound(m)).toEqual({
      messageId: '9001',
      threadId: '2001',
      isGroup: false,
      senderId: '2001',
      senderName: 'Hoàng Bá Tầu',
      msgType: 'webchat',
      content: 'xin chào',
      mentions: [],
      createTime: 1_700_000_000_000,
    })
  })

  it('tin nhóm: mã nhóm là nơi trả lời, giữ danh sách @', () => {
    const data = {
      ...raw({ idTo: '5001' }),
      mentions: [{ uid: '1001', pos: 0, len: 5, type: 0 }],
    } as TGroupMessage
    const m = new GroupMessage('1001', data)
    expect(toInbound(m)).toMatchObject({
      threadId: '5001',
      isGroup: true,
      senderId: '2001',
      mentions: [{ uid: '1001', pos: 0, len: 5 }],
    })
  })

  it('nội dung đính kèm (đối tượng) thành chuỗi JSON để lưu hàng đợi bền', () => {
    const m = new UserMessage(
      '1001',
      raw({ msgType: 'chat.photo', content: { href: 'https://c/a.jpg', title: 'x' } as TMessage['content'] }),
    )
    expect(JSON.parse(toInbound(m).content)).toEqual({ href: 'https://c/a.jpg', title: 'x' })
  })

  it('tin chính tài khoản gửi (chủ tự gõ trên điện thoại) mang dấu fromSelf, nơi trả lời là người nhận', () => {
    const m = new UserMessage('1001', raw({ uidFrom: '0', idTo: '2001' }))
    expect(toInbound(m)).toMatchObject({ threadId: '2001', senderId: '1001', fromSelf: true })
  })

  it('giờ tin hỏng thì lấy giờ hiện tại', () => {
    const before = Date.now()
    expect(toInbound(new UserMessage('1001', raw({ ts: 'x' }))).createTime).toBeGreaterThanOrEqual(before)
  })
})

describe('thư viện zca-js: đăng nhập bằng dữ liệu đã lưu', () => {
  it('thiếu cookie/imei/userAgent thì ném lỗi, không gọi mạng; lỗi này là lỗi của Zalo nên phải quét lại QR', async () => {
    const err = await sdkConnector.open({ imei: '', userAgent: '', cookie: [] }, { warn() {} }).then(
      () => undefined,
      (e: unknown) => e as { fatal?: boolean; message: string },
    )
    expect(err).toBeDefined()
    expect(err!.fatal).toBe(true)
    expect(err!.message.toLowerCase()).not.toContain('cookie=')
  })
})
