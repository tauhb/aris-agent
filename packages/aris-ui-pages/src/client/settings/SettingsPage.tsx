/**
 * Trang Cài đặt 6.x — chỗ cài đặt duy nhất của app: các mục của aris (theo canvas),
 * rồi nhóm "Hệ thống" là các mục cài đặt của dsh (chung, model, tài khoản…) vẽ ngay
 * trong trang thay cho hộp thoại riêng của dsh.
 */
import { SettingsShell } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import type { PageProps } from '../page.js'
import { Channels } from './Channels.js'
import { Commander } from './Commander.js'
import { Dashboard } from './Dashboard.js'
import { Guard } from './Guard.js'
import { Integrations } from './Integrations.js'
import { Provider } from './Provider.js'
import { Plugin } from './Plugin.js'
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

/** Mã mục của dsh trong trang: `sys:<mã mục dsh>`. */
const SYS = 'sys:'

export function SettingsPage(props: PageProps) {
  const { t, nav, params, system } = props
  const requested = params.section ?? ''
  const sysId = requested.startsWith(SYS) ? requested.slice(SYS.length) : undefined
  const sys = sysId !== undefined ? system?.sections.find((s) => s.id === sysId) : undefined
  const active = sys ? requested : requested in SECTIONS ? requested : 'dashboard'
  const Section = SECTIONS[active]
  // Provider có cột danh sách provider riêng thay cho cột điều hướng (theo canvas 6.2).
  if (active === 'provider' && Section) return <Section {...props} />
  return (
    <SettingsShell
      caption={t('set.caption')}
      navLabel={t('set.nav')}
      active={active}
      sections={[
        ...ORDER.map((id) => ({ id, label: t(`sec.${id}`) })),
        ...(system?.sections ?? []).map((s) => ({ id: SYS + s.id, label: s.label, group: t('set.system') })),
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
