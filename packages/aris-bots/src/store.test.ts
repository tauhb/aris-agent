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
