import { describe, expect, it } from 'vitest'
import { handleApi, type MemoryPort } from './api.js'
import { freeHandle, parseBotFile, type PortableMemory } from './portable.js'
import { BotStore } from './store.js'
import { memTables } from './testing.js'

const setup = async () => {
  const store = new BotStore(memTables())
  await store.ensureCommander()
  const notes = new Map<string, PortableMemory[]>()
  const memory: MemoryPort = {
    notesOf: (bot) => notes.get(bot) ?? [],
    importNotes: async (bot, items) => {
      notes.set(bot, [...(notes.get(bot) ?? []), ...items])
      return items.length
    },
  }
  const call = async (body: unknown) => {
    const r = await handleApi(
      { store, templates: async () => [], open: async () => 's', memory: () => memory },
      new Request('http://x/api/aris/bots', { method: 'POST', body: JSON.stringify(body) }),
    )
    return { status: r.status, body: (await r.json()) as Record<string, unknown> }
  }
  return { store, notes, call }
}

describe('nhân bản, xuất, nhập bot', () => {
  it('tên gọi mới từ tên, bỏ dấu, trùng thì thêm số', () => {
    const taken = new Set(['kiet', 'kiet-2'])
    expect(freeHandle('Kiệt', (h) => taken.has(h))).toBe('kiet-3')
    expect(freeHandle('Đức Anh', () => false)).toBe('duc-anh')
    expect(freeHandle('123', () => false)).toBe('bot')
  })

  it('nhân bản chỉ chép phần được chọn, ký ức riêng đi kèm khi chọn', async () => {
    const { store, notes, call } = await setup()
    const d = await store.createDepartment({ name: 'Kỹ thuật' })
    const src = await store.create({
      handle: 'kiet',
      name: 'Kiệt',
      role: 'Lập trình',
      soul: 'Kỹ tính',
      mascot: 'cao',
      model: { provider: 'deepseek', model: 'chat' },
      department: d.id,
    })
    notes.set(src.id, [{ text: 'Dùng pnpm', kind: 'lesson', tier: 'core' }])
    const r = await call({
      op: 'clone',
      id: src.id,
      name: 'Kiệt 2',
      parts: { config: false, soul: true, memory: true },
    })
    expect(r.status).toBe(200)
    const b = store.get(String(r.body.created))!
    expect(b).toMatchObject({
      handle: 'kiet-2',
      name: 'Kiệt 2',
      role: 'Lập trình',
      soul: 'Kỹ tính',
      mascot: 'cao',
    })
    expect(b.model).toBeUndefined()
    expect(b.department).toBeUndefined()
    expect(notes.get(b.id)).toHaveLength(1)
    expect((await call({ op: 'clone', id: 'aris', name: 'X' })).status).toBe(400)
  })

  it('xuất rồi nhập lại: phòng ban theo tên, tên gọi trùng thì đổi, cấu hình bot ngoài giữ nguyên', async () => {
    const { store, notes, call } = await setup()
    const d = await store.createDepartment({ name: 'Kỹ thuật' })
    const src = await store.create({
      handle: 'khoa',
      name: 'Khoa',
      department: d.id,
      external: { agent: 'acp', command: 'gemini --experimental-acp' },
    })
    notes.set(src.id, [{ text: 'Thích ngắn gọn', kind: 'preference', tier: 'archive' }])
    const ex = await call({ op: 'export', id: src.id, parts: { config: true, soul: true, memory: true } })
    const file = ex.body.file as Record<string, unknown>
    expect(file).toMatchObject({ format: 'aris-bot', version: 1, bot: { department: 'Kỹ thuật' } })
    expect(JSON.stringify(file)).not.toContain(src.id)
    const im = await call({ op: 'import', file })
    const b = store.get(String(im.body.created))!
    expect(b.handle).toBe('khoa-2')
    expect(b.department).toBe(d.id)
    expect(b.external).toMatchObject({ agent: 'acp', command: 'gemini', args: ['--experimental-acp'] })
    expect(im.body.memory).toBe(1)
    expect(() => parseBotFile({ format: 'khac' })).toThrow('aris-bot')
    expect((await call({ op: 'import', file: { x: 1 } })).status).toBe(400)
  })
})
