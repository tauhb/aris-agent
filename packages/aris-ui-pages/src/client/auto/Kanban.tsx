/**
 * 4.3 · Kanban (bản vẽ `Kanban.dc.html`): mỗi dự án một bảng (quyết định 11), chọn ở tiêu đề. Thẻ
 * thật từ `@aris/projects`: thẻ của đội (Aris chia, giao cho bot) và thẻ người dùng tạo chờ chia.
 * Cột: Chờ chia việc, Sẵn sàng, Đang làm, Chờ duyệt, Xong. Chia việc tự động (Aris chia thẻ chờ ở
 * lượt sau) hoặc thủ công (người dùng bấm "Giao ngay").
 */
import { getMascot } from '@aris/ui-kit'
import {
  Button,
  Dialog,
  Mascot,
  PageShell,
  PROJECTS_CHANGED,
  Segmented,
  Select,
  TextInput,
  boardAction,
  projectAction,
  useBoard,
  useProjects,
  useTeam,
  type BoardCard,
  type ProjectEntry,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import { Initial, botOptions } from '../options.js'
import type { PageProps } from '../page.js'

type T = PageProps['t']

/** Cột theo bản vẽ; khoá chữ giữ tên cũ (`triage`, `review`). */
const COLUMNS: { id: BoardCard['column']; label: string; tone: string }[] = [
  { id: 'unassigned', label: 'kb.col.triage', tone: 'var(--a-muted)' },
  { id: 'ready', label: 'kb.col.ready', tone: '#2F7BE5' },
  { id: 'doing', label: 'kb.col.doing', tone: '#E8833A' },
  { id: 'waiting', label: 'kb.col.review', tone: '#C9A227' },
  { id: 'done', label: 'kb.col.done', tone: 'var(--a-ok)' },
]

/** Chọn bảng của dự án: chữ cái đầu, tên, số phiên (bộ chọn dùng chung). */
function BoardPicker({
  t,
  projects,
  current,
  onPick,
}: {
  t: T
  projects: ProjectEntry[]
  current: ProjectEntry
  onPick: (id: string) => void
}) {
  return (
    <Select
      variant="compact"
      align="start"
      className="ap-title-sel"
      label={t('kb.pick')}
      value={current.workspace}
      onChange={onPick}
      options={projects.map((p) => ({
        id: p.workspace,
        name: p.project?.name ?? p.title,
        note: t('kb.sessions', { n: p.sessions }),
        icon: <Initial text={p.project?.name ?? p.title} />,
      }))}
    />
  )
}

/** "Để Aris chọn", rồi bot trong dự án, rồi bot ngoài dự án. */
function botChoices(t: T, team: TeamView, members: readonly string[]) {
  const by = (inside: boolean) =>
    botOptions(team, {
      filter: (b) => members.includes(b.id) === inside,
      group: () => t(inside ? 'kb.inside' : 'kb.outsideGroup'),
    })
  return [
    { id: '', name: t('kb.arisPicks'), note: t('kb.arisPicksNote'), mascot: team.commander.mascot ?? 'aris' },
    ...by(true),
    ...by(false),
  ]
}

function Card({
  t,
  c,
  team,
  members,
  nav,
  onError,
}: {
  t: T
  c: BoardCard
  team: TeamView
  members: readonly string[]
  nav: PageProps['nav']
  onError: (e: string | null) => void
}) {
  const bot = team.bots.find((b) => b.id === c.bot)
  const [pick, setPick] = useState(c.bot ?? '')
  const [busy, setBusy] = useState(false)
  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    onError(null)
    try {
      return await boardAction(body)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  const status =
    c.kind === 'job'
      ? c.failed
        ? t('kb.foot.failed')
        : t(`kb.foot.${c.column}`)
      : c.kind === 'draft'
        ? t('kb.foot.draft')
        : c.failed
          ? t('kb.foot.driverFailed')
          : c.stuck
            ? t('kb.foot.stuck')
            : c.column === 'unassigned'
              ? t(c.planned ? 'kb.foot.planned' : 'kb.foot.unassigned')
              : t(`kb.foot.${c.column}`)
  const color = bot ? (getMascot(bot.mascot)?.color ?? 'var(--a-accent)') : 'var(--a-line)'
  const type =
    c.kind === 'job' ? (
      <span className="ap-ktype job">{t('kb.type.job', { department: c.department ?? '' })}</span>
    ) : c.kind === 'draft' ? (
      <span className="ap-ktype draft">{t('kb.type.draft')}</span>
    ) : (
      <span className="ap-ktype team">{t('kb.type.team')}</span>
    )
  const pct = c.progress && c.progress.total > 0 ? (c.progress.done / c.progress.total) * 100 : null
  const body = (
    <>
      <div className="top">
        {type}
        {c.column === 'done' && (
          <span className="ap-kdone" aria-label={t('kb.foot.done')}>
            ✓
          </span>
        )}
        {c.kind === 'task' && <span className="ap-kid">{c.id}</span>}
      </div>
      <div className="tt">{c.title}</div>
      {pct !== null && (
        <div className="ap-kprog">
          <span className="ap-gauge">
            <i style={{ width: `${pct}%`, background: c.failed ? 'var(--a-danger)' : color }} />
          </span>
          <span className="a-muted">{t('kb.progress', c.progress!)}</span>
        </div>
      )}
      {c.waitingFor.length > 0 && c.column === 'unassigned' && (
        <div className="ap-kwait">
          {t('kb.waitFor', { titles: c.waitingFor.map((w) => w.title).join(', ') })}
        </div>
      )}
      <div className="ft">
        {bot && <Mascot id={bot.mascot} size={18} />}
        {bot && <b>{bot.name}</b>}
        <span className={c.failed || c.stuck ? 'st bad' : 'st'}>{status}</span>
        {c.session && (
          <button
            type="button"
            className="ap-kopen"
            title={t('kb.openBot')}
            onClick={() => nav.openSession(c.session!)}
          >
            {t('kb.openSession')}
          </button>
        )}
      </div>
    </>
  )
  const cls = `ap-kc kind-${c.kind}${c.column === 'done' ? ' is-done' : ''}`
  if (c.kind !== 'draft')
    return (
      <div className={cls} style={{ ['--bot' as string]: color }}>
        {body}
      </div>
    )
  return (
    <div className={cls} style={{ ['--bot' as string]: color }}>
      {body}
      {c.description && (
        <span className="a-muted" style={{ fontSize: 12 }}>
          {c.description}
        </span>
      )}
      <div className="ap-kc-acts">
        <Select
          label={t('kb.assignTo', { title: c.title })}
          value={pick}
          options={botChoices(t, team, members)}
          onChange={setPick}
          searchPlaceholder={t('sel.search')}
          emptyLabel={t('sel.empty')}
          style={{ flex: 1, minWidth: 160 }}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => void act({ op: 'card-dispatch', id: c.id, ...(pick ? { bot: pick } : {}) })}
        >
          {t('kb.dispatch')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void act({ op: 'card-delete', id: c.id })}
        >
          {t('kb.delete')}
        </Button>
      </div>
    </div>
  )
}

function NewCard({
  t,
  workspace,
  team,
  members,
  onClose,
}: {
  t: T
  workspace: string
  team: TeamView
  members: readonly string[]
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [bot, setBot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await boardAction({
        op: 'card-create',
        workspace,
        card: { title, description, ...(bot ? { bot } : {}) },
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      width={520}
      title={t('kb.newTitle')}
      description={t('kb.newHint')}
      closeLabel={t('kb.close')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('kb.cancel')}</Button>
          <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void create()}>
            {t('kb.create')}
          </Button>
        </>
      }
    >
      <label className="a-field">
        <span className="l">{t('kb.cardTitle')}</span>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('kb.cardTitlePh')}
        />
      </label>
      <label className="a-field">
        <span className="l">{t('kb.cardBody')}</span>
        <textarea
          className="a-inp"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
        />
      </label>
      <div className="a-field">
        <span className="l">{t('kb.cardBot')}</span>
        <Select
          label={t('kb.cardBot')}
          value={bot}
          options={botChoices(t, team, members)}
          onChange={setBot}
          searchPlaceholder={t('sel.search')}
          emptyLabel={t('sel.empty')}
        />
      </div>
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
    </Dialog>
  )
}

interface ProjectPageOpt {
  path: string
  title: string
  space: 'ca-nhan' | 'cong-ty'
  linkedTo: string | null
}

const brainApi = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)

