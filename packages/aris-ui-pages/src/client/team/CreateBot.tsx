/** 2.1 · Tạo bot mới (bot của aris) và 2.1b · Thêm bot ngoài nói ACP, chung một hộp thoại hai loại. */
import { MASCOTS, getMascot } from '@aris/ui-kit'
import {
  BotPicker,
  Button,
  Dialog,
  Mascot,
  PlusIcon,
  Segmented,
  Select,
  TextInput,
  teamAction,
  useTeam,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Disclosure } from '../ui.js'
import { botOptions } from '../mind/names.js'
import { departmentOptions, modelOptions } from '../options.js'
import { DEMO_CREATE_BOT as C } from './demo.js'
import { ExternalBot } from './ExternalBot.js'

/** Gợi ý tên gọi từ tên hiển thị: bỏ dấu, chữ thường (khớp `suggestHandle` ở máy chủ). */
export const handleOf = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

function ArisBot({ t, nav }: PageProps) {
  const team = useTeam()
  const [mascot, setMascot] = useState(C.suggested[0]!)
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleEdited, setHandleEdited] = useState(false)
  const [about, setAbout] = useState('')
  const [soul, setSoul] = useState('')
  const [department, setDepartment] = useState('')
  const [model, setModel] = useState('')
  const [clone, setClone] = useState<string>('blank')
  const [adv, setAdv] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickRole = (r: string) => {
    setRole(r)
    const p = team.roles.find((x) => x.role === r)
    if (!p) return
    setAbout(p.description)
    setSoul(p.soul)
    setMascot(p.mascot)
  }
  const cloneFrom = (id: string) => {
    setClone(id)
    const b = team.bots.find((x) => x.id === id)
    if (!b) return
    setRole(b.role)
    setAbout(b.description)
    setSoul(b.soul)
    if (b.department) setDepartment(b.department)
    if (b.model) setModel(`${b.model.provider}\u0000${b.model.model}`)
  }

  /** Nhập bot từ tệp `.aris-bot.json` (xuất ở hộp Nhân bản / xuất 2.4). */
  async function importFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      let data: unknown
      try {
        data = JSON.parse(await file.text())
      } catch {
        throw new Error(t('cb.importBad'))
      }
      const r = await teamAction<{ created: string }>({ op: 'import', file: data })
      nav.close()
      nav.go('bot', { id: r.created })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    setBusy(true)
    setError(null)
    const [provider, modelId] = model.split('\u0000')
    try {
      const snap = await teamAction<{ bots: { id: string; handle: string }[] }>({
        op: 'create',
        bot: {
          name,
          handle: handle || handleOf(name),
          role,
          description: about,
          soul,
          mascot,
          department: department || null,
          model: model ? { provider, model: modelId } : null,
        },
      })
      const made = snap.bots.find((b) => b.handle === (handle || handleOf(name)))
      nav.close()
      if (made) nav.go('bot', { id: made.id })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 24 }}>
        <div
          style={{
            flex: 'none',
            width: 210,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div className="ap-tile" style={{ width: 128, height: 128, borderRadius: 32 }}>
            <Mascot id={mascot} size={96} label={getMascot(mascot)?.shape} motion="idle" />
          </div>
          <div className="ap-lb" style={{ alignSelf: 'flex-start', color: 'var(--a-ink)' }}>
            {t('cb.mascot')}{' '}
            <span className="a-muted" style={{ fontWeight: 400 }}>
              {t('cb.mascotHint')}
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label={t('cb.pickMascot')}
            className="ap-mascots"
            style={{ flexWrap: 'wrap' }}
          >
            {MASCOTS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mascot === m.id}
                aria-label={m.shape}
                title={`${m.shape} · ${m.role}`}
                onClick={() => setMascot(m.id)}
              >
                <Mascot id={m.id} size={26} />
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
              {t('cb.template')}
            </div>
            <div className="ap-tags" style={{ gap: 6 }}>
              {team.roles.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className="ap-chip ap-pick"
                  aria-pressed={role === r.role}
                  onClick={() => pickRole(r.role)}
                >
                  {r.role}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="a-field" style={{ flex: 1 }}>
              <span className="l">{t('cb.name')}</span>
              <TextInput
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value)
                  if (!handleEdited) setHandle(handleOf(e.target.value))
                }}
              />
            </label>
            <label className="a-field" style={{ flex: 1 }}>
              <span className="l">{t('cb.handle')}</span>
              <TextInput
                mono
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value)
                  setHandleEdited(true)
                }}
              />
            </label>
          </div>
          <label className="a-field">
            <span className="l">{t('cb.jobTitle')}</span>
            <TextInput value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="a-field">
            <span className="l">{t('cb.about')}</span>
            <textarea
              className="a-inp"
              rows={3}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
            />
            <span className="h">{t('cb.aboutHint', { name: name || t('cb.thisBot') })}</span>
          </label>
        </div>
      </div>
      <Disclosure
        title={t('cb.advanced')}
        hint={t('cb.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <div className="ap-frow">
          <span>{t('cb.cloneFrom')}</span>
          <BotPicker
            label={t('cb.cloneFrom')}
            value={clone}
            onChange={cloneFrom}
            options={[
              { id: 'blank', name: t('cb.blank'), note: t('cb.blankNote'), icon: <PlusIcon size={14} /> },
              ...botOptions(),
            ]}
            searchPlaceholder={t('pick.search')}
            emptyLabel={t('pick.empty')}
          />
        </div>
        <label className="ap-frow">
          <span>{t('cb.soul')}</span>
          <textarea
            className="a-inp"
            rows={3}
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical', flex: 1 }}
          />
        </label>
        <div className="ap-frow">
          <span>{t('cb.department')}</span>
          <Select
            label={t('cb.department')}
            value={department}
            onChange={setDepartment}
            options={departmentOptions(team, { name: t('cb.noDepartment') }, (n) => t('bot.depCount', { n }))}
          />
        </div>
        <div className="ap-frow">
          <span>{t('cb.model')}</span>
          <Select
            label={t('cb.model')}
            value={model}
            onChange={setModel}
            options={modelOptions(team.catalog, { name: t('cb.modelDefault') })}
            searchPlaceholder={t('sel.search')}
            emptyLabel={t('sel.empty')}
          />
        </div>
        <div className="ap-frow">
          <span>{t('cb.perms')}</span>
          <span className="a-muted">{t('cb.permsLater')}</span>
        </div>
        <div className="ap-frow">
          <span>{t('cb.channel')}</span>
          <span className="a-muted">{t('cb.channelLater')}</span>
        </div>
      </Disclosure>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <label className="ap-import" style={{ marginRight: 'auto' }}>
          <input
            type="file"
            accept=".json,application/json"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void importFile(f)
            }}
          />
          {t('cb.import')}
        </label>
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg" disabled={busy || !name.trim()} onClick={() => void create()}>
          {t('cb.create')}
        </Button>
      </div>
    </>
  )
}

export function CreateBot(props: PageProps) {
  const { t, nav, params } = props
  const [kind, setKind] = useState<'aris' | 'external'>(params.kind === 'external' ? 'external' : 'aris')
  return (
    <Dialog
      open
      width={760}
      title={t('cb.title')}
      description={kind === 'aris' ? t('cb.intro') : t('ext.intro')}
      closeLabel={t('cb.close')}
      onClose={nav.close}
      aside={
        <Segmented
          label={t('cb.kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'aris', label: t('cb.aris') },
            { value: 'external', label: t('cb.external') },
          ]}
        />
      }
    >
      {kind === 'aris' ? <ArisBot {...props} /> : <ExternalBot {...props} />}
    </Dialog>
  )
}
