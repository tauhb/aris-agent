/**
 * 6.3 · Kênh và ghép đôi (đặc tả: docs/specs/aris-telegram.md), bố cục theo design/canvas/Kenh.dc.html
 * và KenhLark.dc.html: mỗi kênh một phần (Telegram: tài khoản bot, ghép đôi bằng mã riêng của kênh,
 * người đã ghép đôi, nhóm; Lark đợt 7d: 5 bước tạo ứng dụng, dán khoá, ghép đôi riêng của Lark; Zalo
 * cá nhân đợt 7e còn trống), cuối trang là thẻ dùng chung cho mọi kênh: cách xử lý khi nhắn thêm lúc
 * bot đang làm. Dữ liệu thật qua `/api/aris/channels`.
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
  type BotOption,
} from '@aris/ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { botOption } from '../options.js'
import { Bot } from '../ui.js'
import {
  useChannels,
  type ChannelGroup,
  type ChannelSnapshot,
  type LarkApp,
  type LarkGroup,
  type PairCode,
} from './channels-api.js'

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

/** Chữ hướng dẫn theo kênh của cột ghép đôi. */
const PAIR_KEYS = {
  telegram: {
    owner: 'ch.codeHintOwner',
    member: 'ch.codeHintMember',
    none: 'ch.codeHintNoBot',
    meta: 'ch.codeMeta',
  },
  lark: {
    owner: 'lk.codeHintOwner',
    member: 'lk.codeHintMember',
    none: 'lk.codeHintNoApp',
    meta: 'lk.codeMeta',
  },
} as const

/** Cột "Ghép đôi" của một kênh: chọn mã cho ai, mã to, hướng dẫn nhắn cho bot nào, hạn dùng. */
function PairColumn({
  t,
  channel,
  codes,
  botName,
  onCreate,
  busy,
}: {
  t: T
  channel: 'telegram' | 'lark'
  codes: PairCode[]
  /** Tên bot để ghi trong hướng dẫn (`@username` thật trên Telegram); không có khi chưa kết nối tài khoản nào. */
  botName: string | undefined
  onCreate: (role: 'owner' | 'member') => void
  busy: boolean
}) {
  const now = useNow()
  const [role, setRole] = useState<'owner' | 'member'>('owner')
  const keys = PAIR_KEYS[channel]
  // Chỉ lấy mã của đúng kênh này (mã kênh khác không dùng được ở đây).
  const code = codes
    .filter((c) => c.channel === channel && c.role === role && c.expiresAt > now)
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
        {botName ? t(role === 'owner' ? keys.owner : keys.member, { bot }) : t(keys.none)}
      </div>
      {code && (
        <div className="a-muted" style={{ fontSize: 12 }}>
          {t(keys.meta, { t: mmss(code.expiresAt - now) })}
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
  op = 'group',
  act,
  busy,
}: {
  t: T
  /** Nhóm Telegram (mã số) hay nhóm Lark (`chat_id`); `op` là thao tác tương ứng của API. */
  g: ChannelGroup | LarkGroup
  op?: 'group' | 'lark-group'
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
          onChange={(v) => void act({ op, chatId: g.chatId, allowed: v })}
        />
      </span>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <Segmented
            label={t('ch.who')}
            value={g.who}
            onChange={(who) => void act({ op, chatId: g.chatId, who })}
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
                onClick={() => void act({ op, chatId: g.chatId, prompt })}
              >
                {t('ch.save')}
              </Button>
            </span>
          </label>
          <span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void act({ op: `${op}-remove`, chatId: g.chatId })}
            >
              {t('ch.removeGroup')}
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}

/** Quyền cấp cho ứng dụng Lark (bước 3) và sự kiện cần đăng ký (bước 4). */
const LARK_SCOPES = 'im:message · im:message:send_as_bot · im:chat:read · contact:user.base:readonly'
const LARK_EVENT = 'im.message.receive_v1'

function LarkStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="a-row ap-lk-step">
      <span className="ap-lk-num">{n}</span>
      <span className="grow">
        <b style={{ fontSize: 13.5 }}>{title}</b>
        <span className="sub">{children}</span>
      </span>
    </div>
  )
}

