import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { htmlTitle, safeUrl, sourceFile, sourceText, stripHtml } from './extract.js'
import { merge3, parseLog, VaultGit } from './git.js'
import { eventKind } from './index.js'
import {
  checkDraftPath,
  classifyPrompt,
  inboxName,
  librarianPrompt,
  nextToPlan,
  pageSummary,
  parseClassify,
  renderIndex,
  review,
  stampFront,
  staleAction,
  type Batch,
  type Op,
} from './ingest.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

const op = (o: Partial<Op> & Pick<Op, 'path' | 'kind'>): Op => ({ title: 't', next: 'x', summary: 's', ...o })
const src = (o: Partial<Batch['source']> = {}): Batch['source'] => ({
  path: 'hop-thu-vao/a.md',
  title: 'A',
  kind: 'tai-lieu',
  from: 'web',
  ...o,
})

describe('mức duyệt', () => {
  it('tự nạp: chỉ tóm tắt và liên kết, hay nhật ký; có ⚠ thì không bao giờ tự nạp', () => {
    const light = review(
      {
        source: src(),
        ops: [
          op({ path: 'ca-nhan/wiki/tom-tat/a.md', kind: 'moi' }),
          op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'lien-ket', base: 'b' }),
        ],
      },
      () => false,
    )
    expect(light.level).toBe('tu-nap')
    const add = review(
      { source: src(), ops: [op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'bo-sung', base: 'b' })] },
      () => false,
    )
    expect(add.level).toBe('nhanh')
    const diary = review(
      {
        source: src({ kind: 'nhat-ky', from: 'tu-dong' }),
        ops: [op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'bo-sung', base: 'b' })],
      },
      () => false,
    )
    expect(diary.level).toBe('tu-nap')
    const edited = review(
      {
        source: src({ kind: 'nhat-ky', from: 'tu-dong' }),
        ops: [op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'bo-sung', base: 'b' })],
      },
      () => true,
    )
    expect(edited.level).toBe('ky')
    expect(edited.ops[0]!.flag).toContain('sửa tay')
  })

  it('duyệt kỹ: Thủ thư báo mâu thuẫn, sửa ý cũ, trang Người khi nguồn nhạy cảm, đụng phòng ban', () => {
    expect(
      review(
        { source: src(), ops: [op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'bo-sung', warn: 'mâu thuẫn' })] },
        () => false,
      ).level,
    ).toBe('ky')
    expect(
      review(
        { source: src(), ops: [op({ path: 'ca-nhan/wiki/du-an/x.md', kind: 'sua-y', base: 'b' })] },
        () => false,
      ).level,
    ).toBe('ky')
    const s = review(
      { source: src(), sensitive: true, ops: [op({ path: 'ca-nhan/wiki/nguoi/ha.md', kind: 'moi' })] },
      () => false,
    )
    expect(s.ops[0]!.flag).toContain('nhạy cảm')
    expect(
      review(
        { source: src(), ops: [op({ path: 'cong-ty/wiki/phong-ban/van-hanh/tom-tat/a.md', kind: 'moi' })] },
        () => false,
      ).level,
    ).toBe('ky')
  })

  it('thứ tự lập: nguồn của người dùng trước nguồn bot gửi', () => {
    const b = (id: string, from: Batch['source']['from'], at: string): Batch => ({
      id,
      createdAt: at,
      updatedAt: at,
      status: 'moi',
      source: src({ from }),
      ops: [],
      cost: 0,
    })
    expect(
      nextToPlan([b('1', 'bot', '2026-10-25T01:00:00Z'), b('2', 'web', '2026-10-25T02:00:00Z')])?.id,
    ).toBe('2')
    expect(
      nextToPlan([b('1', 'web', '2026-10-25T01:00:00Z'), b('2', 'web', '2026-10-25T02:00:00Z')])?.id,
    ).toBe('1')
  })
})

