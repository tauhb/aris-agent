import { describe, expect, it } from 'vitest'
import {
  botReportDefinition,
  botSource,
  findMention,
  inlineParts,
  mdBlocks,
  reportParts,
  splitMentions,
  turnHeadDefinition,
} from './who-data.js'

const team = new Set(['kiet', 'lan'])

describe('tên thành viên', () => {
  it('chỉ nhận @tên của bot trong đội, không nhận email', () => {
    expect(findMention('gửi a@kiet.vn rồi @kiet làm', 0, team)).toEqual({
      start: 18,
      end: 23,
      handle: 'kiet',
    })
    expect(findMention('@ai đó', 0, team)).toBeUndefined()
    expect(findMention('(@Lan)', 0, team)).toEqual({ start: 1, end: 5, handle: 'lan' })
  })

  it('tách chữ thành đoạn thường và tên', () => {
    expect(splitMentions('Giao @kiet và @lan.', team)).toEqual([
      { kind: 'text', text: 'Giao ' },
      { kind: 'mention', handle: 'kiet', text: '@kiet' },
      { kind: 'text', text: ' và ' },
      { kind: 'mention', handle: 'lan', text: '@lan' },
      { kind: 'text', text: '.' },
    ])
  })
})

describe('lời báo của bot', () => {
  it('bỏ nhãn việc, tách tình trạng và kết quả', () => {
    const text =
      '[Bot ngoài · việc 5ad9] Kiệt (bot ngoài Claude Code) xong việc «Đọc README» sau 1 phút.\nThay đổi nằm trong worktree /x.\n\nKết quả của Kiệt:\nĐã đọc.'
    expect(reportParts(text)).toEqual({
      status:
        'Kiệt (bot ngoài Claude Code) xong việc «Đọc README» sau 1 phút.\nThay đổi nằm trong worktree /x.',
      body: 'Đã đọc.',
    })
  })

  it('báo cáo việc lớn bỏ lời dặn Aris', () => {
    const text =
      'Phòng Kỹ thuật nộp kết quả việc lớn j1 «Ra mắt»:\n\nXong 2/2.\n\nTổng hợp cho người dùng: điều quan trọng nhất.'
    expect(reportParts(text)).toEqual({
      status: 'Phòng Kỹ thuật nộp kết quả việc lớn j1 «Ra mắt»',
      body: 'Xong 2/2.',
    })
  })

  it('chữ đậm và mã', () => {
    expect(inlineParts('**21 gói** trong `packages/`')).toEqual([
      { kind: 'bold', text: '21 gói' },
      { kind: 'text', text: ' trong ' },
      { kind: 'code', text: 'packages/' },
    ])
  })

  it('chỉ nhận tin nguồn aris-bot', () => {
    expect(botSource({ kind: 'aris-bot', bot: 'b-1', name: 'Kiệt' })?.name).toBe('Kiệt')
    expect(botSource({ kind: 'user' })).toBeUndefined()
    const ev = (kind: string) => ({
      type: 'user/message',
      seq: 34,
      data: { id: 'm1', source: { kind, bot: 'b-1' } },
    })
    expect(botReportDefinition.match(ev('aris-bot'))).toEqual({ id: 'm1', role: 'start' })
    expect(botReportDefinition.match(ev('user'))).toBeNull()
  })
})

describe('đầu tin của lượt', () => {
  it('neo trước sự kiện trả lời sớm nhất của lượt', () => {
    const d = turnHeadDefinition
    expect(d.match({ type: 'turn/start', seq: 4, data: { turn: 1 } })).toEqual({
      id: 'turn-1',
      role: 'start',
    })
    expect(d.match({ type: 'user/message', seq: 8, data: {} })).toBeNull()
    let state = d.start(undefined, { event: { type: 'turn/start', seq: 4, data: { turn: 1 } } })
    expect(d.buildViewNode({ key: 'k', id: 'turn-1', state })).toBeNull()
    for (const [type, seq] of [
      ['assistant/message', 19],
      ['tool/call', 20],
      ['assistant/live-chunk', 15],
    ] as const) {
      expect(d.match({ type, seq, data: { turn: 1 } })).toEqual({ id: 'turn-1', role: 'update' })
      state = d.update({ state }, { event: { type, seq, time: seq, data: { turn: 1 } } })
    }
    expect(d.buildViewNode({ key: 'k', id: 'turn-1', state })).toMatchObject({
      anchorSeq: 14.5,
      data: { time: 15 },
    })
  })
})

describe('khối Markdown', () => {
  it('đoạn, tiêu đề, danh sách, mã', () => {
    expect(mdBlocks('# Bài\n\nMở bài\ndòng 2\n\n- ý 1\n- ý 2\n1. a\n```\nx\n```')).toEqual([
      { kind: 'h', text: 'Bài' },
      { kind: 'p', text: 'Mở bài\ndòng 2' },
      { kind: 'ul', items: ['ý 1', 'ý 2'] },
      { kind: 'ol', items: ['a'] },
      { kind: 'code', text: 'x' },
    ])
  })
})

describe('tên bot viết thẳng (giao diện GĐ9)', () => {
  it('nhận tên đứng riêng, không nhận khi dính chữ khác; @tên vẫn như cũ', async () => {
    const { splitRefs } = await import('./who-data.js')
    const names = new Map([
      ['Mai', 'mai'],
      ['Lâm', 'lam'],
    ])
    const parts = splitRefs('Mai và @lam nhờ Lâm, còn Maika thì không', new Set(['mai', 'lam']), names)
    expect(parts.filter((p) => p.kind === 'mention').map((p) => [p.handle, p.text])).toEqual([
      ['mai', 'Mai'],
      ['lam', '@lam'],
      ['lam', 'Lâm'],
    ])
  })
})
