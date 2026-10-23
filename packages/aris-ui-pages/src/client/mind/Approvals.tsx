/** 3.4 · Hộp duyệt: danh sách việc chờ duyệt bên trái (lọc theo loại, gợi ý luật), chi tiết việc đang chọn bên phải. */
import { Button, Mascot } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { DEMO_APPROVALS as A, type ApprovalKind } from './demo.js'
import { botName } from './names.js'

export function Approvals({ t, nav }: PageProps) {
  const [filter, setFilter] = useState<'all' | ApprovalKind>('all')
  const [selected, setSelected] = useState(A.items[0]!.id)
  const count = (k: ApprovalKind) => A.items.filter((i) => i.kind === k).length
  const items = A.items.filter((i) => filter === 'all' || i.kind === filter)
  const it = A.items.find((i) => i.id === selected) ?? A.items[0]!
  const chips: ['all' | ApprovalKind, string][] = [
    ['all', t('ap.all')],
    ['action', t('ap.action', { n: count('action') })],
    ['memory', t('ap.memory', { n: count('memory') })],
    ['skill', t('ap.skill', { n: count('skill') })],
  ]
  return (
    <div className="ap-split">
      <section className="ap-inbox" aria-label={t('ap.list')}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 className="a-page-title">{t('ap.title')}</h1>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('ap.needYou', { n: A.items.length })}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}>
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
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            className="ap-li"
            aria-current={i.id === it.id || undefined}
            onClick={() => setSelected(i.id)}
          >
            <Mascot id={i.bot} size={28} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b>{i.title}</b>
                {i.due && (
                  <span
                    style={{ fontSize: 12, color: 'var(--a-warn)', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {i.due}
                  </span>
                )}
              </span>
              <span className="a-muted" style={{ display: 'block', fontSize: 12.5 }}>
                {i.sub}
              </span>
            </span>
          </button>
        ))}
        <div className="a-muted" style={{ padding: 14, fontSize: 12, borderTop: '1px solid var(--a-line)' }}>
          {t('ap.doneToday', { n: A.doneToday })}
        </div>
        <div
          className="a-card"
          style={{ margin: 'auto 14px 14px', padding: 12, borderColor: 'var(--a-accent)' }}
        >
          <div style={{ fontSize: 13 }}>
            <b>{t('ap.ruleTitle')}</b> — {t('ap.rule', { what: A.rule })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Button size="sm">{t('ap.always')}</Button>
            <Button size="sm">{t('ap.ignore')}</Button>
          </div>
        </div>
      </section>
      <main className="ap-detail">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mascot id={it.bot} size={40} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{it.heading}</span>
            <span className="a-muted" style={{ fontSize: 13 }}>
              {it.context}
            </span>
          </div>
        </div>
        <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
          {it.fields.map(([k, v]) => (
            <div className="ap-kv" key={k}>
              <span className="a-muted">{k}</span>
              <span style={{ whiteSpace: 'pre-line' }}>{v}</span>
            </div>
          ))}
          {it.risk && (
            <div className="ap-kv">
              <span className="a-muted">{t('ap.risk')}</span>
              <span style={{ color: 'var(--a-warn)', fontWeight: 600 }}>{it.risk}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {it.kind === 'action' && (
            <>
              <Button variant="primary" size="lg">
                {t('ap.allowOnce')}
              </Button>
              <Button size="lg">{t('ap.editContent')}</Button>
              <Button size="lg">{t('ap.alwaysFor', { name: botName(it.bot) })}</Button>
            </>
          )}
          {it.kind === 'skill' && (
            <>
              <Button variant="primary" size="lg">
                {t('skd.approve', { v: 'v3' })}
              </Button>
              <Button size="lg" onClick={() => nav.go('skill', { id: 'bao-cao-doanh-thu-tuan' })}>
                {t('ap.openSkill')}
              </Button>
            </>
          )}
          {it.kind === 'memory' && (
            <Button variant="primary" size="lg">
              {t('ap.save')}
            </Button>
          )}
          <Button size="lg" style={{ color: 'var(--a-danger)' }}>
            {t('ap.reject')}
          </Button>
        </div>
        {it.timeout && (
          <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
            {t('ap.timeout', { t: it.timeout })}
          </p>
        )}
      </main>
    </div>
  )
}
