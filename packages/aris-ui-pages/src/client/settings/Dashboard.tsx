/** 6.1 · Bảng điều khiển: số liệu vận hành, chi phí theo bot, kênh, việc sắp chạy, cảnh báo. */
import { Button, PageShell, branchColor } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col, Dot, Track } from '../ui.js'
import { DEMO_DASHBOARD as D } from './demo.js'

export function Dashboard({ t, nav }: PageProps) {
  const s = D.stats
  return (
    <PageShell
      title={t('sec.dashboard')}
      subtitle={D.uptime}
      actions={
        <Button variant="danger" size="lg">
          {t('dash.stop')}
        </Button>
      }
    >
      <div className="ap-stats">
        <div className="ap-stat ap-click" role="link" tabIndex={0} onClick={() => nav.go('runs')}>
          <div className="ap-k">{t('dash.bots')}</div>
          <div className="ap-v">
            {s.bots} <small>{t('dash.working', { n: s.working })}</small>
          </div>
        </div>
        <div className="ap-stat">
          <div className="ap-k">{t('dash.cost')}</div>
          <div className="ap-v">
            {s.cost} <small>/ {s.budget} USD</small>
          </div>
        </div>
        <div className="ap-stat">
          <div className="ap-k">{t('dash.cache')}</div>
          <div className="ap-v">{s.cache}</div>
        </div>
        <div className="ap-stat">
          <div className="ap-k">{t('dash.memory')}</div>
          <div className="ap-v">{s.memory}</div>
        </div>
        <div className="ap-stat ap-click" role="link" tabIndex={0} onClick={() => nav.go('approvals')}>
          <div className="ap-k">{t('dash.waiting')}</div>
          <div className="ap-v" style={{ color: 'var(--a-warn)' }}>
            {s.waiting}
          </div>
        </div>
      </div>
      <div className="ap-cols">
        <Col basis={360}>
          <Box>
            <b>{t('dash.costByBot')}</b>
            <div style={{ marginTop: 10 }}>
              {D.costByBot.map((b) => (
                <div className="ap-bar" key={b.id}>
                  <Bot id={b.id} />
                  <span>{b.name}</span>
                  <Track pct={b.pct} color={branchColor(b.id)} />
                  <span className="a-mono" style={{ textAlign: 'right' }}>
                    {b.usd}
                  </span>
                </div>
              ))}
              <div className="ap-bar">
                <span className="ap-av">↺</span>
                <span>{t('dash.learning')}</span>
                <Track pct={D.learningCost.pct} color="var(--a-muted)" />
                <span className="a-mono" style={{ textAlign: 'right' }}>
                  {D.learningCost.usd}
                </span>
              </div>
            </div>
          </Box>
        </Col>
        <Col basis={300}>
          <Box>
            <b>{t('dash.channels')}</b>
            {D.channels.map((c) => (
              <div className="ap-ln" key={c.name}>
                <Dot color={c.ok ? 'var(--a-ok)' : 'var(--a-line)'} size={8} />
                <span style={{ flex: 1 }} className={c.ok ? undefined : 'a-muted'}>
                  {c.name}
                </span>
                {c.ok ? (
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('dash.stable')}
                  </span>
                ) : (
                  <a className="ap-link" onClick={() => nav.go('settings', { section: 'channels' })}>
                    {t('dash.connect')}
                  </a>
                )}
              </div>
            ))}
          </Box>
        </Col>
        <Col basis={300}>
          <Box>
            <b>{t('dash.upcoming')}</b>
            {D.upcoming.map((u) => (
              <div className="ap-ln" key={u.name}>
                <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                  {u.at}
                </span>
                <Bot id={u.bot} size={18} />
                <span>{u.name}</span>
              </div>
            ))}
          </Box>
        </Col>
      </div>
      <div className="ap-warnbox">
        <span style={{ flex: 1, minWidth: 260 }}>
          <b>{t('dash.warning')}</b> {D.warning}
        </span>
        <a className="ap-link" onClick={() => nav.go('routine')}>
          {t('dash.seeRoutine')}
        </a>
        <a className="ap-link" onClick={() => nav.go('memory')}>
          {t('dash.seeMemory')}
        </a>
      </div>
    </PageShell>
  )
}
