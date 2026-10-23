import { describe, expect, it } from 'vitest'
import { handleApi } from './api.js'
import { renderAddress, renderPersona } from './persona.js'
import { BotStore, COMMANDER_ID, suggestHandle } from './store.js'
import { loadTemplates } from './templates.js'
import { memTables } from './testing.js'

let tick = 0
const store = async () => {
  const s = new BotStore(memTables(), () => new Date(Date.UTC(2026, 9, 23, 0, 0, tick++)))
  await s.ensureCommander()
  return s
}

describe('kho bot', () => {
  it('Commander luôn có, không xoá được; phiên chưa gắn là của Commander', async () => {
    const s = await store()
    expect(s.list().map((b) => b.id)).toEqual([COMMANDER_ID])
    await expect(s.remove(COMMANDER_ID)).rejects.toThrow('Commander')
    expect(s.botOf('session-x').id).toBe(COMMANDER_ID)
    expect(s.botOf(undefined).id).toBe(COMMANDER_ID)
  })

  it('tạo bot: mã nội bộ tự sinh, tên gọi hợp lệ và không trùng', async () => {
    const s = await store()
    const b = await s.create({ handle: '@Minh', name: ' Minh ', role: 'Nghiên cứu' })
    expect(b.id).toMatch(/^b-[0-9a-f]{6}$/)
    expect(b.handle).toBe('minh')
    expect(b.mascot).toBe('tron')
    await expect(s.create({ handle: 'minh', name: 'Minh 2' })).rejects.toThrow('@minh đã có')
    await expect(s.create({ handle: 'thơ', name: 'Thơ' })).rejects.toThrow('chữ thường không dấu')
    await expect(s.create({ handle: 'tho', name: '' })).rejects.toThrow('cần có tên')
    expect(suggestHandle('Đặng Thơ')).toBe('dang-tho')
  })

  it('sửa tên gọi không đổi mã nội bộ; phiên đã gắn vẫn theo bot', async () => {
    const s = await store()
    const b = await s.create({ handle: 'an', name: 'An' })
    await s.tag('session-1', b.id, 'open')
    const u = await s.update(b.id, { handle: 'vy', name: 'Vy', model: { provider: 'groq', model: 'm' } })
    expect(u.id).toBe(b.id)
    expect(s.botOf('session-1').handle).toBe('vy')
    expect(s.byHandle('@VY')?.id).toBe(b.id)
    expect((await s.update(b.id, { model: null })).model).toBeUndefined()
  })

  it('xoá bot thì bỏ chức trưởng nhóm; phiên cũ quay về Commander', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'van-hanh', name: 'Vận hành' })
    const b = await s.create({ handle: 'an', name: 'An', department: 'van-hanh' })
    await s.upsertDepartment({ id: 'van-hanh', name: 'Vận hành', lead: b.id })
    await s.tag('session-1', b.id, 'team')
    await s.remove(b.id)
    expect(s.departments()[0]!.lead).toBeUndefined()
    expect(s.botOf('session-1').id).toBe(COMMANDER_ID)
    await expect(s.create({ handle: 'x', name: 'X', department: 'khong-co' })).rejects.toThrow('phòng ban')
  })

  it('áp đội mẫu A: 6 bot, 3 phòng ban có trưởng nhóm; áp lại thì không nhân đôi', async () => {
    const s = await store()
    const all = await loadTemplates()
    expect(all.map((t) => t.id)).toEqual(['biet-danh', 'canvas', 'tang-truong'])
    const a = all.find((t) => t.id === 'tang-truong')!
    expect(await s.applyTemplate(a)).toEqual({
      added: ['minh', 'tho', 'phat', 'an', 'ngan', 'khoa'],
      skipped: [],
    })
    const lead = (id: string) => s.get(s.departments().find((d) => d.id === id)!.lead!)!.handle
    expect([lead('tang-truong'), lead('van-hanh'), lead('ky-thuat')]).toEqual(['tho', 'an', 'khoa'])
    expect((await s.applyTemplate(a)).skipped).toHaveLength(6)
    expect(s.list()).toHaveLength(7)
    // Mọi mẫu đều áp được.
    for (const t of all) await (await store()).applyTemplate(t)
  })
})

describe('tính cách', () => {
  it('bot biết mình là ai, việc gì, và đội hình để gọi', async () => {
    const s = await store()
    await s.applyTemplate((await loadTemplates()).find((t) => t.id === 'tang-truong')!)
    const tho = s.byHandle('tho')!
    const text = renderPersona(tho, s.list(), s.departments())
    expect(text).toContain('Bạn là Thơ (@tho), phụ trách nội dung')
    expect(text).toContain('phòng Tăng trưởng')
    expect(text).toContain('@minh · Minh · Nghiên cứu (Tăng trưởng)')
    expect(text).toContain('@an · An · Thư ký (Vận hành, trưởng nhóm)')
    expect(text).not.toContain('@tho ·')
    expect(renderPersona(s.get(COMMANDER_ID)!, s.list(), s.departments())).toContain('chỉ huy đội bot')
  })
})

