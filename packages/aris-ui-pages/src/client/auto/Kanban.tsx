/**
 * 4.3 · Kanban (bản vẽ `Kanban.dc.html`): mỗi dự án một bảng (quyết định 11), chọn ở tiêu đề. Thẻ
 * thật từ `@aris/projects`: thẻ của đội (Aris chia, giao cho bot) và thẻ người dùng tạo chờ chia.
 * Cột: Chờ chia việc, Sẵn sàng, Đang làm, Chờ duyệt, Xong. Chia việc tự động (Aris chia thẻ chờ ở
 * lượt sau) hoặc thủ công (người dùng bấm "Giao ngay").
 */
import {
  Button,
  ChevronDownIcon,
  Dialog,
  Mascot,
  Menu,
  MenuItem,
  PageShell,
  Segmented,
  TextInput,
  boardAction,
  branchColor,
  projectAction,
  useBoard,
  useDismiss,
  useProjects,
  useTeam,
  type BoardCard,
  type ProjectEntry,
  type TeamView,
} from '@aris/ui-kit/react'
import { useCallback, useRef, useState } from 'react'
import type { PageProps } from '../page.js'

type T = PageProps['t']

/** Cột theo bản vẽ; khoá chữ giữ tên cũ (`triage`, `review`). */
const COLUMNS: { id: BoardCard['column']; label: string }[] = [
  { id: 'unassigned', label: 'kb.col.triage' },
  { id: 'ready', label: 'kb.col.ready' },
  { id: 'doing', label: 'kb.col.doing' },
  { id: 'waiting', label: 'kb.col.review' },
  { id: 'done', label: 'kb.col.done' },
]

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
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  return (
    <span className="a-pop" ref={root}>
      <button
        type="button"
        className="ap-picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('kb.pick')}
        onClick={() => setOpen(!open)}
      >
        {current.project?.name ?? current.title}
        <ChevronDownIcon />
      </button>
      {open && (
        <Menu label={t('kb.pick')} role="listbox" width={280}>
          {projects.map((p) => (
            <MenuItem
              key={p.workspace}
              role="option"
              selected={p.workspace === current.workspace}
              onSelect={() => {
                setOpen(false)
                onPick(p.workspace)
              }}
            >
              {p.project?.name ?? p.title}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  )
}

/** Bot trong dự án đứng trước, rồi các bot khác của đội. */
function botChoices(team: TeamView, members: readonly string[]) {
  const bots = team.bots.filter((b) => b.kind === 'member')
  return [...bots.filter((b) => members.includes(b.id)), ...bots.filter((b) => !members.includes(b.id))]
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
  const foot =
    c.kind === 'draft'
      ? t('kb.foot.draft')
      : c.column === 'unassigned'
        ? c.waitingFor.length
          ? t('kb.foot.blocked', {
              n: c.waitingFor.length,
              titles: c.waitingFor.map((w) => w.title).join(', '),
            })
          : t('kb.foot.unassigned')
        : t(`kb.foot.${c.column}`)
  const body = (
    <>
      <span>
        <span className="a-muted a-mono" style={{ fontSize: 11 }}>
          {c.id}
        </span>{' '}
        {c.title}
      </span>
      <div className="ft">
        {bot && <Mascot id={bot.mascot} size={18} />}
        {bot && <b style={{ color: 'var(--a-ink)', fontWeight: 600 }}>{bot.name}</b>}
        <span>{foot}</span>
      </div>
    </>
  )
  if (c.kind === 'task')
    return c.session ? (
      <button
        type="button"
        className={c.column === 'done' ? 'ap-kc ap-kc-btn a-muted' : 'ap-kc ap-kc-btn'}
        style={c.column === 'doing' && c.bot ? { borderColor: branchColor(c.bot) } : undefined}
        title={t('kb.openBot')}
        onClick={() => nav.openSession(c.session!)}
      >
        {body}
      </button>
    ) : (
      <div className="ap-kc">{body}</div>
    )
  return (
    <div className="ap-kc" style={{ borderStyle: 'dashed' }}>
      {body}
      {c.description && (
        <span className="a-muted" style={{ fontSize: 12 }}>
          {c.description}
        </span>
      )}
      <div className="ap-kc-acts">
        <select
          className="ap-sel"
          value={pick}
          aria-label={t('kb.assignTo', { title: c.title })}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">{t('kb.arisPicks')}</option>
          {botChoices(team, members).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {members.includes(b.id) ? '' : ` · ${t('kb.outside')}`}
            </option>
          ))}
        </select>
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
      <label className="a-field">
        <span className="l">{t('kb.cardBot')}</span>
        <select className="ap-sel" value={bot} onChange={(e) => setBot(e.target.value)}>
          <option value="">{t('kb.arisPicks')}</option>
          {botChoices(team, members).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {members.includes(b.id) ? '' : ` · ${t('kb.outside')}`}
            </option>
          ))}
        </select>
      </label>
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>}
    </Dialog>
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
      subtitle={t('kb.meta', { n: cards.length, project: current.project?.name ?? current.title })}
      actions={
        <>
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
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('kb.new')}
          </Button>
        </>
      }
    >
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        {t(split === 'auto' ? 'kb.autoHint' : 'kb.manualHint')}
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
                  <span>{t(col.label)}</span>
                  <span>{list.length}</span>
                </div>
                {list.map((c) => (
                  <Card key={c.id} t={t} c={c} team={team} members={members} nav={nav} onError={setError} />
                ))}
                {col.id === 'unassigned' && cards.length === 0 && (
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('kb.empty')}
                  </span>
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
