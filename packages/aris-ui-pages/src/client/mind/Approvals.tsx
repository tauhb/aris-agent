/**
 * 3.4 · Hộp duyệt (giai đoạn 3, đợt 1): một danh sách cho yêu cầu quyền của bot (`@aris/commander`,
 * tự từ chối sau 15 phút) và ký ức bot đề xuất (`@aris/memory`, tự bỏ sau 7 ngày). Bên trái là danh
 * sách lọc theo loại, bên phải chi tiết việc đang chọn. Skill vào ở đợt 3; gợi ý luật để đợt sau.
 */
import { Button, Mascot, Pill, useTeamData, type BotData } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { PreviewShot } from '../computer/Shot.js'
import { Later } from '../team/BotTools.js'
import {
  cleanItems,
  groupImports,
  shortSha,
  sourceLabel,
  sourceUrl,
  type Assigned,
  type ImportGroup,
  type SkillSource,
} from './skill-team.js'

type T = PageProps['t']

/** Yêu cầu quyền đang chờ (hộp duyệt tập trung của `@aris/commander`). */
interface ActionItem {
  id: string
  source: 'external' | 'member' | 'computer'
  /** Điều khiển máy: mã ảnh cửa sổ có vùng đánh dấu. */
  preview?: string
  bot: string
  name: string
  parentSession?: string
  kind: string
  target?: string
  tool?: string
  reason?: string
  at: string
}

/** Ký ức bot đề xuất (`@aris/memory`, `?pending=all`). */
interface MemoryItem {
  id: string
  bot: string
  book: 'owner' | 'notes'
  kind: string
  tier: 'core' | 'archive'
  trust: 'user-stated' | 'agent-inferred' | 'external'
  text: string
  why?: string
  quote?: string
  via: 'tool' | 'reflect' | 'compaction'
  sessionId?: string
  at: string
  expiresAt: string
}

/** Bản skill chờ duyệt (`@aris/skills`, `?pending=all`), kèm so sánh với bản đang dùng. */
interface SkillItem {
  id: string
  skill: string
  bot: string
  name: string
  version: number
  /** Bản đang dùng (0: skill mới). */
  base: number
  stat: { add: number; del: number }
  why?: string
  quote?: string
  sessionId?: string
  /** Vòng học nền đề xuất (`reflect`) hay người dùng nhờ học bằng `/learn` (`user`). */
  by?: 'reflect' | 'user' | 'restore' | 'import' | 'merge'
  /** Đề xuất gộp: mã skill bị gộp vào skill này. */
  mergeOf?: string
  /** So với bản đang dùng (chỉ có ở bản chờ duyệt). */
  diff?: { kind: ' ' | '+' | '-'; text: string }[]
  warnings: string[]
  /** Skill nhập từ ngoài: nguồn, dấu hiệu nguy hiểm, tệp kèm, bot gán sẵn khi duyệt. */
  source?: SkillSource
  risks?: string[]
  files?: string[]
  assignOnApprove?: Assigned
  at: string
}

/** Tóm tắt soát bộ não (`@aris/brain`, `?soat=summary`): một thẻ khi còn phát hiện chưa xử lý. */
interface AuditSummary {
  open: number
  counts: Record<string, number>
  runs: { at: string; by: string }[]
}

type Kind = 'action' | 'memory' | 'skill' | 'soat'
type Row =
  | { type: 'action'; a: ActionItem }
  | { type: 'memory'; m: MemoryItem }
  | { type: 'skill'; s: SkillItem }
  | { type: 'imports'; g: ImportGroup<SkillItem> }
  | { type: 'soat'; b: AuditSummary }

/** Yêu cầu quyền tự từ chối sau 15 phút (như thẻ Telegram). */
const ACTION_MINUTES = 15
const KINDS = ['run', 'edit', 'write', 'read', 'search', 'find', 'web', 'webSearch', 'agent', 'permission']

