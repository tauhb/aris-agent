/**
 * 6.3 · Kênh và ghép đôi (đặc tả: docs/specs/aris-telegram.md), bố cục theo canvas: tài khoản
 * bot Telegram, nhóm, mã ghép đôi, người đã ghép đôi, cách xử lý khi nhắn thêm lúc bot đang
 * làm. Dữ liệu thật qua `/api/aris/channels`. Lark và Zalo làm sau.
 */
import {
  Button,
  Card,
  CardRow,
  PageShell,
  Pill,
  Segmented,
  Switch,
  TextInput,
  useTeamData,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot, Box, Col } from '../ui.js'
import { useChannels, type ChannelGroup, type PairCode } from './channels-api.js'

type T = PageProps['t']

function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [every])
  return now
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function PairBox({
  t,
  codes,
  onCreate,
  busy,
}: {
  t: T
  codes: PairCode[]
  onCreate: (role: 'owner' | 'member') => void
  busy: boolean
}) {
  const now = useNow()
  const live = codes.filter((c) => c.expiresAt > now).sort((a, b) => b.expiresAt - a.expiresAt)
  const code = live[0]
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>{t('ch.pairTitle')}</b>
      <div className="a-muted" style={{ fontSize: 13 }}>
        {t('ch.pairHint')}
      </div>
      {code ? (
        <>
          <div className="a-mono ap-paircode">{code.code}</div>
          <div className="a-muted" style={{ fontSize: 12, textAlign: 'center' }}>
            {t(code.role === 'owner' ? 'ch.codeOwner' : 'ch.codeMember')} ·{' '}
            {t('ch.pairExpires', { t: mmss(code.expiresAt - now) })}
          </div>
        </>
      ) : (
        <div className="a-muted ap-paircode empty">{t('ch.noCode')}</div>
      )}
      <span style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => onCreate('owner')}>
          {t('ch.newOwnerCode')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onCreate('member')}>
          {t('ch.newMemberCode')}
        </Button>
      </span>
    </Box>
  )
}

