/**
 * GĐ8.7 · Kênh và ghép đôi theo tài khoản (bản vẽ design/canvas/KenhTaiKhoan.dc.html và KenhThemTaiKhoan.dc.html):
 * bên trái danh sách tài khoản theo kênh (Telegram, Zalo cá nhân, Lark), bên phải chi tiết tài khoản đang chọn với hai
 * tab (Cài đặt · Trả lời theo tài liệu); nút "+ Thêm tài khoản" mở hộp chọn kênh, dán token Telegram hay quét QR Zalo.
 * Mỗi tài khoản một bot trả lời; một bot có thể có nhiều tài khoản. Lark giữ phần riêng như cũ, hiện ở khung bên phải.
 */
import {
  Button,
  Checkbox,
  Dialog,
  Pill,
  Segmented,
  Select,
  Switch,
  Tabs,
  TextInput,
  useTeamData,
  type BotData,
} from '@aris/ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { botOption } from '../options.js'
import type {
  AccountMode,
  ChannelBot,
  ChannelReply,
  ChannelSnapshot,
  DocsSetting,
  PairCode,
  ZaloAccount,
  ZaloHours,
} from './channels-api.js'

type T = PageProps['t']
type Act = (b: Record<string, unknown>) => Promise<boolean>
type Ask = (b: Record<string, unknown>) => Promise<ChannelReply | undefined>

/** Tài khoản đang chọn: kênh và mã tài khoản (Lark: cả phần Lark). */
export type Picked = { channel: 'telegram' | 'zalo'; account: string } | { channel: 'lark' }

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

const ZALO_TONE = {
  listening: 'ok',
  connecting: 'muted',
  web: 'warn',
  retrying: 'warn',
  'needs-qr': 'warn',
} as const

/** Bot của aris nhận được kênh riêng (trừ bot ngoài). */
const channelBots = (bots: readonly BotData[] | undefined) => (bots ?? []).filter((b) => !b.external)

/** Chọn bot trả lời: ít bot thì nút chọn đoạn như bản vẽ, nhiều thì ô chọn có tìm. */
function BotPick({ t, value, onChange }: { t: T; value: string; onChange: (bot: string) => void }) {
  const team = useTeamData()
  const bots = channelBots(team?.bots)
  if (bots.length <= 4)
    return (
      <Segmented
        label={t('ac.bot')}
        value={value}
        onChange={onChange}
        options={bots.map((b) => ({ value: b.id, label: b.name }))}
      />
    )
  return (
    <Select
      label={t('ac.bot')}
      value={value}
      onChange={onChange}
      searchPlaceholder={t('sel.search')}
      emptyLabel={t('sel.empty')}
      options={bots.map((b) => botOption(b))}
    />
  )
}

// ======================================================================================
// Danh sách tài khoản
// ======================================================================================

function Logo({ kind }: { kind: 'telegram' | 'zalo' | 'lark' }) {
  return (
    <span aria-hidden="true" className={`ap-ac-logo ${kind}`}>
      {kind === 'telegram' ? 'TG' : kind === 'zalo' ? 'ZL' : 'LK'}
    </span>
  )
}

function Row({
  kind,
  name,
  sub,
  status,
  on,
  onPick,
}: {
  kind: 'telegram' | 'zalo' | 'lark'
  name: ReactNode
  sub: ReactNode
  status: ReactNode
  on: boolean
  onPick: () => void
}) {
  return (
    <button type="button" className="ap-ac-row" aria-current={on ? 'true' : undefined} onClick={onPick}>
      <Logo kind={kind} />
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="ap-ac-name">{name}</b>
        <span className="a-muted ap-ac-sub">{sub}</span>
      </span>
      {status}
    </button>
  )
}

