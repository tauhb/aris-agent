/**
 * 6.5 · Thống kê và nhật ký (giai đoạn 7, đợt 7c; bản vẽ `ThongKe.dc.html`): chi phí theo loại việc, trúng prompt
 * cache, việc xong không cần người dùng, skill mới bật, chi phí theo model, nhật ký phiên. "Phát lại" mở màn 6.5b (`Replay.tsx`). Dữ
 * liệu từ `/api/aris/stats` (`@aris/stats`).
 */
import { Button, Card, PageShell, Segmented } from '@aris/ui-kit/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col } from '../ui.js'
import { Replay } from './Replay.js'
import { providerLabel } from './Media.js'
import { dayLabel, fmtInt, fmtTokens, fmtUsd, logTime } from './stats-format.js'

type Range = 'today' | '7d' | '30d'
type KindKey = 'chat' | 'giao' | 'routine' | 'hoc'
/** Thứ tự các loại trong cột chồng (từ đáy lên) và màu của chúng (theo bản vẽ). */
const KINDS: readonly KindKey[] = ['chat', 'giao', 'routine', 'hoc']
const SERIES = ['var(--ap-c1)', 'var(--ap-c2)', 'var(--ap-c3)', 'var(--ap-c4)'] as const
/** Chiều cao cột cao nhất (px) trong khung 170px của biểu đồ. */
const BAR_MAX = 160

interface Row {
  session: string
  bot: string
  botName: string
  mascot: string
  accessory?: string | undefined
  title: string
  by: string
  source: string
  kind: KindKey
  firstAt: number
  lastAt: number
  usd: number
  tokens: number
  running: boolean
}
/** Một dòng "Chi phí theo model" (`byModel` của `@aris/stats`). */
interface ModelRow {
  provider: string
  model: string
  calls: number
  tokens: number
  cachePct: number | null
  usd: number
}
interface Data {
  range: Range
  total: number
  days: ({ day: string } & Record<KindKey, number>)[]
  cache: { pct: number | null; savePct: number | null }
  autonomous: { done: number; total: number }
  skills: { enabled: number; rolledBack: number }
  byModel: ModelRow[]
  log: Row[]
}

const endpoint = (range: Range) => {
  const u = new URL('api/aris/stats', document.baseURI)
  u.searchParams.set('range', range)
  return u
}

export function Stats(props: PageProps) {
  const sid = props.params.replay
  return sid ? <Replay {...props} sid={sid} /> : <Overview {...props} />
}

