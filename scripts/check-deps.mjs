// Chặn mọi phụ thuộc và lệnh import tới mã nguồn Hermes Agent (NousResearch).
// aris tham khảo thiết kế của Hermes nhưng không sao chép, không import.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './paths.mjs'

/** Tên gói hoặc nguồn bị cấm trong lockfile. */
export const FORBIDDEN_PACKAGES = [
  /(^|[\s'"/])@nousresearch\//i,
  /(^|[\s'"/])hermes-agent(@|['"\s:]|$)/i,
  /github\.com[/:]nousresearch\//i,
]
/** Lệnh import trỏ tới Hermes trong mã của aris. */
export const FORBIDDEN_IMPORT =
  /\b(?:from|import|require)\s*\(?\s*['"][^'"]*(?:hermes-agent|nousresearch|hermes_cli|hermes_state)[^'"]*['"]/i

export function findForbiddenPackages(lockText) {
  return lockText.split('\n').filter((line) => FORBIDDEN_PACKAGES.some((re) => re.test(line)))
}

export function findForbiddenImports(source) {
  return source.split('\n').filter((line) => FORBIDDEN_IMPORT.test(line))
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* sourceFiles(path)
    else if (/\.(c|m)?(t|j)sx?$/.test(name)) yield path
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findForbiddenPackages(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8')).map(
    (l) => `pnpm-lock.yaml: ${l.trim()}`,
  )
  for (const dir of ['packages', 'scripts']) {
    for (const file of sourceFiles(join(repoRoot, dir))) {
      if (file.endsWith('check-deps.mjs') || file.endsWith('checks.test.mjs')) continue
      for (const line of findForbiddenImports(readFileSync(file, 'utf8'))) {
        problems.push(`${relative(repoRoot, file)}: ${line.trim()}`)
      }
    }
  }
  if (problems.length) {
    console.error('Phát hiện phụ thuộc hoặc import tới Hermes Agent:\n' + problems.join('\n'))
    process.exit(1)
  }
  console.log('check-deps: không có phụ thuộc hay import nào tới Hermes Agent')
}
