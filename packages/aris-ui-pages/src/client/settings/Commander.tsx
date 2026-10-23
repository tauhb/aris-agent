/** 2.5 · Commander: bot được giao việc, giới hạn điều phối, quyết định định tuyến gần đây, điều Commander đã học. */
import { Button, Card, Mascot, PageShell, Pill, useTeam } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot, Col, Num } from '../ui.js'
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

function useDispatchLog(): Dispatch[] | null {
  const [log, setLog] = useState<Dispatch[] | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(new URL('api/aris/commander', document.baseURI), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ recent: Dispatch[] }>) : undefined))
        .then((d) => live && d && setLog(d.recent))
        .catch(() => {})
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  return log
}

export function Commander({ t, nav }: PageProps) {
  const team = useTeam()
  const COMMANDER = team.commander
  const log = useDispatchLog()
  const nameOf = (id: string) => team.members.find((m) => m.id === id)?.name ?? id
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mascot id={COMMANDER.mascot ?? COMMANDER.id} size={30} />
          {t('cmd.title', { name: COMMANDER.name })}
        </span>
      }
      subtitle={t('cmd.subtitle')}
      actions={
        <>
          <Pill tone="ok">{t('cmd.on')}</Pill>
          <Button size="sm">{t('cmd.transfer')}</Button>
        </>
      }
    >
      <div className="ap-cols">
        <Col basis={380}>
          <Card title={t('cmd.delegates')} subtitle={t('cmd.delegatesHint')}>
            {team.members.map((m) => (
              <label className="a-row" key={m.id}>
                <Mascot id={m.mascot ?? m.id} size={24} />
                <span className="grow">
                  {m.name} <span className="a-muted">· {m.role}</span>
                </span>
                <input
                  type="checkbox"
                  checked
                  readOnly
                  title={t('cmd.alwaysOn')}
                  aria-label={m.name}
                  style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
                />
              </label>
            ))}
            <label className="a-row">
              <span className="ap-av" style={{ width: 24, height: 24 }}>
                ?
              </span>
              <span className="grow">{t('cmd.helpers')}</span>
              <input
                type="checkbox"
                defaultChecked
                aria-label={t('cmd.helpers')}
                style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
              />
            </label>
          </Card>
          <Card title={t('cmd.limits')}>
            <div className="a-row">
              <span className="grow">{t('cmd.parallel')}</span>
              <Num value="6" label={t('cmd.parallel')} />
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.nested')}</span>
              <Num value="0" label={t('cmd.nested')} />
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.talkBack')}</span>
              <span className="a-muted">{t('cmd.talkBackValue')}</span>
            </div>
            <div className="a-row">
              <span className="grow">{t('cmd.budget')}</span>
              <Num value={C.limits.budget} label={t('cmd.budget')} />
              <span className="a-muted">USD</span>
            </div>
            <label className="a-row">
              <span className="grow">{t('cmd.driver')}</span>
              <input
                type="checkbox"
                aria-label={t('cmd.driver')}
                style={{ width: 18, height: 18, accentColor: 'var(--a-accent)' }}
              />
            </label>
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
            <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {C.learned.map((l) => (
                <div key={l.text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                  <Bot id={l.bot} />
                  <span style={{ flex: 1 }}>{l.text}</span>
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {l.note}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
