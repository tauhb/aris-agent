/**
 * 2.2 · Hồ sơ bot (đặc tả: docs/specs/aris-bots.md): hồ sơ và tính cách sửa thật, model riêng,
 * mở chat với bot. Skill, quyền, kênh riêng và tóm tắt hoạt động còn là mẫu tới các bước sau.
 */
import { getMascot } from '@aris/ui-kit'
import {
  Button,
  Select,
  Card,
  CardRow,
  Mascot,
  TextInput,
  openBotSession,
  teamAction,
  useTeam,
  type BotData,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { departmentOptions, modelOptions } from '../options.js'
import { useChannels } from '../settings/channels-api.js'

/** Kênh riêng của bot (bản vẽ 2.2): tài khoản Telegram gắn trên trang 6.3. */
function BotChannels({ t, botId, onConnect }: { t: PageProps['t']; botId: string; onConnect: () => void }) {
  const { data } = useChannels()
  const tg = data?.bots.find((b) => b.bot === botId)
  return (
    <Card title={t('bot.channels')}>
      <CardRow label="Telegram">
        {tg ? (
          <span style={{ fontSize: 12.5 }}>
            <span className="a-mono">@{tg.username}</span> ·{' '}
            <span style={{ fontWeight: 600, color: tg.error ? 'var(--a-danger)' : 'var(--a-ok)' }}>
              {tg.error ? t('bot.channelError') : t('bot.connected')}
            </span>
          </span>
        ) : (
          <Button size="sm" onClick={onConnect}>
            {t('bot.connect')}
          </Button>
        )}
      </CardRow>
      <Later t={t} stage={7} row>
        <CardRow label="Lark">
          <Button size="sm" disabled>
            {t('bot.connect')}
          </Button>
        </CardRow>
      </Later>
    </Card>
  )
}
import { BotAside, PermsCard } from './BotPerms.js'
import { SoulCard } from './BotSoul.js'
import { Later, SkillsTab } from './BotTools.js'
import { ExternalSettings } from './ExternalBot.js'
import { MascotPicker } from './MascotPicker.js'

type Tab = 'soul' | 'model' | 'skills' | 'perms' | 'external'
type T = PageProps['t']

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
  const dirty = (['name', 'handle', 'role', 'description', 'mascot', 'department'] as const).some(
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
      <div className="ap-sec">{t('bot.profileTitle')}</div>
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
          <div className="a-field">
            <span className="l">{t('bot.department')}</span>
            <Select
              label={t('bot.department')}
              value={form.department ?? ''}
              onChange={(v) => set({ department: v })}
              options={departmentOptions(team, { name: t('bot.noDepartment') }, (n) =>
                t('bot.depCount', { n }),
              )}
            />
          </div>
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
    </>
  )
}

/** Tab Model (bản vẽ 2.2): model theo từng việc của bot. */
function ModelCard({ t, bot, team, nav }: { t: T; bot: BotData; team: TeamView; nav: PageProps['nav'] }) {
  const [error, setError] = useState<string | null>(null)
  const key = (m?: { provider: string; model: string }) => (m ? pairKey(m.provider, m.model) : '')
  const ref = (v: string) => {
    const [provider, model] = v.split('\u0000') as [string, string]
    return v ? { provider, model } : null
  }
  async function save(patch: Record<string, unknown>) {
    setError(null)
    try {
      await teamAction({ op: 'update', id: bot.id, patch })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const pick = (
    label: string,
    value: string,
    def: string,
    onChange: (v: string) => void,
    current?: { provider: string; model: string },
  ) => (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={modelOptions(team.catalog, { name: def }, current)}
      searchPlaceholder={t('sel.search')}
      emptyLabel={t('sel.empty')}
    />
  )
  const row = (label: string, hint: string | null, control: ReactNode) => (
    <div className="ap-taskrow">
      <span className="lbl">
        {label}
        {hint && <span className="a-muted">{hint}</span>}
      </span>
      <span className="ctl">{control}</span>
    </div>
  )
  return (
    <Card title={t('bot.modelTitle', { name: bot.name })}>
      {row(
        t('bot.m.chat'),
        t('bot.m.chatHint'),
        pick(
          t('bot.m.chat'),
          key(bot.model),
          t('bot.modelDefault'),
          (v) => void save({ model: ref(v) }),
          bot.model,
        ),
      )}
      {row(
        t('bot.m.goal'),
        t('bot.m.goalHint'),
        pick(
          t('bot.m.goal'),
          key(bot.models?.goal),
          t('bot.m.goalDefault'),
          (v) => void save({ models: { goal: ref(v) } }),
          bot.models?.goal,
        ),
      )}
      <Later t={t} stage={3} row>
        {row(
          t('bot.m.learn'),
          t('bot.m.learnHint'),
          <span className="a-muted">{t('bot.m.learnDefault')}</span>,
        )}
      </Later>
      {row(
        t('bot.m.fallback'),
        t('bot.m.fallbackHint'),
        pick(
          t('bot.m.fallback'),
          key(bot.models?.fallback),
          t('bot.m.fallbackDefault'),
          (v) => void save({ models: { fallback: ref(v) } }),
          bot.models?.fallback,
        ),
      )}
      {error && (
        <div className="a-row" style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>
          {error}
        </div>
      )}
      <div className="a-row" style={{ justifyContent: 'flex-end' }}>
        <a className="ap-link" onClick={() => nav.go('settings', { section: 'provider' })}>
          {t('bot.manageProviders')}
        </a>
      </div>
    </Card>
  )
}

export function BotProfile({ t, nav, params, plugins }: PageProps) {
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
  // Bot ngoài không có phiên riêng: chỉ hồ sơ và cấu hình bot ngoài.
  const tabs: [Tab, string][] = bot.external
    ? [
        ['soul', t('bot.soul')],
        ['external', t('ext.tab')],
      ]
    : [
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
          <div style={{ marginLeft: 'auto', display: bot.external ? 'none' : 'flex', gap: 8 }}>
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
          {tab === 'soul' && (
            <>
              <SoulCard t={t} bot={bot} />
              <ProfileForm t={t} bot={bot} team={team} onDeleted={() => nav.go('map')} />
            </>
          )}
          {tab === 'external' && bot.external && (
            <ExternalSettings t={t} bot={{ ...bot, external: bot.external }} plugins={plugins} />
          )}
          {tab === 'model' && <ModelCard t={t} bot={bot} team={team} nav={nav} />}
          {tab === 'skills' && <SkillsTab t={t} nav={nav} bot={bot} />}
          {tab === 'perms' && (
            <>
              <PermsCard t={t} bot={bot} />
              {!bot.external && (
                <BotChannels
                  t={t}
                  botId={bot.id}
                  onConnect={() => nav.go('settings', { section: 'channels' })}
                />
              )}
            </>
          )}
        </div>
      </main>
      <BotAside t={t} bot={bot} />
    </div>
  )
}
