/**
 * 2.6 · Phòng ban (quyết định 12, bản vẽ `PhongBan.dc.html`): thành viên và trưởng nhóm, chuyển bot
 * giữa các phòng, việc lớn phòng đang nhận, chính sách chung (model mặc định, ngân sách mỗi ngày,
 * quyền) áp cho mọi bot của phòng; tạo, đổi tên, xoá phòng. Dữ liệu thật từ `@aris/bots`, chi phí
 * hôm nay theo phòng từ sổ chi phí của `@aris/providers`.
 */
import {
  Button,
  Card,
  CardRow,
  CrownIcon,
  Dialog,
  IconButton,
  Mascot,
  Menu,
  MenuItem,
  Pill,
  Select,
  Switch,
  Tag,
  TextInput,
  teamAction,
  useDismiss,
  useProjects,
  useTeam,
  type DepartmentData,
  type PolicyData,
  type TeamView,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { Initial, botOption, departmentOptions, modelOptions } from '../options.js'
import { Col } from '../ui.js'
import { DEFAULT_POLICY, budgetText, parseBudget, samePolicy } from './department-model.js'

type T = PageProps['t']
const pairKey = (provider: string, model: string) => `${provider}\u0000${model}`

/** "Phòng Vận hành"; tên đã bắt đầu bằng "Phòng" thì giữ nguyên. */
const deptLabel = (t: T, name: string) => (/^phòng\s/i.test(name) ? name : t('dep.title', { name }))

function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      return await teamAction(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run, setError }
}

interface JobView {
  id: string
  department: string
  title: string
  session: string
  workspace?: string
  status: 'running' | 'done' | 'failed'
  createdAt: string
  progress: { done: number; total: number }
}

/** Việc lớn của phòng (`@aris/commander`): Aris giao cả phòng, trưởng nhóm chia cho thành viên. */
function useJobs(): JobView[] | null {
  const [jobs, setJobs] = useState<JobView[] | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(new URL('api/aris/commander?jobs=1', document.baseURI), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ jobs: JobView[] }>) : undefined))
        .then((d) => d && live && setJobs(d.jobs))
        .catch(() => {})
    void load()
    const timer = setInterval(load, 10_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  return jobs
}

