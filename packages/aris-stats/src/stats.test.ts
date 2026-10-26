import { describe, expect, it } from 'vitest'
import type { CallRecord, EventRecord, SessionRecord } from './domain.js'
import {
  addCall,
  buildSteps,
  cacheSavings,
  classify,
  classifyNoSession,
  cutText,
  dayKey,
  describeCall,
  expiredKeys,
  keepSpecific,
  LOG_LIMIT,
  overview,
  parseRange,
  rangeDays,
  sessionKey,
  STEP_CHARS,
  type LogEntry,
} from './policy.js'

const NOW = new Date(2026, 9, 26, 12, 0, 0).getTime() // 26/10/2026 12:00 giờ máy
const at = (day: number, h = 10, m = 0) => new Date(2026, 9, day, h, m).getTime()

describe('phân loại loại việc và nguồn', () => {
  it('routine, vòng học, kiểm thử, ứng dụng khác, việc được giao, Telegram, web', () => {
    expect(classify({ routine: true })).toEqual({ kind: 'routine', source: 'lich' })
    expect(classify({ librarian: true })).toEqual({ kind: 'hoc', source: 'nen' })
    expect(classify({ eval: true, via: 'dispatch' })).toEqual({ kind: 'hoc', source: 'nen' })
    expect(classify({ guest: true, via: 'acp' })).toEqual({ kind: 'giao', source: 'app' })
    expect(classify({ via: 'dispatch' })).toEqual({ kind: 'giao', source: 'commander' })
    expect(classify({ via: 'team' })).toEqual({ kind: 'giao', source: 'giao' })
    expect(classify({ parent: true, via: 'open' })).toEqual({ kind: 'giao', source: 'giao' })
    expect(classify({ channel: true, via: 'open' })).toEqual({ kind: 'chat', source: 'telegram' })
    expect(classify({ via: 'open' })).toEqual({ kind: 'chat', source: 'web' })
    expect(classify({})).toEqual({ kind: 'chat', source: 'web' })
  })

  it('routine thắng Telegram; việc giao thắng Telegram (phiên con của cuộc trò chuyện kênh)', () => {
    expect(classify({ routine: true, channel: true })).toEqual({ kind: 'routine', source: 'lich' })
    expect(classify({ parent: true, channel: true })).toEqual({ kind: 'giao', source: 'giao' })
  })

  it('lần gọi ngoài phiên: vòng học hồ sơ, ký ức là học; còn lại là chat', () => {
    expect(classifyNoSession(['reflect', 'bot:tin'])).toEqual({ kind: 'hoc', source: 'nen' })
    expect(classifyNoSession(['profile', 'bot:aris'])).toEqual({ kind: 'hoc', source: 'nen' })
    expect(classifyNoSession(['media-image'])).toEqual({ kind: 'chat', source: 'web' })
  })

  it('phân loại việc nền không tụt về chat khi tag đến chậm', () => {
    const giao = { kind: 'giao', source: 'commander' } as const
    const chat = { kind: 'chat', source: 'web' } as const
    expect(keepSpecific(giao, chat)).toEqual(giao)
    expect(keepSpecific(chat, giao)).toEqual(giao)
    expect(keepSpecific(undefined, chat)).toEqual(chat)
  })
})

const rec = (o: Partial<SessionRecord> & Pick<SessionRecord, 'day' | 'session'>): SessionRecord => ({
  bot: 'aris',
  kind: 'chat',
  source: 'web',
  firstAt: 0,
  lastAt: 0,
  calls: 1,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  usd: 0,
  saveUsd: 0,
  fullInUsd: 0,
  asked: false,
  ...o,
})

