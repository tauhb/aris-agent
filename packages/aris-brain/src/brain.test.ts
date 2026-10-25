import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bashTouchesVault, canRead, containsVault, insideVault, readTarget, type Reader } from './access.js'
import { Catalog } from './catalog.js'
import { sweepMessage, VaultGit } from './git.js'
import { askPrompt, citations, scopeLabel } from './ask.js'
import { fold, keyTerms, linksOf, parsePage, snippetOf } from './page.js'
import { ensureVault, placeOf, slugOf } from './vault.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
const temp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'aris-brain-'))
  dirs.push(d)
  return d
}

describe('khuôn kho', () => {
  it('nhận biết không gian, lớp, phòng ban, nhóm', () => {
    expect(placeOf('ca-nhan/wiki/nguoi/chi-ha.md')).toEqual({
      space: 'ca-nhan',
      layer: 'wiki',
      group: 'nguoi',
    })
    expect(placeOf('ca-nhan/wiki/tong-quan.md')).toEqual({ space: 'ca-nhan', layer: 'wiki' })
    expect(placeOf('cong-ty/wiki/chung/khach-hang/abc.md')).toMatchObject({ group: 'chung/khach-hang' })
    expect(placeOf('cong-ty/wiki/phong-ban/van-hanh/quy-trinh/duyet.md')).toEqual({
      space: 'cong-ty',
      layer: 'wiki',
      dept: 'van-hanh',
      group: 'quy-trinh',
    })
    expect(placeOf('cong-ty/nguon/2026-10/bao-cao.pdf')).toEqual({ space: 'cong-ty', layer: 'nguon' })
    expect(placeOf('ca-nhan/nhat-ky/2026-10-25.md').layer).toBe('nhat-ky')
    expect(placeOf('ca-nhan/index.md').layer).toBe('he-thong')
    expect(placeOf('hop-thu-vao/x.pdf').layer).toBe('hop-thu-vao')
    expect(placeOf('AGENTS.md')).toEqual({ layer: 'he-thong' })
    expect(slugOf('Chị Hà — editor')).toBe('chi-ha-editor')
    expect(slugOf('Đường đi')).toBe('duong-di')
  })

  it('tạo khuôn một lần, không ghi đè tệp đã có; phòng ban mới có thư mục riêng', async () => {
    const root = await temp()
    const made = await ensureVault(root, [{ id: 'van-hanh', name: 'Vận hành' }])
    expect(made).toContain('AGENTS.md')
    expect(made).toContain('cong-ty/wiki/phong-ban/van-hanh/_phong-ban.md')
    expect(made).toContain('_mau/quy-trinh.md')
    await writeFile(join(root, 'AGENTS.md'), 'luật của tôi')
    const again = await ensureVault(root, [
      { id: 'van-hanh', name: 'Vận hành' },
      { id: 'nghien-cuu', name: 'Nghiên cứu' },
    ])
    expect(again).toEqual(['cong-ty/wiki/phong-ban/nghien-cuu/_phong-ban.md'])
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('luật của tôi')
  })
})

describe('đọc trang', () => {
  it('nhãn đầu trang, tiêu đề, liên kết', () => {
    const p = parsePage(
      '---\nloai: nguoi\nthe: [editor, video]\n---\n\n# Chị Hà\n\nDựng video cho [[kenh-youtube-q4]] và [[lich-quay|lịch]], xem [[chi-ha#ghi-nhan]].\n',
      'chi-ha',
    )
    expect(p.meta).toMatchObject({ loai: 'nguoi', the: ['editor', 'video'] })
    expect(p.title).toBe('Chị Hà')
    expect(p.links).toEqual(['kenh-youtube-q4', 'lich-quay', 'chi-ha'])
    expect(parsePage('---\nloai: [hỏng\n---\nchữ', 'x').title).toBe('x')
    expect(linksOf('[[a/b/c.md]]')).toEqual(['c'])
  })

  it('bỏ dấu giữ nguyên độ dài; đoạn trích hiện chữ có dấu', () => {
    expect(fold('Đường hướng dẫn')).toBe('duong huong dan')
    expect(fold('Đường hướng dẫn').length).toBe('Đường hướng dẫn'.length)
    expect(
      snippetOf('# Tiêu đề\n\nMở đầu dài. Video hướng dẫn giữ chân người xem tốt nhất.', 'huong dan', 40),
    ).toContain('hướng dẫn')
  })
})

