import { describe, expect, it } from 'vitest'
import { lineDiff, diffStat } from './diff.js'
import { skillsApi } from './index.js'
import { lintSkill, skillName } from './lint.js'
import { SkillStore, type SkillEvent } from './store.js'

const BODY = `## Khi nào dùng
Người dùng cần báo cáo doanh thu tuần.

## Các bước
1. Lấy file doanh thu tuần
2. Gộp theo kênh, đơn vị triệu đồng
3. Xuất bảng 3 cột: kênh, doanh thu, tỉ trọng`

const setup = () => {
  const a = new Map()
  const b = new Map()
  let clock = new Date('2026-10-24T10:00:00Z')
  const t = (m: Map<string, never>) => ({
    get: (k: string) => m.get(k),
    entries: () => m.entries(),
    put: async (k: string, v: never) => void m.set(k, v),
  })
  const store = new SkillStore(t(a), t(b), () => clock)
  const events: string[] = []
  store.on((e: SkillEvent) =>
    events.push(
      e.type === 'opened'
        ? `opened v${e.version.version}${e.patch ? ' patch' : ''}`
        : `closed v${e.version.version} ${e.decision} ${e.by}`,
    ),
  )
  return { store, events, tick: (d: string) => (clock = new Date(d)) }
}
const input = {
  bot: 'tin',
  name: 'bao-cao-doanh-thu-tuan',
  description: 'Báo cáo doanh thu tuần theo kênh',
  body: BODY,
  by: 'reflect' as const,
}

describe('bộ kiểm skill', () => {
  it('tên, mô tả, thân; cảnh báo nhật ký, thiếu bước, xưng hô', () => {
    expect(skillName('Báo cáo doanh thu tuần!')).toBe('bao-cao-doanh-thu-tuan')
    expect(lintSkill({ name: 'Bao Cao', description: '', body: '' }).errors).toHaveLength(3)
    expect(lintSkill(input)).toEqual({ errors: [], warnings: [] })
    const diary = lintSkill({
      ...input,
      body: 'Hôm qua bot đã gửi báo cáo 22/10 cho anh. Bot đã sửa cột. Anh muốn thêm cột so sánh.',
    }).warnings
    expect(diary).toHaveLength(4)
  })
})

