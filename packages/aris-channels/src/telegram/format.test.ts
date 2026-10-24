import { describe, expect, it } from 'vitest'
import { blocks, inline, isSilent, nameTeam, preview, table, toTelegramHtml } from './format.js'

describe('định dạng Telegram', () => {
  it('định dạng trong dòng, thoát ký tự HTML', () => {
    expect(inline('**đậm** và *nghiêng*, `a<b>` [link](https://x.vn/a?b=1&c=2) ~~bỏ~~ 3 < 4')).toBe(
      '<b>đậm</b> và <i>nghiêng</i>, <code>a&lt;b&gt;</code> <a href="https://x.vn/a?b=1&amp;c=2">link</a> <s>bỏ</s> 3 &lt; 4',
    )
    expect(inline('snake_case_name và 2*3*4')).toBe('snake_case_name và 2*3*4')
  })

  it('tiêu đề, danh sách, việc cần làm, trích dẫn, khối mã', () => {
    const md =
      '# Kế hoạch\n- một\n  - con\n- [x] xong\n- [ ] chưa\n\n> ghi chú\n\n```ts\nconst a = 1 < 2\n```'
    expect(blocks(md)).toEqual([
      '<b>Kế hoạch</b>',
      '• một\n   • con\n☑ xong\n☐ chưa',
      '<blockquote>ghi chú</blockquote>',
      '<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>',
    ])
  })

  it('bảng nhỏ thành danh sách theo dòng', () => {
    const md = '| Ngày | Việc |\n|---|---|\n| T2 | **Quay** video |\n| T3 | Họp |'
    expect(blocks(md)).toEqual(['• <b>T2</b>\n   Việc: <b>Quay</b> video\n• <b>T3</b>\n   Việc: Họp'])
  })

  it('bảng lớn cũng thành danh sách, mục nhiều dòng cách nhau dòng trống', () => {
    const header = ['#', 'Phong cách', 'Hợp với', 'Lưu ý', 'Nguồn']
    const out = table(header, [
      ['1', 'Đời thường', 'Facebook', 'Tránh nhìn ống kính', 'Tự soạn'],
      ['2', 'Flat-lay', 'Bài hướng dẫn', '', 'Tự soạn'],
    ])
    expect(out).toBe(
      '• <b>1</b>\n   Phong cách: Đời thường\n   Hợp với: Facebook\n   Lưu ý: Tránh nhìn ống kính\n   Nguồn: Tự soạn' +
        '\n\n• <b>2</b>\n   Phong cách: Flat-lay\n   Hợp với: Bài hướng dẫn\n   Nguồn: Tự soạn',
    )
  })

  it('chia tin dài theo khối, khối mã dài chia theo dòng giữ thẻ', () => {
    const para = 'x'.repeat(60)
    const md = Array.from({ length: 10 }, () => para).join('\n\n')
    const chunks = toTelegramHtml(md, 200)
    expect(chunks.every((c) => c.length <= 200)).toBe(true)
    expect(chunks.join('\n\n')).toBe(blocks(md).join('\n\n'))
    const code = '```\n' + Array.from({ length: 50 }, (_, i) => `dòng ${i}`).join('\n') + '\n```'
    const parts = toTelegramHtml(code, 120)
    expect(parts.length).toBeGreaterThan(1)
    expect(
      parts.every((p) => p.startsWith('<pre><code>') && p.endsWith('</code></pre>') && p.length <= 120),
    ).toBe(true)
  })

  it('xem trước và im lặng chủ động', () => {
    expect(preview('abcdef', 4)).toBe('abc…')
    expect(isSilent(' [SILENT] ')).toBe(true)
    expect(isSilent('NO_REPLY')).toBe(true)
    expect(isSilent('Dùng [SILENT] khi không có gì')).toBe(false)
  })
})

describe('tên thành viên đội', () => {
  const team = [
    { handle: 'tho', name: 'Thơ', color: '#FF309C' },
    { handle: 'minh', name: 'Minh', color: '#00B5A5' },
    { handle: 'aris', name: 'Aris', color: '#1084FE' },
    { handle: 'kiet', name: 'Kiệt', color: '#64748B' },
    { handle: 'phat', name: 'Phát', color: '#FF4D5A' },
  ]
  it('đổi @tên_gọi thành chấm màu và tên in đậm', () => {
    expect(nameTeam('em cho @tho soạn, @minh lấy mồi', team)).toBe(
      'em cho 🩷 **Thơ** soạn, 🩵 **Minh** lấy mồi',
    )
    expect(nameTeam('@aris, @phat và @kiet.', team)).toBe('🔵 **Aris**, 🔴 **Phát** và 🩶 **Kiệt**.')
  })
  it('giữ nguyên @ của người lạ, email, và trong mã', () => {
    const md = 'Hỏi @someone_bot, gửi a@tho.vn, chạy `git log @tho` và\n```\n@minh\n```'
    expect(nameTeam(md, team)).toBe(md)
  })
  it('đi qua định dạng HTML thành chữ đậm', () => {
    expect(toTelegramHtml(nameTeam('Giao cho @tho.', team))[0]).toBe('Giao cho 🩷 <b>Thơ</b>.')
  })
})
