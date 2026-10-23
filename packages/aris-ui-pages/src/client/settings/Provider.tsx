/**
 * 6.2 · Provider và model (đặc tả: docs/specs/aris-providers.md). Một chỗ duy nhất:
 * - Nhà cung cấp và khoá: chính trang "Model" của dsh (khoá chỉ ghi, thêm nhà cung cấp,
 *   API tuỳ chỉnh, dò model), vẽ ngay trong trang qua `settings.section`.
 * - Model theo việc: ghi thẳng vào cấu hình của gói dsh lo việc đó.
 */
import { Card, CardRow, PageShell } from '@aris/ui-kit/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ConfigFormLike, ModelGroup, PageProps } from '../page.js'
import { Col } from '../ui.js'

/** Mã mục "Model" của dsh trong `settings.section`. */
export const DSH_MODELS_SECTION = 'models'

/**
 * Việc chọn được model, và chỗ cấu hình của dsh mà việc đó đọc. Máy chủ chỉ mở cho
 * trang cài đặt sửa model mặc định của phiên mới (`agent-default-model`).
 */
const TASKS = [
  { id: 'chat', ns: 'agent-default-model', provider: 'provider', model: 'model', required: true },
] as const

/** Việc đi theo model của phiên: dsh không mở cấu hình của chúng cho trang cài đặt. */
const FOLLOW = ['compaction', 'title'] as const

/** Việc của aris chưa có ở giai đoạn này: hiện mờ kèm giai đoạn. */
const LATER = [
  { id: 'reflect', note: 'pv.followCompaction' },
  { id: 'commander', note: 'pv.phase2' },
  { id: 'judge', note: 'pv.phase3' },
  { id: 'eval', note: 'pv.phase3' },
] as const

const key = (provider: string, model: string) => `${provider}\u0000${model}`

function useForm(form: ConfigFormLike | undefined) {
  return useSyncExternalStore(
    (fn) => form?.subscribe(fn) ?? (() => {}),
    () => form?.getSnapshot(),
  )
}

/** Một dòng "việc → model": ô chọn theo nhóm nhà cung cấp, ghi cặp provider/model một lần. */
function TaskRow({
  t,
  task,
  form,
  groups,
}: {
  t: PageProps['t']
  task: (typeof TASKS)[number]
  form: ConfigFormLike | undefined
  groups: readonly ModelGroup[]
}) {
  const snap = useForm(form)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const value = (snap?.value ?? {}) as Record<string, unknown>
  const provider = typeof value[task.provider] === 'string' ? (value[task.provider] as string) : ''
  const model = typeof value[task.model] === 'string' ? (value[task.model] as string) : ''
  const current = provider && model ? key(provider, model) : ''
  const unavailable = !form || snap?.status === 'unavailable'
  const known = groups.some((g) => g.models.some((m) => key(g.id, m.id) === current))

  async function change(next: string) {
    if (!form) return
    setBusy(true)
    setFailed(false)
    const [p, m] = next ? next.split('\u0000') : ['', '']
    const ok = next
      ? await form.mutate([
          { op: 'set', path: [task.provider], value: p! },
          { op: 'set', path: [task.model], value: m! },
        ])
      : await form.mutate([
          { op: 'unset', path: [task.provider] },
          { op: 'unset', path: [task.model] },
        ])
    setBusy(false)
    setFailed(!ok)
  }

  return (
    <CardRow label={t(`pv.task.${task.id}`)}>
      {unavailable ? (
        <span className="a-muted">{t('pv.notServed')}</span>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <select
            className="a-inp ap-model-select"
            aria-label={t(`pv.task.${task.id}`)}
            value={current}
            disabled={busy || snap?.status !== 'ready' || !snap.writable}
            onChange={(e) => void change(e.target.value)}
          >
            {current && !known && <option value={current}>{`${provider} · ${model}`}</option>}
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.models.map((m) => (
                  <option key={m.id} value={key(g.id, m.id)}>
                    {m.name || m.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {failed && <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{t('pv.saveFailed')}</span>}
        </span>
      )}
    </CardRow>
  )
}

export function Provider({ t, system, models }: PageProps) {
  const [groups, setGroups] = useState<readonly ModelGroup[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  useEffect(() => {
    if (!models) return
    models
      .catalog()
      .then(setGroups)
      .catch((e: Error) => setCatalogError(e.message))
  }, [models])
  const hasDshModels = system?.sections.some((s) => s.id === DSH_MODELS_SECTION)

  return (
    <PageShell title={t('sec.provider')} subtitle={t('pv.subtitle')}>
      <div className="ap-cols">
        <Col grow={1.5} basis={520}>
          <Card title={t('pv.providers')} subtitle={t('pv.providersHint')}>
            <div className="ap-embed">
              {hasDshModels && system ? (
                system.render(DSH_MODELS_SECTION)
              ) : (
                <div className="a-muted">{t('pv.noDsh')}</div>
              )}
            </div>
          </Card>
        </Col>
        <Col basis={340}>
          <Card title={t('pv.byTask')} subtitle={t('pv.byTaskHint')}>
            {catalogError && (
              <CardRow
                label={
                  <span style={{ color: 'var(--a-danger)' }}>
                    {t('pv.catalogError', { error: catalogError })}
                  </span>
                }
              />
            )}
            {TASKS.map((task) => (
              <TaskRow key={task.id} t={t} task={task} form={models?.form(task.ns)} groups={groups} />
            ))}
            {FOLLOW.map((id) => (
              <CardRow key={id} label={t(`pv.task.${id}`)}>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t('pv.followSession')}
                </span>
              </CardRow>
            ))}
            {LATER.map((row) => (
              <CardRow key={row.id} label={<span className="a-muted">{t(`pv.task.${row.id}`)}</span>}>
                <span className="a-muted" style={{ fontSize: 12.5 }}>
                  {t(row.note)}
                </span>
              </CardRow>
            ))}
          </Card>
          <Card title={t('pv.fallback')}>
            <CardRow
              label={
                <span className="a-muted" style={{ fontSize: 13 }}>
                  {t('pv.fallbackLater')}
                </span>
              }
            />
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
