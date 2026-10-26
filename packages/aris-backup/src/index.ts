/**
 * Sao lưu (giai đoạn 7, đợt 7b; đặc tả: docs/specs/aris-backup.md; bản vẽ 6.4b):
 * - Mỗi đêm nén, mã hoá dữ liệu của aris vào thư mục người dùng chọn; máy ngủ lúc hẹn thì chạy khi thức, lỗi thì thử
 *   lại sau một giờ, tối đa ba lần, báo qua Telegram.
 * - Giữ bản mới nhất mỗi ngày và mỗi tuần, bỏ bản cũ hơn.
 * - Mã khôi phục 120 bit nằm trong Keychain; người dùng cất một bản để mở trên máy khác.
 * - Diễn tập khôi phục mỗi Chủ nhật (và sau bản đầu tiên): giải nén vào thư mục tạm, mở thử các kho dữ liệu.
 * - `/api/aris/backup` cho màn 6.4b. Khôi phục đè lên aris: lệnh `aris restore` khi aris đã dừng.
 * @module @aris/backup
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { access, readdir, rm, stat, statfs } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Keychain, securityRunner } from '@aris/keychain'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { drillBackup, extractBackup, readHeader, writeBackup, type DrillResult } from './archive.js'
import { backupDomain, type RunRecord, type Table } from './domain.js'
import {
  cleanBackup,
  codeIdOf,
  dayKey,
  DEFAULT_BACKUP,
  fileName,
  isBackupName,
  isDue,
  newRecoveryCode,
  pickKeep,
  type BackupSettings,
  type KeepReason,
  type RunState,
} from './policy.js'
import { partSpecs, planAll, type PlannedPart } from './sources.js'

export * from './policy.js'

export const name = 'aris-backup'
export const inject = ['storageDomain']

/** Dịch vụ Keychain riêng của sao lưu; mỗi mã khôi phục một mục `code-<mã băm>`. */
export const KEYCHAIN_SERVICE = 'aris-backup'
const codeRef = (id: string) => `code-${id}`
/** Giữ nhật ký chạy bấy nhiêu ngày. */
const RUN_DAYS = 60

interface Copy {
  name: string
  at: Date
  bytes: number
  codeId: string
  files: number
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Hộp chọn thư mục của macOS; huỷ thì undefined. */
const chooseFolder = (prompt: string) =>
  new Promise<string | undefined>((done) =>
    execFile(
      '/usr/bin/osascript',
      ['-e', `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`],
      { encoding: 'utf8', timeout: 180_000 },
      (err, stdout) => done(err ? undefined : stdout.trim().replace(/\/$/, '') || undefined),
    ),
  )

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-backup')
  const domain = await ctx.storageDomain.open(backupDomain)
  ctx.effect(() => () => void domain.close(), 'aris-backup: domain')
  const settingsT = domain.table('settings') as unknown as Table<BackupSettings>
  const stateT = domain.table('state') as unknown as Table<RunState>
  const runsT = domain.table('runs') as unknown as Table<RunRecord>
  const settings = (): BackupSettings => ({ ...DEFAULT_BACKUP, ...(settingsT.get('main') ?? {}) })
  const save = (s: BackupSettings) => settingsT.put('main', s)
  const keychain = new Keychain(securityRunner, KEYCHAIN_SERVICE)
  const codeFor = (id: string | undefined) => (id ? keychain.get(codeRef(id)) : Promise.resolve(undefined))
  const specs = () => partSpecs()

  const notify = async (md: string) => {
    if (!settings().notify) return
    await (ctx.get('arisChannels') as { sendHome?(bot: string, md: string): Promise<unknown> } | undefined)
      ?.sendHome?.('aris', md)
      .catch((e: unknown) => logger.warn('báo sao lưu: %s', String(e)))
  }

  /** Thư mục đích dùng được không: tuyệt đối, có thật, ghi được, không nằm trong dữ liệu được sao lưu. */
  const checkDir = async (dir: string): Promise<string | undefined> => {
    if (!dir) return 'chưa chọn thư mục'
    if (!isAbsolute(dir)) return 'cần đường dẫn đầy đủ'
    const st = await stat(dir).catch(() => null)
    if (!st) return `không thấy thư mục ${dir}${dir.startsWith('/Volumes/') ? ' (ổ ngoài chưa cắm?)' : ''}`
    if (!st.isDirectory()) return `${dir} không phải thư mục`
    if (
      !(await access(dir, constants.W_OK).then(
        () => true,
        () => false,
      ))
    )
      return `không ghi được vào ${dir}`
    for (const p of specs()) {
      const r = relative(p.root, resolve(dir))
      if (r === '' || (!r.startsWith('..') && !isAbsolute(r)))
        return 'thư mục này nằm trong dữ liệu được sao lưu; chọn chỗ khác'
    }
    return undefined
  }