export function AccountList({
  t,
  data,
  picked,
  onPick,
}: {
  t: T
  data: ChannelSnapshot | null
  picked: Picked | undefined
  onPick: (p: Picked) => void
}) {
  const team = useTeamData()
  const botName = (id: string) => team?.bots.find((b) => b.id === id)?.name ?? id
  const is = (channel: string, account?: string) =>
    picked?.channel === channel && (!account || ('account' in picked && picked.account === account))
  const tg = data?.bots ?? []
  const zl = data?.zalo?.accounts ?? []
  const lark = data?.lark?.apps ?? []
  return (
    <section aria-label={t('ac.list')} className="ap-ac-list">
      <div className="ap-ac-group">
        <b>Telegram</b>
      </div>
      {tg.map((b) => (
        <Row
          key={b.account}
          kind="telegram"
          name={`@${b.username}`}
          sub={t('ac.botOf', { name: botName(b.bot) })}
          status={
            <Pill tone={b.error ? 'danger' : b.running ? 'ok' : 'muted'}>
              {t(b.error ? 'ch.error' : b.running ? 'ac.st.receiving' : 'ac.st.connecting')}
            </Pill>
          }
          on={is('telegram', b.account)}
          onPick={() => onPick({ channel: 'telegram', account: b.account })}
        />
      ))}
      {!tg.length && <div className="a-muted ap-ac-empty">{t('ac.none')}</div>}

      <div className="ap-ac-group">
        <b>{t('ch.zalo')}</b>
        <span className="a-muted">{t('ac.zaloNote')}</span>
      </div>
      {zl.map((a) => (
        <Row
          key={a.account}
          kind="zalo"
          name={a.label}
          sub={t('ac.botOf', { name: botName(a.bot) })}
          status={<Pill tone={ZALO_TONE[a.state]}>{t(`ac.zst.${a.state}`)}</Pill>}
          on={is('zalo', a.account)}
          onPick={() => onPick({ channel: 'zalo', account: a.account })}
        />
      ))}
      {!zl.length && <div className="a-muted ap-ac-empty">{t('ac.none')}</div>}

      <div className="ap-ac-group">
        <b>Lark</b>
        <span className="a-muted">{t('ac.larkNote')}</span>
      </div>
      <Row
        kind="lark"
        name={lark.length ? lark.map((a) => a.name).join(', ') : t('ch.notConnected')}
        sub={lark.length ? t('lk.appsCount', { n: lark.length }) : t('ac.larkSetup')}
        status={
          lark.length ? (
            <Pill tone={lark.some((a) => a.state === 'error') ? 'danger' : 'ok'}>{t('ac.st.receiving')}</Pill>
          ) : null
        }
        on={is('lark')}
        onPick={() => onPick({ channel: 'lark' })}
      />
    </section>
  )
}

// ======================================================================================
// Chi tiết tài khoản
// ======================================================================================

/** Một dòng cài đặt: nhãn đậm, phần điều khiển, gợi ý nhỏ. */
function Block({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ap-ac-block">
      <b className="ap-ac-title">{title}</b>
      {children}
      {hint && <span className="a-muted ap-ac-hint">{hint}</span>}
    </div>
  )
}

/** Mã ghép đôi riêng của tài khoản. */
function AccountCode({
  t,
  channel,
  account,
  name,
  codes,
  act,
  busy,
}: {
  t: T
  channel: 'telegram' | 'zalo'
  account: string
  name: string
  codes: PairCode[]
  act: Act
  busy: boolean
}) {
  const now = useNow()
  const code = codes
    .filter((c) => c.channel === channel && c.role === 'member' && c.account === account && c.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0]
  return (
    <Block
      title={t('ch.pairing')}
      hint={code ? t('ac.codeMeta', { t: mmss(code.expiresAt - now), name }) : undefined}
    >
      {code ? (
        <div className="a-mono ap-kn-code">{code.code}</div>
      ) : (
        <div className="a-muted ap-kn-code empty">{t('ch.noCode')}</div>
      )}
      <span className="a-muted ap-ac-hint">
        {t(channel === 'zalo' ? 'ac.codeHintZalo' : 'ac.codeHintTg')}
      </span>
      <span>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void act({ op: 'code', role: 'member', channel, account })}
        >
          {t(code ? 'ch.newCode' : 'ch.makeCode')}
        </Button>
      </span>
    </Block>
  )
}

