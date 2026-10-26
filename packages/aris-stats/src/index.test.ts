import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from './index.js'

type Rec = Record<string, unknown>
/** Phần của phản hồi API mà test đọc. */
interface Body extends Rec {
  days: Rec[]
  log: Rec[]
  steps: Rec[]
  cache: { pct: number }
}
type Hook = (...a: unknown[]) => Promise<unknown>

/** Context giả vừa đủ cho `apply`: kho bảng trong bộ nhớ, hook, route, dịch vụ của các gói khác. */
function setup(extra: Record<string, unknown> = {}) {
  const tables: Record<string, Map<string, Rec>> = {
    calls: new Map(),
    sessions: new Map(),
    events: new Map(),
  }
  const table = (m: Map<string, Rec>) => ({
    get: (k: string) => m.get(k),
    entries: () => m.entries(),
    put: async (k: string, v: Rec) => void m.set(k, v),
    delete: async (k: string) => m.delete(k),
  })
  const hooks: Record<string, Hook[]> = {}
  const disposers: (() => void)[] = []
  let route: { fetch(r: Request): Promise<Response> } | undefined
  let emit: ((c: unknown) => void) | undefined
  const tags: Record<string, { bot: string; via: string }> = {}
  const flags = {
    routine: new Set<string>(),
    librarian: new Set<string>(),
    channel: new Set<string>(),
    lark: new Set<string>(),
  }
  const services: Record<string, unknown> = {
    arisSpend: {
      onCall: (fn: (c: unknown) => void) => {
        emit = fn
        return () => {}
      },
      priceOf: () => ({ input: 0.28, output: 1.1, cacheRead: 0.028, cacheWrite: 0 }),
    },
    arisBots: {
      botOf: (sid: string | undefined) =>
        sid && tags[sid]?.bot === 'lam'
          ? { id: 'lam', name: 'Lâm', kind: 'member' }
          : { id: 'aris', name: 'Aris', kind: 'commander' },
      store: {
        tagOf: (sid: string) => tags[sid],
        list: () => [
          { id: 'aris', name: 'Aris', kind: 'commander', mascot: 'aris' },
          { id: 'lam', name: 'Lâm', kind: 'member', mascot: 'trang-giay' },
        ],
      },
      live: {
        runningSessions: () => ['s-run'],
        runningInfo: () => [] as { session: string; bot: string; task?: string; since: number }[],
        sessionState: () => 'idle',
        activity: [
          { bot: 'lam', kind: 'done', task: 'So 3 đối thủ', session: 's-done', at: Date.now() - 1000 },
        ],
      },
    },
    arisRoutine: {
      isRoutine: (s: string) => flags.routine.has(s),
      recentRuns: () => [{ at: Date.now() - 3000, bot: 'lam', title: 'Báo cáo tuần', status: 'done' }],
    },
    arisBrain: { isLibrarian: (s: string) => flags.librarian.has(s) },
    arisChannels: {
      isChannelSession: (s: string) => flags.channel.has(s),
      isLarkSession: (s: string) => flags.lark.has(s),
    },
    arisJobs: { list: () => [{ session: 's-job', parentSession: 's-chat' }] },
    arisApprovals: { list: () => [] as Rec[] },
    arisSkills: { skillEvents: () => ({ enabled: 3, rolledBack: 1 }) },
    arisGuard: {
      blocked: () => [],
      recentBlocked: () => [
        { at: new Date(Date.now() - 2000).toISOString(), bot: 'lam', tool: 'bash', what: 'curl x' },
      ],
    },
    sessionQuery: {
      observeSession: async () => ({
        events: [
          {
            type: 'user/message',
            time: 1000,
            data: { role: 'user', content: [{ type: 'text', text: 'Xin chào' }], source: { kind: 'user' } },
          },
          {
            type: 'assistant/message',
            time: 2000,
            data: {
              turn: 1,
              step: 1,
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Chào bạn' }],
                source: { kind: 'model', provider: 'deepseek-official', model: 'm' },
              },
              usage: { inputTokens: 100, outputTokens: 10 },
            },
          },
        ],
        [Symbol.dispose]() {},
      }),
      readTitleSnapshots: async (ids: string[]) =>
        ids.map((sessionId) => ({
          sessionId,
          status: 'fulfilled',
          value: { title: { title: '[Phòng nhóm · Marketing] Nghiên cứu đối thủ' } },
        })),
    },
    ...extra,
  }
  const ctx = {
    logger: () => ({ warn() {}, info() {} }),
    storageDomain: {
      open: async () => ({ table: (n: string) => table(tables[n]!), close: async () => {} }),
    },
    effect: (fn: () => (() => void) | void) => {
      const d = fn()
      if (d) disposers.push(d)
    },
    on: (name: string, fn: Hook) => void (hooks[name] ??= []).push(fn),
    inject: (_deps: string[], cb: (c: unknown) => void) => cb(ctx),
    connection: {
      fetch: {
        register: (r: { fetch(req: Request): Promise<Response> }) => {
          route = r
          return () => {}
        },
      },
    },
    get: (n: string) => services[n],
  }
  const ready = apply(ctx as unknown as Context)
  return {
    ready,
    tables,
    tags,
    flags,
    hooks,
    call: (c: Record<string, unknown>) =>
      emit?.({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        usd: 0.01,
        at: Date.now(),
        scope: [],
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 9000 },
        ...c,
      }),
    get: async (q: string) => {
      const r = await route!.fetch(new Request(`http://x/api/aris/stats${q}`))
      return { status: r.status, body: (await r.json()) as Body }
    },
    close: () => disposers.forEach((d) => d()),
  }
}

