import { describe, expect, it } from 'vitest'
import { DEMO_TEAM, isProjectWorkspace, projectOfSession } from './index.js'

const ws = (workspaceId: string, path: string, sessionIds: string[]) => ({
  workspaceId,
  title: workspaceId,
  path,
  sessionIds,
})

describe('dự án', () => {
  it('workspace mặc định của dsh không phải dự án', () => {
    expect(isProjectWorkspace({ path: '/home/a/.dsh/default-workspace' })).toBe(false)
    expect(isProjectWorkspace({ path: '/home/a/.dsh/default-workspace/' })).toBe(false)
    expect(isProjectWorkspace({ path: 'C:\\Users\\a\\default-workspace' })).toBe(false)
    expect(isProjectWorkspace({ path: '/home/a/Projects/khoa-hoc-ai' })).toBe(true)
  })

  it('tìm dự án chứa phiên', () => {
    const items = [ws('p1', '/x/default-workspace', ['s1']), ws('p2', '/x/khoa-hoc-ai', ['s2', 's3'])]
    expect(projectOfSession(items, 's3')?.workspaceId).toBe('p2')
    expect(projectOfSession(items, 's1')).toBeUndefined()
    expect(projectOfSession(items, 'zzz')).toBeUndefined()
    expect(projectOfSession(items, undefined)).toBeUndefined()
  })

  it('mỗi phòng ban có trưởng nhóm là thành viên của nó', () => {
    for (const g of DEMO_TEAM) expect(g.members.some((m) => m.id === g.lead)).toBe(true)
  })
})