interface GroupLike {
  title: string
  allowed: boolean
  who: 'allowed' | 'everyone'
  prompt?: string
}

/** Một nhóm: bật/tắt, ai gọi được bot, lời nhắc riêng. `ident` là phần nhận diện nhóm gửi kèm mỗi thao tác. */
export function GroupRow({
  t,
  g,
  id,
  op,
  ident,
  act,
  busy,
}: {
  t: T
  g: GroupLike
  id: string | number
  op: 'group' | 'lark-group' | 'zalo-group'
  ident: Record<string, unknown>
  act: Act
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
            {id}
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
          onChange={(v) => void act({ op, ...ident, allowed: v })}
        />
      </span>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <Segmented
            label={t('ch.who')}
            value={g.who}
            onChange={(who) => void act({ op, ...ident, who })}
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
                onClick={() => void act({ op, ...ident, prompt })}
              >
                {t('ch.save')}
              </Button>
            </span>
          </label>
          <span>
            <Button size="sm" variant="ghost" onClick={() => void act({ op: `${op}-remove`, ...ident })}>
              {t('ch.removeGroup')}
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}

/** Thứ tự ngày trên giao diện: Thứ hai trước, Chủ nhật cuối. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

/** Giờ trực của tài khoản Zalo: bật/tắt, ngày, giờ, câu ngoài giờ (tuỳ chọn). */
function HoursBlock({
  t,
  account,
  hours,
  act,
  busy,
}: {
  t: T
  account: string
  hours: ZaloHours | null
  act: Act
  busy: boolean
}) {
  const [draft, setDraft] = useState<ZaloHours>(
    () => hours ?? { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '21:00' },
  )
  const [offOn, setOffOn] = useState(!!hours?.offReply)
  useEffect(() => {
    if (hours) {
      setDraft(hours)
      setOffOn(!!hours.offReply)
    }
  }, [hours])
  const save = (h: ZaloHours | null) => void act({ op: 'account', channel: 'zalo', account, hours: h })
  const { offReply, ...base } = draft
  const next: ZaloHours = offOn && offReply?.trim() ? { ...base, offReply: offReply.trim() } : base
  const changed = JSON.stringify(next) !== JSON.stringify(hours ?? null)
  return (
    <Block
      title={
        <span className="ap-ac-line">
          <span className="grow">{t('ac.hours')}</span>
          <Switch
            label={t('ac.hours')}
            checked={!!hours}
            disabled={busy}
            onChange={(on) =>
              save(on ? { ...next, days: next.days.length ? next.days : [1, 2, 3, 4, 5] } : null)
            }
          />
        </span>
      }
      hint={t(hours ? 'ac.hoursHint' : 'ac.hoursOff')}
    >
      {hours && (
        <>
          <span className="ap-ac-chips" role="group" aria-label={t('ac.days')}>
            {WEEK.map((d) => {
              const on = draft.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  className="ap-ac-chip"
                  aria-pressed={on}
                  onClick={() =>
                    setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })
                  }
                >
                  {t(`ac.day.${d}`)}
                </button>
              )
            })}
          </span>
          <span className="ap-ac-line">
            <input
              type="time"
              className="a-inp ap-ac-time"
              value={draft.from}
              aria-label={t('ac.from')}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
            <span aria-hidden="true">–</span>
            <input
              type="time"
              className="a-inp ap-ac-time"
              value={draft.to}
              aria-label={t('ac.to')}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </span>
          <Checkbox checked={offOn} onChange={setOffOn} label={t('ac.offReply')} />
          {offOn && (
            <TextInput
              value={draft.offReply ?? ''}
              placeholder={t('ac.offReplyHint')}
              aria-label={t('ac.offReply')}
              onChange={(e) => setDraft({ ...draft, offReply: e.target.value })}
            />
          )}
          <span>
            <Button size="sm" disabled={busy || !changed || !draft.days.length} onClick={() => save(next)}>
              {t('ch.save')}
            </Button>
          </span>
        </>
      )}
    </Block>
  )
}

