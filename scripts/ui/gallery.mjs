// Vẽ trang thử bộ thành phần (`packages/aris-ui-kit/gallery/Gallery.tsx`) thành
// HTML tĩnh, nền sáng và tối cạnh nhau, để đối chiếu với canvas.
// Dùng: node scripts/ui/gallery.mjs [tệp-ra.html]   (mặc định docs/giao-dien/thanh-phan.html)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { repoRoot } from '../paths.mjs'

// Đóng gói vào node_modules/.cache để `react` vẫn tìm được từ node_modules của dự án.
const cache = join(repoRoot, 'node_modules/.cache/aris-gallery')
mkdirSync(cache, { recursive: true })
const outfile = join(cache, 'gallery.mjs')
await build({
  entryPoints: [join(repoRoot, 'packages/aris-ui-kit/gallery/Gallery.tsx')],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'warning',
})
const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const target = process.argv[2] ?? join(repoRoot, 'docs/giao-dien/thanh-phan.html')
writeFileSync(target, mod.renderGallery())
console.log(`đã ghi ${target}`)
