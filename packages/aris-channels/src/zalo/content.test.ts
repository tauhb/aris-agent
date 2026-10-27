import { describe, expect, it } from 'vitest'
import { parseMessage, parseZaloCommand, splitText, toChunks, toPlain } from './content.js'
import type { ZaloInbound } from './types.js'

const SELF = '1001'
const ev = (over: Partial<ZaloInbound>): ZaloInbound => ({
  messageId: 'm1',
  threadId: '2001',
  isGroup: false,
  senderId: '2001',
  senderName: '',
  msgType: 'webchat',
  content: '',
  mentions: [],
  createTime: 0,
  ...over,
})

describe('đọc tin Zalo vào', () => {
  it('tin chữ', () => {
    expect(parseMessage(ev({ content: ' xin chào ' }), SELF)).toMatchObject({
      text: 'xin chào',
      resources: [],
      mentionedSelf: false,
    })
  })

  it('bỏ chỗ @ tài khoản này (kể cả giữa câu), giữ @ người khác', () => {
    const p = parseMessage(
      ev({
        isGroup: true,
        content: '@Aris tóm tắt giúp @Thơ',
        mentions: [
          { uid: SELF, pos: 0, len: 5 },
          { uid: '2002', pos: 19, len: 4 },
        ],
      }),
      SELF,
    )
    expect(p.text).toBe('tóm tắt giúp @Thơ')
    expect(p.mentionedSelf).toBe(true)
    const mid = parseMessage(
      ev({ content: 'nhờ @Aris xem', mentions: [{ uid: SELF, pos: 4, len: 5 }] }),
      SELF,
    )
    expect(mid.text).toBe('nhờ xem')
    expect(
      parseMessage(ev({ content: 'a @Thơ', mentions: [{ uid: '2002', pos: 2, len: 4 }] }), SELF)
        .mentionedSelf,
    ).toBe(false)
  })

  it('ảnh, tệp, tin thoại thành tài nguyên', () => {
    expect(
      parseMessage(
        ev({ msgType: 'chat.photo', content: JSON.stringify({ href: 'https://c/a.jpg', title: 'đây' }) }),
        SELF,
      ),
    ).toMatchObject({ text: 'đây', resources: [{ kind: 'image', url: 'https://c/a.jpg' }] })
    expect(
      parseMessage(
        ev({ msgType: 'share.file', content: JSON.stringify({ href: 'https://c/a.pdf', title: 'a.pdf' }) }),
        SELF,
      ).resources,
    ).toEqual([{ kind: 'file', url: 'https://c/a.pdf', name: 'a.pdf' }])
    expect(
      parseMessage(ev({ msgType: 'chat.voice', content: JSON.stringify({ href: 'https://c/v.m4a' }) }), SELF)
        .resources,
    ).toEqual([{ kind: 'audio', url: 'https://c/v.m4a' }])
  })

  it('loại chưa đọc được (sticker) và nội dung hỏng', () => {
    expect(parseMessage(ev({ msgType: 'chat.sticker', content: '{}' }), SELF).unsupported).toBe(
      'chat.sticker',
    )
    expect(parseMessage(ev({ msgType: 'chat.photo', content: 'không phải JSON' }), SELF)).toMatchObject({
      resources: [],
      unsupported: undefined,
    })
  })

  it('lệnh /tên tham số', () => {
    expect(parseZaloCommand('/resume 2')).toEqual({ name: 'resume', args: '2' })
    expect(parseZaloCommand('/NEW@aris')).toEqual({ name: 'new', args: '' })
    expect(parseZaloCommand('không phải lệnh /new')).toBeUndefined()
  })
})

describe('tin ra: Markdown thành chữ thường', () => {
  it('bỏ **, __, ~~, dấu mã, tiêu đề; liên kết giữ địa chỉ', () => {
    expect(toPlain('# Tiêu đề\n**đậm** __đậm__ ~~gạch~~ `mã` [trang](https://a.vn)')).toBe(
      'Tiêu đề\nđậm đậm gạch mã trang (https://a.vn)',
    )
    expect(toPlain('xem [https://a.vn](https://a.vn)')).toBe('xem https://a.vn')
  })

  it('danh sách * và + thành gạch đầu dòng; trích dẫn bỏ >', () => {
    expect(toPlain('* một\n+ hai\n- ba\n> trích')).toBe('- một\n- hai\n- ba\ntrích')
  })

  it('bảng thành các dòng gạch đầu dòng, khối mã giữ nội dung bỏ hàng rào', () => {
    expect(toPlain('| Tên | Giá |\n|:---|---:|\n| A | **10** |\n| B | 20 |')).toBe(
      '- Tên: A; Giá: 10\n- Tên: B; Giá: 20',
    )
    expect(toPlain('chạy:\n```bash\nls -la\n```\nxong')).toBe('chạy:\nls -la\nxong')
  })
})

describe('chia tin theo 2.000 ký tự', () => {
  it('ngắn thì một tin', () => {
    expect(splitText('abc')).toEqual(['abc'])
    expect(splitText('  ')).toEqual([''])
  })

  it('ngắt ở ranh giới đoạn, rồi dòng, rồi câu; không tin nào quá giới hạn', () => {
    const a = 'a'.repeat(1200)
    const b = 'b'.repeat(1200)
    expect(splitText(`${a}\n\n${b}`)).toEqual([a, b])
    const lines = Array.from({ length: 50 }, (_, i) => `dòng ${i} ${'x'.repeat(60)}`).join('\n')
    const byLine = splitText(lines)
    expect(byLine.length).toBeGreaterThan(1)
    for (const c of byLine) {
      expect(c.length).toBeLessThanOrEqual(2000)
      for (const l of c.split(/\n+/)) expect(l.startsWith('dòng ')).toBe(true)
    }
    const sentences = Array.from({ length: 80 }, (_, i) => `Câu số ${i} khá là dài dòng.`).join(' ')
    const bySentence = splitText(sentences)
    for (const c of bySentence) {
      expect(c.length).toBeLessThanOrEqual(2000)
      expect(c.endsWith('.')).toBe(true)
    }
  })

  it('một khối liền không có chỗ ngắt thì cắt cứng, không mất ký tự', () => {
    const long = 'z'.repeat(4500)
    const parts = splitText(long)
    expect(parts.map((p) => p.length)).toEqual([2000, 2000, 500])
    expect(parts.join('')).toBe(long)
  })

  it('toChunks: đổi Markdown rồi mới chia', () => {
    expect(toChunks('**a**')).toEqual(['a'])
    const big = Array.from({ length: 40 }, () => `**${'đ'.repeat(100)}**`).join('\n\n')
    const out = toChunks(big)
    expect(out.length).toBeGreaterThan(1)
    expect(out.join('')).not.toContain('*')
  })
})