let current: ReturnType<typeof setup> | undefined
afterEach(() => current?.close())

describe('ghi từng lần gọi', () => {
  it('lần gọi trong phiên: phân loại theo dịch vụ của các gói, gộp theo phiên và ngày', async () => {
    const s = (current = setup())
    await s.ready
    s.tags['s-job'] = { bot: 'lam', via: 'dispatch' }
    s.call({ session: 's-chat' })
    s.call({ session: 's-chat' })
    s.call({ session: 's-job' })
    s.flags.routine.add('s-rt')
    s.call({ session: 's-rt' })
    s.flags.channel.add('s-tg')
    s.call({ session: 's-tg' })
    s.flags.channel.add('s-lk')
    s.flags.lark.add('s-lk')
    s.call({ session: 's-lk' })
    await vi.waitFor(() => expect(s.tables.calls!.size).toBe(6))
    const rows = Object.fromEntries([...s.tables.sessions!.values()].map((r: Rec) => [r.session, r]))
    expect(rows['s-chat']).toMatchObject({
      kind: 'chat',
      source: 'web',
      bot: 'aris',
      calls: 2,
      input: 2000,
      cacheRead: 18000,
    })
    expect(rows['s-job']).toMatchObject({ kind: 'giao', source: 'commander', bot: 'lam', by: 'Aris' })
    expect(rows['s-rt']).toMatchObject({ kind: 'routine', source: 'lich' })
    expect(rows['s-tg']).toMatchObject({ kind: 'chat', source: 'telegram' })
    expect(rows['s-lk']).toMatchObject({ kind: 'chat', source: 'lark' })
    // 9.000 token đọc cache ở giá 0,028 thay vì 0,28 USD cho 1 triệu token.
    expect(rows['s-chat'].saveUsd).toBeCloseTo(2 * ((9000 * 0.252) / 1e6), 9)
    expect(rows['s-chat'].asked).toBe(false)
  })

  it('lần gọi ngoài phiên (vòng học nền) và chi phí ảnh, video', async () => {
    const s = (current = setup())
    await s.ready
    s.call({ scope: ['reflect', 'bot:tin'] })
    s.call({
      session: 's-chat',
      provider: 'x',
      model: 'img',
      usage: { inputTokens: 0, outputTokens: 0 },
      usd: 0.04,
    })
    await vi.waitFor(() => expect(s.tables.calls!.size).toBe(2))
    const pseudo = [...s.tables.sessions!.values()].find((r: Rec) => r.session === '')
    expect(pseudo).toMatchObject({ kind: 'hoc', source: 'nen', bot: 'tin' })
    const o = await s.get('?range=today')
    expect(o.body.days.at(-1)).toMatchObject({ hoc: 0.01, chat: 0.04 })
    // Gom ngoài phiên không vào nhật ký.
    expect(o.body.log.map((r: Rec) => r.session)).toEqual(['s-chat'])
  })
})

