/** 5.2 · Hộp thư vào: mục aris đã chép lời/tóm tắt, kèm gợi ý chỗ xếp để anh duyệt. */
import { Button, IconButton, PageShell } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { DEMO_INBOX, DEMO_TREE } from './demo.js'

/** Biểu tượng nguồn của mục (ghi âm, link, ảnh, ghi chú), nét theo canvas. */
const SOURCE_PATH = {
  voice: 'M9 2h6v12H9zM5 10a7 7 0 0 0 14 0M12 17v4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  note: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5',
} as const

function SourceIcon({ kind }: { kind: keyof typeof SOURCE_PATH }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={SOURCE_PATH[kind]} />
    </svg>
  )
}

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
            <span className="a-muted ap-src-ic" style={{ fontSize: 12.5 }}>
              <SourceIcon kind={it.source} />
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
