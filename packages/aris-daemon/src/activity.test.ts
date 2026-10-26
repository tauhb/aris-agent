import { describe, expect, it } from 'vitest'
import { askTitle, trackAsk, type ActivitySink } from './activity.js'

function sink(bot = 'aris') {
  const calls: { bot: string; task: string; session: string | undefined }[] = []
  const s: ActivitySink = {
    botOf: () => ({ id: bot }),
    live: { assigned: (b, task, session) => void calls.push({ bot: b, task, session }) },
  }
  return { s, calls }
}

describe('askTitle', () => {
  it('lấy dòng đầu có chữ, gom khoảng trắng', () => {
    expect(askTitle('\n\n  Tóm tắt   email\thôm nay \nchi tiết dưới')).toBe('Tóm tắt email hôm nay')
  })
  it('cắt ở 80 ký tự và thêm dấu …', () => {
    const t = askTitle('a'.repeat(200))
    expect([...t]).toHaveLength(80)
    expect(t.endsWith('…')).toBe(true)
    expect(askTitle('b'.repeat(80))).toBe('b'.repeat(80))
  })
  it('câu trống thì rỗng', () => {
    expect(askTitle('  \n ')).toBe('')
  })
})

describe('trackAsk', () => {
  it('ghi "nhận việc" cho bot của phiên và gắn việc với phiên', () => {
    const { s, calls } = sink('aris')
    trackAsk(s, 'sess-1', 'Làm báo cáo tuần\nthêm chi tiết')
    expect(calls).toEqual([{ bot: 'aris', task: 'Làm báo cáo tuần', session: 'sess-1' }])
  })
  it('không có dịch vụ bot thì bỏ qua', () => {
    expect(() => trackAsk(undefined, 's', 'việc')).not.toThrow()
  })
  it('câu trống thì không ghi', () => {
    const { s, calls } = sink()
    trackAsk(s, 's', '   ')
    expect(calls).toHaveLength(0)
  })
  it('lỗi khi ghi không làm hỏng việc giao', () => {
    const bad: ActivitySink = {
      botOf: () => {
        throw new Error('không có bot')
      },
      live: { assigned: () => {} },
    }
    expect(() => trackAsk(bad, 's', 'việc')).not.toThrow()
  })
})