describe('khoảng ngày', () => {
  it('hôm nay một ngày, 7 ngày và 30 ngày tính cả hôm nay, cũ trước; không rõ thì 7 ngày', () => {
    expect(rangeDays('today', NOW).days).toEqual(['2026-10-26'])
    const w = rangeDays('7d', NOW)
    expect(w.days).toHaveLength(7)
    expect(w.days[0]).toBe('2026-10-20')
    expect(w.days.at(-1)).toBe('2026-10-26')
    expect(w.since).toBe(new Date(2026, 9, 20).getTime())
    const m = rangeDays('30d', NOW).days
    expect(m).toHaveLength(30)
    expect(m[0]).toBe('2026-09-27')
    expect(parseRange('30d')).toBe('30d')
    expect(parseRange('x')).toBe('7d')
    expect(parseRange(null)).toBe('7d')
  })

  it('qua ranh giới tháng và năm vẫn đủ ngày', () => {
    const d = rangeDays('7d', new Date(2027, 0, 3, 9).getTime()).days
    expect(d[0]).toBe('2026-12-28')
    expect(d).toHaveLength(7)
    expect(dayKey(new Date(2026, 1, 5).getTime())).toBe('2026-02-05')
  })

  it('khoá bản ghi theo phiên thay ký tự lạ, gom ngoài phiên có khoá riêng', () => {
    expect(sessionKey('2026-10-26', 'ses_a/b:c')).toBe('2026-10-26-ses-a-b-c')
    expect(sessionKey('2026-10-26', '')).toBe('2026-10-26-~nen')
  })
})

