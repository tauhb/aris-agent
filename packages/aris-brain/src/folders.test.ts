import { describe, expect, it } from 'vitest'
import type { Entry } from './catalog.js'
import { brainFolders } from './folders.js'

const e = (path: string, over: Partial<Entry> = {}): Entry => ({
  path,
  name: path.split('/').at(-1)!.replace(/\.md$/, ''),
  space: 'cong-ty',
  layer: 'wiki',
  title: path,
  tags: [],
  depts: [],
  binary: false,
  size: 1,
  mtime: 0,
  ...over,
})

describe('thư mục bộ não làm nguồn', () => {
  it('cây thư mục từ cấp dưới không gian, đếm cả trang trong thư mục con; bỏ tệp gốc, mục lục, ngoài không gian', () => {
    expect(
      brainFolders([
        e('cong-ty/wiki/san-pham/khoa-ai.md'),
        e('cong-ty/wiki/san-pham/gia/bang-gia-2026.md'),
        e('cong-ty/wiki/_muc-luc.md'),
        e('cong-ty/nguon/hop-dong.pdf', { binary: true }),
        e('he-thong/mau.md', { space: undefined }),
      ]),
    ).toEqual([
      { path: 'cong-ty/wiki', title: 'wiki', pages: 2 },
      { path: 'cong-ty/wiki/san-pham', title: 'san-pham', pages: 2 },
      { path: 'cong-ty/wiki/san-pham/gia', title: 'gia', pages: 1 },
    ])
  })
})