const url = (path: string) => new URL(path, document.baseURI)
const post = async (path: string, body: unknown) => {
  const res = await fetch(url(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out
}

function useInbox() {
  const [actions, setActions] = useState<ActionItem[] | null>(null)
  const [memories, setMemories] = useState<MemoryItem[] | null>(null)
  const [skills, setSkills] = useState<SkillItem[] | null>(null)
  const [audit, setAudit] = useState<AuditSummary | null>(null)
  const [done, setDone] = useState({ actions: 0, memories: 0, skills: 0 })
  const load = useCallback(async () => {
    const [a, m, s, b] = await Promise.all([
      fetch(url('api/aris/commander?approvals=all'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ approvals: ActionItem[]; doneToday?: number }>) : null))
        .catch(() => null),
      fetch(url('api/aris/memory?pending=all'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ pending: MemoryItem[]; doneToday: number }>) : null))
        .catch(() => null),
      fetch(url('api/aris/skills?pending=all'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ pending: SkillItem[]; doneToday: number }>) : null))
        .catch(() => null),
      fetch(url('api/aris/brain?audit=summary'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<AuditSummary>) : null))
        .catch(() => null),
    ])
    setAudit(b && b.open > 0 ? b : null)
    if (a) setActions(a.approvals)
    if (m) setMemories(m.pending)
    if (s) setSkills(s.pending)
    setDone((d) => ({
      actions: a?.doneToday ?? d.actions,
      memories: m?.doneToday ?? d.memories,
      skills: s?.doneToday ?? d.skills,
    }))
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [load])
  return { actions, memories, skills, audit, done: done.actions + done.memories + done.skills, reload: load }
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const minutesLeft = (a: ActionItem) =>
  Math.max(0, Math.ceil((Date.parse(a.at) + ACTION_MINUTES * 60_000 - Date.now()) / 60_000))
const daysLeft = (m: MemoryItem) =>
  Math.max(0, Math.ceil((Date.parse(m.expiresAt) - Date.now()) / 86_400_000))
/** Đề xuất skill tự bỏ sau 7 ngày (như ký ức). */
const skillDaysLeft = (s: SkillItem) =>
  Math.max(0, Math.ceil((Date.parse(s.at) + 7 * 86_400_000 - Date.now()) / 86_400_000))
/** "2 mâu thuẫn, 5 liên kết gãy…" từ số phát hiện theo loại. */
const AUDIT_ORDER = [
  'mau-thuan',
  'nhan-dinh-cu',
  'lien-ket-gay',
  'chua-co-trang',
  'phong-da-xoa',
  'bot-bo-qua',
  'mo-coi',
  'thieu-tom-tat',
  'trung-ten',
  'lau-chua-cap-nhat',
]
const auditLine = (t: T, b: AuditSummary) =>
  AUDIT_ORDER.filter((k) => b.counts[k])
    .map((k) => t(`ap.soatKind.${k}`, { n: b.counts[k] }))
    .join(', ')
const actionLabel = (t: T, a: ActionItem) =>
  KINDS.includes(a.kind) ? t(`ap.do.${a.kind}`) : t('ap.do.other', { tool: a.tool ?? a.kind })

