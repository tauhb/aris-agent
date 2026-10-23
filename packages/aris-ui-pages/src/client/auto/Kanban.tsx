/** 4.3 · Kanban: các cột theo trạng thái thẻ, bot nhận thẻ, thẻ bị chặn, tiến độ, thẻ chờ duyệt. */
import { Button, PageShell, Segmented, branchColor } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot } from '../ui.js'
import { DEMO_KANBAN as K } from './demo.js'

export function Kanban({ t }: PageProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  return (
    <PageShell
      title={`${K.board} ▾`}
      subtitle={K.meta}
      actions={
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span className="a-muted">{t('kb.split')}</span>
            <Segmented
              label={t('kb.split')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'auto', label: t('kb.auto') },
                { value: 'manual', label: t('kb.manual') },
              ]}
            />
          </span>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('kb.driver')}
          </span>
          <Button variant="primary">{t('kb.new')}</Button>
        </>
      }
    >
      <div className="ap-board">
        {K.columns.map((col) => (
          <section className="ap-kcol" key={col.id} aria-label={t(`kb.col.${col.id}`)}>
            <div className="ch">
              <span>{t(`kb.col.${col.id}`)}</span>
              <span>{col.cards.length}</span>
            </div>
            {col.cards.map((c) => (
              <div
                key={c.title}
                className={col.id === 'done' ? 'ap-kc a-muted' : 'ap-kc'}
                style={
                  c.progress !== undefined
                    ? { borderColor: branchColor(c.bot) }
                    : c.warn
                      ? { borderColor: 'var(--a-warn)' }
                      : undefined
                }
              >
                <span>{c.title}</span>
                {c.progress !== undefined && (
                  <span className="ap-track" style={{ height: 4 }}>
                    <span style={{ width: `${c.progress}%`, background: branchColor(c.bot) }} />
                  </span>
                )}
                <div className="ft">
                  <Bot id={c.bot} size={18} />
                  {c.foot}
                  {c.blockedBy && <span style={{ color: 'var(--a-ink)' }}>{c.blockedBy}</span>}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </PageShell>
  )
}
