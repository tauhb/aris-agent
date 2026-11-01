/**
 * Tệp sao lưu `.aris`: `ARISBAK1`, độ dài đầu tệp (4 byte), đầu tệp JSON (không mã hoá: thời điểm, mã băm của mã
 * khôi phục, các phần và số tệp), rồi tar.gz mã hoá AES-256-GCM, cuối cùng 16 byte thẻ xác thực. Khoá suy từ mã
 * khôi phục bằng scrypt với muối riêng mỗi tệp. Nén bằng `tar` của macOS; SQLite đang mở chụp bằng `sqlite3 .backup`.
 *
 * Từ phiên bản 2 (đợt 7f, S8) toàn bộ byte đầu tệp (`ARISBAK1`, độ dài, JSON) là dữ liệu kèm xác thực (AAD) của GCM:
 * sửa đầu tệp thì thẻ sai, giải mã lỗi. Phiên bản 1 không có AAD nên không còn đọc.
 */
import { execFile, spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { codeIdOf, normalizeCode } from './policy.js'
import type { PlannedPart } from './sources.js'

const MAGIC = Buffer.from('ARISBAK1')
const TAG = 16
const TAR = '/usr/bin/tar'
const SQLITE = '/usr/bin/sqlite3'

export interface HeaderPart {
  id: string
  root: string
  entries?: readonly string[] | undefined
  merge?: readonly string[] | undefined
  files: number
  bytes: number
  sqlite: string[]
}
/** Các phần một bản sao lưu được phép có (`partSpecs`). Phần khác trong đầu tệp bị từ chối. */
export const KNOWN_PARTS = ['dsh', 'brain', 'workspace', 'projects', 'aris'] as const
export const isKnownPart = (id: unknown): id is (typeof KNOWN_PARTS)[number] =>
  typeof id === 'string' && (KNOWN_PARTS as readonly string[]).includes(id)

export interface Header {
  v: 2
  created: string
  host: string
  codeId: string
  salt: string
  iv: string
  parts: HeaderPart[]
}

/** Tên một mục ở gốc phần: một tên đơn, không `/`, không `..`. */
const plainName = (n: unknown) =>
  typeof n === 'string' && n !== '' && n !== '.' && n !== '..' && !n.includes('/') && !n.includes('\0')

/**
 * Kiểm đầu tệp trước khi dùng: `id` phần phải thuộc tập biết trước, tên mục trong `entries`, `merge` phải là tên
 * đơn. Đầu tệp đã có AAD nên kẻ không có mã không sửa được, nhưng vẫn kiểm để tệp tạo sai không gây hại.
 */
export function validateHeader(h: Header): void {
  if (!Array.isArray(h.parts)) throw new Error('tệp sao lưu hỏng')
  for (const p of h.parts) {
    if (!isKnownPart(p.id)) throw new Error(`bản sao lưu có phần lạ "${String(p.id)}", từ chối`)
    for (const list of [p.entries, p.merge])
      if (list && !(Array.isArray(list) && list.every(plainName)))
        throw new Error(`bản sao lưu có tên mục không hợp lệ trong phần ${p.id}, từ chối`)
  }
}

export const totalFiles = (h: Pick<Header, 'parts'>) =>
  h.parts.reduce((n, p) => n + p.files + p.sqlite.length, 0)

export async function deriveKey(code: string, salt: Buffer): Promise<Buffer> {
  const norm = normalizeCode(code)
  if (!norm) throw new Error('mã khôi phục không hợp lệ')
  return new Promise((resolve, reject) =>
    scrypt(norm, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  )
}

const run = (cmd: string, args: string[], opts: { cwd?: string } = {}) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) =>
    execFile(cmd, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    ),
  )

/** Biểu thức chính quy cơ bản (BRE) của `tar -s`: thoát các ký tự đặc biệt của đường dẫn. */
const bre = (s: string) => s.replace(/[.[\]*^$\\]/g, '\\$&')
/** Đường cho `tar -C /`: bỏ dấu `/` đầu. */
const rel = (abs: string) => abs.replace(/^\/+/, '')