export function Approvals({ t, nav }: PageProps) {
  const team = useTeamData()
  const { actions, memories, skills, audit, done, reload } = useInbox()
  const [filter, setFilter] = useState<'all' | Kind>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const botOf = (id: string): BotData | undefined => team?.bots.find((b) => b.id === id)
  const rows: Row[] = [
    ...(actions ?? []).map((a) => ({ type: 'action' as const, a })),
    ...(memories ?? []).map((m) => ({ type: 'memory' as const, m })),
    ...(() => {
      // Skill nhập từ ngoài gom theo từng lần nhập; skill của vòng học và /learn vẫn từng thẻ.
      const { groups, rest } = groupImports(skills ?? [])
      return [
        ...groups.map((g) => ({ type: 'imports' as const, g })),
        ...rest.map((s) => ({ type: 'skill' as const, s })),
      ]
    })(),
    ...(audit ? [{ type: 'soat' as const, b: audit }] : []),
  ]
  const idOf = (r: Row) =>
    r.type === 'action'
      ? r.a.id
      : r.type === 'memory'
        ? r.m.id
        : r.type === 'skill'
          ? r.s.id
          : r.type === 'imports'
            ? `import:${r.g.key}`
            : 'soat'
  const botIdOf = (r: Row) =>
    r.type === 'action'
      ? r.a.bot
      : r.type === 'memory'
        ? r.m.bot
        : r.type === 'skill'
          ? r.s.bot
          : r.type === 'imports'
            ? '_doi'
            : 'b-thu-thu'
  const titleOf = (r: Row) =>
    r.type === 'action'
      ? actionLabel(t, r.a)
      : r.type === 'memory'
        ? t('ap.memTitle')
        : r.type === 'skill'
          ? r.s.by === 'merge' && r.s.mergeOf
            ? t('ap.mergeTitle', { gone: skillNameOf(r.s.mergeOf), keep: r.s.name })
            : t('ap.skillTitle', { name: r.s.name, v: r.s.version })
          : r.type === 'imports'
            ? t('ski.groupTitle', { n: r.g.items.length, src: sourceLabel(r.g.source, t('lib.source')) })
            : t('ap.soatTitle')
  const subOf = (r: Row) =>
    r.type === 'action'
      ? (r.a.target ?? r.a.tool ?? '')
      : r.type === 'memory'
        ? `“${r.m.text}”`
        : r.type === 'soat'
          ? auditLine(t, r.b)
          : r.type === 'imports'
            ? t('ski.groupSub', { n: r.g.items.filter((i) => i.risks?.length).length })
            : r.s.by === 'merge'
              ? t('ap.mergeSub')
              : r.s.base
                ? t('ap.skillPatch', { add: r.s.stat.add, del: r.s.stat.del })
                : t('ap.skillNew')
  const shown = rows.filter(
    (r) => filter === 'all' || r.type === filter || (filter === 'skill' && r.type === 'imports'),
  )
  const current = shown.find((r) => idOf(r) === selected) ?? shown[0]
  const chips: ['all' | Kind, string][] = [
    ['all', t('ap.all')],
    ['action', t('ap.action', { n: actions?.length ?? 0 })],
    ['memory', t('ap.memory', { n: memories?.length ?? 0 })],
    ['skill', t('ap.skill', { n: skills?.length ?? 0 })],
    ...(audit ? [['soat', t('ap.soat')] as ['soat', string]] : []),
  ]
  return (
    <div className="ap-split">
      <section className="ap-inbox" aria-label={t('ap.list')}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 className="a-page-title">{t('ap.title')}</h1>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('ap.needYou', { n: rows.length })}
          </span>
        </div>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}
          aria-label={t('ap.filter')}
        >
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ap-chip"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 && (
          <div className="a-muted" style={{ padding: '6px 14px 14px', fontSize: 13 }}>
            {actions && memories && skills ? t('ap.empty') : t('ap.loading')}
          </div>
        )}
        {shown.map((r) => {
          const id = idOf(r)
          const bot = botOf(botIdOf(r))
          const name =
            r.type === 'action'
              ? r.a.name
              : r.type === 'imports' || botIdOf(r) === '_doi'
                ? t('ski.teamLib')
                : (bot?.name ?? botIdOf(r))
          return (
            <button
              key={id}
              type="button"
              className="ap-li"
              aria-current={current && id === idOf(current) ? true : undefined}
              onClick={() => setSelected(id)}
            >
              <Mascot id={bot?.mascot ?? 'aris'} size={28} accessory={bot?.accessory} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b className="ap-li-title">{titleOf(r)}</b>
                  <span className={r.type === 'action' ? 'ap-due warn' : 'ap-due'}>
                    {r.type === 'action'
                      ? t('ap.minutesLeft', { n: minutesLeft(r.a) })
                      : r.type === 'soat'
                        ? t('ap.soatOpen', { n: r.b.open })
                        : t('ap.daysLeft', {
                            n:
                              r.type === 'memory'
                                ? daysLeft(r.m)
                                : skillDaysLeft(r.type === 'imports' ? r.g.items[0]! : r.s),
                          })}
                  </span>
                </span>
                <span className="a-muted ap-li-sub">
                  {name} · {subOf(r)}
                </span>
              </span>
            </button>
          )
        })}
        <div className="a-muted" style={{ padding: 14, fontSize: 12, borderTop: '1px solid var(--a-line)' }}>
          {t('ap.doneToday', { n: done })}
        </div>
        <div style={{ margin: 'auto 14px 14px' }}>
          <Later t={t} stage={3} label={t('ap.later')}>
            <div className="a-card" style={{ padding: 12, borderColor: 'var(--a-accent)', fontSize: 13 }}>
              <b>{t('ap.ruleTitle')}</b> — {t('ap.ruleHint')}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button size="sm" disabled>
                  {t('ap.always')}
                </Button>
                <Button size="sm" disabled>
                  {t('ap.ignore')}
                </Button>
              </div>
            </div>
          </Later>
        </div>
      </section>
      <main className="ap-detail">
        {!current && <div className="a-muted">{t('ap.nothing')}</div>}
        {current?.type === 'action' && (
          <ActionDetail
            key={current.a.id}
            t={t}
            a={current.a}
            bot={botOf(current.a.bot)}
            nav={nav}
            onDone={reload}
          />
        )}
        {current?.type === 'soat' && (
          <div className="ap-soatcard">
            <Mascot id="trang-giay" size={44} />
            <h2>{t('ap.soatTitle')}</h2>
            <div>{auditLine(t, current.b)}</div>
            <div className="a-muted" style={{ fontSize: 13 }}>
              {t('ap.soatHint')}
            </div>
            <div>
              <Button variant="primary" onClick={() => nav.go('brain', { view: 'audit' })}>
                {t('ap.soatOpenBtn')}
              </Button>
            </div>
          </div>
        )}
        {current?.type === 'skill' && (
          <SkillDetail
            key={current.s.id}
            t={t}
            s={current.s}
            bot={botOf(current.s.bot)}
            nav={nav}
            onDone={reload}
          />
        )}
        {current?.type === 'imports' && (
          <ImportsDetail
            key={current.g.key}
            t={t}
            g={current.g}
            team={team?.bots ?? []}
            nav={nav}
            onDone={reload}
          />
        )}
        {current?.type === 'memory' && (
          <MemoryDetail
            key={current.m.id}
            t={t}
            m={current.m}
            bot={botOf(current.m.bot)}
            nav={nav}
            onDone={reload}
          />
        )}
      </main>
    </div>
  )
}

