import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { CONTEXT_ORDER, MEMORY_OP_RECORD, apply, type MemoryItem } from './index.js'

interface Tool {
  name: string
  execute: (args: Record<string, string>, exec: unknown) => Promise<string>
}

function fakeContext(services: Record<string, unknown> = {}) {
  const contexts: { name: string; order: number; text: () => string }[] = []
  const sections: { name: string }[] = []
  const tools: Tool[] = []
  const map = new Map<string, MemoryItem>()
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    inject: () => {},
    on: () => {},
    logger: () => ({ warn: () => {}, info: () => {} }),
    get: (name: string) => services[name],
    systemPrompt: {
      section: (s: { name: string }) => (sections.push(s), () => {}),
      context: (c: (typeof contexts)[number]) => (contexts.push(c), () => {}),
    },
    tools: { register: (t: Tool) => (tools.push(t), () => {}) },
    provide: () => {},
    storageDomain: {
      open: async () => ({
        close: async () => {},
        table: () => ({
          get: (k: string) => map.get(k),
          entries: () => map.entries(),
          put: async (k: string, v: MemoryItem) => void map.set(k, v),
        }),
      }),
    },
  }
  return { ctx: ctx as unknown as Context, contexts, sections, tools, map }
}

describe('aris-memory', () => {
  it('lưu bằng tool thì ký ức có ngay trong ngữ cảnh động và có bản ghi trong log phiên', async () => {
    const { ctx, contexts, tools, sections, map } = fakeContext()
    await apply(ctx)
    expect(sections.map((s) => s.name)).toEqual(['aris:memory-guide'])
    expect(contexts[0]).toMatchObject({ name: 'aris:memory', order: CONTEXT_ORDER })
    expect(contexts[0]!.text()).toBe('')

    const session = Session.create(SessionId('aris-memory-test'))
    const memory = tools.find((t) => t.name === 'memory')!
    const out = await memory.execute(
      {
        action: 'save',
        text: 'Họp team marketing ưu tiên chiều thứ 5',
        book: 'owner',
        tier: 'core',
        kind: 'preference',
        origin: 'user',
      },
      { agent: { session } },
    )
    expect(out).toMatch(/^Đã lưu \[m-/)
    expect(contexts[0]!.text()).toContain('chiều thứ 5')
    const records = session
      .ownEvents()
      .map(pluginRecordOf)
      .filter((r) => r !== undefined)
    expect(records[0]).toMatchObject({
      type: MEMORY_OP_RECORD,
      data: { op: 'save', book: 'owner', tier: 'core' },
    })

    expect(await memory.execute({ action: 'search', query: 'hop marketing' }, {})).toContain('chiều thứ 5')
    // Điều bot suy ra hay lấy từ nguồn ngoài chỉ thành đề xuất chờ duyệt; nguồn ngoài không lên lõi.
    expect(
      await memory.execute(
        { action: 'save', text: 'Giá vàng hôm nay tăng', tier: 'core', origin: 'external' },
        {},
      ),
    ).toMatch(/^Đã gửi đề xuất ký ức/)
    const pending = [...map.values()].filter((m) => m.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ tier: 'archive', trust: 'external', proposal: { via: 'tool' } })
    expect(contexts[0]!.text()).not.toContain('Giá vàng')
  })
})

describe('đợt 7f · S5: origin=user chỉ tin trong chat trực tiếp của người dùng', () => {
  const save = (origin: string, text = 'Người dùng thích báo cáo ngắn') => ({
    action: 'save',
    text,
    book: 'owner',
    tier: 'core',
    kind: 'preference',
    origin,
  })

  it.each([
    ['routine', { arisRoutine: { isRoutine: (id: string) => id === 'phien-test' } }],
    ['Thủ thư', { arisBrain: { isLibrarian: (id: string) => id === 'phien-test' } }],
    ['kiểm thử skill', { arisSkills: { isEval: (id: string) => id === 'phien-test' } }],
    ['khách ACP', { arisAcp: { isGuest: (id: string) => id === 'phien-test' } }],
    [
      'việc được giao',
      { arisBots: { botOf: () => ({ id: 'commander' }), store: { tagOf: () => ({ via: 'dispatch' }) } } },
    ],
    [
      'thành viên đội',
      { arisBots: { botOf: () => ({ id: 'commander' }), store: { tagOf: () => ({ via: 'team' }) } } },
    ],
    ['Telegram không phải chủ', { arisChannels: { restricted: (id: string) => id === 'phien-test' } }],
  ])(
    'phiên %s: save origin=user thành đề xuất chờ duyệt; update, forget bị từ chối',
    async (_name, services) => {
      const { ctx, tools, map } = fakeContext(services)
      await apply(ctx)
      const memory = tools.find((t) => t.name === 'memory')!
      const session = Session.create(SessionId('phien-test'))
      const out = await memory.execute(save('user'), { agent: { session } })
      expect(out).toMatch(/^Đã gửi đề xuất ký ức/)
      const items = [...map.values()]
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ status: 'pending', trust: 'agent-inferred' })
      const id = items[0]!.id
      expect(await memory.execute({ action: 'update', id, text: 'sửa lén' }, { agent: { session } })).toMatch(
        /^Không làm được: phiên này không phải chat trực tiếp/,
      )
      expect(await memory.execute({ action: 'forget', id }, { agent: { session } })).toMatch(
        /^Không làm được: phiên này không phải chat trực tiếp/,
      )
      expect([...map.values()][0]!.text).toBe('Người dùng thích báo cáo ngắn')
    },
  )

  it('chat trực tiếp của người dùng: origin=user vẫn lưu ngay, sửa và quên được', async () => {
    const { ctx, tools, map } = fakeContext({
      arisRoutine: { isRoutine: () => false },
      arisBots: { botOf: () => ({ id: 'commander' }), store: { tagOf: () => undefined } },
      arisChannels: { restricted: () => false },
    })
    await apply(ctx)
    const memory = tools.find((t) => t.name === 'memory')!
    const session = Session.create(SessionId('chat-truc-tiep'))
    expect(await memory.execute(save('user'), { agent: { session } })).toMatch(/^Đã lưu \[m-/)
    const id = [...map.values()][0]!.id
    expect(
      await memory.execute(
        { action: 'update', id, text: 'Người dùng thích báo cáo dài' },
        { agent: { session } },
      ),
    ).toMatch(/^Đã sửa/)
    expect(await memory.execute({ action: 'forget', id }, { agent: { session } })).toMatch(/^Đã quên/)
  })
})
