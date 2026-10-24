/**
 * Tab "Skill & tool" của hồ sơ bot (bản vẽ 2.2, 2.2c): kết nối nền tảng (máy chủ MCP riêng của
 * bot), bộ công cụ bật/tắt theo bot, skill (giai đoạn 3, hiện mờ). Hộp "Thêm kết nối" ở `McpDialog`.
 */
import {
  Button,
  Card,
  CardRow,
  Dialog,
  Menu,
  MenuItem,
  Pill,
  Switch,
  Tag,
  TextInput,
  teamAction,
  useDismiss,
  useTeam,
  type BotData,
  type McpData,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import type { SkillRow } from '../mind/Skills.js'

type T = PageProps['t']
type Preset = McpData['preset']
type Ask = McpData['ask']

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)', flex: 'none' }

/** Chính sách khi bot chưa vào phòng nào (như `DEFAULT_POLICY` của `@aris/bots`). */
const NO_DEPARTMENT = { web: true, shell: false }

/**
 * Phần thuộc giai đoạn sau: vẫn hiện như bản vẽ nhưng mờ, ghi rõ giai đoạn. `row`: nhãn ở cuối một
 * dòng; mặc định nhãn nằm trên viền thẻ.
 */
export function Later({
  t,
  stage,
  row,
  label,
  children,
}: {
  t: T
  stage: number
  row?: boolean
  /** Nhãn thay cho "Giai đoạn N" (ví dụ phần của đợt sau trong cùng giai đoạn). */
  label?: string
  children: ReactNode
}) {
  return (
    <div className={row ? 'ap-later row' : 'ap-later'} aria-disabled="true">
      <div className="ap-later-body">{children}</div>
      <span className="ap-phase">{label ?? t('later.stage', { n: stage })}</span>
    </div>
  )
}

const LOGO: Record<Preset, { letter: string; color: string }> = {
  github: { letter: 'G', color: '#24292F' },
  lark: { letter: 'L', color: '#00B8A9' },
  notion: { letter: 'N', color: '#191919' },
  custom: { letter: '+', color: 'var(--a-muted)' },
}

function Logo({ preset }: { preset: Preset }) {
  const l = LOGO[preset]
  return (
    <span className="ap-mlogo" style={{ background: l.color }} aria-hidden="true">
      {l.letter}
    </span>
  )
}

/** Mô tả cách chạy: "máy chủ chính thức qua URL" hoặc lệnh trên máy. */
function howOf(t: T, c: McpData): string {
  if (c.preset === 'github') return t('mcp.howGithub')
  if (c.transport === 'streamable-http') return `URL · ${c.url ?? ''}`
  return `${t('mcp.howCommand')} · ${[c.command, ...(c.args ?? [])].join(' ')}`
}

