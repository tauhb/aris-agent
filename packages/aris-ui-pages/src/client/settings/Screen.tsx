/** 6.6 · Màn hình của bot: desktop ảo của từng bot, cầm lái khi bot bị chặn, tài nguyên, việc bot vừa làm. */
import { Button, Card, PageShell, Segmented } from '@aris/ui-kit/react'
import { COMMANDER, DEMO_TEAM } from '@aris/ui-kit'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Box, Col } from '../ui.js'
import { DEMO_SCREEN as S } from './demo.js'

const NAMES = Object.fromEntries(
  [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)].map((m) => [m.id, m.name]),
)

export function Screen({ t }: PageProps) {
  const [bot, setBot] = useState<string>(S.current)
  const name = NAMES[bot] ?? bot
  return (
    <PageShell
      title={t('sec.screen')}
      subtitle={t('scr.subtitle')}
      actions={
        <Segmented
          label={t('scr.pick')}
          value={bot}
          onChange={setBot}
          options={S.bots.map((id) => ({ value: id, label: NAMES[id] }))}
        />
      }
    >
      <div className="ap-cols">
        <Col grow={1.6} basis={520}>
          <div className="ap-warnbox">
            <span style={{ flex: 1, minWidth: 240 }}>
              <b>{t('scr.stopped', { name })}</b> {S.blocked}
            </span>
            <Button variant="primary">{t('scr.takeOver')}</Button>
          </div>
          <div className="ap-desk" role="img" aria-label={t('scr.alt', { name })}>
            <div className="bar">
              <span style={{ background: '#F97066' }} />
              <span style={{ background: '#F5A35C' }} />
              <span style={{ background: '#4ADE9B' }} />
              <span className="url">{S.url}</span>
            </div>
            <div className="view">
              <div className="dlg">
                <b>{t('scr.twoStep')}</b>
                <span className="hint">{t('scr.codeHint')}</span>
                <div className="code">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span key={i} />
                  ))}
                </div>
                <span className="go" />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button>{t('scr.handBack', { name })}</Button>
            <Button>{t('scr.capture')}</Button>
            <Button>{t('scr.off')}</Button>
            <span className="a-muted" style={{ fontSize: 13 }}>
              {t('scr.driver')} <b style={{ color: 'var(--a-ink)' }}>{name}</b>
            </span>
          </div>
        </Col>
        <Col basis={280}>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <b>{t('scr.resources')}</b>
            {S.resources.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="a-muted">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </Box>
          <Card title={t('scr.justDid', { name })}>
            <div style={{ padding: '0 14px 8px' }}>
              {S.events.map(([at, what]) => (
                <div className="ap-ev" key={at + what}>
                  <span className="a-mono a-muted">{at}</span>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          </Card>
          <p className="a-muted" style={{ fontSize: 12.5, margin: 0 }}>
            {t('scr.note')}
          </p>
        </Col>
      </div>
    </PageShell>
  )
}