describe('chỉ mục', () => {
  const st = { size: 1, mtime: 1 }
  it('câu hỏi tự nhiên: bỏ từ đệm, không trang nào đủ từ thì tìm nới; đoạn trích quanh chỗ khớp nhiều từ', () => {
    expect(keyTerms('Mình đã quyết gì về ngân sách quảng cáo quý 4?')).toEqual([
      'quyet',
      'ngan',
      'sach',
      'quang',
      'cao',
      'quy',
      '4',
    ])
    // "cô" không phải từ đệm dù bỏ dấu trùng với "có".
    expect(keyTerms('cô Lan có nói gì không')).toEqual(['co', 'lan', 'noi'])
    expect(keyTerms('là gì')).toEqual(['la', 'gi'])
    const c = new Catalog()
    c.put(
      'cong-ty/wiki/chung/ke-hoach-quy-4.md',
      '# Kế hoạch quý 4\n\nMở đầu dài dòng về kênh. 50 triệu chia: 30 sản xuất, 15 quảng cáo, 5 dự phòng.',
      st,
    )
    c.put('ca-nhan/wiki/nguoi/chi-ha.md', '# Chị Hà\n\nBáo giá thumbnail 2 triệu.', st)
    const hits = c.search('Mình đã quyết gì về ngân sách quảng cáo quý 4?', () => true)
    expect(hits.map((h) => h.entry.name)).toEqual(['ke-hoach-quy-4'])
    expect(hits[0]!.snippet).toContain('15 quảng cáo')
    expect(c.search('chi ha', () => true).map((h) => h.entry.name)).toEqual(['chi-ha'])
  })

  it('tìm có dấu hay không dấu, cả chữ đ; liên kết ngược; lọc theo quyền', () => {
    const c = new Catalog()
    c.put('ca-nhan/wiki/nguoi/chi-ha.md', '# Chị Hà\n\nEditor dựng video, phụ trách [[kenh-youtube-q4]].', st)
    c.put(
      'ca-nhan/wiki/du-an/kenh-youtube-q4.md',
      '# Kênh YouTube Q4\n\nĐường dây sản xuất 2 video/tuần.',
      st,
    )
    c.put(
      'cong-ty/wiki/phong-ban/van-hanh/quy-trinh/duyet-chi-tieu.md',
      '# Duyệt chi tiêu\n\nVideo quảng cáo.',
      st,
    )
    c.put('ca-nhan/nguon/2026-10/bao-cao.pdf', undefined, st)
    expect(c.search('chi ha', () => true).map((h) => h.entry.name)).toEqual(['chi-ha'])
    expect(c.search('Chị Hà', () => true)[0]?.entry.title).toBe('Chị Hà')
    expect(c.search('duong day', () => true).map((h) => h.entry.name)).toEqual(['kenh-youtube-q4'])
    expect(c.search('vid', () => true)).toHaveLength(3)
    expect(c.search('video', (e) => e.space === 'ca-nhan')).toHaveLength(2)
    expect(c.search('"*', () => true)).toEqual([])
    expect(c.backlinks('kenh-youtube-q4').map((e) => e.name)).toEqual(['chi-ha'])
    expect(c.byName('ca-nhan', 'chi-ha')?.path).toBe('ca-nhan/wiki/nguoi/chi-ha.md')
    expect(c.get('ca-nhan/nguon/2026-10/bao-cao.pdf')?.binary).toBe(true)
    c.put('ca-nhan/wiki/nguoi/chi-ha.md', '# Chị Hà\n\nKhông còn liên kết.', st)
    expect(c.backlinks('kenh-youtube-q4')).toEqual([])
    expect(c.keepOnly(new Set(['ca-nhan/wiki/nguoi/chi-ha.md']))).toBe(3)
    expect(c.all().map((e) => e.path)).toEqual(['ca-nhan/wiki/nguoi/chi-ha.md'])
    c.close()
  })
})

