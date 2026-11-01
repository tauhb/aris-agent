import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  drillBackup,
  escapingLinks,
  extractBackup,
  readHeader,
  validateHeader,
  writeBackup,
} from './archive.js'
import {
  cleanBackup,
  codeIdOf,
  DEFAULT_BACKUP,
  fileName,
  isBackupName,
  isDue,
  newRecoveryCode,
  normalizeCode,
  pickKeep,
} from './policy.js'
import { restoreBackup } from './restore.js'
import { planAll, partSpecs } from './sources.js'

describe('mã khôi phục', () => {
  it('24 ký tự sáu nhóm, gõ lại lỏng tay vẫn nhận', () => {
    const code = newRecoveryCode()
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(normalizeCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code)
    expect(normalizeCode('OOOO-IIII-LLLL-0000-1111-2222')).toBe('0000-1111-1111-0000-1111-2222')
    expect(normalizeCode('ABC')).toBeUndefined()
    expect(codeIdOf(code)).toBe(codeIdOf(code.toLowerCase()))
    expect(codeIdOf(code)).not.toBe(codeIdOf(newRecoveryCode()))
  })
})

describe('lịch và giữ bản', () => {
  const s = { enabled: true, dir: '/x', time: '02:00' }
  const at = (d: string) => new Date(d)
  it('tới giờ, máy ngủ thì chạy khi thức, lỗi thì thử lại sau một giờ tối đa ba lần', () => {
    expect(isDue(at('2026-10-26T01:59'), s)).toBe(false)
    expect(isDue(at('2026-10-26T09:30'), s)).toBe(true)
    expect(isDue(at('2026-10-26T09:30'), { ...s, enabled: false })).toBe(false)
    const fail = { day: '2026-10-26', attempts: 1, lastAt: at('2026-10-26T02:00').getTime(), ok: false }
    expect(isDue(at('2026-10-26T02:30'), s, fail)).toBe(false)
    expect(isDue(at('2026-10-26T03:01'), s, fail)).toBe(true)
    expect(isDue(at('2026-10-26T09:00'), s, { ...fail, attempts: 3 })).toBe(false)
    expect(isDue(at('2026-10-26T09:00'), s, { ...fail, ok: true })).toBe(false)
    expect(isDue(at('2026-10-27T02:01'), s, { ...fail, ok: true })).toBe(true)
  })
  it('giữ bản mới nhất mỗi ngày và mỗi tuần', () => {
    const copies = Array.from({ length: 40 }, (_, i) => ({ at: new Date(2026, 9, 26 - i, 2, 0) }))
    copies.push({ at: new Date(2026, 9, 26, 15, 0) })
    const { keep, drop } = pickKeep(copies, 7, 4)
    const kept = [...keep.entries()].map(([c, why]) => `${c.at.getDate()}/${c.at.getMonth() + 1}:${why}`)
    // 26/10 (thứ Hai) có hai bản: giữ bản 15:00. Bảy ngày; tuần lấy bản Chủ nhật, hai tuần gần nhất đã là bản ngày.
    expect(kept).toEqual([
      '26/10:ngay',
      '25/10:ngay',
      '24/10:ngay',
      '23/10:ngay',
      '22/10:ngay',
      '21/10:ngay',
      '20/10:ngay',
      '18/10:tuan',
      '11/10:tuan',
    ])
    expect(drop).toHaveLength(41 - 9)
  })
  it('cài đặt giữ giá trị cũ khi gửi sai, không bật được qua đây', () => {
    const s2 = cleanBackup(
      { time: '25:00', keepDaily: 0, keepWeekly: 8, notify: false, enabled: true },
      DEFAULT_BACKUP,
    )
    expect(s2).toMatchObject({ time: '02:00', keepDaily: 7, keepWeekly: 8, notify: false, enabled: false })
    expect(fileName(new Date(2026, 9, 26, 2, 5))).toBe('aris-2026-10-26-0205.aris')
    expect(isBackupName('aris-2026-10-26-0205.aris')).toBe(true)
    expect(isBackupName('notes.aris')).toBe(false)
  })
})

