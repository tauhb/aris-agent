/**
 * 3.2 · Thư viện skill (giai đoạn 3, đợt 3): skill của mọi bot từ `@aris/skills` — lọc theo trạng
 * thái, tìm, bảng bot, bản (`v2 → v3` khi có bản vá chờ), trạng thái, lượt dùng. Ít dùng, lưu kho,
 * ghim, tỉ lệ thành công, học từ tài liệu và sao lưu là đợt 4 (để mờ).
 */
import { Button, Mascot, PageShell, Pill, PinIcon, useTeamData } from '@aris/ui-kit/react'
import { Fragment, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'
import { AssignPicker } from './SkillAssign.js'
import { SkillLibrary, packCounts, type LibraryPack } from './SkillLibrary.js'
import { skillsPost } from './skills-api.js'
import { assignedTo, isTeamSkill, sourceLabel, type Assigned, type SkillSource } from './skill-team.js'

/** Một skill trong `GET /api/aris/skills`. */
/** Cặp skill nghi trùng (`?duplicates=preview` của `/api/aris/skills`). */
interface DupPair {
  a: { id: string; name: string; bot: string }
  b: { id: string; name: string; bot: string }
  score: number
}

/** Người dọn kho (`curator` của `/api/aris/skills`). */
interface Curator {
  next: string
  report: { at: string; archive: unknown[]; stale: unknown[] } | null
  staleDays: number
  archiveDays: number
}

export interface SkillRow {
  id: string
  bot: string
  name: string
  description: string
  status: 'draft' | 'active' | 'archived' | 'rejected'
  version: number
  uses: number
  updatedAt: string
  pinned?: boolean
  /** Ít dùng: quá `staleDays` ngày không dùng (người dọn kho). */
  stale: boolean
  idleDays: number
  proposed: { version: number; why?: string; by: string } | null
  /** Tỉ lệ đạt của lần kiểm thử gần nhất (bản so sánh → bản thử). */
  success: { base: number | null; cand: number; version: number } | null
  /** Skill của đội (`bot` là `_doi`): bot nào được dùng. */
  assigned?: Assigned
  usesBy?: Record<string, number>
  /** Nơi nhập từ đâu. */
  source?: SkillSource | null
}

type Filter = 'all' | 'pending' | 'active' | 'rare' | 'archived' | 'pinned' | 'unassigned'
type Scope = 'all' | 'team' | 'own' | 'library'

const pct = (x: number) => `${Math.round(x * 100)}%`

export const dayOf = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? ''
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Skills({ t, nav, params }: PageProps) {
  const team = useTeamData()
  const [rows, setRows] = useState<SkillRow[] | null>(null)
  const [curator, setCurator] = useState<Curator | null>(null)
  const [plan, setPlan] = useState<{ archive: { name: string; bot: string }[] } | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [scope, setScope] = useState<Scope>('all')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairs, setPairs] = useState<DupPair[]>([])
  const [allPairs, setAllPairs] = useState(false)
  const [dupNote, setDupNote] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [packs, setPacks] = useState<LibraryPack[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(new URL('api/aris/skills', document.baseURI), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ skills: SkillRow[]; curator?: Curator }>) : undefined))
        .then((d) => {
          if (!live || !d) return
          setRows(d.skills)
          setCurator(d.curator ?? null)
        })
        .catch(() => {})
        .then(() => fetch(new URL('api/aris/skills?curator=preview', document.baseURI)))
        .then((r) => (r.ok ? (r.json() as Promise<{ plan: NonNullable<typeof plan> }>) : undefined))
        .then((d) => live && d && setPlan(d.plan))
        .catch(() => {})
        .then(() => fetch(new URL('api/aris/skills?duplicates=preview', document.baseURI)))
        .then((r) => (r.ok ? (r.json() as Promise<{ pairs: DupPair[] }>) : undefined))
        .then((d) => live && d && setPairs(d.pairs))
        .catch(() => {})
        .then(() => fetch(new URL('api/aris/skills?library=1', document.baseURI)))
        .then((r) => (r.ok ? (r.json() as Promise<{ packs: LibraryPack[] }>) : undefined))
        .then((d) => live && d && setPacks(d.packs))
        .catch(() => {})
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [tick])
  const all = rows ?? []
  const teamRows = all.filter(isTeamSkill)
  const unassigned = teamRows.filter((r) => r.status === 'active' && !r.assigned?.length).length
  const pending = all.filter((r) => r.proposed).length
  const q = query.trim().toLowerCase()
  const shown = all.filter(
    (r) =>
      (!params.bot || r.bot === params.bot || (isTeamSkill(r) && assignedTo(r, params.bot))) &&
      (scope === 'all' || (scope === 'team') === isTeamSkill(r)) &&
      (filter === 'all' ||
        (filter === 'unassigned'
          ? isTeamSkill(r) && r.status === 'active' && !r.assigned?.length
          : filter === 'pending'
            ? r.proposed
            : filter === 'rare'
              ? r.stale
              : filter === 'archived'
                ? r.status === 'archived'
                : filter === 'pinned'
                  ? r.pinned
                  : r.status === 'active')) &&
      (!q || r.name.includes(q) || r.description.toLowerCase().includes(q)),
  )
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  const chips: [Filter, string][] = [
    ['all', t('sk.all')],
    ['pending', t('sk.pending', { n: pending })],
    ['active', t('sk.active')],
    ['rare', t('sk.rare')],
    ['archived', t('sk.archived')],
    ['pinned', t('sk.pinned')],
    ...(unassigned > 0 ? [['unassigned', t('ski.unassigned', { n: unassigned })] as [Filter, string]] : []),
  ]
  const scopes: [Scope, string][] = [
    ['all', t('ski.scopeAll', { n: all.length })],
    ['team', t('ski.scopeTeam', { n: teamRows.length })],
    ['own', t('ski.scopeOwn', { n: all.length - teamRows.length })],
    ['library', t('lib.scope', { n: packs?.length ?? 0 })],
  ]
  const libUpdates = (packs ?? []).reduce((n, p) => n + packCounts(p).updates, 0)
  const library = scope === 'library'

  /** Nhờ aris soạn bản gộp cho các cặp nghi trùng (model rẻ, kết quả là đề xuất ở Hộp duyệt). */
  async function findDuplicates() {
    setBusy(true)
    setError(null)
    setDupNote(null)
    try {
      const r = await skillsPost<{
        report: { pairs: number; proposed: unknown[]; overlap: unknown[]; usd: number; capped?: boolean }
      }>({ op: 'find-duplicates' })
      const { pairs: n, proposed, overlap, usd } = r.report
      setDupNote(
        n === 0
          ? t('ski.dupNone')
          : t('ski.dupDone', {
              n,
              p: proposed.length,
              o: overlap.length,
              usd: usd.toFixed(3),
            }) + (r.report.capped ? ` ${t('ski.dupCapped')}` : ''),
      )
      setTick((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveAssign(id: string, next: Assigned) {
    setBusy(true)
    setError(null)
    try {
      await skillsPost({ op: 'assign', skill: id, bots: next })
      setAssigning(null)
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <PageShell
      title={t('sk.title')}
      subtitle={`${t('sk.summary', { n: all.length, p: pending })}${curator?.next ? ` · ${t('sk.curatorNext', { d: dayOf(curator.next) || t('sk.today') })}` : ''}`}
      actions={
        <>
          <Later t={t} stage={3} row label={t('sk.learnLater')}>
            <Button disabled>{t('sk.learnFrom')}</Button>
          </Later>
          <Button disabled={busy} onClick={() => void findDuplicates()}>
            {t('ski.dupFind')}
          </Button>
          <Button variant="primary" onClick={() => nav.go('skill-import')}>
            {t('ski.import')}
          </Button>
          <a
            className="a-btn secondary"
            style={{ textDecoration: 'none' }}
            href={new URL('api/aris/skills?backup=1', document.baseURI).href}
            download
          >
            {t('sk.backup')}
          </a>
        </>
      }
    >
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
        role="group"
        aria-label={t('sk.filter')}
      >
        <div className="ap-seg" role="tablist" aria-label={t('ski.scope')}>
          {scopes.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={scope === id ? 'on' : ''}
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {library && libUpdates > 0 && <Pill tone="warn">{t('lib.updatesPill', { n: libUpdates })}</Pill>}
        {!library && (
          <label
            className="ap-search"
            style={{ flex: '0 1 300px', margin: 0, padding: '6px 10px', borderRadius: 10 }}
          >
            ⌕
            <input
              type="search"
              aria-label={t('sk.search')}
              placeholder={t('sk.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
        {!library && params.bot && (
          <button
            type="button"
            className="ap-chip"
            aria-pressed
            title={t('sk.clearBot')}
            onClick={() => nav.go('skills')}
          >
            {t('sk.botFilter', { name: botOf(params.bot)?.name ?? params.bot })} ×
          </button>
        )}
        {!library &&
          chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ap-chip"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
      </div>
      {library && <SkillLibrary t={t} nav={nav} packs={packs} onChanged={() => setTick((n) => n + 1)} />}
      {!library && (pairs.length > 0 || dupNote) && (
        <div
          className="a-card"
          style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
        >
          {pairs.length > 0 && <b>{t('ski.dupTitle', { n: pairs.length })}</b>}
          {pairs.length > 0 && (
            <span className="a-muted" style={{ flex: '1 1 320px', fontSize: 13 }}>
              {(allPairs ? pairs : pairs.slice(0, 2)).map((p, i) => (
                <span key={p.a.id + p.b.id}>
                  {i > 0 && ' · '}
                  <span className="a-mono">{p.a.name}</span> ↔ <span className="a-mono">{p.b.name}</span>
                </span>
              ))}
              {!allPairs && pairs.length > 2 && ` · ${t('ski.dupMore', { n: pairs.length - 2 })}`}
            </span>
          )}
          {pairs.length > 2 && !allPairs && (
            <Button size="sm" onClick={() => setAllPairs(true)}>
              {t('ski.dupSee', { n: pairs.length })}
            </Button>
          )}
          {pairs.length > 0 && (
            <Button size="sm" disabled={busy} onClick={() => void findDuplicates()}>
              {t('ski.dupDraft')}
            </Button>
          )}
          {pairs.length > 0 && (
            <span className="a-muted" style={{ flexBasis: '100%', fontSize: 12 }}>
              {t('ski.dupHint')}
            </span>
          )}
          {dupNote && (
            <span style={{ flexBasis: '100%', fontSize: 13 }} role="status">
              {dupNote}
            </span>
          )}
        </div>
      )}
      {!library && (
        <div className="a-card" style={{ overflowX: 'auto' }}>
          <div className="ap-sk a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
            <span>{t('sk.skill')}</span>
            <span>{t('sk.bot')}</span>
            <span>{t('sk.version')}</span>
            <span>{t('sk.state')}</span>
            <span>{t('sk.uses')}</span>
            <span>{t('sk.success')}</span>
            <span>{t('sk.updated')}</span>
          </div>
          {rows && shown.length === 0 && (
            <div className="a-muted" style={{ padding: '14px 16px', fontSize: 13 }}>
              {all.length ? t('sk.noMatch') : t('sk.empty')}
            </div>
          )}
          {shown.map((r) => {
            const bot = botOf(r.bot)
            return (
              <Fragment key={r.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="ap-sk"
                  data-hot={r.proposed ? true : undefined}
                  onClick={() => nav.go('skill', { id: r.id })}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      nav.go('skill', { id: r.id })
                    }
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      className={r.status === 'archived' ? 'a-mono a-muted' : 'a-mono'}
                      style={{ fontWeight: 500 }}
                    >
                      {r.name}
                    </span>
                    {r.pinned && (
                      <span
                        className="a-muted"
                        title={t('sk.pinnedMark')}
                        style={{ marginLeft: 6, verticalAlign: '-2px' }}
                      >
                        <PinIcon />
                      </span>
                    )}
                    {isTeamSkill(r) && r.source && (
                      <span style={{ marginLeft: 6 }}>
                        <Pill tone="accent">{sourceLabel(r.source, t('lib.source'))}</Pill>
                      </span>
                    )}
                    {r.proposed && r.version > 0 && r.proposed.by === 'import' && (
                      <span style={{ marginLeft: 6 }}>
                        <Pill tone="warn">{t('ski.newer')}</Pill>
                      </span>
                    )}
                    <div className="a-muted ap-li-sub">
                      {r.proposed
                        ? r.version
                          ? t('sk.patchNote', { why: r.proposed.why ?? '' })
                          : t('sk.newNote', { why: r.proposed.why ?? '' })
                        : r.description}
                    </div>
                  </span>
                  {isTeamSkill(r) ? (
                    <button
                      type="button"
                      className="ap-sc-pill"
                      aria-expanded={assigning === r.id}
                      aria-label={t('ski.assignTitle', { name: r.name })}
                      onClick={(e) => {
                        e.stopPropagation()
                        setError(null)
                        setAssigning(assigning === r.id ? null : r.id)
                      }}
                    >
                      <span className="ap-sc-faces" aria-hidden="true">
                        {(r.assigned === 'all' ? [] : (r.assigned ?? []))
                          .slice(0, 3)
                          .map((id) => botOf(id))
                          .map((b) =>
                            b ? <Mascot key={b.id} id={b.mascot} accessory={b.accessory} size={22} /> : null,
                          )}
                      </span>
                      {r.assigned === 'all'
                        ? t('conn.scopeAll')
                        : (r.assigned?.length ?? 0) === 0
                          ? t('ski.noneAssigned')
                          : t('conn.nBots', { n: r.assigned?.length ?? 0 })}{' '}
                      ▾
                    </button>
                  ) : (
                    <span title={bot?.name}>
                      <Mascot id={bot?.mascot ?? 'aris'} size={22} accessory={bot?.accessory} />
                    </span>
                  )}
                  <span className="a-mono">
                    {r.proposed
                      ? r.version
                        ? `v${r.version} → v${r.proposed.version}`
                        : `v${r.proposed.version}`
                      : `v${r.version}`}
                  </span>
                  <span>
                    <Pill tone={r.proposed ? 'warn' : r.status === 'active' && !r.stale ? 'ok' : 'muted'}>
                      {r.proposed
                        ? t('sk.st.pending')
                        : r.status === 'archived'
                          ? t('sk.st.archived')
                          : r.stale
                            ? t('sk.st.rare', { n: r.idleDays })
                            : t('sk.st.active')}
                    </Pill>
                  </span>
                  <span className={r.uses ? undefined : 'a-muted'}>{r.uses}</span>
                  <span
                    className={r.success ? undefined : 'a-muted'}
                    title={r.success ? t('sk.successHint') : t('sk.noEval')}
                  >
                    {r.success ? (
                      r.success.base !== null ? (
                        <>
                          {pct(r.success.base)} →{' '}
                          <b style={{ color: 'var(--a-ok)' }}>{pct(r.success.cand)}</b>
                        </>
                      ) : (
                        pct(r.success.cand)
                      )
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="a-muted">{dayOf(r.updatedAt) || t('sk.today')}</span>
                </div>
                {assigning === r.id && (
                  <div className="ap-sk-panel">
                    <AssignPicker
                      t={t}
                      name={r.name}
                      assigned={r.assigned}
                      busy={busy}
                      onSave={(next) => void saveAssign(r.id, next)}
                      onCancel={() => setAssigning(null)}
                    />
                    {error && (
                      <div style={{ color: 'var(--a-danger)', fontSize: 13, padding: '0 16px 10px' }}>
                        {error}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
      {!library && (
        <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
          {t('sk.policyNow', { stale: curator?.staleDays ?? 30, archive: curator?.archiveDays ?? 90 })}
          {curator?.report &&
            ` ${t('sk.curatorLast', {
              d: dayOf(curator.report.at) || t('sk.today'),
              a: curator.report.archive.length,
              s: curator.report.stale.length,
            })}`}
          {plan &&
            ` ${
              plan.archive.length
                ? t('sk.curatorPlan', {
                    names: plan.archive.map((s) => `${s.name} (${botOf(s.bot)?.name ?? s.bot})`).join(', '),
                  })
                : t('sk.curatorNone')
            }`}
        </p>
      )}
    </PageShell>
  )
}
