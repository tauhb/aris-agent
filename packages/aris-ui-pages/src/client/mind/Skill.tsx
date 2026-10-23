/** 3.3 · Chi tiết skill: thay đổi giữa hai bản, chỉ số so sánh, ca thử chạy lại phiên cũ, lịch sử bản. */
import { Button, Card, IconButton, PageShell } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Box, Col } from '../ui.js'
import { DEMO_SKILL as S } from './demo.js'

export function Skill({ t, nav }: PageProps) {
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconButton label={t('skd.back')} onClick={() => nav.go('skills')}>
            ‹
          </IconButton>
          <span className="a-mono">{S.id}</span>
        </span>
      }
      subtitle={S.subtitle}
      actions={
        <>
          <Button>{t('skd.reject')}</Button>
          <Button>{t('skd.editEnable')}</Button>
          <Button variant="primary">{t('skd.approve', { v: 'v3' })}</Button>
        </>
      }
    >
      <div className="ap-cols">
        <Col grow={1.3} basis={480}>
          <section className="a-card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--a-line)',
              }}
            >
              <b>{t('skd.changes')}</b>
              <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                {S.diffStat}
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {S.diff.map((d, i) => (
                <div key={i} className="ap-dl" data-kind={d.kind === ' ' ? undefined : d.kind}>
                  {d.kind === ' ' ? d.text : `${d.kind === '+' ? '+' : '−'} ${d.text}`}
                </div>
              ))}
            </div>
            <div
              className="a-muted"
              style={{ padding: '10px 14px', borderTop: '1px solid var(--a-line)', fontSize: 13 }}
            >
              {t('skd.reason', { why: S.reason })}
              <a className="ap-link" onClick={() => nav.openPanel(null)}>
                {t('mem.openChat')}
              </a>
              ).
            </div>
          </section>
        </Col>
        <Col basis={380}>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              textAlign: 'center',
            }}
          >
            {S.metrics.map((m) => (
              <div key={m.label}>
                <div className="ap-k">{t(`skd.metric.${m.label}`)}</div>
                <div className="ap-v" style={m.good ? { color: 'var(--a-ok)' } : undefined}>
                  {m.value}
                </div>
                <div className="ap-k">{m.note}</div>
              </div>
            ))}
          </Box>
          <Card
            title={t('skd.cases')}
            actions={
              <span className="a-muted" style={{ fontSize: 12 }}>
                {t('skd.sandbox')}
              </span>
            }
          >
            <div className="ap-er a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
              <span>{t('skd.case')}</span>
              <span>v2</span>
              <span>v3</span>
              <span>{t('skd.metric.steps')}</span>
            </div>
            {S.cases.map((c) => (
              <div className="ap-er" key={c.name}>
                <span>{c.name}</span>
                <span style={{ color: c.v2[1] ? 'var(--a-ok)' : 'var(--a-danger)' }}>{c.v2[0]}</span>
                <span style={{ color: c.v3[1] ? 'var(--a-ok)' : 'var(--a-danger)' }}>{c.v3[0]}</span>
                <span>{c.steps}</span>
              </div>
            ))}
          </Card>
          <Box style={{ padding: '10px 14px', fontSize: 13 }}>
            <b>{t('skd.history')}</b>
            <div
              className="a-muted"
              style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {S.history.map((h) => (
                <span key={h.text}>
                  {h.text}
                  {h.restore && (
                    <>
                      {' · '}
                      <a className="ap-link">{t('skd.restore')}</a>
                    </>
                  )}
                </span>
              ))}
            </div>
          </Box>
        </Col>
      </div>
    </PageShell>
  )
}
