import { describe, expect, it } from 'vitest'
import type { BotData, ExternalData, PendingApproval, TeamLive, TeamView } from '@aris/ui-kit/react'
import {
  commanderDesk,
  deptCards,
  deskGroups,
  feedFor,
  looseBots,
  modelLabel,
  needsYou,
  officeSummary,
  sceneOf,
  taskOf,
  withWaiting,
  type Desk,
  type FeedItem,
} from './model.js'
import { termLine } from './Desk.js'
import { pillOf, waitingFeed } from './feedModel.js'

// Bộ dịch giả: ghép khoá và tham số để thấy đúng chữ nào được chọn.
const t = (key: string, p: Record<string, unknown> = {}) => {
  const table: Record<string, string> = {
    'of.sum.need': '{n} việc chờ',
    'of.sum.working': '{names} đang làm',
    'of.sum.rest': '{name} nghỉ từ {time}',
    'of.sum.and': ' với ',
    'of.sum.calm': 'rảnh',
    'of.sum.empty': 'trống',
  }
  return (table[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(p[k]))
}

const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime()
const NOW = at(10, 47)

describe('officeSummary', () => {
  const bots = [
    { name: 'Lâm', status: 'working' as const, since: at(10, 0) },
    { name: 'Hạ', status: 'working' as const, since: at(10, 5) },
    { name: 'Mai', status: 'waiting' as const, since: at(10, 30) },
    { name: 'Tín', status: 'idle' as const, since: at(8, 12) },
  ]

  it('việc chờ, ai đang làm, ai nghỉ từ lúc nào', () => {
    expect(officeSummary({ need: 2, bots, t, now: NOW })).toBe(
      '2 việc chờ Lâm với Hạ đang làm, Tín nghỉ từ 08:12.',
    )
  })

  it('không ai chờ thì bỏ vế đầu; ba người làm thì dùng dấu phẩy rồi "với"', () => {
    const three = [
      { name: 'A', status: 'working' as const, since: 0 },
      { name: 'B', status: 'working' as const, since: 0 },
      { name: 'C', status: 'working' as const, since: 0 },
    ]
    expect(officeSummary({ need: 0, bots: three, t, now: NOW })).toBe('A, B với C đang làm.')
  })

  it('chỉ nhắc tối đa hai bot nghỉ, nghỉ lâu nhất trước; bỏ bot chưa biết giờ hay nghỉ từ hôm qua', () => {
    const rest = [
      { name: 'X', status: 'idle' as const, since: at(9) },
      { name: 'Y', status: 'idle' as const, since: at(7) },
      { name: 'Z', status: 'idle' as const, since: at(8) },
      { name: 'U', status: 'idle' as const, since: 0 },
      { name: 'V', status: 'idle' as const, since: at(7) - 86_400_000 },
    ]
    expect(officeSummary({ need: 0, bots: rest, t, now: NOW })).toBe('Y nghỉ từ 07:00, Z nghỉ từ 08:00.')
  })

  it('cả đội rảnh mà không rõ giờ, và đội trống', () => {
    expect(officeSummary({ need: 0, bots: [{ name: 'U', status: 'idle', since: 0 }], t, now: NOW })).toBe(
      'rảnh',
    )
    expect(officeSummary({ need: 1, bots: [{ name: 'U', status: 'idle', since: 0 }], t, now: NOW })).toBe(
      '1 việc chờ',
    )
    expect(officeSummary({ need: 0, bots: [], t, now: NOW })).toBe('trống')
  })
})

describe('sceneOf', () => {
  it('đang làm, đợi, còn lại là nghỉ', () => {
    expect(sceneOf('working')).toBe('work')
    expect(sceneOf('waiting')).toBe('wait')
    for (const s of ['idle', 'done', 'failed'] as const) expect(sceneOf(s)).toBe('idle')
  })
})

const member = (id: string, status: TeamView['commander']['status'], role = 'vai') => ({
  id,
  name: id.toUpperCase(),
  role,
  note: '',
  status,
  mascot: id,
})
const bot = (id: string, extra: Partial<BotData> = {}): BotData => ({
  id,
  kind: 'member',
  handle: id,
  name: id.toUpperCase(),
  role: 'vai',
  description: '',
  soul: '',
  mascot: id,
  createdAt: '',
  ...extra,
})

const team = {
  ready: true,
  commander: member('aris', 'working', 'Chỉ huy'),
  groups: [
    {
      id: 'tt',
      label: 'Tăng trưởng',
      lead: 'lam',
      members: [member('lam', 'working'), member('ha', 'idle')],
    },
    { id: 'vh', label: 'Vận hành', lead: 'mai', members: [member('mai', 'waiting')] },
    { id: 'kt', label: 'Kỹ thuật', lead: '', members: [] },
    { id: '', label: 'Chưa vào phòng', lead: '', members: [member('khach', 'done')] },
  ],
  members: [],
  bots: [
    bot('lam', { model: { provider: 'ds', model: 'flash' } }),
    bot('ha'),
    bot('mai'),
    bot('khach', { external: { agent: 'codex' } as ExternalData }),
  ],
  departments: [
    {
      id: 'tt',
      name: 'Tăng trưởng',
      about: 'Nội dung',
      order: 0,
      policy: {
        budgetUsd: 2,
        model: { provider: 'ds', model: 'pro' },
        onBudget: 'stop',
        web: true,
        write: true,
        shell: false,
      },
    },
    { id: 'vh', name: 'Vận hành', order: 1 },
  ],
  templates: [],
  catalog: [
    {
      id: 'ds',
      name: 'DeepSeek',
      models: [
        { id: 'flash', name: 'V4 Flash' },
        { id: 'pro', name: 'V4 Pro' },
      ],
    },
  ],
  roles: [],
  owner: {},
  spend: {},
  mcp: [],
} as unknown as TeamView

const live: TeamLive = {
  status: {
    lam: { status: 'working', task: 'So 3 đối thủ', since: at(9), running: 1, sessions: ['s1'] },
    ha: { status: 'idle', since: at(8, 12), running: 0, sessions: [] },
    mai: { status: 'waiting', since: at(10, 30), running: 1, sessions: ['s2'] },
  },
  activity: [],
  titles: { s2: 'Gửi email báo giá' },
}

describe('bàn làm việc', () => {
  it('việc: việc được giao, không có thì tên phiên, không có gì thì trống', () => {
    expect(taskOf(live, 'lam')).toBe('So 3 đối thủ')
    expect(taskOf(live, 'mai')).toBe('Gửi email báo giá')
    expect(taskOf(live, 'ha')).toBe('')
    expect(taskOf(null, 'lam')).toBe('')
  })

  it('gom theo phòng, bỏ phòng không có bot, đếm đang làm và chờ', () => {
    const groups = deskGroups(team, live)
    expect(groups.map((g) => g.id)).toEqual(['tt', 'vh', ''])
    expect(groups[0]).toMatchObject({ working: 1, waiting: 0 })
    expect(groups[1]).toMatchObject({ working: 0, waiting: 1 })
    const lam = groups[0]!.desks[0]!
    expect(lam).toMatchObject({ scene: 'work', task: 'So 3 đối thủ', model: 'V4 Flash', since: at(9) })
    expect(groups[0]!.desks[1]).toMatchObject({ scene: 'idle', model: '' })
    expect(groups[2]!.desks[0]).toMatchObject({ scene: 'idle', external: true })
  })

  it('bàn của Aris', () => {
    expect(commanderDesk(team, live)).toMatchObject({ id: 'aris', scene: 'work', role: 'Chỉ huy' })
  })
})

describe('modelLabel', () => {
  it('tên theo danh mục, chưa có thì mã, không đặt thì trống', () => {
    expect(modelLabel(team.catalog, { provider: 'ds', model: 'pro' })).toBe('V4 Pro')
    expect(modelLabel(team.catalog, { provider: 'x', model: 'raw' })).toBe('raw')
    expect(modelLabel(team.catalog, undefined)).toBe('')
  })
})

describe('needsYou', () => {
  const approval = {
    id: 'a1',
    bot: 'mai',
    name: 'MAI',
    kind: 'run',
    target: 'curl x',
    source: 'member',
    run: 'member:s2',
    at: '',
  } as unknown as PendingApproval

  it('yêu cầu quyền, và bot đang đợi mà không có yêu cầu quyền là câu hỏi', () => {
    const asking: TeamLive = {
      ...live,
      status: {
        ...live.status,
        lam: { status: 'waiting', since: 1, running: 1, sessions: ['s9'] },
      },
    }
    const out = needsYou([approval], asking, team.bots)
    expect(out).toEqual([
      { kind: 'approval', id: 'a1', bot: 'mai', name: 'MAI', action: 'run', target: 'curl x' },
      { kind: 'question', bot: 'lam', name: 'LAM', session: 's9' },
    ])
  })

  it('bot đã có yêu cầu quyền không bị đếm hai lần; bot ngoài không có câu hỏi', () => {
    expect(needsYou([approval], live, team.bots)).toHaveLength(1)
    const ext: TeamLive = {
      ...live,
      status: { khach: { status: 'waiting', since: 1, running: 1, sessions: ['r1'] } },
    }
    expect(needsYou([], ext, team.bots)).toEqual([])
    expect(needsYou([], null, team.bots)).toEqual([])
  })
})

describe('deptCards', () => {
  it('thành viên, đếm trạng thái, chi tiêu so với ngân sách, model mặc định', () => {
    const cards = deptCards(team, { tt: 0.5, vh: 3 })
    expect(cards[0]).toMatchObject({
      id: 'tt',
      about: 'Nội dung',
      working: 1,
      waiting: 0,
      spent: 0.5,
      cap: 2,
      pct: 25,
      model: 'V4 Pro',
    })
    expect(cards[0]!.members.map((m) => m.id)).toEqual(['lam', 'ha'])
    // Không đặt ngân sách: không có thanh, không chia cho 0.
    expect(cards[1]).toMatchObject({ cap: null, pct: 0, spent: 3, waiting: 1, model: '' })
  })

  it('vượt ngân sách thì thanh dừng ở 100', () => {
    expect(deptCards(team, { tt: 9 })[0]!.pct).toBe(100)
  })

  it('chưa vào phòng: Aris đứng đầu, rồi các bot chưa có phòng', () => {
    expect(looseBots(team).map((b) => b.id)).toEqual(['aris', 'khach'])
  })
})

describe('feedFor', () => {
  const feed: FeedItem[] = [
    { at: 3, bot: 'lam', kind: 'done', tone: 'ok', what: 'a' },
    { at: 2, bot: 'mai', kind: 'asked', tone: 'warn', what: 'b' },
    { at: 1, bot: 'lam', kind: 'failed', tone: 'bad', what: 'c' },
  ]
  it('lọc theo bot của phòng; không lọc thì giữ nguyên', () => {
    expect(feedFor(feed, new Set(['lam'])).map((f) => f.what)).toEqual(['a', 'c'])
    expect(feedFor(feed, null)).toHaveLength(3)
    expect(feedFor(feed, new Set())).toEqual([])
  })
})

describe('mục tiêu đang chờ trong Văn phòng', () => {
  const desk: Desk = {
    id: 'khoa',
    name: 'Khoa',
    role: 'Kỹ thuật',
    mascot: 'khoa',
    status: 'idle',
    scene: 'idle',
    task: '',
    since: at(10, 0),
    model: '',
    external: false,
  }
  const waits = [
    { bot: 'khoa', sessionId: 's1', for: 'CI cũ', until: at(10, 30), at: at(9, 0) },
    { bot: 'khoa', sessionId: 's2', for: 'CI của PR 212', until: at(10, 52), at: at(10, 46) },
    { bot: 'mai', sessionId: 's3', for: 'email', until: at(11, 0), at: at(10, 0) },
  ]

  it('gắn mục tiêu chờ mới nhất của đúng bot, bot khác để nguyên', () => {
    expect(withWaiting(desk, waits).waiting).toEqual({ for: 'CI của PR 212', until: at(10, 52) })
    expect(withWaiting({ ...desk, id: 'tin' }, waits)).toEqual({ ...desk, id: 'tin' })
  })

  it('dòng terminal nói đang chờ gì; đang đợi anh duyệt thì giữ chữ duyệt', () => {
    expect(termLine(withWaiting(desk, waits), t)).toBe('⏳ of.term.waitGoal')
    expect(termLine({ ...withWaiting(desk, waits), status: 'waiting', scene: 'wait' }, t)).toBe(
      'of.term.waiting',
    )
  })

  it('nhật ký có dòng Đang chờ, pill màu cam', () => {
    const [first] = waitingFeed(waits)
    expect(first).toMatchObject({ bot: 'khoa', kind: 'waiting', tone: 'warn', what: 'CI cũ', session: 's1' })
    expect(pillOf(first!)).toEqual({ tone: 'warn', key: 'of.feed.k.waiting' })
  })
})
