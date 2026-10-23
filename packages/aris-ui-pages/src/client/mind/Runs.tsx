/** 3.5 · Việc đang chạy: mục tiêu và giám khảo, việc được giao (cả trợ lý ẩn), vòng lặp và nhịp tim, điểm khôi phục. */
import { Button, Card, PageShell, branchColor } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col } from '../ui.js'
import { DEMO_RUNS as R } from './demo.js'

export function Runs({ t, nav }: PageProps) {
  const g = R.goal
  return (
    <PageShell
      title={t('run.title')}
      subtitle={t('run.subtitle')}
      actions={
        <Button
          size="sm"
          style={{ border: '1px solid var(--a-danger)', color: 'var(--a-danger)', fontWeight: 600 }}
        >
          {t('run.stopAll')}
        </Button>
      }
    >
      <div className="ap-cols">
        <Col grow={1.2} basis={460}>
          <div className="ap-cap">{t('run.goal')}</div>
          <Box>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bot id={g.bot} size={24} />
              <b style={{ flex: 1 }}>{g.title}</b>
              <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                {g.turn}
              </span>
            </div>
            <div className="ap-meter" style={{ margin: '10px 0' }}>
              <span style={{ width: `${g.pct}%`, background: 'var(--a-accent)' }} />
            </div>
            <div style={{ fontSize: 13 }}>
              <span className="a-muted">{t('run.judge', { at: g.judgeAt })}</span> <b>{g.verdict}</b> —{' '}
              {g.judge}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Button size="sm">{t('run.pause')}</Button>
              <Button size="sm">{t('run.editGoal')}</Button>
              <Button size="sm">{t('run.cancel')}</Button>
            </div>
          </Box>
          <div className="ap-cap">{t('run.delegated')}</div>
          <Card>
            {R.delegated.map((d) => (
              <div key={d.title} style={{ display: 'contents' }}>
                <div className="ap-tr">
                  <Bot id={d.from} size={24} />
                  <span>→</span>
                  <Bot id={d.to} size={24} />
                  <span style={{ flex: 1 }}>{d.title}</span>
                  {d.waiting ? (
                    <a
                      className="ap-link"
                      style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--a-warn)' }}
                      onClick={() => nav.go('approvals')}
                    >
                      {t('run.waiting')}
                    </a>
                  ) : (
                    <>
                      <span className="ap-track" style={{ width: 80, height: 5 }}>
                        <span style={{ width: `${d.pct}%`, background: branchColor(d.to) }} />
                      </span>
                      <span className="a-muted" style={{ fontSize: 12, width: 48 }}>
                        {d.time}
                      </span>
                    </>
                  )}
                </div>
                {d.helpers.map((h) => (
                  <div className="ap-tr" style={{ paddingLeft: 52 }} key={h.text}>
                    <span className="ap-av" style={{ width: 24, height: 24 }}>
                      ?
                    </span>
                    <span className="a-muted" style={{ flex: 1 }}>
                      {h.text}
                    </span>
                    {h.done ? (
                      <span style={{ fontSize: 12, color: 'var(--a-ok)' }}>{t('run.done')}</span>
                    ) : (
                      <span className="ap-pulse" style={{ fontSize: 12, color: 'var(--a-accent)' }}>
                        {t('run.running')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </Col>
        <Col basis={380}>
          <div className="ap-cap">{t('run.loops')}</div>
          <Card>
            {R.loops.map((l) => (
              <div className="ap-tr" key={l.title}>
                <Bot id={l.bot} size={24} />
                <span style={{ flex: 1 }}>
                  {l.title}
                  <div className="a-muted" style={{ fontSize: 12 }}>
                    {l.note}
                    {l.next && (
                      <>
                        {' · '}
                        {t('run.next')} <span className="a-mono">{l.next}</span>
                      </>
                    )}
                  </div>
                </span>
                <Button size="sm">{l.action === 'stop' ? t('run.stop') : t('run.pause')}</Button>
              </div>
            ))}
          </Card>
          <div className="ap-cap">{t('run.checkpoints')}</div>
          <Card>
            {R.checkpoints.map((c) => (
              <div className="ap-tr" key={c.at}>
                <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                  {c.at}
                </span>
                <span style={{ flex: 1 }}>
                  {c.text}
                  {c.path && (
                    <>
                      {' '}
                      <span className="a-mono" style={{ fontSize: 12 }}>
                        {c.path}
                      </span>
                    </>
                  )}
                </span>
                {c.diff && <Button size="sm">{t('run.diff')}</Button>}
                <Button size="sm">{t('run.restore')}</Button>
              </div>
            ))}
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