function GroupRow({
  t,
  g,
  act,
  busy,
}: {
  t: T
  g: ChannelGroup
  act: (b: Record<string, unknown>) => Promise<boolean>
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(g.prompt ?? '')
  return (
    <div className="ap-grouprow">
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="grow" style={{ minWidth: 0 }}>
          <b>{g.title}</b>{' '}
          <span className="a-muted a-mono" style={{ fontSize: 11.5 }}>
            {g.chatId}
          </span>
          <div className="a-muted" style={{ fontSize: 12 }}>
            {g.allowed ? t(g.who === 'everyone' ? 'ch.whoEveryone' : 'ch.whoAllowed') : t('ch.groupBlocked')}
          </div>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
          {t(open ? 'ch.less' : 'ch.more')}
        </Button>
        <Switch
          label={t('ch.allowGroup')}
          checked={g.allowed}
          disabled={busy}
          onChange={(v) => void act({ op: 'group', chatId: g.chatId, allowed: v })}
        />
      </span>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <Segmented
            label={t('ch.who')}
            value={g.who}
            onChange={(who) => void act({ op: 'group', chatId: g.chatId, who })}
            options={[
              { value: 'allowed', label: t('ch.whoAllowedShort') },
              { value: 'everyone', label: t('ch.whoEveryoneShort') },
            ]}
          />
          <label className="a-field">
            <span className="l">{t('ch.groupPrompt')}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <TextInput
                value={prompt}
                placeholder={t('ch.groupPromptHint')}
                onChange={(e) => setPrompt(e.target.value)}
                aria-label={t('ch.groupPrompt')}
              />
              <Button
                size="sm"
                disabled={busy || prompt === (g.prompt ?? '')}
                onClick={() => void act({ op: 'group', chatId: g.chatId, prompt })}
              >
                {t('ch.save')}
              </Button>
            </span>
          </label>
          <span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void act({ op: 'group-remove', chatId: g.chatId })}
            >
              {t('ch.removeGroup')}
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}

export function Channels({ t }: PageProps) {
  const { data, error, busy, act } = useChannels()
  const team = useTeamData()
  const [token, setToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [target, setTarget] = useState('aris')
  const connected = data?.bots ?? []
  const aris = connected.find((b) => b.bot === 'aris')
  const allowedGroups = data?.groups.filter((g) => g.allowed) ?? []
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  // Mỗi bot của aris (trừ bot ngoài) có tối đa một tài khoản Telegram.
  const free = (team?.bots ?? []).filter((b) => !b.external && !connected.some((c) => c.bot === b.id))
  const chosen = free.some((b) => b.id === target) ? target : (free[0]?.id ?? '')

  async function connect() {
    if (await act({ op: 'connect', bot: chosen, token })) {
      setToken('')
      setAdding(false)
    }
  }

  return (
    <PageShell title={t('sec.channels')} subtitle={t('ch.subtitle')}>
      {error && <div className="ap-error">{error}</div>}
      <div className="ap-cols">
        <Col grow={1.2} basis={440}>
          <Card
            title={
              <>
                Telegram{' '}
                {connected.length ? (
                  <Pill tone={connected.some((c) => c.error) ? 'danger' : 'ok'}>
                    {t('ch.connectedCount', { n: connected.length })}
                  </Pill>
                ) : (
                  <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                    {t('ch.notConnected')}
                  </span>
                )}
              </>
            }
            actions={
              free.length && !adding ? (
                <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                  {t('ch.addTelegram')}
                </Button>
              ) : undefined
            }
          >
            {connected.map((c) => {
              const bot = botOf(c.bot)
              return (
                <div key={c.bot}>
                  <CardRow>
                    <Bot id={bot?.mascot ?? 'aris'} />
                    <span className="grow">
                      {bot?.name ?? c.bot} · <span className="a-mono">@{c.username}</span>
                    </span>
                    {c.error ? (
                      <Pill tone="danger">{t('ch.error')}</Pill>
                    ) : (
                      <span className="a-muted">{t(c.bot === 'aris' ? 'ch.mainEntry' : 'ch.ownChat')}</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void act({ op: 'disconnect', bot: c.bot })}
                    >
                      {t('ch.disconnect')}
                    </Button>
                  </CardRow>
                  {c.error && (
                    <CardRow>
                      <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{c.error}</span>
                    </CardRow>
                  )}
                  {!c.canReadAll && allowedGroups.length > 0 && (
                    <CardRow>
                      <span style={{ color: 'var(--a-warn)', fontSize: 12.5 }}>{t('ch.privacyWarn')}</span>
                    </CardRow>
                  )}
                </div>
              )
            })}
            {aris && (
              <>
                {!aris.canReadAll && !allowedGroups.length && (
                  <CardRow>
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      {t('ch.privacyInfo')}
                    </span>
                  </CardRow>
                )}
                <CardRow label={t('ch.voice')}>
                  <Switch
                    label={t('ch.voice')}
                    checked={aris.voice}
                    disabled={busy}
                    onChange={(on) => void act({ op: 'voice', bot: 'aris', on })}
                  />
                </CardRow>
                <CardRow label={t('ch.home')}>
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {aris.home ? <span className="a-mono">{aris.home.chatId}</span> : t('ch.homeNone')}
                  </span>
                </CardRow>
              </>
            )}
            {adding && (
              <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="a-field">
                  <span className="l">{t('ch.forBot')}</span>
                  <select className="a-inp" value={chosen} onChange={(e) => setTarget(e.target.value)}>
                    {free.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.id === 'aris' ? t('ch.mainEntry') : b.role}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="a-muted" style={{ fontSize: 12.5 }}>
                  {t(chosen === 'aris' ? 'ch.tokenHint' : 'ch.tokenHintBot', {
                    name: botOf(chosen)?.name ?? '',
                  })}
                </div>
                <span style={{ display: 'flex', gap: 6 }}>
                  <TextInput
                    mono
                    type="password"
                    autoComplete="off"
                    value={token}
                    placeholder="123456789:AA…"
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void connect()}
                    aria-label={t('ch.token')}
                  />
                  <Button
                    variant="primary"
                    disabled={busy || !token.trim() || !chosen}
                    onClick={() => void connect()}
                  >
                    {t('ch.connect')}
                  </Button>
                  <Button variant="ghost" onClick={() => setAdding(false)}>
                    {t('ch.cancel')}
                  </Button>
                </span>
              </div>
            )}
            {!connected.length && !adding && (
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('ch.telegramEmpty')}
                </span>
              </CardRow>
            )}
          </Card>

          <Card title={t('ch.groups')} subtitle={t('ch.groupsHint')}>
            {data?.groups.length ? (
              data.groups.map((g) => <GroupRow key={g.chatId} t={t} g={g} act={act} busy={busy} />)
            ) : (
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('ch.noGroups')}
                </span>
              </CardRow>
            )}
            <CardRow label={t('ch.guestMode')}>
              <Switch
                label={t('ch.guestMode')}
                checked={data?.settings.guestMode ?? false}
                disabled={busy || !data}
                onChange={(guestMode) => void act({ op: 'settings', guestMode })}
              />
            </CardRow>
          </Card>

          <Card
            title={
              <>
                Lark{' '}
                <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {t('ch.later')}
                </span>
              </>
            }
          />
          <Card
            title={
              <>
                Zalo OA{' '}
                <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {t('ch.later')}
                </span>
              </>
            }
          />
        </Col>
        <Col basis={340}>
          <PairBox
            t={t}
            codes={data?.codes ?? []}
            busy={busy}
            onCreate={(role) => void act({ op: 'code', role })}
          />
          <Card title={t('ch.paired')}>
            {(data?.people ?? []).map((p) => (
              <CardRow key={p.userId}>
                <span className="grow">
                  {p.name}
                  {p.username ? <span className="a-muted"> @{p.username}</span> : null} · Telegram
                </span>
                <span className="a-muted">{t(p.role === 'owner' ? 'ch.fullAccess' : 'ch.chatOnly')}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void act({ op: 'revoke', userId: p.userId })}
                >
                  {t('ch.revoke')}
                </Button>
              </CardRow>
            ))}
            <CardRow>
              <span className="a-muted">{t('ch.strangers')}</span>
            </CardRow>
          </Card>
          <Card title={t('ch.busyTitle')}>
            <CardRow>
              <Segmented
                label={t('ch.busy')}
                value={data?.settings.busy ?? 'steer'}
                onChange={(b) => void act({ op: 'settings', busy: b })}
                options={[
                  { value: 'steer', label: t('ch.steer') },
                  { value: 'queue', label: t('ch.queue') },
                  { value: 'interrupt', label: t('ch.restart') },
                ]}
              />
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
