/**
 * Kho skill dựng sẵn tiếng Việt (giai đoạn 8, plan 8.8): đọc các gói trong `packages/aris-skills/library/`, kiểm gói,
 * tình trạng đã cài của từng skill, và cài qua đúng đường nhập (`importItems`, nguồn `library`). Skill trong kho do
 * aris viết và kiểm sẵn nên được bật ngay (không qua Hộp duyệt), nhưng vẫn qua bộ kiểm và bộ quét như skill nhập.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffStat, lineDiff, type DiffLine } from './diff.js'
import { parseSkillMd, scanImported, toAris } from './import.js'
import { ImportError, importItems, scanDirectory, type ImportOutcome, type ScanResult } from './import-io.js'
import { lintSkill, NAME_RE } from './lint.js'
import { skillId, TEAM_OWNER, type Assigned, type SkillStore } from './store.js'

/** Thư mục kho trong gói (`lib/` hay `src/` đều nằm cạnh `library/`). */
export const LIBRARY_DIR = fileURLToPath(new URL('../library/', import.meta.url))

export interface PackSkill {
  name: string
  /** Bản của skill trong kho: tăng khi aris sửa nội dung. */
  version: number
  /** Ca thử cho bộ kiểm thử skill (`eval.ts`). */
  cases: string[]
}

export interface Pack {
  id: string
  name: string
  description: string
  version: number
  /** Gợi ý gán cho loại bot nào (chữ hiện cho người dùng). */
  suggest: string[]
  skills: PackSkill[]
  /** Thư mục gói (tuyệt đối). */
  dir: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0)

/** Đọc `pack.json` của một gói; sai dạng thì trả lỗi (câu tiếng Việt). */
export function parsePack(raw: string, dirName: string, dir: string): Pack | string {
  let j: Record<string, unknown>
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v))
      return `${dirName}: pack.json không phải một đối tượng.`
    j = v as Record<string, unknown>
  } catch {
    return `${dirName}: pack.json không đọc được.`
  }
  if (str(j.id) !== dirName) return `${dirName}: id trong pack.json phải trùng tên thư mục.`
  if (!str(j.name) || !str(j.description)) return `${dirName}: thiếu tên hay mô tả gói.`
  if (!num(j.version)) return `${dirName}: version phải là số nguyên dương.`
  if (!Array.isArray(j.skills) || j.skills.length === 0) return `${dirName}: gói chưa có skill nào.`
  const skills: PackSkill[] = []
  for (const s of j.skills as unknown[]) {
    const o = (s ?? {}) as Record<string, unknown>
    const name = str(o.name)
    if (!NAME_RE.test(name)) return `${dirName}: tên skill "${name}" không hợp lệ.`
    if (!num(o.version)) return `${dirName}/${name}: version phải là số nguyên dương.`
    const cases = Array.isArray(o.cases) ? o.cases.map(str).filter(Boolean) : []
    skills.push({ name, version: num(o.version), cases })
  }
  return {
    id: dirName,
    name: str(j.name),
    description: str(j.description),
    version: num(j.version),
    suggest: Array.isArray(j.suggest) ? j.suggest.map(str).filter(Boolean) : [],
    skills,
    dir,
  }
}

export interface Library {
  packs: Pack[]
  /** Chỗ sai của kho (kiểm thử đòi rỗng; lúc chạy thì gói sai bị bỏ). */
  problems: string[]
}

/**
 * Đọc cả kho và kiểm: mỗi gói có `pack.json` khớp thư mục, mỗi skill trong danh sách có `SKILL.md` đọc được, tên
 * trong tệp trùng tên thư mục, có mô tả và đoạn "Dùng khi…", qua bộ kiểm (không cảnh báo) và bộ quét, có 2–3 ca thử;
 * thư mục skill không có trong danh sách và tên trùng giữa các gói đều là lỗi.
 */
