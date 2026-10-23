/** 6.2 · Provider và model: danh sách provider bên trái, cấu hình provider đang chọn, model theo việc, thứ tự dự phòng. */
import { Button, Card, NavItem, PageShell, Pill, SearchIcon, Tag, TextInput } from '@aris/ui-kit/react'
import { Fragment } from 'react'
import type { PageProps } from '../page.js'
import { Box, Col, Dot } from '../ui.js'
import { DEMO_PROVIDERS as P } from './demo.js'

export function Provider({ t, nav }: PageProps) {
  const c = P.current
  return (
    <div className="ap-split">
      <nav className="ap-side" aria-label={t('sec.provider')}>
        <a
          className="ap-link a-muted"
          style={{ padding: '7px 10px', fontSize: 12.5 }}
          onClick={() => nav.go('settings', {})}
        >
          {t('set.back')}
        </a>
        <div style={{ fontWeight: 600, padding: '6px 10px 8px' }}>{t('sec.provider')}</div>
        <label className="ap-search">
          <SearchIcon size={14} />
          <input type="search" aria-label={t('prov.search')} placeholder={t('prov.search')} />
        </label>
        <div className="ap-h">{t('prov.connected')}</div>
        {P.connected.map((p, i) => (
          <NavItem
            key={p.id}
            label={p.name}
            variant="plain"
            active={i === 0}
            icon={<Dot color={p.color} />}
            meta={
              p.custom ? (
                <Tag>{t('prov.custom')}</Tag>
              ) : p.ok ? (
                <span style={{ color: 'var(--a-ok)' }}>●</span>
              ) : undefined
            }
          />
        ))}
        <div className="ap-h">{t('prov.available')}</div>
        {P.available.map((name) => (
          <NavItem key={name} label={name} className="a-muted" />
        ))}
        <NavItem label={t('prov.all')} style={{ color: 'var(--a-accent)' }} />
        <Button style={{ margin: 'auto 4px 0' }}>{t('prov.add')}</Button>
      </nav>
      <PageShell
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span className="ap-logo" style={{ background: c.color }} />
            {c.name}
          </span>
        }
        subtitle={c.sdk}
        actions={<Pill tone="ok">{t('prov.ok', { ms: c.latency })}</Pill>}
      >
        <div className="ap-cols">
          <Col grow={1.2} basis={440}>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="a-field">
                <span className="l">{t('prov.key')}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <TextInput mono defaultValue={c.key} aria-label={t('prov.key')} />
                  <Button>{t('prov.addKey')}</Button>
                </span>
                <span className="h">{t('prov.keys', { n: c.keys })}</span>
              </label>
              <label className="a-field">
                <span className="l">{t('prov.baseUrl')}</span>
                <TextInput mono defaultValue={c.baseUrl} aria-label={t('prov.baseUrl')} />
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('prov.probeWith')}
                </span>
                <Tag mono>{c.probe}</Tag>
                <Button style={{ marginLeft: 'auto' }}>{t('prov.probe')}</Button>
              </div>
            </Box>
            <Card
              title={t('prov.models', { n: c.models.length })}
              actions={<Button size="sm">{t('prov.refresh')}</Button>}
            >
              <div className="ap-mrow a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
                <span />
                <span>{t('prov.model')}</span>
                <span>{t('prov.caps')}</span>
                <span>{t('prov.price')}</span>
              </div>
              {c.models.map((m) => (
                <label className="ap-mrow" key={m.id}>
                  <input
                    type="checkbox"
                    defaultChecked={m.on}
                    aria-label={m.id}
                    style={{ width: 17, height: 17, accentColor: 'var(--a-accent)' }}
                  />
                  <span className="a-mono">{m.id}</span>
                  <span className="ap-tags">
                    {m.caps.map((cap) => (
                      <Tag key={cap}>{cap}</Tag>
                    ))}
                  </span>
                  <span className="a-muted" style={{ fontSize: 12 }}>
                    {t('prov.autoPrice')}
                  </span>
                </label>
              ))}
            </Card>
          </Col>
          <Col basis={360}>
            <Card title={t('prov.byTask')} subtitle={t('prov.byTaskHint')}>
              {P.byTask.map((r) => (
                <div className="ap-grid2" key={r.task}>
                  <span>{r.task}</span>
                  <span className="ap-sel">
                    {r.color && <Dot color={r.color} />}
                    {r.model ?? t('prov.botDefault')} ▾
                  </span>
                </div>
              ))}
            </Card>
            <Box>
              <b>{t('prov.fallback')}</b>
              <div className="ap-chain">
                {P.fallback.map((name, i) => (
                  <Fragment key={name}>
                    {i > 0 && '→'}
                    <Tag>{`${i + 1} · ${name}`}</Tag>
                  </Fragment>
                ))}
              </div>
              <div className="a-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {t('prov.fallbackHint')}
              </div>
            </Box>
          </Col>
        </div>
      </PageShell>
    </div>
  )
}
