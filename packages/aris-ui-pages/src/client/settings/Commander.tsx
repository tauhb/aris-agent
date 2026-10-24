/**
 * 2.5 · Commander: bot được giao việc (cờ `assignable` của từng bot, duyệt mỗi lần giao), giới hạn
 * điều phối và trần tiền mỗi việc (cấu hình của `@aris/commander`), quyết định định tuyến gần đây.
 * "Commander đã học" (giai đoạn 3) và Driver (giai đoạn 4) còn là bản vẽ, để mờ.
 */
import {
  Card,
  Mascot,
  PageShell,
  Pill,
  teamAction,
  useTeam,
  useTeamData,
  type BotData,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'
import { Bot, Col } from '../ui.js'
import { DEMO_COMMANDER as C } from './demo.js'

const KIND_TONE = { delegate: 'accent', self: 'muted', handoff: 'ok', helpers: 'muted' } as const

/** Một lần giao việc trong nhật ký của `@aris/commander`. */
interface Dispatch {
  at: string
  bot: string
  handle: string
  title: string
  reason: string
  reused: boolean
}

/** Cấu hình Commander (`@aris/commander`, trang 2.5). */
interface Settings {
  parallel: number
  nested: number
  budgetUsd?: number
  helpers: boolean
  approve: string[]
}

const endpoint = () => new URL('api/aris/commander', document.baseURI)

function useCommander(): {
  log: Dispatch[] | null
  settings: Settings | null
  /** Lưu phần sửa; lỗi (nếu có) ghi theo từng ô, trả về đã lưu được chưa. */
  save: (patch: Partial<Record<keyof Settings, unknown>>) => Promise<boolean>
  errors: Partial<Record<keyof Settings, string>>
} {
  const [log, setLog] = useState<Dispatch[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({})
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(endpoint(), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ recent: Dispatch[]; settings?: Settings }>) : undefined))
        .then((d) => {
          if (!live || !d) return
          setLog(d.recent)
          if (d.settings) setSettings((cur) => cur ?? d.settings!)
        })
        .catch(() => {})
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  async function save(patch: Partial<Record<keyof Settings, unknown>>) {
    const field = Object.keys(patch)[0] as keyof Settings
    const res = await fetch(endpoint(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'settings', patch }),
    })
    const out = (await res.json().catch(() => ({}))) as { settings?: Settings; error?: string }
    setErrors((cur) => ({ ...cur, [field]: out.settings ? undefined : (out.error ?? `HTTP ${res.status}`) }))
    if (out.settings) setSettings(out.settings)
    return !!out.settings
  }
  return { log, settings, save, errors }
}

/** Ô số lưu khi rời ô hoặc bấm Enter; rỗng là bỏ giá trị (`null`). */
function LimitInput({
  value,
  label,
  onSave,
  placeholder,
  decimal,
}: {
  value: number | undefined
  label: string
  /** Lưu; không lưu được thì ô trở về số đang lưu. */
  onSave: (v: number | null) => Promise<boolean>
  placeholder?: string
  decimal?: boolean
}) {
  const shown = value === undefined ? '' : decimal ? String(value).replace('.', ',') : String(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const raw = text.trim().replace(',', '.')
    const n = raw === '' ? null : Number(raw)
    if (n !== null && Number.isNaN(n)) return setText(shown)
    if ((n ?? undefined) !== value) void onSave(n).then((ok) => ok || setText(shown))
  }
  return (
    <input
      className="a-inp a-num"
      value={text}
      aria-label={label}
      placeholder={placeholder}
      inputMode={decimal ? 'decimal' : 'numeric'}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      style={{ width: decimal ? 92 : 64, height: 30, textAlign: 'center', flex: 'none' }}
    />
  )
}

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)', flex: 'none' } as const

