import { describe, expect, it } from 'vitest'
import {
  assignedList,
  assignedTo,
  cleanItems,
  groupImports,
  notAssigned,
  shortSha,
  sourceLabel,
  sourceUrl,
  toggleAssigned,
  type SkillSource,
} from './skill-team.js'

const gh = (importedAt: string, repo = 'anthropics/skills'): SkillSource => ({
  kind: 'github',
  repo,
  sha: 'dbd4588f9e1033efb41dad4bef2f7947c8993d44',
  path: 'skills/pdf',
  importedAt,
})

describe('kho skill của đội ở giao diện', () => {
  it('gán: đúng bot, cả đội, bật hay tắt một bot khi đang gán cả đội', () => {
    expect(assignedTo({ assigned: ['a'] }, 'a')).toBe(true)
    expect(assignedTo({ assigned: ['a'] }, 'b')).toBe(false)
    expect(assignedTo({ assigned: 'all' }, 'z')).toBe(true)
    expect(assignedTo({}, 'a')).toBe(false)
    expect(assignedList('all', ['a', 'b'])).toEqual(['a', 'b'])
    expect(toggleAssigned('all', 'a', false, ['a', 'b', 'c'])).toEqual(['b', 'c'])
    expect(toggleAssigned(['a'], 'b', true, ['a', 'b'])).toEqual(['a', 'b'])
    expect(toggleAssigned(['a', 'b'], 'a', true, ['a', 'b'])).toEqual(['b', 'a'])
    expect(toggleAssigned(undefined, 'a', false, [])).toEqual([])
  })

  it('nhãn và địa chỉ nguồn', () => {
    expect(sourceLabel(gh('x'))).toBe('GitHub · anthropics/skills')
    expect(sourceLabel({ kind: 'claude-code', path: '/x', importedAt: '' })).toBe('Claude Code')
    expect(
      sourceLabel({ kind: 'library', pack: 'ban-hang-cskh', path: 'b/x', importedAt: '' }, 'Kho dựng sẵn'),
    ).toBe('Kho dựng sẵn')
    expect(sourceLabel({ kind: 'folder', path: '/Users/a/skills/pdf', importedAt: '' })).toBe('pdf')
    expect(sourceLabel(null)).toBe('')
    expect(shortSha(gh('x').sha)).toBe('dbd4588')
    expect(sourceUrl(gh('x'))).toBe(
      'https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/pdf',
    )
    expect(sourceUrl({ kind: 'codex', path: '/x', importedAt: '' })).toBeUndefined()
  })

  it('gom bản chờ duyệt theo lần nhập, bản của vòng học giữ nguyên', () => {
    const a = { id: '1', by: 'import', source: gh('T1'), at: '1' }
    const b = { id: '2', by: 'import', source: gh('T1'), at: '1' }
    const c = { id: '3', by: 'import', source: gh('T2'), at: '2' }
    const d = { id: '4', by: 'import', source: gh('T1', 'khac/repo'), at: '3' }
    const e = { id: '5', by: 'reflect', at: '4' }
    const { groups, rest } = groupImports([a, b, c, d, e])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['1', '2'], ['3'], ['4']])
    expect(rest.map((r) => r.id)).toEqual(['5'])
  })

  it('bản không cảnh báo đỏ và skill của đội chưa gán cho bot', () => {
    expect(cleanItems([{ risks: [] }, { risks: ['x'] }, {}]).length).toBe(2)
    const rows = [
      { bot: '_doi', name: 'a', assigned: ['k'] as string[] },
      { bot: '_doi', name: 'b', assigned: ['m'] as string[] },
      { bot: 'k', name: 'c' },
    ]
    expect(notAssigned(rows, 'k').map((r) => r.name)).toEqual(['b'])
  })
})
