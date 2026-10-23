/**
 * 4.3 · Kanban: mỗi dự án một bảng (quyết định 11), chọn ở tiêu đề; các cột theo
 * trạng thái thẻ, bot nhận thẻ, thẻ bị chặn, tiến độ, thẻ chờ duyệt.
 */
import {
  Button,
  ChevronDownIcon,
  Menu,
  MenuItem,
  PageShell,
  Segmented,
  branchColor,
  useDismiss,
} from '@aris/ui-kit/react'
import { useCallback, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot } from '../ui.js'
import { DEMO_BOARDS } from './demo.js'

function BoardPicker({
  t,
  current,
  onPick,
}: {
  t: PageProps['t']
  current: string
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  const board = DEMO_BOARDS.find((b) => b.id === current)!
  return (
    <span className="a-pop" ref={root}>
      <button
        type="button"
        className="ap-picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('kb.pick')}
        onClick={() => setOpen(!open)}
      >
        {board.project}
        <ChevronDownIcon />
      </button>
      {open && (
        <Menu label={t('kb.pick')} role="listbox" width={260}>
          {DEMO_BOARDS.map((b) => (
            <MenuItem
              key={b.id}
              role="option"
              selected={b.id === current}
              onSelect={() => {
                setOpen(false)
                onPick(b.id)
              }}
            >
              {b.project}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  )
}

export function Kanban({ t, nav, params }: PageProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const K = DEMO_BOARDS.find((b) => b.id === params.project) ?? DEMO_BOARDS[0]!
  const count = K.columns.reduce((n, c) => n + c.cards.length, 0)
  return (
    <PageShell
      title={<BoardPicker t={t} current={K.id} onPick={(id) => nav.go('kanban', { project: id })} />}
      subtitle={t('kb.meta', { n: count, project: K.project })}
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
