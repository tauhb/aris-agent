/**
 * Tab Phòng ban của Văn phòng (bản vẽ `VanPhongPhongBan`): mỗi phòng một thẻ (trạng thái, mô tả, linh vật thành viên, số
 * bot, chi tiêu hôm nay so với ngân sách, model mặc định); bấm thẻ mở trang phòng ban. Dưới cùng là bot chưa vào phòng.
 */
import { Button, Mascot, type TeamView } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { fmtUsd } from '../settings/stats-format.js'
import { CreateDialog } from '../team/Department.js'
import { useGuardNow } from './data.js'
import { deptCards, looseBots, type DeptCard } from './model.js'

type T = PageProps['t']

function State({ card, t }: { card: DeptCard; t: T }) {
  if (card.waiting > 0) return <span className="a-pill warn">{t('of.dp.waiting', { n: card.waiting })}</span>
  if (card.working > 0)
    return <span className="a-pill accent">{t('of.dp.working', { n: card.working })}</span>
  return <span className="a-pill muted">{t('of.dp.idle')}</span>
}

export function Departments({ t, nav, team }: { t: T; nav: PageProps['nav']; team: TeamView }) {
  const guard = useGuardNow()
  const [creating, setCreating] = useState(false)
  const dec = t('sx.dec')
  // Chi tiêu từ sổ hàng rào (đọc lại 15 giây); chưa có thì lấy bản trong snapshot của đội.
  const spend = guard ? Object.fromEntries(guard.departments.map((d) => [d.id, d.spent])) : team.spend
  const cards = deptCards(team, spend)
  const bots = cards.reduce((n, c) => n + c.members.length, 0)
  const loose = looseBots(team)
  const add = () => setCreating(true)
  return (
    <div className="ap-of-body">
      <div className="ap-of-dphead">
        <h2>{t('of.dp.title')}</h2>
        <span className="n">{t('of.dp.count', { d: cards.length, b: bots })}</span>
        <Button variant="primary" size="sm" onClick={add}>
          {t('of.dp.new')}
        </Button>
      </div>
      {cards.length === 0 && team.ready && <div className="a-muted">{t('of.dp.none')}</div>}
      <div className="ap-of-dgrid">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ap-of-dc"
            title={t('of.dept.open', { name: c.name })}
            onClick={() => nav.go('department', { id: c.id })}
          >
            <span className="top">
              <b>{c.name}</b>
              <State card={c} t={t} />
              <span className="go" aria-hidden="true">
                ›
              </span>
            </span>
            {c.about && <span className="about">{c.about}</span>}
            <span className="ap-of-crew">
              {c.members.map((m, i) => (
                <span
                  key={m.id}
                  className="ap-of-bob"
                  title={m.name}
                  style={{ animationDelay: `${-0.7 * i}s` }}
                >
                  <Mascot id={m.mascot} size={44} />
                </span>
              ))}
            </span>
            <span className="ap-of-kv">
              <span>
                <b>{c.members.length}</b>
                <span className="m">{t('of.dp.bots')}</span>
              </span>
              <span>
                <b>{fmtUsd(c.spent, dec)} $</b>
                <span className="m">
                  {c.cap !== null ? t('of.dp.spent', { cap: fmtUsd(c.cap, dec) }) : t('of.dp.spentFree')}
                </span>
              </span>
              {c.model && (
                <span className="model">
                  <b>{c.model}</b>
                  <span className="m">{t('of.dp.model')}</span>
                </span>
              )}
            </span>
            {c.cap !== null && (
              <span className={`ap-of-bar${c.pct >= 100 ? ' over' : ''}`}>
                <span style={{ width: `${c.pct}%` }} />
              </span>
            )}
          </button>
        ))}
        <button type="button" className="ap-of-dc new" onClick={add}>
          {t('of.dp.new')}
        </button>
      </div>
      <div className="ap-of-loose">
        <b>{t('of.dp.loose')}</b>
        {loose.map((b) => (
          <span key={b.id} className="ap-of-chip">
            <Mascot id={b.mascot} size={22} />
            {b.name} · {b.role}
          </span>
        ))}
      </div>
      {creating && (
        <CreateDialog
          t={t}
          team={team}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            nav.go('department', { id })
          }}
        />
      )}
    </div>
  )
}