function RowMenu({ t, c, onEdit }: { t: T; c: McpData; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, open, () => setOpen(false))
  const run = (body: Record<string, unknown>) => {
    setOpen(false)
    setBusy(true)
    void teamAction(body)
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  return (
    <span className="a-pop" ref={ref}>
      <Button
        size="sm"
        aria-label={t('mcp.more', { name: c.name })}
        onClick={() => setOpen(!open)}
        disabled={busy}
      >
        {busy ? t('mcp.checking') : '⋯'}
      </Button>
      {open && (
        <Menu label={t('mcp.more', { name: c.name })} align="end" width={200}>
          <MenuItem onSelect={() => (setOpen(false), onEdit())}>{t('mcp.edit')}</MenuItem>
          <MenuItem onSelect={() => run({ op: 'mcp-check', id: c.id })}>{t('mcp.recheck')}</MenuItem>
          <MenuItem onSelect={() => run({ op: 'mcp-delete', id: c.id })}>{t('mcp.remove')}</MenuItem>
        </Menu>
      )}
    </span>
  )
}

function McpCard({ t, nav, bot, team }: { t: T; nav: PageProps['nav']; bot: BotData; team: TeamView }) {
  const list = team.mcp.filter((c) => c.bot === bot.id)
  const add = () => nav.go('mcp-add', { bot: bot.id })
  const askText: Record<Ask, string> = {
    write: t('mcp.askWriteShort'),
    always: t('mcp.askAlwaysShort'),
    never: t('mcp.askNeverShort'),
  }
  return (
    <Card
      title={
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{t('mcp.title', { n: list.length })}</b>
          <span className="a-muted" style={{ fontSize: 12.5, fontWeight: 400 }}>
            {t('mcp.hint', { name: bot.name })}
          </span>
        </span>
      }
      actions={
        <Button size="sm" onClick={add}>
          {t('mcp.add')}
        </Button>
      }
    >
      {list.length === 0 && (
        <CardRow>
          <span className="a-muted" style={{ fontSize: 13 }}>
            {t('mcp.empty', { name: bot.name })}
          </span>
        </CardRow>
      )}
      {list.map((c) => {
        const ok = c.check?.ok
        const tools = c.check?.tools ?? []
        return (
          <div className="a-row" key={c.id}>
            <Logo preset={c.preset} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{c.name}</b>{' '}
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  · {howOf(t, c)}
                </span>
              </span>
              {c.check && !ok ? (
                <span style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>
                  {t('mcp.failed', { error: c.check.error ?? '' })}
                </span>
              ) : (
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {c.check
                    ? t('mcp.tools', {
                        n: tools.length,
                        list: tools
                          .slice(0, 3)
                          .map((x) => x.name)
                          .join(', '),
                      })
                    : t('mcp.unchecked')}{' '}
                  · {askText[c.ask]}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: !c.enabled
                  ? 'var(--a-muted)'
                  : ok
                    ? 'var(--a-ok)'
                    : c.check
                      ? 'var(--a-danger)'
                      : 'var(--a-muted)',
              }}
            >
              ● {!c.enabled ? t('mcp.off') : ok ? t('mcp.ok') : c.check ? t('mcp.error') : t('mcp.unchecked')}
            </span>
            {c.check && !ok ? (
              <Button size="sm" onClick={() => nav.go('mcp-add', { bot: bot.id, id: c.id })}>
                {t('mcp.edit')}
              </Button>
            ) : (
              <Switch
                checked={c.enabled}
                label={t(c.enabled ? 'mcp.turnOff' : 'mcp.turnOn', { name: c.name, bot: bot.name })}
                onChange={(on) =>
                  void teamAction({ op: 'mcp-update', id: c.id, input: { enabled: on } }).catch(() => {})
                }
              />
            )}
            <RowMenu t={t} c={c} onEdit={() => nav.go('mcp-add', { bot: bot.id, id: c.id })} />
          </div>
        )
      })}
    </Card>
  )
}

function Toolset({ t, bot, team }: { t: T; bot: BotData; team: TeamView }) {
  const dept = bot.kind === 'commander' ? undefined : team.departments.find((d) => d.id === bot.department)
  const policy = bot.kind === 'commander' ? undefined : (dept?.policy ?? NO_DEPARTMENT)
  const [error, setError] = useState<string | null>(null)
  const rows: { key: 'web' | 'files' | 'shell'; text: string; blocked: boolean }[] = [
    { key: 'web', text: t('tools.web'), blocked: policy ? !policy.web : false },
    { key: 'files', text: t('tools.files'), blocked: false },
    { key: 'shell', text: t('tools.shell'), blocked: policy ? !policy.shell : false },
  ]
  const set = (key: string, on: boolean) => {
    setError(null)
    void teamAction({ op: 'update', id: bot.id, patch: { tools: { [key]: on } } }).catch((e: unknown) =>
      setError((e as Error).message),
    )
  }
  return (
    <Card title={t('bot.toolset')}>
      {rows.map((r) => (
        <label className="a-row" key={r.key}>
          <input
            type="checkbox"
            style={check}
            disabled={r.blocked}
            checked={!r.blocked && bot.tools?.[r.key] !== false}
            onChange={(e) => set(r.key, e.target.checked)}
          />
          <span className="grow">{r.text}</span>
          {r.blocked && (
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {dept ? t('tools.blockedBy', { dept: dept.name }) : t('tools.blockedDefault')}
            </span>
          )}
        </label>
      ))}
      <Later t={t} stage={5} row>
        <label className="a-row">
          <input type="checkbox" style={check} disabled defaultChecked />
          {t('tools.brain')}
        </label>
      </Later>
      <Later t={t} stage={4} row>
        <label className="a-row">
          <input type="checkbox" style={check} disabled />
          {t('tools.send')}
        </label>
      </Later>
      <div className="a-row a-muted" style={{ fontSize: 12.5 }}>
        {error ? <span style={{ color: 'var(--a-danger)' }}>{error}</span> : t('tools.note')}
      </div>
    </Card>
  )
}

/** Skill của bot (`@aris/skills`): đang dùng, chờ duyệt, ít dùng, lưu kho; bấm để mở chi tiết. */
function BotSkills({ t, nav, bot }: { t: T; nav: PageProps['nav']; bot: BotData }) {
  const [rows, setRows] = useState<SkillRow[] | null>(null)
  useEffect(() => {
    let live = true
    void fetch(new URL('api/aris/skills', document.baseURI), { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ skills: SkillRow[] }>) : undefined))
      .then((d) => live && d && setRows(d.skills.filter((s) => s.bot === bot.id)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [bot.id])
  const state = (s: SkillRow) =>
    s.proposed
      ? { tone: 'warn' as const, text: t('bot.sk.pending', { v: s.proposed.version }) }
      : s.status === 'archived'
        ? { tone: 'muted' as const, text: t('bot.sk.archived') }
        : s.stale
          ? { tone: 'muted' as const, text: t('bot.sk.rare', { n: s.idleDays }) }
          : { tone: 'ok' as const, text: t('bot.sk.active') }
  return (
    <Card
      title={t('bot.skillCount', { n: rows?.length ?? 0 })}
      subtitle={t('bot.skillHint', { name: bot.name })}
      actions={
        <a className="ap-link" onClick={() => nav.go('skills', { bot: bot.id })}>
          {t('bot.openLibrary')}
        </a>
      }
    >
      {rows?.length === 0 && (
        <CardRow>
          <span className="a-muted" style={{ fontSize: 13 }}>
            {t('bot.skillEmpty', { name: bot.name })}
          </span>
        </CardRow>
      )}
      {rows?.map((s) => {
        const st = state(s)
        return (
          <CardRow key={s.id}>
            <a className="a-mono grow ap-link" onClick={() => nav.go('skill', { id: s.id })}>
              {s.name}
            </a>
            <Tag>v{s.version || s.proposed?.version}</Tag>
            <Pill tone={st.tone}>{st.text}</Pill>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('bot.sk.uses', { n: s.uses })}
            </span>
          </CardRow>
        )
      })}
    </Card>
  )
}

export function SkillsTab({ t, nav, bot }: { t: T; nav: PageProps['nav']; bot: BotData }) {
  const team = useTeam()
  return (
    <>
      <BotSkills t={t} nav={nav} bot={bot} />
      <McpCard t={t} nav={nav} bot={bot} team={team} />
      <Toolset t={t} bot={bot} team={team} />
      <div className="ap-hint a-muted">ⓘ {t('mcp.newSessions', { name: bot.name })}</div>
    </>
  )
}

const PRESETS: Preset[] = ['github', 'lark', 'notion', 'custom']
interface CheckResult {
  ok: boolean
  error?: string
  tools: { name: string; readOnly: boolean }[]
}

/** 2.2c · Hộp "Thêm kết nối cho <bot>" (và sửa kết nối có sẵn khi có `params.id`). */
export function McpDialog({ t, nav, params }: PageProps) {
  const team = useTeam()
  const bot = team.bots.find((b) => b.id === params.bot)
  const prev = team.mcp.find((c) => c.id === params.id)
  const [preset, setPreset] = useState<Preset>(prev?.preset ?? 'github')
  const [name, setName] = useState(prev?.preset === 'custom' ? prev.name : '')
  const [transport, setTransport] = useState<McpData['transport']>(prev?.transport ?? 'stdio')
  const [command, setCommand] = useState(
    prev ? [prev.command, ...(prev.args ?? [])].filter(Boolean).join(' ') : '',
  )
  const [url, setUrl] = useState(prev?.url ?? '')
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [envText, setEnvText] = useState(
    prev?.preset === 'custom' ? prev.secretKeys.map((k) => `${k}=`).join('\n') : '',
  )
  const [ask, setAsk] = useState<Ask>(prev?.ask ?? 'write')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!bot) return null

  function input() {
    if (preset !== 'custom') return { preset, secrets, ask }
    const env: Record<string, string> = {}
    for (const line of envText.split('\n')) {
      const i = line.indexOf('=')
      if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    return transport === 'stdio'
      ? { preset, name, transport, command, secrets: env, ask }
      : { preset, name, transport, url, secrets: env, ask }
  }
  async function test() {
    setBusy('test')
    setError(null)
    setResult(null)
    try {
      const r = await teamAction<{ check: CheckResult }>({
        op: 'mcp-test',
        bot: bot!.id,
        id: prev?.id,
        input: input(),
      })
      setResult(r.check)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function save() {
    setBusy('save')
    setError(null)
    try {
      await teamAction(
        prev
          ? { op: 'mcp-update', id: prev.id, input: input() }
          : { op: 'mcp-add', bot: bot!.id, input: input() },
      )
      nav.close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const secretField = (key: string, label: string, hint?: string) => (
    <label className="a-field" key={key}>
      <span className="l">{label}</span>
      <TextInput
        type="password"
        className="a-mono"
        autoComplete="off"
        placeholder={prev?.secretKeys.includes(key) ? t('mcp.keepSecret') : ''}
        value={secrets[key] ?? ''}
        onChange={(e) => setSecrets({ ...secrets, [key]: e.target.value })}
      />
      {hint && (
        <span className="a-muted" style={{ fontSize: 12 }}>
          {hint}
        </span>
      )}
    </label>
  )
  const asks: [Ask, string, string | null][] = [
    ['write', t('mcp.askWrite'), t('mcp.askWriteHint')],
    ['always', t('mcp.askAlways'), null],
    ['never', t('mcp.askNever'), t('mcp.askNeverHint')],
  ]
  return (
    <Dialog
      open
      width={640}
      title={t(prev ? 'mcp.editTitle' : 'mcp.addTitle', { name: bot.name, conn: prev?.name ?? '' })}
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      <div className="ap-presets" role="group" aria-label={t('mcp.pick')}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="ap-preset"
            aria-pressed={preset === p}
            disabled={!!prev && prev.preset !== p}
            onClick={() => (setPreset(p), setResult(null))}
          >
            <Logo preset={p} />
            <span>
              <b>{t(`mcp.p.${p}`)}</b>
              <br />
              <span className="a-muted" style={{ fontSize: 12 }}>
                {t(`mcp.p.${p}Hint`)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {preset === 'github' &&
        secretField('token', t('mcp.githubToken'), t('mcp.githubTokenHint', { name: bot.name }))}
      {preset === 'lark' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {secretField('APP_ID', 'App ID')}
          {secretField('APP_SECRET', 'App Secret')}
        </div>
      )}
      {preset === 'notion' && secretField('NOTION_TOKEN', t('mcp.notionToken'), t('mcp.notionTokenHint'))}
      {preset === 'custom' && (
        <>
          <label className="a-field">
            <span className="l">{t('mcp.name')}</span>
            <TextInput value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6 }} role="group" aria-label={t('mcp.transport')}>
            {(['stdio', 'streamable-http'] as const).map((x) => (
              <button
                key={x}
                type="button"
                className="ap-preset ap-preset-sm"
                aria-pressed={transport === x}
                onClick={() => setTransport(x)}
              >
                {t(x === 'stdio' ? 'mcp.stdio' : 'mcp.http')}
              </button>
            ))}
          </div>
          {transport === 'stdio' ? (
            <label className="a-field">
              <span className="l">{t('mcp.command')}</span>
              <TextInput
                className="a-mono"
                value={command}
                placeholder="npx -y @modelcontextprotocol/server-everything"
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
          ) : (
            <label className="a-field">
              <span className="l">URL</span>
              <TextInput
                className="a-mono"
                value={url}
                placeholder="https://…/mcp"
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
          )}
          <label className="a-field">
            <span className="l">{t(transport === 'stdio' ? 'mcp.env' : 'mcp.headers')}</span>
            <textarea
              className="a-inp a-mono"
              rows={3}
              value={envText}
              placeholder="API_KEY=…"
              onChange={(e) => setEnvText(e.target.value)}
            />
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('mcp.envHint')}
            </span>
          </label>
        </>
      )}
      <div>
        <div className="a-field">
          <span className="l">{t('mcp.askTitle', { name: bot.name })}</span>
        </div>
        {asks.map(([v, label, hint]) => (
          <label className="ap-radio" key={v}>
            <input type="radio" name="mcp-ask" checked={ask === v} onChange={() => setAsk(v)} />
            <span>
              <b>{label}</b>
              {hint && (
                <>
                  <br />
                  <span className="a-muted">{hint}</span>
                </>
              )}
            </span>
          </label>
        ))}
      </div>
      {busy === 'test' && <div className="ap-hint a-muted">{t('mcp.testing')}</div>}
      {result && (
        <div className={result.ok ? 'ap-hint ap-hint-ok' : 'ap-hint ap-hint-err'}>
          {result.ok ? (
            <span>
              <b>✓ {t('mcp.testOk')}</b> · {t('mcp.testTools', { n: result.tools.length })}{' '}
              <span className="a-mono" style={{ fontSize: 12 }}>
                {result.tools
                  .slice(0, 6)
                  .map((x) => x.name)
                  .join(', ')}
              </span>
              {result.tools.length > 6 && <span className="a-muted"> +{result.tools.length - 6}</span>}
            </span>
          ) : (
            <span>
              <b>{t('mcp.testFail')}</b> {result.error}
            </span>
          )}
        </div>
      )}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <Button size="lg" disabled={!!busy} onClick={() => void test()} style={{ marginRight: 'auto' }}>
          {t('mcp.test')}
        </Button>
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg" disabled={!!busy} onClick={() => void save()}>
          {busy === 'save' ? t('mcp.saving') : t(prev ? 'mcp.save' : 'mcp.addFor', { name: bot.name })}
        </Button>
      </div>
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        ⓘ {t('mcp.presetNote')}
      </div>
    </Dialog>
  )
}
