import { describe, expect, it } from 'vitest'
import { handleApi, type ApiDeps, type WorkspaceLike } from './api.js'
import { renderProject, type BotLike } from './context.js'
import type { ProjectRecord } from './domain.js'
import { expandPath, isProjectPath } from './index.js'
import { cleanRules, DEFAULT_RULES, ProjectStore } from './store.js'
import { memTable } from './testing.js'

const BOTS: BotLike[] = [
  { id: 'aris', kind: 'commander', handle: 'aris', name: 'Aris', role: 'Chỉ huy' },
  { id: 'b-1', kind: 'member', handle: 'minh', name: 'Minh', role: 'Nghiên cứu' },
  { id: 'b-2', kind: 'member', handle: 'tho', name: 'Thơ', role: 'Nội dung' },
]
const store = () =>
  new ProjectStore(
    memTable<ProjectRecord>(),
    (id) => BOTS.some((b) => b.id === id && b.kind === 'member'),
    () => new Date(Date.UTC(2026, 9, 24)),
  )

describe('kho dự án', () => {
  it('tạo, sửa từng phần; thành viên chỉ là bot thường có thật, không trùng; Aris không là thành viên', async () => {
    const s = store()
    const p = await s.upsert('ws-1', {
      name: ' Ra mắt khoá học ',
      goal: 'Bán 100 suất',
      members: ['b-1', 'aris', 'x', 'b-1'],
    })
    expect(p).toMatchObject({
      name: 'Ra mắt khoá học',
      goal: 'Bán 100 suất',
      members: ['b-1'],
      rules: DEFAULT_RULES,
    })
    const q = await s.upsert('ws-1', { members: ['b-1', 'b-2'], rules: { maxRounds: 5 } })
    expect(q).toMatchObject({ name: 'Ra mắt khoá học', goal: 'Bán 100 suất', members: ['b-1', 'b-2'] })
    expect(q.rules.maxRounds).toBe(5)
    expect((await s.upsert('ws-1', { goal: null })).goal).toBeUndefined()
    await expect(s.upsert('ws-2', {})).rejects.toThrow('cần có tên')
    expect((await s.upsert('ws-2', {}, 'tên thư mục')).name).toBe('tên thư mục')
  })

  it('luật: giữ giá trị cũ khi gửi sai', () => {
    expect(cleanRules({ maxRounds: 0, maxMessages: 31, stopCommand: 'x', arisSummarizes: false })).toEqual({
      ...DEFAULT_RULES,
      arisSummarizes: false,
    })
  })

  it('thư mục dự án: không gồm chỗ chat riêng; ~ mở rộng; đường tương đối bị từ chối', () => {
    expect(isProjectPath('/u/aris/workspace', '/u/aris/workspace')).toBe(false)
    expect(isProjectPath('/u/x/default-workspace/', '/u/aris/workspace')).toBe(false)
    expect(isProjectPath('/u/Projects/khoa-hoc', '/u/aris/workspace')).toBe(true)
    expect(expandPath('~/Projects/a', '/u')).toBe('/u/Projects/a')
    expect(() => expandPath('Projects/a', '/u')).toThrow('đường dẫn đầy đủ')
  })
})

describe('ngữ cảnh dự án', () => {
  const p: ProjectRecord = {
    workspace: 'ws',
    name: 'Kế hoạch quý 4',
    goal: 'Ba mục tiêu cho kênh YouTube',
    members: ['b-1', 'gone'],
    rules: DEFAULT_RULES,
    createdAt: '',
  }
  it('Aris biết mục tiêu, thành viên, luật và cách giao việc trong dự án', () => {
    const t = renderProject(p, BOTS[0]!, BOTS, '/u/Projects/q4')
    expect(t).toContain('dự án «Kế hoạch quý 4»')
    expect(t).toContain('Mục tiêu: Ba mục tiêu cho kênh YouTube')
    expect(t).toContain('@minh (Minh, Nghiên cứu)')
    expect(t).not.toContain('gone')
    expect(t).toContain('hỏi người dùng trước khi giao')
    expect(t).toContain('tối đa 3 vòng')
  })
  it('bot thành viên chỉ nhận mục tiêu và đồng đội', () => {
    const t = renderProject(p, BOTS[1]!, BOTS)
    expect(t).toContain('Bạn là thành viên dự án')
    expect(t).not.toContain('Cách làm trong dự án')
  })
})

describe('API dự án', () => {
  const setup = () => {
    const s = store()
    const ws: WorkspaceLike[] = [{ id: 'ws-old', path: '/u/old', title: 'old', sessionIds: ['s-old'] }]
    let n = 0
    const renamed: string[] = []
    const deps: ApiDeps = {
      store: s,
      workspaces: () => ws,
      async createWorkspace(path, name) {
        const found = ws.find((w) => w.path === path)
        if (found) return found
        const w = { id: `ws-${++n}`, path, title: name, sessionIds: [] as string[] }
        ws.push(w)
        return w
      },
      renameWorkspace: async (id, name) => void renamed.push(`${id}:${name}`),
      async newMainSession(id) {
        const sid = `main-${id}-${++n}`
        ;(ws.find((w) => w.id === id)!.sessionIds as string[]).unshift(sid)
        return sid
      },
    }
    const call = (body: unknown) =>
      handleApi(
        deps,
        new Request('http://x/api/aris/projects', { method: 'POST', body: JSON.stringify(body) }),
      ).then((r) => r.json() as Promise<Record<string, unknown>>)
    return { s, ws, renamed, call }
  }

  it('tạo dự án: workspace, hồ sơ, phiên chính; thư mục đã là dự án thì báo', async () => {
    const { s, call } = setup()
    const r = await call({
      op: 'create',
      project: { name: 'Q4', path: '/u/q4', members: ['b-1'], goal: 'g' },
    })
    expect(r.sessionId).toMatch(/^main-ws-1/)
    expect(s.get('ws-1')).toMatchObject({ name: 'Q4', members: ['b-1'], goal: 'g', mainSession: r.sessionId })
    expect((await call({ op: 'create', project: { name: 'Khác', path: '/u/q4' } })).error).toContain(
      'đã là dự án «Q4»',
    )
    expect((await call({ op: 'create', project: { name: '', path: '/u/x' } })).error).toContain('cần có tên')
  })

  it('sửa dự án cũ chưa có hồ sơ; đổi tên thì đổi cả tên workspace; phiên chính mất thì tạo lại', async () => {
    const { s, renamed, call } = setup()
    await call({ op: 'update', workspace: 'ws-old', patch: { members: ['b-2'] } })
    expect(s.get('ws-old')).toMatchObject({ name: 'old', members: ['b-2'] })
    await call({ op: 'update', workspace: 'ws-old', patch: { name: 'Mới' } })
    expect(renamed).toEqual(['ws-old:Mới'])
    const a = await call({ op: 'main', workspace: 'ws-old' })
    const b = await call({ op: 'main', workspace: 'ws-old' })
    expect(a.sessionId).toBe(b.sessionId)
    expect((await call({ op: 'main', workspace: 'nope' })).error).toContain('Không có dự án')
  })
})
