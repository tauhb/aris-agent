/**
 * Nhập skill từ ngoài (giai đoạn 8, plan 8.1): phần đọc mạng và đĩa. Tải bản nén từ GitHub về thư mục tạm, quét thư
 * mục skill của Claude Code và Codex trên máy, đọc `SKILL.md` và tệp kèm, rồi nộp thành đề xuất chờ duyệt vào kho
 * của đội. KHÔNG bao giờ chạy tệp nào trong thư mục đã tải: chỉ đọc chữ.
 */
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  MAX_DEPTH,
  chooseFiles,
  findSkillDirs,
  parseGithubUrl,
  parseSkillMd,
  scanImported,
  toAris,
  withFilesSection,
  type FileEntry,
  type GithubRef,
} from './import.js'
import {
  skillId,
  TEAM_OWNER,
  versionId,
  type Assigned,
  type ImportSource,
  type SkillStore,
  type VersionRecord,
} from './store.js'

export class ImportError extends Error {}

/** Gốc dữ liệu của aris trên máy (`~/.aris`). */
export const arisDir = () => join(homedir(), '.aris')

const MAX_TAR_BYTES = 20 * 1024 * 1024
const MAX_TAR_FILES = 5000
const MAX_SKILLS_PER_SCAN = 500
export const MAX_IMPORT_PER_RUN = 30
const SKIP = new Set(['node_modules', '.git'])

// --- Duyệt thư mục ---------------------------------------------------------------------------------------------

interface WalkOptions {
  maxDepth: number
  maxEntries: number
  /** Bỏ thư mục tên này (ngoài `node_modules` và `.git`). */
  skip?: ReadonlySet<string>
  /** Bỏ thư mục bắt đầu bằng dấu chấm. */
  skipDot?: boolean
  /** Đi theo liên kết tượng trưng (chỉ cho thư mục của chính người dùng trên máy, không bao giờ cho bản tải về). */
  followLinks?: boolean
}

/** Liệt kê tệp (không đi theo liên kết tượng trưng), đường dẫn tương đối dạng `a/b/c`. */
export async function walkFiles(root: string, o: WalkOptions): Promise<string[]> {
  const out: string[] = []
  const queue: { dir: string; rel: string; depth: number }[] = [{ dir: root, rel: '', depth: 0 }]
  // Thư mục đã đi qua (theo đường thật), để vòng liên kết không làm lặp vô hạn.
  const seen = new Set<string>([await realpath(root).catch(() => root)])
  while (queue.length > 0) {
    const { dir, rel, depth } = queue.shift()!
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      let isDir = e.isDirectory()
      let isFile = e.isFile()
      if (e.isSymbolicLink()) {
        if (!o.followLinks) continue
        const target = await stat(join(dir, e.name)).catch(() => undefined)
        if (!target) continue
        isDir = target.isDirectory()
        isFile = target.isFile()
        if (isDir) {
          const real = await realpath(join(dir, e.name)).catch(() => undefined)
          if (!real || seen.has(real)) continue
          seen.add(real)
        }
      }
      const p = rel ? `${rel}/${e.name}` : e.name
      if (isDir) {
        if (SKIP.has(e.name) || o.skip?.has(e.name) || (o.skipDot && e.name.startsWith('.'))) continue
        if (depth < o.maxDepth) queue.push({ dir: join(dir, e.name), rel: p, depth: depth + 1 })
      } else if (isFile) {
        out.push(p)
        if (out.length > o.maxEntries)
          throw new ImportError(`Có quá ${o.maxEntries} tệp, không quét hết được.`)
      }
    }
  }
  return out
}

async function sizesOf(root: string, rels: readonly string[]): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  for (const path of rels) {
    const st = await stat(join(root, path)).catch(() => undefined)
    if (st?.isFile()) out.push({ path, size: st.size })
  }
  return out
}

// --- Kết quả quét ------------------------------------------------------------------------------------------------

