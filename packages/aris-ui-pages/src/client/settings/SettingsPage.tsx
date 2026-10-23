/**
 * Trang Cài đặt 6.x — chỗ cài đặt duy nhất của app, một nhóm "Cài đặt và vận hành": mục "Chung"
 * của dsh vẽ ngay trong trang, rồi các mục của aris. Các mục khác của dsh đã có trang aris thay
 * (Model trong Provider, Plugin có sẵn trong Plugin, Mẫu bot); mục lạ của dsh vẫn mở được bằng
 * `sys:<mã mục>` nhưng không còn nhóm "Hệ thống" riêng.
 */
import { SettingsShell } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import type { PageProps } from '../page.js'
import { Channels } from './Channels.js'
import { Commander } from './Commander.js'
import { Dashboard } from './Dashboard.js'
import { Guard } from './Guard.js'
import { Integrations } from './Integrations.js'
import { Plugin } from './Plugin.js'
import { Presets } from './Presets.js'
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
  plugin: Plugin,
  presets: Presets,
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
  'presets',
] as const

/** Mã mục "Chung" của dsh. */
const GENERAL_SECTION = 'general'

/** Mã mục của dsh trong trang: `sys:<mã mục dsh>`. */
const SYS = 'sys:'

export function SettingsPage(props: PageProps) {
  const { t, nav, params, system } = props
  const requested = params.section ?? ''
  const sysId = requested.startsWith(SYS) ? requested.slice(SYS.length) : undefined
  const sys = sysId !== undefined ? system?.sections.find((s) => s.id === sysId) : undefined
  const active = sys ? requested : requested in SECTIONS ? requested : 'dashboard'
  const Section = SECTIONS[active]
  const general = system?.sections.find((s) => s.id === GENERAL_SECTION)
  return (
    <SettingsShell
      caption={t('set.caption')}
      navLabel={t('set.nav')}
      active={active}
      sections={[
        // "Chung" (ngôn ngữ, giao diện…) của dsh đứng đầu.
        ...(general ? [{ id: SYS + general.id, label: general.label }] : []),
        ...ORDER.map((id) => ({ id, label: t(`sec.${id}`) })),
      ]}
      onSelect={(id) => nav.go('settings', { section: id })}
    >
      {sys && system ? (
        <main className="a-page ap-sys" aria-label={sys.label}>
          {system.render(sys.id)}
        </main>
      ) : (
        Section && <Section {...props} />
      )}
    </SettingsShell>
  )
}
