import { describe, expect, it } from 'vitest'
import { LiveTracker, RECENT_MS, type ActivityItem } from './live.js'

describe('trạng thái trực tiếp', () => {
  it('đang làm → chờ anh → xong → rảnh sau một lúc; việc gần đây theo thứ tự mới trước', () => {
    let now = 1000
    const bots: Record<string, string> = { s1: 'minh', s2: 'minh', s3: 'tho' }
    const live = new LiveTracker(
      (s) => bots[s] ?? 'aris',
      () => now,
    )
    expect(live.of('minh').status).toBe('idle')
    live.assigned('minh', 'Tóm tắt 3 đối thủ', 's1')
    live.turnStart('s1')
    live.turnStart('s2')
    expect(live.of('minh')).toMatchObject({ status: 'working', task: 'Tóm tắt 3 đối thủ', running: 2 })
    live.waitStart('s1')
    expect(live.of('minh').status).toBe('waiting')
    live.waitEnd('s1')
    live.turnEnd('s2', 'completed')
    expect(live.of('minh').status).toBe('working')
    now += 5
    live.turnEnd('s1', 'completed')
    expect(live.of('minh')).toMatchObject({ status: 'done', task: 'Tóm tắt 3 đối thủ' })
    live.turnStart('s3')
    live.turnEnd('s3', 'error')
    expect(live.of('tho').status).toBe('failed')
    expect(live.busyBots()).toBe(0)
    now += RECENT_MS + 1
    expect(live.of('minh').status).toBe('idle')
    expect(live.activity.map((a) => `${a.bot}:${a.kind}`)).toEqual([
      'minh:done',
      'minh:waiting',
      'minh:started',
      'minh:assigned',
    ])
  })

  it('phiên giao qua /ask: có việc gắn với phiên thì lên feed nhận việc, bắt đầu, xong (hoặc vấp)', () => {
    let now = 10
    const live = new LiveTracker(
      () => 'aris',
      () => now++,
    )
    // Trước khi ghi việc, lượt chạy không để lại dấu vết (lỗi cũ: cột "Vừa làm gì" trống).
    live.turnStart('quiet')
    live.turnEnd('quiet', 'completed')
    expect(live.activity).toHaveLength(0)
    live.assigned('aris', 'Làm báo cáo tuần', 'ask-1')
    live.turnStart('ask-1')
    live.turnEnd('ask-1', 'completed')
    live.assigned('aris', 'Việc hỏng', 'ask-2')
    live.turnStart('ask-2')
    live.turnEnd('ask-2', 'error')
    expect(live.activity.map((a) => `${a.kind}:${a.task}`)).toEqual([
      'failed:Việc hỏng',
      'started:Việc hỏng',
      'assigned:Việc hỏng',
      'done:Làm báo cáo tuần',
      'started:Làm báo cáo tuần',
      'assigned:Làm báo cáo tuần',
    ])
  })

  it('bot đã chạy trước lúc được ghi việc vẫn có mục bắt đầu', () => {
    const live = new LiveTracker(
      () => 'minh',
      () => 5,
    )
    live.turnStart('s1')
    live.assigned('minh', 'Việc A', 's1')
    expect(live.activity.map((a) => a.kind)).toEqual(['started', 'assigned'])
    expect(live.of('minh').task).toBe('Việc A')
  })

  it('việc gần đây lưu bền và nạp lại: kết quả gần nhất còn hiện sau khởi động lại', () => {
    const saved: ActivityItem[] = []
    let t = 10
    const a = new LiveTracker(
      () => 'minh',
      () => t++,
      (i) => saved.push(i),
    )
    a.assigned('minh', 'Việc A', 's1')
    a.turnStart('s1')
    a.turnEnd('s1', 'completed')
    const b = new LiveTracker(
      () => 'minh',
      () => 20,
    )
    b.restore(saved)
    expect(b.activity.map((x) => x.kind)).toEqual(['done', 'started', 'assigned'])
    expect(b.of('minh')).toMatchObject({ status: 'done', task: 'Việc A' })
  })
})

describe('trạng thái theo phiên', () => {
  it('đang chạy, đang chờ duyệt, rảnh', () => {
    const live = new LiveTracker(
      () => 'minh',
      () => 1,
    )
    expect(live.sessionState('s1')).toBe('idle')
    live.turnStart('s1')
    expect(live.sessionState('s1')).toBe('running')
    expect(live.sessionState('s2')).toBe('idle')
    live.waitStart('s1')
    expect(live.sessionState('s1')).toBe('waiting')
    live.waitEnd('s1')
    live.turnEnd('s1', 'completed')
    expect(live.sessionState('s1')).toBe('idle')
  })
})

describe('mã phiên của bot', () => {
  it('phiên đang chạy đứng trước phiên đang đợi, không lặp, và hết khi xong', () => {
    const bots: Record<string, string> = { s1: 'minh', s2: 'minh', s3: 'tho' }
    const live = new LiveTracker(
      (s) => bots[s] ?? 'aris',
      () => 1,
    )
    expect(live.of('minh').sessions).toEqual([])
    live.turnStart('s1')
    live.turnStart('s3')
    live.waitStart('s2')
    live.waitStart('s1')
    expect(live.of('minh').sessions).toEqual(['s1', 's2'])
    expect(live.of('tho').sessions).toEqual(['s3'])
    live.waitEnd('s1')
    live.waitEnd('s2')
    live.turnEnd('s1', 'completed')
    expect(live.of('minh').sessions).toEqual([])
  })
})
