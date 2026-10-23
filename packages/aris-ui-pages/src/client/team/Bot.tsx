/**
 * 2.2 · Hồ sơ bot (đặc tả: docs/specs/aris-bots.md): hồ sơ và tính cách sửa thật, model riêng,
 * mở chat với bot. Skill, quyền, kênh riêng và tóm tắt hoạt động còn là mẫu tới các bước sau.
 */
import { getMascot } from '@aris/ui-kit'
import {
  Button,
  Card,
  CardRow,
  Mascot,
  Tag,
  TextInput,
  openBotSession,
  teamAction,
  useTeam,
  type BotData,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Box } from '../ui.js'
import { DEMO_PROFILE as P } from './demo.js'
import { MascotPicker } from './MascotPicker.js'

type Tab = 'soul' | 'model' | 'skills' | 'perms'
type T = PageProps['t']

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }
const pairKey = (provider: string, model: string) => `${provider}\u0000${model}`

/** Hồ sơ và tính cách: mọi trường lưu thẳng vào `@aris/bots`. */
function ProfileForm({
  t,
  bot,
  team,
  onDeleted,
}: {
  t: T
  bot: BotData
  team: TeamView
  onDeleted: () => void
}) {
  const [form, setForm] = useState(bot)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    setForm(bot)
    setMsg(null)
  }, [bot])
  const set = (patch: Partial<BotData>) => (setForm({ ...form, ...patch }), setMsg(null))
  const dirty = (['name', 'handle', 'role', 'description', 'soul', 'mascot', 'department'] as const).some(
    (k) => (form[k] ?? '') !== (bot[k] ?? ''),
  )

  async function save() {
    setBusy(true)
    try {
      await teamAction({
        op: 'update',
        id: bot.id,
        patch: {
          name: form.name,
          handle: form.handle,
          role: form.role,
          description: form.description,
          soul: form.soul,
          mascot: form.mascot,
          department: form.department || null,
        },
      })
      setMsg({ ok: true, text: t('bot.saved') })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('bot.deleteConfirm', { name: bot.name }))) return
    setBusy(true)
    try {
      await teamAction({ op: 'delete', id: bot.id })
      onDeleted()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ap-grid-2" style={{ gap: 12 }}>
        <label className="a-field">
          <span className="l">{t('bot.name')}</span>
          <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="a-field">
          <span className="l">{t('bot.handle')}</span>
          <TextInput mono value={form.handle} onChange={(e) => set({ handle: e.target.value })} />
          <span className="h">{t('bot.handleHint')}</span>
        </label>
        <label className="a-field">
          <span className="l">{t('bot.role')}</span>
          <TextInput value={form.role} onChange={(e) => set({ role: e.target.value })} />
        </label>
        {bot.kind !== 'commander' && (
          <label className="a-field">
            <span className="l">{t('bot.department')}</span>
            <select
              className="ap-sel"
              value={form.department ?? ''}
              onChange={(e) => set({ department: e.target.value })}
            >
              <option value="">{t('bot.noDepartment')}</option>
              {team.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="a-field">
        <span className="l">{t('bot.about')}</span>
        <textarea
          className="a-inp"
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
        />
        <span className="h">{t('bot.aboutHint')}</span>
      </label>
      <label className="a-field">
        <span className="l">{t('bot.soulTitle')}</span>
        <textarea
          className="ap-soul a-mono"
          rows={5}
          value={form.soul}
          onChange={(e) => set({ soul: e.target.value })}
          aria-label={t('bot.soulTitle')}
        />
      </label>
      <div>
        <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
          {t('bot.mascot')}
        </div>
        <MascotPicker t={t} value={form.mascot} onChange={(mascot) => set({ mascot })} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {bot.kind !== 'commander' && (
          <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
            {t('bot.delete')}
          </Button>
        )}
        <span style={{ flex: 1 }} />
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--a-ok)' : 'var(--a-danger)' }}>
            {msg.text}
          </span>
        )}
        <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {t('bot.save')}
        </Button>
      </div>
      <Box style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px' }}>
        <span className="a-muted" style={{ fontSize: 18, lineHeight: 1 }}>
          ⓘ
        </span>
        <span className="a-muted" style={{ fontSize: 13 }}>
          {t('bot.soulNote', { name: bot.name })}
        </span>
      </Box>
    </>
  )
}

