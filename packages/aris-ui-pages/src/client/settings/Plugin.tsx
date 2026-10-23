/**
 * 6.7 · Plugin (bản vẽ 6.7b): ba thẻ Đã cài · Chợ plugin · Chi tiết kỹ thuật, đọc và đổi thật qua
 * `pluginManager`, `pluginMarket` của bản cài. Thay mục "Plugin có sẵn" (ẩn khỏi nhóm Hệ thống).
 * Thay đổi cần khởi động lại thì gom vào một dải báo, bấm một lần là aris chạy lại. Gộp luôn trang
 * Plugins của dsh: gói chính thức cài theo yêu cầu và trang cấu hình riêng của plugin vẽ ngay ở đây.
 */
import { Button, Card, CardRow, PageShell, Pill, Tabs } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type {
  BundleInfo,
  ChangeResult,
  ConfigLedger,
  ConfigTarget,
  Outcome,
  PageProps,
  PluginConfig,
  PluginInfo,
  PluginSource,
} from '../page.js'
import { Detail } from './plugins/Detail.js'
import { InstallDialog, type InstallItem } from './plugins/InstallDialog.js'
import { Installed, type Change, type Update } from './plugins/Installed.js'
import { entryView, hostOf, MarketTab } from './plugins/Market.js'
import { bundleText, MARKET_BUNDLE, marketCard, outcomeOf, searchUpTo, stateOf } from './plugins/model.js'

/** Mã mục "Plugin có sẵn" của dsh trong `settings.section`: trang này thay nó. */
export const DSH_PLUGINS_SECTION = 'plugins'

const NO_LEDGER: ConfigLedger = { items: [], bundles: new Set(), rows: new Set() }
const NO_LEDGER_SOURCE = { getSnapshot: () => NO_LEDGER, subscribe: () => () => {} }

type T = PageProps['t']
type Tab = 'installed' | 'market' | 'detail'
type Notice = { tone: 'ok' | 'warn' | 'danger'; text: string }

function useData(src: PluginSource) {
  const [bundles, setBundles] = useState<readonly BundleInfo[] | null>(null)
  const [entries, setEntries] = useState<readonly PluginInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    void src.bundles().then((r) => (r.ok ? (setBundles(r.value), setError(null)) : setError(r.error)))
    void src.plugins().then((r) => r.ok && setEntries(r.value))
  }, [src])
  useEffect(() => {
    reload()
    return src.on('changed', reload)
  }, [src, reload])
  return { bundles, entries, error, reload }
}

/** Bản mới của các gói đã cài, tìm trên mọi nguồn chợ. */
function useUpdates(src: PluginSource, bundles: readonly BundleInfo[] | null) {
  const [updates, setUpdates] = useState<Update[]>([])
  useEffect(() => {
    const market = src.market
    if (!market || !bundles) return
    let live = true
    void market.indexes().then(async (r) => {
      if (!r.ok) return
      const found: Update[] = []
      for (const ix of r.value.filter((x) => !x.error)) {
        const s = await searchUpTo(market, ix.url, { sort: { kind: 'index' } }, 2000)
        if (!s.ok) continue
        for (const e of s.value.entries) {
          const card = marketCard(e)
          if (!card.update || !card.version || !bundles.some((b) => b.name === e.name)) continue
          if (found.some((u) => u.bundle === e.name)) continue
          found.push({
            bundle: e.name,
            title: entryView(e, src.resolveText).title,
            spec: card.version.install.spec,
            version: card.version.version,
            source: hostOf(ix.url),
            registry: card.version.install.registry,
          })
        }
      }
      if (live) setUpdates(found)
    })
    return () => {
      live = false
    }
  }, [src, bundles])
  return updates
}

