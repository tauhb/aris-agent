/** 1.6 · Tìm trong mọi phiên (⌘K): ô tìm, lọc theo bot hoặc phòng, kết quả có đoạn trích tô sáng. */
import { Mascot, SearchIcon } from '@aris/ui-kit/react'
import { useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { botName } from '../mind/names.js'
import { DEMO_SEARCH as S } from './demo.js'

type Filter = 'all' | 'aris' | 'lam' | 'mai' | 'rooms'

export function Search({ t, nav }: PageProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const results = S.results.filter(
    (r) =>
      filter === 'all' ||
      (filter === 'rooms' ? r.where.startsWith('Phòng') : r.bot === filter && !r.where.startsWith('Phòng')),
  )
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') nav.close()
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(results.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter') nav.openPanel(null)
    else return
    e.preventDefault()
  }
  const filters: [Filter, string][] = [
    ['all', t('search.all')],
    ['aris', botName('aris')],
    ['lam', botName('lam')],
    ['mai', botName('mai')],
    ['rooms', t('search.rooms')],
  ]
  return (
    <div
      className="a-overlay ap-search-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) nav.close()
      }}
    >
      <div
        className="ap-search-box"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.label')}
        onKeyDown={onKey}
      >
        <div className="top">
          <SearchIcon size={18} />
          <input ref={input} defaultValue={S.query} aria-label={t('search.label')} />
          <span className="ap-key">Esc</span>
        </div>
        <div role="radiogroup" aria-label={t('search.filter')} className="filters">
          {filters.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              aria-pressed={filter === id}
              className="ap-chip ap-pick"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="listbox" aria-label={t('search.results')} className="list">
          <div className="a-muted" style={{ fontSize: 12, padding: '4px 10px 6px' }}>
            {t('search.count', { n: results.length, q: S.query })}
          </div>
          {results.map((r, i) => (
            <div
              key={r.title}
              role="option"
              aria-selected={i === active}
              className="res"
              onPointerEnter={() => setActive(i)}
              onClick={() => nav.openPanel(null)}
            >
              <Mascot id={r.bot} size={26} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <b>{r.title}</b>
                  <span className="a-muted" style={{ fontSize: 12 }}>
                    {r.where}
                  </span>
                  <span className="a-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                    {r.when}
                  </span>
                </span>
                <span className="snip">
                  {r.snip[0]}
                  <mark>{r.snip[1]}</mark>
                  {r.snip[2]}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="foot a-muted">
          <span>
            <span className="ap-key">↑</span> <span className="ap-key">↓</span> {t('search.pick')}
          </span>
          <span>
            <span className="ap-key">Enter</span> {t('search.open')}
          </span>
          <span style={{ marginLeft: 'auto' }}>{t('search.scope')}</span>
        </div>
      </div>
    </div>
  )
}