/** Dán App ID, App Secret, chọn Lark quốc tế hay Feishu rồi kết nối. App Secret chỉ đi vào, không hiện lại. */
function LarkConnect({
  t,
  bot,
  bots,
  onBot,
  act,
  busy,
  onDone,
  onCancel,
}: {
  t: T
  bot: string
  /** Bot của aris còn chưa có ứng dụng Lark, để chọn khi thêm ứng dụng thứ hai trở đi. */
  bots: BotOption[] | undefined
  onBot: (bot: string) => void
  act: (b: Record<string, unknown>) => Promise<boolean>
  busy: boolean
  onDone?: () => void
  onCancel?: () => void
}) {
  const [appId, setAppId] = useState('')
  const [secret, setSecret] = useState('')
  const [domain, setDomain] = useState<'lark' | 'feishu'>('lark')
  async function connect() {
    if (await act({ op: 'connect-lark', bot, appId, appSecret: secret, domain })) {
      setAppId('')
      setSecret('')
      onDone?.()
    }
  }
  return (
    <>
      <b style={{ fontSize: 13.5 }}>{t('lk.paste')}</b>
      {bots && (
        <div className="a-field">
          <span className="l">{t('ch.forBot')}</span>
          <Select
            label={t('ch.forBot')}
            value={bot}
            onChange={onBot}
            searchPlaceholder={t('sel.search')}
            emptyLabel={t('sel.empty')}
            options={bots}
          />
        </div>
      )}
      <TextInput
        mono
        autoComplete="off"
        value={appId}
        placeholder="App ID · cli_…"
        onChange={(e) => setAppId(e.target.value)}
        aria-label={t('lk.appId')}
      />
      <TextInput
        mono
        type="password"
        autoComplete="off"
        value={secret}
        placeholder={t('lk.appSecret')}
        onChange={(e) => setSecret(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void connect()}
        aria-label={t('lk.appSecret')}
      />
      <div className="ap-lk-actions">
        <Segmented
          label={t('lk.domain')}
          value={domain}
          onChange={setDomain}
          options={[
            { value: 'lark', label: t('lk.domainLark') },
            { value: 'feishu', label: t('lk.domainFeishu') },
          ]}
        />
        <span className="grow" />
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('ch.cancel')}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={busy || !appId.trim() || !secret.trim() || !bot}
          onClick={() => void connect()}
        >
          {t('ch.connect')}
        </Button>
      </div>
      <span className="a-muted" style={{ fontSize: 12 }}>
        {t('lk.secretNote')}
      </span>
    </>
  )
}

const LARK_STATE_TONE = {
  receiving: 'ok',
  connecting: 'muted',
  reconnecting: 'warn',
  error: 'danger',
} as const

/** `cli_a8f2c4d6e0b13579` → `cli_a8f2…` */
const shortId = (id: string) => (id.length > 9 ? `${id.slice(0, 8)}…` : id)

/**
 * Lark (đợt 7d), theo design/canvas/KenhLark.dc.html. Chưa kết nối: 5 bước tạo ứng dụng bên trái, ô dán khoá bên phải.
 * Đã kết nối: danh sách ứng dụng, ghép đôi riêng của Lark, người đã ghép, dòng Mai đọc email/lịch (chưa làm), nhóm.
 */
