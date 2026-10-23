/**
 * 1.5 · Tạo dự án (bản vẽ `TaoPhong.dc.html`): tên, thành viên (Aris luôn chủ trì), thư mục làm
 * việc (chưa có thì aris tạo), mục tiêu, luật trò chuyện. Tạo thật qua `@aris/projects`: workspace
 * của dsh, hồ sơ dự án, phiên chính Aris làm trưởng nhóm; tạo xong mở phiên chính.
 */
import { Button, Dialog, Mascot, TextInput, useTeam } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Disclosure } from '../ui.js'
import { handleOf } from './CreateBot.js'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }

export interface ProjectInput {
  name: string
  path: string
  goal?: string
  members: string[]
  rules: { maxRounds: number; maxMessages: number; stopCommand: boolean; arisSummarizes: boolean }
}

export interface ProjectActions {
  pickDirectory(): Promise<string | null>
  /** Tạo dự án, trả mã phiên chính; lỗi ném ra với lời báo của máy chủ. */
  createProject(input: ProjectInput): Promise<string>
}

/** Thư mục gợi ý theo tên dự án. */
export const suggestDir = (name: string) => `~/aris/projects/${handleOf(name) || 'du-an'}`

const clamp = (v: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function CreateProject({ t, nav, projects }: PageProps & { projects: ProjectActions }) {
  const team = useTeam()
  const bots = team.bots.filter((b) => b.kind === 'member')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [dir, setDir] = useState('')
  const [dirTouched, setDirTouched] = useState(false)
  const [goal, setGoal] = useState('')
  const [adv, setAdv] = useState(false)
  const [rules, setRules] = useState({
    maxRounds: 3,
    maxMessages: 10,
    stopCommand: true,
    arisSummarizes: true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const path = dirTouched ? dir : suggestDir(name)
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const sessionId = await projects.createProject({
        name: name.trim(),
        path: path.trim(),
        ...(goal.trim() ? { goal: goal.trim() } : {}),
        members: picked,
        rules,
      })
      nav.openSession(sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      width={620}
      title={t('project.title')}
      description={t('project.intro')}
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      <label className="a-field">
        <span className="l">{t('project.name')}</span>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('project.namePh')} />
      </label>
      <div>
        <div className="ap-lb" style={{ color: 'var(--a-ink)', paddingBottom: 6 }}>
          {t('project.members')}{' '}
          <span className="a-muted" style={{ fontWeight: 400 }}>
            {t('project.count', { n: picked.length + 1 })}
          </span>
        </div>
        <div role="group" aria-label={t('project.pick')} className="ap-tags" style={{ gap: 6 }}>
          <button
            type="button"
            role="checkbox"
            aria-checked
            aria-disabled
            className="ap-chip ap-pick"
            aria-pressed
          >
            <Mascot id={team.commander.mascot ?? 'aris'} size={18} />
            {team.commander.name}
            <span className="a-muted"> {t('project.lead')}</span>
          </button>
          {bots.map((b) => (
            <button
              key={b.id}
              type="button"
              role="checkbox"
              aria-checked={picked.includes(b.id)}
              aria-pressed={picked.includes(b.id)}
              className="ap-chip ap-pick"
              onClick={() => toggle(b.id)}
            >
              <Mascot id={b.mascot} size={18} />
              {b.name}
            </button>
          ))}
        </div>
        {bots.length === 0 && (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('project.noBots')}
          </span>
        )}
      </div>
      <label className="a-field">
        <span className="l">{t('project.dir')}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <TextInput
            mono
            value={path}
            onChange={(e) => {
              setDirTouched(true)
              setDir(e.currentTarget.value)
            }}
          />
          <Button
            onClick={async () => {
              const chosen = await projects.pickDirectory()
              if (chosen) {
                setDirTouched(true)
                setDir(chosen)
              }
            }}
          >
            {t('project.choose')}
          </Button>
        </span>
        <span className="h">{t('project.dirHint')}</span>
      </label>
      <label className="a-field">
        <span className="l">
          {t('project.goal')}{' '}
          <span className="a-muted" style={{ fontWeight: 400 }}>
            {t('project.optional')}
          </span>
        </span>
        <textarea
          className="a-inp"
          rows={2}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t('project.goalPh')}
          style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
        />
      </label>
      <Disclosure
        title={t('cb.advanced')}
        hint={t('project.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <label className="ap-frow">
          <span>{t('project.maxRounds')}</span>
          <TextInput
            value={String(rules.maxRounds)}
            inputMode="numeric"
            aria-label={t('project.maxRounds')}
            onChange={(e) => setRules({ ...rules, maxRounds: clamp(e.target.value, 1, 10, rules.maxRounds) })}
            style={{ width: 64, textAlign: 'right' }}
          />
        </label>
        <label className="ap-frow">
          <span>{t('project.maxMessages')}</span>
          <TextInput
            value={String(rules.maxMessages)}
            inputMode="numeric"
            aria-label={t('project.maxMessages')}
            onChange={(e) =>
              setRules({ ...rules, maxMessages: clamp(e.target.value, 1, 30, rules.maxMessages) })
            }
            style={{ width: 64, textAlign: 'right' }}
          />
        </label>
        <label className="ap-frow">
          <span>{t('project.stopCmd')}</span>
          <input
            type="checkbox"
            checked={rules.stopCommand}
            onChange={(e) => setRules({ ...rules, stopCommand: e.target.checked })}
            style={check}
          />
        </label>
        <label className="ap-frow">
          <span>{t('project.leadSummary')}</span>
          <input
            type="checkbox"
            checked={rules.arisSummarizes}
            onChange={(e) => setRules({ ...rules, arisSummarizes: e.target.checked })}
            style={check}
          />
        </label>
      </Disclosure>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg" disabled={busy || !name.trim() || !path.trim()} onClick={create}>
          {busy ? t('project.creating') : t('project.create')}
        </Button>
      </div>
    </Dialog>
  )
}