describe('bản nháp và trang', () => {
  it('đường dẫn Thủ thư được ghi', () => {
    expect(checkDraftPath('ca-nhan/wiki/nguoi/chi-ha.md', 'ca-nhan')).toBeUndefined()
    expect(checkDraftPath('cong-ty/wiki/nguoi/x.md', 'ca-nhan')).toContain('ca-nhan/wiki/')
    expect(checkDraftPath('ca-nhan/wiki/nguoi/Chị Hà.md', 'ca-nhan')).toContain('chi-ha.md')
    expect(checkDraftPath('ca-nhan/wiki/../nguon/a.md', 'ca-nhan')).toBeTruthy()
    expect(checkDraftPath('ca-nhan/wiki/a.txt', 'ca-nhan')).toBeTruthy()
  })

  it('nhãn tom-tat và cap-nhat: thêm, thay, tạo đầu trang khi chưa có', () => {
    const a = stampFront('---\nloai: nguoi\ntom-tat: cũ\n---\n\n# Hà\n', {
      'tom-tat': 'Editor: dựng video',
      'cap-nhat': '2026-10-25',
    })
    expect(a).toContain('tom-tat: "Editor: dựng video"')
    expect(a).toContain('cap-nhat: 2026-10-25')
    expect(a).toContain('loai: nguoi')
    expect(pageSummary(a)).toBe('Editor: dựng video')
    expect(stampFront('# Hà\n', { 'tom-tat': 'x' })).toBe('---\ntom-tat: x\n---\n\n# Hà\n')
  })

  it('mục lục: theo loại; Công ty chia theo phòng', () => {
    const md = renderIndex(
      'Công ty',
      [
        { path: 'cong-ty/wiki/chung/khach-hang/abc.md', name: 'abc', title: 'ABC', summary: 'Khách lớn' },
        {
          path: 'cong-ty/wiki/phong-ban/van-hanh/quy-trinh/duyet.md',
          name: 'duyet',
          title: 'Duyệt',
          summary: undefined,
        },
        { path: 'cong-ty/wiki/phong-ban/van-hanh/_phong-ban.md', name: '_phong-ban', title: 'Phòng' },
      ],
      [{ id: 'van-hanh', name: 'Vận hành' }],
    )
    expect(md).toContain('## Chung')
    expect(md).toContain('### Khách hàng')
    expect(md).toContain('- [[abc]] — Khách lớn')
    expect(md).toContain('## Phòng Vận hành')
    expect(md).toContain('- [[duyet]] — Duyệt')
    expect(md).not.toContain('_phong-ban')
  })

  it('phân loại: đọc JSON, phòng ban phải có thật, chỉ trong Công ty', () => {
    const depts = [{ id: 'van-hanh', name: 'Vận hành' }]
    expect(classifyPrompt('chữ', 'A', depts)).toContain('van-hanh (Vận hành)')
    expect(
      parseClassify(
        '```json\n{"khong_gian":"cong-ty","phong_ban":"van-hanh","tieu_de":"Quy trình","tom_tat":"x","nhay_cam":false}\n```',
        depts,
      ),
    ).toEqual({ space: 'cong-ty', dept: 'van-hanh', title: 'Quy trình', summary: 'x', sensitive: false })
    expect(parseClassify('{"khong_gian":"ca-nhan","phong_ban":"van-hanh"}', depts)).toEqual({
      space: 'ca-nhan',
      sensitive: false,
    })
    expect(parseClassify('{"khong_gian":"cong-ty","phong_ban":"khong-co"}', depts)?.dept).toBeUndefined()
    expect(parseClassify('không có json', depts)).toBeUndefined()
    expect(parseClassify('{"khong_gian":"ca-nhan","tieu_de":null,"nhay_cam":"true"}', depts)).toEqual({
      space: 'ca-nhan',
      sensitive: true,
    })
  })

  it('lời giao Thủ thư: thư mục được ghi, tên nguồn để trích, lời nhờ sửa', () => {
    const p = librarianPrompt({
      rules: 'LUẬT',
      spaceRules: 'LUẬT KHÔNG GIAN',
      index: '',
      space: 'cong-ty',
      dept: 'van-hanh',
      source: {
        path: 'hop-thu-vao/2026-10-25-0912-bao-cao.md',
        title: 'Báo cáo',
        text: 'nội dung',
        kind: 'tai-lieu',
      },
      revise: ['ghi rõ hai mốc'],
      today: '2026-10-25',
    })
    expect(p).toContain('cong-ty/wiki/phong-ban/van-hanh/tom-tat/')
    expect(p).toContain('[^1]: [[2026-10-25-0912-bao-cao]]')
    expect(p).toContain('- ghi rõ hai mốc')
    expect(p).toContain('(trống)')
  })

  it('hạn chờ duyệt, tên tệp nguồn', () => {
    const now = new Date('2026-11-30T00:00:00Z')
    expect(staleAction({ status: 'cho-duyet', updatedAt: '2026-11-20T00:00:00Z' }, now)).toBe('remind')
    expect(
      staleAction({ status: 'cho-duyet', updatedAt: '2026-11-20T00:00:00Z', remindedAt: 'x' }, now),
    ).toBeUndefined()
    expect(staleAction({ status: 'cho-duyet', updatedAt: '2026-10-25T00:00:00Z' }, now)).toBe('expire')
    expect(staleAction({ status: 'da-nap', updatedAt: '2026-10-25T00:00:00Z' }, now)).toBeUndefined()
    expect(inboxName(new Date(2026, 9, 25, 9, 12), 'Xu hướng video ngắn 2026')).toBe(
      '2026-10-25-0912-xu-huong-video-ngan-2026.md',
    )
  })
})

