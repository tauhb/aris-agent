import { describe, expect, it } from 'vitest'
import {
  branchState,
  fmtDuration,
  jobState,
  matchJob,
  departmentArgs,
  departmentItem,
  type JobLike,
  pendingEcho,
  progressMs,
  progressText,
  stepLabel,
  teamProgress,
  toTurns,
  type ConvStep,
} from './chatModel.js'

const T0 = Date.UTC(2026, 9, 26, 3, 50, 0)
const step = (n: number, type: string, extra: Partial<ConvStep> = {}): ConvStep => ({
  n,
  at: T0 + n * 20_000,
  type,
  title: `bước ${n}`,
  body: `nội dung ${n}`,
  bodyFull: true,
  ...extra,
})

/** Bản dịch giả: ghép khoá với tham số cho dễ so. */
const t = (key: string, p: Record<string, unknown> = {}) =>
  `${key}${Object.keys(p).length ? `(${Object.values(p).join(',')})` : ''}`

describe('toTurns', () => {
  it('tin người dùng, tin trợ lý đứng riêng; bước giữa hai tin gộp thành một dòng tiến độ', () => {
    const turns = toTurns(
      [
        step(1, 'user'),
        step(2, 'assistant'),
        step(3, 'user'),
        step(4, 'tool', { tool: 'read' }),
        step(5, 'thinking'),
        step(6, 'tool', { tool: 'write' }),
        step(7, 'assistant'),
      ],
      false,
    )
    expect(turns.map((x) => x.kind)).toEqual(['user', 'assistant', 'user', 'progress', 'assistant'])
    const progress = turns[3]!
    expect(progress.kind === 'progress' && progress.steps.map((s) => s.n)).toEqual([4, 5, 6])
    expect(progress.kind === 'progress' && progress.live).toBe(false)
  })

  it('phiên đang chạy: dòng tiến độ ở cuối là live; có tin trợ lý ở cuối thì không có dòng live', () => {
    const live = toTurns([step(1, 'user'), step(2, 'tool', { tool: 'read' })], true)
    expect(live.at(-1)).toMatchObject({ kind: 'progress', live: true })
    const done = toTurns([step(1, 'user'), step(2, 'tool'), step(3, 'assistant')], true)
    expect(done.some((x) => x.kind === 'progress' && x.live)).toBe(false)
  })

  it('lần giao việc tách thành khối riêng, chia dòng tiến độ làm hai', () => {
    const turns = toTurns(
      [
        step(1, 'user'),
        step(2, 'tool', { tool: 'brain_search' }),
        step(3, 'assistant'),
        step(4, 'tool', { tool: 'assign_task' }),
        step(5, 'tool', { tool: 'wait_agent' }),
        step(6, 'assistant'),
      ],
      false,
    )
    expect(turns.map((x) => x.kind)).toEqual([
      'user',
      'progress',
      'assistant',
      'team',
      'progress',
      'assistant',
    ])
    expect(turns[3]).toMatchObject({ kind: 'team', step: { n: 4 } })
  })

  it('phiên trống thì không có lượt nào', () => {
    expect(toTurns([], true)).toEqual([])
  })
})

describe('pendingEcho', () => {
  const echo = { id: 'e1', text: 'Thêm đoạn so sánh', at: T0 }
  it('tin đã thấy trong phiên thì bỏ khỏi danh sách đang gửi', () => {
    expect(pendingEcho([step(1, 'user', { at: T0 + 500, body: 'Thêm đoạn so sánh ' })], [echo])).toEqual([])
  })
  it('chưa thấy, hoặc tin trùng chữ nhưng cũ từ trước đó thì vẫn đang gửi', () => {
    expect(pendingEcho([], [echo])).toEqual([echo])
    expect(pendingEcho([step(1, 'user', { at: T0 - 600_000, body: echo.text })], [echo])).toEqual([echo])
    expect(pendingEcho([step(1, 'assistant', { at: T0 + 5, body: echo.text })], [echo])).toEqual([echo])
  })
})

