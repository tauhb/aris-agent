/**
 * 6.7 · Plugin: plugin đã cài (bắt buộc hoặc bật/tắt), thêm plugin, cập nhật. Danh sách
 * là mẫu; quản lý thật (chợ, bật/tắt, plugin thử nghiệm) mở trang Plugins của dsh.
 */
import { Button, Card, CardRow, PageShell, Pill } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Col, Dot } from '../ui.js'
import { DEMO_PLUGINS } from './demo.js'

export function Plugin({ t, nav }: PageProps) {
  const [on, setOn] = useState(DEMO_PLUGINS.map((p) => p.on))
  return (
    <PageShell title={t('sec.plugin')} subtitle={t('pl.subtitle')}>
      <div className="ap-cols">
        <Col grow={1.3} basis={460}>
          <Card
            title={
              <>
                {t('pl.installed')}{' '}
                <span className="a-muted" style={{ fontWeight: 400 }}>
                  {t('pl.count', { n: DEMO_PLUGINS.length })}
                </span>
              </>
            }
          >
            {DEMO_PLUGINS.map((p, i) => (
              <CardRow key={p.name}>
                <Dot color={on[i] ? 'var(--a-ok)' : 'var(--a-muted)'} size={8} />
                <span className="grow">
                  <b>{p.name}</b> <span className="a-muted">· {p.source}</span>
                  <div className="a-muted" style={{ fontSize: 12.5 }}>
                    {p.about}
                  </div>
                </span>
                {p.required ? (
                  <span className="a-muted">{t('pl.required')}</span>
                ) : (
                  <Button size="sm" onClick={() => setOn(on.map((x, j) => (j === i ? !x : x)))}>
                    {on[i] ? t('pl.off') : t('pl.on')}
                  </Button>
                )}
              </CardRow>
            ))}
          </Card>
        </Col>
        <Col basis={340}>
          <Card title={t('pl.add')}>
            <CardRow>
              <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="a-inp"
                    placeholder={t('pl.placeholder')}
                    aria-label={t('pl.package')}
                    style={{ flex: 1, height: 32 }}
                  />
                  <Button size="sm">{t('pl.install')}</Button>
                </span>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('pl.warn')}
                </span>
              </span>
            </CardRow>
            <CardRow label={<span className="a-muted">{t('pl.market')}</span>}>
              <Button size="sm" onClick={() => nav.openPanel('plugins')}>
                {t('pl.openMarket')}
              </Button>
            </CardRow>
          </Card>
          <Card>
            <CardRow label={<b>{t('pl.updates')}</b>}>
              <Pill tone="warn">{t('pl.newVersion', { n: 1 })}</Pill>
              <Button size="sm" onClick={() => nav.openPanel('plugins')}>
                {t('pl.view')}
              </Button>
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