/** Model riêng của bot: áp khi mở phiên chat với bot; bỏ trống là theo model mặc định. */
function ModelCard({ t, bot, team, nav }: { t: T; bot: BotData; team: TeamView; nav: PageProps['nav'] }) {
  const current = bot.model ? pairKey(bot.model.provider, bot.model.model) : ''
  const [error, setError] = useState<string | null>(null)
  const known = team.catalog.some((g) => g.models.some((m) => pairKey(g.id, m.id) === current))
  async function change(v: string) {
    setError(null)
    const [provider, model] = v.split('\u0000') as [string, string]
    try {
      await teamAction({ op: 'update', id: bot.id, patch: { model: v ? { provider, model } : null } })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Card title={t('bot.modelTitle', { name: bot.name })}>
      <CardRow label={t('bot.modelChat')}>
        <select className="ap-sel" value={current} onChange={(e) => void change(e.target.value)}>
          <option value="">{t('bot.modelDefault')}</option>
          {current && !known && (
            <option value={current}>{`${bot.model!.provider} · ${bot.model!.model}`}</option>
          )}
          {team.catalog.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.models.map((m) => (
                <option key={m.id} value={pairKey(g.id, m.id)}>
                  {m.name || m.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </CardRow>
      <div className="a-row a-muted" style={{ fontSize: 12.5 }}>
        {error ? <span style={{ color: 'var(--a-danger)' }}>{error}</span> : t('bot.modelHint')}
      </div>
      <div className="a-row" style={{ justifyContent: 'flex-end' }}>
        <a className="ap-link" onClick={() => nav.go('settings', { section: 'provider' })}>
          {t('bot.manageProviders')}
        </a>
      </div>
    </Card>
  )
}

export function BotProfile({ t, nav, params }: PageProps) {
  const [tab, setTab] = useState<Tab>('soul')
  const team = useTeam()
  const bot = team.bots.find((b) => b.id === params.id) ?? team.bots.find((b) => b.kind === 'commander')
  if (!bot)
    return (
      <main className="a-page">
        <div className="a-page-body a-muted">{t(team.ready ? 'bot.missing' : 'bot.loading')}</div>
      </main>
    )
  const name = bot.name
  const chat = (fresh: boolean) =>
    void openBotSession(bot.id, fresh).then(
      (id) => nav.openSession(id),
      () => {},
    )
  const tabs: [Tab, string][] = [
    ['soul', t('bot.soul')],
    ['model', t('bot.model')],
    ['skills', t('bot.skills')],
    ['perms', t('bot.perms')],
  ]
  return (
    <div className="ap-split">
      <main className="a-page">
        <div
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '18px 24px 0' }}
        >
          <Mascot id={bot.mascot} size={52} label={getMascot(bot.mascot)?.shape} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 className="a-page-title" style={{ fontSize: 20, fontWeight: 700 }}>
              {name}
            </h1>
            <span className="a-muted" style={{ fontSize: 13 }}>
              @{bot.handle}
              {bot.role ? ` · ${bot.role}` : ''}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={() => chat(false)}>
              {t('bot.chatWith', { name })}
            </Button>
            <Button onClick={() => chat(true)}>{t('bot.newChat')}</Button>
            <Button onClick={() => nav.go('clone-bot', { id: bot.id })}>{t('bot.clone')}</Button>
          </div>
        </div>
        <div
          className="a-tabs"
          role="tablist"
          aria-label={t('bot.tabs')}
          style={{ padding: '8px 24px 0', flexWrap: 'wrap' }}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="a-tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="a-tab" onClick={() => nav.go('memory', { bot: bot.id })}>
            {t('bot.memory')}
          </button>
          <button type="button" className="a-tab" onClick={() => nav.go('owner', { bot: bot.id })}>
            {t('bot.owner')}
          </button>
        </div>
        <div
          className="a-page-body"
          style={{ maxWidth: 860, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {tab === 'soul' && <ProfileForm t={t} bot={bot} team={team} onDeleted={() => nav.go('map')} />}
          {tab === 'model' && <ModelCard t={t} bot={bot} team={team} nav={nav} />}
          {tab === 'skills' && (
            <>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {t('bot.sample')}
              </div>
              <Card
                title={t('bot.skillCount', { n: P.skillCount })}
                actions={
                  <a className="ap-link" onClick={() => nav.go('skills')}>
                    {t('bot.openLibrary')}
                  </a>
                }
              >
                {P.skills.map((s) => (
                  <CardRow key={s.id}>
                    <span className="a-mono grow">{s.id}</span>
                    <Tag>{s.v}</Tag>
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      {s.note}
                    </span>
                  </CardRow>
                ))}
              </Card>
              <Card title={t('bot.toolset')}>
                {P.tools.map((tool) => (
                  <label className="a-row" key={tool.text}>
                    <input type="checkbox" defaultChecked={tool.on} style={check} />
                    {tool.text}
                  </label>
                ))}
              </Card>
            </>
          )}
          {tab === 'perms' && (
            <>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {t('bot.sample')}
              </div>
              <Card title={t('bot.permTitle')}>
                {P.permissions.map(([k, v]) => (
                  <CardRow key={k} label={k}>
                    <span className="a-muted">{v}</span>
                  </CardRow>
                ))}
              </Card>
              <Card title={t('bot.channels')}>
                {P.channels.map((c) => (
                  <CardRow key={c.text} label={c.text}>
                    {c.connected ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--a-ok)' }}>
                        {t('bot.connected')}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => nav.go('settings', { section: 'channels' })}>
                        {t('bot.connect')}
                      </Button>
                    )}
                  </CardRow>
                ))}
              </Card>
            </>
          )}
        </div>
      </main>
      <aside className="ap-aside" aria-label={t('bot.summary')}>
        <b>{t('bot.summary')}</b>
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>
            <span className="a-muted">{t('bot.handle')}: </span>@{bot.handle}
          </span>
          <span>
            <span className="a-muted">{t('bot.department')}: </span>
            {team.departments.find((d) => d.id === bot.department)?.name ?? t('bot.noDepartment')}
          </span>
          <span>
            <span className="a-muted">{t('bot.model')}: </span>
            {bot.model ? bot.model.model : t('bot.modelDefault')}
          </span>
        </div>
        <div className="a-muted" style={{ fontSize: 12.5 }}>
          {t('bot.activitySoon')}
        </div>
      </aside>
    </div>
  )
}