function Overview({ t, nav }: PageProps) {
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  const load = useCallback(async () => {
    const mine = ++latest.current
    const r = await fetch(endpoint(range)).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (Data & { error?: string }) | null
    if (mine !== latest.current) return
    if (!r?.ok || !j) return setError(j?.error ?? `HTTP ${r?.status ?? 0}`)
    setError(null)
    setData(j)
  }, [range])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => clearInterval(timer)
  }, [load])

  const dec = t('sx.dec')
  const weekdays = t('sx.weekdays').split(',')
  const rangeName = t(`stats.${range}`)
  const switcher = (
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
  )
  if (!data)
    return (
      <PageShell title={t('sec.stats')} actions={switcher}>
        <div className={error ? 'ap-error' : 'a-muted'}>
          {error ? t('sx.loadError', { error }) : t('sx.loading')}
        </div>
      </PageShell>
    )

  const style = data.days.length > 7 ? 'date' : 'week'
  const totals = data.days.map((d) => KINDS.reduce((n, k) => n + d[k], 0))
  const max = Math.max(0, ...totals)
  const peakAt = totals.indexOf(max)
  const label = (day: string) => dayLabel(day, style, weekdays)
  // Nhãn dưới cột: một ngày thì ghi cả thứ và ngày; 30 ngày chỉ ghi mỗi 5 ngày, tính lùi từ hôm nay.
  const tick = (day: string, i: number) =>
    data.days.length === 1
      ? `${dayLabel(day, 'week', weekdays)} ${dayLabel(day, 'date', weekdays)}`
      : data.days.length > 7
        ? (data.days.length - 1 - i) % 5 === 0
          ? label(day)
          : ''
        : label(day)
  const money = (n: number) => fmtUsd(n, dec)
  const legend = [t('stats.chat'), t('stats.delegated'), t('stats.routine'), t('stats.learning')]
  const { cache, autonomous, skills } = data
  const cards = [
    {
      key: 'stats.cache',
      value: cache.pct === null ? '—' : `${Math.round(cache.pct)}%`,
      note:
        cache.savePct !== null
          ? t('sx.cacheNote', { pct: Math.round(cache.savePct) })
          : cache.pct === null
            ? t('sx.noData')
            : '',
    },
    {
      key: 'stats.autonomous',
      value: autonomous.total ? `${Math.round((autonomous.done / autonomous.total) * 100)}%` : '—',
      note: autonomous.total
        ? t('sx.autoNote', { done: autonomous.done, total: autonomous.total })
        : t('sx.noData'),
    },
    {
      key: 'stats.skills',
      value: String(skills.enabled),
      note: t('sx.skillNote', { n: skills.rolledBack }),
    },
  ]

  return (
    <PageShell title={t('sec.stats')} actions={switcher}>
      {error && <div className="ap-error">{t('sx.loadError', { error })}</div>}
      <div className="ap-cols">
        <Col grow={1.4} basis={480}>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b>{t('stats.costByTask')}</b>
              <span className="a-muted" style={{ fontSize: 12.5 }}>
                {t('sx.total', { range: rangeName, total: money(data.total) })}
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
            <div
              className={`ap-chart${data.days.length > 7 ? ' ap-sx-narrow' : ''}`}
              role="img"
              aria-label={t('sx.chartLabel', {
                n: data.days.length,
                total: money(data.total),
                day: max > 0 ? label(data.days[peakAt]!.day) : '—',
                peak: money(max),
              })}
            >
              {data.days.map((d, i) => {
                const total = totals[i]!
                const height = total > 0 && max > 0 ? Math.max(2, Math.round((total / max) * BAR_MAX)) : 0
                return (
                  <div
                    className="col"
                    key={d.day}
                    title={t('sx.dayTip', { day: dayLabel(d.day, 'date', weekdays), total: money(total) })}
                  >
                    <div className="stk" style={{ height }}>
                      {KINDS.map((k, j) => (
                        <span
                          key={k}
                          style={{
                            height: `${total > 0 ? (d[k] / total) * 100 : 0}%`,
                            background: SERIES[j],
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div
              className={`ap-days a-muted${data.days.length > 7 ? ' ap-sx-narrow' : ''}`}
              aria-hidden="true"
            >
              {data.days.map((d, i) => (
                <span key={d.day}>{tick(d.day, i)}</span>
              ))}
            </div>
            {max === 0 && <div className="a-muted ap-sxnote">{t('sx.noCost')}</div>}
          </Box>
        </Col>
        <Col basis={260}>
          {cards.map((c) => (
            <Box key={c.key}>
              <div className="ap-k">{t(c.key)}</div>
              <div className="ap-v">{c.value}</div>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {c.note}
              </div>
            </Box>
          ))}
        </Col>
      </div>
      <Card title={t('stats.byModel')} subtitle={t('sx.byModelRange', { range: rangeName })}>
        <div style={{ overflowX: 'auto' }}>
          <div className="ap-sxm a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
            <span>{t('sx.m.model')}</span>
            <span>{t('sx.m.calls')}</span>
            <span>{t('stats.tokens')}</span>
            <span>{t('sx.m.cache')}</span>
            <span>{t('stats.costCol')}</span>
          </div>
          {data.byModel.length === 0 && <div className="ap-sxempty a-muted">{t('sx.m.empty')}</div>}
          {data.byModel.map((m) => (
            <div className="ap-sxm" key={`${m.provider}/${m.model}`}>
              <span className="a-mono ap-sxses" title={`${m.provider}/${m.model}`}>
                {providerLabel(m.provider)} · {m.model}
              </span>
              <span className="a-muted">{fmtInt(m.calls, dec)}</span>
              <span className="a-muted">{m.tokens > 0 ? fmtTokens(m.tokens, dec) : '—'}</span>
              <span className="a-muted">{m.cachePct === null ? '—' : `${Math.round(m.cachePct)}%`}</span>
              <span className="a-mono">{fmtUsd(m.usd, dec)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={t('stats.log')} subtitle={t('stats.logHint')}>
        <div style={{ overflowX: 'auto' }}>
          <div className="ap-lr a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
            <span>{t('stats.time')}</span>
            <span>{t('stats.bot')}</span>
            <span>{t('stats.session')}</span>
            <span>{t('stats.source')}</span>
            <span>{t('stats.tokens')}</span>
            <span>{t('stats.costCol')}</span>
            <span />
          </div>
          {data.log.length === 0 && <div className="ap-sxempty a-muted">{t('sx.empty')}</div>}
          {data.log.map((r) => (
            <div className="ap-lr" key={r.session}>
              <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                {logTime(r.firstAt)}
              </span>
              <span title={r.botName}>
                <Bot id={r.mascot} accessory={r.accessory} />
              </span>
              <span className="ap-sxses">
                <span className="ap-sxtitle">{r.title || t('sx.untitled')}</span>
                {r.by && <span className="a-muted"> · {t('sx.by', { name: r.by })}</span>}
                {r.running && (
                  <span className="ap-sxlive">
                    <span aria-hidden="true" className="ap-sxdot" />
                    {t('sx.running')}
                  </span>
                )}
              </span>
              <span className="a-muted">{t(`sx.src.${r.source}`)}</span>
              <span className="a-muted">{fmtTokens(r.tokens, dec)}</span>
              <span className="a-mono">{fmtUsd(r.usd, dec)}</span>
              <Button size="sm" onClick={() => nav.go('settings', { section: 'stats', replay: r.session })}>
                {t('stats.replay')}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  )
}