describe('duyệt và hỏi người dùng', () => {
  it('ghi kết quả duyệt và đánh dấu đã hỏi, không đổi kết quả', async () => {
    const s = (current = setup())
    await s.ready
    s.call({ session: 's-chat' })
    const pre = s.hooks['tools/pre-execute']![0]!
    await pre(
      { agent: { session: { id: 's-chat' } }, name: 'bash', arguments: { command: 'ls -la' }, callId: 'c1' },
      async () => 'next-ok',
    )
    const req = s.hooks['approval/request']![0]!
    const out = await req(
      { agent: { session: { id: 's-chat' } }, toolName: 'bash', callId: 'c1' },
      async () => 'allowed-once',
    )
    expect(out).toBe('allowed-once')
    await vi.waitFor(() => expect(s.tables.events!.size).toBe(1))
    expect([...s.tables.events!.values()][0]).toMatchObject({
      type: 'duyet',
      session: 's-chat',
      tool: 'bash',
      callId: 'c1',
      what: 'ls -la',
      decision: 'allowed-once',
    })
    await vi.waitFor(() => expect([...s.tables.sessions!.values()][0]).toMatchObject({ asked: true }))
    const o = await s.get('?range=today')
    expect(o.body.autonomous).toEqual({ done: 0, total: 1 })
  })

  it('huỷ giữa chừng vẫn ghi và để lỗi đi tiếp; ask_user_question ghi sự kiện hỏi', async () => {
    const s = (current = setup())
    await s.ready
    const req = s.hooks['approval/request']![0]!
    await expect(
      req({ agent: { session: { id: 's-chat' } }, toolName: 'bash' }, async () => {
        throw new Error('dừng')
      }),
    ).rejects.toThrow('dừng')
    await vi.waitFor(() => expect([...s.tables.events!.values()][0]).toMatchObject({ decision: 'cancelled' }))
    const pre = s.hooks['tools/pre-execute']![0]!
    const r = await pre(
      {
        agent: { session: { id: 's2' } },
        name: 'ask_user_question',
        arguments: { questions: [{ question: 'Chọn hướng nào?' }] },
        callId: 'q1',
      },
      async () => 'next-ok',
    )
    expect(r).toBe('next-ok')
    await vi.waitFor(() => expect(s.tables.events!.size).toBe(2))
    expect([...s.tables.events!.values()].find((e: Rec) => e.type === 'hoi')).toMatchObject({
      what: 'Chọn hướng nào?',
    })
  })
})

describe('/api/aris/stats', () => {
  it('số liệu theo khoảng: nhật ký có tên phiên, tên bot, đang chạy; kèm skill', async () => {
    const s = (current = setup())
    await s.ready
    s.tags['s-job'] = { bot: 'lam', via: 'dispatch' }
    s.call({ session: 's-run' })
    s.call({ session: 's-job' })
    await vi.waitFor(() => expect(s.tables.calls!.size).toBe(2))
    const { status, body } = await s.get('?range=30d')
    expect(status).toBe(200)
    expect(body.range).toBe('30d')
    expect(body.days).toHaveLength(30)
    expect(body.skills).toEqual({ enabled: 3, rolledBack: 1 })
    expect(body.cache.pct).toBeCloseTo(90, 0)
    const run = body.log.find((r: Rec) => r.session === 's-run')
    expect(run).toMatchObject({ running: true, title: 'Nghiên cứu đối thủ', botName: 'Aris' })
    expect(body.log.find((r: Rec) => r.session === 's-job')).toMatchObject({
      botName: 'Lâm',
      mascot: 'trang-giay',
      by: 'Aris',
    })
    // Không rõ khoảng thì 7 ngày.
    expect((await s.get('?range=abc')).body.days).toHaveLength(7)
  })

  it('phát lại: dựng bước từ log phiên; mã phiên sai thì 400, bước không có thì 404', async () => {
    const s = (current = setup())
    await s.ready
    s.call({ session: 's-chat', usage: { inputTokens: 100, outputTokens: 10 }, usd: 0.5 })
    await vi.waitFor(() => expect(s.tables.calls!.size).toBe(1))
    const { status, body } = await s.get('?replay=s-chat')
    expect(status).toBe(200)
    expect(body).toMatchObject({
      session: 's-chat',
      bot: 'aris',
      source: 'web',
      tokens: 110,
      usd: 0.5,
      title: 'Nghiên cứu đối thủ',
    })
    expect(body.steps.map((x: Rec) => [x.n, x.type])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ])
    expect(body.steps[1]).toMatchObject({ input: 100, output: 10, usd: 0.5, model: 'm' })
    expect((await s.get('?replay=s-chat&step=2&full=1')).body).toMatchObject({ n: 2, type: 'assistant' })
    expect((await s.get('?replay=s-chat&step=9')).status).toBe(404)
    expect((await s.get('?replay=s-chat&step=x')).status).toBe(400)
    expect((await s.get('?replay=a/b')).status).toBe(400)
  })

  it('không đọc được phiên thì 404', async () => {
    const s = (current = setup({
      sessionQuery: {
        observeSession: async () => {
          throw new Error('không có')
        },
      },
    }))
    await s.ready
    expect((await s.get('?replay=s-x')).status).toBe(404)
  })
})

