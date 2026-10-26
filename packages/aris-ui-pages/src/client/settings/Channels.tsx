/**
 * 6.3 · Kênh và ghép đôi (đặc tả: docs/specs/aris-telegram.md), bố cục theo design/canvas/Kenh.dc.html:
 * mỗi kênh một phần (Telegram: tài khoản bot, ghép đôi bằng mã riêng của kênh, người đã ghép đôi,
 * nhóm; Lark đợt 7d và Zalo cá nhân đợt 7e còn trống), cuối trang là thẻ dùng chung cho mọi kênh:
 * cách xử lý khi nhắn thêm lúc bot đang làm. Dữ liệu thật qua `/api/aris/channels`.
 */
import {
  Button,
  Card,
  CardRow,
  PageShell,
  Pill,
  Segmented,
  Select,
  Switch,
  TextInput,
  useTeamData,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { botOption } from '../options.js'
import { Bot } from '../ui.js'
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

/** Cột "Ghép đôi" của Telegram: chọn mã cho ai, mã to, hướng dẫn nhắn cho bot nào, hạn dùng. */
function PairColumn({
  t,
  codes,
  botName,
  onCreate,
  busy,
}: {
  t: T
  codes: PairCode[]
  /** `@username` thật của bot Aris trên Telegram; không có khi chưa kết nối tài khoản nào. */
  botName: string | undefined
  onCreate: (role: 'owner' | 'member') => void
  busy: boolean
}) {
  const now = useNow()
  const [role, setRole] = useState<'owner' | 'member'>('owner')
  // Chỉ lấy mã của kênh Telegram (mã kênh khác không dùng được ở đây).
  const code = codes
    .filter((c) => c.channel === 'telegram' && c.role === role && c.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0]
  const bot = botName ? `@${botName}` : ''
  return (
    <div className="ap-kn-col ap-kn-pair">
      <b>{t('ch.pairing')}</b>
      <Segmented
        label={t('ch.pairFor')}
        value={role}
        onChange={setRole}
        options={[
          { value: 'owner', label: t('ch.pairForYou') },
          { value: 'member', label: t('ch.pairForOther') },
        ]}
      />
      {code ? (
        <div className="a-mono ap-kn-code">{code.code}</div>
      ) : (
        <div className="a-muted ap-kn-code empty">{t('ch.noCode')}</div>
      )}
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        {botName
          ? t(role === 'owner' ? 'ch.codeHintOwner' : 'ch.codeHintMember', { bot })
          : t('ch.codeHintNoBot')}
      </div>
      {code && (
        <div className="a-muted" style={{ fontSize: 12 }}>
          {t('ch.codeMeta', { t: mmss(code.expiresAt - now) })}
        </div>
      )}
      <span>
        <Button size="sm" disabled={busy} onClick={() => onCreate(role)}>
          {t(code ? 'ch.newCode' : 'ch.makeCode')}
        </Button>
      </span>
    </div>
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

/** Phần của một kênh chưa làm: cùng khung như Telegram, ghi rõ đợt sẽ làm. */
function PlannedChannel({ t, name, batch }: { t: T; name: string; batch: string }) {
  return (
    <Card
      title={
        <>
          {name}{' '}
          <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
            {t('ch.notConnectedBatch', { b: batch })}
          </span>
        </>
      }
    >
      <div className="a-row a-muted ap-kn-first" style={{ fontSize: 13 }}>
        {t('ch.frameNote', { b: batch })}
      </div>
    </Card>
  )
}

export function Channels({ t }: PageProps) {
  const { data, error, busy, act } = useChannels()
  const team = useTeamData()
  const [token, setToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [target, setTarget] = useState('aris')
  const connected = data?.bots ?? []
  const aris = connected.find((b) => b.bot === 'aris')
  const groups = data?.groups ?? []
  const allowedGroups = groups.filter((g) => g.allowed)
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  // Mỗi bot của aris (trừ bot ngoài) có tối đa một tài khoản Telegram.
  const free = (team?.bots ?? []).filter((b) => !b.external && !connected.some((c) => c.bot === b.id))
  const chosen = free.some((b) => b.id === target) ? target : (free[0]?.id ?? '')
  // Tên bot ghi trong hướng dẫn nhắn mã: bot Aris nếu đã kết nối, không thì tài khoản đầu tiên.
  const pairBot = (aris ?? connected[0])?.username

  async function connect() {
    if (await act({ op: 'connect', bot: chosen, token })) {
      setToken('')
      setAdding(false)
    }
  }

  return (
    <PageShell title={t('sec.channels')} subtitle={t('ch.subtitle')}>
      {error && <div className="ap-error">{error}</div>}
      <div className="ap-col">
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
        >
          <div className="ap-kn-cols">
            <div className="ap-kn-col ap-kn-accounts">
              <div className="a-row ap-kn-first">
                <b className="grow" style={{ fontSize: 13 }}>
                  {t('ch.accounts')}
                </b>
                {free.length && !adding ? (
                  <Button size="sm" onClick={() => setAdding(true)}>
                    {t('ch.addAccount')}
                  </Button>
                ) : null}
              </div>
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
                        <span className="a-muted" style={{ fontSize: 12 }}>
                          {t(c.bot === 'aris' ? 'ch.mainEntry' : 'ch.ownChat')}
                        </span>
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
                <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="a-field">
                    <span className="l">{t('ch.forBot')}</span>
                    <Select
                      label={t('ch.forBot')}
                      value={chosen}
                      onChange={setTarget}
                      searchPlaceholder={t('sel.search')}
                      emptyLabel={t('sel.empty')}
                      options={free.map((b) =>
                        botOption(b, b.id === 'aris' ? { note: t('ch.mainEntry') } : {}),
                      )}
                    />
                  </div>
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
            </div>

            <PairColumn
              t={t}
              codes={data?.codes ?? []}
              botName={pairBot}
              busy={busy}
              onCreate={(role) => void act({ op: 'code', role, channel: 'telegram' })}
            />

            <div className="ap-kn-col ap-kn-people">
              <div className="a-row ap-kn-first">
                <b className="grow" style={{ fontSize: 13 }}>
                  {t('ch.pairedTg')}
                </b>
              </div>
              {(data?.people ?? []).map((p) => (
                <CardRow key={p.userId}>
                  <span className="grow">
                    {p.name}
                    {p.username ? <span className="a-muted"> @{p.username}</span> : null}
                  </span>
                  {p.role === 'owner' ? (
                    <Pill tone="ok">{t('ch.roleOwner')}</Pill>
                  ) : (
                    <span className="a-muted" style={{ fontSize: 12 }}>
                      {t('ch.roleMember')}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act({ op: 'revoke', userId: p.userId })}
                  >
                    {t('ch.unpair')}
                  </Button>
                </CardRow>
              ))}
              {data && !data.people.length && (
                <CardRow>
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('ch.noPeople')}
                  </span>
                </CardRow>
              )}
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('ch.pairNote')}
                </span>
              </CardRow>
            </div>
          </div>

          <div className="a-row ap-kn-groups">
            <b style={{ fontSize: 13 }}>{t('ch.groups')}</b>
            <span className="grow a-muted" style={{ fontSize: 12.5 }}>
              {groups.length
                ? `${t('ch.groupsSummary', { n: groups.length, m: allowedGroups.length })}${
                    allowedGroups.length ? ` · ${allowedGroups.map((g) => g.title).join(', ')}` : ''
                  }`
                : t('ch.noGroups')}
            </span>
            <Button size="sm" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)}>
              {t(groupsOpen ? 'ch.less' : 'ch.groupSettings')}
            </Button>
          </div>
          {groupsOpen && (
            <div>
              <div className="a-row a-muted" style={{ fontSize: 12.5 }}>
                {t('ch.groupsHint')}
              </div>
              {groups.map((g) => (
                <GroupRow key={g.chatId} t={t} g={g} act={act} busy={busy} />
              ))}
              <CardRow label={t('ch.guestMode')}>
                <Switch
                  label={t('ch.guestMode')}
                  checked={data?.settings.guestMode ?? false}
                  disabled={busy || !data}
                  onChange={(guestMode) => void act({ op: 'settings', guestMode })}
                />
              </CardRow>
            </div>
          )}
        </Card>

        <PlannedChannel t={t} name="Lark" batch="7d" />
        <PlannedChannel t={t} name={t('ch.zalo')} batch="7e" />

        <Card
          title={t('ch.busyTitle')}
          subtitle={t('ch.busyScope')}
          actions={
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
          }
        />
      </div>
    </PageShell>
  )
}
