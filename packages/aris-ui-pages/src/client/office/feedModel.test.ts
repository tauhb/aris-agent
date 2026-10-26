import { describe, expect, it } from 'vitest'
import {
  excerpt,
  externalResult,
  hasResult,
  isUnread,
  markSeen,
  pillOf,
  rowKey,
  unreadCount,
} from './feedModel.js'
import type { FeedItem } from './model.js'

const item = (extra: Partial<FeedItem>): FeedItem => ({
  at: 100,
  bot: 'minh',
  kind: 'done',
  tone: 'ok',
  what: 'So sánh 3 đối thủ',
  session: 's1',
  ...extra,
})

describe('kết quả chưa nhận', () => {
  it('chỉ dòng Xong có phiên mới có kết quả để nhận', () => {
    expect(hasResult(item({}))).toBe(true)
    expect(hasResult(item({ session: undefined }))).toBe(false)
    expect(hasResult(item({ kind: 'failed' }))).toBe(false)
    expect(hasResult(item({ kind: 'routine' }))).toBe(false)
  })

  it('đếm dòng Xong chưa nhận trong các dòng đang hiện', () => {
    const feed = [
      item({ session: 's1', at: 100 }),
      item({ session: 's2', at: 90 }),
      item({ session: 's3', at: 80, kind: 'failed' }),
      item({ session: undefined, at: 70 }),
      item({ kind: 'running', session: 's9' }),
    ]
    expect(unreadCount(feed, {})).toBe(2)
    expect(unreadCount(feed, { s1: 100 })).toBe(1)
    expect(unreadCount(feed, { s1: 100, s2: 90 })).toBe(0)
    expect(unreadCount([], {})).toBe(0)
  })

  it('đánh dấu đã nhận theo mã phiên; phiên xong thêm lần nữa thì lại là mới', () => {
    const first = item({ at: 100 })
    const seen = markSeen({}, first)
    expect(seen).toEqual({ s1: 100 })
    expect(isUnread(first, seen)).toBe(false)
    expect(isUnread(item({ at: 200 }), seen)).toBe(true)
    // Đánh dấu dòng cũ hơn không lùi mốc đã nhận.
    expect(markSeen(seen, item({ at: 50 }))).toEqual({ s1: 100 })
    // Dòng không có kết quả thì không ghi gì.
    expect(markSeen(seen, item({ kind: 'failed' }))).toBe(seen)
  })

  it('chỉ giữ 500 phiên nhận gần nhất', () => {
    let seen = {}
    for (let i = 0; i < 520; i++) seen = markSeen(seen, item({ session: `s${i}`, at: i + 1 }))
    expect(Object.keys(seen)).toHaveLength(500)
    expect('s519' in seen).toBe(true)
    expect('s0' in seen).toBe(false)
  })
})

describe('pill trạng thái', () => {
  it('đang làm, xong, chờ, lỗi theo loại dòng', () => {
    expect(pillOf(item({ kind: 'running' }))).toEqual({ tone: 'run', key: 'of.fd.st.running' })
    expect(pillOf(item({ kind: 'done' }))).toEqual({ tone: 'ok', key: 'of.feed.k.done' })
    expect(pillOf(item({ kind: 'asked' }))).toEqual({ tone: 'warn', key: 'of.fd.st.waiting' })
    expect(pillOf(item({ kind: 'failed' })).tone).toBe('err')
    expect(pillOf(item({ kind: 'blocked' })).tone).toBe('err')
    expect(pillOf(item({ kind: 'routine' })).tone).toBe('ok')
    expect(pillOf(item({ kind: 'assigned' }))).toEqual({ tone: 'dim', key: 'of.feed.k.assigned' })
  })

  it('lần hỏi cũ (bot hết đợi) chỉ còn là nhãn mờ; yêu cầu quyền còn treo luôn là chờ', () => {
    expect(pillOf(item({ kind: 'asked' }), false)).toEqual({ tone: 'dim', key: 'of.feed.k.asked' })
    expect(pillOf(item({ kind: 'asked' }), true)).toEqual({ tone: 'warn', key: 'of.fd.st.waiting' })
    expect(pillOf(item({ kind: 'asked', approval: 'ap-1' }), false).tone).toBe('warn')
  })

  it('mã dòng khác nhau khi mã phiên hay mã duyệt khác', () => {
    const keys = new Set([
      rowKey(item({})),
      rowKey(item({ session: 's2' })),
      rowKey(item({ approval: 'ap-1' })),
    ])
    expect(keys.size).toBe(3)
  })
})

describe('excerpt', () => {
  it('chữ ngắn giữ nguyên, chữ dài cắt ở khoảng trắng và thêm cờ cut', () => {
    expect(excerpt('  Ngắn thôi  ')).toEqual({ text: 'Ngắn thôi', cut: false })
    const long = 'từ '.repeat(200)
    const r = excerpt(long, 280)
    expect(r.cut).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(280)
    expect(r.text.endsWith('từ')).toBe(true)
  })

  it('bỏ dấu đậm hay mã dở dang ở cuối đoạn cắt', () => {
    const bold = `${'a '.repeat(130)}**đậm dở dang rồi còn dài thêm nữa nhiều chữ lắm`
    const r = excerpt(bold, 280)
    expect(r.cut).toBe(true)
    expect((r.text.match(/\*\*/g) ?? []).length % 2).toBe(0)
    const code = `${'b '.repeat(130)}\`mã dở dang rồi còn dài thêm nữa nhiều chữ lắm lắm`
    expect((excerpt(code, 280).text.match(/`/g) ?? []).length % 2).toBe(0)
  })

  it('không cắt đôi cặp thay thế (biểu tượng cảm xúc)', () => {
    const r = excerpt(`${'x'.repeat(279)}😀 hết`, 280)
    expect(r.text).toBe('x'.repeat(279))
  })
})

describe('externalResult', () => {
  it('lấy lời báo cuối và các tệp write, edit không trùng', () => {
    const r = externalResult({
      output: ' Đã sửa xong. ',
      steps: [
        { kind: 'read', target: '/w/a.ts' },
        { kind: 'edit', target: '/w/src/a.ts' },
        { kind: 'write', target: '/w/src/b.ts' },
        { kind: 'edit', target: '/w/src/a.ts' },
        { kind: 'run' },
      ],
    })
    expect(r.text).toBe('Đã sửa xong.')
    expect(r.files).toEqual([
      { path: '/w/src/a.ts', name: 'a.ts' },
      { path: '/w/src/b.ts', name: 'b.ts' },
    ])
  })

  it('không có lời báo thì lấy chẩn đoán, không có gì thì trống', () => {
    expect(externalResult({ diagnostic: 'hết giờ' }).text).toBe('hết giờ')
    expect(externalResult({})).toEqual({ text: '', files: [] })
  })
})