describe('trích chữ', () => {
  it('link an toàn, tiêu đề trang, bỏ phần không phải nội dung, tệp nguồn', () => {
    expect(safeUrl('https://example.com/a')?.hostname).toBe('example.com')
    expect(safeUrl('file:///etc/passwd')).toBeUndefined()
    expect(safeUrl('http://localhost:3201/')).toBeUndefined()
    expect(safeUrl('http://192.168.1.2/')).toBeUndefined()
    expect(htmlTitle('<html><head><title> Xu hướng &amp; số liệu </title></head>')).toBe('Xu hướng & số liệu')
    expect(htmlTitle('<meta property="og:title" content="Tiêu đề OG"><title>khác</title>')).toBe('Tiêu đề OG')
    expect(stripHtml('<p>giữ</p><script>bỏ()</script><nav>menu</nav>')).not.toContain('bỏ')
    const f = sourceFile({
      title: 'Bài: A',
      text: 'nội dung',
      url: 'https://x.vn/a',
      from: 'web',
      at: new Date('2026-10-25T02:00:00Z'),
    })
    expect(f).toContain('tieu-de: "Bài: A"')
    expect(sourceText(f)).toBe('# Bài: A\n\nNguồn: https://x.vn/a\n\nnội dung')
  })
})

describe('git của kho: gộp ba chiều, hoàn tác, lịch sử', () => {
  it('gộp được khi sửa chỗ khác nhau; trùng chỗ thì báo', async () => {
    const base = 'một\nhai\nba\nbốn\nnăm\n'
    const ok = await merge3('một sửa tay\nhai\nba\nbốn\nnăm\n', base, 'một\nhai\nba\nbốn\nnăm thêm ý\n')
    expect(ok.clean).toBe(true)
    expect(ok.text).toBe('một sửa tay\nhai\nba\nbốn\nnăm thêm ý\n')
    const bad = await merge3('một A\nhai\n', 'một\nhai\n', 'một B\nhai\n')
    expect(bad.clean).toBe(false)
  })

  it('hoàn tác kèm dòng nhật ký; lịch sử theo thư mục; loại sự kiện', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-brain-git-'))
    dirs.push(root)
    const git = new VaultGit(root)
    if (!(await git.available())) return
    await git.init()
    await writeFile(join(root, 'a.md'), 'một\n')
    await writeFile(join(root, 'log.md'), '# log\n')
    await git.commit('Tạo')
    await writeFile(join(root, 'a.md'), 'một\nhai\n')
    const sha = (await git.commit('Nạp: Báo cáo'))!
    const back = await git.revert(sha, `Hoàn tác: Nạp: Báo cáo (${sha.slice(0, 7)})`, async () => {
      await writeFile(join(root, 'log.md'), '# log\n- hoàn tác\n')
      return ['log.md']
    })
    expect(back).toMatch(/^[0-9a-f]{40}$/)
    const log = await git.log('.', 1)
    expect(log.map((c) => c.subject)).toEqual([
      `Hoàn tác: Nạp: Báo cáo (${sha.slice(0, 7)})`,
      'Nạp: Báo cáo',
      'Tạo',
    ])
    expect(log[0]!.files.map((f) => f.path).sort()).toEqual(['a.md', 'log.md'])
    expect(await git.has(sha)).toBe(true)
    expect(await git.has('0000000')).toBe(false)
    expect(parseLog('\x1eabc\t1700000000\tNạp: X\nM\ta.md\n')).toEqual([
      { sha: 'abc', at: 1_700_000_000_000, subject: 'Nạp: X', files: [{ status: 'M', path: 'a.md' }] },
    ])
    expect(eventKind('Nạp: X', 'Tầu')).toBe('nap')
    expect(eventKind('Tầu sửa: a.md, b.md', 'Tầu')).toBe('sua-obsidian')
    expect(eventKind('Tầu sửa Chị Hà', 'Tầu')).toBe('sua')
    expect(eventKind('Tầu ghi nhanh', 'Tầu')).toBe('ghi-nhanh')
    expect(eventKind('Tạo khuôn bộ não', 'Tầu')).toBe('he-thong')
  })
})