export interface ScanItem {
  /** Khoá trong lần quét: đường tương đối của thư mục skill. */
  key: string
  name: string
  description: string
  /** Thư mục skill (tuyệt đối). */
  dir: string
  /** Đường tương đối so với gốc quét. */
  rel: string
  files: number
  dropped: number
  risks: string[]
  /** Thân dài quá giới hạn nhập: không nhập được. */
  error?: string | undefined
}

export interface ScanResult {
  id: string
  at: number
  kind: ImportSource['kind']
  /** Nhãn cho giao diện: `chủ/repo`, "Claude Code"… */
  label: string
  /** Gốc quét (thư mục tạm với GitHub, thư mục thật với nguồn trên máy). */
  root: string
  /** Thư mục tạm cần xoá khi xong (chỉ GitHub). */
  tmp?: string | undefined
  github?: { repo: string; ref: string; sha: string | undefined; path: string }
  /** Kho dựng sẵn: gói và bản của từng skill trong gói (theo tên). */
  library?: { pack: string; versions: Record<string, number> }
  items: ScanItem[]
}

async function describeDir(root: string, rel: string): Promise<ScanItem | undefined> {
  const dir = rel ? join(root, ...rel.split('/')) : root
  const skillFile = (await readdir(dir).catch(() => [])).find((f) => /^skill\.md$/i.test(f))
  if (!skillFile) return undefined
  const text = await readFile(join(dir, skillFile), 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  const parsed = parseSkillMd(text)
  const draft = toAris(parsed, basename(dir))
  const all = await walkFiles(dir, { maxDepth: 4, maxEntries: 500 }).catch(() => [])
  const choice = chooseFiles(await sizesOf(dir, all))
  const scripts = await Promise.all(
    choice.keep
      .filter((f) => /\.(sh|bash|zsh)$/i.test(f))
      .map(async (path) => ({ path, text: await readFile(join(dir, path), 'utf8').catch(() => '') })),
  )
  return {
    key: rel || '.',
    name: draft.name,
    description: draft.description,
    dir,
    rel,
    files: choice.keep.length,
    dropped: choice.dropped.length,
    risks: scanImported(draft.body, scripts),
    ...(parsed.badFrontmatter ? { error: 'Phần đầu tệp (frontmatter) không đọc được.' } : {}),
  }
}

/** Quét một thư mục: mọi thư mục con có `SKILL.md`. */
export async function scanDirectory(
  root: string,
  o: { maxDepth?: number; skip?: ReadonlySet<string>; skipDot?: boolean; followLinks?: boolean } = {},
): Promise<ScanItem[]> {
  const all = await walkFiles(root, {
    maxDepth: o.maxDepth ?? MAX_DEPTH + 1,
    maxEntries: 200_000,
    ...(o.skip ? { skip: o.skip } : {}),
    ...(o.skipDot ? { skipDot: true } : {}),
    ...(o.followLinks ? { followLinks: true } : {}),
  })
  const dirs = findSkillDirs(all).slice(0, MAX_SKILLS_PER_SCAN)
  const items: ScanItem[] = []
  for (const rel of dirs) {
    const item = await describeDir(root, rel)
    if (item) items.push(item)
  }
  return items
}

// --- Nguồn trên máy ----------------------------------------------------------------------------------------------

export async function scanClaudeCode(home = homedir()): Promise<ScanItem[]> {
  const own = await scanDirectory(join(home, '.claude', 'skills'), { skipDot: true, followLinks: true })
  // Skill trong các plugin đã cài; bỏ `cache` (bản sao trùng lặp của chính các plugin này).
  const plugins = await scanDirectory(join(home, '.claude', 'plugins', 'marketplaces'), {
    skip: new Set(['cache']),
    skipDot: true,
    followLinks: true,
  })
  return [
    ...own.map((i) => ({ ...i, key: `skills/${i.rel}` })),
    ...plugins.map((i) => ({ ...i, key: `plugins/${i.rel}` })),
  ]
}

export async function scanCodex(home = homedir()): Promise<ScanItem[]> {
  return (await scanDirectory(join(home, '.codex', 'skills'), { skipDot: true, followLinks: true })).map(
    (i) => ({
      ...i,
      key: `skills/${i.rel}`,
    }),
  )
}

export async function scanFolder(path: string): Promise<ScanItem[]> {
  const root = resolve(path)
  const st = await stat(root).catch(() => undefined)
  if (!st?.isDirectory()) throw new ImportError('Không thấy thư mục này trên máy.')
  const items = await scanDirectory(root, { skipDot: true, followLinks: true })
  // Chính thư mục này là một skill: rel rỗng, key theo tên thư mục.
  return items.map((i) => ({ ...i, key: i.rel || basename(root) }))
}

// --- GitHub ------------------------------------------------------------------------------------------------------

type Fetch = typeof fetch

const GH_HEADERS = {
  'user-agent': 'aris',
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
}

/** Mã commit hiện tại của `ref` (không có là nhánh mặc định). Hết lượt gọi API thì trả undefined (vẫn tải được). */
export async function latestSha(g: GithubRef, f: Fetch = fetch): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${g.owner}/${g.repo}/commits/${encodeURIComponent(g.ref ?? 'HEAD')}`
  const res = await f(url, { headers: GH_HEADERS }).catch(() => undefined)
  if (!res) throw new ImportError('Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.')
  if (res.status === 404 || res.status === 422)
    throw new ImportError(
      'Không tìm thấy repo hoặc nhánh này trên GitHub (repo riêng tư thì chưa nhập được).',
    )
  if (res.status === 403 || res.status === 429) return undefined
  if (!res.ok) throw new ImportError(`GitHub trả lỗi ${res.status}.`)
  const j = (await res.json().catch(() => ({}))) as { sha?: unknown }
  return typeof j.sha === 'string' ? j.sha : undefined
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolveRun, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d: Buffer) => (out += d.toString()))
    p.stderr.on('data', (d: Buffer) => (err += d.toString().slice(0, 2000)))
    p.on('error', reject)
    p.on('close', (code) => resolveRun({ code, out, err }))
  })
}

/** Tải rồi bung bản nén vào `dir`, kiểm số tệp và đường dẫn trước khi bung. Không bao giờ chạy gì trong đó. */
export async function extractTarball(file: string, dir: string): Promise<void> {
  const list = await run('tar', ['-tzf', file])
  if (list.code !== 0) throw new ImportError('Bản nén từ GitHub bị hỏng.')
  const names = list.out.split('\n').filter(Boolean)
  if (names.length > MAX_TAR_FILES)
    throw new ImportError(`Repo có hơn ${MAX_TAR_FILES} tệp, quá lớn để nhập.`)
  for (const n of names)
    if (n.startsWith('/') || n.split('/').includes('..'))
      throw new ImportError('Bản nén có đường dẫn không an toàn, đã dừng.')
  const x = await run('tar', ['-xzf', file, '-C', dir, '--no-same-owner'])
  if (x.code !== 0) throw new ImportError('Không bung được bản nén từ GitHub.')
  await removeLinks(dir)
}

/** Xoá mọi liên kết tượng trưng còn sót sau khi bung. */
async function removeLinks(dir: string): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) await rm(p, { force: true })
    else if (e.isDirectory()) await removeLinks(p)
    else if (((await lstat(p).catch(() => undefined))?.nlink ?? 1) > 1) await rm(p, { force: true })
  }
}

/** Mã commit đầy đủ ghi sẵn trong phần đầu (pax) của bản nén GitHub (`comment=<mã>`); không có thì undefined. */
export async function shaOfTarball(file: string): Promise<string | undefined> {
  const gunzip = createGunzip()
  const src = createReadStream(file, { end: 4095 })
  const head = await new Promise<Buffer>((resolveHead) => {
    const parts: Buffer[] = []
    let size = 0
    gunzip.on('data', (d: Buffer) => {
      parts.push(d)
      size += d.length
      if (size >= 2048) src.destroy()
    })
    gunzip.on('end', () => resolveHead(Buffer.concat(parts)))
    gunzip.on('error', () => resolveHead(Buffer.concat(parts)))
    src.on('close', () => gunzip.end())
    src.pipe(gunzip, { end: false })
  })
  return /comment=([0-9a-f]{40})\b/.exec(head.subarray(0, 2048).toString('latin1'))?.[1]
}

export interface Downloaded {
  /** Thư mục gốc của repo đã bung. */
  root: string
  /** Thư mục tạm chứa tất cả (xoá khi xong). */
  tmp: string
  sha: string | undefined
}

/** Tải một repo GitHub về thư mục tạm dưới `~/.aris/tmp`. */
export async function downloadGithub(g: GithubRef, f: Fetch = fetch): Promise<Downloaded> {
  const sha = await latestSha(g, f)
  const base = join(arisDir(), 'tmp')
  await mkdir(base, { recursive: true })
  const tmp = await mkdtemp(join(base, 'skill-import-'))
  try {
    const res = await f(
      `https://codeload.github.com/${g.owner}/${g.repo}/tar.gz/${encodeURIComponent(sha ?? g.ref ?? 'HEAD')}`,
      {
        headers: { 'user-agent': 'aris' },
      },
    ).catch(() => undefined)
    if (!res) throw new ImportError('Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.')
    if (res.status === 404)
      throw new ImportError(
        'Không tìm thấy repo hoặc nhánh này trên GitHub (repo riêng tư thì chưa nhập được).',
      )
    if (!res.ok || !res.body) throw new ImportError(`GitHub trả lỗi ${res.status} khi tải repo.`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_TAR_BYTES) throw new ImportError('Repo quá lớn (trên 20 MB) để nhập.')
    const file = join(tmp, 'repo.tar.gz')
    let size = 0
    const limit = async function* (src: AsyncIterable<Buffer>) {
      for await (const chunk of src) {
        size += chunk.length
        if (size > MAX_TAR_BYTES) throw new ImportError('Repo quá lớn (trên 20 MB) để nhập.')
        yield chunk
      }
    }
    await pipeline(Readable.fromWeb(res.body as never), limit as never, createWriteStream(file))
    const found = sha ?? (await shaOfTarball(file))
    const out = join(tmp, 'src')
    await mkdir(out)
    await extractTarball(file, out)
    await rm(file, { force: true })
    // Bản nén GitHub có đúng một thư mục gốc `chủ-repo-<mã>`.
    const top = await readdir(out, { withFileTypes: true })
    const dirs = top.filter((e) => e.isDirectory())
    const topDir = top.length === 1 && dirs.length === 1 ? dirs[0]!.name : undefined
    // Hết lượt gọi API thì lấy mã commit rút gọn từ tên thư mục gốc của bản nén (`chủ-repo-<mã>`).
    const short = topDir ? /-([0-9a-f]{7,40})$/.exec(topDir)?.[1] : undefined
    return { root: topDir ? join(out, topDir) : out, tmp, sha: found ?? short }
  } catch (e) {
    await rm(tmp, { recursive: true, force: true })
    throw e
  }
}

