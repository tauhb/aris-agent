/** 2.3 · Bot hiểu gì về chủ nhân: điều bot chưa chắc, nhận định kèm độ tin cậy và bằng chứng, xác nhận hoặc sửa. */
import { Button, PageShell, Segmented } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { botName } from '../mind/names.js'
import { DEMO_OWNER as O } from './demo.js'

type Insight = (typeof O.communication)[number]

function Section({
  title,
  rows,
  t,
  color,
}: {
  title: string
  rows: readonly Insight[]
  t: PageProps['t']
  color: string
}) {
  return (
    <div className="a-card">
      <div className="ap-cl a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
        <span>{title}</span>
        <span>{t('own.confidence')}</span>
        <span>{t('own.evidence')}</span>
        <span />
      </div>
      {rows.map((r) => {
        const weak = r.pct < 60
        return (
          <div className="ap-cl" key={r.text}>
            <span className={weak ? 'a-muted' : undefined}>{r.text}</span>
            <span className="ap-track" style={{ height: 6 }}>
              <span style={{ width: `${r.pct}%`, background: weak ? 'var(--a-warn)' : color }} />
            </span>
            <a className="ap-link">{t('own.times', { n: r.evidence })}</a>
            <span style={{ display: 'flex', gap: 6 }}>
              <Button size="sm">{t('own.right')}</Button>
              <Button size="sm">{weak ? t('own.wrong') : t('own.fix')}</Button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function OwnerProfile({ t, params }: PageProps) {
  const [bot, setBot] = useState<string>(params.bot && O.bots.includes(params.bot) ? params.bot : 'lam')
  const name = botName(bot)
  return (
    <PageShell
      title={t('own.title', { name })}
      subtitle={t('own.subtitle', { n: O.insights })}
      actions={
        <>
          <Segmented
            label={t('mem.pickBot')}
            value={bot}
            onChange={setBot}
            options={O.bots.map((id) => ({ value: id, label: botName(id) }))}
          />
          <Button size="sm">{t('own.copy')}</Button>
        </>
      }
    >
      <div style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ap-warnbox" style={{ padding: '12px 14px' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>{t('own.unsure', { name })}</b> {O.unsure}
          </div>
          {O.unsureOptions.map((o) => (
            <Button key={o} size="sm">
              {o}
            </Button>
          ))}
        </div>
        <Section title={t('own.communication')} rows={O.communication} t={t} color="var(--a-ok)" />
        <Section title={t('own.goals')} rows={O.goals} t={t} color="var(--a-accent)" />
        <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
          {t('own.note', { name })}
        </p>
      </div>
    </PageShell>
  )
}
