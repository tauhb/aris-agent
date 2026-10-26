/**
 * Khôi phục đè lên aris từ một bản sao lưu (lệnh `aris restore`, khi aris đã dừng hẳn): giải nén vào thư mục tạm,
 * kiểm thẻ xác thực xong mới đụng dữ liệu thật; dữ liệu hiện tại được cất sang bên chứ không xoá.
 */
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { extractBackup, readHeader, validateHeader, type Header } from './archive.js'

export interface RestoreResult {
  header: Header
  /** Mỗi phần: thư mục đã khôi phục và nơi cất dữ liệu cũ. */
  parts: { id: string; root: string; aside?: string | undefined; entries: number }[]
  /** Phần có trong bản sao lưu nhưng không có gốc trong `roots`: bỏ qua, không đụng gì. */
  skipped: string[]
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

/** Đổi tên; khác ổ đĩa thì chép rồi xoá. */
async function move(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await cp(from, to, { recursive: true, verbatimSymlinks: true })
    await rm(from, { recursive: true, force: true })
  }
}

/** Chép đè từng tệp; SQLite được chép đè thì bỏ `-wal`, `-shm` cũ để khỏi trộn. */
async function mergeInto(from: string, to: string) {
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(from, rel), { withFileTypes: true })) {
      const r = rel ? join(rel, e.name) : e.name
      if (e.isDirectory()) {
        await walk(r)
        continue
      }
      const dest = join(to, r)
      await mkdir(dirname(dest), { recursive: true })
      for (const side of ['-wal', '-shm', '-journal']) await rm(dest + side, { force: true })
      await cp(join(from, r), dest, { force: true, verbatimSymlinks: true })
    }
  }
  await walk('')
}

/**
 * Khôi phục `file` bằng `code` vào các gốc `roots` (mã phần → thư mục). Chỉ dùng gốc từ `roots`, không bao giờ gốc
 * ghi trong đầu tệp (đợt 7f, S8); phần không có trong `roots` thì bỏ qua và ghi vào `skipped`. Đầu tệp phải hợp lệ
 * (mã phần thuộc tập biết trước, tên mục là tên đơn). Phần lấy cả thư mục: thư mục cũ đổi tên thành
 * `<gốc>.truoc-khoi-phuc-<lúc>`. Phần lấy vài mục: từng mục cũ cất vào `<gốc>/.truoc-khoi-phuc-<lúc>/`; mục chép
 * đè (`merge`) thì giữ tệp không có trong bản sao lưu.
 */
export async function restoreBackup(
  file: string,
  code: string,
  roots: Record<string, string>,
  stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13),
): Promise<RestoreResult> {
  const { header } = await readHeader(file)
  validateHeader(header)
  const firstRoot = roots.dsh ?? Object.values(roots)[0]
  if (!firstRoot) throw new Error('không có thư mục đích nào để khôi phục')
  const tmp = await mkdtemp(join(dirname(firstRoot), '.aris-khoi-phuc-'))
  try {
    await extractBackup(file, code, tmp)
    const result: RestoreResult = { header, parts: [], skipped: [] }
    for (const p of header.parts) {
      const src = join(tmp, p.id)
      if (!(await exists(src))) continue
      const root = roots[p.id]
      if (!root) {
        result.skipped.push(p.id)
        continue
      }
      const names = await readdir(src)
      if (!p.entries) {
        const aside = (await exists(root)) ? `${root}.truoc-khoi-phuc-${stamp}` : undefined
        if (aside) await move(root, aside)
        await move(src, root)
        result.parts.push({ id: p.id, root, aside, entries: names.length })
        continue
      }
      const asideDir = join(root, `.truoc-khoi-phuc-${stamp}`)
      let movedAside = false
      for (const name of names) {
        const target = join(root, name)
        if (p.merge?.includes(name)) {
          await mergeInto(join(src, name), target)
          continue
        }
        if (await exists(target)) {
          await move(target, join(asideDir, name))
          movedAside = true
        }
        await move(join(src, name), target)
      }
      result.parts.push({ id: p.id, root, aside: movedAside ? asideDir : undefined, entries: names.length })
    }
    return result
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