describe('/api/aris/bots', () => {
  it('áp mẫu, mở phiên với bot, báo lỗi dễ hiểu', async () => {
    const s = await store()
    const opened: string[] = []
    const d = {
      store: s,
      templates: () => loadTemplates(),
      open: async (id: string) => (opened.push(id), 's-1'),
    }
    const post = (body: unknown) =>
      handleApi(d, new Request('http://x/', { method: 'POST', body: JSON.stringify(body) }))
    const r = (await (await post({ op: 'apply-template', template: 'tang-truong' })).json()) as {
      bots: { id: string; handle: string }[]
      templates: unknown[]
    }
    expect(r.bots).toHaveLength(7)
    expect(r.templates).toHaveLength(3)
    const minh = r.bots.find((b) => b.handle === 'minh')!
    expect(await (await post({ op: 'open', id: minh.id })).json()).toEqual({
      sessionId: 's-1',
      reused: false,
    })
    await s.tag('s-1', minh.id, 'open')
    expect(await (await post({ op: 'open', id: minh.id })).json()).toEqual({ sessionId: 's-1', reused: true })
    await post({ op: 'open', id: minh.id, fresh: true })
    expect(opened).toEqual([minh.id, minh.id])
    const who = await handleApi(d, new Request('http://x/api/aris/bots?session=s-1'))
    expect(await who.json()).toEqual({ bot: minh.id })
    const bad = await post({ op: 'create', bot: { handle: 'minh', name: 'X' } })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toContain('@minh')
  })
})

describe('xưng hô', () => {
  it('chưa biết thì bảo bot hỏi một lần; biết rồi thì theo hồ sơ, không viết cứng anh/chị/chủ nhân', async () => {
    const s = await store()
    expect(renderAddress(s.owner()).join('\n')).toContain('hỏi ngắn một lần')
    await s.setOwner({ name: 'Tầu', call: 'anh', self: 'em' })
    expect(renderAddress(s.owner())).toEqual(['Người dùng: tên Tầu, gọi người dùng là «anh», tự xưng «em».'])
    await s.setOwner({ call: '  ' })
    expect(s.owner()).toEqual({ name: 'Tầu', self: 'em' })
    const text = renderPersona(s.get(COMMANDER_ID)!, s.list(), s.departments(), s.owner())
    expect(text).not.toMatch(/chủ nhân/i)
    expect(text).toContain('hỏi ngắn một lần')
  })

  it('bot cũ có chữ "chủ nhân" viết cứng được đổi khi khởi động', async () => {
    const t = memTables()
    const old = new BotStore(t)
    await old.ensureCommander()
    const b = await old.create({ handle: 'tho', name: 'Thơ', soul: 'Bám giọng văn của chủ nhân.' })
    await new BotStore(t).ensureCommander()
    expect(t.bots.get(b.id)!.soul).toBe('Bám giọng văn của người dùng.')
  })
})