describe('sao lưu, diễn tập, khôi phục thật trên thư mục tạm', () => {
  const base = mkdtempSync(join(tmpdir(), 'aris-backup-test-'))
  afterAll(() => rmSync(base, { recursive: true, force: true }))
  const home = join(base, 'home')
  const dsh = join(home, 'repo', '.dsh-home')
  const put = (p: string, s: string) => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, s)
  }
  put(join(dsh, 'sessions', 'a', 'log.jsonl'), '{"x":1}\n')
  put(join(dsh, 'storages', 'aris_bots', 'bots', 'minh.json'), '{"name":"Minh"}')
  put(join(dsh, 'storages', 'schedule.json'), '{}')
  put(join(dsh, '.credentials.yaml'), 'secret: khong-duoc-sao-luu')
  put(join(dsh, 'profiles', 'aris', 'node_modules', 'x.js'), '1')
  put(join(home, 'aris', 'brain', 'Cá nhân', 'Nhật ký.md'), '# Nhật ký')
  put(join(home, 'aris', 'workspace', 'app', 'node_modules', 'big.js'), 'x')
  put(join(home, 'aris', 'workspace', 'app', 'main.ts'), 'console.log(1)')
  put(join(home, '.aris', 'brain', 'bin', 'native'), 'bin')
  put(join(home, '.aris', 'worktrees', 'w', 'f'), 'tam')
  execFileSync('/usr/bin/git', ['init', '-q', join(home, 'aris', 'brain')])
  execFileSync('/usr/bin/git', ['-C', join(home, 'aris', 'brain'), 'add', '-A'])
  execFileSync('/usr/bin/git', [
    '-C',
    join(home, 'aris', 'brain'),
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'a',
  ])
  // SQLite đang mở chế độ WAL.
  mkdirSync(join(home, '.aris', 'brain'), { recursive: true })
  const db = join(home, '.aris', 'brain', 'index.sqlite')
  execFileSync('/usr/bin/sqlite3', [
    db,
    'PRAGMA journal_mode=WAL; CREATE TABLE t(x); INSERT INTO t VALUES (42);',
  ])
  writeFileSync(db + '-wal', '')
  const env = { DSH_HOME: dsh }
  const code = newRecoveryCode()
  const out = join(base, 'dich')
  mkdirSync(out)

  it('chỉ lấy dữ liệu, bỏ khoá, plugin, node_modules, bản làm việc tạm', async () => {
    const parts = await planAll(partSpecs(env, home))
    const all = parts
      .flatMap((p) => p.files.map((f) => f.slice(p.root.length + 1)))
      .filter((f) => !f.startsWith('.git/'))
    expect(all.sort()).toEqual(
      [
        'Cá nhân/Nhật ký.md',
        'app/main.ts',
        'sessions/a/log.jsonl',
        'storages/aris_bots/bots/minh.json',
        'storages/schedule.json',
      ].sort(),
    )
    expect(parts.find((p) => p.id === 'aris')?.sqlite).toEqual(['brain/index.sqlite'])
    // Bộ não gồm cả lịch sử git.
    expect(parts.find((p) => p.id === 'brain')?.files.some((f) => f.endsWith('.git/HEAD'))).toBe(true)
  })

  let file = ''
  it('ghi tệp mã hoá, đọc lại, diễn tập đạt', async () => {
    const parts = await planAll(partSpecs(env, home))
    const r = await writeBackup(parts, join(out, 'aris-2026-10-26-0200.aris'), code)
    file = r.file
    expect(r.missing).toBe(0)
    const raw = readFileSync(file)
    expect(raw.includes(Buffer.from('Nhật ký'))).toBe(false)
    expect(raw.includes(Buffer.from('khong-duoc-sao-luu'))).toBe(false)
    const { header } = await readHeader(file)
    expect(header.codeId).toBe(codeIdOf(code))
    const d = await drillBackup(file, code, r.files)
    expect(d.steps.map((s) => [s.id, s.ok])).toEqual([
      ['giai-ma', true],
      ['giai-nen', true],
      ['kho', true],
      ['bo-nao', true],
      ['khop', true],
    ])
    expect(d.steps.find((s) => s.id === 'kho')).toMatchObject({ n: 3, of: 3 })
  })

  it('sai mã, tệp bị sửa: không giải nén được', async () => {
    await expect(extractBackup(file, newRecoveryCode(), join(base, 'x'))).rejects.toThrow('không khớp')
    const bad = join(base, 'bad.aris')
    const raw = readFileSync(file)
    raw[raw.length - 40] ^= 1
    writeFileSync(bad, raw)
    const d = await drillBackup(bad, code)
    expect(d.ok).toBe(false)
  })

  it('khôi phục: cất dữ liệu cũ sang bên, giữ khoá và plugin, SQLite đọc được', async () => {
    writeFileSync(join(home, 'aris', 'brain', 'Cá nhân', 'Nhật ký.md'), '# hỏng')
    writeFileSync(join(home, 'aris', 'brain', 'moi.md'), 'sau sao lưu')
    rmSync(join(dsh, 'storages'), { recursive: true })
    const roots = Object.fromEntries(partSpecs(env, home).map((p) => [p.id, p.root]))
    const r = await restoreBackup(file, code, roots, 'T1')
    expect(readFileSync(join(home, 'aris', 'brain', 'Cá nhân', 'Nhật ký.md'), 'utf8')).toBe('# Nhật ký')
    expect(existsSync(join(home, 'aris', 'brain', 'moi.md'))).toBe(false)
    expect(readFileSync(join(home, 'aris', 'brain.truoc-khoi-phuc-T1', 'moi.md'), 'utf8')).toBe('sau sao lưu')
    expect(readFileSync(join(dsh, 'storages', 'aris_bots', 'bots', 'minh.json'), 'utf8')).toContain('Minh')
    expect(existsSync(join(dsh, '.credentials.yaml'))).toBe(true)
    expect(existsSync(join(dsh, 'profiles', 'aris', 'node_modules', 'x.js'))).toBe(true)
    expect(existsSync(join(dsh, '.truoc-khoi-phuc-T1', 'sessions', 'a', 'log.jsonl'))).toBe(true)
    expect(existsSync(join(home, '.aris', 'brain', 'bin', 'native'))).toBe(true)
    expect(execFileSync('/usr/bin/sqlite3', [db, 'SELECT x FROM t']).toString().trim()).toBe('42')
    expect(r.parts.map((p) => p.id).sort()).toEqual(['aris', 'brain', 'dsh', 'workspace'])
  })
})