/** Quét một đường dẫn GitHub: tải, rồi tìm thư mục skill (trong `path` nếu có). */
export async function scanGithub(input: string, f: Fetch = fetch): Promise<ScanResult> {
  const g = parseGithubUrl(input)
  if (!g) throw new ImportError('Đường dẫn GitHub chưa đúng. Ví dụ: https://github.com/anthropics/skills')
  const d = await downloadGithub(g, f)
  try {
    const root = g.path ? resolve(d.root, ...g.path.split('/')) : d.root
    if (root !== d.root && !root.startsWith(d.root + sep))
      throw new ImportError('Đường dẫn trong repo không hợp lệ.')
    const st = await stat(root).catch(() => undefined)
    if (!st?.isDirectory()) throw new ImportError('Repo không có thư mục này.')
    const items = await scanDirectory(root, { skipDot: true })
    return {
      id: '',
      at: Date.now(),
      kind: 'github',
      label: `${g.owner}/${g.repo}`,
      root,
      tmp: d.tmp,
      github: { repo: `${g.owner}/${g.repo}`, ref: g.ref ?? 'HEAD', sha: d.sha, path: g.path ?? '' },
      items,
    }
  } catch (e) {
    await rm(d.tmp, { recursive: true, force: true })
    throw e
  }
}

