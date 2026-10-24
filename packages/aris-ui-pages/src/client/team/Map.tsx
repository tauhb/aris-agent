/**
 * 1.3 · Bản đồ đội bot: sân khấu 3D (Commander giữa, bot xoay quanh, kéo để xoay,
 * bấm bot để xem), chú giải, dòng hoạt động trong ngày, cột phải chi tiết bot đang chọn.
 */
import type { BotStatus } from '@aris/ui-kit'
import {
  Button,
  Mascot,
  PageShell,
  Segmented,
  StatusGlyph,
  TeamOrbit,
  branchColor,
  openBotSession,
  useTeam,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Box } from '../ui.js'
import { DEMO_MAP, DEMO_TIMELINE } from './demo.js'

const TONE: Record<BotStatus, 'accent' | 'warn' | 'ok' | 'danger' | 'muted'> = {
  working: 'accent',
  waiting: 'warn',
  done: 'ok',
  failed: 'danger',
  idle: 'muted',
}

export function TeamMap({ t, nav }: PageProps) {
  const [range, setRange] = useState<'live' | '24h' | '7d'>('live')
  const team = useTeam()
  const COMMANDER = team.commander
  const MEMBERS = team.members
  const ALL = [COMMANDER, ...MEMBERS]
  const [selected, setSelected] = useState<string>()
  const bot = ALL.find((m) => m.id === selected) ?? MEMBERS[0] ?? COMMANDER
  // Chi tiết việc đang làm và dòng hoạt động trong ngày là mẫu tới bước giao việc.
  const detail = DEMO_MAP[bot.id]
  const timeline = DEMO_TIMELINE.filter((row) => ALL.some((m) => m.id === row.id))
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
  const working = MEMBERS.filter((m) => m.status === 'working').length
  const waiting = MEMBERS.filter((m) => m.status === 'waiting').length
  return (
    <div className="ap-split">
      <PageShell
        title={<span style={{ fontSize: 16 }}>{t('map.title')}</span>}
        subtitle={t('map.subtitle', { working, waiting })}
        actions={
          <Segmented
            label={t('map.range')}
            value={range}
            onChange={setRange}
            options={[
              { value: 'live', label: t('map.live') },
              { value: '24h', label: t('map.24h') },
              { value: '7d', label: t('map.7d') },
            ]}
          />
        }
      >
        <div className="ap-stage">
          <TeamOrbit
            variant="stage"
            commander={COMMANDER}
            commanderLabel={t('map.commander', { name: COMMANDER.name })}
            members={MEMBERS}
            selected={bot.id}
            statusLabel={orbitStatus}
            label={t('map.alt', {
              name: COMMANDER.name,
              members: MEMBERS.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
            })}
            onSelect={setSelected}
          />
          <div className="legend">
            <span>
              <StatusGlyph status="working" />
              {t('map.legend.delegating')}
            </span>
            <span>
              <StatusGlyph status="waiting" />
              {t('map.legend.waiting')}
            </span>
            <span>
              <StatusGlyph status="idle" />
              {t('map.legend.idle')}
            </span>
          </div>
        </div>
        <div className="ap-timeline">
          <div className="head">
            <span>{t('map.today')}</span>
            <span>{t('map.span')}</span>
          </div>
          <div className="rows">
            {timeline.length === 0 && <span className="a-muted">{t('map.timelineSoon')}</span>}
            {timeline.map((row) => (
              <div key={row.id} style={{ display: 'contents' }}>
                <span className="a-muted">{ALL.find((m) => m.id === row.id)?.name}</span>
                <div
                  className="bar"
                  style={{
                    background: `linear-gradient(90deg, ${[
                      'transparent 0',
                      ...row.spans.flatMap(([a, b]) => [
                        `transparent ${a}%`,
                        `${branchColor(row.id)} ${a}%`,
                        `${branchColor(row.id)} ${b}%`,
                        `transparent ${b}%`,
                      ]),
                      'transparent 100%',
                    ].join(', ')})`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </PageShell>
      <aside className="ap-aside" aria-label={t('map.selected')}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="ap-tile">
            <Mascot id={bot.mascot ?? bot.id} size={44} motion={bot.status} seed={bot.id} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>{bot.name}</span>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {bot.handle ? `@${bot.handle} · ` : ''}
              {bot.role}
            </span>
          </div>
        </div>
        <span
          className={`a-pill ${TONE[bot.status]}`}
          style={{ alignSelf: 'flex-start', fontSize: 12, padding: '2px 10px', lineHeight: 'normal' }}
        >
          {t(`state.${bot.status}`)}
        </span>
        {detail && (
          <>
            <Box style={{ padding: '12px 14px' }}>
              <div className="ap-k">{t('map.task')}</div>
              <div style={{ fontWeight: 600, margin: '2px 0 10px' }}>{detail.task}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {detail.steps.map((s) => (
                  <div key={s.text} className={`a-step ${s.status}`}>
                    <StatusGlyph status={s.status} label={t(`state.${s.status}`)} />
                    {s.text}
                  </div>
                ))}
              </div>
            </Box>
            <div className="ap-grid-2" style={{ gap: 10, fontSize: 12.5 }}>
              <Box style={{ padding: '8px 10px' }}>
                <div className="a-muted">{t('map.memory')}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{detail.memory}</div>
              </Box>
              <Box style={{ padding: '8px 10px' }}>
                <div className="a-muted">{t('map.cost')}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{detail.cost}</div>
              </Box>
            </div>
            <div style={{ fontSize: 12.5 }}>
              <div className="a-muted" style={{ paddingBottom: 6 }}>
                {t('map.bestSkill')}
              </div>
              <span className="ap-stamp">
                <span>{detail.skillVersion}</span>
                {detail.skill}
              </span>
            </div>
          </>
        )}
        <div
          style={{
            marginTop: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={() =>
              bot.id === COMMANDER.id
                ? nav.openPanel(null)
                : team.bots.find((b) => b.id === bot.id)?.external
                  ? nav.go('bot', { id: bot.id })
                  : void openBotSession(bot.id).then(
                      (id) => nav.openSession(id),
                      () => {},
                    )
            }
          >
            {t('map.openChat')}
          </Button>
          <Button size="lg" onClick={() => nav.go('bot', { id: bot.id })}>
            {t('map.profile')}
          </Button>
        </div>
      </aside>
    </div>
  )
}
