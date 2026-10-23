/** 6.5 · Thống kê và nhật ký: chi phí theo loại việc 7 ngày, chỉ số tự chủ, nhật ký phiên phát lại được. */
import { Button, Card, PageShell, Segmented } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col } from '../ui.js'
import { DEMO_STATS as S } from './demo.js'

/** Màu bốn loại việc trong biểu đồ (theo canvas). */
const SERIES = ['var(--ap-c1)', 'var(--ap-c2)', 'var(--ap-c3)', 'var(--ap-c4)'] as const

export function Stats({ t }: PageProps) {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d')
  const legend = [t('stats.chat'), t('stats.delegated'), t('stats.routine'), t('stats.learning')]
  return (
    <PageShell
      title={t('sec.stats')}
      actions={
        <Segmented
          label={t('stats.range')}
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: t('stats.today') },
            { value: '7d', label: t('stats.7d') },
            { value: '30d', label: t('stats.30d') },
          ]}
        />
      }
    >
      <div className="ap-cols">
        <Col grow={1.4} basis={480}>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b>{t('stats.costByTask')}</b>
              <span className="a-muted" style={{ fontSize: 12.5 }}>
                {t('stats.total', { total: S.total })}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {legend.map((l, i) => (
                <span className="ap-lg" key={l}>
                  <span className="ap-sw" style={{ background: SERIES[i] }} />
                  {l}
                </span>
              ))}
            </div>
            <div className="ap-chart" role="img" aria-label={t('stats.chartLabel')}>
              {S.bars.map((parts, d) => (
                <div className="col" key={S.days[d]}>
                  <div className="stk" style={{ height: S.heights[d] }}>
                    {parts.map((p, i) => (
                      <span key={i} style={{ height: `${p}%`, background: SERIES[i] }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="ap-days a-muted">
              {S.days.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </Box>
        </Col>
        <Col basis={260}>
          {(
            [
              ['stats.cache', S.cache],
              ['stats.autonomous', S.autonomous],
              ['stats.skills', S.skills],
            ] as const
          ).map(([key, v]) => (
            <Box key={key}>
              <div className="ap-k">{t(key)}</div>
              <div className="ap-v">{v.value}</div>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {v.note}
              </div>
            </Box>
          ))}
        </Col>
      </div>
      <Card title={t('stats.log')} subtitle={t('stats.logHint')}>
        <div style={{ overflowX: 'auto' }}>
          <div className="ap-lr a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
            <span>{t('stats.time')}</span>
            <span>{t('stats.bot')}</span>
            <span>{t('stats.session')}</span>
            <span>{t('stats.source')}</span>
            <span>{t('stats.costCol')}</span>
            <span />
          </div>
          {S.log.map((r) => (
            <div className="ap-lr" key={r.at + r.title}>
              <span className="a-mono a-muted">{r.at}</span>
              <Bot id={r.bot} />
              <span>
                {r.title} {r.by && <span className="a-muted">· {r.by}</span>}
              </span>
              <span className="a-muted">{r.source}</span>
              <span className="a-mono">{r.usd}</span>
              <Button size="sm">{t('stats.replay')}</Button>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  )
}
