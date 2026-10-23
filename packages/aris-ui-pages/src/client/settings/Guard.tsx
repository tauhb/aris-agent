/** 6.4 · Ngân sách, duyệt, mạng: trần chi phí, tự học cần duyệt, chế độ duyệt, mạng ra ngoài, kho bí mật. */
import { Button, Card, CardRow, PageShell, Segmented, Tag } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Col, Num } from '../ui.js'
import { DEMO_GUARD as G } from './demo.js'

export function Guard({ t }: PageProps) {
  const [mode, setMode] = useState<'ask' | 'auto'>('ask')
  return (
    <PageShell title={t('sec.guard')} subtitle={t('guard.subtitle')}>
      <div className="ap-cols">
        <Col basis={400}>
          <Card title={t('guard.budget')}>
            <CardRow label={t('guard.dailyCap')}>
              <Num value={G.dailyCap} label={t('guard.dailyCap')} />
              <span className="a-muted">USD</span>
            </CardRow>
            <CardRow label={t('guard.alertAt')}>
              <Num value={G.alertAt} label={t('guard.alertAt')} />
              <span className="a-muted">%</span>
            </CardRow>
            <CardRow label={t('guard.learningCap')}>
              <Num value={G.learningCap} label={t('guard.learningCap')} />
              <span className="a-muted">USD</span>
            </CardRow>
            <CardRow label={t('guard.whenOut')}>
              <span className="a-muted">{t('guard.whenOutValue')}</span>
            </CardRow>
          </Card>
          <Card title={t('guard.learning')}>
            {(
              [
                ['guard.memoryApproval', false, false],
                ['guard.skillApproval', true, false],
                ['guard.webNever', true, true],
              ] as const
            ).map(([key, checked, locked]) => (
              <label className="a-row" key={key}>
                <span className="grow">{t(key)}</span>
                <input
                  type="checkbox"
                  defaultChecked={checked}
                  disabled={locked}
                  style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
                />
              </label>
            ))}
          </Card>
        </Col>
        <Col grow={1.2} basis={440}>
          <Card
            title={t('guard.approvals')}
            actions={
              <Segmented
                label={t('guard.mode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'ask', label: t('guard.ask') },
                  { value: 'auto', label: t('guard.autoLow') },
                ]}
              />
            }
          >
            <div className="a-row" style={{ alignItems: 'flex-start' }}>
              <span className="a-muted" style={{ width: 150, flex: 'none' }}>
                {t('guard.denied')}
              </span>
              <span className="ap-tags grow">
                {G.denied.map((d) => (
                  <span key={d} className="a-tag" style={{ color: 'var(--a-ink)', fontSize: 12 }}>
                    {d}
                  </span>
                ))}
              </span>
            </div>
            <div className="a-row" style={{ alignItems: 'flex-start' }}>
              <span className="a-muted" style={{ width: 150, flex: 'none' }}>
                {t('guard.allowed')}
              </span>
              <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {G.allowed.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </span>
              <Button size="sm">{t('guard.edit')}</Button>
            </div>
            <CardRow label={t('guard.timeout')}>
              <Num value={G.approvalTimeout} label={t('guard.timeout')} />
              <span className="a-muted">{t('guard.timeoutUnit')}</span>
            </CardRow>
          </Card>
          <Card
            title={
              <>
                {t('guard.network')}{' '}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--a-ok)' }}>
                  {t('guard.allowList')}
                </span>
              </>
            }
          >
            <div className="a-row" style={{ alignItems: 'flex-start' }}>
              <span className="a-muted" style={{ width: 150, flex: 'none' }}>
                {t('guard.allowedHosts')}
              </span>
              <span className="ap-tags grow">
                {G.hosts.map((h) => (
                  <Tag key={h} mono>
                    {h}
                  </Tag>
                ))}
                <Tag>+ {G.moreHosts}</Tag>
              </span>
              <Button size="sm">{t('guard.add')}</Button>
            </div>
            <CardRow>
              <span className="a-muted grow">
                {t('guard.blocked', { n: G.blocked.count, host: G.blocked.host, bot: G.blocked.bot })}
              </span>
              <Button size="sm">{t('guard.view')}</Button>
            </CardRow>
          </Card>
          <Card>
            <CardRow>
              <b className="grow">{t('guard.vault')}</b>
              <span className="a-muted">{G.vault}</span>
              <Button size="sm">{t('guard.change')}</Button>
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
