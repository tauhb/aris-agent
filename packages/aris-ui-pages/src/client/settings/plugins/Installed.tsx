/**
 * Thẻ "Đã cài" (bản vẽ 6.7b): bật/tắt theo gói. Lõi khoá, gói có sẵn và gói tự thêm có công tắc,
 * gói tự thêm gỡ được. Cột phải: thêm từ tên gói và các bản mới.
 */
import { Button, Card, CardRow, Pill, Switch, TextInput } from '@aris/ui-kit/react'
import { useState } from 'react'
import type {
  BundleInfo,
  ChangeResult,
  ConfigLedger,
  ConfigTarget,
  Outcome,
  PageProps,
  PluginConfig,
  PluginSource,
  SpecInspection,
} from '../../page.js'
import { Col } from '../../ui.js'
import type { InstallItem } from './InstallDialog.js'
import { bundleText, debrand, groupBundles, groupOf, letterOf, stateOf, type BundleGroup } from './model.js'

type T = PageProps['t']
/** Gửi một thay đổi; `key` để khoá nút trong lúc chờ. */
export type Change = (label: string, p: Promise<Outcome<ChangeResult>>, key: string) => Promise<void>

export interface Update extends InstallItem {
  bundle: string
}

function BundleRow({
  t,
  src,
  b,
  busy,
  update,
  change,
  onUpdate,
  onInstall,
  onConfigure,
}: {
  t: T
  src: PluginSource
  b: BundleInfo
  busy: boolean
  update: Update | undefined
  change: Change
  onUpdate: (u: Update) => void
  onInstall: (items: InstallItem[]) => void
  /** Gói có trang cấu hình riêng thì có nút Cấu hình. */
  onConfigure: ((title: string) => void) | undefined
}) {
  const group = groupOf(b)
  const { title, description } = bundleText(b, src.resolveText, t)
  const name = debrand(title)
  const state = stateOf(b)
  const source =
    group === 'core'
      ? 'aris'
      : group === 'builtin'
        ? t('pl.src.builtin')
        : [t('pl.src.added'), b.version].filter(Boolean).join(' · ')
  const remove = () => {
    if (window.confirm(t('pl.removeConfirm', { name }))) void change(name, src.remove(b.name), b.name)
  }
  return (
    <CardRow>
      <span className={`ap-pl-tile ${group}`} aria-hidden>
        {letterOf(name)}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b>{name}</b>{' '}
        <span className="a-muted" style={{ fontSize: 12 }}>
          · {source}
        </span>
        {description && (
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {debrand(description)}
          </div>
        )}
        {(b.error || b.meta?.error) && (
          <div style={{ fontSize: 12, color: 'var(--a-danger)' }}>
            {b.error?.diagnostic ?? b.error?.code ?? b.meta?.error}
          </div>
        )}
      </span>
      {update && (
        <button
          type="button"
          className="a-pill warn"
          style={{ border: 0, cursor: 'pointer' }}
          onClick={() => onUpdate(update)}
        >
          {t('pl.hasUpdate', { v: update.version ?? '' })}
        </button>
      )}
      <span
        className={state === 'active' ? undefined : 'a-muted'}
        style={{
          fontSize: 12.5,
          whiteSpace: 'nowrap',
          color: state === 'failed' ? 'var(--a-danger)' : undefined,
        }}
      >
        {t(`pl.state.${state}`)}
      </span>
      {group === 'core' ? (
        <Pill tone="muted">{t('pl.required')}</Pill>
      ) : state === 'missing' ? (
        b.installTarget && (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() =>
              b.installTarget &&
              onInstall([
                {
                  title: name,
                  spec: b.installTarget.spec,
                  version: b.installTarget.version,
                  source: t('pl.src.official'),
                  registry: b.installTarget.registry,
                  enable: b.name,
                },
              ])
            }
          >
            {t('pl.mk.install')}
          </Button>
        )
      ) : (
        <Switch
          checked={b.enabled}
          disabled={busy || !b.optional}
          label={t(b.enabled ? 'pl.turnOff' : 'pl.turnOn', { name })}
          onChange={(on) => void change(name, src.setBundle(b.name, on), b.name)}
        />
      )}
      {onConfigure && b.enabled && (
        <Button size="sm" variant="ghost" onClick={() => onConfigure(name)}>
          {t('pl.configure')}
        </Button>
      )}
      {group === 'added' && b.removable && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
          {t('pl.remove')}
        </Button>
      )}
    </CardRow>
  )
}