describe('đợt 7f · S8: đầu tệp được xác thực, id và gốc không tin đầu tệp', () => {
  const base = mkdtempSync(join(tmpdir(), 'aris-backup-s8-'))
  afterAll(() => rmSync(base, { recursive: true, force: true }))
  const code = newRecoveryCode()
  const src = join(base, 'nguon')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'a.txt'), 'du lieu that')

  const part = (o: Record<string, unknown> = {}) => ({
    id: 'workspace',
    root: src,
    files: [join(src, 'a.txt')],
    sqlite: [] as string[],
    bytes: 12,
    ...o,
  })
  const make = async (name: string, parts: ReturnType<typeof part>[]) =>
    (await writeBackup(parts as never, join(base, name), code)).file

  it('tệp mới có phiên bản 2; sửa bất kỳ byte nào của đầu tệp thì giải mã lỗi', async () => {
    const file = await make('v2.aris', [part()])
    expect((await readHeader(file)).header.v).toBe(2)
    const raw = readFileSync(file)
    // Đổi một ký tự trong giá trị `host` (độ dài giữ nguyên, JSON vẫn đọc được).
    const at = raw.indexOf('"host":"') + '"host":"'.length
    raw[at] = raw[at] === 0x58 ? 0x59 : 0x58
    const bad = join(base, 'sua-dau.aris')
    writeFileSync(bad, raw)
    expect(JSON.parse(JSON.stringify((await readHeader(bad)).header)).v).toBe(2)
    await expect(extractBackup(bad, code, join(base, 'x1'))).rejects.toThrow('bị sửa hay hỏng')
    // Sửa mã phần trong đầu tệp (workspace → workspacf) cũng hỏng thẻ.
    const raw2 = readFileSync(file)
    const i2 = raw2.indexOf('"id":"workspace"') + '"id":"workspac'.length
    raw2[i2] = 0x66
    writeFileSync(bad, raw2)
    await expect(extractBackup(bad, code, join(base, 'x2'))).rejects.toThrow()
  })

  it('bản phiên bản 1 (không có AAD) bị từ chối với lời báo rõ', async () => {
    const file = await make('v1.aris', [part()])
    const raw = readFileSync(file)
    const n = raw.readUInt32BE(8)
    const head = JSON.parse(raw.subarray(12, 12 + n).toString('utf8')) as { v: number }
    head.v = 1
    const json = Buffer.from(JSON.stringify(head).padEnd(n, ' '), 'utf8')
    const old = Buffer.concat([raw.subarray(0, 12), json, raw.subarray(12 + n)])
    const f = join(base, 'cu.aris')
    writeFileSync(f, old)
    await expect(readHeader(f)).rejects.toThrow('phiên bản 1 không có xác thực đầu tệp')
  })

  it('mã phần lạ, tên mục có / hay .. bị từ chối khi giải nén lẫn khôi phục', async () => {
    const roots = { dsh: join(base, 'dsh-root'), workspace: join(base, 'ws-root') }
    mkdirSync(roots.dsh, { recursive: true })
    for (const bad of [
      part({ id: '..' }),
      part({ id: 'launchagents' }),
      part({ id: '../../x' }),
      part({ entries: ['../ngoai'] }),
      part({ entries: ['a/b'] }),
      part({ entries: ['a.txt'], merge: ['..'] }),
    ]) {
      const f = await make('la.aris', [bad])
      await expect(extractBackup(f, code, join(base, 'y'))).rejects.toThrow(/phần lạ|tên mục/)
      await expect(restoreBackup(f, code, roots)).rejects.toThrow(/phần lạ|tên mục/)
    }
    expect(() => validateHeader({ parts: [{ id: 'dsh', entries: ['sessions'] }] } as never)).not.toThrow()
    expect(() =>
      validateHeader({ parts: [{ id: 'brain' }, { id: 'aris', merge: ['brain'] }] } as never),
    ).not.toThrow()
    expect(existsSync(join(base, 'y'))).toBe(false)
  })

  it('khôi phục chỉ dùng gốc từ roots: phần không có gốc bị bỏ qua và báo, gốc ghi trong đầu tệp không được dùng', async () => {
    const other = join(base, 'phan-khac')
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, 'b.txt'), 'goc-cu')
    const f = await make('goc.aris', [
      part({ id: 'workspace' }),
      part({ id: 'projects', root: other, files: [join(other, 'b.txt')] }),
    ])
    writeFileSync(join(other, 'b.txt'), 'da-doi-sau-sao-luu')
    const mine = join(base, 'cua-toi')
    mkdirSync(mine, { recursive: true })
    const r = await restoreBackup(f, code, { dsh: mine, workspace: join(mine, 'ws') }, 'T')
    expect(r.parts.map((p) => p.id)).toEqual(['workspace'])
    expect(r.skipped).toEqual(['projects'])
    expect(readFileSync(join(mine, 'ws', 'a.txt'), 'utf8')).toBe('du lieu that')
    // Gốc ghi trong đầu tệp (`other`) không bị đụng: nội dung nguyên, không có thư mục cất bên cạnh.
    expect(readFileSync(join(other, 'b.txt'), 'utf8')).toBe('da-doi-sau-sao-luu')
    expect(existsSync(`${other}.truoc-khoi-phuc-T`)).toBe(false)
    await expect(restoreBackup(f, code, {})).rejects.toThrow('không có thư mục đích')
  })

  it('liên kết mềm trỏ ra ngoài thư mục giải nén: xoá liên kết, báo lỗi, khôi phục không đụng dữ liệu thật', async () => {
    const evil = join(base, 'ac')
    mkdirSync(evil, { recursive: true })
    writeFileSync(join(evil, 'b.txt'), 'binh thuong')
    symlinkSync('/etc', join(evil, 'tuyet-doi'))
    symlinkSync('../../..', join(evil, 'di-len'))
    symlinkSync('b.txt', join(evil, 'ok-trong'))
    const f = await make('lienket.aris', [
      part({
        root: evil,
        files: [join(evil, 'b.txt'), join(evil, 'tuyet-doi'), join(evil, 'di-len'), join(evil, 'ok-trong')],
      }),
    ])
    const dest = join(base, 'giai')
    await expect(extractBackup(f, code, dest)).rejects.toThrow('liên kết mềm trỏ ra ngoài')
    expect(await escapingLinks(dest)).toEqual([])
    expect(existsSync(join(dest, 'workspace', 'tuyet-doi'))).toBe(false)
    expect(existsSync(join(dest, 'workspace', 'ok-trong'))).toBe(true)
    const target = join(base, 'dich-that')
    mkdirSync(join(target, 'ws'), { recursive: true })
    writeFileSync(join(target, 'ws', 'giu.txt'), 'dung-dung-vao')
    await expect(restoreBackup(f, code, { dsh: target, workspace: join(target, 'ws') }, 'T')).rejects.toThrow(
      'liên kết mềm',
    )
    expect(readFileSync(join(target, 'ws', 'giu.txt'), 'utf8')).toBe('dung-dung-vao')
    expect(existsSync(join(target, 'ws.truoc-khoi-phuc-T'))).toBe(false)
  })
})