describe('kho skill', () => {
  it('đề xuất → duyệt → bản vá → khôi phục; mỗi bot chỉ thấy skill của mình', async () => {
    const { store, events } = setup()
    const v1 = await store.propose(input)
    expect(store.activeFor('tin')).toHaveLength(0)
    await store.approve(v1!.id, 'user')
    expect(store.activeFor('tin').map((x) => x.version.version)).toEqual([1])
    expect(store.activeFor('lam')).toHaveLength(0)
    expect(await store.propose(input)).toBeUndefined()
    const patched = BODY.replace(
      '3. Xuất bảng 3 cột: kênh, doanh thu, tỉ trọng',
      '3. Lấy số tuần trước\n4. Xuất bảng 4 cột: kênh, doanh thu, tỉ trọng, so tuần trước',
    )
    const v2 = await store.propose({ ...input, body: patched, why: 'Người dùng thêm cột so sánh' })
    expect(store.get('tin--bao-cao-doanh-thu-tuan')?.version).toBe(1)
    await store.approve(v2!.id, 'telegram')
    expect(store.active('tin--bao-cao-doanh-thu-tuan')?.body).toContain('4 cột')
    expect(store.version(v1!.id)?.status).toBe('superseded')
    const v3 = await store.restore('tin--bao-cao-doanh-thu-tuan', 1)
    expect(v3).toMatchObject({ version: 3, by: 'restore', from: 1 })
    expect(store.active('tin--bao-cao-doanh-thu-tuan')?.body).toBe(BODY)
    expect(events).toEqual([
      'opened v1',
      'closed v1 approved user',
      'opened v2 patch',
      'closed v2 approved telegram',
    ])
    expect(store.reviewedToday()).toBe(2)
  })

  it('đếm skill mới bật và lần khôi phục kể từ một mốc (thống kê)', async () => {
    const { store, tick } = setup()
    const v1 = await store.propose(input)
    await store.approve(v1!.id, 'user')
    const v2 = await store.propose({ ...input, body: `${BODY}\n4. Gửi người dùng` })
    await store.approve(v2!.id, 'user')
    tick('2026-10-25T10:00:00Z')
    await store.restore('tin--bao-cao-doanh-thu-tuan', 1)
    const at = (d: string) => Date.parse(d)
    expect(store.eventsSince(at('2026-10-24T00:00:00Z'))).toEqual({ enabled: 1, rolledBack: 1 })
    expect(store.eventsSince(at('2026-10-25T00:00:00Z'))).toEqual({ enabled: 0, rolledBack: 1 })
    expect(store.eventsSince(at('2026-10-26T00:00:00Z'))).toEqual({ enabled: 0, rolledBack: 0 })
  })

  it('sửa rồi bật kiểm lại; từ chối bản đầu thì skill biến mất; đề xuất mới thay đề xuất cũ; quá hạn tự bỏ', async () => {
    const { store, tick } = setup()
    const v1 = await store.propose(input)
    await expect(store.approve(v1!.id, 'user', '')).rejects.toThrow('rỗng')
    await store.reject(v1!.id, 'user')
    expect(store.list('tin')).toHaveLength(0)
    const a = await store.propose(input)
    const b = await store.propose({ ...input, body: `${BODY}\n4. Gửi người dùng` })
    expect(store.version(a!.id)).toMatchObject({ status: 'rejected', review: { by: 'replaced' } })
    expect(store.pending().map((v) => v.id)).toEqual([b!.id])
    tick('2026-11-01T10:00:01Z')
    expect(await store.expire()).toBe(1)
    expect(store.list('tin')).toHaveLength(0)
  })

  it('đếm lượt dùng của skill đang dùng', async () => {
    const { store } = setup()
    const v = await store.propose(input)
    await store.recordUse('tin', input.name)
    await store.approve(v!.id, 'user')
    await store.recordUse('tin', input.name)
    await store.recordUse('lam', input.name)
    expect(store.get('tin--bao-cao-doanh-thu-tuan')?.uses).toBe(1)
  })

  it('người dọn kho: 30 ngày ít dùng, 90 ngày cất; chạy thử không đổi gì; ghim thì miễn', async () => {
    const { store, tick } = setup()
    const a = await store.propose(input)
    await store.approve(a!.id, 'user')
    const b = await store.propose({ ...input, name: 'tom-tat-email' })
    await store.approve(b!.id, 'user')
    await store.pin('tin--tom-tat-email', true)
    tick('2026-11-24T10:00:00Z')
    expect(store.curatePlan()).toEqual({
      archive: [],
      stale: [{ id: 'tin--bao-cao-doanh-thu-tuan', name: input.name, bot: 'tin', idle: 31 }],
    })
    tick('2027-01-23T10:00:00Z')
    const plan = store.curatePlan()
    expect(plan.archive.map((s) => s.idle)).toEqual([91])
    expect(store.get('tin--bao-cao-doanh-thu-tuan')?.status).toBe('active')
    expect(await store.curate()).toEqual(plan)
    expect(store.get('tin--bao-cao-doanh-thu-tuan')?.status).toBe('archived')
    expect(store.get('tin--tom-tat-email')?.status).toBe('active')
  })
})

describe('so sánh và API', () => {
  it('so sánh dòng', () => {
    const d = lineDiff('a\nb\nc', 'a\nc\nd')
    expect(d).toEqual([
      { kind: ' ', text: 'a' },
      { kind: '-', text: 'b' },
      { kind: ' ', text: 'c' },
      { kind: '+', text: 'd' },
    ])
    expect(diffStat(d)).toEqual({ add: 1, del: 1 })
  })

  it('API: chờ duyệt kèm so sánh, chi tiết, duyệt, khôi phục', async () => {
    const { store } = setup()
    const call = async (q = '', body?: unknown) =>
      (await skillsApi(
        store,
        new Request(
          `http://x/api/aris/skills${q}`,
          body ? { method: 'POST', body: JSON.stringify(body) } : {},
        ),
      ).then((r) => r.json())) as Record<string, unknown>
    const v1 = await store.propose(input)
    const pending = (await call('?pending=all')).pending as { stat: { add: number }; base: number }[]
    expect(pending[0]).toMatchObject({ base: 0, stat: { add: BODY.split('\n').length } })
    expect((await call('', { op: 'approve', id: v1!.id })).ok).toBe(true)
    const v2 = await store.propose({ ...input, body: `${BODY}\n4. Gửi người dùng` })
    const detail = await call('?id=tin--bao-cao-doanh-thu-tuan')
    expect((detail.proposed as { base: number; stat: { add: number; del: number } }).base).toBe(1)
    expect((detail.proposed as { stat: unknown }).stat).toEqual({ add: 1, del: 0 })
    expect((await call('', { op: 'reject', id: v2!.id })).ok).toBe(true)
    expect((await call('', { op: 'reject', id: v2!.id })).error).toContain('đã được trả lời')
    expect((await call('', { op: 'restore', skill: 'tin--bao-cao-doanh-thu-tuan', version: 1 })).ok).toBe(
      true,
    )
    expect(((await call()).skills as unknown[]).length).toBe(1)
  })
})
