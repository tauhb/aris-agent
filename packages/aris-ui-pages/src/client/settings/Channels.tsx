/** 6.3 · Kênh và ghép đôi: tài khoản bot trên Telegram/Lark/Zalo, mã ghép đôi, cách xử lý khi nhắn thêm. */
import { Button, Card, CardRow, PageShell, Pill, Segmented } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col } from '../ui.js'
import { DEMO_CHANNELS as C } from './demo.js'

export function Channels({ t }: PageProps) {
  const [busy, setBusy] = useState<'steer' | 'queue' | 'restart'>('steer')
  return (
    <PageShell title={t('sec.channels')} subtitle={t('ch.subtitle')}>
      <div className="ap-cols">
        <Col grow={1.2} basis={440}>
          <Card
            title={
              <>
                Telegram <Pill tone="ok">{t('ch.connected')}</Pill>
              </>
            }
            actions={<Button size="sm">{t('ch.addTelegram')}</Button>}
          >
            {C.telegram.map((b) => (
              <CardRow key={b.handle}>
                <Bot id={b.bot} />
                <span className="grow">
                  {b.name} · <span className="a-mono">{b.handle}</span>
                </span>
                <span className="a-muted">{b.note}</span>
              </CardRow>
            ))}
          </Card>
          <Card
            title={
              <>
                Lark <Pill tone="ok">{t('ch.connected')}</Pill>
              </>
            }
          >
            {C.lark.map((b) => (
              <CardRow key={b.text}>
                <Bot id={b.bot} />
                <span className="grow">{b.text}</span>
                <span className="a-muted">{b.note}</span>
              </CardRow>
            ))}
          </Card>
          <Card
            title={
              <>
                Zalo OA{' '}
                <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {t('ch.notConnected')}
                </span>
              </>
            }
            actions={
              <Button variant="primary" size="sm">
                {t('ch.connectZalo')}
              </Button>
            }
          >
            <CardRow>
              <span className="a-muted">{t('ch.needs', { what: C.zaloNeeds })}</span>
            </CardRow>
          </Card>
        </Col>
        <Col basis={340}>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b>{t('ch.pairTitle')}</b>
            <div className="a-muted" style={{ fontSize: 13 }}>
              {t('ch.pairHint')}
            </div>
            <div
              className="a-mono"
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '.08em',
                textAlign: 'center',
                padding: '10px 0',
                background: 'var(--a-panel2)',
                borderRadius: 10,
              }}
            >
              {C.pairCode}
            </div>
            <div className="a-muted" style={{ fontSize: 12, textAlign: 'center' }}>
              {t('ch.pairExpires', { t: C.pairExpires })}
            </div>
          </Box>
          <Card title={t('ch.paired')}>
            {C.paired.map((p) => (
              <CardRow key={p} label={p}>
                <span className="a-muted">{t('ch.fullAccess')}</span>
              </CardRow>
            ))}
            <CardRow>
              <span className="a-muted">{t('ch.strangers')}</span>
            </CardRow>
          </Card>
          <Card title={t('ch.busyTitle')}>
            <CardRow>
              <Segmented
                label={t('ch.busy')}
                value={busy}
                onChange={setBusy}
                options={[
                  { value: 'steer', label: t('ch.steer') },
                  { value: 'queue', label: t('ch.queue') },
                  { value: 'restart', label: t('ch.restart') },
                ]}
              />
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
