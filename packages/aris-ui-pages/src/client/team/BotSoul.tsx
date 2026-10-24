/**
 * Hồ sơ bot (bản vẽ 2.2), đợt 4: thẻ "Tính cách (SOUL)" có phiên bản và lần sửa cuối; hộp "Lịch sử
 * phiên bản" (xem, khôi phục) và hộp "Nhờ Aris viết lại" (Aris đề xuất, người dùng nhận rồi Lưu).
 */
import { Button, Dialog, teamAction, type BotData } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'

type T = PageProps['t']

interface Version {
  version: number
  soul: string
  at: string
  by: 'create' | 'user' | 'aris' | 'restore'
  from?: number
}

const dateOf = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const timeOf = (iso: string) => {
  const d = new Date(iso)
  return `${dateOf(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function HistoryDialog({ t, bot, onClose }: { t: T; bot: BotData; onClose: () => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void teamAction<{ versions: Version[] }>({ op: 'soul-history', id: bot.id })
      .then((r) => {
        setVersions(r.versions)
        setPick(r.versions[0]?.version ?? null)
      })
      .catch((e: unknown) => setError((e as Error).message))
  }, [bot.id])
  const current = versions?.[0]?.version
  const chosen = versions?.find((v) => v.version === pick)
  const byText = (v: Version) =>
    v.by === 'restore'
      ? t('soul.byRestore', { n: v.from ?? '?' })
      : t(v.by === 'aris' ? 'soul.byAris' : v.by === 'create' ? 'soul.byCreate' : 'soul.byUser')
  async function restore() {
    if (!chosen) return
    setBusy(true)
    try {
      await teamAction({ op: 'soul-restore', id: bot.id, version: chosen.version })
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      width={760}
      title={t('soul.historyTitle', { name: bot.name })}
      closeLabel={t('cb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cb.close')}</Button>
          <Button
            variant="primary"
            disabled={busy || !chosen || chosen.version === current}
            onClick={() => void restore()}
          >
            {t('soul.restore', { n: chosen?.version ?? '' })}
          </Button>
        </>
      }
    >
      {!versions && !error && <div className="a-muted">{t('soul.loading')}</div>}
      {versions && (
        <div className="ap-soulhist">
          <div className="list" role="listbox" aria-label={t('soul.historyTitle', { name: bot.name })}>
            {versions.map((v) => (
              <button
                key={v.version}
                type="button"
                role="option"
                aria-selected={v.version === pick}
                onClick={() => setPick(v.version)}
              >
                <b>
                  {t('soul.version', { n: v.version })}
                  {v.version === current ? ` · ${t('soul.current')}` : ''}
                </b>
                <span className="a-muted">
                  {timeOf(v.at)} · {byText(v)}
                </span>
              </button>
            ))}
          </div>
          <pre className="ap-soul a-mono view">{chosen?.soul || t('soul.empty')}</pre>
        </div>
      )}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
    </Dialog>
  )
}

const WISHES = ['soul.wish.short', 'soul.wish.warm', 'soul.wish.strict', 'soul.wish.sources'] as const

function RewriteDialog({
  t,
  bot,
  draft,
  onUse,
  onClose,
}: {
  t: T
  bot: BotData
  draft: string
  onUse: (soul: string) => void
  onClose: () => void
}) {
  const [wish, setWish] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setError(null)
    try {
      const r = await teamAction<{ soul: string }>({ op: 'soul-rewrite', id: bot.id, wish, draft })
      setResult(r.soul)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      width={820}
      title={t('soul.rewriteTitle', { name: bot.name })}
      description={t('soul.rewriteHint')}
      closeLabel={t('cb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cb.cancel')}</Button>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? t('soul.writing') : result ? t('soul.again') : t('soul.write')}
          </Button>
          <Button variant="primary" disabled={busy || !result} onClick={() => result && onUse(result)}>
            {t('soul.use')}
          </Button>
        </>
      }
    >
      <label className="a-field">
        <span className="l">{t('soul.wish')}</span>
        <textarea
          className="a-inp"
          rows={2}
          value={wish}
          placeholder={t('soul.wishPh')}
          onChange={(e) => setWish(e.target.value)}
          style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {WISHES.map((k) => (
          <button
            key={k}
            type="button"
            className="ap-chip"
            onClick={() => setWish(wish ? `${wish}; ${t(k)}` : t(k))}
          >
            {t(k)}
          </button>
        ))}
      </div>
      <div className="ap-soulcmp">
        <div>
          <div className="ap-lb" style={{ paddingBottom: 6 }}>
            {t('soul.now')}
          </div>
          <pre className="ap-soul a-mono view">{draft || t('soul.empty')}</pre>
        </div>
        <div>
          <div className="ap-lb" style={{ paddingBottom: 6 }}>
            {t('soul.proposal')}
          </div>
          <pre className="ap-soul a-mono view">
            {busy ? t('soul.writing') : (result ?? t('soul.noProposal'))}
          </pre>
        </div>
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
    </Dialog>
  )
}

/**
 * Mục "Tính cách (SOUL)" trong biểu mẫu hồ sơ (bản vẽ 2.2): dòng phiên bản, ô sửa, Lịch sử phiên bản,
 * Nhờ Aris viết lại. Bản Aris viết chỉ vào ô sửa (`onAris`); nút Lưu của hồ sơ mới lưu.
 */
export function SoulField({
  t,
  bot,
  value,
  onChange,
  fromAris,
  onAris,
}: {
  t: T
  bot: BotData
  value: string
  onChange: (soul: string) => void
  fromAris: boolean
  onAris: (soul: string) => void
}) {
  const [dialog, setDialog] = useState<'history' | 'rewrite' | null>(null)
  const meta = bot.soulMeta
  return (
    <div className="a-field">
      <span className="ap-soulhead">
        <span className="l">{t('bot.soulTitle')}</span>
        {meta && (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('soul.meta', { date: dateOf(meta.at), n: meta.version })}
          </span>
        )}
      </span>
      <textarea
        className="ap-soul a-mono"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('bot.soulTitle')}
      />
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" onClick={() => setDialog('history')}>
          {t('soul.history')}
        </Button>
        <Button size="sm" onClick={() => setDialog('rewrite')}>
          {t('soul.askAris')}
        </Button>
        {fromAris && value !== bot.soul && (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('soul.unsavedAris')}
          </span>
        )}
      </span>
      <span className="h">ⓘ {t('bot.soulNote', { name: bot.name })}</span>
      {dialog === 'history' && <HistoryDialog t={t} bot={bot} onClose={() => setDialog(null)} />}
      {dialog === 'rewrite' && (
        <RewriteDialog
          t={t}
          bot={bot}
          draft={value}
          onClose={() => setDialog(null)}
          onUse={(next) => {
            onAris(next)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
