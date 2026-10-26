import { describe, expect, it } from 'vitest'
import { SkillStore, TEAM_OWNER, assignedTo, mergeAssigned, skillId, type Table } from './store.js'

const memTable = <V>(): Table<V> => {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  }
}
const BODY = '1. Làm bước một\n2. Làm bước hai'
const base = { description: 'Mô tả', body: BODY, by: 'user' as const }

async function teamSkill(store: SkillStore, name: string, assignOnApprove?: 'all' | string[]) {
  const v = await store.propose({
    ...base,
    bot: TEAM_OWNER,
    name,
    by: 'import',
    ...(assignOnApprove ? { assignOnApprove } : {}),
  })
  await store.approve(v!.id, 'user')
  return skillId(TEAM_OWNER, name)
}

describe('kho skill của đội', () => {
  it('bot chỉ thấy skill của đội đã gán cho mình; chưa gán thì chưa ai dùng được', async () => {
    const store = new SkillStore(memTable(), memTable())
    const id = await teamSkill(store, 'pdf')
    expect(store.get(id)).toMatchObject({ status: 'active', bot: TEAM_OWNER })
    expect(store.activeFor('khoa')).toHaveLength(0)
    await store.assign(id, ['khoa'])
    expect(store.activeFor('khoa').map((x) => x.skill.name)).toEqual(['pdf'])
    expect(store.activeFor('minh')).toHaveLength(0)
    await store.assign(id, ['minh'])
    expect(assignedTo(store.get(id)!, 'minh')).toBe(true)
    expect(store.activeFor('khoa')).toHaveLength(1)
  })

  it('bot chọn lúc nhập được gán ngay khi duyệt, và gộp với bot đã gán trước', async () => {
    const store = new SkillStore(memTable(), memTable())
    const id = await teamSkill(store, 'lich', ['an'])
    expect(store.get(id)!.assigned).toEqual(['an'])
    const v2 = await store.propose({
      ...base,
      bot: TEAM_OWNER,
      name: 'lich',
      by: 'import',
      body: `${BODY}\n3. Bước ba`,
      assignOnApprove: ['thao'],
    })
    await store.approve(v2!.id, 'user')
    expect(store.get(id)!.assigned).toEqual(['an', 'thao'])
  })

  it('gán cả đội: bot tạo sau cũng nhận; bỏ gán một bot cần danh sách bot', async () => {
    const store = new SkillStore(memTable(), memTable())
    const id = await teamSkill(store, 'chung', 'all')
    expect(store.activeFor('bot-moi-tao')).toHaveLength(1)
    await expect(store.unassign(id, 'khoa')).rejects.toThrow(/cả đội/)
    await store.unassign(id, 'khoa', ['khoa', 'minh', 'an'])
    expect(store.get(id)!.assigned).toEqual(['minh', 'an'])
    expect(store.activeFor('khoa')).toHaveLength(0)
    expect(store.activeFor('minh')).toHaveLength(1)
    expect(mergeAssigned(['a'], 'all')).toBe('all')
    expect(mergeAssigned(['a'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('skill riêng của bot thắng skill của đội cùng tên', async () => {
    const store = new SkillStore(memTable(), memTable())
    await teamSkill(store, 'bao-cao', 'all')
    const own = await store.propose({
      ...base,
      bot: 'tin',
      name: 'bao-cao',
      body: '1. Cách riêng của Tín\n2. Xong',
    })
    await store.approve(own!.id, 'user')
    const seen = store.activeFor('tin').filter((x) => x.skill.name === 'bao-cao')
    expect(seen).toHaveLength(1)
    expect(seen[0]!.skill.bot).toBe('tin')
    expect(store.activeFor('minh').find((x) => x.skill.name === 'bao-cao')?.skill.bot).toBe(TEAM_OWNER)
  })

  it('đếm lượt dùng của skill đội theo từng bot; không đếm bot không được gán', async () => {
    const store = new SkillStore(memTable(), memTable())
    const id = await teamSkill(store, 'pdf', ['khoa', 'minh'])
    await store.recordUse('khoa', 'pdf')
    await store.recordUse('khoa', 'pdf')
    await store.recordUse('minh', 'pdf')
    await store.recordUse('an', 'pdf')
    expect(store.get(id)).toMatchObject({ uses: 3, usesBy: { khoa: 2, minh: 1 } })
    expect(store.resolveFor('an', 'pdf')).toBeUndefined()
  })

  it('chia sẻ skill riêng cho đội giữ các bản cũ và gán sẵn cho bot gốc; trả về riêng khi chỉ một bot', async () => {
    const store = new SkillStore(memTable(), memTable())
    const v1 = await store.propose({ ...base, bot: 'tin', name: 'doanh-thu' })
    await store.approve(v1!.id, 'user')
    const v2 = await store.propose({ ...base, bot: 'tin', name: 'doanh-thu', body: `${BODY}\n3. Bước ba` })
    await store.approve(v2!.id, 'user')
    const shared = await store.share('tin--doanh-thu')
    expect(shared).toMatchObject({ id: '_doi--doanh-thu', bot: TEAM_OWNER, assigned: ['tin'], version: 2 })
    expect(store.get('tin--doanh-thu')).toBeUndefined()
    expect(store.versionsOf('_doi--doanh-thu').map((v) => v.version)).toEqual([2, 1])
    expect(store.versionsOf('tin--doanh-thu')).toHaveLength(0)
    expect(store.activeFor('tin').map((x) => x.skill.id)).toEqual(['_doi--doanh-thu'])
    await expect(store.share('_doi--doanh-thu')).rejects.toThrow()

    await store.assign('_doi--doanh-thu', ['minh'])
    await expect(store.unshare('_doi--doanh-thu')).rejects.toThrow(/đúng cho một bot/)
    await store.setAssigned('_doi--doanh-thu', ['tin'])
    const back = await store.unshare('_doi--doanh-thu')
    expect(back).toMatchObject({ id: 'tin--doanh-thu', bot: 'tin', version: 2 })
    expect(back.assigned).toBeUndefined()
    expect(store.versionsOf('tin--doanh-thu').map((v) => v.version)).toEqual([2, 1])
    expect(store.get('_doi--doanh-thu')).toBeUndefined()
  })

  it('không chia sẻ được khi kho đội đã có skill cùng tên; chỉ skill của đội mới gán được', async () => {
    const store = new SkillStore(memTable(), memTable())
    const a = await store.propose({ ...base, bot: 'tin', name: 'x' })
    await store.approve(a!.id, 'user')
    await teamSkill(store, 'x')
    await expect(store.share('tin--x')).rejects.toThrow(/đã có skill tên này/)
    await expect(store.assign('tin--x', ['khoa'])).rejects.toThrow(
      /không phải skill của đội|Chỉ skill của đội/,
    )
  })

  it('skill nhập mà ghi đè lên một skill riêng không chạm skill riêng đó', async () => {
    const store = new SkillStore(memTable(), memTable())
    const own = await store.propose({ ...base, bot: 'tin', name: 'pdf' })
    await store.approve(own!.id, 'user')
    await teamSkill(store, 'pdf', ['tin'])
    expect(store.get('tin--pdf')).toMatchObject({ bot: 'tin', status: 'active' })
    expect(store.get('_doi--pdf')).toMatchObject({ bot: TEAM_OWNER })
  })
})

describe('API /api/aris/skills cho kho đội', async () => {
  const { skillsApi } = await import('./index.js')
  const post = (store: SkillStore, body: unknown, ext?: Parameters<typeof skillsApi>[2]) =>
    skillsApi(
      store,
      new Request('http://x/api/aris/skills', { method: 'POST', body: JSON.stringify(body) }),
      ext,
    )
  const ext = (over: Record<string, unknown> = {}) =>
    ({ allBots: () => ['khoa', 'minh', 'an'], ...over }) as unknown as Parameters<typeof skillsApi>[2]

  it('gán, bỏ gán (cả đội thì trừ bot đó), chia sẻ, trả về riêng', async () => {
    const store = new SkillStore(memTable(), memTable())
    const id = await teamSkill(store, 'pdf')
    expect((await post(store, { op: 'assign', skill: id, bots: ['khoa'] }, ext())).status).toBe(200)
    expect(store.get(id)!.assigned).toEqual(['khoa'])
    await post(store, { op: 'assign', skill: id, bots: 'all' }, ext())
    await post(store, { op: 'unassign', skill: id, bot: 'khoa' }, ext())
    expect(store.get(id)!.assigned).toEqual(['minh', 'an'])
    expect((await post(store, { op: 'assign', skill: id }, ext())).status).toBe(400)
    expect((await post(store, { op: 'assign', skill: 'khong-co', bots: ['a'] }, ext())).status).toBe(409)

    const own = await store.propose({ ...base, bot: 'tin', name: 'rieng' })
    await store.approve(own!.id, 'user')
    expect((await post(store, { op: 'share', skill: 'tin--rieng' }, ext())).status).toBe(200)
    expect(store.get('_doi--rieng')!.assigned).toEqual(['tin'])
    expect((await post(store, { op: 'unshare', skill: '_doi--rieng' }, ext())).status).toBe(200)
    expect(store.get('tin--rieng')).toBeDefined()
  })

  it('quét rồi nhập: trả danh sách kèm skill trùng tên; mã quét hết hạn thì báo lỗi', async () => {
    const store = new SkillStore(memTable(), memTable())
    const own = await store.propose({ ...base, bot: 'tin', name: 'pdf' })
    await store.approve(own!.id, 'user')
    const scan = {
      id: 'scan-1',
      at: Date.now(),
      kind: 'folder' as const,
      label: 'x',
      root: '',
      items: [
        {
          key: 'a',
          name: 'pdf',
          description: 'd',
          dir: '/khong/co',
          rel: 'a',
          files: 0,
          dropped: 0,
          risks: ['r'],
        },
      ],
    }
    const e = ext({
      scan: async () => scan,
      takeScan: (id: string) => {
        if (id !== 'scan-1') throw new (class extends Error {})('Kết quả quét đã hết hạn')
        return scan
      },
      dropScan: async () => undefined,
    })
    const res = await post(store, { op: 'import-scan', source: { kind: 'folder', path: '/x' } }, e)
    const j = (await res.json()) as {
      scanId: string
      items: { name: string; exists: string[]; risks: string[] }[]
    }
    expect(j.scanId).toBe('scan-1')
    expect(j.items[0]).toMatchObject({ name: 'pdf', exists: ['tin'], risks: ['r'] })
    expect((await post(store, { op: 'import', scanId: 'scan-1', keys: [] }, e)).status).toBe(400)
    // Thư mục nguồn không còn: lỗi riêng của skill đó, không làm hỏng cả lượt.
    const done = await post(store, { op: 'import', scanId: 'scan-1', keys: ['a'], bots: ['khoa'] }, e)
    expect(((await done.json()) as { outcomes: { status: string }[] }).outcomes[0]!.status).toBe('error')
  })
})
