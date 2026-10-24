/**
 * 2.1b · Thêm bot ngoài (bản vẽ `TaoBotNgoai.dc.html`): Claude Code, Codex qua plugin chính thức
 * của dsh hoặc một agent nói ACP. Bấm "Thêm vào đội" thì cài plugin nếu chưa có (không bật lớp
 * profile: aris tự gắn mỗi bot một bản), rồi tạo bot với cấu hình bot ngoài.
 */
import {
  Button,
  Card,
  CardRow,
  DANGEROUS_PERMISSIONS,
  DEFAULT_PERMISSION,
  EXTERNAL_PACKAGES,
  EXTERNAL_PERMISSIONS,
  TextInput,
  fetchExternalStatus,
  teamAction,
  useExternalStatus,
  useTeamData,
  type BotData,
  type ExternalAgent,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps, PluginSource } from '../page.js'
import { Disclosure } from '../ui.js'
import { handleOf } from './CreateBot.js'
import { MascotPicker } from './MascotPicker.js'

const AGENTS: readonly ExternalAgent[] = ['claude-code', 'codex', 'acp']
const LOGO: Record<ExternalAgent, { letter: string; color: string }> = {
  'claude-code': { letter: 'C', color: '#D97757' },
  codex: { letter: 'X', color: '#10A37F' },
  acp: { letter: '…', color: 'var(--a-muted)' },
}
/** Dung lượng tải plugin (README của từng gói). */
const SIZE: Record<ExternalAgent, string> = { 'claude-code': '92 MB', codex: '114 MB', acp: '1 MB' }
const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }

/** Cài gói plugin chính thức (không bật lớp profile); xong thì aris nạp được module. */
export async function installPlugin(plugins: PluginSource | undefined, pkg: string): Promise<string | null> {
  if (!plugins) return 'no-source'
  const list = await plugins.bundles()
  if (!list.ok) return list.error
  const b = list.value.find((x) => x.name === pkg)
  if (b?.installed) return null
  if (!b?.installTarget) return 'no-target'
  const r = await plugins.install(b.installTarget.spec, crypto.randomUUID(), b.installTarget.registry)
  if (!r.ok) return r.error
  const app = r.value.application
  return app === 'applied' || app === 'restart-required' ? null : (r.value.error?.code ?? app)
}

