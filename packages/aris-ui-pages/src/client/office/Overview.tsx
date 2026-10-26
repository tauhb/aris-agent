/**
 * Tab Tổng quan của Văn phòng. Chế độ 2D (bản vẽ `VanPhong2D`): Aris và bong bóng thoại, bốn con số lớn, tab phòng ban,
 * bàn làm việc của từng bot, cột "Vừa làm gì" và ngăn kéo của bot đang chọn. Chế độ 3D (`Office3D`) dùng chung dữ liệu và
 * chính ngăn kéo đó. Mọi số liệu lấy từ API thật.
 */
import { Mascot, type TeamLive, type TeamView } from '@aris/ui-kit/react'
import { useMemo, useState } from 'react'
import type { PageProps } from '../page.js'
import { fmtTokens, fmtUsd } from '../settings/stats-format.js'
import { DeskCard } from './Desk.js'
import { Drawer } from './Drawer.js'
import { FeedRow } from './FeedRow.js'
import { Office3D } from './Office3D.js'
import { useFeed, useGuardNow, useTodayTokens } from './data.js'
import {
  commanderDesk,
  deskGroups,
  feedFor,
  officeSummary,
  type Desk,
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
  mode,
  onUnsupported,
}: {
  t: T
  nav: PageProps['nav']
  team: TeamView
  live: TeamLive | null
  /** Số việc đang chờ người dùng. */
  need: number
  mode: '2d' | '3d'
  /** Máy không dựng được WebGL: quay về 2D. */
  onUnsupported: () => void
}) {
  const tokens = useTodayTokens()
  const guard = useGuardNow()
  const feed = useFeed()
  const [dept, setDept] = useState('all')
  const [sel, setSel] = useState<string | null>(null)
  const dec = t('sx.dec')

  const groups = useMemo(() => deskGroups(team, live), [team, live])
  const aris = useMemo(() => commanderDesk(team, live), [team, live])
  const desks = groups.flatMap((g) => g.desks)
  const shown = dept === 'all' ? groups : groups.filter((g) => keyOf(g) === dept)
  const chosen = sel === aris.id ? aris : desks.find((d) => d.id === sel)
  // Aris (chỉ huy) cũng làm việc: tính vào câu tóm tắt và số đang làm.
  const everyone = [aris, ...desks]
  const bots = everyone.map((d) => ({ name: d.name, status: d.status, since: d.since }))
  const working = everyone.filter((d) => d.status === 'working').length
  const faceOf = (bot: string): Face =>
    bot === team.commander.id
      ? { id: team.commander.mascot ?? 'aris', accessory: team.commander.accessory }
      : {
          id: desks.find((d) => d.id === bot)?.mascot ?? bot,
          accessory: desks.find((d) => d.id === bot)?.accessory,
        }
  const feedIds = dept === 'all' ? null : new Set(shown.flatMap((g) => g.desks.map((d) => d.id)))
  const lines = feed ? feedFor(feed, feedIds) : null

  const cap = guard?.settings.teamCapUsd ?? 0
  const spent = guard ? `${fmtUsd(guard.spent, dec)} $` : '–'
  const pick = (d: Desk) => setSel((cur) => (cur === d.id ? null : d.id))
  const drawer = chosen && (
    <Drawer
      key={chosen.id}
      desk={chosen}
      sessions={live?.status[chosen.id]?.sessions ?? []}
      t={t}
      nav={nav}
      onClose={() => setSel(null)}
    />
  )

  if (mode === '3d') {
    return (
      <>
        <Office3D
          t={t}
          groups={groups}
          aris={aris}
          live={live}
          tokens={tokens ? fmtTokens(tokens.tokens, dec) : '–'}
          cost={spent}
          costNote={cap > 0 ? t('of.num.cost', { cap: fmtUsd(cap, dec) }) : t('of.num.costFree')}
          need={need}
          lines={feed}
          faceOf={faceOf}
          selected={sel}
          onPick={setSel}
          onUnsupported={onUnsupported}
        />
        {drawer}
      </>
    )
  }

  return (
    <>
      <div className="ap-of-body">
        <div className="ap-of-hero">
          <div className="ap-of-aris">
            <button type="button" aria-label={t('of.desk', { name: aris.name })} onClick={() => pick(aris)}>
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
          <div className="ap-of-cols">
            <div className="ap-of-left">
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
                    {g.waiting > 0 && (
                      <small className="warn">{t('of.dept.waiting', { n: g.waiting })}</small>
                    )}
                  </button>
                ))}
              </div>
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
                      <DeskCard key={d.id} desk={d} t={t} selected={sel === d.id} onPick={() => pick(d)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <aside className="ap-of-feed" aria-label={t('of.feed.title')}>
              <h2>{t('of.feed.title')}</h2>
              {lines?.length === 0 && <div className="a-muted">{t('of.feed.empty')}</div>}
              {lines?.map((f) => (
                <FeedRow key={`${f.at}-${f.bot}-${f.kind}-${f.what}`} item={f} t={t} face={faceOf(f.bot)} />
              ))}
            </aside>
          </div>
        )}
      </div>
      {drawer}
    </>
  )
}