function Jobs({ t, nav, dep }: { t: T; nav: PageProps['nav']; dep: DepartmentData }) {
  const jobs = useJobs()?.filter((j) => j.department === dep.id)
  const projects = useProjects()
  const projectName = (ws?: string) => {
    const p = projects?.find((x) => x.workspace === ws)
    return p ? (p.project?.name ?? p.title) : t('dep.privateChat')
  }
  return (
    <Card title={t('dep.work')} subtitle={t('dep.workHint')}>
      {jobs?.length === 0 && <CardRow label={<span className="a-muted">{t('dep.noWork')}</span>} />}
      {jobs?.map((j) => (
        <CardRow key={j.id}>
          <span className="grow" style={{ minWidth: 160 }}>
            <b>{j.title}</b>
            <div className="a-muted" style={{ fontSize: 12.5 }}>
              {[projectName(j.workspace), j.progress.total > 0 ? t('dep.jobProgress', j.progress) : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </span>
          <Pill tone={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'danger' : 'accent'}>
            {t(`dep.job.${j.status}`)}
          </Pill>
          <Button size="sm" variant="ghost" onClick={() => nav.openSession(j.session)}>
            {t('dep.openJob')}
          </Button>
        </CardRow>
      ))}
    </Card>
  )
}

function Members({
  t,
  nav,
  team,
  dep,
}: {
  t: T
  nav: PageProps['nav']
  team: TeamView
  dep: DepartmentData
}) {
  const { run, error } = useAction()
  const members = team.groups.find((g) => g.id === dep.id)?.members ?? []
  return (
    <Card title={t('dep.members')} subtitle={t('dep.count', { n: members.length })}>
      {members.length === 0 && <CardRow label={<span className="a-muted">{t('dep.noMembers')}</span>} />}
      {members.map((m) => (
        <CardRow key={m.id}>
          <span className="ap-dep-member">
            <span className="who">
              <Mascot id={m.mascot ?? m.id} size={28} />
              <span style={{ minWidth: 0 }}>
                <b>{m.name}</b>
                <div className="a-muted" style={{ fontSize: 12.5 }}>
                  {m.role}
                </div>
              </span>
            </span>
            <span className="acts">
              {m.id === dep.lead ? (
                <Pill tone="accent">
                  <span className="ic" aria-hidden>
                    <CrownIcon size={12} />
                  </span>
                  {t('dep.lead')}
                </Pill>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run({ op: 'department', department: { id: dep.id, name: dep.name, lead: m.id } })
                  }
                >
                  {t('dep.makeLead')}
                </Button>
              )}
              <Select
                variant="compact"
                label={t('dep.moveTo', { name: m.name })}
                value={dep.id}
                onChange={(v) => void run({ op: 'move', id: m.id, department: v || null })}
                options={[
                  ...departmentOptions(team, undefined, (n) => t('bot.depCount', { n })),
                  { id: '', name: t('dep.unassigned'), icon: <Initial text="–" /> },
                ]}
              />
              <Button size="sm" variant="ghost" onClick={() => nav.go('bot', { id: m.id })}>
                {t('dep.profile')}
              </Button>
            </span>
          </span>
        </CardRow>
      ))}
      {error && <CardRow label={<span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>} />}
    </Card>
  )
}

/** Chính sách chung: sửa tại chỗ, dải "chưa lưu" ở đầu trang. */
function Policy({
  t,
  team,
  dep,
  draft,
  setDraft,
  budget,
  setBudget,
}: {
  t: T
  team: TeamView
  dep: DepartmentData
  draft: PolicyData
  setDraft: (p: PolicyData) => void
  budget: string
  setBudget: (s: string) => void
}) {
  const current = draft.model ? pairKey(draft.model.provider, draft.model.model) : ''
  const spent = team.spend[dep.id] ?? 0
  const limit = parseBudget(budget)
  const pct = limit ? Math.min(100, (spent / limit) * 100) : 0
  const over = limit !== undefined && limit !== null && spent >= limit
  // Bot trong phòng đặt model riêng thì giữ model riêng.
  const own = team.bots.filter((b) => b.department === dep.id && b.kind === 'member' && b.model)
  const perm = (key: 'web' | 'write' | 'shell', title: string, hint?: string) => (
    <CardRow>
      <span className="grow" style={{ minWidth: 200 }}>
        {title}
        {hint && (
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {hint}
          </div>
        )}
      </span>
      <Switch checked={draft[key]} label={title} onChange={(v) => setDraft({ ...draft, [key]: v })} />
    </CardRow>
  )
  return (
    <Card title={t('dep.policy')} subtitle={t('dep.policyHint')}>
      <CardRow>
        <span className="grow" style={{ minWidth: 200 }}>
          <b>{t('dep.model')}</b>
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {t('dep.modelHint')}
          </div>
          {own.map((b) => (
            <div key={b.id} className="a-muted" style={{ fontSize: 12 }}>
              {t('dep.ownModel', { name: b.name, model: `${b.model!.provider} · ${b.model!.model}` })}
            </div>
          ))}
        </span>
        <Select
          label={t('dep.model')}
          value={current}
          onChange={(v) => {
            const [provider, model] = v.split('\u0000') as [string, string]
            const next = { ...draft }
            if (v) next.model = { provider, model }
            else delete next.model
            setDraft(next)
          }}
          options={modelOptions(team.catalog, { name: t('dep.modelDefault') }, draft.model)}
          searchPlaceholder={t('sel.search')}
          emptyLabel={t('sel.empty')}
          style={{ maxWidth: 320 }}
        />
      </CardRow>
      <CardRow>
        <span className="grow" style={{ minWidth: 200 }}>
          <b>{t('dep.budget')}</b>
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {t('dep.budgetHint')}
          </div>
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <TextInput
            value={budget}
            inputMode="decimal"
            placeholder={t('dep.noLimit')}
            aria-label={t('dep.budgetUsd')}
            onChange={(e) => setBudget(e.target.value)}
            style={{ width: 130, textAlign: 'right' }}
          />
          <span className="a-muted" style={{ fontSize: 13 }}>
            USD
          </span>
        </label>
      </CardRow>
      <CardRow>
        <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {limit ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ap-track grow" aria-hidden>
                <span style={{ width: `${pct}%`, background: over ? 'var(--a-danger)' : 'var(--a-ok)' }} />
              </span>
              <span
                style={{
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  color: over ? 'var(--a-danger)' : 'var(--a-muted)',
                }}
              >
                {t(over ? 'dep.spentOver' : 'dep.spent', {
                  spent: budgetText(spent),
                  limit: budgetText(limit),
                })}
              </span>
            </span>
          ) : (
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('dep.spentNoLimit', { spent: budgetText(spent) })}
            </span>
          )}
          {limit === null && (
            <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{t('dep.budgetBad')}</span>
          )}
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('dep.onBudget')}
            </span>
            {(['stop', 'warn'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="ap-chip ap-pick"
                aria-pressed={draft.onBudget === k}
                onClick={() => setDraft({ ...draft, onBudget: k })}
              >
                {t(`dep.onBudget.${k}`)}
              </button>
            ))}
          </span>
        </span>
      </CardRow>
      <div className="ap-pl-grp">{t('dep.perms')}</div>
      <CardRow>
        <span className="grow" style={{ minWidth: 200 }}>
          {t('dep.perm.read')}
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {t('dep.perm.readHint')}
          </div>
        </span>
        <Tag>{t('dep.always')}</Tag>
      </CardRow>
      {perm('web', t('dep.perm.web'))}
      {perm('write', t('dep.perm.write'), t('dep.perm.writeHint'))}
      {perm('shell', t('dep.perm.shell'), t('dep.perm.shellHint'))}
      <CardRow>
        <span className="grow" style={{ minWidth: 200 }}>
          {t('dep.perm.ask')}
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {t('dep.perm.askHint')}
          </div>
        </span>
        <Pill tone="danger">{t('dep.denied')}</Pill>
      </CardRow>
      <CardRow
        label={
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('dep.soon')}
          </span>
        }
      >
        <Tag>{t('dep.soonTag')}</Tag>
      </CardRow>
    </Card>
  )
}

