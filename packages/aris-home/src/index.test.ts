import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureHome, type Registry } from './index.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

function registry(items: { id: string; path: string }[]) {
  const created: string[] = []
  const r: Registry = {
    list: () => items as never,
    create: async (path) => {
      created.push(path)
      const w = { id: `w-${created.length}`, path }
      items.push(w)
      return w as never
    },
  }
  return { r, created }
}

describe('aris-home', () => {
  it('dùng workspace chat riêng đã đăng ký đúng đường, không dùng workspace mặc định cũ trong Documents', async () => {
    const { r, created } = registry([
      { id: 'proj', path: '/Users/a/code/aris' },
      { id: 'old', path: '/Users/a/Documents/deepseek-harness/default-workspace' },
      { id: 'home', path: '/Users/a/aris/workspace/' },
    ])
    expect(await ensureHome(r, '/Users/a/aris/workspace')).toEqual({
      workspaceId: 'home',
      path: '/Users/a/aris/workspace/',
    })
    expect(created).toEqual([])
  })

  it('chưa có thì tạo thư mục rồi đăng ký', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-home-'))
    dirs.push(root)
    const path = join(root, 'deepseek-harness', 'default-workspace')
    const { r, created } = registry([{ id: 'proj', path: '/Users/a/code/aris' }])
    expect(await ensureHome(r, path)).toEqual({ workspaceId: 'w-1', path })
    expect(created).toEqual([path])
    expect((await stat(path)).isDirectory()).toBe(true)
  })
})