function RestartBanner({
  t,
  src,
  names,
  onLater,
  onNotice,
}: {
  t: T
  src: PluginSource
  names: readonly string[]
  onLater: () => void
  onNotice: (n: Notice) => void
}) {
  const [restarting, setRestarting] = useState(false)
  const restart = async () => {
    setRestarting(true)
    const r = await src.restart()
    if (r.ok && r.value.restarting) {
      // aris chạy ngầm tự lên lại; chờ một lúc rồi nạp lại trang.
      setTimeout(() => window.location.reload(), 5000)
      return
    }
    setRestarting(false)
    onNotice({
      tone: 'warn',
      text: r.ok ? t('pl.restart.manual') : t('pl.result.failed', { error: r.error }),
    })
  }
  return (
    <div className="ap-pl-banner" role="status">
      <span className="grow" style={{ minWidth: 0 }}>
        {restarting ? t('pl.restart.doing') : t('pl.restart.need', { names: names.join(', ') })}
      </span>
      <Button size="sm" variant="primary" disabled={restarting} onClick={() => void restart()}>
        {t('pl.restart.now')}
      </Button>
      <Button size="sm" variant="ghost" disabled={restarting} onClick={onLater}>
        {t('pl.restart.later')}
      </Button>
    </div>
  )
}

/** Trang cấu hình riêng của một plugin, vẽ trong trang Plugin; plugin tự giữ form và nút lưu. */
function ConfigPage({
  t,
  config,
  target,
  title,
  onBack,
}: {
  t: T
  config: PluginConfig
  target: ConfigTarget
  title: string
  onBack: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <button
          type="button"
          className="ap-link"
          style={{ border: 0, background: 'none', padding: 0 }}
          onClick={onBack}
        >
          ← {t('pl.cfg.back')}
        </button>
      </div>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      <Card>
        <div style={{ padding: 16 }} data-plugin-config>
          {config.render(target, 'page')}
        </div>
      </Card>
    </div>
  )
}

