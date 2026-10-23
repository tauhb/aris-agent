import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply, buildGreeting, Config, HELLO_RECORD, SECTION_ORDER, sectionText } from './index.js'

interface Registered {
  name: string
  execute: (args: { name: string }, exec: unknown) => Promise<string>
}

function fakeContext() {
  const sections: { name: string; order: number; text: unknown }[] = []
  const tools: Registered[] = []
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    systemPrompt: { section: (s: (typeof sections)[number]) => (sections.push(s), () => {}) },
    tools: { register: (t: Registered) => (tools.push(t), () => {}) },
  }
  return { ctx: ctx as unknown as Context, sections, tools }
}

describe('buildGreeting', () => {
  it('thay {name} bằng tên', () => {
    expect(buildGreeting('Xin chào {name}!', 'Tầu')).toBe('Xin chào Tầu!')
  })
  it('dùng "bạn" khi tên rỗng', () => {
    expect(buildGreeting('Chào {name}', '  ')).toBe('Chào bạn')
  })
})

describe('Config', () => {
  it('có giá trị mặc định', () => {
    expect(Config({})).toEqual({ greeting: 'Xin chào {name}, aris đây!', toolName: 'aris_hello' })
  })
})

describe('apply', () => {
  it('đăng ký một đoạn prompt và một tool', () => {
    const { ctx, sections, tools } = fakeContext()
    apply(ctx, Config({}))
    expect(sections).toEqual([{ name: 'aris:hello', order: SECTION_ORDER, text: sectionText('aris_hello') }])
    expect(tools.map((t) => t.name)).toEqual(['aris_hello'])
  })

  it('tool trả lời chào và ghi bản ghi vào log phiên', async () => {
    const { ctx, tools } = fakeContext()
    apply(ctx, Config({ greeting: 'Chào {name}' }))
    const session = Session.create(SessionId('aris-hello-test'))
    const out = await tools[0]!.execute({ name: 'Mai' }, { agent: { session } })
    expect(out).toBe('Chào Mai')
    const records = session
      .ownEvents()
      .map(pluginRecordOf)
      .filter((r) => r !== undefined)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: HELLO_RECORD, data: { name: 'Mai', greeting: 'Chào Mai' } })
  })

  it('tool vẫn chạy khi không có phiên', async () => {
    const { ctx, tools } = fakeContext()
    apply(ctx, Config({}))
    await expect(tools[0]!.execute({ name: 'Lâm' }, {})).resolves.toBe('Xin chào Lâm, aris đây!')
  })
})
