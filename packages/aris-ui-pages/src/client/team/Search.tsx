/**
 * 1.6 · Tìm trong mọi phiên: ô tìm, lọc theo bot hoặc dự án, kết quả có đoạn trích tô sáng.
 * Tìm trong nội dung thật qua `/api/aris/recall` (chỉ mục toàn văn của dsh). Giai đoạn 1 chỉ
 * có Aris nên lọc theo bot chỉ có Aris; bot khác thêm vào khi có dịch vụ đội bot (GĐ2).
 */
import { isProjectWorkspace } from '@aris/ui-kit'
import { Mascot, SearchIcon } from '@aris/ui-kit/react'
import { useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { botName } from '../mind/names.js'
import { highlight, useRecallSearch, type RecallHit } from './recall-api.js'

type Filter = 'all' | 'aris' | 'projects'

const projectName = (cwd: string | undefined) =>
  cwd && isProjectWorkspace({ path: cwd })
    ? cwd
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .pop()
    : undefined

function when(t: PageProps['t'], time: number): string {
  const d = new Date(time)
  const today = new Date()
  const day = (x: Date) => x.toDateString()
  if (day(d) === day(today)) return t('search.today')
  if (day(d) === day(new Date(today.getTime() - 86_400_000))) return t('search.yesterday')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Search({ t, nav }: PageProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const state = useRecallSearch(query)
  const hits: RecallHit[] = state.status === 'ready' ? state.hits : []
  const results = hits.filter((h) => filter !== 'projects' || projectName(h.cwd))
  useEffect(() => setActive(0), [state, filter])

  const open = (h: RecallHit | undefined) => {
    if (h) nav.openSession(h.sessionId)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') nav.close()
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(results.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter') open(results[active])
    else return
    e.preventDefault()
  }
  const filters: [Filter, string][] = [
    ['all', t('search.all')],
    ['aris', botName('aris')],
    ['projects', t('search.projects')],
  ]
  const status =
    state.status === 'idle'
      ? t('search.typing')
      : state.status === 'loading'
        ? t('search.loading')
        : state.status === 'error'
          ? t('search.error', { error: state.error })
          : results.length
            ? t('search.count', { n: results.length, q: state.query })
            : t('search.empty', { q: state.query })
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
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.label')}
            aria-label={t('search.label')}
          />
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
          <div
            className="a-muted"
            style={{
              fontSize: 12,
              padding: '4px 10px 6px',
              color: state.status === 'error' ? 'var(--a-danger)' : undefined,
            }}
          >
            {status}
          </div>
          {results.map((h, i) => {
            const project = projectName(h.cwd)
            return (
              <div
                key={h.sessionId}
                role="option"
                aria-selected={i === active}
                className="res"
                onPointerEnter={() => setActive(i)}
                onClick={() => open(h)}
              >
                <Mascot id="aris" size={26} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <b>{h.title}</b>
                    <span className="a-muted" style={{ fontSize: 12 }}>
                      {project ? t('search.project', { name: project }) : botName('aris')}
                    </span>
                    <span className="a-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                      {when(t, h.time)}
                    </span>
                  </span>
                  <span className="snip">
                    {highlight(h.snippet, state.status === 'ready' ? state.query : '').map(
                      ([pre, hit, post], k) => (
                        <span key={k}>
                          {pre}
                          {hit && <mark>{hit}</mark>}
                          {post}
                        </span>
                      ),
                    )}
                  </span>
                </span>
              </div>
            )
          })}
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
