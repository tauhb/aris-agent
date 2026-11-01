// Đóng gói phần giao diện (src/client/index.tsx) của các package aris thành
// lib/client.js theo đúng định dạng `window.__ModuleLoader__` mà Web client của
// dsh nạp. React và mọi gói @deepseek-ai/* để ngoài: dsh cung cấp lúc chạy.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { repoRoot } from './paths.mjs'

const EXTERNAL = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*']

export async function buildClient(dir) {
  const entry = join(dir, 'src/client/index.tsx')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: EXTERNAL,
    // Phông chữ (Inter của giao diện GĐ9) nhúng thẳng vào gói, không cần mạng.
    loader: { '.woff2': 'dataurl' },
    legalComments: 'none',
    logLevel: 'warning',
  })
  const body = result.outputFiles[0].text
  const out = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`
  writeFileSync(join(dir, 'lib/client.js'), out)
  return { name: pkg.name, bytes: out.length }
}

const packages = join(repoRoot, 'packages')
for (const name of readdirSync(packages)) {
  const dir = join(packages, name)
  if (!existsSync(join(dir, 'src/client/index.tsx'))) continue
  const { name: pkg, bytes } = await buildClient(dir)
  console.log(`client: ${pkg} → lib/client.js (${(bytes / 1024).toFixed(1)} KB)`)
}
