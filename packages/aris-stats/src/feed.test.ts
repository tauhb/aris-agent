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

  it('mang mã phiên của việc và của sự kiện duyệt, hỏi', () => {
    const feed = mergeFeed({
      ...empty,
      activity: [
        { bot: 'lam', kind: 'assigned', task: 'A', session: 's1', at: 10 },
        { bot: 'lam', kind: 'done', task: 'A', session: 's1', at: 20 },
        { bot: 'ha', kind: 'failed', task: 'B', at: 30 },
      ],
      events: [
        { at: 40, bot: 'mai', session: 's9', type: 'hoi', what: 'Giọng nào?' },
        { at: 50, bot: 'mai', session: 's9', type: 'duyet', what: 'gửi email', decision: 'allowed-once' },
      ],
    })
    expect(feed.map((f) => `${f.kind}:${f.session ?? '-'}`)).toEqual([
      'approved:s9',
      'asked:s9',
      'failed:-',
      'done:s1',
      'assigned:s1',
    ])
  })

  it('mỗi phiên đang chạy một dòng "Đang làm", thay dòng nhận việc và bắt đầu của chính phiên đó', () => {
    const feed = mergeFeed({
      ...empty,
      activity: [
        { bot: 'tho', kind: 'started', task: 'Viết bài', session: 's2', at: 95 },
        { bot: 'tho', kind: 'assigned', task: 'Viết bài', session: 's2', at: 90 },
        { bot: 'lam', kind: 'done', task: 'So sánh', session: 's1', at: 80 },
      ],
      running: [
        { session: 's2', bot: 'tho', title: 'Viết bài Facebook', at: 91 },
        { session: 's3', bot: 'khoa', title: '', at: 60 },
      ],
    })
    expect(feed.map((f) => `${f.kind}:${f.bot}:${f.session}:${f.what}`)).toEqual([
      'running:tho:s2:Viết bài Facebook',
      'done:lam:s1:So sánh',
      'running:khoa:s3:',
    ])
    expect(feed[0]).toMatchObject({ tone: 'ok' })
  })

  it('yêu cầu quyền còn treo thành dòng chờ có mã, luôn hiện dù vượt giới hạn', () => {
    const activity = Array.from({ length: 5 }, (_, i) => ({
      bot: 'lam',
      kind: 'done',
      task: `V${i}`,
      at: 100 + i,
    }))
    const feed = mergeFeed(
      {
        ...empty,
        activity,
        pending: [{ id: 'ap-1', bot: 'an', session: 'member:s7', what: 'gửi email', at: 1 }],
        running: [{ session: 's8', bot: 'khoa', title: 'Chạy test', at: 2 }],
      },
      2,
    )
    expect(feed.map((f) => `${f.kind}:${f.what}`)).toEqual([
      'done:V4',
      'done:V3',
      'running:Chạy test',
      'asked:gửi email',
    ])
    const waiting = feed.find((f) => f.approval)
    expect(waiting).toMatchObject({ approval: 'ap-1', session: 'member:s7', tone: 'warn', bot: 'an' })
    // Dòng hỏi thường (ask_user_question) không có mã duyệt.
    expect(feed.find((f) => f.kind === 'done')?.approval).toBeUndefined()
  })
})
