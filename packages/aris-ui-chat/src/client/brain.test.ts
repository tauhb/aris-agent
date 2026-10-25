import { describe, expect, it } from 'vitest'
import { parseSearch } from './Brain.js'
import { findPage, matchPages, summaryOf, type BrainPage } from './brain-data.js'

const pages: BrainPage[] = [
  { name: 'chi-ha', title: 'Chị Hà', path: 'ca-nhan/wiki/nguoi/chi-ha.md', space: 'ca-nhan', layer: 'wiki' },
  {
    name: 'chi-ha',
    title: 'Chị Hà (nguồn)',
    path: 'ca-nhan/nguon/chi-ha.md',
    space: 'ca-nhan',
    layer: 'nguon',
  },
  {
    name: 'kenh-youtube-q4',
    title: 'Kênh YouTube Q4',
    path: 'ca-nhan/wiki/du-an/kenh-youtube-q4.md',
    space: 'ca-nhan',
    layer: 'wiki',
  },
]

describe('bộ não trong chat', () => {
  it('tìm trang theo tên hay tiêu đề, wiki đứng trước', () => {
    expect(findPage(pages, 'chi-ha')?.layer).toBe('wiki')
    expect(findPage(pages, 'kênh youtube q4')?.name).toBe('kenh-youtube-q4')
    expect(findPage(pages, 'ca-nhan/wiki/du-an/kenh-youtube-q4.md')?.name).toBe('kenh-youtube-q4')
    expect(findPage(pages, 'khong-co')).toBeUndefined()
  })
  it('menu @: khớp đầu từ, cần từ 2 chữ', () => {
    expect(matchPages(pages, 'kenh').map((p) => p.name)).toEqual(['kenh-youtube-q4'])
    expect(matchPages(pages, 'you').map((p) => p.name)).toEqual(['kenh-youtube-q4'])
    expect(matchPages(pages, 'k')).toEqual([])
  })
  it('tóm tắt trang và kết quả brain_search', () => {
    expect(summaryOf('---\ntom-tat: "Editor dựng video"\n---\n# Chị Hà\n\nThân trang')).toBe(
      'Editor dựng video',
    )
    expect(summaryOf('# Chị Hà\n\nPhụ trách [[kenh-youtube-q4|kênh]] từ 2025.[^1]')).toBe(
      'Phụ trách kênh từ 2025.',
    )
    const out = parseSearch(
      'Kết quả trong bộ não (2):\n1. [[chi-ha]] · Chị Hà — Cá nhân / wiki / nguoi\n   đoạn trích\n2. [[bao-gia]] · Báo giá — Công ty / nguồn\n   …',
    )
    expect(out).toEqual([
      { name: 'chi-ha', title: 'Chị Hà', where: 'Cá nhân · nguoi', layer: 'wiki' },
      { name: 'bao-gia', title: 'Báo giá', where: 'Công ty', layer: 'nguon' },
    ])
  })
})
