/** 6.3b · Mặt tích hợp: ACP, API kiểu OpenAI, MCP, A2A — bật/tắt từng mặt, bot và tool được mở ra. */
import { Button, Card, CardRow, PageShell, Pill, Tag } from '@aris/ui-kit/react'
import { useState, type ReactNode } from 'react'
import type { PageProps, Translate } from '../page.js'
import { Bot, Col } from '../ui.js'
import { DEMO_INTEGRATIONS as I } from './demo.js'
import { COMMANDER, DEMO_TEAM } from '@aris/ui-kit'

const NAMES = Object.fromEntries(
  [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)].map((m) => [m.id, m.name]),
)

function Bots({ ids }: { ids: readonly string[] }) {
  return (
    <span className="ap-tags grow">
      {ids.map((id) => (
        <Tag key={id}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--a-ink)' }}>
            <Bot id={id} size={14} />
            {NAMES[id]}
          </span>
        </Tag>
      ))}
    </span>
  )
}

function Surface({
  title,
  usedBy,
  on,
  live,
  offText,
  onToggle,
  t,
  children,
}: {
  title: string
  usedBy: string
  on: boolean
  live: string
  offText: string
  onToggle: () => void
  t: Translate
  children: ReactNode
}) {
  return (
    <Card
      title={
        <>
          {title}{' '}
          <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
            {usedBy}
          </span>
        </>
      }
      actions={
        <>
          <Pill tone={on ? 'ok' : 'muted'}>{on ? live : t('int.off')}</Pill>
          <Button size="sm" aria-pressed={on} onClick={onToggle}>
            {on ? t('int.turnOff') : t('int.turnOn')}
          </Button>
        </>
      }
    >
      {on ? (
        children
      ) : (
        <CardRow>
          <span className="a-muted">{offText}</span>
        </CardRow>
      )}
    </Card>
  )
}

export function Integrations({ t }: PageProps) {
  const [on, setOn] = useState({ acp: I.acp.on, api: I.api.on, mcp: I.mcp.on, a2a: I.a2a.on })
  const flip = (k: keyof typeof on) => () => setOn({ ...on, [k]: !on[k] })
  return (
    <PageShell title={t('sec.integrations')} subtitle={t('int.subtitle', { summary: I.summary })}>
      <div className="ap-cols">
        <Col basis={420}>
          <Surface
            title="ACP"
            usedBy={t('int.acpFor')}
            on={on.acp}
            live={I.acp.live}
            offText={t('int.acpOff')}
            onToggle={flip('acp')}
            t={t}
          >
            <CardRow>
              <span className="a-muted">{t('int.command')}</span>
              <span className="grow">
                <Tag mono>{I.acp.cmd}</Tag>
              </span>
              <Button size="sm">{t('int.copy')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.botsExposed')}</span>
              <Bots ids={I.acp.bots} />
              <Button size="sm">{t('int.edit')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.acpNote')}</span>
            </CardRow>
          </Surface>
          <Surface
            title={t('int.apiTitle')}
            usedBy={t('int.apiFor')}
            on={on.api}
            live={I.api.live}
            offText={t('int.apiOff')}
            onToggle={flip('api')}
            t={t}
          >
            <CardRow>
              <span className="a-muted">{t('int.address')}</span>
              <span className="grow">
                <Tag mono>{I.api.url}</Tag>
              </span>
              <Button size="sm">{t('int.copy')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.key')}</span>
              <span className="grow">
                <Tag mono>{I.api.key}</Tag>
              </span>
              <Button size="sm">{t('int.regenerate')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.botsExposed')}</span>
              <Bots ids={I.api.bots} />
              <Button size="sm">{t('int.edit')}</Button>
            </CardRow>
          </Surface>
        </Col>
        <Col basis={420}>
          <Surface
            title={t('int.mcpTitle')}
            usedBy={t('int.mcpFor')}
            on={on.mcp}
            live={I.mcp.live}
            offText={t('int.mcpOff')}
            onToggle={flip('mcp')}
            t={t}
          >
            <CardRow>
              <span className="a-muted">{t('int.toolsExposed')}</span>
              <span className="ap-tags grow">
                {I.mcp.tools.map((tool) => (
                  <Tag key={tool} mono>
                    {tool}
                  </Tag>
                ))}
              </span>
              <Button size="sm">{t('int.edit')}</Button>
            </CardRow>
          </Surface>
          <Surface
            title="A2A"
            usedBy={t('int.a2aFor')}
            on={on.a2a}
            live={I.a2a.live}
            offText={t('int.a2aOff')}
            onToggle={flip('a2a')}
            t={t}
          >
            <CardRow>
              <span className="a-muted">{t('int.peers')}</span>
              <span className="ap-tags grow">
                {I.a2a.peers.map((p) => (
                  <Tag key={p} mono>
                    {p}
                  </Tag>
                ))}
              </span>
              <Button size="sm">{t('int.add')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.botsExposed')}</span>
              <Bots ids={I.a2a.bots} />
              <Button size="sm">{t('int.edit')}</Button>
            </CardRow>
          </Surface>
          <Card>
            <CardRow>
              <b className="grow">{t('int.memberRights')}</b>
              <span className="a-muted">{t('int.member')}</span>
              <Button size="sm">{t('int.view')}</Button>
            </CardRow>
            <CardRow>
              <span className="a-muted grow">{I.access}</span>
              <Button size="sm">{t('int.log')}</Button>
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