/** Nhãn Zalo bỏ qua: nhãn đọc thẳng từ Zalo, cộng các nhãn đã chọn (kể cả nhãn đã đổi tên trên app). */
function LabelsBlock({
  t,
  account,
  skip,
  ask,
  act,
  busy,
  live,
}: {
  t: T
  account: string
  skip: string[]
  ask: Ask
  act: Act
  busy: boolean
  live: boolean
}) {
  const [labels, setLabels] = useState<string[] | undefined>()
  useEffect(() => {
    if (!live) return
    let gone = false
    void ask({ op: 'zalo-labels', account }).then((r) => !gone && setLabels(r?.labels ?? []))
    return () => void (gone = true)
  }, [account, live, ask])
  const all = [...new Set([...(labels ?? []), ...skip])]
  const has = (n: string) => skip.some((x) => x.toLowerCase() === n.toLowerCase())
  return (
    <Block
      title={t('ac.skipLabels')}
      hint={t(all.length ? 'ac.skipHint' : live ? 'ac.noLabels' : 'ac.labelsOffline')}
    >
      {all.length > 0 && (
        <span className="ap-ac-chips" role="group" aria-label={t('ac.skipLabels')}>
          {all.map((n) => (
            <button
              key={n}
              type="button"
              className="ap-ac-chip"
              aria-pressed={has(n)}
              disabled={busy}
              onClick={() =>
                void act({
                  op: 'account',
                  channel: 'zalo',
                  account,
                  skipLabels: has(n) ? skip.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...skip, n],
                })
              }
            >
              {n}
            </button>
          ))}
        </span>
      )}
    </Block>
  )
}

/** Tab "Trả lời theo tài liệu": bật/tắt, thư mục nguồn trong bộ não, câu khi không tìm thấy. */
function DocsTab({
  t,
  channel,
  account,
  docs,
  data,
  act,
  busy,
}: {
  t: T
  channel: 'telegram' | 'zalo'
  account: string
  docs: DocsSetting | null
  data: ChannelSnapshot
  act: Act
  busy: boolean
}) {
  const [folders, setFolders] = useState<string[]>(docs?.folders ?? [])
  const [noInfo, setNoInfo] = useState(docs?.noInfo ?? '')
  useEffect(() => {
    setFolders(docs?.folders ?? [])
    setNoInfo(docs?.noInfo ?? '')
  }, [docs])
  const on = docs?.on ?? false
  const save = (patch: Partial<DocsSetting>) =>
    void act({
      op: 'account',
      channel,
      account,
      docs: { on, folders, ...(noInfo.trim() ? { noInfo: noInfo.trim() } : {}), ...patch },
    })
  const changed =
    JSON.stringify([...folders].sort()) !== JSON.stringify([...(docs?.folders ?? [])].sort()) ||
    noInfo.trim() !== (docs?.noInfo ?? '')
  const list = data.docFolders
  return (
    <div className="ap-ac-tab">
      <Block
        title={
          <span className="ap-ac-line">
            <span className="grow">{t('ac.docsOn')}</span>
            <Switch
              label={t('ac.docsOn')}
              checked={on}
              disabled={busy || (!on && !folders.length)}
              onChange={(v) => save({ on: v })}
            />
          </span>
        }
        hint={t(!on && !folders.length ? 'ac.docsPickFirst' : 'ac.docsScope')}
      />
      <Block title={t('ac.docsFolders')} hint={t('ac.docsNoCustomer')}>
        {list.length ? (
          <div className="ap-ac-folders">
            {list.map((f) => (
              <Checkbox
                key={f.path}
                checked={folders.includes(f.path)}
                onChange={(v) => setFolders(v ? [...folders, f.path] : folders.filter((x) => x !== f.path))}
                label={
                  <span>
                    {f.title}{' '}
                    <span className="a-muted a-mono" style={{ fontSize: 11.5 }}>
                      {f.path} · {t('ac.pages', { n: f.pages })}
                    </span>
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <span className="a-muted ap-ac-hint">{t('ac.docsNoBrain')}</span>
        )}
      </Block>
      <label className="a-field">
        <span className="l">{t('ac.noInfo')}</span>
        <textarea
          className="a-inp ap-ac-area"
          rows={2}
          value={noInfo}
          placeholder={data.noInfo}
          onChange={(e) => setNoInfo(e.target.value)}
        />
      </label>
      <span>
        <Button size="sm" disabled={busy || !changed} onClick={() => save({})}>
          {t('ch.save')}
        </Button>
      </span>
      <span className="a-muted ap-ac-hint">{t('ac.docsWarn')}</span>
    </div>
  )
}

/** Người đã ghép đôi dùng được trên tài khoản: người riêng của tài khoản, cộng người dùng chung (chủ nhân). */
function People({
  t,
  people,
  onRevoke,
  busy,
}: {
  t: T
  people: { key: string; name: string; role: 'owner' | 'member' }[]
  onRevoke: (key: string) => void
  busy: boolean
}) {
  return (
    <Block title={t('ac.people')} hint={people.length ? undefined : t('ch.noPeople')}>
      {people.map((p) => (
        <span key={p.key} className="ap-ac-line">
          <span className="grow">{p.name}</span>
          {p.role === 'owner' ? (
            <Pill tone="ok">{t('ch.roleOwner')}</Pill>
          ) : (
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('ch.roleMember')}
            </span>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevoke(p.key)}>
            {t('ch.unpair')}
          </Button>
        </span>
      ))}
    </Block>
  )
}

/** Nút "Gỡ" hai bước: bấm lần đầu hỏi lại ngay tại chỗ. */
function RemoveButton({ t, onRemove, busy }: { t: T; onRemove: () => void; busy: boolean }) {
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!sure) return
    const timer = setTimeout(() => setSure(false), 5000)
    return () => clearTimeout(timer)
  }, [sure])
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => (sure ? onRemove() : setSure(true))}>
      {t(sure ? 'ac.removeSure' : 'ac.remove')}
    </Button>
  )
}