describe('thời gian và dòng tiến độ', () => {
  it('fmtDuration: giây, phút, giờ', () => {
    expect(fmtDuration(200, t)).toBe('of.ch.sec(1)')
    expect(fmtDuration(45_000, t)).toBe('of.ch.sec(45)')
    expect(fmtDuration(80_000, t)).toBe('of.ch.min(1,20)')
    expect(fmtDuration(120_000, t)).toBe('of.ch.min0(2)')
    expect(fmtDuration(2 * 3_600_000 + 5 * 60_000, t)).toBe('of.ch.hr(2,5)')
    expect(fmtDuration(3_600_000, t)).toBe('of.ch.hr0(1)')
  })

  const group = (live: boolean) => {
    const g = toTurns(
      [
        step(1, 'tool', { at: T0, ms: 4000 }),
        step(2, 'thinking', { at: T0 + 30_000 }),
        step(3, 'tool', { at: T0 + 60_000, ms: 20_000, title: 'write bai-fb-v2.md' }),
        step(4, 'tool', { at: T0 + 80_000, ms: 0, title: 'Đang viết đoạn kết…' }),
      ],
      live,
    )[0]!
    if (g.kind !== 'progress') throw new Error('cần dòng tiến độ')
    return g
  }

  it('xong rồi: "N bước · thời gian" tính tới lúc bước cuối chạy xong', () => {
    const g = group(false)
    expect(progressMs(g, T0 + 999_999)).toBe(80_000)
    expect(progressText(g, T0 + 999_999, t)).toBe('of.ch.steps(4) · of.ch.min(1,20)')
  })

  it('đang chạy: tiêu đề bước cuối, số bước, thời gian tới bây giờ', () => {
    const g = group(true)
    expect(progressText(g, T0 + 80_000, t)).toBe('Đang viết đoạn kết… · of.ch.steps(4) · of.ch.min(1,20)')
  })

  it('stepLabel gắn nhãn cho suy nghĩ, hỏi, duyệt, chặn; công cụ giữ tiêu đề', () => {
    expect(stepLabel(step(1, 'thinking', { title: 'chọn 2 điểm' }), t)).toBe('of.ch.think(chọn 2 điểm)')
    expect(stepLabel(step(1, 'question', { title: 'Giọng nào?' }), t)).toBe('of.ch.ask(Giọng nào?)')
    expect(stepLabel(step(1, 'approval', { title: 'bash x' }), t)).toBe('of.ch.approval(bash x)')
    expect(stepLabel(step(1, 'blocked', { title: 'bash y' }), t)).toBe('of.ch.blocked(bash y)')
    expect(stepLabel(step(1, 'tool', { title: 'read a.md' }), t)).toBe('read a.md')
  })
})

describe('khối "Đội đang làm"', () => {
  it('giao không được hay bị từ chối là lỗi, kể cả khi có phiên', () => {
    expect(branchState({ error: 'bot bận' }, null, false)).toBe('failed')
    expect(branchState({ rejected: true, sessionId: 's1' }, { session: 'running' }, false)).toBe('failed')
  })

  it('có yêu cầu quyền đang chờ thì chờ {you}, trước cả trạng thái phiên', () => {
    expect(branchState({ sessionId: 's1' }, { session: 'running' }, true)).toBe('waiting')
  })

  it('theo trạng thái của phiên; chưa đọc được thì đang làm', () => {
    const item = { sessionId: 's1' }
    expect(branchState(item, null, false)).toBe('running')
    expect(branchState(item, { session: 'running' }, false)).toBe('running')
    expect(branchState(item, { session: 'waiting' }, false)).toBe('waiting')
    expect(branchState(item, { session: 'done' }, false)).toBe('done')
    expect(branchState(item, { session: 'failed' }, false)).toBe('failed')
    expect(branchState({}, null, false)).toBe('running')
  })

  it('bot ngoài theo trạng thái lần chạy: dừng giữa chừng cũng là lỗi', () => {
    const item = { externalRun: 'run-1' }
    expect(branchState(item, { run: 'running' }, false)).toBe('running')
    expect(branchState(item, { run: 'done' }, false)).toBe('done')
    expect(branchState(item, { run: 'failed' }, false)).toBe('failed')
    expect(branchState(item, { run: 'stopped' }, false)).toBe('failed')
    expect(branchState(item, null, false)).toBe('running')
  })

  it('teamProgress: số nhánh xong trên tổng và phần trăm', () => {
    expect(teamProgress(['done', 'running', 'waiting'])).toEqual({ done: 1, total: 3, pct: 33 })
    expect(teamProgress(['done', 'done'])).toEqual({ done: 2, total: 2, pct: 100 })
    expect(teamProgress([])).toEqual({ done: 0, total: 0, pct: 0 })
  })
})

