/**
 * Thẻ "Chi tiết kỹ thuật" (bản vẽ 6.7b): mọi mục lẻ, thuộc gói nào, trạng thái, công tắc.
 * Mục của lõi aris và mục không cho đổi thì khoá.
 */
import { Card, SearchIcon, Switch, TextInput } from '@aris/ui-kit/react'
import { useMemo, useState } from 'react'
import type { BundleInfo, PageProps, PluginInfo, PluginSource } from '../../page.js'
import type { Change } from './Installed.js'
import { bundleText, debrand, entryText, fold, groupOf } from './model.js'

type T = PageProps['t']
type EntryState = 'active' | 'failed' | 'off' | 'loading'

const stateOf = (p: Pick<PluginInfo, 'enabled' | 'fiberPhase'>): EntryState =>
  !p.enabled
    ? 'off'
    : p.fiberPhase === 'failed'
      ? 'failed'
      : p.fiberPhase === 'active' || p.fiberPhase === null
        ? 'active'
        : 'loading'

/** Mục khoá: của lõi aris, hoặc dsh không cho đổi (không có chỗ ghi, có lý do chỉ đọc). */
export const lockedEntry = (p: Pick<PluginInfo, 'moduleName' | 'patchId' | 'readOnlyReason'>) =>
  p.moduleName.startsWith('@aris/') || !p.patchId || !!p.readOnlyReason

export function Detail({
  t,
  src,
  entries,
  bundles,
  busy,
  change,
}: {
  t: T
  src: PluginSource
  entries: readonly PluginInfo[]
  bundles: readonly BundleInfo[]
  busy: ReadonlySet<string>
  change: Change
}) {
  const [query, setQuery] = useState('')
  // Mục có trong nhiều gói: lấy gói đang bật trước. Mục thuộc gói lõi đang bật thì khoá.
  const { bundleOf, coreKeys } = useMemo(() => {
    const m = new Map<string, string>()
    const core = new Set<string>()
    for (const b of [...bundles].sort((a, b) => Number(b.enabled) - Number(a.enabled))) {
      const title = debrand(bundleText(b, src.resolveText, t).title)
      const isCore = b.enabled && groupOf(b) === 'core'
      for (const r of b.rows) {
        for (const k of [r.entryId, r.moduleName]) {
          if (!k) continue
          if (!m.has(k)) m.set(k, title)
          if (isCore) core.add(k)
        }
      }
    }
    return { bundleOf: m, coreKeys: core }
  }, [bundles, src, t])
  const q = fold(query.trim())
  const rows = entries
    .map((p) => ({
      p,
      ...entryText(p, src.resolveText),
      bundle: bundleOf.get(p.entryId) ?? bundleOf.get(p.moduleName),
    }))
    .filter((r) => !q || fold(`${r.title} ${r.p.moduleName} ${r.bundle ?? ''}`).includes(q))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ap-pl-banner" style={{ borderColor: 'var(--a-line)', background: 'var(--a-panel)' }}>
        {t('pl.detail.warn')}
      </div>
      <span style={{ position: 'relative', display: 'flex', maxWidth: 420 }}>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pl.search', { n: entries.length })}
          aria-label={t('pl.search', { n: entries.length })}
          style={{ paddingLeft: 32, width: '100%' }}
        />
        <span className="a-muted" style={{ position: 'absolute', left: 10, top: 8, pointerEvents: 'none' }}>
          <SearchIcon size={15} />
        </span>
      </span>
      <Card>
        <div className="ap-pl-table head" style={{ borderTop: 0 }}>
          <span>{t('pl.detail.entry')}</span>
          <span>{t('pl.detail.bundle')}</span>
          <span>{t('pl.detail.state')}</span>
          <span>{t('pl.detail.on')}</span>
        </div>
        {rows.map(({ p, title, bundle }) => {
          const st = stateOf(p)
          const name = title
          return (
            <div key={p.entryId} className="ap-pl-table">
              <span style={{ minWidth: 0 }}>
                <b>{name}</b>
                <div
                  className="a-muted a-mono"
                  style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {p.moduleName}
                </div>
              </span>
              <span className="a-muted" style={{ fontSize: 12.5, minWidth: 0 }}>
                {bundle ?? '—'}
              </span>
              <span
                className={st === 'active' ? undefined : 'a-muted'}
                style={{ fontSize: 12.5, color: st === 'failed' ? 'var(--a-danger)' : undefined }}
              >
                {t(`pl.status.${st}`)}
              </span>
              <span>
                {lockedEntry(p) || coreKeys.has(p.entryId) || coreKeys.has(p.moduleName) ? (
                  <span className="a-muted" style={{ fontSize: 12 }} title={p.readOnlyReason}>
                    {t('pl.locked')}
                  </span>
                ) : (
                  <Switch
                    checked={p.enabled}
                    disabled={busy.has(p.entryId)}
                    label={t(p.enabled ? 'pl.turnOff' : 'pl.turnOn', { name })}
                    onChange={(on) => void change(name, src.setPlugin(p.entryId, on), p.entryId)}
                  />
                )}
              </span>
            </div>
          )
        })}
        {rows.length === 0 && <div className="ap-pl-table a-muted">{t('pl.none')}</div>}
      </Card>
    </div>
  )
}
