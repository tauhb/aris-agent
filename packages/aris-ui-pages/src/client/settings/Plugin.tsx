/**
 * 6.7 · Plugin: mọi plugin của bản cài (của aris và có sẵn của dsh), đọc thật từ
 * `remote.pluginInventory` của dsh, kèm các mẫu bot dùng plugin nào. Gộp mục "Plugin có sẵn"
 * của dsh vào đây (mục đó ẩn khỏi nhóm Hệ thống). Bật/tắt và chợ plugin ở trang Plugins của dsh.
 */
import { Button, Card, CardRow, PageShell, Pill, SearchIcon, TextInput } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageProps, PluginEntry, PluginSnapshot, PluginSource } from '../page.js'
import { Col, Dot } from '../ui.js'

/** Mã mục "Plugin có sẵn" của dsh trong `settings.section`: trang này thay nó. */
export const DSH_PLUGINS_SECTION = 'plugins'

type T = PageProps['t']
type Status = 'active' | 'failed' | 'off' | 'loading'

const statusOf = (p: Pick<PluginEntry, 'enabled' | 'fiberPhase'>): Status =>
  !p.enabled
    ? 'off'
    : p.fiberPhase === 'failed'
      ? 'failed'
      : p.fiberPhase === 'active' || p.fiberPhase === null
        ? 'active'
        : 'loading'

const DOT: Record<Status, string> = {
  active: 'var(--a-ok)',
  failed: 'var(--a-danger)',
  off: 'var(--a-muted)',
  loading: 'var(--a-warn)',
}

/** Tên ngắn khi plugin không khai tên hiển thị: bỏ phạm vi gói và tiền tố `dsh-`. */
export const shortName = (moduleName: string) =>
  moduleName
    .replace(/^@[^/]+\//, '')
    .replace(/^dsh-/, '')
    .replace(/\/.*$/, '')

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

function text(p: PluginEntry, source: PluginSource) {
  const title = p.meta?.title ? source.resolveText(p.meta.title) : shortName(p.moduleName)
  const description = p.meta?.description ? source.resolveText(p.meta.description) : undefined
  return { title, description }
}

/** Plugin của aris đứng trước, rồi plugin có sẵn của dsh; mỗi nhóm theo tên. */
export function groupPlugins(entries: readonly PluginEntry[]) {
  const aris = entries.filter((e) => e.moduleName.startsWith('@aris/'))
  const builtIn = entries.filter((e) => !e.moduleName.startsWith('@aris/'))
  return { aris, builtIn }
}

function useInventory(source: PluginSource | undefined) {
  const [data, setData] = useState<PluginSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    if (!source) return
    setError(null)
    void source.list().then((r) => (r.ok ? setData(r.value) : setError(r.error)))
  }, [source])
  useEffect(load, [load])
  return { data, error, reload: load }
}

function Row({ t, p, source }: { t: T; p: PluginEntry; source: PluginSource }) {
  const st = statusOf(p)
  const { title, description } = text(p, source)
  return (
    <CardRow>
      <Dot color={DOT[st]} size={8} />
      <span className="grow" style={{ minWidth: 0 }}>
        <b>{title}</b>{' '}
        <span className="a-muted a-mono" style={{ fontSize: 11.5 }}>
          {p.moduleName}
        </span>
        {description && (
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {description}
          </div>
        )}
        {p.meta?.error && (
          <div style={{ fontSize: 12, color: 'var(--a-danger)' }}>
            {t('pl.metaError', { error: p.meta.error })}
          </div>
        )}
      </span>
      <span
        className={st === 'active' ? undefined : 'a-muted'}
        style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}
      >
        {t(`pl.status.${st}`)}
      </span>
    </CardRow>
  )
}