export async function loadLibrary(dir = LIBRARY_DIR): Promise<Library> {
  const packs: Pack[] = []
  const problems: string[] = []
  const seen = new Map<string, string>()
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const packDir = join(dir, e.name)
    const raw = await readFile(join(packDir, 'pack.json'), 'utf8').catch(() => undefined)
    if (raw === undefined) {
      problems.push(`${e.name}: thiếu pack.json.`)
      continue
    }
    const pack = parsePack(raw, e.name, packDir)
    if (typeof pack === 'string') {
      problems.push(pack)
      continue
    }
    const before = problems.length
    const listed = new Set(pack.skills.map((s) => s.name))
    for (const sub of await readdir(packDir, { withFileTypes: true }))
      if (sub.isDirectory() && !listed.has(sub.name))
        problems.push(`${pack.id}/${sub.name}: có thư mục nhưng không có trong pack.json.`)
    for (const s of pack.skills) {
      const at = `${pack.id}/${s.name}`
      const other = seen.get(s.name)
      if (other) problems.push(`${at}: trùng tên với skill trong gói ${other}.`)
      seen.set(s.name, pack.id)
      const text = await readFile(join(packDir, s.name, 'SKILL.md'), 'utf8').catch(() => undefined)
      if (text === undefined) {
        problems.push(`${at}: thiếu SKILL.md.`)
        continue
      }
      const parsed = parseSkillMd(text)
      if (parsed.badFrontmatter) problems.push(`${at}: frontmatter không đọc được.`)
      if (parsed.meta.name !== s.name) problems.push(`${at}: tên trong SKILL.md phải là "${s.name}".`)
      const draft = toAris(parsed, s.name)
      if (!draft.whenToUse) problems.push(`${at}: mô tả thiếu đoạn "Dùng khi…".`)
      const lint = lintSkill(draft, { imported: true })
      for (const m of [...lint.errors, ...lint.warnings]) problems.push(`${at}: ${m}`)
      for (const r of scanImported(draft.body)) problems.push(`${at}: ${r}`)
      if (s.cases.length < 2 || s.cases.length > 3) problems.push(`${at}: cần 2–3 ca thử.`)
    }
    if (problems.length === before) packs.push(pack)
  }
  return { packs, problems }
}

export type LibraryState = 'none' | 'installed' | 'update' | 'edited' | 'archived'

export interface LibrarySkillView {
  name: string
  description: string
  whenToUse?: string | undefined
  body: string
  version: number
  cases: string[]
  state: LibraryState
  /** Bản trong kho lúc cài (khi đã cài). */
  installedVersion?: number | undefined
  /** Bot được gán (skill của đội). */
  assigned?: Assigned | undefined
  /** Có bản mới hay đã sửa: các dòng khác giữa bản đang dùng và bản trong kho (tối đa `MAX_CHANGES`), và số dòng. */
  changes?: DiffLine[] | undefined
  stat?: { add: number; del: number } | undefined
}

/** Số dòng khác tối đa gửi cho giao diện. */
export const MAX_CHANGES = 40

/**
 * Tình trạng một skill trong kho so với kho skill của đội: chưa cài; đã cài đúng bản; kho có bản mới; skill cùng tên
 * đang dùng không phải bản từ kho (người dùng sửa, vòng học vá hay nhập từ nơi khác) thì `edited`, cập nhật phải hỏi.
 */
export function stateOf(
  store: SkillStore,
  s: PackSkill,
): Omit<LibrarySkillView, 'description' | 'body' | 'cases'> {
  const id = skillId(TEAM_OWNER, s.name)
  const rec = store.get(id)
  const base = { name: s.name, version: s.version }
  if (!rec || rec.status === 'draft' || rec.status === 'rejected') return { ...base, state: 'none' }
  const assigned = rec.assigned ? { assigned: rec.assigned } : {}
  if (rec.status === 'archived') return { ...base, ...assigned, state: 'archived' }
  const src = store.active(id)?.source
  if (src?.kind !== 'library') return { ...base, ...assigned, state: 'edited' }
  const installedVersion = src.libVersion ?? 1
  return {
    ...base,
    ...assigned,
    installedVersion,
    state: installedVersion < s.version ? 'update' : 'installed',
  }
}