describe('dòng Vừa làm gì', () => {
  it('gộp việc của bot, hỏi người dùng, hàng rào chặn và routine xong; cắt theo limit', async () => {
    const s = (current = setup())
    await s.ready
    s.tables.events!.set('e1', {
      at: Date.now() - 500,
      session: 's-chat',
      type: 'hoi',
      what: 'Giọng văn nào?',
    })
    const all = (await s.get('?feed=1')) as unknown as { body: { feed: Rec[] } }
    expect(all.body.feed.map((f) => f.kind)).toEqual(['asked', 'done', 'blocked', 'routine'])
    expect(all.body.feed[0]).toMatchObject({ bot: 'aris', tone: 'warn', what: 'Giọng văn nào?' })
    const two = (await s.get('?feed=1&limit=2')) as unknown as { body: { feed: Rec[] } }
    expect(two.body.feed).toHaveLength(2)
  })

  it('việc xong mang mã phiên; phiên đang chạy thành dòng "Đang làm" lấy tên từ việc được giao hay tên phiên', async () => {
    const bots = {
      botOf: () => ({ id: 'lam', name: 'Lâm', kind: 'member' }),
      store: { tagOf: () => undefined, list: () => [] },
      live: {
        runningSessions: () => ['s-a', 's-b'],
        runningInfo: () => [
          { session: 's-a', bot: 'lam', task: 'Viết bài', since: Date.now() - 5000 },
          { session: 's-b', bot: 'tho', since: Date.now() - 4000 },
        ],
        sessionState: () => 'idle',
        activity: [
          { bot: 'lam', kind: 'done', task: 'So 3 đối thủ', session: 's-done', at: Date.now() - 1000 },
          { bot: 'lam', kind: 'started', task: 'Viết bài', session: 's-a', at: Date.now() - 5000 },
        ],
      },
    }
    const s = (current = setup({ arisBots: bots }))
    await s.ready
    const { body } = (await s.get('?feed=1')) as unknown as { body: { feed: Rec[] } }
    const running = body.feed.filter((f) => f.kind === 'running')
    expect(running.map((f) => [f.bot, f.session, f.what])).toEqual([
      ['tho', 's-b', 'Nghiên cứu đối thủ'],
      ['lam', 's-a', 'Viết bài'],
    ])
    expect(body.feed.find((f) => f.kind === 'done')).toMatchObject({
      session: 's-done',
      what: 'So 3 đối thủ',
    })
    // Dòng "bắt đầu" của chính phiên đang chạy không hiện thêm lần nữa.
    expect(body.feed.some((f) => f.kind === 'started')).toBe(false)
  })

  it('yêu cầu quyền còn treo thành dòng chờ có mã duyệt và mã phiên con', async () => {
    const s = (current = setup({
      arisApprovals: {
        list: () => [
          {
            id: 'ap-1',
            run: 'member:s-an',
            bot: 'an',
            kind: 'run',
            target: 'gửi email',
            at: new Date().toISOString(),
          },
          { id: 'ap-2', run: 'run-9', bot: 'kiet', kind: 'edit', tool: 'Edit', at: new Date().toISOString() },
        ],
      },
    }))
    await s.ready
    const { body } = (await s.get('?feed=1')) as unknown as { body: { feed: Rec[] } }
    const waiting = body.feed.filter((f) => f.approval)
    expect(waiting.map((f) => [f.approval, f.bot, f.session, f.kind, f.what])).toEqual(
      expect.arrayContaining([
        ['ap-1', 'an', 's-an', 'asked', 'gửi email'],
        ['ap-2', 'kiet', 'run-9', 'asked', 'Edit'],
      ]),
    )
  })

  it('khoảng: mặc định 24 giờ, today từ nửa đêm, 7d lấy việc cũ hơn một ngày', async () => {
    const old = Date.now() - 3 * 86_400_000
    const bots = {
      botOf: () => ({ id: 'lam', name: 'Lâm', kind: 'member' }),
      store: { tagOf: () => undefined, list: () => [] },
      live: {
        runningSessions: () => [],
        runningInfo: () => [],
        sessionState: () => 'idle',
        activity: [
          { bot: 'lam', kind: 'done', task: 'Mới', session: 's1', at: Date.now() - 1000 },
          { bot: 'lam', kind: 'done', task: 'Cũ', session: 's2', at: old },
        ],
      },
    }
    const s = (current = setup({ arisBots: bots }))
    await s.ready
    const feed = async (q: string) =>
      ((await s.get(q)) as unknown as { body: { feed: Rec[] } }).body.feed
        .filter((f) => f.kind === 'done')
        .map((f) => f.what)
    expect(await feed('?feed=1')).toEqual(['Mới'])
    expect(await feed('?feed=1&range=7d')).toEqual(['Mới', 'Cũ'])
  })
})

