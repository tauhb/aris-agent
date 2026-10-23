/**
 * 4.1 · Routine: bảng các lịch (bot, lịch chạy, nơi gửi, lần chạy gần nhất, bật/tắt),
 * cảnh báo routine lỗi. Lịch thật vẫn chạy ở trang lịch của dsh (mở từ nút "Lịch đang
 * chạy") cho tới khi giai đoạn 4 nối bảng này với lõi lịch.
 */
import { Button, PageShell, Pill, Switch } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot } from '../ui.js'
import { DEMO_ROUTINES as R } from './demo.js'

const TONE = { done: 'ok', failed: 'danger' } as const

export function Routine({ t, nav }: PageProps) {
  const [on, setOn] = useState(R.rows.map((r) => r.on))
  return (
    <PageShell
      title={t('rt.title')}
      subtitle={t('rt.subtitle', { n: R.count, bot: R.next.bot, at: R.next.at })}
      actions={
        <>
          <Button onClick={() => nav.openPanel('schedules')}>{t('rt.dshSchedules')}</Button>
          <Button>{t('rt.pauseAll')}</Button>
          <Button variant="primary" onClick={() => nav.go('routine-new')}>
            {t('rt.new')}
          </Button>
        </>
      }
    >
      <div className="a-card" style={{ overflowX: 'auto' }}>
        <div className="ap-rt a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
          <span />
          <span>{t('rt.name')}</span>
          <span>{t('rt.when')}</span>
          <span>{t('rt.to')}</span>
          <span>{t('rt.last')}</span>
          <span>{t('rt.on')}</span>
        </div>
        {R.rows.map((r, i) => {
          const off = !on[i]
          return (
            <div className="ap-rt" key={r.name}>
              <Bot id={r.bot} size={26} />
              <span className={off ? 'a-muted' : undefined}>
                <b>{r.name}</b>
                <div className={off ? undefined : 'a-muted'} style={{ fontSize: 12 }}>
                  {r.note}
                </div>
              </span>
              <span className={off ? 'a-muted' : undefined}>{r.when}</span>
              <span className={off ? 'a-muted' : undefined}>{r.to}</span>
              <span>
                {r.last ? (
                  <>
                    <Pill tone={TONE[r.last[0] as keyof typeof TONE] ?? 'muted'}>{r.last[1]}</Pill>{' '}
                    <span className="a-muted" style={{ fontSize: 12 }}>
                      {r.last[2]}
                    </span>
                  </>
                ) : (
                  <span className="a-muted">—</span>
                )}
              </span>
              <Switch
                checked={!off}
                label={t('rt.toggle', { name: r.name })}
                onChange={(v) => setOn(on.map((x, j) => (j === i ? v : x)))}
              />
            </div>
          )
        })}
      </div>
      <div className="ap-alert">
        <span style={{ flex: 1, minWidth: 260 }}>
          <b>{R.alert.title}</b> — {R.alert.text}
        </span>
        <Button size="sm">{t('rt.viewRun')}</Button>
        <Button size="sm">{t('rt.letFix', { name: R.alert.bot })}</Button>
      </div>
    </PageShell>
  )
}
