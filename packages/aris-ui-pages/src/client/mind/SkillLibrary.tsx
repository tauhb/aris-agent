/**
 * Thư viện skill › Kho dựng sẵn (giai đoạn 8, plan 8.8; bản vẽ `KhoDungSan.dc.html`): thẻ từng gói, gói đang mở với
 * tình trạng từng skill (chưa cài, đã cài, có bản mới, người dùng đã sửa, đã cất), xem trước nội dung, cài cả gói hay
 * từng skill kèm chọn bot, cập nhật, và hỏi trước khi thay skill người dùng đã sửa.
 */
import { Button, Dialog, Pill, useTeamData } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { AssignPicker } from './SkillAssign.js'
import { skillsPost } from './skills-api.js'
import { TEAM_SKILL_OWNER, type Assigned } from './skill-team.js'

type T = PageProps['t']

export type LibraryState = 'none' | 'installed' | 'update' | 'edited' | 'archived'

export interface LibrarySkill {
  name: string
  description: string
  whenToUse?: string
  body: string
  version: number
  cases: string[]
  state: LibraryState
  installedVersion?: number
  assigned?: Assigned
  changes?: { kind: ' ' | '+' | '-'; text: string }[]
  stat?: { add: number; del: number }
}

/** Một gói trong `GET /api/aris/skills?library=1`. */
export interface LibraryPack {
  id: string
  name: string
  description: string
  version: number
  suggest: string[]
  skills: LibrarySkill[]
  installed: number
  updates: number
}

interface Outcome {
  name: string
  status: 'installed' | 'unchanged' | 'edited' | 'error' | 'proposed'
  error?: string
}

/** Màu và ký hiệu thẻ gói (theo bản vẽ); gói lạ thì màu chung. */
const PACK_LOOK: Record<string, [string, string]> = {
  'ban-hang-cskh': ['#15803D', '₫'],
  'noi-dung-mxh': ['#1D6FE0', '✎'],
  'phieu-marketing': ['#B45309', '▽'],
}

const STATE_TONE: Record<LibraryState, 'ok' | 'warn' | 'muted'> = {
  none: 'muted',
  installed: 'ok',
  update: 'warn',
  edited: 'warn',
  archived: 'muted',
}

/** Số skill cài thêm được (chưa cài hay đã cất) và số có bản mới. */
export const packCounts = (p: LibraryPack) => ({
  rest: p.skills.filter((s) => s.state === 'none' || s.state === 'archived').length,
  updates: p.skills.filter((s) => s.state === 'update').length,
})

