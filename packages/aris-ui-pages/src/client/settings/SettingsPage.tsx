/**
 * Trang Cài đặt 6.x — chỗ cài đặt duy nhất của app, một nhóm "Cài đặt và vận hành": mục "Chung" của
 * dsh vẽ ngay trong trang, rồi các mục của aris chia nhóm (Model và kết nối, Kênh, Vận hành an toàn, Đội bot,
 * Mở rộng). Các mục khác của dsh đã có trang aris thay (Model trong Provider và khoá, Plugin có sẵn trong
 * Plugin, Mẫu bot); mục lạ của dsh vẫn mở được bằng `sys:<mã mục>` nhưng không còn nhóm "Hệ thống" riêng.
 */
import { SettingsShell } from '@aris/ui-kit/react'
import type { ComponentType } from 'react'
import type { PageProps } from '../page.js'
import { Backup } from './Backup.js'
import { Channels } from './Channels.js'
import { Commander } from './Commander.js'
import { Connections } from './Connections.js'
import { Guard } from './Guard.js'
import { Integrations } from './Integrations.js'
import { ModelPage } from './Model.js'
import { Plugin } from './Plugin.js'
import { Presets } from './Presets.js'
import { Provider } from './Provider.js'
import { SemanticPage } from './SemanticPage.js'
import { Stats } from './Stats.js'

// Màn mẫu "Màn hình của bot" (6.6, `Screen.tsx`) tạm gỡ khỏi menu; sẽ làm lại ở giai đoạn 8.
export const SECTIONS: Record<string, ComponentType<PageProps>> = {
  provider: Provider,
  model: ModelPage,
  semantic: SemanticPage,
  channels: Channels,
  integrations: Integrations,
  connections: Connections,
  guard: Guard,
  backup: Backup,
  stats: Stats,
  commander: Commander,
  presets: Presets,
  plugin: Plugin,
}

/** Thứ tự mục và nhóm trong menu bên trái (mục "Chung" của dsh đứng đầu, không nhóm). */
const GROUPS = [
  { group: 'grp.model', ids: ['provider', 'model', 'semantic'] },
  { group: 'grp.channels', ids: ['channels', 'integrations'] },
  { group: 'grp.safety', ids: ['guard', 'backup', 'stats'] },
  { group: 'grp.team', ids: ['commander', 'presets'] },
  { group: 'grp.extend', ids: ['connections', 'plugin'] },
] as const

/** Mã mục cũ còn nơi gọi tới: "Ảnh và video" đã gộp vào Model. */
const LEGACY: Record<string, string> = { media: 'model' }

/** Mã mục "Chung" của dsh. */
const GENERAL_SECTION = 'general'

/** Mã mục của dsh trong trang: `sys:<mã mục dsh>`. */
const SYS = 'sys:'

export function SettingsPage(props: PageProps) {
  const { t, nav, params, system } = props
  const requested = LEGACY[params.section ?? ''] ?? params.section ?? ''
  const sysOf = (id: string) =>
    id.startsWith(SYS) ? system?.sections.find((s) => s.id === id.slice(SYS.length)) : undefined
  // Bảng điều khiển (6.1) đã rời Cài đặt, sẽ ra menu chính; mặc định mở "Chung" của dsh.
  const general = system?.sections.find((s) => s.id === GENERAL_SECTION)
  const fallback = general ? SYS + general.id : 'provider'
  const active = sysOf(requested) || requested in SECTIONS ? requested : fallback
  const sys = sysOf(active)
  const Section = SECTIONS[active]
  return (
    <SettingsShell
      caption={t('set.caption')}
      navLabel={t('set.nav')}
      active={active}
      sections={[
        // "Chung" (ngôn ngữ, giao diện…) của dsh đứng đầu.
        ...(general ? [{ id: SYS + general.id, label: general.label }] : []),
        ...GROUPS.flatMap(({ group, ids }) =>
          ids.map((id) => ({ id, label: t(`sec.${id}`), group: t(group) })),
        ),
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