export function Plugin({ t, nav, plugins }: PageProps) {
  const { data, error, reload } = useInventory(plugins)
  const [query, setQuery] = useState('')
  const q = fold(query.trim())
  const match = useMemo(
    () => (p: PluginEntry) => {
      if (!q || !plugins) return true
      const { title, description } = text(p, plugins)
      return fold(`${title} ${description ?? ''} ${p.moduleName}`).includes(q)
    },
    [q, plugins],
  )
  if (!plugins)
    return (
      <PageShell title={t('sec.plugin')}>
        <div className="a-muted">{t('pl.unavailable')}</div>
      </PageShell>
    )
  const groups = data ? groupPlugins(data.entries.filter(match)) : null
  const total = data?.entries.length ?? 0
  const failedCount = data?.entries.filter((e) => statusOf(e) === 'failed').length ?? 0
  return (
    <PageShell
      title={t('sec.plugin')}
      subtitle={t('pl.subtitle')}
      actions={
        failedCount > 0 ? <Pill tone="danger">{t('pl.failedCount', { n: failedCount })}</Pill> : undefined
      }
    >
      <div className="ap-cols">
        <Col grow={1.3} basis={460}>
          <label className="a-field">
            <span style={{ position: 'relative', display: 'flex' }}>
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('pl.search', { n: total })}
                aria-label={t('pl.search', { n: total })}
                style={{ paddingLeft: 32, width: '100%' }}
              />
              <span
                className="a-muted"
                style={{ position: 'absolute', left: 10, top: 8, pointerEvents: 'none' }}
              >
                <SearchIcon size={15} />
              </span>
            </span>
          </label>
          {error && (
            <Card>
              <CardRow
                label={<span style={{ color: 'var(--a-danger)' }}>{t('pl.loadError', { error })}</span>}
              >
                <Button size="sm" onClick={reload}>
                  {t('pl.retry')}
                </Button>
              </CardRow>
            </Card>
          )}
          {!data && !error && <div className="a-muted">{t('pl.loading')}</div>}
          {groups && (
            <>
              <Card
                title={
                  <>
                    {t('pl.aris')}{' '}
                    <span className="a-muted" style={{ fontWeight: 400 }}>
                      {t('pl.count', { n: groups.aris.length })}
                    </span>
                  </>
                }
              >
                {groups.aris.map((p) => (
                  <Row key={p.entryId} t={t} p={p} source={plugins} />
                ))}
                {groups.aris.length === 0 && (
                  <CardRow label={<span className="a-muted">{t('pl.none')}</span>} />
                )}
              </Card>
              <Card
                title={
                  <>
                    {t('pl.builtIn')}{' '}
                    <span className="a-muted" style={{ fontWeight: 400 }}>
                      {t('pl.count', { n: groups.builtIn.length })}
                    </span>
                  </>
                }
                subtitle={t('pl.builtInHint')}
              >
                {groups.builtIn.map((p) => (
                  <Row key={p.entryId} t={t} p={p} source={plugins} />
                ))}
                {groups.builtIn.length === 0 && (
                  <CardRow label={<span className="a-muted">{t('pl.none')}</span>} />
                )}
              </Card>
            </>
          )}
        </Col>
        <Col basis={340}>
          <Card title={t('pl.manage')}>
            <CardRow>
              <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('pl.manageHint')}
                </span>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('pl.warn')}
                </span>
              </span>
            </CardRow>
            <CardRow label={<span className="a-muted">{t('pl.market')}</span>}>
              <Button size="sm" onClick={() => nav.openPanel('plugins')}>
                {t('pl.openMarket')}
              </Button>
            </CardRow>
          </Card>
          {data?.agentPresets && data.agentPresets.length > 0 && (
            <Card title={t('pl.presets')} subtitle={t('pl.presetsHint')}>
              {data.agentPresets.map((g) => (
                <CardRow
                  key={g.id}
                  label={
                    <span>
                      <b>{g.name ?? g.id}</b>{' '}
                      {g.isDefault && <span className="a-muted">· {t('pl.presetDefault')}</span>}
                      {g.broken && <div style={{ fontSize: 12, color: 'var(--a-danger)' }}>{g.broken}</div>}
                    </span>
                  }
                >
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {t('pl.count', { n: g.rows.filter((r) => r.enabled !== false).length })}
                  </span>
                </CardRow>
              ))}
            </Card>
          )}
        </Col>
      </div>
    </PageShell>
  )
}