// --- Nộp thành đề xuất -----------------------------------------------------------------------------------------

/** Thư mục chứa tệp kèm của một bản skill của đội. */
export const filesDirOf = (name: string, version: number, base = arisDir()) =>
  join(base, 'skill-files', TEAM_OWNER, name, `v${version}`)

export interface ImportOutcome {
  name: string
  status: 'proposed' | 'unchanged' | 'error'
  /** Mã bản đã đề xuất. */
  version?: string
  error?: string
}

/**
 * Nộp các skill đã chọn vào kho của đội, chờ duyệt. Tệp kèm chép vào `~/.aris/skill-files/_doi/<tên>/v<n>/` rồi
 * mới đề xuất (bản không đề xuất được thì dọn tệp). `bots` là danh sách gán sẵn, chỉ có hiệu lực khi được duyệt.
 */
export async function importItems(
  store: SkillStore,
  scan: ScanResult,
  keys: readonly string[],
  o: { bots?: Assigned | undefined; filesBase?: string | undefined; now?: () => Date } = {},
): Promise<ImportOutcome[]> {
  const picked = scan.items.filter((i) => keys.includes(i.key)).slice(0, MAX_IMPORT_PER_RUN)
  const now = (o.now ?? (() => new Date()))().toISOString()
  const out: ImportOutcome[] = []
  for (const item of picked) {
    try {
      const skillFile = (await readdir(item.dir)).find((f) => /^skill\.md$/i.test(f))
      if (!skillFile) throw new ImportError('Thư mục không còn SKILL.md.')
      const parsed = parseSkillMd(await readFile(join(item.dir, skillFile), 'utf8'))
      if (parsed.badFrontmatter) throw new ImportError('Phần đầu tệp (frontmatter) không đọc được.')
      const draft = toAris(parsed, basename(item.dir))
      const all = await walkFiles(item.dir, { maxDepth: 4, maxEntries: 500 })
      const choice = chooseFiles(await sizesOf(item.dir, all))
      const id = skillId(TEAM_OWNER, draft.name)
      // Thân và tệp kèm giống hệt bản đang dùng hay đang chờ: không đề xuất lại (đường tệp kèm khác theo bản).
      const current = store.versionsOf(id).find((v) => v.status === 'proposed') ?? store.active(id)
      if (current && (await sameContent(current, draft.body, item.dir, choice.keep, o.filesBase))) {
        out.push({ name: draft.name, status: 'unchanged' })
        continue
      }
      const next = (store.versionsOf(id)[0]?.version ?? 0) + 1
      const dest = filesDirOf(draft.name, next, o.filesBase)
      const scripts = await Promise.all(
        choice.keep
          .filter((f) => /\.(sh|bash|zsh)$/i.test(f))
          .map(async (path) => ({
            path,
            text: await readFile(join(item.dir, path), 'utf8').catch(() => ''),
          })),
      )
      const source: ImportSource = {
        kind: scan.kind,
        ...(scan.github
          ? {
              repo: scan.github.repo,
              ref: scan.github.ref,
              ...(scan.github.sha ? { sha: scan.github.sha } : {}),
            }
          : {}),
        ...(scan.library
          ? { pack: scan.library.pack, libVersion: scan.library.versions[draft.name] ?? 1 }
          : {}),
        path: scan.github
          ? [scan.github.path, item.rel].filter(Boolean).join('/')
          : scan.library
            ? `${scan.library.pack}/${item.rel}`
            : item.dir,
        importedAt: now,
      }
      const v = await store.propose({
        bot: TEAM_OWNER,
        name: draft.name,
        description: draft.description,
        ...(draft.whenToUse ? { whenToUse: draft.whenToUse } : {}),
        body: withFilesSection(draft.body, dest, choice.keep),
        by: 'import',
        source,
        risks: scanImported(draft.body, scripts),
        files: choice.keep,
        ...(o.bots ? { assignOnApprove: o.bots } : {}),
      })
      if (!v) {
        out.push({ name: draft.name, status: 'unchanged' })
        continue
      }
      // Đề xuất đã ghi: chép tệp kèm. Lỗi chép thì bản đề xuất vẫn còn, tệp thiếu được ghi vào báo cáo.
      for (const rel of choice.keep) {
        const to = join(dest, ...rel.split('/'))
        await mkdir(dirname(to), { recursive: true })
        await copyFile(join(item.dir, ...rel.split('/')), to)
      }
      out.push({
        name: draft.name,
        status: 'proposed',
        version: versionId(TEAM_OWNER, draft.name, v.version),
      })
    } catch (e) {
      out.push({ name: item.name, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/** Phần thân trước mục "Tệp kèm" do aris thêm vào. */
const FILES_HEADING = '\n\n## Tệp kèm (đọc khi cần)'

/** Bản đã có có cùng thân và cùng nội dung các tệp kèm với thư mục nguồn không. */
async function sameContent(
  v: VersionRecord,
  body: string,
  dir: string,
  files: readonly string[],
  base: string | undefined,
): Promise<boolean> {
  const bare = v.body.split(FILES_HEADING)[0]!.trim()
  if (bare !== body.trim()) return false
  const have = v.files ?? []
  if (have.length !== files.length || have.some((f, i) => f !== files[i])) return false
  const dest = filesDirOf(v.name, v.version, base)
  for (const f of files) {
    const [a, b] = await Promise.all([
      readFile(join(dir, ...f.split('/'))).catch(() => undefined),
      readFile(join(dest, ...f.split('/'))).catch(() => undefined),
    ])
    if (!a || !b || !a.equals(b)) return false
  }
  return true
}

/** Xoá thư mục tạm của một lần quét GitHub. */
export async function disposeScan(scan: ScanResult): Promise<void> {
  if (scan.tmp) await rm(scan.tmp, { recursive: true, force: true })
}

export interface UpdateCheck {
  /** Có bản đề xuất mới (nội dung khác bản đang dùng). */
  changed: boolean
  /** `same`: mã commit không đổi; `unchanged`: commit mới nhưng skill giữ nguyên; `proposed`: đã tạo đề xuất. */
  state: 'same' | 'unchanged' | 'proposed'
  sha?: string | undefined
  outcome?: ImportOutcome | undefined
}

/**
 * Kiểm tra bản mới của một skill nhập từ GitHub: so mã commit; khác thì tải lại, và nội dung đổi thì đề xuất bản mới
 * (`by: 'import'`, chờ duyệt). Không tự cập nhật.
 */
export async function checkSourceUpdate(
  store: SkillStore,
  skill: string,
  f: Fetch = fetch,
  o: { filesBase?: string | undefined } = {},
): Promise<UpdateCheck> {
  const rec = store.get(skill)
  const src = (store.active(skill) ?? store.versionsOf(skill).find((v) => v.source))?.source
  if (!rec || !src || src.kind !== 'github' || !src.repo)
    throw new ImportError('Skill này không nhập từ GitHub.')
  const [owner, repo] = src.repo.split('/')
  if (!owner || !repo) throw new ImportError('Nguồn GitHub của skill không đọc được.')
  const sha = await latestSha({ owner, repo, ref: src.ref === 'HEAD' ? undefined : src.ref }, f)
  if (!sha) throw new ImportError('GitHub chưa trả lời kịp (hết lượt gọi API trong giờ này), thử lại sau.')
  // Mã đã lưu có thể là bản rút gọn (lấy từ tên bản nén khi hết lượt gọi API).
  if (src.sha && (sha.startsWith(src.sha) || src.sha.startsWith(sha)))
    return { changed: false, state: 'same', sha }
  const ref = src.ref ?? 'HEAD'
  const url = `https://github.com/${src.repo}/tree/${encodeURIComponent(ref)}${src.path ? `/${src.path}` : ''}`
  const scan = await scanGithub(url, f)
  try {
    const [outcome] = await importItems(store, scan, ['.'], { filesBase: o.filesBase })
    if (!outcome || outcome.status === 'error')
      throw new ImportError(outcome?.error ?? 'Không nhập lại được skill.')
    return outcome.status === 'proposed'
      ? { changed: true, state: 'proposed', sha, outcome }
      : { changed: false, state: 'unchanged', sha, outcome }
  } finally {
    await disposeScan(scan)
  }
}
