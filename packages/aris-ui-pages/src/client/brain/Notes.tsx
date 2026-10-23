/** 5.1 · Ghi chú: cây ghi chú, bài đang mở có liên kết, đồ thị quanh ghi chú và gợi ý nối. */
import { Button, NODE_COLORS, Segmented } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Dot } from '../ui.js'
import { DEMO_LOCAL_GRAPH as G, DEMO_NOTE as N, DEMO_TREE as T, type Rich } from './demo.js'

/** Đoạn văn có liên kết ghi chú (liên kết chưa mở được cho tới GĐ5). */
function RichText({ parts }: { parts: Rich }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a key={i} className="ap-wl" href="#" onClick={(e) => e.preventDefault()}>
            {p[0]}
          </a>
        ),
      )}
    </>
  )
}

const LEGEND = [
  ['type.note', NODE_COLORS.note],
  ['type.project', NODE_COLORS.project],
  ['type.person', NODE_COLORS.person],
  ['type.memory', NODE_COLORS.memory],
  ['type.session', 'var(--a-muted)'],
  ['type.suggest', 'var(--a-accent)'],
] as const

export function Notes({ t, nav }: PageProps) {
  const [deep, setDeep] = useState(true)
  return (
    <div className="ap-split ap-brain">
      <nav className="ap-tree" aria-label={t('br.tree')}>
        <button
          type="button"
          className="ap-tn ap-tn-inbox"
          onClick={() => nav.go('brain', { view: 'inbox' })}
        >
          <span>{t('br.inbox')}</span>
          <span className="a-pill">{T.inbox}</span>
        </button>
        <button type="button" className="ap-tn">
          {T.daily}
        </button>
        {T.groups.map((g) => (
          <div key={g.title}>
            <div className="ap-th">{g.title}</div>
            {g.items.map((it) => (
              <button
                type="button"
                key={it.name}
                className={`ap-tn${it.muted ? ' a-muted' : ''}`}
                aria-current={it.active ? 'page' : undefined}
              >
                {it.name}
                {it.count !== undefined && <span className="a-muted">{it.count}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="a-muted" style={{ fontSize: 11.5, marginTop: 'auto', padding: '8px 10px' }}>
          {t('br.obsidian')}
        </div>
      </nav>
      <main className="ap-note-main">
        <div className="ap-note-bar">
          <span className="a-muted">{N.path.join(' / ')} /</span>
          <span style={{ fontWeight: 600 }}>{N.short}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => nav.go('brain', { view: 'ask' })}>
              {t('br.ask')}
            </Button>
            <Button size="sm" onClick={() => nav.go('brain', { view: 'graph' })}>
              {t('br.graph')}
            </Button>
          </span>
        </div>
        <article className="ap-note">
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {N.meta}
          </div>
          <h1>{N.title}</h1>
          <div className="ap-sum">
            <b>{t('br.summary')}</b> · {N.summary}
          </div>
          <p>
            <RichText parts={N.intro} />
          </p>
          <h2>{t('br.goals')}</h2>
          <ul>
            {N.goals.map((g, i) => (
              <li key={i}>
                <RichText parts={g} />
              </li>
            ))}
          </ul>
          <div className="ap-backlinks">
            <div className="a-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {t('br.backlinks', { n: N.backlinks.length })}
            </div>
            <div className="ap-bls">
              {N.backlinks.map((b) => (
                <span className="ap-bl" key={b}>
                  {b}
                </span>
              ))}
            </div>
          </div>
        </article>
      </main>
      <aside className="ap-aside" aria-label={t('br.around')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ flex: 1 }}>{t('br.around')}</b>
          <Segmented
            label={t('br.depth')}
            value={deep ? '2' : '1'}
            onChange={(v) => setDeep(v === '2')}
            options={[
              { value: '1', label: t('br.depth1') },
              { value: '2', label: t('br.depth2') },
            ]}
          />
        </div>
        <svg
          className={`ap-lgraph${deep ? '' : ' d1'}`}
          viewBox={G.viewBox}
          role="img"
          aria-label={G.label}
          // Hình vẽ cố định soạn sẵn trong mã (không lấy từ người dùng), thay ở GĐ5.
          dangerouslySetInnerHTML={{ __html: G.svg }}
        />
        <div className="ap-tags" style={{ gap: '6px 12px' }}>
          {LEGEND.map(([k, c]) => (
            <span className="ap-lg" key={k}>
              <Dot color={c} />
              {t(k)}
            </span>
          ))}
        </div>
        <button type="button" className="ap-link" onClick={() => nav.go('brain', { view: 'graph' })}>
          {t('br.globalGraph')}
        </button>
        <div>
          <b>{t('br.suggest')}</b>
          {N.suggestions.map((s) => (
            <div className="ap-sugg" key={s.text}>
              {s.text}
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="primary">
                  {t('br.link')}
                </Button>
                <Button size="sm" variant="ghost">
                  {t('br.skip')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
