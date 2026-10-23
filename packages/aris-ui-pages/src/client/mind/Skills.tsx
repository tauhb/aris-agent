/** 3.2 · Thư viện skill: lọc theo trạng thái, bảng skill (bot, bản, trạng thái, lượt dùng, tỉ lệ thành công). */
import { Button, PageShell, Pill, PinIcon } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot } from '../ui.js'
import { DEMO_SKILLS as S, type SkillState } from './demo.js'

const TONE: Record<SkillState, 'warn' | 'ok' | 'muted'> = {
  pending: 'warn',
  active: 'ok',
  rare: 'muted',
  archived: 'muted',
}
type Filter = 'all' | SkillState | 'pinned'

export function Skills({ t, nav }: PageProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const rows = S.rows.filter((r) => filter === 'all' || (filter === 'pinned' ? r.pinned : r.state === filter))
  const chips: [Filter, string][] = [
    ['all', t('sk.all')],
    ['pending', t('sk.pending', { n: S.counts.pending })],
    ['active', t('sk.active')],
    ['rare', t('sk.rare')],
    ['archived', t('sk.archived')],
    ['pinned', t('sk.pinned')],
  ]
  return (
    <PageShell
      title={t('sk.title')}
      subtitle={S.summary}
      actions={
        <>
          <Button>{t('sk.learnFrom')}</Button>
          <Button>{t('sk.backup')}</Button>
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
          <input type="search" aria-label={t('sk.search')} placeholder={t('sk.search')} />
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
        {rows.map((r) => {
          const archived = r.state === 'archived'
          return (
            <button
              key={r.id}
              type="button"
              className="ap-sk"
              data-hot={r.id === 'bao-cao-doanh-thu-tuan' || undefined}
              onClick={() => nav.go('skill', { id: r.id })}
            >
              <span>
                <span className={archived ? 'a-mono a-muted' : 'a-mono'} style={{ fontWeight: 500 }}>
                  {r.id}
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
                {r.note && (
                  <div className="a-muted" style={{ fontSize: 12 }}>
                    {r.note}
                  </div>
                )}
              </span>
              <Bot id={r.bot} />
              <span className={archived ? 'a-mono a-muted' : 'a-mono'}>{r.version}</span>
              <span>
                <Pill tone={TONE[r.state]}>{r.stateText}</Pill>
              </span>
              <span className={archived ? 'a-muted' : undefined}>{r.uses}</span>
              <span className={r.success.length > 1 || r.success[0]!.includes('%') ? undefined : 'a-muted'}>
                {r.success.length > 1 ? (
                  <>
                    {r.success[0]} → <b style={{ color: 'var(--a-ok)' }}>{r.success[1]}</b>
                  </>
                ) : (
                  r.success[0]
                )}
              </span>
              <span className="a-muted">{r.updated}</span>
            </button>
          )
        })}
      </div>
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('sk.policy')}
      </p>
    </PageShell>
  )
}
