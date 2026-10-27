/**
 * Tab Tổng quan của Văn phòng. Bên trái, chế độ 2D (bản vẽ `VanPhong2D`): Aris và bong bóng thoại, bốn con số lớn, tab
 * phòng ban, bàn làm việc của từng bot; chế độ 3D (`Office3D`) là cảnh ba chiều. Bên phải là cột cố định rộng 384px, dùng
 * chung cho 2D và 3D: nhật ký "Vừa làm gì" (`Feed`) hay bảng chat gọn với bot vừa bấm (`ChatPanel`). Dưới khoảng 1100px
 * cột thành ngăn trượt. Mọi số liệu lấy từ API thật.
 */
import { Mascot, type PendingApproval, type TeamLive, type TeamView } from '@aris/ui-kit/react'
import { useMemo, useState } from 'react'
import type { PageProps } from '../page.js'
import { fmtTokens, fmtUsd } from '../settings/stats-format.js'
import { ChatPanel } from './ChatPanel.js'
import { DeskCard } from './Desk.js'
import { Feed } from './Feed.js'
import { Office3D } from './Office3D.js'
import { useFeed, useGuardNow, useTodayTokens, useWaitingGoals, type FeedRange } from './data.js'
import { waitingFeed } from './feedModel.js'
import { FEED_PANEL, loadPanel, savePanel, type Panel } from './panel.js'
import {
  commanderDesk,
  deskGroups,
  feedFor,
  officeSummary,
  type Desk,
  withWaiting,
  type DeskGroup,
  type Face,
} from './model.js'

type T = PageProps['t']

/** Chọn "Tất cả" hoặc một phòng ban; phòng chưa có mã (bot chưa vào phòng) dùng mã riêng này. */
const NONE = '\u0000none'
const keyOf = (g: DeskGroup) => g.id || NONE

