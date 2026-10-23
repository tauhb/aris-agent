import { describe, expect, it } from 'vitest'
import { blocks, inline, isSilent, preview, table, toTelegramHtml } from './format.js'

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

  it('bảng lớn thành khối chữ thẳng cột', () => {
    const header = ['A', 'B', 'C', 'D', 'E']
    const out = table(header, [['1', '2', '3', '4', '5']])
    expect(out).toBe('<pre>A │ B │ C │ D │ E\n──┼───┼───┼───┼──\n1 │ 2 │ 3 │ 4 │ 5</pre>')
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
