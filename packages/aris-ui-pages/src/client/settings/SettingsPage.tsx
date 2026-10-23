/**
 * Trang Cài đặt 6.x: cột điều hướng các mục (theo canvas) và trang của mục đang
 * chọn. "Plugin" mở trang Plugin của dsh; "Chung" mở hộp thoại cài đặt của dsh
 * (ngôn ngữ, giao diện, phím tắt) vì aris giữ nguyên phần đó.
 */
import { NavItem, SettingsShell } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import type { PageProps } from '../page.js'
import { Channels } from './Channels.js'
import { Commander } from './Commander.js'
import { Dashboard } from './Dashboard.js'
import { Guard } from './Guard.js'
import { Integrations } from './Integrations.js'
import { Provider } from './Provider.js'
import { Screen } from './Screen.js'
import { Stats } from './Stats.js'

export const SECTIONS: Record<string, ComponentType<PageProps>> = {
  dashboard: Dashboard,
  provider: Provider,
  channels: Channels,
  integrations: Integrations,
  guard: Guard,
  stats: Stats,
  commander: Commander,
  screen: Screen,
}

const ORDER = [
  'dashboard',
  'provider',
  'channels',
  'integrations',
  'guard',
  'stats',
  'commander',
  'screen',
  'plugin',
] as const

export function SettingsPage(props: PageProps) {
  const { t, nav, params } = props
  const active = params.section && params.section in SECTIONS ? params.section : 'dashboard'
  const Section = SECTIONS[active]!
  // Provider có cột danh sách provider riêng thay cho cột điều hướng (theo canvas 6.2).
  if (active === 'provider') return <Section {...props} />
  return (
    <SettingsShell
      caption={t('set.caption')}
      navLabel={t('set.nav')}
      active={active}
      sections={ORDER.map((id) => ({ id, label: t(`sec.${id}`) }))}
      onSelect={(id) => (id === 'plugin' ? nav.openPanel('plugins') : nav.go('settings', { section: id }))}
      footer={<NavItem label={t('set.general')} className="a-muted" onClick={nav.openDshSettings} />}
    >
      <Section {...props} />
    </SettingsShell>
  )
}
