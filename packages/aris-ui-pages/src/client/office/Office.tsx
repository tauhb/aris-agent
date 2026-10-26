/**
 * Trang Văn phòng (bản vẽ `VanPhong2D`, `VanPhongPhongBan`, `VanPhongKanban`): đầu trang có tên, nút 2D / 3D (3D sắp có),
 * ba tab Tổng quan, Phòng ban, Kanban, giờ và nút "Cần {you}" mở danh sách duyệt nhanh. Dữ liệu đọc lại mỗi vài giây.
 */
import {
  Button,
  Mascot,
  answerApproval,
  openBotSession,
  useDismiss,
  usePendingApprovals,
  useTeam,
  useTeamLive,
} from '@aris/ui-kit/react'
import { useEffect, useRef, useState } from 'react'
import { Kanban } from '../auto/Kanban.js'
import type { PageProps } from '../page.js'
import { clockSec } from '../settings/stats-format.js'
import { Departments } from './Departments.js'
import { Overview } from './Overview.js'
import { needsYou, type Need } from './model.js'

type T = PageProps['t']
type Tab = 'overview' | 'departments' | 'kanban'
const TABS: readonly Tab[] = ['overview', 'departments', 'kanban']

/** Tham số `tab` của đường vào (Kanban cũ mở thẳng tab Kanban); lạ thì về Tổng quan. */
const tabOf = (v: string | undefined): Tab => TABS.find((x) => x === v) ?? 'overview'

function Clock() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="ap-of-clock">{clockSec(now)}</span>
}

/** Nút "Cần {you} · N" và danh sách duyệt nhanh: Duyệt / Từ chối yêu cầu quyền, Trả lời câu hỏi (mở chat). */
function NeedBell({
  t,
  nav,
  needs,
  mascotOf,
  reload,
}: {
  t: T
  nav: PageProps['nav']
  needs: readonly Need[]
  mascotOf: (bot: string) => string
  reload: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(root, open, () => setOpen(false))
  const answer = async (id: string, allow: boolean) => {
    setBusy(id)
    await answerApproval(id, allow).catch(() => false)
    setBusy(null)
    reload()
  }
  const reply = async (n: Extract<Need, { kind: 'question' }>) => {
    setOpen(false)
    nav.openSession(n.session || (await openBotSession(n.bot)))
  }
  const action = (n: Extract<Need, { kind: 'approval' }>) =>
    t(
      ['run', 'edit', 'write', 'read', 'search', 'find', 'web', 'webSearch', 'agent', 'permission'].includes(
        n.action,
      )
        ? `ap.do.${n.action}`
        : 'ap.do.other',
      { tool: n.target || n.action },
    )
  return (
    <div className="ap-of-bellwrap" ref={root}>
      <button
        type="button"
        className={`ap-of-bell${needs.length > 0 ? ' has' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('of.need', { n: needs.length })}
      </button>
      {open && (
        <div className="ap-of-need" role="dialog" aria-label={t('of.need.list')}>
          {needs.length === 0 && <div className="none">{t('of.need.empty')}</div>}
          {needs.map((n) => (
            <div key={n.kind === 'approval' ? n.id : `q-${n.bot}`}>
              <Mascot id={mascotOf(n.bot)} size={26} />
              {n.kind === 'approval' ? (
                <>
                  <span className="t" title={n.target}>
                    {t('of.need.asks', { name: n.name, action: action(n) })}
                    {n.target && <small>{n.target}</small>}
                  </span>
                  <Button size="sm" disabled={busy === n.id} onClick={() => void answer(n.id, false)}>
                    {t('of.need.reject')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy === n.id}
                    onClick={() => void answer(n.id, true)}
                  >
                    {t('of.need.approve')}
                  </Button>
                </>
              ) : (
                <>
                  <span className="t">{t('of.need.question', { name: n.name })}</span>
                  <Button size="sm" onClick={() => void reply(n)}>
                    {t('of.need.answer')}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Office({ t, nav, params }: PageProps) {
  const team = useTeam(t('of.dp.loose'))
  const live = useTeamLive()
  const [approvals, reload] = usePendingApprovals('all')
  const [tab, setTab] = useState<Tab>(tabOf(params.tab))
  // Đường vào mới (Kanban cũ, thẻ dự án) đổi tab ngay cả khi trang đã mở.
  useEffect(() => setTab(tabOf(params.tab)), [params])
  const needs = needsYou(approvals, live, team.bots)
  const mascotOf = (bot: string) => team.bots.find((b) => b.id === bot)?.mascot ?? bot

  return (
    <div className="ap-of">
      <header className="ap-of-head">
        <h1 className="ap-of-title">{t('of.title')}</h1>
        <span className="ap-of-modes" role="group" aria-label={t('of.mode')}>
          <button type="button" className="ap-of-seg on" aria-pressed="true">
            2D
          </button>
          <button type="button" className="ap-of-seg" aria-disabled="true" title={t('of.soon')}>
            3D
          </button>
        </span>
        <span className="ap-of-tabs" role="tablist" aria-label={t('of.tabs')}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`ap-of-seg${tab === id ? ' on' : ''}`}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {t(`of.tab.${id}`)}
            </button>
          ))}
        </span>
        <Clock />
        <NeedBell t={t} nav={nav} needs={needs} mascotOf={mascotOf} reload={reload} />
      </header>
      <div className="ap-of-main">
        {tab === 'overview' && <Overview t={t} nav={nav} team={team} live={live} need={needs.length} />}
        {tab === 'departments' && <Departments t={t} nav={nav} team={team} />}
        {tab === 'kanban' && (
          <div className="ap-of-kb">
            <Kanban t={t} nav={nav} params={params} />
          </div>
        )}
      </div>
    </div>
  )
}