function LarkSection({
  t,
  lark,
  codes,
  guestMode,
  act,
  busy,
}: {
  t: T
  lark: ChannelSnapshot['lark'] | undefined
  codes: PairCode[]
  guestMode: boolean
  act: (b: Record<string, unknown>) => Promise<boolean>
  busy: boolean
}) {
  const team = useTeamData()
  const [adding, setAdding] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [target, setTarget] = useState('aris')
  const apps = lark?.apps ?? []
  const people = lark?.people ?? []
  const groups = lark?.groups ?? []
  const allowedGroups = groups.filter((g) => g.allowed)
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  // Mỗi bot của aris (trừ bot ngoài) có tối đa một ứng dụng Lark.
  const free = (team?.bots ?? []).filter((b) => !b.external && !apps.some((a) => a.bot === b.id))
  const chosen = free.some((b) => b.id === target) ? target : (free[0]?.id ?? 'aris')
  const freeOptions = free.map((b) => botOption(b, b.id === 'aris' ? { note: t('ch.mainEntry') } : {}))
  const connected = apps.length > 0
  return (
    <Card
      title={
        <>
          Lark{' '}
          {connected ? (
            <Pill tone={apps.some((a) => a.state === 'error') ? 'danger' : 'ok'}>
              {t('lk.appsCount', { n: apps.length })}
            </Pill>
          ) : (
            <span className="a-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
              {t('lk.notConnected')}
            </span>
          )}
        </>
      }
    >
      {!connected ? (
        <div className="ap-kn-cols">
          <div className="ap-kn-col ap-lk-steps">
            <LarkStep n={1} title={t('lk.step1')}>
              {t('lk.step1d')}
            </LarkStep>
            <LarkStep n={2} title={t('lk.step2')}>
              {t('lk.step2d')}
            </LarkStep>
            <LarkStep n={3} title={t('lk.step3')}>
              <span className="a-mono">{LARK_SCOPES}</span>
            </LarkStep>
            <LarkStep n={4} title={t('lk.step4')}>
              {t('lk.step4d')} <span className="a-mono">{LARK_EVENT}</span>
            </LarkStep>
            <LarkStep n={5} title={t('lk.step5')}>
              {t('lk.step5d')}
            </LarkStep>
          </div>
          <div className="ap-kn-col ap-lk-form">
            <LarkConnect t={t} bot={chosen} bots={undefined} onBot={setTarget} act={act} busy={busy} />
          </div>
        </div>
      ) : (
        <>
          <div className="ap-kn-cols">
            <div className="ap-kn-col ap-kn-accounts">
              <div className="a-row ap-kn-first">
                <b className="grow" style={{ fontSize: 13 }}>
                  {t('lk.apps')}
                </b>
                {free.length && !adding ? (
                  <Button size="sm" onClick={() => setAdding(true)}>
                    {t('lk.addApp')}
                  </Button>
                ) : null}
              </div>
              {apps.map((a: LarkApp) => (
                <div key={a.bot}>
                  <CardRow>
                    <Bot id={botOf(a.bot)?.mascot ?? 'aris'} />
                    <span className="grow">
                      {a.name} <span className="a-muted a-mono">{shortId(a.appId)}</span>
                    </span>
                    <Pill tone={LARK_STATE_TONE[a.state]}>
                      {a.state === 'error' ? t('ch.error') : t(`lk.state.${a.state}`)}
                    </Pill>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void act({ op: 'disconnect-lark', bot: a.bot })}
                    >
                      {t('ch.disconnect')}
                    </Button>
                  </CardRow>
                  {a.error && (
                    <CardRow>
                      <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{a.error}</span>
                    </CardRow>
                  )}
                </div>
              ))}
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('lk.longConn')}
                </span>
              </CardRow>
              {adding && (
                <div className="ap-lk-form" style={{ display: 'flex', flexDirection: 'column' }}>
                  <LarkConnect
                    t={t}
                    bot={chosen}
                    bots={freeOptions}
                    onBot={setTarget}
                    act={act}
                    busy={busy}
                    onDone={() => setAdding(false)}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              )}
            </div>

            <PairColumn
              t={t}
              channel="lark"
              codes={codes}
              botName={apps[0]?.name}
              busy={busy}
              onCreate={(role) => void act({ op: 'code', role, channel: 'lark' })}
            />

            <div className="ap-kn-col ap-kn-people">
              <div className="a-row ap-kn-first">
                <b className="grow" style={{ fontSize: 13 }}>
                  {t('lk.paired')}
                </b>
              </div>
              {people.map((p) => (
                <CardRow key={p.openId}>
                  <span className="grow">{p.name}</span>
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
                    onClick={() => void act({ op: 'revoke-lark', openId: p.openId })}
                  >
                    {t('ch.unpair')}
                  </Button>
                </CardRow>
              ))}
              {!people.length && (
                <CardRow>
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('ch.noPeople')}
                  </span>
                </CardRow>
              )}
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('lk.pairNote')}
                </span>
              </CardRow>
            </div>
          </div>

          <div className="a-row" style={{ flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>{t('lk.mail')}</b>
            <span className="grow a-muted" style={{ fontSize: 12.5 }}>
              {t('lk.mailDesc')}
            </span>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('lk.mailLater')}
            </span>
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
                {t('lk.groupsHint')}
              </div>
              {groups.map((g) => (
                <GroupRow key={g.chatId} t={t} g={g} op="lark-group" act={act} busy={busy} />
              ))}
              <CardRow label={t('ch.guestMode')}>
                <Switch
                  label={t('ch.guestMode')}
                  checked={guestMode}
                  disabled={busy}
                  onChange={(on) => void act({ op: 'settings', guestMode: on })}
                />
              </CardRow>
            </div>
          )}
          {lark?.cli && (
            <div className="a-row a-muted" style={{ fontSize: 12.5 }}>
              <span className="grow">
                {t('lk.cli')}
                {lark.cli.version ? <span className="a-mono"> · {lark.cli.version}</span> : null}
              </span>
            </div>
          )}
        </>
      )}
    </Card>
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
              channel="telegram"
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

        <LarkSection
          t={t}
          lark={data?.lark}
          codes={data?.codes ?? []}
          guestMode={data?.settings.guestMode ?? false}
          act={act}
          busy={busy}
        />
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