function Head({
  mascot,
  accessory,
  title,
  context,
}: {
  mascot: string
  accessory?: string | undefined
  title: string
  context: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Mascot id={mascot} size={40} motion="waiting" accessory={accessory} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
        <span className="a-muted" style={{ fontSize: 13 }}>
          {context}
        </span>
      </div>
    </div>
  )
}

function ActionDetail({
  t,
  a,
  bot,
  nav,
  onDone,
}: {
  t: T
  a: ActionItem
  bot: BotData | undefined
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function answer(allow: boolean) {
    setBusy(true)
    setError(null)
    try {
      await post('api/aris/commander', { op: 'external-approve', id: a.id, allow })
      await onDone()
    } catch (e) {
      setError((e as Error).message === 'HTTP 404' ? t('ap.gone') : (e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <Head
        mascot={bot?.mascot ?? 'aris'}
        accessory={bot?.accessory}
        title={t('ap.wants', { name: a.name, what: actionLabel(t, a).toLowerCase() })}
        context={`${a.source === 'external' ? t('ap.external') : a.source === 'computer' ? t('cu.askTag') : t('ap.member')} · ${hhmm(a.at)}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
        {a.tool && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.tool')}</span>
            <span className="a-mono">{a.tool}</span>
          </div>
        )}
        {a.target && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.target')}</span>
            <span className="a-mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {a.target}
            </span>
          </div>
        )}
        {a.reason && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.reason')}</span>
            <span>{a.reason}</span>
          </div>
        )}
      </div>
      {a.preview && <PreviewShot t={t} id={a.preview} what={a.target ?? ''} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void answer(true)}>
          {t('ap.allowOnce')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void answer(false)}
        >
          {t('ap.reject')}
        </Button>
        {a.parentSession && (
          <Button size="lg" onClick={() => nav.openSession(a.parentSession!)}>
            {t('ap.openSession')}
          </Button>
        )}
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ap.timeout', { t: t('ap.minutes', { n: minutesLeft(a) }) })}
      </p>
    </>
  )
}

const VIA_KEY = { tool: 'ap.via.tool', reflect: 'ap.via.reflect', compaction: 'ap.via.compaction' } as const

function MemoryDetail({
  t,
  m,
  bot,
  nav,
  onDone,
}: {
  t: T
  m: MemoryItem
  bot: BotData | undefined
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [text, setText] = useState(m.text)
  const [tier, setTier] = useState(m.tier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; full?: boolean } | null>(null)
  const name = bot?.name ?? m.bot
  async function review(decision: 'save' | 'discard') {
    setBusy(true)
    setError(null)
    try {
      await post('api/aris/memory', { op: 'review', id: m.id, decision, text, tier })
      await onDone()
    } catch (e) {
      const message = (e as Error).message
      setError({ message, full: /trần|đầy/i.test(message) })
      setBusy(false)
    }
  }
  return (
    <>
      <Head
        mascot={bot?.mascot ?? 'aris'}
        accessory={bot?.accessory}
        title={t('ap.memWants', { name })}
        context={`${t(VIA_KEY[m.via])} · ${hhmm(m.at)} ${new Date(m.at).toLocaleDateString('vi-VN')}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memText')}</span>
          <textarea
            className="a-inp"
            rows={3}
            value={text}
            aria-label={t('ap.memText')}
            onChange={(e) => setText(e.target.value)}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical', width: '100%' }}
          />
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memBook')}</span>
          <span>
            {m.book === 'owner' ? t('ap.book.owner') : t('ap.book.notes', { name })} ·{' '}
            {t(`mem.kind.${m.kind}`)}
          </span>
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memTier')}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['core', 'archive'] as const).map((x) => (
              <button
                key={x}
                type="button"
                className="ap-chip"
                aria-pressed={tier === x}
                disabled={x === 'core' && m.trust === 'external'}
                onClick={() => setTier(x)}
              >
                {t(`ap.tier.${x}`)}
              </button>
            ))}
          </span>
        </div>
        {m.why && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.why')}</span>
            <span>{m.why}</span>
          </div>
        )}
        {m.quote && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.quote')}</span>
            <span style={{ fontStyle: 'italic' }}>“{m.quote}”</span>
          </div>
        )}
        {m.trust === 'external' && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.risk')}</span>
            <span style={{ color: 'var(--a-warn)', fontWeight: 600 }}>{t('ap.externalRisk')}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || !text.trim()}
          onClick={() => void review('save')}
        >
          {t('ap.save')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void review('discard')}
        >
          {t('ap.discard')}
        </Button>
        {m.sessionId && (
          <Button size="lg" onClick={() => nav.openSession(m.sessionId!)}>
            {t('ap.openSession')}
          </Button>
        )}
      </div>
      {error && (
        <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>
          {error.message}
          {error.full && tier === 'core' && (
            <>
              {' '}
              <a className="ap-link" onClick={() => setTier('archive')}>
                {t('ap.useArchive')}
              </a>
            </>
          )}
        </div>
      )}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ap.memTimeout', { n: daysLeft(m) })}
      </p>
    </>
  )
}