export function ExternalBot({ t, nav, plugins }: PageProps) {
  const data = useTeamData()
  const [status] = useExternalStatus()
  const [agent, setAgent] = useState<ExternalAgent>('claude-code')
  const [perm, setPerm] = useState<Record<ExternalAgent, string>>({ ...DEFAULT_PERMISSION })
  const [name, setName] = useState('')
  const [mascot, setMascot] = useState('banh-rang')
  const [department, setDepartment] = useState('')
  const [job, setJob] = useState('')
  const [adv, setAdv] = useState(false)
  const [model, setModel] = useState('')
  const [timeoutMin, setTimeoutMin] = useState(45)
  const [worktree, setWorktree] = useState(true)
  const [assignable, setAssignable] = useState(true)
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState<'install' | 'create' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const st = status?.agents[agent]
  const agentName = t(`ext.name.${agent}`)
  const shown = name.trim() || agentName
  const loginColor = st?.login === 'yes' ? 'var(--a-ok)' : 'var(--a-warn)'

  async function add() {
    setError(null)
    try {
      if (!st?.installed) {
        setBusy('install')
        const err = await installPlugin(plugins, EXTERNAL_PACKAGES[agent])
        if (err === 'no-target') throw new Error(t('ext.noTarget', { agent: agentName }))
        if (err) throw new Error(t('ext.installFailed', { error: err }))
      }
      setBusy('create')
      const handle = handleOf(name)
      const snap = await teamAction<{ bots: { id: string; handle: string }[] }>({
        op: 'create',
        bot: {
          name: name.trim(),
          handle,
          role: t(`ext.role.${agent}`),
          description: job,
          soul: '',
          mascot,
          department: department || null,
          external: {
            agent,
            permission: perm[agent],
            model: model.trim() || null,
            timeoutMin,
            worktree,
            assignable,
            ...(agent === 'acp' ? { command } : {}),
          },
        },
      })
      // Báo aris gắn plugin cho bot mới ngay.
      await fetchExternalStatus().catch(() => null)
      const made = snap.bots.find((b) => b.handle === handle)
      nav.close()
      if (made) nav.go('bot', { id: made.id })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div>
        <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
          {t('ext.agent')}
        </div>
        <div role="radiogroup" aria-label={t('ext.agent')} style={{ display: 'flex', gap: 8 }}>
          {AGENTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-label={t(`ext.name.${a}`)}
              aria-checked={agent === a}
              onClick={() => setAgent(a)}
              className="ap-ext-agent"
              data-on={agent === a || undefined}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="logo" style={{ background: LOGO[a].color }}>
                  {LOGO[a].letter}
                </span>
                <b>{t(`ext.name.${a}`)}</b>
              </span>
              <span className="a-muted" style={{ fontSize: 12 }}>
                {a === 'acp' ? t('ext.acpHint') : t('ext.official')}
              </span>
            </button>
          ))}
        </div>
        {status && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', paddingTop: 8, fontSize: 12.5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: loginColor }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
              {t(`ext.login.${st?.login ?? 'unknown'}`, { agent: agentName })}
            </span>
            <span className="a-muted">
              {st?.installed
                ? t('ext.installed')
                : agent === 'acp'
                  ? t('ext.willInstallAcp')
                  : t('ext.willInstall', { agent: agentName, size: SIZE[agent] })}
            </span>
          </div>
        )}
      </div>

      <MascotPicker t={t} value={mascot} onChange={setMascot} />

      <div style={{ display: 'flex', gap: 10 }}>
        <label className="a-field" style={{ flex: 1 }}>
          <span className="l">{t('cb.name')}</span>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={agentName} />
        </label>
        <label className="a-field" style={{ flex: 1 }}>
          <span className="l">{t('ext.department')}</span>
          <select className="a-inp" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">{t('ext.noDepartment')}</option>
            {(data?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="a-field">
        <span className="l">
          {t('ext.job')}{' '}
          <span className="a-muted" style={{ fontWeight: 400 }}>
            {t('ext.jobHint')}
          </span>
        </span>
        <TextInput value={job} onChange={(e) => setJob(e.target.value)} placeholder={t('ext.jobPh')} />
      </label>
      <div className="a-field">
        <span className="l">{t('ext.workDir')}</span>
        <span className="a-muted" style={{ fontSize: 13 }}>
          {t('ext.workDirValue')}
        </span>
      </div>

      <div className="ap-ext-limits">
        <b>{t('ext.limits.title')}</b>
        <ul>
          {(['once', 'final', 'alone', 'account'] as const).map((k) => (
            <li key={k}>
              <b>{t(`ext.limits.${k}`, { agent: agentName })}</b> {t(`ext.limits.${k}.d`)}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
          {t('ext.whenAsks', { name: shown })}
        </div>
        <div role="radiogroup" aria-label={t('ext.whenAsks', { name: shown })} className="ap-ext-perms">
          {EXTERNAL_PERMISSIONS[agent].map((p) => {
            const danger = DANGEROUS_PERMISSIONS.has(p)
            const on = perm[agent] === p
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-label={t(`ext.perm.${p}`)}
                aria-checked={on}
                onClick={() => setPerm({ ...perm, [agent]: p })}
                className="ap-ext-perm"
                data-on={on || undefined}
                data-danger={danger || undefined}
              >
                <span className="ring" aria-hidden="true" />
                <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span className="lbl">
                    {t(`ext.perm.${p}`)}
                    {danger ? (
                      <span className="tag danger">{t('ext.dangerous')}</span>
                    ) : DEFAULT_PERMISSION[agent] === p ? (
                      <span className="tag ok">{t('ext.recommended')}</span>
                    ) : null}
                  </span>
                  <span className="a-muted" style={{ fontSize: 12 }}>
                    {t(`ext.perm.${p}.d`)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Disclosure
        title={t('cb.advanced')}
        hint={agent === 'acp' ? t('ext.advancedHintAcp') : t('ext.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <label className="ap-frow">
          <span>{t('ext.model')}</span>
          <TextInput
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('ext.modelPh', { agent: agentName })}
            style={{ width: 300 }}
          />
        </label>
        <label className="ap-frow">
          <span>{t('ext.timeout')}</span>
          <select
            className="a-inp"
            style={{ width: 140 }}
            value={timeoutMin}
            onChange={(e) => setTimeoutMin(Number(e.target.value))}
          >
            {[15, 30, 45, 90, 120].map((n) => (
              <option key={n} value={n}>
                {t('ext.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
        <label className="ap-frow">
          <span>
            {t('ext.worktree')}{' '}
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('ext.worktreeHint')}
            </span>
          </span>
          <input
            type="checkbox"
            checked={worktree}
            onChange={(e) => setWorktree(e.target.checked)}
            style={check}
          />
        </label>
        <label className="ap-frow">
          <span>{t('cb.delegable')}</span>
          <input
            type="checkbox"
            checked={assignable}
            onChange={(e) => setAssignable(e.target.checked)}
            style={check}
          />
        </label>
        {agent === 'acp' && (
          <label className="ap-frow">
            <span>{t('ext.command')}</span>
            <TextInput
              mono
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="gemini --experimental-acp"
              style={{ width: 300 }}
            />
          </label>
        )}
      </Disclosure>

      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <span className="a-muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
          {st?.installed ? t('ext.footReady') : t('ext.footInstall', { size: SIZE[agent] })}
        </span>
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!!busy || !name.trim() || (agent === 'acp' && !command.trim())}
          onClick={() => void add()}
        >
          {busy === 'install' ? t('ext.installing') : busy === 'create' ? t('ext.creating') : t('ext.add')}
        </Button>
      </div>
    </>
  )
}

/** Hồ sơ bot ngoài (2.2): plugin đã gắn chưa, cài khi thiếu, đổi mức quyền và giới hạn. */
export function ExternalSettings({
  t,
  bot,
  plugins,
}: {
  t: PageProps['t']
  bot: { id: string; name: string; external: NonNullable<BotData['external']> }
  plugins: PluginSource | undefined
}) {
  const ext = bot.external
  const [status, reload] = useExternalStatus()
  const [form, setForm] = useState(ext)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const agentName = t(`ext.name.${ext.agent}`)
  const state = status?.bots[bot.id]
  const dirty = JSON.stringify(form) !== JSON.stringify(ext)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title={t('ext.settings', { name: bot.name })}>
      <CardRow label={t('ext.agent')}>
        <span>{t(`ext.role.${ext.agent}`)}</span>
      </CardRow>
      <CardRow label={t('ext.plugin')}>
        <span style={{ color: state === 'ready' ? 'var(--a-ok)' : 'var(--a-warn)' }}>
          {t(`ext.state.${state ?? 'missing'}`, { agent: agentName })}
        </span>
        {state === 'missing' && (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const err = await installPlugin(plugins, EXTERNAL_PACKAGES[ext.agent])
                if (err === 'no-target') throw new Error(t('ext.noTarget', { agent: agentName }))
                if (err) throw new Error(t('ext.installFailed', { error: err }))
                reload()
              })
            }
          >
            {busy ? t('ext.installing') : t('ext.install')}
          </Button>
        )}
      </CardRow>
      <CardRow label={t('ext.whenAsks', { name: bot.name })}>
        <select
          className="a-inp"
          style={{ width: 260 }}
          value={form.permission}
          onChange={(e) => setForm({ ...form, permission: e.target.value })}
        >
          {EXTERNAL_PERMISSIONS[ext.agent].map((p) => (
            <option key={p} value={p}>
              {t(`ext.perm.${p}`)}
              {DANGEROUS_PERMISSIONS.has(p) ? ` · ${t('ext.dangerous')}` : ''}
            </option>
          ))}
        </select>
      </CardRow>
      <CardRow label={t('ext.model')}>
        <TextInput
          value={form.model ?? ''}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder={t('ext.modelPh', { agent: agentName })}
          style={{ width: 260 }}
        />
      </CardRow>
      <CardRow label={t('ext.timeout')}>
        <select
          className="a-inp"
          style={{ width: 140 }}
          value={form.timeoutMin}
          onChange={(e) => setForm({ ...form, timeoutMin: Number(e.target.value) })}
        >
          {[...new Set([15, 30, 45, 90, 120, form.timeoutMin])]
            .sort((a, b) => a - b)
            .map((n) => (
              <option key={n} value={n}>
                {t('ext.minutes', { n })}
              </option>
            ))}
        </select>
      </CardRow>
      <CardRow label={t('ext.worktree')}>
        <input
          type="checkbox"
          checked={form.worktree}
          onChange={(e) => setForm({ ...form, worktree: e.target.checked })}
          style={check}
        />
      </CardRow>
      <CardRow label={t('cb.delegable')}>
        <input
          type="checkbox"
          checked={form.assignable}
          onChange={(e) => setForm({ ...form, assignable: e.target.checked })}
          style={check}
        />
      </CardRow>
      {ext.agent === 'acp' && (
        <CardRow label={t('ext.command')}>
          <span className="a-mono a-muted">{[ext.command, ...(ext.args ?? [])].join(' ')}</span>
        </CardRow>
      )}
      <CardRow>
        {msg && <span style={{ color: 'var(--a-danger)', fontSize: 13 }}>{msg}</span>}
        <Button
          variant="primary"
          disabled={busy || !dirty}
          onClick={() =>
            void run(async () => {
              await teamAction({
                op: 'update',
                id: bot.id,
                patch: { external: { ...form, model: form.model?.trim() || null } },
              })
              await fetchExternalStatus().catch(() => null)
              reload()
            })
          }
        >
          {t('ext.save')}
        </Button>
      </CardRow>
    </Card>
  )
}
