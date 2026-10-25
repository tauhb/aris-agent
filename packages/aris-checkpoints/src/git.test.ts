import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ShadowStore } from './git.js'
import { mutates, toPrune, tooBroad } from './rules.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
const temp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'aris-cp-'))
  dirs.push(d)
  return d
}

describe('kho git ẩn', () => {
  it('chụp, không đổi thì không chụp lại, xem khác biệt, khôi phục cả thư mục và một tệp', async () => {
    const root = await temp()
    const work = await temp()
    const s = new ShadowStore(root)
    await writeFile(join(work, 'a.txt'), 'một\n')
    await writeFile(join(work, 'b.txt'), 'hai\n')
    await mkdir(join(work, 'node_modules'))
    await writeFile(join(work, 'node_modules', 'x.js'), 'bỏ qua')
    const c1 = await s.snapshot(work, 'trước khi sửa')
    expect(c1).toMatch(/^[0-9a-f]{40}$/)
    expect(await s.snapshot(work, 'lại', c1)).toBeUndefined()

    await writeFile(join(work, 'a.txt'), 'một sửa\n')
    await rm(join(work, 'b.txt'))
    await writeFile(join(work, 'c.txt'), 'mới\n')
    expect((await s.changes(work, c1!)).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'D', path: 'b.txt' },
      { status: 'A', path: 'c.txt' },
    ])
    expect((await s.diff(work, c1!)).patch).toContain('+một sửa')

    expect(await s.restore(work, c1!, 'a.txt')).toBe(1)
    expect(await readFile(join(work, 'a.txt'), 'utf8')).toBe('một\n')
    expect(existsSync(join(work, 'c.txt'))).toBe(true)

    expect(await s.restore(work, c1!)).toBe(2)
    expect(await readFile(join(work, 'b.txt'), 'utf8')).toBe('hai\n')
    expect(existsSync(join(work, 'c.txt'))).toBe(false)
    expect(existsSync(join(work, '.git'))).toBe(false)
    expect(await s.changes(work, c1!)).toEqual([])
  })
})

describe('luật chụp', () => {
  it('công cụ sửa tệp, lệnh không chắc chỉ đọc', () => {
    expect(mutates('write', {})).toBe(true)
    expect(mutates('edit', {})).toBe(true)
    expect(mutates('read', {})).toBe(false)
    expect(mutates('bash', { command: 'ls -la' })).toBe(false)
    expect(mutates('bash', { command: 'rm -rf dist' })).toBe(true)
  })

  it('thư mục quá rộng', () => {
    expect(tooBroad('/', '/Users/a')).toBe(true)
    expect(tooBroad('/Users/a', '/Users/a')).toBe(true)
    expect(tooBroad('/Users', '/Users/a')).toBe(true)
    expect(tooBroad('/Users/a/du-an', '/Users/a')).toBe(false)
  })

  it('dọn: quá 7 ngày hoặc ngoài 20 điểm mới nhất mỗi thư mục', () => {
    const now = new Date('2026-10-25T00:00:00Z')
    const pts = [
      ...Array.from({ length: 22 }, (_, i) => ({
        id: `p${i}`,
        dir: '/d',
        at: new Date(now.getTime() - i * 60_000).toISOString(),
      })),
      { id: 'old', dir: '/e', at: '2026-10-10T00:00:00Z' },
    ]
    expect(toPrune(pts, now).map((p) => p.id)).toEqual(['p20', 'p21', 'old'])
  })
})
