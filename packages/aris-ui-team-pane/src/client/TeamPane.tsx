/**
 * "Đội bot lúc này" theo màn R3: sơ đồ đội 3D (Commander giữa, các bot xoay
 * quanh), việc gần đây của đội, rồi các lối mở trang khác của cột phải (Tệp,
 * Terminal…) mà dsh vẫn đăng ký như cũ. Đội và việc gần đây là dữ liệu mẫu đến
 * giai đoạn 2.
 */
import { COMMANDER, DEMO_ACTIVITY, DEMO_TEAM, type BotStatus } from '@aris/ui-kit'
import { Button, NavItem, StatusGlyph, TeamOrbit } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
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
const nameOf = (id: string) => [COMMANDER, ...MEMBERS].find((m) => m.id === id)?.name ?? id

export function TeamPane({ t, useGuideEntries, useTabInfo, openMap }: TeamPaneProps) {
  const entries = useGuideEntries((e) => e)
  const { tab } = useTabInfo()
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
  return (
    <div className="aris aris-team">
      <div className="head">
        <h2>{t('title')}</h2>
        <Button variant="ghost" size="sm" className="mapLink" onClick={openMap}>
          {t('openMap')} ›
        </Button>
      </div>

      <div className="map">
        <TeamOrbit
          commander={COMMANDER}
          commanderLabel={t('commander', { name: COMMANDER.name })}
          members={MEMBERS}
          statusLabel={orbitStatus}
          label={t('orbit', {
            name: COMMANDER.name,
            members: MEMBERS.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
          })}
          height={300}
          onSelect={openMap}
        />
      </div>
      <div className="hint">{t('orbitHint')}</div>

      <div className="list" aria-label={t('recent')}>
        {DEMO_ACTIVITY.map((a) => (
          <div key={a.id} className="act">
            <StatusGlyph status={a.status} label={t(`status.${a.status}`)} />
            <span className="txt">
              <b>{nameOf(a.id)}</b> {a.text} · <span className="a-muted">{a.when}</span>
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
