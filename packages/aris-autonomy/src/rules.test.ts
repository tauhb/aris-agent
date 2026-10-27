import { describe, expect, it } from 'vitest'
import {
  MARKER_RE,
  MAX_WAITS,
  MAX_WAIT_TOTAL_SECONDS,
  WAIT_MARKER_RE,
  contractText,
  judgePrompt,
  parseContract,
  parseSubgoal,
  heartbeatPrompt,
  humanInterval,
  isStuck,
  loopPrompt,
  nextAuto,
  parseHeartbeat,
  parseInterval,
  parseLoop,
  parseVerdict,
  similar,
  unchanged,
  waitMarkerOf,
  waitPlan,
  waitPrompt,
  type Verdict,
} from './rules.js'

describe('giám khảo /goal', () => {
  it('đọc JSON có chữ thừa quanh, bỏ kết quả lạ', () => {
    expect(
      parseVerdict('Kết quả:\n{"verdict":"continue","reason":"còn thiếu","missing":"bảng so sánh"}'),
    ).toEqual({
      verdict: 'continue',
      reason: 'còn thiếu',
      missing: 'bảng so sánh',
    })
    expect(parseVerdict('{"verdict":"done","reason":"đủ","missing":""}')).toEqual({
      verdict: 'done',
      reason: 'đủ',
    })
    expect(parseVerdict('{"verdict":"maybe"}')).toBeUndefined()
    expect(parseVerdict('không có JSON')).toBeUndefined()
  })

  it('ba lượt liền nêu cùng điều còn thiếu thì coi là kẹt', () => {
    const c = (missing: string): Verdict => ({ verdict: 'continue', reason: '', missing })
    expect(
      similar('Chưa có bảng so sánh giá ba nhà cung cấp', 'chưa có bảng so sánh giá của ba nhà cung cấp'),
    ).toBe(true)
    expect(similar('Chưa có bảng so sánh giá', 'Chưa chạy test')).toBe(false)
    expect(isStuck([c('Chưa chạy test đơn vị'), c('chưa chạy test đơn vị')])).toBe(false)
    expect(
      isStuck([c('Chưa chạy test đơn vị'), c('chưa chạy test đơn vị'), c('Chưa chạy test đơn vị.')]),
    ).toBe(true)
    expect(isStuck([c('Chưa chạy test đơn vị'), c('Thiếu tài liệu'), c('Chưa chạy test đơn vị')])).toBe(false)
    expect(isStuck([c('a b c'), c('a b c'), { verdict: 'done', reason: '' }])).toBe(false)
  })
})

describe('hợp đồng hoàn thành và /subgoal', () => {
  it('đọc hợp đồng: thiếu "xong khi" hay "chứng minh bằng" thì bỏ, trường rỗng thì lược', () => {
    expect(
      parseContract(
        '```json\n{"done":"Có tệp báo cáo","proof":"ls thấy bao-cao.md","keep":"","scope":"thư mục docs","stop":""}\n```',
      ),
    ).toEqual({ done: 'Có tệp báo cáo', proof: 'ls thấy bao-cao.md', scope: 'thư mục docs' })
    expect(parseContract('{"done":"x","proof":""}')).toBeUndefined()
    expect(parseContract('{"done":"xong khi: có tệp","proof":"Chứng minh bằng: cat tệp"}')).toEqual({
      done: 'có tệp',
      proof: 'cat tệp',
    })
    expect(parseContract('không có')).toBeUndefined()
  })

  it('giám khảo thấy hợp đồng và tiêu chí thêm; không có thì giữ lời chấm cũ', () => {
    const c = { done: 'Có tệp báo cáo', proof: 'ls thấy bao-cao.md' }
    expect(contractText(c, ['có bảng so sánh'])).toBe(
      '- Xong khi: Có tệp báo cáo\n- Chứng minh bằng: ls thấy bao-cao.md\n- Tiêu chí thêm 1: có bảng so sánh',
    )
    const base = { objective: 'Viết báo cáo', round: 1, max: 20, answer: 'Xong', tools: [] }
    const p = judgePrompt({ ...base, contract: c, subgoals: ['có bảng so sánh'] })
    expect(p).toContain('Hợp đồng hoàn thành:')
    expect(p).toContain('Tiêu chí thêm 1: có bảng so sánh')
    expect(p).toContain('không kèm bằng chứng')
    expect(judgePrompt(base)).not.toContain('Hợp đồng')
  })

  it('đọc /subgoal', () => {
    expect(parseSubgoal('  ')).toEqual({ kind: 'show' })
    expect(parseSubgoal(' có bảng so sánh ')).toEqual({ kind: 'add', text: 'có bảng so sánh' })
  })
})

