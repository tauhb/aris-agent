import { describe, expect, it } from 'vitest'
import { bestBySource, chunksOf, excerpt, fuse, VectorStore } from './semantic.js'
import { startSemantic, type EmbedPort } from './semantic-run.js'
import type { Entry } from './catalog.js'

const vec = (...xs: number[]) => {
  const n = Math.hypot(...xs) || 1
  return Float32Array.from(xs.map((x) => x / n))
}

describe('cắt đoạn', () => {
  it('cắt theo mục, gộp mục ngắn, cắt mục quá dài', () => {
    const body = ['# Giá', 'ngắn', '## Nhà in', 'a'.repeat(900), '## Lịch', `${'b '.repeat(1500)}`].join('\n')
    const cs = chunksOf(body)
    expect(cs[0]!.text).toContain('Giá')
    expect(cs.every((c) => c.text.length <= 1800)).toBe(true)
    expect(cs.map((c) => c.ord)).toEqual(cs.map((_, i) => i))
    expect(chunksOf('')).toEqual([])
    expect(chunksOf('# \n\n---')).toEqual([])
  })
  it('đoạn giữ nguyên thì mã băm giữ nguyên', () => {
    expect(chunksOf('# A\nxin chào')[0]!.hash).toBe(chunksOf('# A\nxin chào')[0]!.hash)
  })
})

describe('kho vector', () => {
  it('chỉ đoạn đổi phải nhúng lại; tìm theo cosine; đổi model là nhúng lại', () => {
    const s = new VectorStore()
    s.sync('ca-nhan/a.md', 'page', 'A', [
      { ord: 0, text: 'x', hash: 'h1' },
      { ord: 1, text: 'y', hash: 'h2' },
    ])
    expect(s.pending('m1', 10)).toHaveLength(2)
    s.setVectors('m1', [
      { id: 'ca-nhan/a.md#0', v: vec(1, 0) },
      { id: 'ca-nhan/a.md#1', v: vec(0, 1) },
    ])
    expect(s.pending('m1', 10)).toHaveLength(0)
    expect(s.counts('m1')).toEqual({ total: 2, done: 2 })
    // Sửa đoạn 1, bỏ bớt: đoạn 0 giữ vector.
    expect(s.sync('ca-nhan/a.md', 'page', 'A', [{ ord: 0, text: 'x', hash: 'h1' }])).toBe(0)
    expect(s.counts('m1')).toEqual({ total: 1, done: 1 })
    s.sync('ca-nhan/b.md', 'page', 'B', [{ ord: 0, text: 'z', hash: 'h3' }])
    s.setVectors('m1', [{ id: 'ca-nhan/b.md#0', v: vec(0.6, 0.8) }])
    const hits = s.search('m1', vec(0, 1), () => true)
    expect(hits[0]!.src).toBe('ca-nhan/b.md')
    expect(s.search('m1', vec(0, 1), (src) => src !== 'ca-nhan/b.md').map((h) => h.src)).toEqual([
      'ca-nhan/a.md',
    ])
    expect(s.pending('m2', 10)).toHaveLength(2)
    s.keepOnly('page', new Set(['ca-nhan/a.md']))
    expect(s.counts('m1').total).toBe(1)
  })

  it('gộp thứ hạng ghi nguồn gốc kết quả', () => {
    const r = fuse(['a', 'b'], ['b', 'c'], 5)
    expect(r[0]).toEqual({ id: 'b', via: 'ca-hai' })
    expect(r.find((x) => x.id === 'a')!.via).toBe('tu-khoa')
    expect(r.find((x) => x.id === 'c')!.via).toBe('nghia')
    expect(
      bestBySource([
        { src: 'x', kind: 'page', ord: 0, text: '', score: 0.3 },
        { src: 'y', kind: 'page', ord: 0, text: '', score: 0.7 },
        { src: 'y', kind: 'page', ord: 1, text: '', score: 0.9 },
      ]).map((h) => [h.src, h.ord]),
    ).toEqual([['y', 1]])
    expect(excerpt('## Tiêu đề\n\nmột   hai')).toBe('Tiêu đề một hai')
  })
})

describe('chạy tìm theo nghĩa', () => {
  const entry = (path: string, title: string): Entry => ({
    path,
    name: path.split('/').pop()!.replace(/\.md$/, ''),
    space: 'cong-ty',
    layer: 'wiki',
    title,
    tags: [],
    depts: [],
    binary: false,
    size: 1,
    mtime: 1,
  })
  const pages = [
    { entry: entry('cong-ty/wiki/chung/bao-gia.md', 'Báo giá in T11'), body: 'giá in 1.000 tờ' },
    { entry: entry('cong-ty/wiki/chung/lich.md', 'Lịch quay'), body: 'lịch quay video' },
  ]

  it('nhúng ở nền rồi tìm gộp; không khoá thì chỉ từ khoá', async () => {
    let key = true
    const port: EmbedPort = {
      models: () => [{ provider: 'google', model: 'gemini-embedding-2', dims: 2 }],
      hasKey: async () => key,
      embed: async (r) => r.texts.map((t) => (/giá|in ấn|tiền in/.test(t) ? vec(1, 0) : vec(0, 1))),
    }
    const sem = startSemantic({
      store: new VectorStore(),
      config: () => ({
        model: { provider: 'google', model: 'gemini-embedding-2' },
        scopes: { personal: true, company: true, memory: true },
      }),
      embedder: () => port,
      pages: () => pages,
      page: (p) => pages.find((x) => x.entry.path === p),
      wanted: () => true,
      memories: () => [],
      botName: (id) => id,
      keyword: (q, allow) =>
        q.includes('lịch') ? [{ entry: pages[1]!.entry, snippet: 'lịch' }].filter((h) => allow(h.entry)) : [],
      memoryKeyword: () => [],
      logger: { info: () => undefined, warn: () => undefined },
    })
    try {
      await new Promise((r) => setTimeout(r, 3300))
      expect(sem.status()).toMatchObject({ state: 'ready', done: 2, total: 2 })
      const hits = await sem.searchPages('tiền in tháng sau', () => true, 5)
      expect(hits[0]).toMatchObject({ via: 'nghia' })
      expect(hits[0]!.entry.title).toBe('Báo giá in T11')
      key = false
      sem.changed()
      await new Promise((r) => setTimeout(r, 700))
      expect(sem.status().state).toBe('nokey')
    } finally {
      sem.stop()
    }
  }, 10_000)
})
