/**
 * 2.4 · Nhân bản hoặc xuất một bot: chọn phần được sao chép; kênh nhắn tin, khoá API và lịch sử
 * chat không bao giờ sao chép. Tệp xuất `.aris-bot.json` nhập lại ở hộp Tạo bot.
 */
import {
  Button,
  Dialog,
  Mascot,
  Tabs,
  TextInput,
  fetchExternalStatus,
  teamAction,
  useTeamData,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)', marginTop: 2, flex: 'none' }

type Part = 'config' | 'soul' | 'memory'

/** Tải tệp xuất về máy qua trình duyệt. */
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CloneBot({ t, nav, params }: PageProps) {
  const team = useTeamData()
  const bot = team?.bots.find((b) => b.id === params.id)
  const [tab, setTab] = useState<'clone' | 'export'>('clone')
  const [name, setName] = useState<string | null>(null)
  const [parts, setParts] = useState<Record<Part, boolean>>({ config: true, soul: true, memory: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!team) return null
  if (!bot || bot.kind === 'commander') {
    return (
      <Dialog open width={480} title={t('clone.missing')} closeLabel={t('cb.close')} onClose={nav.close}>
        <div className="ap-dfoot">
          <Button size="lg" onClick={nav.close}>
            {t('cb.close')}
          </Button>
        </div>
      </Dialog>
    )
  }
  const newName = name ?? `${bot.name} 2`

  async function run() {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'clone') {
        const r = await teamAction<{ created: string }>({
          op: 'clone',
          id: bot!.id,
          name: newName.trim(),
          parts,
        })
        // Bot ngoài: báo aris gắn plugin cho bản sao ngay.
        if (bot!.external) await fetchExternalStatus().catch(() => null)
        nav.close()
        nav.go('bot', { id: r.created })
      } else {
        const r = await teamAction<{ file: unknown }>({ op: 'export', id: bot!.id, parts })
        download(`${bot!.handle}.aris-bot.json`, r.file)
        nav.close()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rows: [Part | null, string, string | null][] = [
    ['config', t('clone.config'), t('clone.configHint')],
    ['soul', t('clone.soul'), null],
    [null, t('clone.skills'), t('clone.skillsHint')],
    ['memory', t('clone.memory'), t('clone.memoryHint')],
    [null, t('clone.keys'), t('clone.keysHint')],
  ]
  return (
    <Dialog
      open
      width={620}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mascot id={bot.mascot} size={28} accessory={bot.accessory} />
          {t('clone.title', { name: bot.name })}
        </span>
      }
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      <Tabs
        label={t('clone.title', { name: bot.name })}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'clone', label: t('clone.cloneTab') },
          { value: 'export', label: t('clone.exportTab') },
        ]}
      />
      {tab === 'clone' && (
        <label className="a-field">
          <span className="l">{t('clone.newName')}</span>
          <TextInput value={newName} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      {tab === 'export' && (
        <p className="a-muted" style={{ margin: 0, fontSize: 13 }}>
          {t('clone.exportHint')}
        </p>
      )}
      <div>
        {rows.map(([part, title, hint]) => (
          <label className="ap-ck" key={title} style={part ? undefined : { opacity: 0.6 }}>
            <input
              type="checkbox"
              style={check}
              disabled={!part}
              checked={part ? parts[part] : false}
              onChange={part ? (e) => setParts({ ...parts, [part]: e.target.checked }) : undefined}
            />
            <span>
              <b>{title}</b>
              {hint && (
                <>
                  <br />
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {hint}
                  </span>
                </>
              )}
            </span>
          </label>
        ))}
        <div className="ap-ck">
          <input type="checkbox" disabled aria-label={t('clone.channels')} style={check} />
          <span>
            <b>{t('clone.channels')}</b>
            <br />
            <span style={{ fontSize: 12.5, color: 'var(--a-warn)' }}>{t('clone.channelsHint')}</span>
          </span>
        </div>
        <div className="a-muted" style={{ fontSize: 12.5, paddingTop: 10 }}>
          {t('clone.noHistory')}
        </div>
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || (tab === 'clone' && !newName.trim())}
          onClick={() => void run()}
        >
          {tab === 'clone' ? t('clone.create') : t('clone.export')}
        </Button>
      </div>
    </Dialog>
  )
}