export function Commander({ t, nav }: PageProps) {
  const team = useTeam()
  const data = useTeamData()
  const COMMANDER = team.commander
  const { log, settings, save, errors } = useCommander()
  const [botError, setBotError] = useState<string | null>(null)
  const nameOf = (id: string) => team.members.find((m) => m.id === id)?.name ?? id
  const bots = (data?.bots ?? []).filter((b) => b.kind === 'member')
  const canTake = (b: BotData) => b.assignable !== false && (!b.external || b.external.assignable !== false)
  async function toggleBot(b: BotData, on: boolean) {
    setBotError(null)
    try {
      await teamAction({
        op: 'update',
        id: b.id,
        patch: { assignable: on, ...(b.external ? { external: { assignable: on } } : {}) },
      })
    } catch (e) {
      setBotError((e as Error).message)
    }
  }
  const approve = new Set(settings?.approve ?? [])
  const toggleApprove = (id: string) =>
    void save({ approve: approve.has(id) ? [...approve].filter((x) => x !== id) : [...approve, id] })
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mascot id={COMMANDER.mascot ?? COMMANDER.id} size={30} />
          {t('cmd.title', { name: COMMANDER.name })}
        </span>
      }
      subtitle={t('cmd.subtitle')}
      actions={<Pill tone="ok">{t('cmd.on')}</Pill>}
    >
      <div className="ap-cols">
        <Col basis={380}>
          <Card title={t('cmd.delegates')} subtitle={t('cmd.delegatesHint')}>
            {bots.map((b) => {
              const on = canTake(b)
              return (
                <div className="a-row" key={b.id}>
                  <Mascot id={b.mascot} size={24} />
                  <label
                    className="grow"
                    style={{ minWidth: 0, cursor: 'pointer' }}
                    htmlFor={`cmd-take-${b.id}`}
                  >
                    {b.name} <span className="a-muted">· {b.role || `@${b.handle}`}</span>
                  </label>
                  {on && (
                    <button
                      type="button"
                      className="ap-chip ap-each"
                      aria-pressed={approve.has(b.id)}
                      title={t('cmd.approveHint', { name: b.name })}
                      disabled={!settings}
                      onClick={() => toggleApprove(b.id)}
                    >
                      {t('cmd.approveEachShort')}
                    </button>
                  )}
                  <input
                    id={`cmd-take-${b.id}`}
                    type="checkbox"
                    checked={on}
                    aria-label={t('cmd.takeLabel', { name: b.name })}
                    onChange={(e) => void toggleBot(b, e.target.checked)}
                    style={check}
                  />
                </div>
              )
            })}
            <label className="a-row">
              <span className="ap-av" style={{ width: 24, height: 24 }}>
                ?
              </span>
              <span className="grow">{t('cmd.helpers')}</span>
              <input
                type="checkbox"
                checked={settings?.helpers ?? true}
                disabled={!settings}
                aria-label={t('cmd.helpers')}
                onChange={(e) => void save({ helpers: e.target.checked })}
                style={check}
              />
            </label>
            {(botError ?? errors.approve ?? errors.helpers) && (
              <div className="a-row" style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>
                {botError ?? errors.approve ?? errors.helpers}
              </div>
            )}
          </Card>
          <Card title={t('cmd.limits')}>
            <div className="a-row">
              <span className="grow ap-limit">
                {t('cmd.parallel')}
                <span className="a-muted">{t('cmd.parallelHint')}</span>
                {errors.parallel && <span className="err">{errors.parallel}</span>}
              </span>
              <LimitInput
                value={settings?.parallel}
                label={t('cmd.parallel')}
                onSave={(v) => save({ parallel: v })}
              />
            </div>
            <div className="a-row">
              <span className="grow ap-limit">
                {t('cmd.nested')}
                <span className="a-muted">{t('cmd.nestedHint')}</span>
                {errors.nested && <span className="err">{errors.nested}</span>}
              </span>
              <LimitInput
                value={settings?.nested}
                label={t('cmd.nested')}
                onSave={(v) => save({ nested: v })}
              />
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.talkBack')}</span>
              <span className="a-muted" style={{ textAlign: 'right' }}>
                {t('cmd.talkBackValue')}
              </span>
            </div>
            <div className="a-row">
              <span className="grow ap-limit">
                {t('cmd.budget')}
                <span className="a-muted">{t('cmd.budgetHint')}</span>
                {errors.budgetUsd && <span className="err">{errors.budgetUsd}</span>}
              </span>
              <LimitInput
                value={settings?.budgetUsd}
                label={t('cmd.budget')}
                placeholder={t('cmd.noCap')}
                decimal
                onSave={(v) => save({ budgetUsd: v })}
              />
              <span className="a-muted">USD</span>
            </div>
            <Later t={t} stage={4} row>
              <label className="a-row">
                <span className="grow">{t('cmd.driver')}</span>
                <input type="checkbox" disabled aria-label={t('cmd.driver')} style={check} />
              </label>
            </Later>
          </Card>
        </Col>
        <Col grow={1.4} basis={500}>
          <Card
            title={t('cmd.routing')}
            actions={
              <a className="ap-link" onClick={() => nav.go('settings', { section: 'stats' })}>
                {t('cmd.seeAll')}
              </a>
            }
          >
            <div className="ap-dr a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
              <span>{t('stats.time')}</span>
              <span>{t('cmd.request')}</span>
              <span>{t('cmd.decision')}</span>
              <span>{t('cmd.reason')}</span>
              <span>{t('cmd.result')}</span>
            </div>
            {log?.length === 0 && (
              <div className="ap-dr a-muted" style={{ display: 'block' }}>
                {t('cmd.noRouting')}
              </div>
            )}
            {log?.map((r) => (
              <div className="ap-dr" key={r.at + r.handle}>
                <span className="a-mono a-muted">
                  {new Date(r.at).toLocaleString([], {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>{r.title}</span>
                <span>
                  <Pill tone={KIND_TONE.delegate}>{t('cmd.kind.delegate', { n: 1 })}</Pill> {nameOf(r.bot)}
                </span>
                <span className="a-muted">{r.reason}</span>
                <span>{r.reused ? t('cmd.followUp') : t('cmd.newTask')}</span>
              </div>
            ))}
          </Card>
          <Card title={t('cmd.learned')}>
            <Later t={t} stage={3}>
              <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {C.learned.map((l) => (
                  <div
                    key={l.text}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}
                  >
                    <Bot id={l.bot} />
                    <span style={{ flex: 1 }}>{l.text}</span>
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      {l.note}
                    </span>
                  </div>
                ))}
              </div>
            </Later>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