export function AccountDetail({
  t,
  picked,
  data,
  act,
  ask,
  busy,
  onRescan,
  onRemoved,
}: {
  t: T
  picked: { channel: 'telegram' | 'zalo'; account: string }
  data: ChannelSnapshot
  act: Act
  ask: Ask
  busy: boolean
  onRescan: (a: ZaloAccount) => void
  onRemoved: () => void
}) {
  const [tab, setTab] = useState<'set' | 'doc'>('set')
  const { channel, account } = picked
  const tg: ChannelBot | undefined =
    channel === 'telegram' ? data.bots.find((b) => b.account === account) : undefined
  const zl: ZaloAccount | undefined =
    channel === 'zalo' ? data.zalo.accounts.find((a) => a.account === account) : undefined
  const rec = tg ?? zl
  if (!rec) return <div className="a-muted ap-ac-empty">{t('ac.gone')}</div>
  const name = tg ? `@${tg.username}` : zl!.label
  const setMode = (mode: AccountMode) => void act({ op: 'account', channel, account, mode })
  const status = tg ? (
    <Pill tone={tg.error ? 'danger' : tg.running ? 'ok' : 'muted'}>
      {t(tg.error ? 'ch.error' : tg.running ? 'ac.st.receiving' : 'ac.st.connecting')}
    </Pill>
  ) : (
    <Pill tone={ZALO_TONE[zl!.state]}>{t(`ac.zst.${zl!.state}`)}</Pill>
  )
  const hint =
    tg?.error ??
    (zl && zl.state !== 'listening' && zl.state !== 'connecting' ? t(`ac.zhint.${zl.state}`) : '')

  const people = tg
    ? data.people
        .filter((p) => !p.account || p.account === account)
        .map((p) => ({ key: `${p.userId}|${p.account ?? ''}`, name: p.name, role: p.role }))
    : data.zalo.people
        .filter((p) => !p.account || p.account === account)
        .map((p) => ({ key: `${p.zaloId}|${p.account ?? ''}`, name: p.name, role: p.role }))
  const revoke = (key: string) => {
    const [id, acc] = key.split('|')
    if (tg) void act({ op: 'revoke', userId: Number(id), ...(acc ? { account: acc } : {}) })
    else void act({ op: 'revoke-zalo', zaloId: id, ...(acc ? { account: acc } : {}) })
  }

  return (
    <section aria-label={t('ac.detail')} className="ap-ac-detail">
      <div className="ap-ac-head">
        <Logo kind={channel} />
        <span className="grow" style={{ minWidth: 0 }}>
          <b className="ap-ac-name" style={{ fontSize: 15 }}>
            {name}
          </b>
          <span className="a-muted ap-ac-sub">
            {tg ? `Telegram · ${tg.name}` : `${t('ch.zalo')}${zl!.name ? ` · ${zl!.name}` : ''}`}
          </span>
        </span>
        {status}
        {zl?.state === 'needs-qr' && (
          <Button size="sm" onClick={() => onRescan(zl)}>
            {t('ac.rescan')}
          </Button>
        )}
        <RemoveButton
          t={t}
          busy={busy}
          onRemove={() =>
            void act(tg ? { op: 'disconnect', account } : { op: 'zalo-logout', account }).then(
              (ok) => ok && onRemoved(),
            )
          }
        />
      </div>
      {hint && <div className="ap-ac-warn">{hint}</div>}
      <Tabs
        label={t('ac.tabs')}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'set', label: t('ac.tabSet') },
          { value: 'doc', label: t('ac.tabDoc') },
        ]}
      />
      {tab === 'doc' ? (
        <DocsTab
          t={t}
          channel={channel}
          account={account}
          docs={rec.docs}
          data={data}
          act={act}
          busy={busy}
        />
      ) : (
        <div className="ap-ac-tab">
          <div className="ap-ac-grid">
            <Block title={t('ac.bot')}>
              <BotPick
                t={t}
                value={rec.bot}
                onChange={(bot) => void act({ op: 'account', channel, account, bot })}
              />
            </Block>
            <Block
              title={t('ac.who')}
              hint={t(rec.mode === 'guests' ? 'ac.whoGuestsHint' : 'ac.whoPairedHint')}
            >
              <Segmented
                label={t('ac.who')}
                value={rec.mode}
                onChange={setMode}
                options={[
                  { value: 'paired', label: t('ac.whoPaired') },
                  { value: 'guests', label: t('ac.whoGuests') },
                ]}
              />
            </Block>
          </div>
          {zl && (
            <div className="ap-ac-grid">
              <Block
                title={
                  <span className="ap-ac-line">
                    <span className="grow">{t('ac.hand')}</span>
                    <Switch
                      label={t('ac.hand')}
                      checked={zl.hand}
                      disabled={busy}
                      onChange={(hand) => void act({ op: 'account', channel, account, hand })}
                    />
                  </span>
                }
                hint={t('ac.handHint')}
              />
              <HoursBlock t={t} account={account} hours={zl.hours} act={act} busy={busy} />
              <LabelsBlock
                t={t}
                account={account}
                skip={zl.skipLabels}
                ask={ask}
                act={act}
                busy={busy}
                live={zl.state === 'listening'}
              />
            </div>
          )}
          <div className="ap-ac-grid">
            <AccountCode
              t={t}
              channel={channel}
              account={account}
              name={name}
              codes={data.codes}
              act={act}
              busy={busy}
            />
            <People t={t} people={people} onRevoke={revoke} busy={busy} />
          </div>
          <Block title={t('ch.groups')} hint={t(zl ? 'ac.groupsZalo' : 'ch.groupsHint')}>
            {tg &&
              data.groups
                .filter((g) => !g.account || g.account === account)
                .map((g) => (
                  <GroupRow
                    key={g.chatId}
                    t={t}
                    g={g}
                    id={g.chatId}
                    op="group"
                    ident={{ chatId: g.chatId, account }}
                    act={act}
                    busy={busy}
                  />
                ))}
            {zl &&
              data.zalo.groups
                .filter((g) => !g.account || g.account === account)
                .map((g) => (
                  <GroupRow
                    key={g.groupId}
                    t={t}
                    g={g}
                    id={g.groupId}
                    op="zalo-group"
                    ident={{ groupId: g.groupId, account }}
                    act={act}
                    busy={busy}
                  />
                ))}
          </Block>
          {tg && (
            <div className="ap-ac-grid">
              <Block title={t('ch.voice')}>
                <Switch
                  label={t('ch.voice')}
                  checked={tg.voice}
                  disabled={busy}
                  onChange={(on) => void act({ op: 'voice', bot: account, on })}
                />
              </Block>
              <Block title={t('ch.home')}>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {tg.home ? <span className="a-mono">{tg.home.chatId}</span> : t('ch.homeNone')}
                </span>
              </Block>
            </div>
          )}
          {zl && (
            <div className="a-muted ap-ac-hint">
              {t('ac.limits', {
                s: data.zalo.limits.perChatMs / 1000,
                m: data.zalo.limits.perMinute,
                d: data.zalo.limits.perDay,
              })}{' '}
              <b>{t('ac.leftToday', { n: zl.leftToday, d: data.zalo.limits.perDay })}</b>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ======================================================================================
// Hộp thêm tài khoản
// ======================================================================================

/** Ô mã QR: ảnh, đếm ngược, hướng dẫn quét, "Tạo mã mới". */
function QrBox({
  t,
  login,
  png,
  expiresAt,
  onRenew,
  busy,
}: {
  t: T
  login: { status: string; name?: string; error?: string } | undefined
  png: string | undefined
  expiresAt: number | undefined
  onRenew: () => void
  busy: boolean
}) {
  const now = useNow()
  const status = login?.status ?? (png ? 'waiting' : undefined)
  const expired = status === 'expired' || (status === 'waiting' && expiresAt !== undefined && expiresAt < now)
  return (
    <div className="ap-ac-qr">
      {!status && <span className="a-muted">{t('ac.qrHere')}</span>}
      {status === 'waiting' && !expired && png && (
        <>
          <img src={`data:image/png;base64,${png}`} alt={t('ac.qrAlt')} width={170} height={170} />
          {expiresAt !== undefined && (
            <span className="a-mono">{t('ac.qrExpires', { t: mmss(expiresAt - now) })}</span>
          )}
          <span className="a-muted" style={{ textAlign: 'center' }}>
            {t('ac.qrHow')}
          </span>
        </>
      )}
      {status === 'scanned' && <span>{t('ac.qrScanned', { name: login?.name ?? '' })}</span>}
      {status === 'done' && (
        <span style={{ color: 'var(--a-ok)' }}>{t('ac.qrDone', { name: login?.name ?? '' })}</span>
      )}
      {expired && <span className="a-muted">{t('ac.qrExpired')}</span>}
      {status === 'declined' && <span className="a-muted">{t('ac.qrDeclined')}</span>}
      {status === 'error' && <span style={{ color: 'var(--a-danger)' }}>{login?.error}</span>}
      {status && status !== 'done' && status !== 'scanned' && (
        <Button size="sm" disabled={busy} onClick={onRenew}>
          {t('ac.qrRenew')}
        </Button>
      )}
    </div>
  )
}

export function AddAccount({
  t,
  data,
  ask,
  busy,
  rescan,
  onClose,
  onAdded,
}: {
  t: T
  data: ChannelSnapshot | null
  ask: Ask
  busy: boolean
  /** Quét lại QR cho tài khoản Zalo có sẵn. */
  rescan?: ZaloAccount | undefined
  onClose: () => void
  onAdded: (p: Picked) => void
}) {
  const team = useTeamData()
  const bots = channelBots(team?.bots)
  const [channel, setChannel] = useState<'telegram' | 'zalo'>(rescan ? 'zalo' : 'telegram')
  const [label, setLabel] = useState(rescan?.label ?? '')
  const [bot, setBot] = useState(rescan?.bot ?? 'aris')
  const [token, setToken] = useState('')
  const [understood, setUnderstood] = useState(!!rescan)
  const [qr, setQr] = useState<{ qrPng: string; expiresAt: number; key: string } | undefined>()
  const chosen = bots.some((b) => b.id === bot) ? bot : (bots[0]?.id ?? 'aris')
  const login = qr ? data?.zalo.logins.find((l) => l.key === qr.key) : undefined

  // Trong lúc chờ quét: hỏi trạng thái 2 giây một lần; quét xong thì chọn tài khoản mới và đóng hộp.
  useEffect(() => {
    if (!qr || login?.status === 'done') return
    const timer = setInterval(() => void ask({ op: 'zalo-login-status' }), 2000)
    return () => clearInterval(timer)
  }, [qr, login?.status, ask])
  useEffect(() => {
    if (login?.status === 'done' && login.account) onAdded({ channel: 'zalo', account: login.account })
  }, [login?.status, login?.account, onAdded])

  async function showQr() {
    const r = await ask({
      op: 'zalo-login-start',
      bot: chosen,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(rescan ? { account: rescan.account } : {}),
    })
    if (r?.qr) setQr(r.qr)
  }

  async function connect() {
    const before = new Set(data?.bots.map((b) => b.account))
    // Bot đã có tài khoản Telegram thì thêm tài khoản mới; chưa có thì tài khoản mang mã của bot (như trước GĐ8.7).
    const has = data?.bots.some((b) => b.bot === chosen)
    const r = await ask({
      op: 'connect',
      bot: chosen,
      token,
      ...(has ? { account: 'new' } : {}),
      ...(label.trim() ? { label: label.trim() } : {}),
    })
    const added = r?.bots.find((b) => !before.has(b.account))
    if (added) onAdded({ channel: 'telegram', account: added.account })
    else if (r) onClose()
  }

  return (
    <Dialog
      open
      title={t(rescan ? 'ac.rescanTitle' : 'ac.addTitle')}
      onClose={onClose}
      width={720}
      closeLabel={t('ch.cancel')}
    >
      <div className="ap-ac-add">
        {!rescan && (
          <Block title={t('ac.channel')}>
            <Segmented
              label={t('ac.channel')}
              value={channel}
              onChange={(c) => (setChannel(c), setQr(undefined))}
              options={[
                { value: 'telegram', label: 'Telegram' },
                { value: 'zalo', label: t('ch.zalo') },
              ]}
            />
          </Block>
        )}
        <label className="a-field">
          <span className="l">{t('ac.label')}</span>
          <TextInput
            value={label}
            maxLength={40}
            placeholder={t(channel === 'zalo' ? 'ac.labelZalo' : 'ac.labelTg')}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Block title={t('ac.bot')}>
          <BotPick t={t} value={chosen} onChange={setBot} />
        </Block>
        {channel === 'telegram' ? (
          <div className="ap-ac-sep">
            <span className="a-muted ap-ac-hint">{t('ch.tokenHint')}</span>
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
              <Button variant="primary" disabled={busy || !token.trim()} onClick={() => void connect()}>
                {t('ch.connect')}
              </Button>
            </span>
          </div>
        ) : (
          <div className="ap-ac-sep ap-ac-zalo">
            <div className="ap-ac-zcol">
              <div className="ap-ac-warn">{t('ac.zaloWarn')}</div>
              <Checkbox checked={understood} onChange={setUnderstood} label={t('ac.understood')} />
              <span>
                <Button
                  variant="primary"
                  disabled={busy || !understood || !!qr}
                  onClick={() => void showQr()}
                >
                  {t('ac.showQr')}
                </Button>
              </span>
              <span className="a-muted ap-ac-hint">{t(rescan ? 'ac.rescanNote' : 'ac.zaloNoteKeys')}</span>
            </div>
            <QrBox
              t={t}
              login={login}
              png={login?.qrPng ?? (login ? undefined : qr?.qrPng)}
              expiresAt={login?.expiresAt ?? qr?.expiresAt}
              busy={busy}
              onRenew={() => void showQr()}
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