export function Overview({
  t,
  nav,
  team,
  live,
  need,
  approvals,
  reloadApprovals,
  mode,
  onUnsupported,
}: {
  t: T
  nav: PageProps['nav']
  team: TeamView
  live: TeamLive | null
  /** Số việc đang chờ người dùng. */
  need: number
  /** Yêu cầu quyền đang chờ (duyệt ngay trên dòng nhật ký và trong khối "Đội đang làm"). */
  approvals: readonly PendingApproval[]
  reloadApprovals: () => void
  mode: '2d' | '3d'
  /** Máy không dựng được WebGL: quay về 2D. */
  onUnsupported: () => void
}) {
  const tokens = useTodayTokens()
  const guard = useGuardNow()
  const [range, setRange] = useState<FeedRange>('today')
  const [feed, reloadFeed] = useFeed(range)
  const [dept, setDept] = useState('all')
  const [panel, setPanelState] = useState<Panel>(loadPanel)
  // Màn hẹp: cột phải là ngăn trượt, mở bằng nút ở góc phải.
  const [colOpen, setColOpen] = useState(false)
  const dec = t('sx.dec')

  const waits = useWaitingGoals()
  const groups = useMemo(
    () => deskGroups(team, live).map((g) => ({ ...g, desks: g.desks.map((d) => withWaiting(d, waits)) })),
    [team, live, waits],
  )
  const aris = useMemo(() => withWaiting(commanderDesk(team, live), waits), [team, live, waits])
  const desks = groups.flatMap((g) => g.desks)
  const shown = dept === 'all' ? groups : groups.filter((g) => keyOf(g) === dept)
  // Aris (chỉ huy) cũng làm việc: tính vào câu tóm tắt và số đang làm.
  const everyone = [aris, ...desks]
  const deskOf = (bot: string): Desk | undefined => everyone.find((d) => d.id === bot)
  const bots = everyone.map((d) => ({ name: d.name, status: d.status, since: d.since }))
  const working = everyone.filter((d) => d.status === 'working').length
  const faceOf = (bot: string): Face => {
    const d = deskOf(bot)
    return { id: d?.mascot ?? bot, accessory: d?.accessory }
  }
  const feedIds = dept === 'all' ? null : new Set(shown.flatMap((g) => g.desks.map((d) => d.id)))
  const lines = feed
    ? feedFor(
        [...waitingFeed(waits), ...feed].sort((a, b) => b.at - a.at),
        feedIds,
      )
    : null

  // Bảng chat chỉ mở được khi bot có trong đội; chưa tải xong đội hay bot đã xoá thì vẫn ở nhật ký (không ghi đè trạng thái đã lưu).
  const chatDesk = panel.view === 'chat' ? deskOf(panel.bot) : undefined
  const chatting = chatDesk?.id ?? null
  const setPanel = (next: Panel) => {
    setPanelState(next)
    savePanel(next)
  }
  const openChat = (bot: string, session?: string) => {
    setPanel({ view: 'chat', bot, session })
    setColOpen(true)
  }
  /** Bấm một bàn, một bot 3D hay Aris: mở chat với bot đó; bấm lần nữa vào bot đang mở thì về nhật ký. */
  const pick = (bot: string) => {
    if (chatting === bot) setPanel(FEED_PANEL)
    else openChat(bot)
  }
  const reload = () => {
    reloadFeed()
    reloadApprovals()
  }

  const cap = guard?.settings.teamCapUsd ?? 0
  const spent = guard ? `${fmtUsd(guard.spent, dec)} $` : '–'

  const pills = groups.length > 0 && (
    <div className="ap-of-pills" role="group" aria-label={t('of.dept.filter')}>
      <button
        type="button"
        className={`ap-of-pill${dept === 'all' ? ' on' : ''}`}
        aria-pressed={dept === 'all'}
        onClick={() => setDept('all')}
      >
        {t('of.dept.all')}
      </button>
      {groups.map((g) => (
        <button
          key={keyOf(g)}
          type="button"
          className={`ap-of-pill${dept === keyOf(g) ? ' on' : ''}`}
          aria-pressed={dept === keyOf(g)}
          onClick={() => setDept(keyOf(g))}
        >
          {g.label}
          {g.working > 0 && <small>{t('of.dept.working', { n: g.working })}</small>}
          {g.waiting > 0 && <small className="warn">{t('of.dept.waiting', { n: g.waiting })}</small>}
        </button>
      ))}
    </div>
  )

  const column = (
    <aside
      className={`ap-of-col${colOpen ? ' open' : ''}`}
      aria-label={chatDesk ? t('of.dr.aria', { name: chatDesk.name }) : t('of.feed.title')}
    >
      {chatDesk ? (
        <ChatPanel
          // Đổi bot thì dựng lại bảng (ô nhắn, tin đang gửi, cuộn).
          key={chatDesk.id}
          t={t}
          nav={nav}
          desk={chatDesk}
          commander={chatDesk.id === aris.id}
          live={live}
          team={team}
          session={panel.view === 'chat' ? panel.session : undefined}
          approvals={approvals}
          onSession={(session) => setPanel({ view: 'chat', bot: chatDesk.id, session })}
          onBack={() => setPanel(FEED_PANEL)}
          onChat={openChat}
          reload={reload}
          onClose={() => setColOpen(false)}
        />
      ) : (
        <Feed
          t={t}
          lines={lines}
          range={range}
          onRange={setRange}
          faceOf={faceOf}
          nameOf={(bot) => deskOf(bot)?.name ?? bot}
          externalOf={(bot) => !!deskOf(bot)?.external}
          waitingOf={(bot) => live?.status[bot]?.status === 'waiting'}
          onChat={openChat}
          reload={reload}
          onClose={() => setColOpen(false)}
        />
      )}
    </aside>
  )
  const toggle = (
    <button
      type="button"
      className="ap-of-colbtn"
      aria-expanded={colOpen}
      onClick={() => setColOpen(!colOpen)}
    >
      {colOpen ? t('of.col.close') : t('of.col.open')}
    </button>
  )

  if (mode === '3d') {
    return (
      <div className="ap-of-split">
        <div className="ap-of-left3d">
          <Office3D
            t={t}
            groups={groups}
            aris={aris}
            live={live}
            tokens={tokens ? fmtTokens(tokens.tokens, dec) : '–'}
            cost={spent}
            costNote={cap > 0 ? t('of.num.cost', { cap: fmtUsd(cap, dec) }) : t('of.num.costFree')}
            need={need}
            working={working}
            summary={officeSummary({ need, bots, t })}
            dock={pills}
            focusBots={
              dept === 'all' ? null : new Set([aris.id, ...shown.flatMap((g) => g.desks.map((d) => d.id))])
            }
            focusZones={dept === 'all' ? null : new Set(shown.map((g) => g.id))}
            selected={chatting}
            // Bấm ra ngoài bot (id rỗng) không đóng bảng chat đang mở.
            onPick={(id) => id && pick(id)}
            onUnsupported={onUnsupported}
          />
        </div>
        {column}
        {toggle}
      </div>
    )
  }

  return (
    <div className="ap-of-split">
      <div className="ap-of-body">
        <div className="ap-of-hero">
          <div className="ap-of-aris">
            <button
              type="button"
              className={chatting === aris.id ? 'sel' : undefined}
              aria-label={t('of.desk', { name: aris.name })}
              aria-pressed={chatting === aris.id}
              onClick={() => pick(aris.id)}
            >
              <Mascot id={aris.mascot} size={120} accessory={aris.accessory} />
            </button>
            <div className="ap-of-say">{officeSummary({ need, bots, t })}</div>
          </div>
          <div className="ap-of-bigs">
            <div className="ap-of-big">
              <b>{tokens ? fmtTokens(tokens.tokens, dec) : '–'}</b>
              <span>{t('of.num.tokens')}</span>
            </div>
            <div className="ap-of-big">
              <b>{spent}</b>
              <span>{cap > 0 ? t('of.num.cost', { cap: fmtUsd(cap, dec) }) : t('of.num.costFree')}</span>
            </div>
            <div className="ap-of-big">
              <b>{working}</b>
              <span>{t('of.num.working')}</span>
            </div>
            <div className="ap-of-big">
              <b className={need > 0 ? 'warn' : undefined}>{need}</b>
              <span>{t('of.num.waiting')}</span>
            </div>
          </div>
        </div>

        {groups.length === 0 && team.ready && <div className="a-muted">{t('of.empty')}</div>}
        {groups.length > 0 && (
          <div className="ap-of-left">
            {pills}
            {shown.map((g) => (
              <section key={keyOf(g)} aria-label={g.label}>
                <div className="ap-of-dept">
                  {g.id ? (
                    <button
                      type="button"
                      title={t('of.dept.open', { name: g.label })}
                      onClick={() => nav.go('department', { id: g.id })}
                    >
                      {g.label}
                    </button>
                  ) : (
                    <span>{g.label}</span>
                  )}
                </div>
                <div className="ap-of-grid">
                  {g.desks.map((d) => (
                    <DeskCard
                      key={d.id}
                      desk={d}
                      t={t}
                      selected={chatting === d.id}
                      onPick={() => pick(d.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      {column}
      {toggle}
    </div>
  )
}
