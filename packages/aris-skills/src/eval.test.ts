import { describe, expect, it } from 'vitest'
import { parseJudge, readOnlyBash, summarize } from './eval.js'
import { SkillStore } from './store.js'

describe('hộp cát chỉ đọc', () => {
  it('cho lệnh đọc, chặn lệnh ghi hay có hiệu ứng', () => {
    for (const ok of [
      'git log --oneline -5',
      'cd /tmp/x && git status',
      'ls -la src | head -20',
      'cat login.js',
      'wc -l *.js',
      `d=/tmp/x; find "$d" -type f -name '*.ts' | wc -l; find "$d" -type f -name '*.ts' -exec cat {} + | wc -l`,
      "find src -name '*.ts' | xargs wc -l",
    ])
      expect(readOnlyBash(ok), ok).toBe(true)
    for (const bad of [
      'node test.js',
      'npm test',
      'rm -rf x',
      'echo hi > a.txt',
      'git commit -am x',
      'cat a | tee b',
      'ls $(pwd)',
      'curl http://x',
      "find . -name '*.ts' -exec rm {} +",
      'find . -delete',
      'find . | xargs rm',
      'X=$(rm -rf a)',
    ])
      expect(readOnlyBash(bad), bad).toBe(false)
  })
})

describe('chấm và tổng hợp', () => {
  it('đọc kết quả chấm', () => {
    expect(parseJudge('```json\n{"pass": true, "note": "đủ 3 dòng"}\n```')).toEqual({
      pass: true,
      note: 'đủ 3 dòng',
    })
    expect(parseJudge('{"pass": "yes"}')).toBeUndefined()
    expect(parseJudge('không')).toBeUndefined()
  })

  it('đạt, số bước và token trung bình, % thay đổi; bỏ ca lỗi', () => {
    const run = (steps: number, tokens: number, pass: boolean) => ({
      session: 's',
      steps,
      tokens,
      answer: '',
      denied: 0,
      pass,
    })
    const s = summarize({
      cases: [
        { request: 'a', base: run(10, 1000, false), cand: run(6, 800, true) },
        { request: 'b', base: run(8, 1000, true), cand: run(6, 600, true) },
        { request: 'c', base: run(5, 100, true), cand: { ...run(0, 0, false), error: 'quá 5 phút' } },
      ],
    })
    expect(s).toMatchObject({
      cases: 2,
      pass: { cand: 2, base: 1 },
      steps: { base: 9, cand: 6, pct: -33 },
      tokens: { pct: -30 },
    })
  })
})

describe('dọn kho và ca thử', () => {
  const setup = () => {
    const t = (m: Map<string, never>) => ({
      get: (k: string) => m.get(k),
      entries: () => m.entries(),
      put: async (k: string, v: never) => void m.set(k, v),
    })
    let clock = new Date('2026-10-01T10:00:00Z')
    const store = new SkillStore(t(new Map()), t(new Map()), () => clock)
    return { store, tick: (d: string) => (clock = new Date(d)) }
  }
  const input = {
    bot: 'aris',
    name: 'kiem-tra-repo',
    description: 'Kiểm tra nhanh một repo',
    body: '## Các bước\n1. git status\n2. Báo cáo 3 dòng',
    by: 'reflect' as const,
    cases: ['Kiểm tra nhanh repo /a giúp anh'],
  }

  it('ca thử từ lúc đề xuất và lúc dùng, bỏ trùng, giữ 5 ca', async () => {
    const { store } = setup()
    const v = await store.propose(input)
    await store.approve(v!.id, 'user')
    for (const r of [
      'Kiểm tra nhanh repo /a giúp anh',
      'repo /b',
      'Kiểm tra repo /c đi',
      'Kiểm tra repo /d đi',
      'Kiểm tra repo /e đi',
      'Kiểm tra repo /f đi',
    ])
      await store.addCase('aris--kiem-tra-repo', { request: r })
    const cases = store.get('aris--kiem-tra-repo')!.cases!.map((c) => c.request)
    expect(cases).toHaveLength(5)
    expect(cases[0]).toBe('Kiểm tra nhanh repo /a giúp anh')
    expect(cases).not.toContain('repo /b')
  })

  it('ít dùng sau 30 ngày, tự cất sau 90 ngày; ghim thì giữ; dùng lại đếm từ đầu', async () => {
    const { store, tick } = setup()
    const v = await store.propose(input)
    await store.approve(v!.id, 'user')
    const id = 'aris--kiem-tra-repo'
    tick('2026-11-24T10:00:00Z')
    expect(store.isStale(store.get(id)!)).toBe(true)
    await store.pin(id, true)
    tick('2027-01-23T10:00:00Z')
    expect((await store.curate()).archive).toEqual([])
    await store.pin(id, false)
    expect((await store.curate()).archive.map((s) => s.id)).toEqual([id])
    expect(store.activeFor('aris')).toHaveLength(0)
    expect(store.get(id)).toMatchObject({ status: 'archived', archivedBy: 'curator' })
    await store.unarchive(id)
    expect(store.activeFor('aris')).toHaveLength(1)
    expect(store.isStale(store.get(id)!)).toBe(false)
    await store.archive(id, 'user')
    expect(store.get(id)?.archivedBy).toBe('user')
    expect(store.backup().skills).toHaveLength(1)
  })
})