/**
 * Nút trang bộ não ở đầu bảng (bản vẽ 4.3b): đã nối thì mở trang; chưa nối thì hộp chọn tạo trang mới từ
 * mẫu Dự án hay nối trang có sẵn.
 */
function BrainLink({
  t,
  nav,
  workspace,
  page,
}: {
  t: T
  nav: PageProps['nav']
  workspace: string
  page: string | undefined
}) {
  const [pages, setPages] = useState<ProjectPageOpt[] | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'new' | 'old'>('new')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void fetch(brainApi('?projectPages=1'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { pages: ProjectPageOpt[] } | null) => live && setPages(j?.pages ?? []))
      .catch(() => live && setPages([]))
    return () => {
      live = false
    }
  }, [page, open])
  if (page) {
    const title = pages?.find((p) => p.path === page)?.title ?? page.split('/').pop()!.replace(/\.md$/, '')
    return (
      <Button
        size="sm"
        className="ap-kbrain"
        title={page}
        onClick={() => nav.go('brain', { view: 'notes', space: page.split('/')[0] ?? 'ca-nhan', path: page })}
      >
        📄 {t('kb.brainPage', { title })}
      </Button>
    )
  }
  const free = (pages ?? []).filter((p) => !p.linkedTo)
  const link = async () => {
    setBusy(true)
    setError(null)
    const r = await fetch(brainApi(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'project-link',
        workspace,
        ...(mode === 'old' ? { path: pick || free[0]?.path } : {}),
      }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!r?.ok) return setError(j?.error ?? 'HTTP error')
    setOpen(false)
    window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED))
  }
  return (
    <>
      <Button size="sm" className="ap-kbrain empty" onClick={() => setOpen(true)}>
        📄 {t('kb.brainLink')}
      </Button>
      <Dialog
        open={open}
        title={t('kb.brainTitle')}
        description={t('kb.brainHint')}
        onClose={() => setOpen(false)}
        closeLabel={t('kb.cancel')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('kb.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || (mode === 'old' && !free.length)}
              onClick={() => void link()}
            >
              {t('kb.brainDo')}
            </Button>
          </>
        }
      >
        <div className="ap-kbopts" role="radiogroup" aria-label={t('kb.brainTitle')}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'new'}
            className={mode === 'new' ? 'on' : ''}
            onClick={() => setMode('new')}
          >
            <span aria-hidden="true">＋</span>
            <span>
              <b>{t('kb.brainNew')}</b>
              <small>{t('kb.brainNewHint')}</small>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'old'}
            className={mode === 'old' ? 'on' : ''}
            onClick={() => setMode('old')}
          >
            <span aria-hidden="true">⇢</span>
            <span>
              <b>{t('kb.brainOld')}</b>
              <small>{free.length ? t('kb.brainOldHint', { n: free.length }) : t('kb.brainNone')}</small>
            </span>
          </button>
        </div>
        {mode === 'old' && free.length > 0 && (
          <Select
            label={t('kb.brainOld')}
            value={pick || free[0]!.path}
            options={free.map((p) => ({
              id: p.path,
              name: p.title,
              note: t(p.space === 'cong-ty' ? 'kb.spaceCo' : 'kb.spaceMe'),
            }))}
            onChange={setPick}
            searchPlaceholder={t('sel.search')}
            emptyLabel={t('sel.empty')}
          />
        )}
        {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
      </Dialog>
    </>
  )
}

