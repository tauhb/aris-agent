/** 3.1 · Ký ức của một bot: dung lượng ghi chú và hồ sơ chủ nhân, ba loại ký ức (lõi, lưu trữ, chờ duyệt). */
import { Button, Card, CloseIcon, IconButton, PageShell, Segmented, Tabs, Tag } from '@aris/ui-kit/react'
import { useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { Box } from '../ui.js'
import { DEMO_MEMORY as M } from './demo.js'
import { BOT_NAMES, botName } from './names.js'

function Item({
  tag,
  text,
  source,
  children,
}: {
  tag: string
  text: ReactNode
  source: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="ap-it">
      <Tag>{tag}</Tag>
      <span style={{ flex: 1, minWidth: 0 }}>
        {text}
        <div className="a-muted" style={{ fontSize: 12 }}>
          {source}
        </div>
      </span>
      {children}
    </div>
  )
}

function Meter({
  title,
  amount,
  pct,
  warn,
  note,
}: {
  title: string
  amount: string
  pct: number
  warn?: boolean
  note?: string
}) {
  return (
    <Box style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <b>{title}</b>
        <span className="a-mono a-muted" style={{ fontSize: 12 }}>
          {amount}
        </span>
      </div>
      <div className="ap-meter">
        <span style={{ width: `${pct}%`, background: warn ? 'var(--a-warn)' : 'var(--a-accent)' }} />
      </div>
      {note && (
        <div className="a-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {note}
        </div>
      )}
    </Box>
  )
}

export function Memory({ t, nav, params }: PageProps) {
  const [bot, setBot] = useState<string>(params.bot && params.bot in BOT_NAMES ? params.bot : 'aris')
  const [tab, setTab] = useState<'core' | 'archive' | 'pending'>('core')
  const name = botName(bot)
  const chars = (used: string, cap: string) => t('mem.chars', { used, cap })
  return (
    <PageShell
      title={t('mem.title', { name })}
      subtitle={t('mem.subtitle')}
      actions={
        <Segmented
          label={t('mem.pickBot')}
          value={bot}
          onChange={setBot}
          options={M.bots.map((id) => ({ value: id, label: botName(id) }))}
        />
      }
    >
      <div style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ap-grid-2">
          <Meter
            title={t('mem.notes', { name })}
            amount={chars(M.notes.used, M.notes.cap)}
            pct={M.notes.pct}
          />
          <Meter
            title={t('mem.owner')}
            amount={chars(M.owner.used, M.owner.cap)}
            pct={M.owner.pct}
            warn
            note={t('mem.nearlyFull', { name })}
          />
        </div>
        <Tabs
          label={t('mem.kinds')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'core', label: t('mem.core', { n: M.counts.core }) },
            { value: 'archive', label: t('mem.archive', { n: M.counts.archive }) },
            { value: 'pending', label: t('mem.pending', { n: M.counts.pending }) },
          ]}
        />
        {tab === 'core' && (
          <Card>
            {M.core.map((m) => (
              <Item
                key={m.text}
                tag={m.tag}
                text={m.text}
                source={
                  <>
                    {m.source}
                    {m.chat && (
                      <>
                        {' · '}
                        <a className="ap-link" style={{ fontSize: 12 }} onClick={() => nav.openPanel(null)}>
                          {t('mem.openChat')}
                        </a>
                      </>
                    )}
                  </>
                }
              >
                <IconButton label={t('mem.edit')}>✎</IconButton>
                <IconButton label={t('mem.demote')}>↓</IconButton>
                <IconButton label={t('mem.delete')}>
                  <CloseIcon size={16} />
                </IconButton>
              </Item>
            ))}
          </Card>
        )}
        {tab === 'archive' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="ap-search" style={{ margin: 0, padding: '8px 12px', borderRadius: 10 }}>
              ⌕
              <input
                type="search"
                aria-label={t('mem.search', { n: M.counts.archive })}
                placeholder={t('mem.search', { n: M.counts.archive })}
              />
            </label>
            <Card>
              {M.archive.map((m) => (
                <Item
                  key={m.text}
                  tag={m.tag}
                  text={m.text}
                  source={
                    <>
                      {m.source}
                      {m.promote && (
                        <>
                          {' · '}
                          <b style={{ color: 'var(--a-accent)' }}>{t('mem.suggestPromote')}</b>
                        </>
                      )}
                    </>
                  }
                >
                  {m.promote && <Button size="sm">{t('mem.promote')}</Button>}
                </Item>
              ))}
            </Card>
          </div>
        )}
        {tab === 'pending' && (
          <Card>
            {M.pending.map((m) => (
              <Item key={m.text} tag={m.tag} text={m.text} source={m.source}>
                <Button variant="primary" size="sm">
                  {t('mem.save')}
                </Button>
                <Button size="sm">{t('mem.discard')}</Button>
              </Item>
            ))}
          </Card>
        )}
      </div>
    </PageShell>
  )
}