export function SkillLibrary({
  t,
  nav,
  packs,
  onChanged,
}: {
  t: T
  nav: PageProps['nav']
  packs: LibraryPack[] | null
  onChanged: () => void
}) {
  const team = useTeamData()
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [installing, setInstalling] = useState<{ pack: LibraryPack; names: string[] } | null>(null)
  const [review, setReview] = useState<LibrarySkill | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!packs) return null
  if (packs.length === 0)
    return (
      <div className="a-muted" style={{ fontSize: 13 }}>
        {t('lib.empty')}
      </div>
    )
  const open = packs.find((p) => p.id === openId) ?? packs[0]!
  const botName = (id: string) => team?.bots?.find((b) => b.id === id)?.name ?? id
  const assignedText = (a: Assigned | undefined) =>
    a === 'all' ? t('conn.scopeAll') : a?.length ? a.map(botName).join(', ') : t('lib.unassigned')

  async function install(pack: LibraryPack, names: string[], o: { bots?: Assigned; force?: boolean } = {}) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const r = await skillsPost<{ outcomes: Outcome[] }>({
        op: 'library-install',
        pack: pack.id,
        names,
        ...(o.bots && (o.bots === 'all' || o.bots.length) ? { bots: o.bots } : {}),
        ...(o.force ? { force: true } : {}),
      })
      const n = (s: Outcome['status']) => r.outcomes.filter((x) => x.status === s).length
      const failed = r.outcomes.filter((x) => x.status === 'error')
      setNote(
        [
          n('installed') ? t('lib.done', { n: n('installed') }) : '',
          n('unchanged') ? t('lib.unchanged', { n: n('unchanged') }) : '',
          n('edited') ? t('lib.keptEdited', { n: n('edited') }) : '',
          ...failed.map((x) => t('lib.failed', { name: x.name, error: x.error ?? '' })),
        ]
          .filter(Boolean)
          .join(' '),
      )
      setInstalling(null)
      setReview(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveAssign(name: string, next: Assigned) {
    setBusy(true)
    setError(null)
    try {
      await skillsPost({ op: 'assign', skill: `${TEAM_SKILL_OWNER}--${name}`, bots: next })
      setAssigning(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const restNames = (p: LibraryPack) =>
    p.skills.filter((s) => s.state === 'none' || s.state === 'archived').map((s) => s.name)
  const { updates } = packCounts(open)

  return (
    <>
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('lib.intro')}
      </p>
      {(note || error) && (
        <div role="status" style={{ fontSize: 13, color: error ? 'var(--a-danger)' : undefined }}>
          {error ?? note}
        </div>
      )}
      <div className="ap-lib">
        <div className="ap-lib-packs">
          {packs.map((p) => {
            const c = packCounts(p)
            const [color, mark] = PACK_LOOK[p.id] ?? ['var(--a-accent)', '◆']
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                className="a-card ap-lib-pack"
                data-on={p.id === open.id ? true : undefined}
                aria-pressed={p.id === open.id}
                onClick={() => (setOpenId(p.id), setPreview(null))}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    setOpenId(p.id)
                    setPreview(null)
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="ap-lib-logo" style={{ background: color }} aria-hidden="true">
                    {mark}
                  </span>
                  <b style={{ fontSize: 14.5 }}>{p.name}</b>
                </div>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {p.description}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill tone="muted">{t('lib.nSkills', { n: p.skills.length })}</Pill>
                  <Pill tone={p.installed ? 'ok' : 'muted'}>
                    {p.installed ? t('lib.installedN', { n: p.installed }) : t('lib.notInstalled')}
                  </Pill>
                  {c.updates > 0 && <Pill tone="warn">{t('lib.updatesN', { n: c.updates })}</Pill>}
                  {c.rest > 0 && (
                    <span style={{ marginLeft: 'auto' }}>
                      <Button
                        size="sm"
                        variant={p.installed ? undefined : 'primary'}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          setInstalling({ pack: p, names: restNames(p) })
                        }}
                      >
                        {p.installed ? t('lib.installRest', { n: c.rest }) : t('lib.installPack')}
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="a-muted" style={{ margin: 0, fontSize: 12 }}>
            {t('lib.soon')}
          </p>
        </div>

        <div className="a-card" style={{ overflow: 'hidden', minWidth: 0 }}>
          <div className="ap-lib-head">
            <b>{open.name}</b>
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('lib.packMeta', { v: open.version })}
              {open.suggest.length > 0 && ` · ${t('lib.suggest', { who: open.suggest.join(', ') })}`}
            </span>
            {updates > 0 && (
              <span style={{ marginLeft: 'auto' }}>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void install(
                      open,
                      open.skills.filter((s) => s.state === 'update').map((s) => s.name),
                    )
                  }
                >
                  {t('lib.updateN', { n: updates })}
                </Button>
              </span>
            )}
          </div>
          {open.skills.map((s) => {
            const on = preview === s.name
            return (
              <div key={s.name}>
                <div
                  role="button"
                  tabIndex={0}
                  className="ap-lib-row"
                  data-on={on ? true : undefined}
                  aria-expanded={on}
                  onClick={() => (setPreview(on ? null : s.name), setFull(false), setAssigning(null))}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      setPreview(on ? null : s.name)
                      setFull(false)
                    }
                  }}
                >
                  <span className="a-mono ap-lib-name">{s.name}</span>
                  <span className="a-muted ap-lib-desc">{s.description}</span>
                  <Pill tone={STATE_TONE[s.state]}>{t(`lib.st.${s.state}`)}</Pill>
                  <span className="ap-lib-act" onClick={(e) => e.stopPropagation()}>
                    {s.state === 'none' && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setInstalling({ pack: open, names: [s.name] })}
                      >
                        {t('lib.install')}
                      </Button>
                    )}
                    {s.state === 'archived' && (
                      <Button size="sm" disabled={busy} onClick={() => void install(open, [s.name])}>
                        {t('lib.reuse')}
                      </Button>
                    )}
                    {s.state === 'update' && (
                      <Button size="sm" disabled={busy} onClick={() => setReview(s)}>
                        {t('lib.update')}
                      </Button>
                    )}
                    {s.state === 'edited' && (
                      <Button size="sm" disabled={busy} onClick={() => setReview(s)}>
                        {t('lib.seeNew')}
                      </Button>
                    )}
                    {s.state === 'installed' && (
                      <span className="a-muted" style={{ fontSize: 12 }}>
                        {assignedText(s.assigned)}
                      </span>
                    )}
                  </span>
                </div>
                {on && (
                  <div className="ap-lib-preview">
                    <div
                      className="a-muted"
                      style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em' }}
                    >
                      {t('lib.preview').toUpperCase()}
                    </div>
                    <div className="a-card ap-lib-body" data-full={full ? true : undefined}>
                      {s.body}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="a-muted" style={{ fontSize: 12 }}>
                        {t('lib.cases', { n: s.cases.length })}
                      </span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <Button size="sm" onClick={() => setFull(!full)}>
                          {full ? t('lib.less') : t('lib.full')}
                        </Button>
                        {s.state !== 'none' && (
                          <Button
                            size="sm"
                            onClick={() => nav.go('skill', { id: `${TEAM_SKILL_OWNER}--${s.name}` })}
                          >
                            {t('lib.open')}
                          </Button>
                        )}
                        {s.state !== 'none' && s.state !== 'archived' && (
                          <Button
                            size="sm"
                            onClick={() => setAssigning(assigning === s.name ? null : s.name)}
                          >
                            {t('lib.assign')}
                          </Button>
                        )}
                      </span>
                    </div>
                    {assigning === s.name && (
                      <AssignPicker
                        t={t}
                        name={s.name}
                        assigned={s.assigned}
                        busy={busy}
                        onSave={(next) => void saveAssign(s.name, next)}
                        onCancel={() => setAssigning(null)}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog
        open={!!installing}
        title={
          installing && installing.names.length === 1
            ? t('lib.installOneTitle', { name: installing.names[0]! })
            : t('lib.installTitle', { name: installing?.pack.name ?? '' })
        }
        onClose={() => setInstalling(null)}
        closeLabel={t('cb.cancel')}
      >
        {installing && (
          <div className="ap-lib-assign">
            <AssignPicker
              t={t}
              name={installing.pack.name}
              assigned={undefined}
              busy={busy}
              title={t('lib.pickBots')}
              hint={t('lib.installHint')}
              saveLabel={t('lib.installDo', { n: installing.names.length })}
              onSave={(bots) => void install(installing.pack, installing.names, { bots })}
              onCancel={() => setInstalling(null)}
            />
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!review}
        title={t('lib.reviewTitle', { name: review?.name ?? '' })}
        onClose={() => setReview(null)}
        closeLabel={t('cb.cancel')}
        width={560}
        footer={
          <>
            <Button onClick={() => setReview(null)}>{t('lib.keep')}</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                review && void install(open, [review.name], { force: review.state === 'edited' })
              }
            >
              {t('lib.replace')}
            </Button>
          </>
        }
      >
        {review && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13 }}>
              {review.state === 'edited'
                ? t('lib.reviewEdited', { add: review.stat?.add ?? 0, del: review.stat?.del ?? 0 })
                : t('lib.reviewUpdate', {
                    v: review.version,
                    add: review.stat?.add ?? 0,
                    del: review.stat?.del ?? 0,
                  })}
            </span>
            <div className="a-card" style={{ maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
              {(review.changes ?? []).map((l, i) => (
                <div key={i} className="ap-dl" data-kind={l.kind}>
                  {`${l.kind === '+' ? '+' : '−'} ${l.text}`}
                </div>
              ))}
              {(review.stat?.add ?? 0) + (review.stat?.del ?? 0) > (review.changes?.length ?? 0) && (
                <div className="ap-dl">{t('lib.reviewMore')}</div>
              )}
            </div>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('lib.reviewKeep')}
            </span>
          </div>
        )}
      </Dialog>
    </>
  )
}
