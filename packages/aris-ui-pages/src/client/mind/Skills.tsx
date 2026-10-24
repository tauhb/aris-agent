/**
 * 3.2 · Thư viện skill (giai đoạn 3, đợt 3): skill của mọi bot từ `@aris/skills` — lọc theo trạng
 * thái, tìm, bảng bot, bản (`v2 → v3` khi có bản vá chờ), trạng thái, lượt dùng. Ít dùng, lưu kho,
 * ghim, tỉ lệ thành công, học từ tài liệu và sao lưu là đợt 4 (để mờ).
 */
import { Button, Mascot, PageShell, Pill, useTeamData } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'

/** Một skill trong `GET /api/aris/skills`. */
export interface SkillRow {
  id: string
  bot: string
  name: string
  description: string
  status: 'draft' | 'active' | 'rejected'
  version: number
  uses: number
  updatedAt: string
  proposed: { version: number; why?: string; by: string } | null
}

type Filter = 'all' | 'pending' | 'active'

export const dayOf = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? ''
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Skills({ t, nav }: PageProps) {
  const team = useTeamData()
  const [rows, setRows] = useState<SkillRow[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(new URL('api/aris/skills', document.baseURI), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ skills: SkillRow[] }>) : undefined))
        .then((d) => live && d && setRows(d.skills))
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
      (filter === 'all' || (filter === 'pending' ? r.proposed : r.status === 'active')) &&
      (!q || r.name.includes(q) || r.description.toLowerCase().includes(q)),
  )
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  const chips: [Filter, string][] = [
    ['all', t('sk.all')],
    ['pending', t('sk.pending', { n: pending })],
    ['active', t('sk.active')],
  ]
  return (
    <PageShell
      title={t('sk.title')}
      subtitle={t('sk.summary', { n: all.length, p: pending })}
      actions={
        <Later t={t} stage={3} row label={t('sk.later')}>
          <span style={{ display: 'flex', gap: 8 }}>
            <Button disabled>{t('sk.learnFrom')}</Button>
            <Button disabled>{t('sk.backup')}</Button>
          </span>
        </Later>
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
        {(['rare', 'archived', 'pinned'] as const).map((k) => (
          <button key={k} type="button" className="ap-chip" disabled title={t('sk.later')}>
            {t(`sk.${k}`)}
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
                <span className="a-mono" style={{ fontWeight: 500 }}>
                  {r.name}
                </span>
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
                <Pill tone={r.proposed ? 'warn' : r.status === 'active' ? 'ok' : 'muted'}>
                  {r.proposed ? t('sk.st.pending') : t('sk.st.active')}
                </Pill>
              </span>
              <span className={r.uses ? undefined : 'a-muted'}>{r.uses}</span>
              <span className="a-muted" title={t('sk.later')}>
                —
              </span>
              <span className="a-muted">{dayOf(r.updatedAt) || t('sk.today')}</span>
            </button>
          )
        })}
      </div>
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('sk.policyNow')}
      </p>
    </PageShell>
  )
}
