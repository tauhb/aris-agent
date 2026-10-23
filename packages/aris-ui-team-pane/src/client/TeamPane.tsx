/**
 * "Đội bot lúc này" theo màn R3: đội hình (Commander giữa, các bot quanh), việc
 * gần đây của đội, rồi các lối mở trang khác của cột phải (Tệp, Terminal…) mà dsh
 * vẫn đăng ký như cũ. Đội hình và việc gần đây là dữ liệu mẫu đến giai đoạn 2.
 */
import { COMMANDER, DEMO_ACTIVITY, DEMO_TEAM } from '@aris/ui-kit'
import { Button, Mascot, NavItem, StatusGlyph } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import { formation } from './formation.js'
import type { Translate } from './locale.js'

type Selector<T> = <R>(select: (value: T) => R) => R

/** Một lối mở trên trang bắt đầu của cột phải, như registry của dsh liệt kê. */
export interface GuideEntry {
  readonly providerId: string
  readonly kind: string
  readonly id: string
  readonly title: () => string
  readonly icon?: ComponentType<{ size?: number }>
}

export interface TeamPaneProps {
  t: Translate
  useGuideEntries: Selector<readonly GuideEntry[]>
  useTabInfo: () => { tab: { actions: { openTab(kind: string, options: { replaceTab: boolean }): void } } }
  openMap: () => void
}

const MEMBERS = DEMO_TEAM.flatMap((g) => g.members)
const ALL = [COMMANDER, ...MEMBERS]
const nameOf = (id: string) => ALL.find((m) => m.id === id)?.name ?? id

export function TeamPane({ t, useGuideEntries, useTabInfo, openMap }: TeamPaneProps) {
  const entries = useGuideEntries((e) => e)
  const { tab } = useTabInfo()
  const seats = formation(
    COMMANDER.id,
    MEMBERS.map((m) => m.id),
  )
  return (
    <div className="aris aris-team">
      <div className="head">
        <h2>{t('title')}</h2>
        <Button variant="ghost" size="sm" onClick={openMap}>
          {t('openMap')} ›
        </Button>
      </div>

      <div className="map" role="group" aria-label={t('formation')} title={t('formationHint')}>
        {seats.map((s) => {
          const m = ALL.find((x) => x.id === s.id)!
          return (
            <span
              key={s.id}
              className="seat"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              title={`${m.name} · ${m.note}`}
            >
              <Mascot id={s.id} size={s.size} label={m.name} />
            </span>
          )
        })}
      </div>

      <div className="list" aria-label={t('recent')}>
        {DEMO_ACTIVITY.map((a) => (
          <div key={a.id} className="act">
            <StatusGlyph status={a.status} label={t(`status.${a.status}`)} />
            <span className="txt">
              <b>{nameOf(a.id)}</b> {a.text}
              <span className="a-muted"> · {a.when}</span>
            </span>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="more">
          <div className="a-grp">{t('more')}</div>
          {entries.map((e) => {
            const Icon = e.icon
            return (
              <NavItem
                key={`${e.providerId}:${e.id}`}
                label={e.title()}
                icon={Icon ? <Icon size={16} /> : undefined}
                onClick={() => tab.actions.openTab(e.kind, { replaceTab: true })}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
