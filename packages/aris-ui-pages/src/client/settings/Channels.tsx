/**
 * 6.3 · Kênh và ghép đôi (đặc tả: docs/specs/aris-telegram.md, aris-zalo.md). GĐ8.7: bố cục theo
 * design/canvas/KenhTaiKhoan.dc.html (danh sách tài khoản theo kênh, chi tiết tài khoản, xem `ChannelAccounts.tsx`);
 * Lark giữ phần riêng theo KenhLark.dc.html (5 bước tạo ứng dụng, dán khoá, ghép đôi riêng của Lark), hiện ở khung
 * chi tiết khi chọn Lark. Cuối trang là thẻ dùng chung cho mọi kênh: chế độ khách trong nhóm lạ, cách xử lý khi nhắn
 * thêm lúc bot đang làm. Dữ liệu thật qua `/api/aris/channels`.
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
  SwitchRow,
  TextInput,
  useTeamData,
  type BotOption,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { botOption } from '../options.js'
import { Bot } from '../ui.js'
import { AccountDetail, AccountList, AddAccount, GroupRow, type Picked } from './ChannelAccounts.js'
import {
  useChannels,
  type ChannelSnapshot,
  type LarkApp,
  type PairCode,
  type ZaloAccount,
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
                    <Bot id={botOf(a.bot)?.mascot ?? 'aris'} accessory={botOf(a.bot)?.accessory} />
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
                <GroupRow
                  key={g.chatId}
                  t={t}
                  g={g}
                  id={g.chatId}
                  op="lark-group"
                  ident={{ chatId: g.chatId }}
                  act={act}
                  busy={busy}
                />
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

export function Channels({ t }: PageProps) {
  const { data, error, busy, act, ask } = useChannels()
  const [picked, setPicked] = useState<Picked | undefined>()
  const [adding, setAdding] = useState<{ rescan?: ZaloAccount } | undefined>()
  // Chưa chọn thì chọn tài khoản đầu tiên (Telegram, rồi Zalo, rồi Lark).
  const first: Picked | undefined = data
    ? data.bots[0]
      ? { channel: 'telegram', account: data.bots[0].account }
      : data.zalo.accounts[0]
        ? { channel: 'zalo', account: data.zalo.accounts[0].account }
        : { channel: 'lark' }
    : undefined
  const cur = picked ?? first
  const onAdded = useCallback((p: Picked) => {
    setPicked(p)
    setAdding(undefined)
  }, [])

  return (
    <PageShell
      title={t('sec.channels')}
      subtitle={t('ac.subtitle')}
      actions={
        <Button variant="primary" onClick={() => setAdding({})}>
          {t('ch.addAccount')}
        </Button>
      }
    >
      {error && <div className="ap-error">{error}</div>}
      <div className="ap-col">
        {/* Luồng chung (GĐ9.6a): chủ nhắn riêng cho bot ở Telegram vào cùng phiên với chat web. */}
        <Card>
          <SwitchRow
            label={t('ch.sharedThreads')}
            hint={t('ch.sharedThreadsHint')}
            checked={data?.settings.sharedThreads ?? false}
            disabled={busy || !data}
            onChange={(on) => void act({ op: 'settings', sharedThreads: on })}
          />
        </Card>
        <div className="ap-ac-wrap">
          <AccountList t={t} data={data} picked={cur} onPick={setPicked} />
          {cur?.channel === 'lark' ? (
            <div className="ap-ac-detail ap-ac-lark">
              <LarkSection
                t={t}
                lark={data?.lark}
                codes={data?.codes ?? []}
                guestMode={data?.settings.guestMode ?? false}
                act={act}
                busy={busy}
              />
            </div>
          ) : cur && data ? (
            <AccountDetail
              key={`${cur.channel}-${cur.account}`}
              t={t}
              picked={cur}
              data={data}
              act={act}
              ask={ask}
              busy={busy}
              onRescan={(a) => setAdding({ rescan: a })}
              onRemoved={() => setPicked(undefined)}
            />
          ) : (
            <div className="ap-ac-detail a-muted ap-ac-empty">{t('ac.loading')}</div>
          )}
        </div>

        <Card
          title={t('ch.guestMode')}
          actions={
            <Switch
              label={t('ch.guestMode')}
              checked={data?.settings.guestMode ?? false}
              disabled={busy || !data}
              onChange={(guestMode) => void act({ op: 'settings', guestMode })}
            />
          }
        />
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
      {adding && (
        <AddAccount
          t={t}
          data={data}
          ask={ask}
          busy={busy}
          rescan={adding.rescan}
          onClose={() => setAdding(undefined)}
          onAdded={onAdded}
        />
      )}
    </PageShell>
  )
}
