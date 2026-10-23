/** 5.2 · Hộp thư vào: mục aris đã chép lời/tóm tắt, kèm gợi ý chỗ xếp để anh duyệt. */
import { Button, IconButton, PageShell } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { DEMO_INBOX, DEMO_TREE } from './demo.js'

const SOURCE_ICON = { voice: '🎙', link: '🔗', image: '🖼', note: '✎' } as const

export function Inbox({ t, nav }: PageProps) {
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconButton label={t('br.back')} onClick={() => nav.go('brain')}>
            ‹
          </IconButton>
          {t('br.inbox')}
        </span>
      }
      subtitle={t('in.subtitle', { n: DEMO_TREE.inbox })}
      actions={
        <>
          <Button>{t('in.quick')}</Button>
          <Button variant="primary">{t('in.fileAll')}</Button>
        </>
      }
    >
      <div className="ap-inbox-grid">
        {DEMO_INBOX.map((it) => (
          <section className="a-card ap-pad ap-inc" key={it.title}>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              <span aria-hidden="true">{SOURCE_ICON[it.source]} </span>
              {it.from}
            </span>
            <b>{it.title}</b>
            {it.summary && <div className="a-muted">{it.summary}</div>}
            <div className="ap-tags" style={{ alignItems: 'center' }}>
              {it.plan.map(([kind, value], i) => {
                const prev = it.plan[i - 1]?.[0]
                const label = prev === kind ? '' : t(`in.plan.${kind}`)
                return (
                  <span key={i} style={{ display: 'contents' }}>
                    {label && <span className="a-muted">{label}</span>}
                    <span className="ap-tag">{value}</span>
                  </span>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="primary">
                {t('in.agree')}
              </Button>
              <Button size="sm">{t('in.edit')}</Button>
              <Button size="sm">{t('in.delete')}</Button>
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
