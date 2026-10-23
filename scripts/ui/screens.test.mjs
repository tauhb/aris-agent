import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES } from '../../packages/aris-ui-pages/src/client/routes.ts'
import { repoRoot } from '../paths.mjs'
import { SCREENS } from './screens.mjs'

const canvas = join(repoRoot, 'design/canvas')

describe('danh sách màn đối chiếu (G6)', () => {
  it('đủ 36 màn, mã không trùng', () => {
    expect(SCREENS).toHaveLength(36)
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(36)
  })

  it('mỗi màn trỏ tới một bảng có trong canvas', () => {
    const boards = JSON.parse(readFileSync(join(canvas, 'canvas.json'), 'utf8')).boards
    for (const s of SCREENS) {
      expect(existsSync(join(canvas, s.canvas)), s.canvas).toBe(true)
      expect(boards[s.canvas], s.canvas).toBeDefined()
    }
  })

  it('bước mở màn trong app dùng trang có thật, màn chưa có thì ghi giai đoạn', () => {
    for (const s of SCREENS) {
      if (s.app === null) expect(s.why, s.id).toBeTruthy()
      else if (s.app.go) expect(ROUTES, s.id).toHaveProperty(s.app.go[0])
    }
  })
})