/** Gói kèm nội dung và tình trạng từng skill, cho tab "Kho dựng sẵn". */
export async function packView(store: SkillStore, pack: Pack) {
  const skills: LibrarySkillView[] = []
  for (const s of pack.skills) {
    const text = await readFile(join(pack.dir, s.name, 'SKILL.md'), 'utf8')
    const d = toAris(parseSkillMd(text), s.name)
    const st = stateOf(store, s)
    const current =
      st.state === 'update' || st.state === 'edited' ? store.active(skillId(TEAM_OWNER, s.name)) : undefined
    const diff = current ? lineDiff(current.body, d.body) : undefined
    skills.push({
      ...st,
      ...(diff
        ? { changes: diff.filter((l) => l.kind !== ' ').slice(0, MAX_CHANGES), stat: diffStat(diff) }
        : {}),
      description: d.description,
      ...(d.whenToUse ? { whenToUse: d.whenToUse } : {}),
      body: d.body,
      cases: s.cases,
    })
  }
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    suggest: pack.suggest,
    skills,
    installed: skills.filter((s) => s.state !== 'none' && s.state !== 'archived').length,
    updates: skills.filter((s) => s.state === 'update').length,
  }
}

export interface LibraryOutcome extends Omit<ImportOutcome, 'status'> {
  status: ImportOutcome['status'] | 'installed' | 'edited'
}

/**
 * Cài skill từ một gói (cả gói khi `names` rỗng). Nộp qua `importItems` rồi duyệt luôn thay người dùng (người dùng
 * đã bấm cài); bot chọn lúc cài được gán thêm. Skill cùng tên đang dùng mà không phải bản từ kho (`edited`) thì bỏ
 * qua, trừ khi `force` (người dùng đã đồng ý ghi đè). Skill đã cất được lấy ra lại. Ca thử của gói thêm vào skill.
 */
export async function installFromLibrary(
  store: SkillStore,
  pack: Pack,
  o: {
    names?: readonly string[] | undefined
    bots?: Assigned | undefined
    force?: boolean | undefined
    filesBase?: string | undefined
    now?: () => Date
  } = {},
): Promise<LibraryOutcome[]> {
  const wanted = o.names?.length ? pack.skills.filter((s) => o.names!.includes(s.name)) : pack.skills
  if (wanted.length === 0) throw new ImportError('Gói không có skill này.')
  const out: LibraryOutcome[] = []
  const go: typeof wanted = []
  for (const s of wanted) {
    const st = stateOf(store, s).state
    if (st === 'edited' && !o.force) out.push({ name: s.name, status: 'edited' })
    else go.push(s)
  }
  const items = (await scanDirectory(pack.dir)).filter((i) => go.some((s) => s.name === i.rel))
  const scan: ScanResult = {
    id: `library-${pack.id}`,
    at: Date.now(),
    kind: 'library',
    label: pack.name,
    root: pack.dir,
    library: { pack: pack.id, versions: Object.fromEntries(pack.skills.map((s) => [s.name, s.version])) },
    items,
  }
  const results = await importItems(
    store,
    scan,
    items.map((i) => i.key),
    {
      ...(o.filesBase ? { filesBase: o.filesBase } : {}),
      ...(o.now ? { now: o.now } : {}),
    },
  )
  for (const r of results) {
    const id = skillId(TEAM_OWNER, r.name)
    if (r.status === 'proposed' && r.version) await store.approve(r.version, 'user')
    if (r.status !== 'error') {
      if (store.get(id)?.status === 'archived') await store.unarchive(id)
      if (o.bots) await store.assign(id, o.bots)
      for (const request of go.find((s) => s.name === r.name)?.cases ?? [])
        await store.addCase(id, { request })
    }
    out.push(r.status === 'proposed' ? { ...r, status: 'installed' } : r)
  }
  return out
}

/** Một gói theo mã (đọc lại kho mỗi lần: kho nhỏ, đọc từ đĩa trong gói). */
export async function findPack(id: string, dir = LIBRARY_DIR): Promise<Pack> {
  const st = await stat(join(dir, id)).catch(() => undefined)
  const pack = st?.isDirectory() ? (await loadLibrary(dir)).packs.find((p) => p.id === id) : undefined
  if (!pack) throw new ImportError('Không có gói này trong kho.')
  return pack
}
