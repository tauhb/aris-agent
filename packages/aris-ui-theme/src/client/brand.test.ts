import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRODUCT, arisTitle, faviconHref } from './brand.js'
import { DSH_ANCHORS, OVERRIDES_CSS } from './overrides.js'

describe('nhận diện aris', () => {
  it('đổi tên sản phẩm ở cuối tiêu đề tab, giữ tên phiên', () => {
    expect(arisTitle('DeepSeek Harness')).toBe(PRODUCT)
    expect(arisTitle('Chào aris — DeepSeek Harness')).toBe('Chào aris — aris')
    expect(arisTitle('Trang khác')).toBe('Trang khác')
  })

  it('biểu tượng tab là SVG nội tuyến, bản tối dùng màu chữ sáng', () => {
    expect(faviconHref('light')).toMatch(/^data:image\/svg\+xml,/)
    expect(decodeURIComponent(faviconHref('dark'))).toContain('#EDEEF1')
  })

  it('có biến viền phụ kiện cho cả nền sáng và nền tối', () => {
    expect(OVERRIDES_CSS).toContain(':root{--acc-edge:transparent}')
    expect(OVERRIDES_CSS).toContain('body[data-ds-dark-theme]{--acc-edge:rgba(255,255,255,.45)}')
  })
})

describe('chỉnh CSS bám lớp của dsh', () => {
  // Phần băm của tên lớp đổi theo đường dẫn build dsh: CSS của aris không được ghi cứng phần băm,
  // và các điểm bám (đuôi tên cục bộ, thuộc tính data-*) phải còn đủ và còn duy nhất mỗi khi nâng dsh.
  // Gói client của dsh nằm trong kho pnpm (dsh kéo vào), không phải phụ thuộc của theme.
  const store = fileURLToPath(new URL('../../../../node_modules/.pnpm/node_modules/', import.meta.url))
  const scope = `${store}@deepseek-ai/`
  const clientOf = (pkg: string) => readFileSync(`${store}${pkg}/lib/client.js`, 'utf8')
  const allClients = () =>
    readdirSync(scope)
      .filter((d) => existsSync(`${scope}${d}/lib/client.js`))
      .map((d) => [d, readFileSync(`${scope}${d}/lib/client.js`, 'utf8')] as const)

  it('CSS không còn tên lớp có phần băm 6 ký tự', () => {
    expect(OVERRIDES_CSS).not.toMatch(/[A-Za-z0-9]{6}_[A-Za-z]/)
  })

  it('đuôi _bubble chỉ có ở đúng ba gói và đúng ba lớp', () => {
    const where = new Set<string>()
    for (const [d, src] of allClients()) {
      for (const m of src.matchAll(/\b[A-Za-z0-9]+_bubble[A-Za-z0-9_-]*/g)) {
        expect(m[0], d).toMatch(/^[A-Za-z0-9]{6}_bubble$/)
        where.add(`@deepseek-ai/${d}`)
      }
    }
    expect([...where].sort()).toEqual([...DSH_ANCHORS.bubble.packages].sort())
    expect(OVERRIDES_CSS).toContain(`[class*="${DSH_ANCHORS.bubble.suffix}"]`)
  })

  it('thẻ duyệt còn đủ thuộc tính và đuôi lớp, thuộc tính chỉ do gói duyệt vẽ ra', () => {
    const { package: pkg, attributes, suffixes } = DSH_ANCHORS.approval
    const src = clientOf(pkg)
    for (const a of attributes) {
      expect(src, a).toContain(`"${a}"`)
      expect(OVERRIDES_CSS, a).toContain(`[${a}`)
    }
    for (const s of suffixes) {
      expect(src, s).toMatch(new RegExp(`\\.[A-Za-z0-9]{6}${s}\\{`))
      expect(OVERRIDES_CSS, s).toContain(`[class*="${s}"]`)
    }
    // Thuộc tính chỉ là điểm bám nếu gói khác không vẽ ra cùng thuộc tính (gói hội thoại chỉ đọc nó).
    for (const [d, other] of allClients())
      if (`@deepseek-ai/${d}` !== pkg)
        for (const a of attributes) expect(other, `${d} ${a}`).not.toMatch(new RegExp(`["']${a}["']\\s*:`))
  })
})
