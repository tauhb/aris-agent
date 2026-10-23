/**
 * 6.8 · Mẫu bot: chế độ làm việc một phiên bắt đầu với (Tiêu chuẩn, PTC, Tối giản, Sáng tạo, mẫu
 * tự tạo). Đọc thật `agentPresets` của dsh, đặt mẫu mặc định cho việc mới, xem cấu hình mẫu khai
 * báo, và mở chế độ Sáng tạo để bot tạo mẫu mới. Thay mục "Mẫu bot" của dsh.
 */
import { Button, Card, CardRow, Dialog, PageShell, Pill } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { PageProps, PresetRow, PresetSource } from '../page.js'

type T = PageProps['t']

/** Mẫu có sẵn của bản cài: tên và mô tả do aris viết. */
const BUILT_IN = ['standard', 'ptc', 'minimal', 'cordis'] as const
/** Mẫu chỉ hiện khi bật "Hiện chế độ lập trình" (mục Chung). */
const CODING = new Set(['ptc', 'minimal'])

export const isBuiltIn = (p: Pick<PresetRow, 'id' | 'name'>) =>
  p.name === undefined && (BUILT_IN as readonly string[]).includes(p.id)

/** Mẫu hiện ra: có sẵn trước theo thứ tự cố định, rồi mẫu tự tạo theo tên. */
export function presetGroups(rows: readonly PresetRow[], codingTools: boolean) {
  const visible = rows.filter((p) => codingTools || !(isBuiltIn(p) && CODING.has(p.id)))
  const builtIn = visible
    .filter(isBuiltIn)
    .sort((a, b) => BUILT_IN.indexOf(a.id as never) - BUILT_IN.indexOf(b.id as never))
  const custom = visible
    .filter((p) => !isBuiltIn(p))
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, 'vi'))
  return { builtIn, custom }
}

function text(p: PresetRow, t: T) {
  return isBuiltIn(p)
    ? { title: t(`ps.b.${p.id}`), description: t(`ps.b.${p.id}.d`) }
    : { title: p.name ?? p.id, description: p.description }
}

function PresetItem({
  t,
  p,
  busy,
  onDefault,
  onView,
}: {
  t: T
  p: PresetRow
  busy: boolean
  onDefault: () => void
  onView: () => void
}) {
  const { title, description } = text(p, t)
  return (
    <CardRow>
      <span className={`ap-pl-tile ${isBuiltIn(p) ? 'builtin' : 'added'}`} aria-hidden>
        {(title.trim()[0] ?? '?').toLocaleUpperCase('vi')}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b>{title}</b> {p.isDefault && <Pill tone="accent">{t('ps.default')}</Pill>}
        {description && (
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {description}
          </div>
        )}
        {p.broken && <div style={{ fontSize: 12, color: 'var(--a-danger)' }}>{p.broken}</div>}
      </span>
      {!p.isDefault && !p.broken && (
        <Button size="sm" disabled={busy} onClick={onDefault}>
          {t('ps.makeDefault')}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onView}>
        {t('ps.view')}
      </Button>
    </CardRow>
  )
}

function PresetsPage({ t, src }: { t: T; src: PresetSource }) {
  const codingTools = useSyncExternalStore(src.codingTools.subscribe, src.codingTools.getSnapshot)
  const [rows, setRows] = useState<readonly PresetRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<{ title: string; content: string | null; error?: string } | null>(null)

  const load = useCallback(() => {
    void src.list().then((r) => (r.ok ? (setRows(r.value), setError(null)) : setError(r.error)))
  }, [src])
  useEffect(load, [load])

  const makeDefault = async (id: string) => {
    setBusy(true)
    const r = await src.setDefault(id)
    setBusy(false)
    if (!r.ok) setError(r.error)
    load()
  }

  const open = async (p: PresetRow) => {
    const title = text(p, t).title
    setView({ title, content: null })
    const r = await src.read(p.id)
    setView(r.ok ? { title, content: r.value.content } : { title, content: null, error: r.error })
  }

  const groups = rows ? presetGroups(rows, codingTools) : null
  const item = (p: PresetRow) => (
    <PresetItem
      key={p.id}
      t={t}
      p={p}
      busy={busy}
      onDefault={() => void makeDefault(p.id)}
      onView={() => void open(p)}
    />
  )
  return (
    <PageShell title={t('sec.presets')} subtitle={t('ps.subtitle')}>
      {error && (
        <div
          className="ap-pl-banner"
          style={{ borderColor: 'var(--a-danger)', background: 'var(--a-dangerSoft)' }}
        >
          <span className="grow">{t('ps.error', { error })}</span>
          <Button size="sm" onClick={load}>
            {t('pl.retry')}
          </Button>
        </div>
      )}
      {!rows && !error && <div className="a-muted">{t('pl.loading')}</div>}
      {groups && (
        <div className="ap-cols">
          <div
            style={{ flex: '1.4 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <Card title={t('ps.builtIn')} subtitle={t('ps.builtInHint')}>
              {groups.builtIn.map(item)}
            </Card>
            <Card title={t('ps.custom')} subtitle={t('ps.customHint')}>
              {groups.custom.map(item)}
              {groups.custom.length === 0 && (
                <CardRow label={<span className="a-muted">{t('ps.noCustom')}</span>} />
              )}
            </Card>
          </div>
          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={t('ps.create')}>
              <CardRow>
                <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span className="a-muted" style={{ fontSize: 13 }}>
                    {t('ps.createHint')}
                  </span>
                  <span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!rows?.some((p) => p.id === 'cordis' && !p.broken)}
                      onClick={src.startCreator}
                    >
                      {t('ps.createGo')}
                    </Button>
                  </span>
                </span>
              </CardRow>
            </Card>
            <Card title={t('ps.howTitle')}>
              <CardRow>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('ps.how')}
                  {!codingTools && <> {t('ps.codingOff')}</>}
                </span>
              </CardRow>
            </Card>
          </div>
        </div>
      )}
      {view && (
        <Dialog
          open
          width={680}
          title={t('ps.viewTitle', { name: view.title })}
          closeLabel={t('pl.close')}
          onClose={() => setView(null)}
        >
          {view.error ? (
            <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{view.error}</div>
          ) : (
            <pre className="ap-pl-log a-mono" style={{ maxHeight: 420 }}>
              {view.content ?? t('pl.loading')}
            </pre>
          )}
        </Dialog>
      )}
    </PageShell>
  )
}

export function Presets({ t, presets }: PageProps) {
  if (!presets)
    return (
      <PageShell title={t('sec.presets')}>
        <div className="a-muted">{t('ps.unavailable')}</div>
      </PageShell>
    )
  return <PresetsPage t={t} src={presets} />
}