describe('/loop và /heartbeat', () => {
  it('đọc nhịp', () => {
    expect(parseInterval('5m')).toBe(300)
    expect(parseInterval('1h30m')).toBe(5400)
    expect(parseInterval('90s')).toBe(90)
    expect(parseInterval('kiểm')).toBeUndefined()
    expect(parseInterval('')).toBeUndefined()
    expect(humanInterval(300)).toBe('5 phút')
    expect(humanInterval(3600)).toBe('1 giờ')
    expect(humanInterval(90)).toBe('90 giây')
  })

  it('đọc lệnh /loop', () => {
    expect(parseLoop('')).toEqual({ kind: 'list' })
    expect(parseLoop('dừng')).toEqual({ kind: 'stop' })
    expect(parseLoop('Stop')).toEqual({ kind: 'stop' })
    expect(parseLoop('5m kiểm tra bản deploy')).toEqual({
      kind: 'start',
      seconds: 300,
      task: 'kiểm tra bản deploy',
    })
    expect(parseLoop('kiểm tra bản deploy')).toEqual({ kind: 'start', task: 'kiểm tra bản deploy' })
    expect(parseLoop('30s kiểm tra').kind).toBe('error')
    expect(parseLoop('5m').kind).toBe('error')
  })

  it('đọc lệnh /heartbeat', () => {
    expect(parseHeartbeat('')).toEqual({ kind: 'start', seconds: 1800 })
    expect(parseHeartbeat('tắt')).toEqual({ kind: 'stop' })
    expect(parseHeartbeat('1h hộp thư khách')).toEqual({
      kind: 'start',
      seconds: 3600,
      focus: 'hộp thư khách',
    })
    expect(parseHeartbeat('đơn hàng mới')).toEqual({ kind: 'start', seconds: 1800, focus: 'đơn hàng mới' })
    expect(parseHeartbeat('10s').kind).toBe('error')
  })

  it('lời nhắc mang dấu nhận ra được', () => {
    expect(MARKER_RE.exec(loopPrompt('l-abc-12', 'xem log', 300, false))?.[1]).toBe('l-abc-12')
    expect(MARKER_RE.exec(heartbeatPrompt('l-x', 1800, 'đơn mới'))?.[1]).toBe('l-x')
    expect(heartbeatPrompt('l-x', 1800)).not.toContain('nhất là')
  })

  it('tự điều nhịp: không đổi thì giãn gấp đôi tới 15 phút, đổi thì về 1 phút', () => {
    expect(unchanged('Không đổi.', 'gì đó')).toBe(true)
    expect(unchanged('ổn', undefined)).toBe(true)
    expect(unchanged('Bản deploy  vẫn chạy', 'bản deploy vẫn chạy.')).toBe(true)
    expect(unchanged('Bản deploy lỗi', 'Bản deploy vẫn chạy')).toBe(false)
    expect(nextAuto(60, true)).toBe(120)
    expect(nextAuto(600, true)).toBe(900)
    expect(nextAuto(900, true)).toBe(900)
    expect(nextAuto(480, false)).toBe(60)
  })
})

describe('phán quyết chờ (wait)', () => {
  const wait = (extra: string) => parseVerdict(`{"verdict":"wait","reason":"CI đang chạy"${extra}}`)

  it('đọc wait kèm điều đang đợi và số giây', () => {
    expect(wait(',"waiting_for":"CI của PR 12","wait_seconds":300')).toEqual({
      verdict: 'wait',
      reason: 'CI đang chạy',
      waitingFor: 'CI của PR 12',
      waitSeconds: 300,
    })
  })

  it('kẹp số giây về 60–3600, thiếu hay sai thì lấy 120', () => {
    expect(wait(',"waiting_for":"x","wait_seconds":5')?.waitSeconds).toBe(60)
    expect(wait(',"waiting_for":"x","wait_seconds":99999')?.waitSeconds).toBe(3600)
    expect(wait(',"waiting_for":"x","wait_seconds":"lâu"')?.waitSeconds).toBe(120)
    expect(wait(',"waiting_for":"x"')?.waitSeconds).toBe(120)
  })

  it('thiếu waiting_for thì coi như continue', () => {
    expect(wait(',"wait_seconds":300')?.verdict).toBe('continue')
    expect(wait(',"waiting_for":"  ","wait_seconds":300')?.verdict).toBe('continue')
  })

  it('lời của giám khảo nêu cả wait', () => {
    const p = judgePrompt({ objective: 'x', round: 1, max: 5, answer: 'a', tools: [] })
    expect(p).toContain('"wait"')
    expect(p).toContain('MỌI phần trợ lý tự làm được đã xong')
  })

  it('waitPlan cộng dồn, chặn khi quá 8 lần hay quá 2 giờ', () => {
    let tally: { count: number; seconds: number } | undefined
    for (let i = 0; i < MAX_WAITS; i++) {
      const r = waitPlan(tally, 60, 'CI')
      expect(r.ok).toBe(true)
      if (r.ok) tally = r.tally
    }
    expect(tally).toEqual({ count: MAX_WAITS, seconds: MAX_WAITS * 60 })
    expect(waitPlan(tally, 60, 'CI')).toEqual({ ok: false, message: 'Chờ quá lâu: CI' })
    expect(waitPlan({ count: 2, seconds: MAX_WAIT_TOTAL_SECONDS - 100 }, 3600, 'bản build')).toEqual({
      ok: false,
      message: 'Chờ quá lâu: bản build',
    })
    expect(waitPlan({ count: 1, seconds: 3600 }, 3600, 'x').ok).toBe(true)
  })

  it('isStuck bỏ qua lượt chờ', () => {
    const c = (missing: string): Verdict => ({ verdict: 'continue', reason: '', missing })
    const w: Verdict = { verdict: 'wait', reason: '', waitingFor: 'CI', waitSeconds: 60 }
    expect(isStuck([c('thiếu test chạy'), w, w, c('thiếu test chạy')])).toBe(false)
    expect(isStuck([c('thiếu test chạy'), w, c('thiếu test chạy'), w, c('Thiếu test chạy')])).toBe(true)
    expect(isStuck([w, w, w])).toBe(false)
  })

  it('dấu chờ gắn đúng mã mục tiêu và đọc lại được', () => {
    const text = waitPrompt('goal-ab12_3', 'CI của PR 12')
    expect(text).toContain(waitMarkerOf('goal-ab12_3'))
    expect(WAIT_MARKER_RE.exec(text)?.[1]).toBe('goal-ab12_3')
    expect(text).toContain('Kiểm tra lại: CI của PR 12')
    expect(MARKER_RE.test(text)).toBe(false)
  })
})