function PluginPage({
  t,
  src,
  config,
  params,
}: {
  t: T
  src: PluginSource
  config: PluginConfig | undefined
  params: PageProps['params']
}) {
  const { bundles, entries, error, reload } = useData(src)
  const ledgerSource = config?.ledger ?? NO_LEDGER_SOURCE
  const ledger = useSyncExternalStore(ledgerSource.subscribe, ledgerSource.getSnapshot)
  const [open, setOpen] = useState<{ target: ConfigTarget; title: string } | null>(null)
  const updates = useUpdates(src, bundles)
  const [tab, setTab] = useState<Tab>('installed')
  const [restart, setRestart] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [installing, setInstalling] = useState<InstallItem[] | null>(null)

  // Gói khác mở trang cấu hình của mình (`pluginNavigation.openBundle`): tới thẳng trang đó.
  const wanted = params.bundle
  useEffect(() => {
    if (!wanted || !bundles) return
    const b = bundles.find((x) => x.name === wanted)
    setTab('installed')
    if (b && ledger.bundles.has(wanted))
      setOpen({ target: { kind: 'bundle', key: wanted }, title: bundleText(b, src.resolveText, t).title })
  }, [wanted, bundles, ledger, src, t])
  const configure = (target: ConfigTarget, title: string) => setOpen({ target, title })

  const needRestart = (label: string) => setRestart((xs) => (xs.includes(label) ? xs : [...xs, label]))

  const settle = (label: string, r: Outcome<ChangeResult>) => {
    if (!r.ok) return setNotice({ tone: 'danger', text: t('pl.result.failed', { error: r.error }) })
    const o = outcomeOf(r.value)
    if (o.kind === 'restart') needRestart(label)
    else if (o.kind === 'failed')
      setNotice({ tone: 'danger', text: t('pl.result.failed', { error: o.detail }) })
    else if (o.kind === 'overridden') setNotice({ tone: 'warn', text: t('pl.result.overridden') })
    else setNotice(null)
  }

  const change: Change = async (label, p, key) => {
    setBusy((s) => new Set(s).add(key))
    const r = await p
    setBusy((s) => {
      const n = new Set(s)
      n.delete(key)
      return n
    })
    settle(label, r)
    reload()
  }

  const market = src.market
  const marketBundle = bundles?.find((b) => b.name === MARKET_BUNDLE)
  const failedCount = bundles?.filter((b) => stateOf(b) === 'failed').length ?? 0
  const tabs: { value: Tab; label: string }[] = [
    { value: 'installed', label: t('pl.tab.installed', { n: bundles?.length ?? 0 }) },
    ...(market ? [{ value: 'market' as const, label: t('pl.tab.market') }] : []),
    { value: 'detail', label: t('pl.tab.detail', { n: entries?.length ?? 0 }) },
  ]

  return (
    <PageShell
      title={t('sec.plugin')}
      subtitle={t('pl.subtitle')}
      actions={
        failedCount > 0 ? <Pill tone="danger">{t('pl.failedCount', { n: failedCount })}</Pill> : undefined
      }
    >
      <Tabs
        label={t('sec.plugin')}
        tabs={tabs}
        value={tab}
        onChange={(v) => {
          setOpen(null)
          setTab(v)
        }}
      />
      {restart.length > 0 && (
        <RestartBanner t={t} src={src} names={restart} onLater={() => setRestart([])} onNotice={setNotice} />
      )}
      {notice && (
        <div
          role="alert"
          className="ap-pl-banner"
          style={{
            borderColor: `var(--a-${notice.tone})`,
            background: `var(--a-${notice.tone}Soft)`,
          }}
        >
          <span className="grow">{notice.text}</span>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
            {t('pl.close')}
          </Button>
        </div>
      )}
      {error && (
        <div
          className="ap-pl-banner"
          style={{ borderColor: 'var(--a-danger)', background: 'var(--a-dangerSoft)' }}
        >
          <span className="grow">{t('pl.loadError', { error })}</span>
          <Button size="sm" onClick={reload}>
            {t('pl.retry')}
          </Button>
        </div>
      )}
      {!bundles && !error && <div className="a-muted">{t('pl.loading')}</div>}
      {open && config && (
        <ConfigPage
          t={t}
          config={config}
          target={open.target}
          title={open.title}
          onBack={() => setOpen(null)}
        />
      )}
      {!open && tab === 'installed' && bundles && (
        <Installed
          t={t}
          src={src}
          bundles={bundles}
          busy={busy}
          updates={updates}
          change={change}
          onInstall={setInstalling}
          config={config}
          ledger={ledger}
          onConfigure={configure}
        />
      )}
      {!open && tab === 'market' && marketBundle && !marketBundle.enabled && (
        <Card title={t('pl.mk.offTitle')}>
          <CardRow
            label={
              <span className="a-muted" style={{ fontSize: 13 }}>
                {t('pl.mk.offHint')}
              </span>
            }
          >
            <Button
              size="sm"
              variant="primary"
              disabled={busy.has(MARKET_BUNDLE)}
              onClick={() =>
                void change(t('pl.b.plugin-market'), src.setBundle(MARKET_BUNDLE, true), MARKET_BUNDLE)
              }
            >
              {t('pl.mk.turnOn')}
            </Button>
          </CardRow>
        </Card>
      )}
      {!open && tab === 'market' && market && marketBundle?.enabled !== false && (
        <MarketTab t={t} src={src} market={market} onInstall={setInstalling} />
      )}
      {!open && tab === 'detail' && bundles && entries && (
        <Detail
          t={t}
          src={src}
          entries={entries}
          bundles={bundles}
          busy={busy}
          change={change}
          ledger={ledger}
          onConfigure={configure}
        />
      )}
      {installing && (
        <InstallDialog
          t={t}
          src={src}
          items={installing}
          onClose={() => {
            setInstalling(null)
            reload()
          }}
          onResult={(item, r) => {
            settle(item.title, { ok: true, value: r })
            // Gói chính thức cài theo yêu cầu: cài xong thì bật luôn, như trang Plugins gốc.
            const o = outcomeOf(r)
            if (item.enable && (o.kind === 'applied' || o.kind === 'restart'))
              void change(item.title, src.setBundle(item.enable, true), item.enable)
          }}
        />
      )}
    </PageShell>
  )
}

export function Plugin({ t, plugins, pluginConfig, params }: PageProps) {
  if (!plugins)
    return (
      <PageShell title={t('sec.plugin')}>
        <div className="a-muted">{t('pl.unavailable')}</div>
      </PageShell>
    )
  return <PluginPage t={t} src={plugins} config={pluginConfig} params={params} />
}
