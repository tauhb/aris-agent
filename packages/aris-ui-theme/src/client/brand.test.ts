import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRODUCT, arisTitle, faviconHref } from './brand.js'
import { DSH_CLASSES, OVERRIDES_CSS } from './overrides.js'

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
})

describe('chỉnh CSS bám lớp của dsh', () => {
  // Lớp đã băm đổi theo bản dsh: khi nâng dsh mà lớp mất, CSS lặng lẽ hết tác dụng.
  // Gói client của dsh nằm trong kho pnpm (dsh kéo vào), không phải phụ thuộc của theme.
  const store = fileURLToPath(new URL('../../../../node_modules/.pnpm/node_modules/', import.meta.url))
  for (const [pkg, classes] of Object.entries(DSH_CLASSES)) {
    it(`${pkg} còn đủ lớp`, () => {
      const src = readFileSync(`${store}${pkg}/lib/client.js`, 'utf8')
      for (const c of classes) {
        expect(src, c).toContain(`.${c}{`)
        expect(OVERRIDES_CSS, c).toContain(`.${c}{`)
      }
    })
  }
})
