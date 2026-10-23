/**
 * 3.1 · Ký ức của một bot: dung lượng ghi chú và hồ sơ chủ nhân, ba loại ký ức (lõi,
 * lưu trữ, chờ duyệt). Dữ liệu thật từ `@aris/memory` qua `/api/aris/memory`.
 */
import { Button, Card, CloseIcon, IconButton, PageShell, Segmented, Tabs, Tag } from '@aris/ui-kit/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { Box } from '../ui.js'
import { DEMO_MEMORY as M } from './demo.js'
import { useMemory, type MemoryItem, type MemoryOp } from './memory-api.js'
import { BOT_NAMES, botName } from './names.js'

/** Bỏ dấu để tìm ("hop" khớp "Họp"). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

const two = (n: number) => String(n).padStart(2, '0')
const when = (iso: string) => {
  const d = new Date(iso)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

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
  note,
}: {
  title: string
  amount: string
  pct: number
  note?: string | undefined
}) {
  const warn = pct >= 80
  return (
    <Box style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <b>{title}</b>
        <span className="a-mono a-muted" style={{ fontSize: 12 }}>
          {amount}
        </span>
      </div>
      <div className="ap-meter">
        <span
          style={{ width: `${Math.min(100, pct)}%`, background: warn ? 'var(--a-warn)' : 'var(--a-accent)' }}
        />
      </div>
      {warn && note && (
        <div className="a-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {note}
        </div>
      )}
    </Box>
  )
}

/** Một ký ức có thể sửa tại chỗ. */
function Editable({
  m,
  t,
  name,
  act,
  children,
}: {
  m: MemoryItem
  t: PageProps['t']
  name: string
  act: (op: MemoryOp, id: string, text?: string) => Promise<boolean>
  children?: ReactNode
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const source = (
    <>
      {t(`mem.trust.${m.trust}`, { name })} · {when(m.source.at)} · {t(`mem.book.${m.book}`)}
      {m.uses > 0 && <> · {t('mem.uses', { n: m.uses })}</>}
    </>
  )
  if (draft !== null)
    return (
      <Item
        tag={t(`mem.kind.${m.kind}`)}
        text={
          <textarea
            className="a-inp"
            rows={2}
            value={draft}
            aria-label={t('mem.edit')}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        }
        source={source}
      >
        <Button
          variant="primary"
          size="sm"
          onClick={async () => {
            if (await act('update', m.id, draft)) setDraft(null)
          }}
        >
          {t('mem.save')}
        </Button>
        <Button size="sm" onClick={() => setDraft(null)}>
          {t('mem.cancel')}
        </Button>
      </Item>
    )
  return (
    <Item tag={t(`mem.kind.${m.kind}`)} text={m.text} source={source}>
      <IconButton label={t('mem.edit')} onClick={() => setDraft(m.text)}>
        ✎
      </IconButton>
      {children}
      <IconButton label={t('mem.delete')} onClick={() => void act('forget', m.id)}>
        <CloseIcon size={16} />
      </IconButton>
    </Item>
  )
}

export function Memory({ t, params }: PageProps) {
  const [bot, setBot] = useState<string>(params.bot && params.bot in BOT_NAMES ? params.bot : 'aris')
  const [tab, setTab] = useState<'core' | 'archive' | 'pending'>('core')
  const [query, setQuery] = useState('')
  const { data, error, loading, act } = useMemory(bot)
  const name = botName(bot)
  const archive = useMemo(() => {
    const q = fold(query.trim())
    return (data?.archive ?? []).filter((m) => !q || fold(m.text).includes(q))
  }, [data, query])
  const usage = (u: { used: number; cap: number }) => ({
    amount: t('mem.chars', { used: u.used.toLocaleString('vi-VN'), cap: u.cap.toLocaleString('vi-VN') }),
    pct: Math.round((u.used / u.cap) * 100),
  })
  const empty = (key: string) => <div className="ap-pad a-muted">{t(key, { name })}</div>

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
        {error && (
          <div className="ap-alert" role="alert">
            {t('mem.error', { error })}
          </div>
        )}
        {data && (
          <div className="ap-grid-2">
            <Meter
              title={t('mem.notes', { name })}
              {...usage(data.usage.notes)}
              note={t('mem.nearlyFull', { name })}
            />
            <Meter title={t('mem.owner')} {...usage(data.usage.owner)} note={t('mem.nearlyFull', { name })} />
          </div>
        )}
        <Tabs
          label={t('mem.kinds')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'core', label: t('mem.core', { n: data?.core.length ?? 0 }) },
            { value: 'archive', label: t('mem.archive', { n: data?.archive.length ?? 0 }) },
            { value: 'pending', label: t('mem.pending', { n: data?.pending.length ?? 0 }) },
          ]}
        />
        {loading && !data && <div className="a-muted">{t('mem.loading')}</div>}
        {data && tab === 'core' && (
          <Card>
            {data.core.length === 0 && empty('mem.empty.core')}
            {data.core.map((m) => (
              <Editable key={m.id} m={m} t={t} name={name} act={act}>
                <IconButton label={t('mem.demote')} onClick={() => void act('demote', m.id)}>
                  ↓
                </IconButton>
              </Editable>
            ))}
          </Card>
        )}
        {data && tab === 'archive' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="ap-search" style={{ margin: 0, padding: '8px 12px', borderRadius: 10 }}>
              ⌕
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('mem.search', { n: data.archive.length })}
                placeholder={t('mem.search', { n: data.archive.length })}
              />
            </label>
            <Card>
              {archive.length === 0 && empty('mem.empty.archive')}
              {archive.map((m) => (
                <Editable key={m.id} m={m} t={t} name={name} act={act}>
                  {m.trust !== 'external' && (
                    <Button size="sm" onClick={() => void act('promote', m.id)}>
                      {t('mem.promote')}
                    </Button>
                  )}
                </Editable>
              ))}
            </Card>
          </div>
        )}
        {data && tab === 'pending' && (
          <Card>
            {data.pending.length === 0 && empty('mem.empty.pending')}
            {data.pending.map((m) => (
              <Item
                key={m.id}
                tag={t(`mem.kind.${m.kind}`)}
                text={m.text}
                source={`${t(`mem.trust.${m.trust}`, { name })} · ${when(m.source.at)}`}
              >
                <Button variant="primary" size="sm" onClick={() => void act('approve', m.id)}>
                  {t('mem.save')}
                </Button>
                <Button size="sm" onClick={() => void act('discard', m.id)}>
                  {t('mem.discard')}
                </Button>
              </Item>
            ))}
          </Card>
        )}
      </div>
    </PageShell>
  )
}