  // --- Các bản đã có ------------------------------------------------------------------------------
  const headerCache = new Map<string, { mtime: number; copy: Copy }>()
  async function copies(dir: string): Promise<Copy[]> {
    const names = (await readdir(dir).catch(() => [] as string[])).filter(isBackupName)
    const out: Copy[] = []
    for (const n of names) {
      const file = join(dir, n)
      const st = await stat(file).catch(() => null)
      if (!st) continue
      const hit = headerCache.get(file)
      if (hit && hit.mtime === st.mtimeMs) {
        out.push(hit.copy)
        continue
      }
      try {
        const { header } = await readHeader(file)
        const copy = {
          name: n,
          at: new Date(header.created),
          bytes: st.size,
          codeId: header.codeId,
          files: header.parts.reduce((k, p) => k + p.files + p.sqlite.length, 0),
        }
        headerCache.set(file, { mtime: st.mtimeMs, copy })
        out.push(copy)
      } catch {
        // Tệp trùng tên mà không phải bản sao lưu: bỏ qua, không xoá.
      }
    }
    return out.sort((a, z) => z.at.getTime() - a.at.getTime())
  }

  const record = async (r: Omit<RunRecord, 'id'>) => {
    const id = `${r.kind}-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
    await runsT.put(id, { id, ...r })
    return id
  }
  const runs = (kind?: RunRecord['kind']) =>
    [...runsT.entries()]
      .map(([, r]) => r)
      .filter((r) => !kind || r.kind === kind)
      .sort((a, z) => z.at.localeCompare(a.at))

  // --- Sao lưu, diễn tập ---------------------------------------------------------------------------
  let busy: 'backup' | 'drill' | 'extract' | null = null
  let planCache: { at: number; parts: PlannedPart[] } | undefined
  const plan = async (fresh = false) => {
    if (fresh || !planCache || Date.now() - planCache.at > 10 * 60_000)
      planCache = { at: Date.now(), parts: await planAll(specs()) }
    return planCache.parts
  }

  async function drill(name?: string): Promise<DrillResult | undefined> {
    const s = settings()
    const list = await copies(s.dir)
    const copy = name ? list.find((c) => c.name === name) : list[0]
    if (!copy) return undefined
    const file = join(s.dir, copy.name)
    const made = runs('backup').find((r) => r.ok && r.file === copy.name)
    const res = await drillBackup(
      file,
      await codeFor(copy.codeId),
      made?.files !== undefined ? made.files : undefined,
    )
    await record({
      kind: 'drill',
      at: new Date().toISOString(),
      ok: res.ok,
      file: copy.name,
      ms: res.ms,
      steps: res.steps,
    })
    if (!res.ok) {
      const bad = res.steps.find((x) => !x.ok)
      await notify(
        `⚠️ **Diễn tập khôi phục không đạt** (bản ${copy.name}): ${bad?.error ?? bad?.id ?? 'lỗi'}. Xem Cài đặt › Sao lưu.`,
      )
    }
    return res
  }

  async function backup(): Promise<RunRecord> {
    const s = settings()
    const now = new Date()
    const t0 = Date.now()
    const day = dayKey(now)
    const prev = stateT.get('main')
    const attempts = prev?.day === day ? prev.attempts + 1 : 1
    try {
      const bad = await checkDir(s.dir)
      if (bad) throw new Error(bad)
      const code = await codeFor(s.codeId)
      if (!code) throw new Error('không thấy mã khôi phục trong Keychain')
      let file = join(s.dir, fileName(now))
      for (
        let i = 2;
        await stat(file).then(
          () => true,
          () => false,
        );
        i++
      )
        file = join(s.dir, fileName(now).replace(/\.aris$/, `-${i}.aris`))
      const r = await writeBackup(await plan(true), file, code, now)
      const rec: Omit<RunRecord, 'id'> = {
        kind: 'backup',
        at: now.toISOString(),
        ok: true,
        file: file.split('/').pop()!,
        bytes: r.bytes,
        files: r.files,
        missing: r.missing,
        ms: Date.now() - t0,
      }
      await record(rec)
      await stateT.put('main', { day, attempts, lastAt: Date.now(), ok: true })
      // Bỏ bản cũ theo luật giữ bản.
      const { drop } = pickKeep(await copies(s.dir), s.keepDaily, s.keepWeekly)
      for (const c of drop) await rm(join(s.dir, c.name), { force: true })
      logger.info('sao lưu xong: %s, %d tệp, %d byte', rec.file, r.files, r.bytes)
      return { id: '', ...rec }
    } catch (e) {
      const error = errText(e)
      const rec: Omit<RunRecord, 'id'> = {
        kind: 'backup',
        at: now.toISOString(),
        ok: false,
        ms: Date.now() - t0,
        error,
      }
      await record(rec)
      await stateT.put('main', { day, attempts, lastAt: Date.now(), ok: false })
      logger.warn('sao lưu lỗi: %s', error)
      if (attempts === 1)
        await notify(
          `⚠️ **Sao lưu đêm nay không chạy được:** ${error}. aris thử lại sau một giờ. Xem Cài đặt › Sao lưu.`,
        )
      return { id: '', ...rec }
    }
  }

  /** Sao lưu rồi diễn tập nếu là Chủ nhật, là bản đầu, hay đã quá bảy ngày chưa diễn tập. */
  async function job(forceDrill = false) {
    if (busy) return
    busy = 'backup'
    try {
      const r = await backup()
      if (!r.ok) return
      const last = runs('drill')[0]
      const stale = !last || Date.now() - Date.parse(last.at) > 7 * 86_400_000
      if (forceDrill || stale || new Date().getDay() === 0) {
        busy = 'drill'
        await drill(r.file)
      }
    } catch (e) {
      logger.warn('sao lưu: %s', errText(e))
    } finally {
      busy = null
    }
  }

  ctx.effect(() => {
    const tick = () => {
      if (busy) return
      const s = settings()
      if (isDue(new Date(), s, stateT.get('main'))) void job()
    }
    const timer = setInterval(tick, 60_000)
    const first = setTimeout(tick, 30_000)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, 'aris-backup: lịch')

  // Dọn nhật ký cũ.
  ctx.effect(() => {
    const clean = () => {
      const since = new Date(Date.now() - RUN_DAYS * 86_400_000).toISOString()
      for (const [k, r] of runsT.entries()) if (r.at < since) void runsT.delete(k)
    }
    clean()
    const timer = setInterval(clean, 12 * 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-backup: dọn')

  // --- Mã khôi phục -------------------------------------------------------------------------------
  /** Mã mới chờ xác nhận; đã có mã chờ thì đưa lại mã đó (người dùng tải lại trang trước khi cất). */
  async function pendingCode(): Promise<string> {
    const s = settings()
    const old = await codeFor(s.pendingCodeId)
    if (old) return old
    const code = newRecoveryCode()
    const id = codeIdOf(code)
    await keychain.set(codeRef(id), code)
    await save({ ...settings(), pendingCodeId: id })
    return code
  }

  // --- /api/aris/backup ----------------------------------------------------------------------------
  /** Thư mục mã của aris (gói này nằm ở `packages/aris-backup/lib`): lệnh khôi phục chạy ở đó. */
  const repo = () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    return existsSync(join(root, 'scripts', 'aris.mjs')) ? root : undefined
  }
  ctx.inject(['connection'], (ctx) => {
    const state = async () => {
      const s = settings()
      const dirError = s.dir ? ((await checkDir(s.dir)) ?? null) : null
      const list = dirError ? [] : await copies(s.dir)
      const kept = pickKeep(list, s.keepDaily, s.keepWeekly).keep
      const drills = runs('drill')
      const backups = runs('backup')
      const free =
        s.dir && !dirError
          ? await statfs(s.dir).then(
              (f) => f.bavail * f.bsize,
              () => null,
            )
          : null
      const parts = await plan().catch(() => [])
      return {
        settings: { ...s, pendingCodeId: undefined },
        hasPending: !!s.pendingCodeId,
        busy,
        dirError,
        free,
        parts: parts.map((p) => ({ id: p.id, files: p.files.length + p.sqlite.length, bytes: p.bytes })),
        copies: list.map((c) => ({
          name: c.name,
          at: c.at.toISOString(),
          bytes: c.bytes,
          kind: (kept.get(c) ?? null) as KeepReason | null,
          drilled: drills.some((d) => d.ok && d.file === c.name),
          oldCode: !!s.codeId && c.codeId !== s.codeId,
        })),
        last: backups[0] ?? null,
        lastOk: backups.find((r) => r.ok) ?? null,
        drill: drills[0] ?? null,
        repo: repo() ?? null,
      }
    }
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/backup',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          if (request.method !== 'POST') return json(await state())
          let body: Record<string, unknown>
          try {
            body = (await request.json()) as Record<string, unknown>
          } catch {
            return json({ error: 'JSON không hợp lệ' }, 400)
          }
          const s = settings()
          try {
            switch (body.op) {
              case 'pick-dir': {
                const dir = await chooseFolder('Chọn thư mục cất bản sao lưu của aris')
                if (!dir) return json({ ...(await state()), picked: null })
                const bad = await checkDir(dir)
                if (bad) return json({ error: bad }, 400)
                await save({ ...settings(), dir })
                return json({ ...(await state()), picked: dir })
              }
              case 'set-dir': {
                const dir =
                  typeof body.dir === 'string'
                    ? body.dir.trim().replace(/^~(?=\/|$)/, process.env.HOME ?? '~')
                    : ''
                const bad = await checkDir(dir)
                if (bad) return json({ error: bad }, 400)
                await save({ ...settings(), dir })
                break
              }
              case 'set':
                await save(cleanBackup(body.settings, s))
                break
              case 'code-new':
                return json({ ...(await state()), code: await pendingCode() })
              case 'code-confirm': {
                if (!s.pendingCodeId) return json({ error: 'chưa có mã mới' }, 409)
                await save({
                  ...s,
                  codeId: s.pendingCodeId,
                  pendingCodeId: undefined,
                  codeSetAt: new Date().toISOString(),
                })
                break
              }
              case 'code-cancel': {
                if (s.pendingCodeId) await keychain.delete(codeRef(s.pendingCodeId))
                await save({ ...s, pendingCodeId: undefined })
                break
              }
              case 'enable': {
                const bad = await checkDir(s.dir)
                if (bad) return json({ error: bad }, 400)
                const codeId = s.pendingCodeId ?? s.codeId
                if (!codeId || !(await codeFor(codeId))) return json({ error: 'chưa có mã khôi phục' }, 409)
                await save({
                  ...s,
                  enabled: true,
                  codeId,
                  pendingCodeId: undefined,
                  codeSetAt: s.pendingCodeId ? new Date().toISOString() : s.codeSetAt,
                })
                void job(true)
                break
              }
              case 'disable':
                await save({ ...s, enabled: false })
                break
              case 'run':
                if (!s.enabled) return json({ error: 'sao lưu chưa bật' }, 409)
                void job()
                break
              case 'drill':
                if (busy) return json({ error: 'đang chạy việc khác' }, 409)
                busy = 'drill'
                void drill(typeof body.name === 'string' ? body.name : undefined)
                  .catch((e: unknown) => logger.warn('diễn tập: %s', errText(e)))
                  .finally(() => (busy = null))
                break
              case 'extract': {
                const copy = (await copies(s.dir)).find((c) => c.name === body.name)
                if (!copy) return json({ error: 'không thấy bản này' }, 404)
                const code = await codeFor(copy.codeId)
                if (!code) return json({ error: 'không thấy mã khôi phục của bản này trong Keychain' }, 409)
                const dest = await chooseFolder('Chọn thư mục để giải nén bản sao lưu')
                if (!dest) return json({ ...(await state()), extracted: null })
                if (busy) return json({ error: 'đang chạy việc khác' }, 409)
                busy = 'extract'
                const to = join(dest, copy.name.replace(/\.aris$/, ''))
                try {
                  await extractBackup(join(s.dir, copy.name), code, to)
                } finally {
                  busy = null
                }
                return json({ ...(await state()), extracted: to })
              }
              default:
                return json({ error: 'op không hợp lệ' }, 400)
            }
          } catch (e) {
            return json({ error: errText(e) }, 500)
          }
          return json(await state())
        },
      })
      return () => void dispose()
    }, 'aris-backup: /api/aris/backup')
  })
}
