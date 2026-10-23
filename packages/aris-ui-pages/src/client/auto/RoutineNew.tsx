/** 4.2 · Tạo routine bằng lời: anh mô tả, aris diễn giải thành lịch để xem lại trước khi lưu. */
import { Button, IconButton, Mascot, PageShell, Pill } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { botName } from '../mind/names.js'
import { DEMO_ROUTINE_DRAFT as D } from './demo.js'

export function RoutineNew({ t, nav }: PageProps) {
  const rows: [string, React.ReactNode, string | null][] = [
    [
      t('rn.bot'),
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mascot id={D.bot} size={22} />
        {botName(D.bot)}
      </span>,
      t('rn.change'),
    ],
    [
      t('rn.schedule'),
      <span>
        {D.schedule}
        <div className="a-mono a-muted" style={{ fontSize: 12 }}>
          {D.cron}
        </div>
      </span>,
      t('rn.edit'),
    ],
    [t('rn.nextRuns'), D.nextRuns, null],
    [t('rn.task'), D.task, t('rn.edit')],
    [t('rn.to'), D.to, t('rn.change')],
    [t('rn.perms'), D.perms, t('rn.change')],
    [t('rn.catchUp'), D.catchUp, t('rn.change')],
  ]
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconButton label={t('rn.back')} onClick={() => nav.go('routine')}>
            ‹
          </IconButton>
          {t('rn.title')}
        </span>
      }
    >
      <div
        style={{
          maxWidth: 760,
          width: '100%',
          margin: '10px auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('rn.ask')}</div>
          <div className="a-muted" style={{ fontSize: 13.5 }}>
            {t('rn.hint')}
          </div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px', borderColor: 'var(--a-accent)' }}>
          <textarea className="ap-bare" rows={2} defaultValue={D.text} aria-label={t('rn.describe')} />
        </div>
        <div className="a-card">
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <b>{t('rn.understood')}</b>
            <Pill tone="ok">{t('rn.clear')}</Pill>
          </div>
          {rows.map(([k, v, action]) => (
            <div className="ap-rkv" key={k}>
              <span className="a-muted">{k}</span>
              <span>{v}</span>
              {action ? (
                <Button variant="ghost" size="sm">
                  {action}
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button>{t('rn.tryNow')}</Button>
          <Button>{t('rn.savePaused')}</Button>
          <Button variant="primary">{t('rn.save')}</Button>
        </div>
      </div>
    </PageShell>
  )
}
