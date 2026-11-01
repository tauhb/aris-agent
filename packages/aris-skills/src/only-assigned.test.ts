import { describe, expect, it } from 'vitest'
import { SkillStore, TEAM_OWNER, type Table } from './store.js'

const memTable = <V>(): Table<V> => {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  }
}

const skill = (bot: string, name: string) => ({
  bot,
  name,
  description: `Kiểm tra ${name}. Dùng khi người dùng nhờ kiểm tra ${name}.`,
  body: '## Các bước\n1. Đọc\n2. Báo cáo 3 dòng',
  by: 'reflect' as const,
})

describe('công tắc "Chỉ dùng skill được gán"', () => {
  it('bật thì bỏ skill gán cả đội, giữ skill riêng và skill gán đích danh', async () => {
    const only = new Set<string>()
    const store = new SkillStore(memTable(), memTable(), undefined, (bot) => only.has(bot))
    for (const [bot, name] of [
      [TEAM_OWNER, 'chung'],
      [TEAM_OWNER, 'gan-rieng'],
      ['khoa', 'cua-khoa'],
    ] as const) {
      const v = await store.propose(skill(bot, name))
      await store.approve(v!.id, 'user')
    }
    await store.setAssigned(`${TEAM_OWNER}--chung`, 'all')
    await store.setAssigned(`${TEAM_OWNER}--gan-rieng`, ['khoa'])
    const names = () =>
      store
        .activeFor('khoa')
        .map((x) => x.skill.name)
        .sort()
    expect(names()).toEqual(['chung', 'cua-khoa', 'gan-rieng'])
    only.add('khoa')
    expect(names()).toEqual(['cua-khoa', 'gan-rieng'])
    expect(store.resolveFor('khoa', 'chung')).toBeUndefined()
    expect(store.resolveFor('khoa', 'gan-rieng')?.name).toBe('gan-rieng')
    // Bot khác không bật công tắc vẫn dùng skill chung.
    expect(store.activeFor('minh').map((x) => x.skill.name)).toEqual(['chung'])
  })
})