describe('gộp theo ngày, cache, tự chủ, nhật ký', () => {
  const records: SessionRecord[] = [
    rec({
      day: '2026-10-26',
      session: 's1',
      bot: 'aris',
      kind: 'chat',
      usd: 0.19,
      input: 1000,
      cacheRead: 9000,
      saveUsd: 0.2,
      fullInUsd: 0.5,
      firstAt: at(26, 10, 40),
      lastAt: at(26, 10, 45),
      output: 500,
    }),
    rec({
      day: '2026-10-26',
      session: 's2',
      bot: 'lam',
      kind: 'giao',
      source: 'commander',
      by: 'Aris',
      usd: 0.11,
      input: 500,
      cacheRead: 500,
      saveUsd: 0.05,
      fullInUsd: 0.25,
      firstAt: at(26, 10, 42),
      lastAt: at(26, 10, 47),
      asked: true,
    }),
    rec({
      day: '2026-10-25',
      session: 's2',
      kind: 'giao',
      usd: 0.5,
      firstAt: at(25, 9),
      lastAt: at(25, 9, 30),
    }),
    rec({ day: '2026-10-25', session: 's3', kind: 'routine', source: 'lich', usd: 0.03 }),
    // Gom ngoài phiên: vào biểu đồ và cache, không vào nhật ký, không tính việc.
    rec({ day: '2026-10-25', session: '', kind: 'hoc', source: 'nen', usd: 0.02, calls: 3 }),
    rec({ day: '2026-10-10', session: 's9', usd: 99 }),
    // Chỉ có dấu đã hỏi, chưa có lần gọi: không tính vào tổng số việc.
    rec({ day: '2026-10-26', session: 's5', calls: 0, asked: true }),
  ]

  it('mỗi ngày đủ bốn loại, ngày trống là 0, ngoài khoảng bị bỏ', () => {
    const o = overview(records, '7d', NOW)
    expect(o.days).toHaveLength(7)
    expect(o.days.at(-1)).toMatchObject({ day: '2026-10-26', chat: 0.19, giao: 0.11, routine: 0, hoc: 0 })
    expect(o.days.at(-2)).toMatchObject({ day: '2026-10-25', giao: 0.5, routine: 0.03, hoc: 0.02 })
    expect(o.days[0]).toEqual({ day: '2026-10-20', chat: 0, giao: 0, routine: 0, hoc: 0 })
    expect(o.total).toBeCloseTo(0.19 + 0.11 + 0.5 + 0.03 + 0.02, 6)
    const today = overview(records, 'today', NOW)
    expect(today.days).toHaveLength(1)
    expect(today.total).toBeCloseTo(0.3, 6)
    expect(overview(records, '30d', NOW).total).toBeCloseTo(99.85, 6)
  })

  it('cache = đọc cache / (đầu vào chưa cache + đọc cache + ghi cache); tiết kiệm theo giá', () => {
    const today = overview(records, 'today', NOW)
    expect(today.cache.pct).toBeCloseTo((9500 / 11000) * 100, 0)
    expect(today.cache.savePct).toBeCloseTo((0.25 / 0.75) * 100, 0)
    expect(overview([], '7d', NOW).cache).toEqual({ pct: null, savePct: null })
    expect(overview([rec({ day: '2026-10-26', session: 'x', input: 5 })], 'today', NOW).cache).toEqual({
      pct: 0,
      savePct: null,
    })
  })

  it('tự chủ: số bản ghi (ngày, phiên) có lần gọi, và số bản không phải hỏi', () => {
    expect(overview(records, 'today', NOW).autonomous).toEqual({ done: 1, total: 2 })
    expect(overview(records, '7d', NOW).autonomous).toEqual({ done: 3, total: 4 })
  })

  it('nhật ký: mỗi phiên một dòng gộp ngày, mới nhất trước, bỏ gom ngoài phiên', () => {
    const o = overview(records, '7d', NOW)
    expect(o.log.map((r) => r.session)).toEqual(['s2', 's1', 's3'])
    const s2 = o.log[0]!
    expect(s2).toMatchObject({ bot: 'lam', by: 'Aris', source: 'commander', usd: 0.61 })
    expect(s2.firstAt).toBe(at(25, 9))
    expect(s2.lastAt).toBe(at(26, 10, 47))
    expect(o.log[1]!.tokens).toBe(1000 + 9000 + 500)
  })

  it('nhật ký giữ tối đa 100 dòng', () => {
    const many = Array.from({ length: 130 }, (_, i) =>
      rec({ day: '2026-10-26', session: `s${i}`, lastAt: i, firstAt: i }),
    )
    const log = overview(many, 'today', NOW).log
    expect(log).toHaveLength(LOG_LIMIT)
    expect(log[0]!.session).toBe('s129')
  })

  it('addCall cộng dồn, giữ phân loại và cờ asked', () => {
    const base = {
      session: 's1',
      bot: 'aris',
      kind: 'chat' as const,
      source: 'web' as const,
      input: 100,
      output: 10,
      cacheRead: 50,
      cacheWrite: 0,
      usd: 0.01,
      saveUsd: 0.001,
      fullInUsd: 0.004,
    }
    const a = addCall(undefined, { ...base, at: 5000 })
    const b = addCall({ ...a, asked: true }, { ...base, at: 3000, by: 'Aris' })
    expect(b).toMatchObject({
      calls: 2,
      input: 200,
      output: 20,
      cacheRead: 100,
      firstAt: 3000,
      lastAt: 5000,
      by: 'Aris',
      asked: true,
    })
    expect(b.usd).toBeCloseTo(0.02, 9)
  })

  it('tiền tiết kiệm nhờ cache: không có giá thì 0', () => {
    const u = { input: 1_000_000, cacheRead: 9_000_000, cacheWrite: 0 }
    expect(cacheSavings(undefined, u)).toEqual({ saveUsd: 0, fullInUsd: 0 })
    const r = cacheSavings({ input: 0.28, cacheRead: 0.028 }, u)
    expect(r.fullInUsd).toBeCloseTo(2.8, 9)
    expect(r.saveUsd).toBeCloseTo(9 * 0.252, 9)
  })

  it('dọn bản ghi quá hạn', () => {
    const rows: [string, number][] = [
      ['cu', NOW - 40 * 86_400_000],
      ['moi', NOW - 86_400_000],
    ]
    expect(expiredKeys(rows.values(), (t) => t, 30, NOW)).toEqual(['cu'])
  })
})