describe('giao cả phòng (assign_department)', () => {
  const body = JSON.stringify({
    department: 'Tăng trưởng',
    title: 'Chiến dịch ra mắt khoá học',
    task: 'Làm đủ bộ',
    reason: 'Cần nhiều vai',
  })
  const job = (extra: Partial<JobLike>): JobLike => ({
    id: 'job-1',
    department: 'd1',
    departmentName: 'Tăng trưởng',
    lead: 'b-tho',
    title: 'Chiến dịch ra mắt khoá học',
    session: 'lead-s1',
    parentSession: 'aris-s',
    status: 'running',
    createdAt: new Date(T0 + 1000).toISOString(),
    ...extra,
  })

  it('departmentArgs: tên phòng và tên việc; không có title thì lấy dòng đầu task, cắt 80 ký tự', () => {
    expect(departmentArgs(body)).toEqual({ department: 'Tăng trưởng', title: 'Chiến dịch ra mắt khoá học' })
    expect(departmentArgs(JSON.stringify({ department: 'X', task: `Dòng đầu\ndòng hai` }))).toEqual({
      department: 'X',
      title: 'Dòng đầu',
    })
    expect(departmentArgs(JSON.stringify({ department: 'X', task: 'a'.repeat(200) }))?.title).toHaveLength(80)
    expect(departmentArgs('{"department": "dở dang')).toBeNull()
  })

  it('departmentArgs: lời gọi trong log cũ (giao_phong, tham số tiếng Việt) vẫn đọc được', () => {
    const old = JSON.stringify({ phong: 'Tăng trưởng', tieu_de: 'Chiến dịch', noi_dung: 'x', ly_do: 'y' })
    expect(departmentArgs(old)).toEqual({ department: 'Tăng trưởng', title: 'Chiến dịch' })
    expect(departmentArgs(JSON.stringify({ phong: 'X', noi_dung: `Dòng đầu\ndòng hai` }))?.title).toBe(
      'Dòng đầu',
    )
  })

  it('matchJob: cùng phiên giao, cùng tên việc, gần lúc gọi nhất', () => {
    const near = job({ id: 'near' })
    const far = job({ id: 'far', createdAt: new Date(T0 + 3_600_000).toISOString() })
    const step = { at: T0, body }
    expect(matchJob(step, 'aris-s', [far, near])?.id).toBe('near')
    expect(matchJob(step, 'phien-khac', [near])).toBeUndefined()
    expect(matchJob(step, 'aris-s', [job({ title: 'Việc khác' })])).toBeUndefined()
    expect(matchJob(step, undefined, [near])).toBeUndefined()
    expect(matchJob({ at: T0, body: 'hỏng' }, 'aris-s', [near])).toBeUndefined()
  })

  it('jobState: duyệt chờ, xong và lỗi theo bản ghi việc, còn chạy thì theo phiên trưởng nhóm', () => {
    expect(jobState({ status: 'running' }, 'running', true)).toBe('waiting')
    expect(jobState({ status: 'done' }, 'running', false)).toBe('done')
    expect(jobState({ status: 'failed' }, 'done', false)).toBe('failed')
    expect(jobState({ status: 'running' }, 'failed', false)).toBe('failed')
    expect(jobState({ status: 'running' }, 'waiting', false)).toBe('waiting')
    expect(jobState({ status: 'running' }, undefined, false)).toBe('running')
  })

  it('departmentItem: trưởng nhóm theo việc lớn; lời báo lỗi; đang giao', () => {
    expect(departmentItem({ body }, job({}), 'tho')).toEqual({
      handle: 'tho',
      title: 'Chiến dịch ra mắt khoá học',
      sessionId: 'lead-s1',
    })
    expect(departmentItem({ body, out: 'Không có phòng «X». Các phòng: A.' }, undefined, '')).toEqual({
      handle: '',
      title: 'Chiến dịch ra mắt khoá học',
      error: 'Không có phòng «X». Các phòng: A.',
    })
    // Đã giao nhưng chưa tìm thấy bản ghi việc (danh sách chưa tải): chưa phải lỗi.
    expect(departmentItem({ body, out: 'Đã giao cho phòng A: …' }, undefined, '')).toEqual({
      handle: '',
      title: 'Chiến dịch ra mắt khoá học',
    })
    expect(departmentItem({ body }, undefined, '')?.error).toBeUndefined()
    expect(departmentItem({ body: 'hỏng' }, undefined, '')).toBeNull()
  })

  it('toTurns tách cả lần assign_department thành khối riêng', () => {
    const turns = toTurns(
      [step(1, 'user'), step(2, 'tool', { tool: 'assign_department' }), step(3, 'assistant')],
      false,
    )
    expect(turns.map((x) => x.kind)).toEqual(['user', 'team', 'assistant'])
  })

  it('toTurns nhận cả tên công cụ cũ trong log phiên cũ (giao_viec, giao_phong)', () => {
    const turns = toTurns(
      [step(1, 'tool', { tool: 'giao_viec' }), step(2, 'tool', { tool: 'giao_phong' }), step(3, 'assistant')],
      false,
    )
    expect(turns.map((x) => x.kind)).toEqual(['team', 'team', 'assistant'])
  })
})
