import { describe, expect, it } from 'vitest'
import { mergeFeed, type FeedInput } from './feed.js'

const empty: FeedInput = { activity: [], events: [], blocked: [], routines: [] }

describe('mergeFeed', () => {
  it('gộp bốn nguồn, mới trước, đúng màu', () => {
    const feed = mergeFeed({
      activity: [
        { bot: 'lam', kind: 'done', task: 'So 3 đối thủ', at: 100 },
        { bot: 'ha', kind: 'failed', task: 'Viết bài', at: 90 },
      ],
      events: [
        { at: 120, bot: 'mai', type: 'hoi', what: 'Giọng văn nào?' },
        { at: 110, bot: 'mai', type: 'duyet', what: 'gửi email', decision: 'allowed-once' },
        { at: 95, bot: 'mai', type: 'duyet', what: 'xoá tệp', decision: 'rejected' },
      ],
      blocked: [{ at: 105, bot: 'lam', tool: 'bash', what: 'curl x' }],
      routines: [
        { at: 130, bot: 'tin', title: 'Báo cáo tuần', status: 'done' },
        { at: 80, bot: 'tin', title: 'Sao lưu', status: 'cap' },
      ],
    })
    expect(feed.map((f) => `${f.kind}:${f.tone}`)).toEqual([
      'routine:ok',
      'asked:warn',
      'approved:ok',
      'blocked:bad',
      'done:ok',
      'rejected:bad',
      'failed:bad',
      'routineFailed:bad',
    ])
    expect(feed.find((f) => f.kind === 'blocked')?.what).toBe('bash · curl x')
  })

  it('bỏ dòng chờ, bỏ "bắt đầu" trùng dòng nhận việc, bỏ duyệt bị huỷ', () => {
    const feed = mergeFeed({
      ...empty,
      activity: [
        { bot: 'lam', kind: 'started', task: 'A', at: 1010 },
        { bot: 'lam', kind: 'assigned', task: 'A', at: 1000 },
        { bot: 'lam', kind: 'waiting', task: 'A', at: 1020 },
        { bot: 'ha', kind: 'started', task: 'B', at: 1030 },
      ],
      events: [{ at: 1040, bot: 'lam', type: 'duyet', what: 'x', decision: 'cancelled' }],
    })
    expect(feed.map((f) => `${f.bot}:${f.kind}`)).toEqual(['ha:started', 'lam:assigned'])
  })

  it('cắt theo giới hạn', () => {
    const activity = Array.from({ length: 10 }, (_, i) => ({
      bot: 'lam',
      kind: 'done',
      task: `V${i}`,
      at: i,
    }))
    const feed = mergeFeed({ ...empty, activity }, 3)
    expect(feed.map((f) => f.what)).toEqual(['V9', 'V8', 'V7'])
  })
})