// --- buildSteps -------------------------------------------------------------------------------------

const msg = (role: string, content: unknown, source: Record<string, unknown> = { kind: 'user' }) => ({
  id: 'm',
  role,
  content,
  source,
})
const text = (t: string) => [{ type: 'text', text: t }]
const T0 = at(26, 10, 42)

const log: LogEntry[] = [
  { type: 'turn/start', time: T0, data: { turn: 1 } },
  { type: 'user/message', time: T0 + 10, data: msg('user', text('Nghiên cứu 3 đối thủ của khoá học AI')) },
  {
    type: 'user/message',
    time: T0 + 11,
    data: msg('user', text('<ctx>'), { kind: 'runtime-context', form: 'snapshot' }),
  },
  { type: 'step/start', time: T0 + 20, data: { turn: 1, step: 1 } },
  {
    type: 'assistant/message',
    time: T0 + 1200,
    data: {
      turn: 1,
      step: 1,
      message: msg(
        'assistant',
        [
          { type: 'tool-call', id: 'c1', name: 'brain_search', arguments: '{}' },
          { type: 'tool-call', id: 'c2', name: 'web_fetch', arguments: '{}' },
        ],
        { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      ),
      usage: { inputTokens: 160, outputTokens: 64, cacheReadTokens: 1880 },
    },
  },
  {
    type: 'tool/call',
    time: T0 + 1210,
    data: {
      turn: 1,
      step: 1,
      callId: 'c1',
      name: 'brain_search',
      arguments: '{"query":"đối thủ khoá học AI"}',
    },
  },
  {
    type: 'tool/call',
    time: T0 + 1211,
    data: {
      turn: 1,
      step: 1,
      callId: 'c2',
      name: 'web_fetch',
      arguments: '{"url":"https://hocvienb.vn/khoa-hoc"}',
    },
  },
  {
    type: 'tool/result',
    time: T0 + 2400,
    data: {
      turn: 1,
      step: 1,
      message: { toolCallId: 'c1', content: text('[[hoc-vien-a]] Học viện A'), isError: false },
    },
  },
  {
    type: 'tool/result',
    time: T0 + 4500,
    data: {
      turn: 1,
      step: 1,
      message: { toolCallId: 'c2', content: text('x'.repeat(STEP_CHARS + 500)), isError: false },
    },
  },
  { type: 'step/start', time: T0 + 4600, data: { turn: 1, step: 2 } },
  {
    type: 'assistant/message',
    time: T0 + 22_000,
    data: {
      turn: 1,
      step: 2,
      message: msg(
        'assistant',
        [
          { type: 'reasoning', text: 'A rẻ nhất nhóm giữa.\nThiếu số học viên của B.' },
          { type: 'text', text: 'Đã xong. Bảng ở doi-thu.md.' },
        ],
        { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      ),
      usage: { inputTokens: 300, outputTokens: 1180, cacheReadTokens: 5000, cacheWriteTokens: 0 },
    },
  },
]

const calls: CallRecord[] = [
  {
    at: T0 + 1200,
    day: '2026-10-26',
    session: 's',
    kind: 'giao',
    source: 'commander',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    input: 160,
    output: 64,
    cacheRead: 1880,
    cacheWrite: 0,
    usd: 0.003,
  },
  // Chi phí ảnh, video không có token: không chen vào việc ghép theo thứ tự.
  {
    at: T0 + 3000,
    day: '2026-10-26',
    session: 's',
    kind: 'giao',
    source: 'commander',
    provider: 'x',
    model: 'img',
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    usd: 0.04,
  },
  {
    at: T0 + 22_000,
    day: '2026-10-26',
    session: 's',
    kind: 'giao',
    source: 'commander',
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    input: 300,
    output: 1180,
    cacheRead: 5000,
    cacheWrite: 0,
    usd: 0.026,
  },
]

describe('dựng các bước phát lại', () => {
  const steps = buildSteps(log, calls, [], [])

  it('tin người dùng, bỏ ngữ cảnh chèn vào; mỗi lời gọi công cụ ghép với kết quả thành một bước', () => {
    expect(steps.map((s) => [s.n, s.type])).toEqual([
      [1, 'user'],
      [2, 'tool'],
      [3, 'tool'],
      [4, 'thinking'],
      [5, 'assistant'],
    ])
    expect(steps[0]).toMatchObject({
      inLabel: 'message',
      body: 'Nghiên cứu 3 đối thủ của khoá học AI',
      at: T0 + 10,
    })
    expect(steps[1]).toMatchObject({
      tool: 'brain_search',
      title: 'brain_search đối thủ khoá học AI',
      inLabel: 'args',
      outLabel: 'result',
      out: '[[hoc-vien-a]] Học viện A',
      ms: 1190,
    })
    expect(steps[1]!.body).toBe('{\n  "query": "đối thủ khoá học AI"\n}')
  })

  it('token gắn vào bước đầu tiên của mỗi lần gọi model; tiền ghép theo thứ tự', () => {
    expect(steps[1]).toMatchObject({
      model: 'deepseek-v4-flash',
      input: 160 + 1880,
      cacheRead: 1880,
      output: 64,
      usd: 0.003,
    })
    expect(steps[2]!.input).toBeUndefined()
    expect(steps[3]).toMatchObject({ type: 'thinking', input: 5300, output: 1180, usd: 0.026, ms: 17_400 })
    expect(steps[4]!.input).toBeUndefined()
    expect(steps[3]!.title).toBe('A rẻ nhất nhóm giữa. Thiếu số học viên của B.')
    expect(steps[4]).toMatchObject({ type: 'assistant', body: 'Đã xong. Bảng ở doi-thu.md.' })
  })

  it('không có bản ghi gọi thì tính theo giá nếu có hàm tính', () => {
    const s = buildSteps(log, [], [], [], {
      cost: (_p, m, u) => (m === 'deepseek-v4-pro' ? u.output / 1e6 : undefined),
    })
    expect(s[1]!.usd).toBeUndefined()
    expect(s[3]!.usd).toBeCloseTo(0.00118, 9)
  })

  it('cắt chữ dài ở 4.000 ký tự và báo chưa đủ; lấy đủ khi nâng trần', () => {
    expect(steps[2]!.out).toHaveLength(STEP_CHARS)
    expect(steps[2]).toMatchObject({ outFull: false, bodyFull: true })
    const full = buildSteps(log, calls, [], [], { limit: 100_000 })
    expect(full[2]!.out).toHaveLength(STEP_CHARS + 500)
    expect(full[2]!.outFull).toBe(true)
    expect(cutText('abc', 2)).toEqual({ text: 'ab', full: false })
  })

  it('xin duyệt đứng ngay trước bước công cụ; log phiên hợp với bản ghi events theo callId', () => {
    const entries: LogEntry[] = [
      ...log.slice(0, 7),
      { type: 'approval/asked', time: T0 + 1300, data: { id: 'a1', toolName: 'web_fetch', callId: 'c2' } },
      { type: 'approval/decided', time: T0 + 42_300, data: { id: 'a1', outcome: 'allowed-once' } },
      ...log.slice(7),
    ]
    const events: EventRecord[] = [
      {
        at: T0 + 1301,
        session: 's',
        type: 'duyet',
        tool: 'web_fetch',
        callId: 'c2',
        what: 'https://hocvienb.vn/khoa-hoc',
        decision: 'allowed-once',
        waitedMs: 41_000,
      },
    ]
    const s = buildSteps(entries, calls, events, [])
    expect(s.map((x) => x.type)).toEqual(['user', 'tool', 'duyet', 'tool', 'thinking', 'assistant'])
    expect(s[2]).toMatchObject({
      title: 'web_fetch https://hocvienb.vn/khoa-hoc',
      outLabel: 'decision',
      out: 'allowed-once',
      ms: 41_000,
    })
    // Không có bản ghi events: lấy thời gian chờ từ log.
    const only = buildSteps(entries, calls, [], [])
    expect(only[2]).toMatchObject({ type: 'duyet', ms: 41_000, out: 'allowed-once' })
  })

  it('bản ghi events không có trong log vẫn thành bước, đứng theo thời gian', () => {
    const events: EventRecord[] = [
      {
        at: T0 + 3000,
        session: 's',
        type: 'duyet',
        tool: 'bash',
        what: 'ls',
        decision: 'rejected',
        waitedMs: 5000,
      },
    ]
    const s = buildSteps(log, calls, events, [])
    expect(s.map((x) => x.type)).toEqual(['user', 'tool', 'tool', 'duyet', 'thinking', 'assistant'])
    expect(s[3]).toMatchObject({ title: 'bash ls', out: 'rejected' })
  })

  it('hàng rào chặn đánh dấu bước công cụ trùng tên, không có thì thêm bước riêng', () => {
    const blocked = [{ at: new Date(T0 + 1300).toISOString(), tool: 'web_fetch', what: 'mạng lạ' }]
    const s = buildSteps(log, calls, [], blocked)
    expect(s[2]).toMatchObject({ type: 'chan', error: true, outLabel: 'rule' })
    expect(s[2]!.out).toMatch(/^mạng lạ/)
    const lone = buildSteps(
      log,
      calls,
      [],
      [{ at: new Date(T0 + 3000).toISOString(), tool: 'bash', what: 'sudo' }],
    )
    expect(lone.map((x) => x.type)).toEqual(['user', 'tool', 'tool', 'chan', 'thinking', 'assistant'])
    expect(lone[3]).toMatchObject({ tool: 'bash', body: 'sudo' })
  })

  it('hỏi người dùng: bước hỏi, thời gian là lúc chờ trả lời; công cụ báo lỗi đánh dấu lỗi', () => {
    const entries: LogEntry[] = [
      {
        type: 'tool/call',
        time: 100,
        data: {
          turn: 1,
          step: 1,
          callId: 'q',
          name: 'ask_user_question',
          arguments: '{"questions":[{"id":"1","question":"Chọn hướng nào?"}]}',
        },
      },
      {
        type: 'tool/result',
        time: 9100,
        data: { turn: 1, step: 1, message: { toolCallId: 'q', content: text('Hướng A'), isError: false } },
      },
      {
        type: 'tool/call',
        time: 9200,
        data: { turn: 1, step: 2, callId: 'b', name: 'bash', arguments: '{"command":"cat x"}' },
      },
      {
        type: 'tool/result',
        time: 9300,
        data: {
          turn: 1,
          step: 2,
          message: { toolCallId: 'b', content: text('no such file'), isError: true },
        },
      },
    ]
    const s = buildSteps(entries, [], [], [])
    expect(s[0]).toMatchObject({
      type: 'hoi',
      title: 'ask_user_question Chọn hướng nào?',
      ms: 9000,
      outLabel: 'answer',
      out: 'Hướng A',
    })
    expect(s[1]).toMatchObject({
      type: 'tool',
      inLabel: 'command',
      body: 'cat x',
      error: true,
      outLabel: 'error',
    })
  })

  it('mô tả lời gọi lấy trường phổ biến, tham số hỏng vẫn có chữ', () => {
    expect(describeCall('bash', { command: 'curl -s x\nls' })).toBe('curl -s x ls')
    expect(describeCall('write', '{"file_path":"a.md","content":"x"}')).toBe('a.md')
    expect(describeCall('t', { foo: 3 })).toBe('{"foo":3}')
    expect(describeCall('t', 'không phải JSON')).toBe('không phải JSON')
    expect(describeCall('t', {})).toBe('')
  })
})