/** Hộp tạo phòng ban (dùng cả ở tab Phòng ban của Văn phòng). */
export function CreateDialog({
  t,
  team,
  onClose,
  onCreated,
}: {
  t: T
  team: TeamView
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { run, error, busy } = useAction()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [lead, setLead] = useState('')
  const [copy, setCopy] = useState('')
  const bots = team.bots.filter((b) => b.kind === 'member')
  const depName = (id?: string) => team.departments.find((d) => d.id === id)?.name ?? t('dep.unassigned')
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    if (!next.includes(lead)) setLead(next[0] ?? '')
  }
  const create = async () => {
    const out = await run({
      op: 'department-create',
      department: {
        name,
        bots: picked,
        ...(lead ? { lead } : {}),
        ...(copy ? { copyPolicyFrom: copy } : {}),
      },
    })
    const made = (out as { departments?: DepartmentData[] } | undefined)?.departments?.find(
      (d) => d.name.toLowerCase() === name.trim().toLowerCase(),
    )
    if (made) onCreated(made.id)
  }
  return (
    <Dialog
      open
      width={540}
      title={t('dep.new')}
      description={t('dep.newHint')}
      closeLabel={t('cb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('dep.cancel')}</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            {t('dep.create')}
          </Button>
        </>
      }
    >
      <label className="a-field">
        <span className="l">{t('dep.name')}</span>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dep.namePh')} />
      </label>
      <div className="a-field">
        <span className="l">{t('dep.pickBots')}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bots.map((b) => (
            <button
              key={b.id}
              type="button"
              className="ap-chip ap-pick"
              aria-pressed={picked.includes(b.id)}
              onClick={() => toggle(b.id)}
            >
              <Mascot id={b.mascot} size={16} />
              {b.name} · {depName(b.department)}
            </button>
          ))}
        </div>
        <span className="a-muted" style={{ fontSize: 12 }}>
          {t('dep.pickHint')}
        </span>
      </div>
      <div className="a-field">
        <span className="l">{t('dep.leadPick')}</span>
        <Select
          label={t('dep.leadPick')}
          value={lead}
          onChange={setLead}
          disabled={!picked.length}
          placeholder={t('dep.leadNone')}
          options={picked.flatMap((id) => {
            const b = bots.find((x) => x.id === id)
            return b ? [botOption(b)] : []
          })}
        />
      </div>
      <div className="a-field">
        <span className="l">{t('dep.startPolicy')}</span>
        <Select
          label={t('dep.startPolicy')}
          value={copy}
          onChange={setCopy}
          options={[
            { id: '', name: t('dep.startDefault'), icon: <Initial text="–" /> },
            ...team.departments.map((d) => ({
              id: d.id,
              name: t('dep.copyFrom', { name: d.name }),
              icon: <Initial text={d.name} />,
            })),
          ]}
        />
      </div>
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
    </Dialog>
  )
}