describe('phòng ban', () => {
  it('tạo phòng: mã không trùng, bot rời phòng cũ, trưởng nhóm phải trong phòng, chép chính sách', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'ky-thuat', name: 'Kỹ thuật', policy: { shell: true, budgetUsd: 3 } })
    const a = await s.create({ handle: 'khoa', name: 'Khoa', department: 'ky-thuat' })
    await s.upsertDepartment({ id: 'ky-thuat', name: 'Kỹ thuật', lead: a.id })
    const b = await s.create({ handle: 'vy', name: 'Vy' })
    await expect(s.createDepartment({ name: 'Bán hàng', bots: [b.id], lead: a.id })).rejects.toThrow(
      'Trưởng nhóm',
    )
    const d = await s.createDepartment({
      name: 'Bán hàng',
      bots: [a.id, b.id],
      lead: b.id,
      copyPolicyFrom: 'ky-thuat',
    })
    expect(d.id).toBe('ban-hang')
    expect(d.lead).toBe(b.id)
    expect(d.policy).toMatchObject({ shell: true, budgetUsd: 3 })
    expect(s.get(a.id)!.department).toBe('ban-hang')
    // Khoa rời Kỹ thuật thì thôi làm trưởng nhóm ở đó.
    expect(s.departments().find((x) => x.id === 'ky-thuat')!.lead).toBeUndefined()
    await expect(s.createDepartment({ name: 'bán hàng' })).rejects.toThrow('Đã có phòng')
    expect((await s.createDepartment({ name: 'Bán-hàng!' })).id).toBe('ban-hang-2')
  })

  it('xoá phòng: bot về chưa xếp phòng, giữ model riêng; chính sách mặc định áp cho bot chưa xếp phòng', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'van-hanh', name: 'Vận hành', policy: { shell: true } })
    const b = await s.create({
      handle: 'an',
      name: 'An',
      department: 'van-hanh',
      model: { provider: 'p', model: 'm' },
    })
    expect(s.policyOf(b.id)!.policy.shell).toBe(true)
    await s.deleteDepartment('van-hanh')
    expect(s.get(b.id)!.department).toBeUndefined()
    expect(s.get(b.id)!.model).toEqual({ provider: 'p', model: 'm' })
    expect(s.policyOf(b.id)).toEqual({ policy: { web: true, write: true, shell: false, onBudget: 'stop' } })
    expect(s.policyOf(COMMANDER_ID)).toBeUndefined()
  })

  it('model chạy: model riêng của bot, không có thì model mặc định của phòng', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'p', name: 'P', policy: { model: { provider: 'd', model: 'dept' } } })
    const a = await s.create({ handle: 'a', name: 'A', department: 'p' })
    const b = await s.create({
      handle: 'b',
      name: 'B',
      department: 'p',
      model: { provider: 'x', model: 'own' },
    })
    expect(s.effectiveModel(a.id)).toEqual({ provider: 'd', model: 'dept' })
    expect(s.effectiveModel(b.id)).toEqual({ provider: 'x', model: 'own' })
  })

  it('phòng cũ chưa có chính sách: lấy theo đội mẫu cùng mã (Kỹ thuật được chạy lệnh)', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'ky-thuat', name: 'Kỹ thuật' })
    await s.upsertDepartment({ id: 'tang-truong', name: 'Tăng trưởng' })
    await s.upsertDepartment({ id: 'rieng', name: 'Riêng' })
    await s.ensurePolicies(await loadTemplates())
    const by = Object.fromEntries(s.departments().map((d) => [d.id, d]))
    expect(by['ky-thuat']!.policy!.shell).toBe(true)
    expect(by['tang-truong']!.policy!.shell).toBe(false)
    expect(by['tang-truong']!.about).toBe('nghiên cứu, nội dung, bán hàng')
    expect(by['rieng']!.policy).toEqual({ web: true, write: true, shell: false, onBudget: 'stop' })
  })

  it('API: tạo, chuyển bot, đổi chính sách, xoá phòng; trả chi phí theo phòng', async () => {
    const s = await store()
    const b = await s.create({ handle: 'an', name: 'An' })
    const call = (body: unknown) =>
      handleApi(
        { store: s, templates: async () => [], open: async () => 's', spend: () => ({ x: 0.4 }) },
        new Request('http://x/api/aris/bots', { method: 'POST', body: JSON.stringify(body) }),
      ).then(
        (r) =>
          r.json() as Promise<{
            departments: { id: string; policy?: { web: boolean } }[]
            spend: object
            error?: string
          }>,
      )
    let r = await call({ op: 'department-create', department: { name: 'Vận hành' } })
    expect(r.departments.map((d) => d.id)).toEqual(['van-hanh'])
    expect(r.spend).toEqual({ x: 0.4 })
    await call({ op: 'move', id: b.id, department: 'van-hanh' })
    expect(s.get(b.id)!.department).toBe('van-hanh')
    r = await call({
      op: 'department',
      department: { id: 'van-hanh', name: 'Vận hành', policy: { web: false } },
    })
    expect(r.departments[0]!.policy!.web).toBe(false)
    r = await call({ op: 'department-delete', id: 'van-hanh' })
    expect(r.departments).toEqual([])
    expect((await call({ op: 'move', id: b.id, department: 'khong-co' })).error).toContain('phòng ban')
  })
})

describe('bot biết quyền của mình', () => {
  it('ngữ cảnh nói quyền bị tắt theo phòng; đủ quyền thì không nói; Commander không có dòng này', async () => {
    const s = await store()
    await s.upsertDepartment({ id: 'tt', name: 'Tăng trưởng', policy: { shell: false, web: false } })
    await s.upsertDepartment({ id: 'kt', name: 'Kỹ thuật', policy: { shell: true } })
    const a = await s.create({ handle: 'minh', name: 'Minh', department: 'tt' })
    const k = await s.create({ handle: 'khoa', name: 'Khoa', department: 'kt' })
    expect(renderPersona(a, s.list(), s.departments())).toContain(
      'Quyền của bạn (chính sách phòng Tăng trưởng): không được tìm và đọc web, chạy lệnh terminal.',
    )
    expect(renderPersona(k, s.list(), s.departments())).not.toContain('Quyền của bạn')
    expect(renderPersona(s.get(COMMANDER_ID)!, s.list(), s.departments())).not.toContain('Quyền của bạn')
  })
})
