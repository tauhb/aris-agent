/** 2.5 · Commander: bot được giao việc, giới hạn điều phối, quyết định định tuyến gần đây, điều Commander đã học. */
import { Button, Card, Mascot, PageShell, Pill } from '@aris/ui-kit/react'
import { COMMANDER } from '@aris/ui-kit'
import type { PageProps } from '../page.js'
import { Bot, Col, Num } from '../ui.js'
import { DEMO_COMMANDER as C } from './demo.js'

const KIND_TONE = { delegate: 'accent', self: 'muted', handoff: 'ok', helpers: 'muted' } as const

export function Commander({ t, nav }: PageProps) {
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mascot id={COMMANDER.id} size={30} />
          {t('cmd.title', { name: COMMANDER.name })}
        </span>
      }
      subtitle={t('cmd.subtitle')}
      actions={
        <>
          <Pill tone="ok">{t('cmd.on')}</Pill>
          <Button size="sm">{t('cmd.transfer')}</Button>
        </>
      }
    >
      <div className="ap-cols">
        <Col basis={380}>
          <Card title={t('cmd.delegates')} subtitle={t('cmd.delegatesHint')}>
            {C.delegates.map((d) => (
              <label className="a-row" key={d.bot}>
                <Bot id={d.bot} size={24} />
                <span className="grow">
                  {d.text} {d.approve && <span className="a-muted">{t('cmd.approveEach')}</span>}
                </span>
                <input
                  type="checkbox"
                  defaultChecked={d.on}
                  aria-label={d.text}
                  style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
                />
              </label>
            ))}
            <label className="a-row">
              <span className="ap-av" style={{ width: 24, height: 24 }}>
                ?
              </span>
              <span className="grow">{t('cmd.helpers')}</span>
              <input
                type="checkbox"
                defaultChecked
                aria-label={t('cmd.helpers')}
                style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
              />
            </label>
          </Card>
          <Card title={t('cmd.limits')}>
            <div className="a-row">
              <span className="grow">{t('cmd.parallel')}</span>
              <Num value={C.limits.parallel} label={t('cmd.parallel')} />
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.nested')}</span>
              <Num value={C.limits.nested} label={t('cmd.nested')} />
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.talkBack')}</span>
              <span className="a-muted">{t('cmd.talkBackValue')}</span>
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.budget')}</span>
              <Num value={C.limits.budget} label={t('cmd.budget')} />
              <span className="a-muted">USD</span>
            </div>
            <label className="a-row">
              <span className="grow">{t('cmd.driver')}</span>
              <input
                type="checkbox"
                aria-label={t('cmd.driver')}
                style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
              />
            </label>
          </Card>
        </Col>
        <Col grow={1.4} basis={500}>
          <Card
            title={t('cmd.routing')}
            actions={
              <a className="ap-link" onClick={() => nav.go('settings', { section: 'stats' })}>
                {t('cmd.seeAll')}
              </a>
            }
          >
            <div className="ap-dr a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
              <span>{t('stats.time')}</span>
              <span>{t('cmd.request')}</span>
              <span>{t('cmd.decision')}</span>
              <span>{t('cmd.reason')}</span>
              <span>{t('cmd.result')}</span>
            </div>
            {C.routing.map((r) => (
              <div className="ap-dr" key={r.at + r.req}>
                <span className="a-mono a-muted">{r.at}</span>
                <span>{r.req}</span>
                <span>
                  <Pill tone={KIND_TONE[r.kind]}>{t(`cmd.kind.${r.kind}`, { n: r.bot })}</Pill>{' '}
                  {r.kind !== 'helpers' && r.bot}
                </span>
                <span className="a-muted">{r.why}</span>
                <span>{r.result}</span>
              </div>
            ))}
          </Card>
          <Card title={t('cmd.learned')}>
            <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {C.learned.map((l) => (
                <div key={l.text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                  <Bot id={l.bot} />
                  <span style={{ flex: 1 }}>{l.text}</span>
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {l.note}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