function RenameDialog({ t, dep, onClose }: { t: T; dep: DepartmentData; onClose: () => void }) {
  const { run, error, busy } = useAction()
  const [name, setName] = useState(dep.name)
  const [about, setAbout] = useState(dep.about ?? '')
  const save = async () => {
    if (await run({ op: 'department', department: { id: dep.id, name, about: about || null } })) onClose()
  }
  return (
    <Dialog
      open
      width={480}
      title={t('dep.rename')}
      closeLabel={t('cb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('dep.cancel')}</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
            {t('dep.saveName')}
          </Button>
        </>
      }
    >
      <label className="a-field">
        <span className="l">{t('dep.name')}</span>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="a-field">
        <span className="l">{t('dep.about')}</span>
        <TextInput value={about} onChange={(e) => setAbout(e.target.value)} placeholder={t('dep.aboutPh')} />
      </label>
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
    </Dialog>
  )
}

function DeleteDialog({
  t,
  dep,
  names,
  onClose,
  onDeleted,
}: {
  t: T
  dep: DepartmentData
  names: string[]
  onClose: () => void
  onDeleted: () => void
}) {
  const { run, error, busy } = useAction()
  return (
    <Dialog
      open
      width={460}
      title={t('dep.deleteTitle', { name: deptLabel(t, dep.name) })}
      closeLabel={t('cb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('dep.cancel')}</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void run({ op: 'department-delete', id: dep.id }).then((r) => r && onDeleted())}
          >
            {t('dep.delete')}
          </Button>
        </>
      }
    >
      <p className="a-muted" style={{ margin: 0, fontSize: 13 }}>
        {names.length ? t('dep.deleteHint', { names: names.join(', ') }) : t('dep.deleteHintEmpty')}
      </p>
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
    </Dialog>
  )
}

function MoreMenu({ t, onRename, onDelete }: { t: T; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  return (
    <span className="a-pop" ref={root}>
      <IconButton
        label={t('dep.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx={5} cy={12} r={1.8} />
          <circle cx={12} cy={12} r={1.8} />
          <circle cx={19} cy={12} r={1.8} />
        </svg>
      </IconButton>
      {open && (
        <Menu label={t('dep.more')} align="end" width={220}>
          <MenuItem
            onSelect={() => {
              setOpen(false)
              onRename()
            }}
          >
            {t('dep.rename')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <span style={{ color: 'var(--a-danger)' }}>{t('dep.deleteMenu')}</span>
          </MenuItem>
        </Menu>
      )}
    </span>
  )
}

export function Department({ t, nav, params }: PageProps) {
  const team = useTeam()
  const dep = team.departments.find((d) => d.id === params.id) ?? team.departments[0]
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(params.new ? 'create' : null)
  // "Phòng ban mới" từ thanh bên: mở thẳng hộp tạo, kể cả khi trang đã mở sẵn.
  useEffect(() => {
    if (params.new) setDialog('create')
  }, [params.new])
  const saved = dep?.policy ?? DEFAULT_POLICY
  const [draft, setDraft] = useState<PolicyData>(saved)
  const [budget, setBudget] = useState(budgetText(saved.budgetUsd))
  const { run, error, busy, setError } = useAction()
  // Đổi phòng hoặc chính sách đã lưu thay đổi: bắt đầu lại từ bản đã lưu.
  const savedKey = useMemo(() => JSON.stringify([dep?.id, saved]), [dep?.id, saved])
  useEffect(() => {
    setDraft(saved)
    setBudget(budgetText(saved.budgetUsd))
    setError(null)
  }, [savedKey])

  if (!dep)
    return (
      <main className="a-page">
        <header className="a-page-head">
          <div className="grow">
            <h1 className="a-page-title">{t('dep.pageTitle')}</h1>
          </div>
          <div className="a-page-actions">
            <Button onClick={() => setDialog('create')}>{t('dep.newBtn')}</Button>
          </div>
        </header>
        <div className="a-page-body a-muted">{t(team.ready ? 'dep.none' : 'dep.loading')}</div>
        {dialog === 'create' && (
          <CreateDialog
            t={t}
            team={team}
            onClose={() => setDialog(null)}
            onCreated={(id) => {
              setDialog(null)
              nav.go('department', { id })
            }}
          />
        )}
      </main>
    )

  const members = team.groups.find((g) => g.id === dep.id)?.members ?? []
  const lead = members.find((m) => m.id === dep.lead)
  const parsed = parseBudget(budget)
  const next: PolicyData = { ...draft }
  if (parsed === undefined) delete next.budgetUsd
  else if (parsed !== null) next.budgetUsd = parsed
  const dirty = !samePolicy(next, saved)
  const save = () =>
    void run({
      op: 'department',
      department: {
        id: dep.id,
        name: dep.name,
        policy: { ...next, model: next.model ?? null, budgetUsd: next.budgetUsd ?? null },
      },
    })
  const reset = () => {
    setDraft(saved)
    setBudget(budgetText(saved.budgetUsd))
    setError(null)
  }

  return (
    <main className="a-page">
      <header className="a-page-head">
        <div className="grow">
          <h1 className="a-page-title">{deptLabel(t, dep.name)}</h1>
          <span className="a-page-sub">
            {[
              t('dep.subtitleCount', { n: members.length }),
              lead && t('dep.subtitleLead', { lead: lead.name }),
              dep.about,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="a-page-actions">
          <Button onClick={() => setDialog('create')}>{t('dep.newBtn')}</Button>
          <Button onClick={() => nav.go('create-bot')}>{t('dep.addBot')}</Button>
          <MoreMenu t={t} onRename={() => setDialog('rename')} onDelete={() => setDialog('delete')} />
        </div>
      </header>
      <div className="a-page-body">
        {(dirty || error) && (
          <div
            className="ap-pl-banner"
            style={{
              borderColor: error ? 'var(--a-danger)' : 'var(--a-accent)',
              background: error ? 'var(--a-dangerSoft)' : 'var(--a-accentSoft)',
              marginBottom: 14,
            }}
          >
            <span className="grow" style={{ minWidth: 200 }}>
              {error ?? t('dep.dirty')}
            </span>
            <Button size="sm" variant="ghost" onClick={reset}>
              {t('dep.reset')}
            </Button>
            <Button size="sm" variant="primary" disabled={busy || parsed === null || !dirty} onClick={save}>
              {t('dep.save')}
            </Button>
          </div>
        )}
        <div className="ap-cols">
          <Col basis={360}>
            <Members t={t} nav={nav} team={team} dep={dep} />
            <Jobs t={t} nav={nav} dep={dep} />
          </Col>
          <Col grow={1.4} basis={420}>
            <Policy
              t={t}
              team={team}
              dep={dep}
              draft={draft}
              setDraft={setDraft}
              budget={budget}
              setBudget={setBudget}
            />
          </Col>
        </div>
      </div>
      {dialog === 'create' && (
        <CreateDialog
          t={t}
          team={team}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null)
            nav.go('department', { id })
          }}
        />
      )}
      {dialog === 'rename' && <RenameDialog t={t} dep={dep} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteDialog
          t={t}
          dep={dep}
          names={members.map((m) => m.name)}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            nav.go('department', {})
          }}
        />
      )}
    </main>
  )
}