describe('quyền đọc', () => {
  const rules = { personal: ['b-lam'] }
  const mai: Reader = { id: 'b-mai', role: 'member', department: 'van-hanh' }
  const lam: Reader = { id: 'b-lam', role: 'member', department: 'nghien-cuu' }
  const aris: Reader = { id: 'aris', role: 'commander' }
  const wiki = { layer: 'wiki' as const, depts: [] as string[] }
  it('Cá nhân theo danh sách; phòng ban theo phòng; Chung ai cũng đọc; Aris đọc hết', () => {
    expect(canRead(mai, { ...wiki, space: 'ca-nhan' }, rules)).toBe(false)
    expect(canRead(lam, { ...wiki, space: 'ca-nhan' }, rules)).toBe(true)
    expect(canRead(mai, { ...wiki, space: 'cong-ty', dept: 'van-hanh' }, rules)).toBe(true)
    expect(canRead(lam, { ...wiki, space: 'cong-ty', dept: 'van-hanh' }, rules)).toBe(false)
    expect(canRead(lam, { ...wiki, space: 'cong-ty' }, rules)).toBe(true)
    expect(canRead(lam, { layer: 'nguon', space: 'cong-ty', depts: ['van-hanh'] }, rules)).toBe(false)
    expect(canRead(lam, { layer: 'hop-thu-vao', depts: [] }, rules)).toBe(false)
    expect(canRead(aris, { ...wiki, space: 'cong-ty', dept: 'van-hanh' }, rules)).toBe(true)
  })

  it('chặn đường vòng: đọc thẳng tệp, quét thư mục chứa kho, bash nhắc tới kho', () => {
    const root = join(homedir(), 'aris', 'brain')
    const cwd = join(homedir(), 'aris', 'workspace')
    expect(insideVault(root, '../brain/ca-nhan/wiki/x.md', cwd)).toBe('ca-nhan/wiki/x.md')
    expect(insideVault(root, '~/aris/brain', cwd)).toBe('')
    expect(insideVault(root, 'notes.md', cwd)).toBeUndefined()
    expect(containsVault(root, '~', cwd)).toBe(true)
    expect(containsVault(root, '.', cwd)).toBe(false)
    expect(readTarget('read', { file_path: 'a.md' })).toEqual({ path: 'a.md', recursive: false })
    expect(readTarget('grep', { pattern: 'x' })).toEqual({ path: '.', recursive: true })
    expect(readTarget('str_replace_editor', { command: 'view', path: 'a' })).toEqual({
      path: 'a',
      recursive: false,
    })
    expect(readTarget('write', { file_path: 'a' })).toBeUndefined()
    expect(bashTouchesVault('cat ~/aris/brain/ca-nhan/index.md', root)).toBe(true)
    expect(bashTouchesVault(`grep -r x ${root}`, root)).toBe(true)
    expect(bashTouchesVault('ls ../brain && cat aris/brain/x', root)).toBe(true)
    expect(bashTouchesVault('ls -la', root)).toBe(false)
  })
})

describe('git của kho', () => {
  it('commit thay đổi của aris; gom thay đổi bên ngoài', async () => {
    const root = await temp()
    const git = new VaultGit(root)
    if (!(await git.available())) return
    expect(await git.init()).toBe(true)
    expect(await git.init()).toBe(false)
    await ensureVault(root, [])
    expect(await git.commit('Tạo khuôn')).toMatch(/^[0-9a-f]{40}$/)
    expect(await git.commit('không đổi')).toBeUndefined()
    await writeFile(join(root, 'ca-nhan/wiki/nguoi/chi-ha.md'), '# Chị Hà\n')
    await writeFile(join(root, 'ca-nhan/nhat-ky/2026-10-25.md'), '# Nhật ký\n')
    expect((await git.pending()).sort()).toEqual([
      'ca-nhan/nhat-ky/2026-10-25.md',
      'ca-nhan/wiki/nguoi/chi-ha.md',
    ])
    expect(
      await git.commit('chỉ một tệp', ['ca-nhan/wiki/nguoi/chi-ha.md', 'hop-thu-vao/da-chuyen-di.md']),
    ).toBeTruthy()
    expect(await git.pending()).toEqual(['ca-nhan/nhat-ky/2026-10-25.md'])
    expect(existsSync(join(root, '.git'))).toBe(true)
    expect(sweepMessage('Tầu', ['a/b.md', 'c.md', 'd.md', 'e.md', 'f.md'])).toBe(
      'Tầu sửa: b.md, c.md, d.md (+2)',
    )
  })
})

describe('hỏi bộ não', () => {
  it('trích dẫn theo thứ tự xuất hiện, không trùng; ký ức tách riêng', () => {
    const a =
      'Quý 4 dành 15 triệu [[ke-hoach-quy-4]]. Từ tháng 11 tăng lên 60 triệu [[kenh-youtube-q4|Kênh]]. ' +
      'Giữ dưới 30% [[ky-uc:m-abc]]. Nhắc lại [[ke-hoach-quy-4]].'
    expect(citations(a).map(({ kind, ref }) => [kind, ref])).toEqual([
      ['page', 'ke-hoach-quy-4'],
      ['page', 'kenh-youtube-q4'],
      ['mem', 'm-abc'],
    ])
    expect(citations(a)[1]!.at).toBe(a.indexOf('[[kenh'))
  })

  it('phạm vi và lời nhờ Thủ thư', () => {
    expect(scopeLabel({ memory: false })).toBe('Toàn bộ (Cá nhân và Công ty)')
    expect(scopeLabel({ space: 'cong-ty', dept: 'chung', memory: true })).toBe(
      'Công ty · chung, cả ký ức các bot',
    )
    expect(scopeLabel({ space: 'cong-ty', dept: 'tang-truong', memory: false }, 'Tăng trưởng')).toBe(
      'Công ty · phòng Tăng trưởng (gồm phần chung)',
    )
    const p = askPrompt({ question: 'Chị Hà là ai?', scope: { memory: false }, today: '2026-10-25' })
    expect(p).toContain('Câu hỏi: Chị Hà là ai?')
    expect(p).toContain('Chưa thấy trong bộ não.')
    expect(p).not.toContain('brain_memory')
    expect(askPrompt({ question: 'x', scope: { memory: true }, today: '2026-10-25' })).toContain(
      '[[ky-uc:mã]]',
    )
  })
})