describe('kết quả của một phiên', () => {
  const log = (extra: Rec[] = []) => ({
    observeSession: async () => ({
      events: [
        {
          type: 'user/message',
          time: 1000,
          data: { role: 'user', content: [{ type: 'text', text: 'Làm bảng' }], source: { kind: 'user' } },
        },
        {
          type: 'tool/call',
          time: 1500,
          data: {
            callId: 'c1',
            name: 'write',
            arguments: JSON.stringify({ file_path: 'bang-so-sanh.csv', content: 'x' }),
          },
        },
        {
          type: 'assistant/message',
          time: 2000,
          data: {
            turn: 1,
            step: 2,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Xong **bảng** rồi.' }],
              source: { kind: 'model' },
            },
          },
        },
        { type: 'turn/end', time: 2100, data: { turn: 1, reason: { kind: 'completed' } } },
        ...extra,
      ],
      [Symbol.dispose]() {},
    }),
    readTitleSnapshots: async (ids: string[]) =>
      ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: 'Tên phiên' } } })),
  })

  it('trả bot, tên việc, trạng thái, toàn văn câu cuối và tệp đã ghi', async () => {
    const s = (current = setup({ sessionQuery: log() }))
    await s.ready
    const { status, body } = await s.get('?result=s-done')
    expect(status).toBe(200)
    expect(body).toMatchObject({
      session: 's-done',
      bot: 'aris',
      title: 'So 3 đối thủ',
      status: 'done',
      text: 'Xong **bảng** rồi.',
      files: [{ path: 'bang-so-sanh.csv', name: 'bang-so-sanh.csv' }],
      at: 2000,
    })
  })

  it('phiên đang chạy báo running; không có việc được giao thì lấy tên phiên; mã sai thì 400, không đọc được thì 404', async () => {
    const s = (current = setup({ sessionQuery: log() }))
    await s.ready
    const run = await s.get('?result=s-run')
    expect(run.body).toMatchObject({ status: 'running', title: 'Tên phiên' })
    expect((await s.get('?result=a/b')).status).toBe(400)
    expect((await s.get('?result=')).status).toBe(400)
    const none = (current = setup({
      sessionQuery: {
        observeSession: async () => {
          throw new Error('không có')
        },
      },
    }))
    await none.ready
    expect((await none.get('?result=s-x')).status).toBe(404)
  })

  it('phát lại với text=full giữ đủ chữ tin trợ lý, mặc định vẫn cắt', async () => {
    const long = 'Dài. '.repeat(2000)
    const s = (current = setup({
      sessionQuery: {
        observeSession: async () => ({
          events: [
            {
              type: 'assistant/message',
              time: 1,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: 'assistant',
                  content: [{ type: 'text', text: long }],
                  source: { kind: 'model' },
                },
              },
            },
          ],
          [Symbol.dispose]() {},
        }),
        readTitleSnapshots: async () => [],
      },
    }))
    await s.ready
    const cut = (await s.get('?replay=s-1')).body.steps[0] as Rec
    expect(cut.bodyFull).toBe(false)
    const full = (await s.get('?replay=s-1&text=full')).body.steps[0] as Rec
    expect(full).toMatchObject({ bodyFull: true, body: long })
  })
})
