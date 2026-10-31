import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { skillsApi } from './index.js'
import { findPack, installFromLibrary, LIBRARY_DIR, loadLibrary, packView, parsePack } from './library.js'
import { SkillStore, TEAM_OWNER, skillId, type Table } from './store.js'

const memTable = <V>(): Table<V> => {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  }
}
const newStore = () => new SkillStore(memTable(), memTable())
const files = () => mkdtemp(join(tmpdir(), 'aris-lib-files-'))

/** Bản sao của kho thật, để thử sửa nội dung mà không đụng repo. */
async function copyLibrary(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aris-lib-'))
  await cp(LIBRARY_DIR, dir, { recursive: true })
  return dir
}

describe('kho dựng sẵn trong repo', () => {
  it('mọi gói đọc được, không có chỗ sai (tên, mô tả, "Dùng khi", bộ kiểm, bộ quét, ca thử)', async () => {
    const lib = await loadLibrary()
    expect(lib.problems).toEqual([])
    expect(lib.packs.map((p) => p.id)).toContain('ban-hang-cskh')
    for (const p of lib.packs) expect(p.skills.length).toBeGreaterThan(0)
  })
})

describe('pack.json', () => {
  it('id phải trùng thư mục, skill phải có tên hợp lệ và bản', () => {
    expect(parsePack('{', 'a', '/x')).toMatch(/không đọc được/)
    expect(parsePack('{"id":"b","name":"n","description":"d","version":1,"skills":[]}', 'a', '/x')).toMatch(
      /trùng tên thư mục/,
    )
    expect(
      parsePack(
        '{"id":"a","name":"n","description":"d","version":1,"skills":[{"name":"Sai Ten","version":1}]}',
        'a',
        '/x',
      ),
    ).toMatch(/không hợp lệ/)
    const ok = parsePack(
      '{"id":"a","name":"n","description":"d","version":1,"skills":[{"name":"x","version":2,"cases":["c1"," "]}]}',
      'a',
      '/x',
    )
    expect(ok).toMatchObject({ id: 'a', skills: [{ name: 'x', version: 2, cases: ['c1'] }] })
  })

  it('thư mục skill không có trong danh sách và tên trùng giữa hai gói là lỗi', async () => {
    const dir = await copyLibrary()
    await cp(join(dir, 'ban-hang-cskh'), join(dir, 'goi-hai'), { recursive: true })
    const raw = JSON.parse(await readFile(join(dir, 'goi-hai', 'pack.json'), 'utf8')) as {
      id: string
      skills: unknown[]
    }
    raw.id = 'goi-hai'
    raw.skills = raw.skills.slice(0, 1)
    await writeFile(join(dir, 'goi-hai', 'pack.json'), JSON.stringify(raw))
    const lib = await loadLibrary(dir)
    expect(lib.problems.some((p) => p.includes('không có trong pack.json'))).toBe(true)
    expect(lib.problems.some((p) => p.includes('trùng tên với skill trong gói'))).toBe(true)
    expect(lib.packs.map((p) => p.id)).toContain('ban-hang-cskh')
    expect(lib.packs.map((p) => p.id)).not.toContain('goi-hai')
  })
})