export interface WriteResult {
  file: string
  bytes: number
  files: number
  /** Tệp biến mất giữa lúc liệt kê và lúc nén. */
  missing: number
  header: Header
}

/** Nén, mã hoá các phần vào `outFile` (ghi tệp tạm rồi đổi tên). */
export async function writeBackup(
  parts: readonly PlannedPart[],
  outFile: string,
  code: string,
  now = new Date(),
): Promise<WriteResult> {
  const stage = await realpath(await mkdtemp(join(tmpdir(), 'aris-sao-luu-')))
  const partial = join(dirname(outFile), `.${outFile.split('/').pop()}.dang-ghi`)
  try {
    // SQLite đang mở: chụp nhất quán vào thư mục tạm.
    for (const p of parts)
      for (const r of p.sqlite) {
        const to = join(stage, p.id, r)
        await mkdir(dirname(to), { recursive: true })
        const res = await run(SQLITE, [join(p.root, r), `.backup '${to.replace(/'/g, "''")}'`])
        if (res.code !== 0) throw new Error(`chụp SQLite ${r}: ${res.stderr.trim() || res.code}`)
      }
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const header: Header = {
      v: 2,
      created: now.toISOString(),
      host: hostname(),
      codeId: codeIdOf(code),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      parts: parts.map((p) => ({
        id: p.id,
        root: p.root,
        ...(p.entries ? { entries: p.entries } : {}),
        ...(p.merge ? { merge: p.merge } : {}),
        files: p.files.length,
        bytes: p.bytes,
        sqlite: p.sqlite,
      })),
    }
    const list: string[] = []
    const subst: string[] = []
    for (const p of parts) {
      if (p.sqlite.length) {
        subst.push('-s', `|^${bre(rel(join(stage, p.id)))}|${p.id}|`)
        for (const r of p.sqlite) list.push(rel(join(stage, p.id, r)))
      }
      if (p.files.length) {
        if (p.root.includes('|')) throw new Error(`đường dẫn có ký tự |: ${p.root}`)
        subst.push('-s', `|^${bre(rel(p.root))}|${p.id}|`)
        for (const f of p.files) list.push(rel(f))
      }
    }
    const head = Buffer.from(JSON.stringify(header), 'utf8')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(head.length)
    const key = await deriveKey(code, salt)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    // Đầu tệp (ARISBAK1, độ dài, JSON) vào AAD: sửa đầu tệp thì thẻ xác thực sai.
    const prefix = Buffer.concat([MAGIC, len, head])
    cipher.setAAD(prefix)
    const tar = spawn(
      TAR,
      ['-czf', '-', '-C', '/', '--null', '-T', '-', '--no-mac-metadata', '--no-xattrs', ...subst],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, COPYFILE_DISABLE: '1' } },
    )
    let stderr = ''
    tar.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    const exited = new Promise<number>((resolve) => tar.on('close', (c) => resolve(c ?? 1)))
    tar.stdin.end(list.map((f) => f + '\0').join(''))
    const out = createWriteStream(partial, { mode: 0o600 })
    out.write(prefix)
    const withTag = new Transform({
      transform: (chunk, _enc, cb) => cb(null, chunk),
      flush(cb) {
        this.push(cipher.getAuthTag())
        cb()
      },
    })
    await pipeline(tar.stdout, cipher, withTag, out)
    const exit = await exited
    const missing = (stderr.match(/Cannot stat|No such file/g) ?? []).length
    const otherErr = stderr
      .split('\n')
      .filter((l) => l.trim() && !/Cannot stat|No such file|Error exit delayed/.test(l))
    if (exit !== 0 && (otherErr.length || !missing)) throw new Error(`tar: ${otherErr.join(' ') || exit}`)
    await rename(partial, outFile)
    const st = await stat(outFile)
    return { file: outFile, bytes: st.size, files: totalFiles(header) - missing, missing, header }
  } catch (e) {
    await rm(partial, { force: true })
    throw e
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

/** Đọc đầu tệp; tệp không phải bản sao lưu của aris thì lỗi. */
export async function readHeader(file: string): Promise<{ header: Header; offset: number; size: number }> {
  const fh = await open(file, 'r')
  try {
    const { size } = await fh.stat()
    const pre = Buffer.alloc(12)
    await fh.read(pre, 0, 12, 0)
    if (!pre.subarray(0, 8).equals(MAGIC)) throw new Error('không phải tệp sao lưu của aris')
    const n = pre.readUInt32BE(8)
    if (n > 1_000_000 || 12 + n + TAG > size) throw new Error('tệp sao lưu hỏng')
    const head = Buffer.alloc(n)
    await fh.read(head, 0, n, 12)
    const header = JSON.parse(head.toString('utf8')) as Header
    if ((header.v as number) === 1)
      throw new Error('bản sao lưu phiên bản 1 không có xác thực đầu tệp nên không còn đọc; tạo bản mới')
    if (header.v !== 2) throw new Error(`bản sao lưu phiên bản ${String(header.v)} chưa đọc được`)
    return { header, offset: 12 + n, size }
  } finally {
    await fh.close()
  }
}

/**
 * Mọi liên kết mềm trong `dir` trỏ ra ngoài `dir` (đường tuyệt đối hay đi lên khỏi `dir`), tương đối `dir`.
 * Không đi theo liên kết.
 */
export async function escapingLinks(dir: string): Promise<string[]> {
  const root = resolve(dir)
  const bad: string[] = []
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name)
      if (e.isSymbolicLink()) {
        const to = resolve(d, await readlink(p).catch(() => '/'))
        const rel = relative(root, to)
        if (rel.startsWith('..') || isAbsolute(rel)) bad.push(relative(root, p))
      } else if (e.isDirectory() && !(await lstat(p)).isSymbolicLink()) await walk(p)
    }
  }
  await walk(root)
  return bad
}