/** Thêm từ tên gói: kiểm tra trước, rồi mở hộp thoại cài. */
function AddBySpec({
  t,
  src,
  onInstall,
}: {
  t: T
  src: PluginSource
  onInstall: (items: InstallItem[]) => void
}) {
  const [spec, setSpec] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SpecInspection | { status: 'error'; error: string } | null>(null)
  const check = async () => {
    const s = spec.trim()
    if (!s) return
    setChecking(true)
    const r = await src.inspect(s)
    setChecking(false)
    setResult(r.ok ? r.value : { status: 'error', error: r.error })
  }
  const accepted = result?.status === 'accepted' ? result : null
  return (
    <Card title={t('pl.add.title')}>
      <CardRow>
        <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <TextInput
              value={spec}
              onChange={(e) => {
                setSpec(e.target.value)
                setResult(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void check()
              }}
              placeholder={t('pl.add.placeholder')}
              aria-label={t('pl.add.placeholder')}
              className="a-mono"
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button size="sm" onClick={() => void check()} disabled={checking || !spec.trim()}>
              {checking ? t('pl.add.checking') : t('pl.add.check')}
            </Button>
          </span>
          {accepted && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="grow" style={{ minWidth: 0 }}>
                <b className="a-mono">{accepted.name ?? spec.trim()}</b> {accepted.version}
                <div className="a-muted" style={{ fontSize: 12 }}>
                  {[
                    t('pl.add.from', { host: accepted.host ?? t(`pl.add.kind.${accepted.kind}`) }),
                    accepted.bundle === true
                      ? t('pl.add.bundle')
                      : accepted.bundle === false
                        ? t('pl.add.noBundle')
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {accepted.description && (
                  <div className="a-muted" style={{ fontSize: 12 }}>
                    {accepted.description}
                  </div>
                )}
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  onInstall([
                    {
                      title: accepted.name ?? spec.trim(),
                      spec: spec.trim(),
                      version: accepted.version,
                      source: accepted.host ?? t(`pl.add.kind.${accepted.kind}`),
                    },
                  ])
                }
              >
                {t('pl.add.install')}
              </Button>
            </span>
          )}
          {result?.status === 'refused' && (
            <span style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>
              {result.reason || result.problem}
            </span>
          )}
          {result?.status === 'error' && (
            <span style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>{result.error}</span>
          )}
          <span className="a-muted" style={{ fontSize: 12 }}>
            {t('pl.add.warn')}
          </span>
        </span>
      </CardRow>
    </Card>
  )
}

export function Installed({
  t,
  src,
  bundles,
  busy,
  updates,
  change,
  onInstall,
  config,
  ledger,
  onConfigure,
}: {
  t: T
  src: PluginSource
  bundles: readonly BundleInfo[]
  busy: ReadonlySet<string>
  updates: readonly Update[]
  change: Change
  onInstall: (items: InstallItem[]) => void
  config: PluginConfig | undefined
  ledger: ConfigLedger
  onConfigure: (target: ConfigTarget, title: string) => void
}) {
  const groups = groupBundles(bundles, src.resolveText, t)
  // Gói nền đang tắt là chế độ chạy khác (chạy lệnh, SDK, ACP): gộp một dòng, chi tiết ở thẻ Chi tiết.
  const idleCore = groups.core.filter((b) => !b.enabled)
  const order: [BundleGroup, BundleInfo[]][] = [
    ['core', groups.core.filter((b) => b.enabled)],
    ['builtin', groups.builtin],
    ['added', groups.added],
  ]
  const updateOf = (name: string) => updates.find((u) => u.bundle === name)
  return (
    <div className="ap-cols">
      <Col grow={1.4} basis={480}>
        {config && ledger.items.length > 0 && (
          <Card title={t('pl.cfg.title')} subtitle={t('pl.cfg.hint')}>
            {ledger.items.map((item) => (
              <CardRow key={item.id}>
                <span className="ap-pl-tile builtin" aria-hidden>
                  {letterOf(item.label)}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <b>{item.label}</b>
                  <div className="a-muted" style={{ fontSize: 12.5 }}>
                    {config.render({ kind: 'item', id: item.id }, 'summary')}
                  </div>
                </span>
                <Button size="sm" onClick={() => onConfigure({ kind: 'item', id: item.id }, item.label)}>
                  {t('pl.configure')}
                </Button>
              </CardRow>
            ))}
          </Card>
        )}
        <Card title={t('pl.installedCount', { n: bundles.length })}>
          {order.map(
            ([g, list]) =>
              list.length > 0 && (
                <div key={g}>
                  <div className="ap-pl-grp">{t(`pl.group.${g}`)}</div>
                  {list.map((b) => (
                    <BundleRow
                      key={b.name}
                      t={t}
                      src={src}
                      b={b}
                      busy={busy.has(b.name)}
                      update={updateOf(b.name)}
                      change={change}
                      onUpdate={(u) => onInstall([u])}
                      onInstall={onInstall}
                      onConfigure={
                        ledger.bundles.has(b.name)
                          ? (title) => onConfigure({ kind: 'bundle', key: b.name }, title)
                          : undefined
                      }
                    />
                  ))}
                  {g === 'core' && idleCore.length > 0 && (
                    <CardRow
                      label={
                        <span className="a-muted" style={{ fontSize: 12.5 }}>
                          {t('pl.idleCore', {
                            n: idleCore.length,
                            names: idleCore.map((b) => bundleText(b, src.resolveText, t).title).join(', '),
                          })}
                        </span>
                      }
                    />
                  )}
                </div>
              ),
          )}
        </Card>
      </Col>
      <Col basis={340}>
        <AddBySpec t={t} src={src} onInstall={onInstall} />
        <Card
          title={t('pl.updates.title')}
          actions={
            updates.length > 1 ? (
              <Button size="sm" onClick={() => onInstall([...updates])}>
                {t('pl.updates.all')}
              </Button>
            ) : undefined
          }
        >
          {updates.length === 0 && (
            <CardRow label={<span className="a-muted">{t('pl.updates.none')}</span>} />
          )}
          {updates.map((u) => (
            <CardRow
              key={u.bundle}
              label={
                <span>
                  <b>{u.title}</b> <span className="a-muted">→ {u.version}</span>
                </span>
              }
            >
              <Button size="sm" onClick={() => onInstall([u])}>
                {t('pl.updates.one')}
              </Button>
            </CardRow>
          ))}
        </Card>
      </Col>
    </div>
  )
}
