import { describe, expect, it } from 'vitest'
import { LiveTracker, RECENT_MS } from './live.js'

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
})