/**
 * Giải mã và giải nén vào `dest` (mỗi phần thành `dest/<mã phần>`). Thẻ xác thực sai (tệp bị sửa, hỏng) thì lỗi ở
 * cuối, nên chỉ dùng kết quả khi hàm xong không lỗi. Đầu tệp phải hợp lệ (`validateHeader`), và không có liên kết
 * mềm nào trỏ ra ngoài `dest`: có thì xoá các liên kết đó rồi báo lỗi.
 */
export async function extractBackup(file: string, code: string, dest: string): Promise<Header> {
  const { header, offset, size } = await readHeader(file)
  validateHeader(header)
  if (codeIdOf(code) !== header.codeId) throw new Error('mã khôi phục không khớp bản sao lưu này')
  const fh = await open(file, 'r')
  const tag = Buffer.alloc(TAG)
  const aad = Buffer.alloc(offset)
  await fh.read(tag, 0, TAG, size - TAG)
  await fh.read(aad, 0, offset, 0)
  await fh.close()
  const key = await deriveKey(code, Buffer.from(header.salt, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'))
  decipher.setAuthTag(tag)
  decipher.setAAD(aad)
  await mkdir(dest, { recursive: true })
  // Không truyền `-P`: bsdtar mặc định bỏ tiền tố `/` và từ chối tên có `..`, đúng điều ta cần.
  const tar = spawn(TAR, ['-xzf', '-', '-C', dest, '--no-same-owner'], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  tar.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
  const exited = new Promise<number>((resolve) => tar.on('close', (c) => resolve(c ?? 1)))
  try {
    await pipeline(createReadStream(file, { start: offset, end: size - TAG - 1 }), decipher, tar.stdin)
  } catch (e) {
    tar.kill()
    throw new Error(/authenticate/i.test(String(e)) ? 'tệp sao lưu bị sửa hay hỏng' : String(e), { cause: e })
  }
  const exit = await exited
  if (exit !== 0) throw new Error(`giải nén: ${stderr.trim() || exit}`)
  const links = await escapingLinks(dest)
  if (links.length) {
    for (const l of links) await rm(join(dest, l), { force: true })
    throw new Error(
      `bản sao lưu có liên kết mềm trỏ ra ngoài thư mục giải nén (${links.slice(0, 3).join(', ')}); từ chối`,
    )
  }
  return header
}

async function countFiles(dir: string): Promise<number> {
  let n = 0
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(join(d, e.name))
      else n++
    }
  }
  await walk(dir)
  return n
}

export type DrillStepId = 'giai-ma' | 'giai-nen' | 'kho' | 'bo-nao' | 'khop'
export interface DrillStep {
  id: DrillStepId
  ok: boolean
  /** Số cho chữ của bước: số tệp, số kho, số trang. */
  n?: number | undefined
  of?: number | undefined
  error?: string | undefined
}
export interface DrillResult {
  ok: boolean
  steps: DrillStep[]
  ms: number
}

/**
 * Diễn tập khôi phục: giải mã, giải nén vào thư mục tạm, mở thử các kho dữ liệu (JSON, SQLite), kiểm git của bộ não,
 * so số tệp với lúc sao lưu; xong xoá thư mục tạm.
 */
export async function drillBackup(
  file: string,
  code: string | undefined,
  expectFiles?: number,
): Promise<DrillResult> {
  const t0 = Date.now()
  const steps: DrillStep[] = []
  const done = () => ({ ok: steps.every((s) => s.ok), steps, ms: Date.now() - t0 })
  if (!code) {
    steps.push({ id: 'giai-ma', ok: false, error: 'không thấy mã khôi phục của bản này trong Keychain' })
    return done()
  }
  const tmp = await mkdtemp(join(tmpdir(), 'aris-dien-tap-'))
  try {
    let header: Header
    try {
      header = await extractBackup(file, code, tmp)
      steps.push({ id: 'giai-ma', ok: true })
    } catch (e) {
      steps.push({ id: 'giai-ma', ok: false, error: e instanceof Error ? e.message : String(e) })
      return done()
    }
    const n = await countFiles(tmp)
    steps.push({ id: 'giai-nen', ok: n > 0, n })
    // Kho dữ liệu: mỗi thư mục trong storages là một kho; mọi tệp JSON phải đọc được. SQLite: integrity_check.
    let stores = 0
    let good = 0
    const storages = join(tmp, 'dsh', 'storages')
    for (const e of await readdir(storages, { withFileTypes: true }).catch(() => [])) {
      stores++
      const files: string[] = []
      const walk = async (d: string): Promise<void> => {
        for (const x of await readdir(d, { withFileTypes: true }).catch(() => []))
          if (x.isDirectory()) await walk(join(d, x.name))
          else if (x.name.endsWith('.json')) files.push(join(d, x.name))
      }
      if (e.isDirectory()) await walk(join(storages, e.name))
      else if (e.name.endsWith('.json')) files.push(join(storages, e.name))
      let ok = true
      for (const f of files)
        try {
          JSON.parse(await readFile(f, 'utf8'))
        } catch {
          ok = false
        }
      if (ok) good++
    }
    for (const p of header.parts)
      for (const r of p.sqlite) {
        stores++
        const res = await run(SQLITE, [join(tmp, p.id, r), 'PRAGMA integrity_check;'])
        if (res.code === 0 && res.stdout.trim() === 'ok') good++
      }
    steps.push({ id: 'kho', ok: good === stores, n: good, of: stores })
    const brain = join(tmp, 'brain')
    const pages = (await run('/usr/bin/find', [brain, '-name', '*.md', '-not', '-path', '*/.*'])).stdout
      .split('\n')
      .filter(Boolean).length
    const hasGit = await stat(join(brain, '.git')).then(
      () => true,
      () => false,
    )
    const fsck = hasGit ? await run('/usr/bin/git', ['-C', brain, 'fsck', '--no-progress']) : { code: 0 }
    steps.push({ id: 'bo-nao', ok: fsck.code === 0, n: pages })
    const expect = expectFiles ?? totalFiles(header)
    steps.push({ id: 'khop', ok: n === expect, n, of: expect })
    return done()
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
