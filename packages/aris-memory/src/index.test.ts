import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { CONTEXT_ORDER, MEMORY_OP_RECORD, apply, type MemoryItem } from './index.js'

interface Tool {
  name: string
  execute: (args: Record<string, string>, exec: unknown) => Promise<string>
}

function fakeContext() {
  const contexts: { name: string; order: number; text: () => string }[] = []
  const sections: { name: string }[] = []
  const tools: Tool[] = []
  const map = new Map<string, MemoryItem>()
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    inject: () => {},
    on: () => {},
    logger: () => ({ warn: () => {}, info: () => {} }),
    systemPrompt: {
      section: (s: { name: string }) => (sections.push(s), () => {}),
      context: (c: (typeof contexts)[number]) => (contexts.push(c), () => {}),
    },
    tools: { register: (t: Tool) => (tools.push(t), () => {}) },
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
  return { ctx: ctx as unknown as Context, contexts, sections, tools }
}

describe('aris-memory', () => {
  it('lưu bằng tool thì ký ức có ngay trong ngữ cảnh động và có bản ghi trong log phiên', async () => {
    const { ctx, contexts, tools, sections } = fakeContext()
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
    expect(await memory.execute({ action: 'save', text: 'x', tier: 'core', origin: 'external' }, {})).toMatch(
      /^Không làm được/,
    )
  })
})