describe('cài từ kho', () => {
  it('cài cả gói: skill của đội bật ngay, chưa gán bot, nguồn library, có ca thử', async () => {
    const store = newStore()
    const pack = await findPack('ban-hang-cskh')
    const out = await installFromLibrary(store, pack, { filesBase: await files() })
    expect(out.every((o) => o.status === 'installed')).toBe(true)
    expect(store.pending()).toHaveLength(0)
    const id = skillId(TEAM_OWNER, 'tra-loi-hoi-gia')
    expect(store.get(id)).toMatchObject({ status: 'active', version: 1 })
    expect(store.get(id)!.assigned).toBeUndefined()
    expect(store.get(id)!.cases?.length).toBeGreaterThanOrEqual(2)
    expect(store.active(id)!.source).toMatchObject({
      kind: 'library',
      pack: 'ban-hang-cskh',
      libVersion: 1,
      path: 'ban-hang-cskh/tra-loi-hoi-gia',
    })
    const view = await packView(store, pack)
    expect(view.installed).toBe(pack.skills.length)
    expect(view.skills.every((s) => s.state === 'installed')).toBe(true)
    // Cài lại: không đổi gì.
    const again = await installFromLibrary(store, pack, { filesBase: await files() })
    expect(again.every((o) => o.status === 'unchanged')).toBe(true)
  })

  it('cài một skill, gán bot đã chọn', async () => {
    const store = newStore()
    const pack = await findPack('ban-hang-cskh')
    await installFromLibrary(store, pack, { names: ['chot-don'], bots: ['lan'], filesBase: await files() })
    expect(store.activeFor('lan').map((x) => x.skill.name)).toEqual(['chot-don'])
    expect(store.activeFor('minh')).toHaveLength(0)
    const view = await packView(store, pack)
    expect(view.skills.filter((s) => s.state === 'installed').map((s) => s.name)).toEqual(['chot-don'])
  })

  it('kho có bản mới thì báo "update"; người dùng đã sửa thì không ghi đè khi chưa đồng ý', async () => {
    const dir = await copyLibrary()
    const store = newStore()
    let pack = await findPack('ban-hang-cskh', dir)
    await installFromLibrary(store, pack, { names: ['chot-don', 'xu-ly-tu-choi'], filesBase: await files() })

    // aris sửa skill trong kho, tăng bản.
    const md = join(dir, 'ban-hang-cskh', 'chot-don', 'SKILL.md')
    await writeFile(md, `${await readFile(md, 'utf8')}\n- Không hỏi lại điều khách đã nói.\n`)
    const pj = join(dir, 'ban-hang-cskh', 'pack.json')
    const raw = JSON.parse(await readFile(pj, 'utf8')) as { skills: { name: string; version: number }[] }
    for (const s of raw.skills) if (s.name === 'chot-don' || s.name === 'xu-ly-tu-choi') s.version = 2
    await writeFile(pj, JSON.stringify(raw))
    pack = await findPack('ban-hang-cskh', dir)

    // Người dùng sửa xu-ly-tu-choi (bản mới do người dùng).
    const rejectSkill = skillId(TEAM_OWNER, 'xu-ly-tu-choi')
    const mine = await store.propose({
      bot: TEAM_OWNER,
      name: 'xu-ly-tu-choi',
      description: 'Bản của tôi',
      body: '1. Hỏi lý do.\n2. Trả lời ngắn.',
      by: 'user',
    })
    await store.approve(mine!.id, 'user')

    const view = await packView(store, pack)
    const by = Object.fromEntries(view.skills.map((s) => [s.name, s.state]))
    expect(by['chot-don']).toBe('update')
    expect(by['xu-ly-tu-choi']).toBe('edited')
    expect(view.updates).toBe(1)
    const edited = view.skills.find((s) => s.name === 'xu-ly-tu-choi')!
    expect(edited.stat!.add).toBeGreaterThan(0)
    expect(edited.changes!.some((l) => l.kind === '-' && l.text.includes('Hỏi lý do'))).toBe(true)
    expect(view.skills.find((s) => s.name === 'chot-don')!.changes).toContainEqual({
      kind: '+',
      text: '- Không hỏi lại điều khách đã nói.',
    })

    const out = await installFromLibrary(store, pack, {
      names: ['chot-don', 'xu-ly-tu-choi'],
      filesBase: await files(),
    })
    expect(Object.fromEntries(out.map((o) => [o.name, o.status]))).toEqual({
      'chot-don': 'installed',
      'xu-ly-tu-choi': 'edited',
    })
    expect(store.active(skillId(TEAM_OWNER, 'chot-don'))!.source?.libVersion).toBe(2)
    expect(store.active(rejectSkill)!.body).toContain('Hỏi lý do')

    // Người dùng đồng ý ghi đè.
    const forced = await installFromLibrary(store, pack, {
      names: ['xu-ly-tu-choi'],
      force: true,
      filesBase: await files(),
    })
    expect(forced[0]!.status).toBe('installed')
    expect(store.active(rejectSkill)!.source?.kind).toBe('library')
  })

  it('skill đã cất được lấy ra lại khi cài', async () => {
    const store = newStore()
    const pack = await findPack('ban-hang-cskh')
    await installFromLibrary(store, pack, { names: ['chot-don'], filesBase: await files() })
    const id = skillId(TEAM_OWNER, 'chot-don')
    await store.archive(id, 'user')
    expect((await packView(store, pack)).skills.find((s) => s.name === 'chot-don')!.state).toBe('archived')
    await installFromLibrary(store, pack, { names: ['chot-don'], filesBase: await files() })
    expect(store.get(id)!.status).toBe('active')
  })
})

describe('API kho', () => {
  it('GET ?library=1 và POST library-install', async () => {
    const store = newStore()
    const get = await skillsApi(store, new Request('http://x/api/aris/skills?library=1'))
    const packs = ((await get.json()) as { packs: { id: string; installed: number }[] }).packs
    expect(packs.find((p) => p.id === 'ban-hang-cskh')!.installed).toBe(0)
    const post = await skillsApi(
      store,
      new Request('http://x/api/aris/skills', {
        method: 'POST',
        body: JSON.stringify({ op: 'library-install', pack: 'ban-hang-cskh', names: ['chot-don'] }),
      }),
    )
    const j = (await post.json()) as { ok: boolean; pack: { installed: number } }
    expect(j).toMatchObject({ ok: true, pack: { installed: 1 } })
    const bad = await skillsApi(
      store,
      new Request('http://x/api/aris/skills', {
        method: 'POST',
        body: JSON.stringify({ op: 'library-install', pack: '../x' }),
      }),
    )
    expect(bad.status).toBe(400)
  })
})