/** Tên skill từ mã `<bot>--<tên>`. */
const skillNameOf = (id: string) => id.split('--').slice(1).join('--') || id

function SkillDetail({
  t,
  s,
  bot,
  nav,
  onDone,
}: {
  t: T
  s: SkillItem
  bot: BotData | undefined
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = s.bot === '_doi' ? t('ski.teamLib') : (bot?.name ?? s.bot)
  const merge = s.by === 'merge' && s.mergeOf
  async function answer(op: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      await post('api/aris/skills', { op, id: s.id })
      await onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  if (merge)
    return (
      <>
        <Head
          mascot={bot?.mascot ?? 'aris'}
          accessory={bot?.accessory}
          title={t('ap.mergeHead', { name })}
          context={`${t('ap.via.merge')} · ${hhmm(s.at)} ${new Date(s.at).toLocaleDateString('vi-VN')}`}
        />
        <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 760 }}>
          <div className="ap-kv">
            <span className="a-muted">{t('ap.mergeKeep')}</span>
            <span>
              <b className="a-mono">{s.name}</b> · {`v${s.base} → v${s.version}`}
            </span>
          </div>
          <div className="ap-kv">
            <span className="a-muted">{t('ap.mergeGone')}</span>
            <span>{t('ap.mergeGoneHint', { gone: skillNameOf(s.mergeOf!), keep: s.name })}</span>
          </div>
          {s.why && (
            <div className="ap-kv">
              <span className="a-muted">{t('ap.why')}</span>
              <span>{s.why}</span>
            </div>
          )}
          {(s.risks?.length ?? 0) > 0 && (
            <div className="ap-kv">
              <span className="a-muted">{t('ap.mergeRisks')}</span>
              <span style={{ color: 'var(--a-danger)' }}>{s.risks!.join(' · ')}</span>
            </div>
          )}
        </div>
        {s.diff && (
          <div className="a-card" style={{ padding: 14, maxWidth: 760 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <b style={{ fontSize: 13.5 }}>{t('ap.mergeDiff')}</b>
              <span className="a-muted" style={{ fontSize: 12 }}>
                {t('ap.skillStat', { add: s.stat.add, del: s.stat.del })}
              </span>
            </div>
            <div className="a-mono ap-diff">
              {s.diff
                .filter((l) => l.kind !== ' ')
                .map((l, i) => (
                  <div key={i} style={{ color: l.kind === '+' ? 'var(--a-ok)' : 'var(--a-danger)' }}>
                    {l.kind} {l.text}
                  </div>
                ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 760 }}>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void answer('approve')}>
            {t('ap.mergeDo')}
          </Button>
          <Button size="lg" onClick={() => nav.go('skill', { id: s.skill })}>
            {t('ap.mergeEdit')}
          </Button>
          <Button size="lg" disabled={busy} onClick={() => void answer('reject')}>
            {t('ap.mergeKeepBoth')}
          </Button>
        </div>
        {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
        <p className="a-muted" style={{ margin: 0, fontSize: 12.5, maxWidth: 760 }}>
          {t('ap.mergeFoot')}
        </p>
      </>
    )
  return (
    <>
      <Head
        mascot={bot?.mascot ?? 'aris'}
        accessory={bot?.accessory}
        title={t(s.base ? 'ap.skillWantsPatch' : 'ap.skillWantsNew', { name, skill: s.name })}
        context={`${t(s.by === 'user' ? 'ap.via.learn' : 'ap.via.reflect')} · ${hhmm(s.at)} ${new Date(s.at).toLocaleDateString('vi-VN')}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.skillName')}</span>
          <span className="a-mono">
            {s.name} · {s.base ? `v${s.base} → v${s.version}` : `v${s.version}`}
          </span>
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.skillChange')}</span>
          <span>{t('ap.skillStat', { add: s.stat.add, del: s.stat.del })}</span>
        </div>
        {s.why && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.why')}</span>
            <span>{s.why}</span>
          </div>
        )}
        {s.quote && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.quote')}</span>
            <span style={{ fontStyle: 'italic' }}>“{s.quote}”</span>
          </div>
        )}
        {s.warnings.length > 0 && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.skillLint')}</span>
            <span style={{ color: 'var(--a-warn)' }}>{s.warnings.join(' ')}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void answer('approve')}>
          {t('skd.approve', { v: `v${s.version}` })}
        </Button>
        <Button size="lg" onClick={() => nav.go('skill', { id: s.skill })}>
          {t('ap.openSkill')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void answer('reject')}
        >
          {t('ap.reject')}
        </Button>
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ap.memTimeout', { n: skillDaysLeft(s) })}
      </p>
    </>
  )
}

/** Một lần nhập skill từ ngoài (bản vẽ `SkillDoiChiTiet.dc.html` B): duyệt cả lần, hay chỉ những skill không cảnh báo. */
function ImportsDetail({
  t,
  g,
  team,
  nav,
  onDone,
}: {
  t: T
  g: ImportGroup<SkillItem>
  team: readonly BotData[]
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = cleanItems(g.items)
  const sha = g.source.sha
  const link = sourceUrl(g.source)
  const first = g.items[0]
  const assigned = first?.assignOnApprove
  const faces =
    assigned === 'all' ? [] : (assigned ?? []).map((id) => team.find((b) => b.id === id)).filter(Boolean)
  async function answer(op: 'approve' | 'reject', items: readonly SkillItem[]) {
    setBusy(true)
    setError(null)
    try {
      // Từng bản một: một bản lỗi (ví dụ đã được trả lời) không chặn các bản còn lại.
      const failed: string[] = []
      for (const s of items)
        await post('api/aris/skills', { op, id: s.id }).catch((e: unknown) =>
          failed.push(`${s.name}: ${(e as Error).message}`),
        )
      if (failed.length) setError(failed.join(' · '))
      await onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Head
        mascot="aris"
        title={t('ski.groupTitle', { n: g.items.length, src: sourceLabel(g.source, t('lib.source')) })}
        context={`${t('ski.groupVia')} · ${hhmm(first?.at ?? '')} ${new Date(first?.at ?? 0).toLocaleDateString('vi-VN')}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 760 }}>
        <div className="ap-kv">
          <span className="a-muted">{t('ski.source')}</span>
          <span>
            <Pill tone="accent">{sourceLabel(g.source, t('lib.source'))}</Pill>{' '}
            {sha &&
              (link ? (
                <a className="ap-link a-mono" href={link} target="_blank" rel="noreferrer">
                  {shortSha(sha)}
                </a>
              ) : (
                <span className="a-mono">{shortSha(sha)}</span>
              ))}
          </span>
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ski.groupAssigned')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {assigned === 'all' ? (
              t('conn.scopeAll')
            ) : faces.length ? (
              faces.map((b) => <Mascot key={b!.id} id={b!.mascot} accessory={b!.accessory} size={22} />)
            ) : (
              <span className="a-muted">{t('ski.noneAssignedYet')}</span>
            )}
          </span>
        </div>
        {g.items.map((s) => (
          <div className="ap-kv" key={s.id} style={{ alignItems: 'flex-start' }}>
            <span className="a-mono" style={{ fontWeight: 500 }}>
              {s.name}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <span className="a-muted" style={{ fontSize: 12.5 }}>
                {t('ski.files', { n: s.files?.length ?? 0 })}
                {' · '}
                <a className="ap-link" onClick={() => nav.go('skill', { id: s.skill })}>
                  {t('ski.view')}
                </a>
              </span>
              {(s.risks ?? []).map((r) => (
                <span
                  key={r}
                  className="a-pill danger"
                  style={{ height: 'auto', whiteSpace: 'normal', padding: '2px 9px' }}
                >
                  {r}
                </span>
              ))}
              {s.warnings.length > 0 && (
                <span style={{ color: 'var(--a-warn)', fontSize: 12.5 }}>{s.warnings.join(' ')}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void answer('approve', g.items)}>
          {t('ski.approveAll', { n: g.items.length })}
        </Button>
        {clean.length > 0 && clean.length < g.items.length && (
          <Button size="lg" disabled={busy} onClick={() => void answer('approve', clean)}>
            {t('ski.approveClean', { n: clean.length })}
          </Button>
        )}
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void answer('reject', g.items)}
        >
          {t('ski.rejectAll')}
        </Button>
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ski.groupNote')}
      </p>
    </>
  )
}
