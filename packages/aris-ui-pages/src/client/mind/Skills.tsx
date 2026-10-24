/**
 * 3.2 · Thư viện skill (giai đoạn 3, đợt 3): skill của mọi bot từ `@aris/skills` — lọc theo trạng
 * thái, tìm, bảng bot, bản (`v2 → v3` khi có bản vá chờ), trạng thái, lượt dùng. Ít dùng, lưu kho,
 * ghim, tỉ lệ thành công, học từ tài liệu và sao lưu là đợt 4 (để mờ).
 */
import { Button, Mascot, PageShell, Pill, PinIcon, useTeamData } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'

/** Một skill trong `GET /api/aris/skills`. */
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
}

type Filter = 'all' | 'pending' | 'active' | 'rare' | 'archived' | 'pinned'

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
  const [query, setQuery] = useState('')
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
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  const all = rows ?? []
  const pending = all.filter((r) => r.proposed).length
  const q = query.trim().toLowerCase()
  const shown = all.filter(
    (r) =>
      (!params.bot || r.bot === params.bot) &&
      (filter === 'all' ||
        (filter === 'pending'
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
  ]
  return (
    <PageShell
      title={t('sk.title')}
      subtitle={`${t('sk.summary', { n: all.length, p: pending })}${curator?.next ? ` · ${t('sk.curatorNext', { d: dayOf(curator.next) || t('sk.today') })}` : ''}`}
      actions={
        <>
          <Later t={t} stage={3} row label={t('sk.learnLater')}>
            <Button disabled>{t('sk.learnFrom')}</Button>
          </Later>
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
        {params.bot && (
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
        {chips.map(([id, label]) => (
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
            <button
              key={r.id}
              type="button"
              className="ap-sk"
              data-hot={r.proposed ? true : undefined}
              onClick={() => nav.go('skill', { id: r.id })}
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
                <div className="a-muted ap-li-sub">
                  {r.proposed
                    ? r.version
                      ? t('sk.patchNote', { why: r.proposed.why ?? '' })
                      : t('sk.newNote', { why: r.proposed.why ?? '' })
                    : r.description}
                </div>
              </span>
              <span title={bot?.name}>
                <Mascot id={bot?.mascot ?? 'aris'} size={22} />
              </span>
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
                      {pct(r.success.base)} → <b style={{ color: 'var(--a-ok)' }}>{pct(r.success.cand)}</b>
                    </>
                  ) : (
                    pct(r.success.cand)
                  )
                ) : (
                  '—'
                )}
              </span>
              <span className="a-muted">{dayOf(r.updatedAt) || t('sk.today')}</span>
            </button>
          )
        })}
      </div>
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
    </PageShell>
  )
}
