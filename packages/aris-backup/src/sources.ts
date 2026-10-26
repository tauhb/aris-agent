/**
 * Sao lưu những gì: các phần dữ liệu của aris, mỗi phần một thư mục gốc. Đi cây thư mục để có danh sách tệp, cỡ,
 * và các tệp SQLite đang mở (có `-wal`) cần chụp bằng `.backup` thay vì chép thẳng.
 */
import { existsSync } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface PartSpec {
  id: string
  root: string
  /** Chỉ lấy các mục này ở gốc; bỏ trống là lấy cả thư mục. */
  entries?: readonly string[] | undefined
  /** Mục chép đè từng tệp khi khôi phục (vì có phần không sao lưu nằm cạnh); còn lại thay cả mục. */
  merge?: readonly string[] | undefined
  /** Tên bỏ qua ở mọi tầng. */
  skipNames?: readonly string[] | undefined
  /** Đường (tương đối gốc) bỏ qua. */
  skipPaths?: readonly string[] | undefined
}

const JUNK = ['.DS_Store']
const BUILD = ['node_modules', '.venv', '__pycache__', ...JUNK]

/**
 * Các phần sao lưu. Không gồm: khoá (Keychain, tệp khoá), plugin đã cài (`profiles`, cài lại được), chỉ mục tìm
 * kiếm phiên (dựng lại được), nhật ký, socket, bản làm việc tạm của bot (`~/.aris/worktrees`).
 */
export function partSpecs(env: NodeJS.ProcessEnv = process.env, home = homedir()): PartSpec[] {
  const dsh = resolve(env.DSH_HOME ?? join(home, '.dsh'))
  return [
    {
      id: 'dsh',
      root: dsh,
      entries: ['sessions', 'storages', 'attachments', 'llm-deepseek', 'aris-keychain.json'],
      skipNames: JUNK,
    },
    { id: 'brain', root: resolve(env.ARIS_BRAIN_DIR ?? join(home, 'aris', 'brain')), skipNames: JUNK },
    { id: 'workspace', root: join(home, 'aris', 'workspace'), skipNames: BUILD },
    { id: 'projects', root: join(home, 'aris', 'projects'), skipNames: BUILD },
    {
      id: 'aris',
      root: join(home, '.aris'),
      entries: ['brain', 'checkpoints'],
      merge: ['brain'],
      skipPaths: ['brain/bin'],
      skipNames: JUNK,
    },
  ]
}

export interface PlannedPart {
  id: string
  /** Gốc đã giải liên kết. */
  root: string
  entries?: readonly string[] | undefined
  merge?: readonly string[] | undefined
  /** Đường tuyệt đối của tệp (cả liên kết mềm), không gồm SQLite chụp riêng. */
  files: string[]
  /** SQLite đang mở: đường tương đối gốc. */
  sqlite: string[]
  bytes: number
}

const SQLITE_SIDE = /-(wal|shm|journal)$/

/** Đi cây của một phần. Phần không có gốc thì rỗng. */
export async function planPart(spec: PartSpec): Promise<PlannedPart> {
  const part: PlannedPart = {
    id: spec.id,
    root: spec.root,
    entries: spec.entries,
    merge: spec.merge,
    files: [],
    sqlite: [],
    bytes: 0,
  }
  if (!existsSync(spec.root)) return part
  part.root = await realpath(spec.root)
  const skipNames = new Set(spec.skipNames ?? [])
  const skipPaths = new Set(spec.skipPaths ?? [])
  const walk = async (rel: string): Promise<void> => {
    const abs = rel ? join(part.root, rel) : part.root
    let names: string[]
    try {
      names = await readdir(abs)
    } catch {
      return
    }
    const here = new Set(names)
    for (const name of names) {
      if (!rel && spec.entries && !spec.entries.includes(name)) continue
      if (skipNames.has(name)) continue
      const r = rel ? `${rel}/${name}` : name
      if (skipPaths.has(r)) continue
      const st = await lstat(join(abs, name)).catch(() => null)
      if (!st) continue
      if (st.isDirectory()) {
        await walk(r)
        continue
      }
      if (!st.isFile() && !st.isSymbolicLink()) continue
      const base = name.replace(SQLITE_SIDE, '')
      // Tệp phụ của SQLite: bản chụp `.backup` đã gồm nội dung.
      if (base !== name && here.has(base) && here.has(`${base}-wal`)) continue
      if (here.has(`${name}-wal`)) {
        part.sqlite.push(r)
        part.bytes += st.size
        continue
      }
      part.files.push(join(abs, name))
      part.bytes += st.size
    }
  }
  await walk('')
  return part
}

export async function planAll(specs: readonly PartSpec[]): Promise<PlannedPart[]> {
  const out: PlannedPart[] = []
  for (const s of specs) out.push(await planPart(s))
  return out
}