export function Kanban({ t, nav, params }: PageProps) {
  const team = useTeam()
  const projects = useProjects()
  const current = projects?.find((p) => p.workspace === params.project) ?? projects?.[0]
  const board = useBoard(current?.workspace)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!projects || !current)
    return (
      <PageShell title={t('kb.title')}>
        <div className="a-muted">{projects ? t('kb.noProjects') : t('kb.loading')}</div>
        {projects && (
          <div>
            <Button variant="primary" onClick={() => nav.go('create-project')}>
              {t('kb.newProject')}
            </Button>
          </div>
        )}
      </PageShell>
    )
  const members = current.project?.members ?? []
  const cards = board?.cards ?? []
  const split = board?.split ?? current.project?.split ?? 'auto'
  const driver = board?.driver ?? current.project?.driver ?? false
  const setDriver = (on: boolean) =>
    void projectAction({ op: 'update', workspace: current.workspace, patch: { driver: on } }).catch(
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  const setSplit = (v: 'auto' | 'manual') =>
    void projectAction({ op: 'update', workspace: current.workspace, patch: { split: v } }).catch(
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  return (
    <PageShell
      title={
        <BoardPicker
          t={t}
          projects={projects}
          current={current}
          onPick={(id) => nav.go('kanban', { project: id })}
        />
      }
      subtitle={t('kb.meta', {
        n: cards.length,
        doing: cards.filter((c) => c.column === 'doing').length,
        done: cards.filter((c) => c.column === 'done').length,
      })}
      actions={
        <>
          <BrainLink
            t={t}
            nav={nav}
            workspace={current.workspace}
            page={board?.page ?? current.project?.page ?? undefined}
          />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span className="a-muted">{t('kb.split')}</span>
            <Segmented
              label={t('kb.split')}
              value={split}
              onChange={setSplit}
              options={[
                { value: 'auto', label: t('kb.auto') },
                { value: 'manual', label: t('kb.manual') },
              ]}
            />
          </span>
          <Button
            size="sm"
            aria-pressed={driver}
            title={t('kb.driverTip')}
            onClick={() => setDriver(!driver)}
            style={driver ? { borderColor: 'var(--a-ok)', color: 'var(--a-ok)', fontWeight: 600 } : undefined}
          >
            {t(driver ? 'kb.driverOn' : 'kb.driverOff')}
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('kb.new')}
          </Button>
        </>
      }
    >
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        {t(split === 'auto' ? 'kb.autoHint' : 'kb.manualHint')}
        {driver && ` ${t('kb.driverHint')}`}
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      {!board && <div className="a-muted">{t('kb.loading')}</div>}
      {board && (
        <div className="ap-board">
          {COLUMNS.map((col) => {
            const list = cards.filter((c) => c.column === col.id)
            return (
              <section className="ap-kcol" key={col.id} aria-label={t(col.label)}>
                <div className="ch">
                  <span className="ap-kdot" style={{ background: col.tone }} />
                  <span className="nm">{t(col.label)}</span>
                  <span className="n">{list.length}</span>
                </div>
                {list.map((c) => (
                  <Card key={c.id} t={t} c={c} team={team} members={members} nav={nav} onError={setError} />
                ))}
                {col.id === 'unassigned' && cards.length === 0 ? (
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('kb.empty')}
                  </span>
                ) : (
                  list.length === 0 && <span className="ap-kempty">{t('kb.colEmpty')}</span>
                )}
              </section>
            )
          })}
        </div>
      )}
      {adding && (
        <NewCard
          t={t}
          workspace={current.workspace}
          team={team}
          members={members}
          onClose={() => setAdding(false)}
        />
      )}
    </PageShell>
  )
}
