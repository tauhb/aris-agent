/** 2.2 · Hồ sơ bot: tính cách, model theo việc, skill và công cụ, quyền và kênh; cột phải tóm tắt hoạt động. */
import { COMMANDER, DEMO_TEAM } from '@aris/ui-kit'
import { Button, Card, CardRow, Mascot, Tag } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Box } from '../ui.js'
import { DEMO_PROFILE as P } from './demo.js'

const ALL = [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)]
type Tab = 'soul' | 'model' | 'skills' | 'perms'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }

export function BotProfile({ t, nav, params }: PageProps) {
  const [tab, setTab] = useState<Tab>('soul')
  const bot = ALL.find((m) => m.id === params.id) ?? ALL.find((m) => m.id === P.id)!
  const name = bot.name
  const tabs: [Tab, string][] = [
    ['soul', t('bot.soul')],
    ['model', t('bot.model')],
    ['skills', t('bot.skills')],
    ['perms', t('bot.perms')],
  ]
  return (
    <div className="ap-split">
      <main className="a-page">
        <div
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '18px 24px 0' }}
        >
          <Mascot id={bot.id} size={52} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 className="a-page-title" style={{ fontSize: 20, fontWeight: 700 }}>
              {name}
            </h1>
            <span className="a-muted" style={{ fontSize: 13 }}>
              {bot.id === P.id ? P.about : bot.role}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={() => nav.openPanel(null)}>
              {t('bot.openChat')}
            </Button>
            <Button onClick={() => nav.go('clone-bot', { id: bot.id })}>{t('bot.clone')}</Button>
          </div>
        </div>
        <div
          className="a-tabs"
          role="tablist"
          aria-label={t('bot.tabs')}
          style={{ padding: '8px 24px 0', flexWrap: 'wrap' }}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="a-tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="a-tab" onClick={() => nav.go('routine')}>
            {t('bot.routines', { n: P.routines })}
          </button>
          <button type="button" className="a-tab" onClick={() => nav.go('memory', { bot: bot.id })}>
            {t('bot.memory')}
          </button>
          <button type="button" className="a-tab" onClick={() => nav.go('owner', { bot: bot.id })}>
            {t('bot.owner')}
          </button>
        </div>
        <div className="a-page-body" style={{ maxWidth: 860, padding: '20px 24px' }}>
          {tab === 'soul' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{t('bot.soulTitle')}</span>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {P.soulMeta}
                </span>
              </div>
              <textarea
                className="ap-soul a-mono"
                defaultValue={P.soul}
                rows={6}
                aria-label={t('bot.soulTitle')}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button>{t('bot.history')}</Button>
                <Button>{t('bot.rewrite')}</Button>
                <span style={{ flex: 1 }} />
                <Button variant="primary">{t('bot.save')}</Button>
              </div>
              <Box style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px' }}>
                <span className="a-muted" style={{ fontSize: 18, lineHeight: 1 }}>
                  ⓘ
                </span>
                <span className="a-muted" style={{ fontSize: 13 }}>
                  {t('bot.soulNote', { name })}
                </span>
              </Box>
            </>
          )}
          {tab === 'model' && (
            <Card title={t('bot.modelTitle', { name })}>
              {P.models.map((m) => (
                <CardRow key={m.task}>
                  <span style={{ width: 180, flex: 'none' }}>{m.task}</span>
                  <Tag>{m.provider}</Tag>
                  <b>{m.model}</b>
                  {m.note && (
                    <span className="a-muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
                      {m.note}
                    </span>
                  )}
                </CardRow>
              ))}
              <div className="a-row" style={{ justifyContent: 'flex-end' }}>
                <a className="ap-link" onClick={() => nav.go('settings', { section: 'provider' })}>
                  {t('bot.manageProviders')}
                </a>
              </div>
            </Card>
          )}
          {tab === 'skills' && (
            <>
              <Card
                title={t('bot.skillCount', { n: P.skillCount })}
                actions={
                  <a className="ap-link" onClick={() => nav.go('skills')}>
                    {t('bot.openLibrary')}
                  </a>
                }
              >
                {P.skills.map((s) => (
                  <CardRow key={s.id}>
                    <span className="a-mono grow">{s.id}</span>
                    <Tag>{s.v}</Tag>
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      {s.note}
                    </span>
                  </CardRow>
                ))}
              </Card>
              <Card title={t('bot.toolset')}>
                {P.tools.map((tool) => (
                  <label className="a-row" key={tool.text}>
                    <input type="checkbox" defaultChecked={tool.on} style={check} />
                    {tool.text}
                  </label>
                ))}
              </Card>
            </>
          )}
          {tab === 'perms' && (
            <>
              <Card title={t('bot.permTitle')}>
                {P.permissions.map(([k, v]) => (
                  <CardRow key={k} label={k}>
                    <span className="a-muted">{v}</span>
                  </CardRow>
                ))}
                <label className="a-row">
                  <span className="grow">{t('bot.delegable', { name })}</span>
                  <input type="checkbox" defaultChecked style={check} />
                </label>
              </Card>
              <Card title={t('bot.channels')}>
                {P.channels.map((c) => (
                  <CardRow key={c.text} label={c.text}>
                    {c.connected ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--a-ok)' }}>
                        {t('bot.connected')}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => nav.go('settings', { section: 'channels' })}>
                        {t('bot.connect')}
                      </Button>
                    )}
                  </CardRow>
                ))}
              </Card>
            </>
          )}
        </div>
      </main>
      <aside className="ap-aside" aria-label={t('bot.summary')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ap-dot" style={{ width: 8, height: 8, background: 'var(--a-ok)' }} />
          <b>{t('bot.workingOn')}</b>
          <span className="a-muted" style={{ fontSize: 13 }}>
            {P.now}
          </span>
        </div>
        <div className="ap-grid-2" style={{ gap: 10 }}>
          {P.stats.map(([k, v]) => (
            <Box key={k} style={{ padding: '10px 12px' }}>
              <div className="ap-lb">{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
            </Box>
          ))}
        </div>
        <div>
          <div className="ap-lb" style={{ paddingBottom: 6 }}>
            {t('bot.delegatedTags', { name })}
          </div>
          <div className="ap-tags" style={{ gap: 6 }}>
            {P.delegatedTags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        </div>
        <div>
          <div className="ap-lb" style={{ paddingBottom: 6 }}>
            {t('bot.learned')}
          </div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {P.learned.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
