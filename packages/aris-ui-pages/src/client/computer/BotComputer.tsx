/**
 * Hồ sơ bot › Quyền › Điều khiển máy (bản vẽ `HoSoBotMay`, GĐ8.3): bật/tắt (mặc định tắt), cách duyệt (hỏi từng bước
 * hay trong phạm vi), ứng dụng và loại thao tác được tự làm, danh sách luôn chặn, quyền của macOS kèm hướng dẫn. aris
 * không tự cấp quyền: nút chỉ mở đúng trang Cài đặt hệ thống (chạy trên máy của người dùng).
 */
import { Button, Card, Checkbox, Pill, Switch, TextInput } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import {
  COMPUTER_ACTIONS,
  computerPost,
  fetchDoctor,
  useComputerState,
  type ComputerSettings,
  type DoctorReport,
} from './api.js'

type T = PageProps['t']

const SETTINGS_URL = {
  ax: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
} as const

/** Kết quả kiểm quyền: đã cấp, chưa cấp, chưa rõ. */
function PermPill({ t, ok }: { t: T; ok: boolean | null | undefined }) {
  return ok === true ? (
    <Pill tone="ok">{t('cu.perm.ok')}</Pill>
  ) : ok === false ? (
    <Pill tone="warn">{t('cu.perm.no')}</Pill>
  ) : (
    <Pill tone="muted">{t('cu.perm.unknown')}</Pill>
  )
}

export function BotComputer({ t, botId, name }: { t: T; botId: string; name: string }) {
  const [state, reload] = useComputerState()
  const [doctor, setDoctor] = useState<DoctorReport | null>(null)
  const [checking, setChecking] = useState(false)
  const [guide, setGuide] = useState(false)
  const [app, setApp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const s: ComputerSettings | undefined = state ? { ...state.defaults, ...state.bots[botId] } : undefined

  const check = async () => {
    setChecking(true)
    setDoctor(await fetchDoctor())
    setChecking(false)
  }
  useEffect(() => {
    if (s?.on && !doctor) void check()
    // Chỉ kiểm khi vừa bật hay lần đầu mở thẻ đã bật.
  }, [s?.on])

  if (!state || !s) return null
  const save = async (patch: Partial<ComputerSettings>) => {
    setError(null)
    if (!(await computerPost({ op: 'set', bot: botId, settings: { ...s, ...patch } })))
      setError(t('cu.saveFail'))
    reload()
  }
  const addApp = () => {
    const v = app.trim()
    if (!v || s.apps.some((a) => a.toLowerCase() === v.toLowerCase())) return
    setApp('')
    void save({ apps: [...s.apps, v] })
  }
  const check1 = (id: string) => doctor?.checks.find((c) => c.id === id)

  return (
    <Card
      title={t('cu.title')}
      subtitle={t('cu.sub', { name })}
      actions={
        <Switch label={t('cu.onLabel', { name })} checked={s.on} onChange={(on) => void save({ on })} />
      }
    >
      {error && <div className="ap-error">{error}</div>}
      {s.on && (
        <div className="ap-cu-perm">
          <fieldset className="ap-cu-fs">
            <legend>{t('cu.mode')}</legend>
            {(['ask', 'bounded'] as const).map((m) => (
              <label key={m} className={`ap-cu-choice${s.mode === m ? ' on' : ''}`}>
                <input
                  type="radio"
                  name={`cu-mode-${botId}`}
                  checked={s.mode === m}
                  onChange={() => void save({ mode: m })}
                />
                <span>
                  <b>{t(`cu.mode.${m}`)}</b>
                  <span className="a-muted ap-cu-small">{t(`cu.mode.${m}.hint`)}</span>
                </span>
              </label>
            ))}
            <span className="a-muted ap-cu-small">{t('cu.noSilent')}</span>
          </fieldset>

          {s.mode === 'bounded' && (
            <div className="ap-cu-grid">
              <div className="ap-cu-col">
                <b className="ap-cu-h">{t('cu.apps')}</b>
                <span className="ap-cu-chips">
                  {s.apps.map((a) => (
                    <span key={a} className="ap-cu-chip">
                      {a}
                      <button
                        type="button"
                        aria-label={t('cu.removeApp', { app: a })}
                        onClick={() => void save({ apps: s.apps.filter((x) => x !== a) })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!s.apps.length && <span className="a-muted ap-cu-small">{t('cu.noApps')}</span>}
                </span>
                <span className="ap-cu-row">
                  <TextInput
                    value={app}
                    placeholder={t('cu.appHint')}
                    aria-label={t('cu.addApp')}
                    onChange={(e) => setApp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addApp()}
                  />
                  <Button size="sm" disabled={!app.trim()} onClick={addApp}>
                    {t('cu.add')}
                  </Button>
                </span>
              </div>
              <fieldset className="ap-cu-fs ap-cu-col">
                <legend>{t('cu.actions')}</legend>
                {COMPUTER_ACTIONS.map((a) => (
                  <Checkbox
                    key={a}
                    checked={s.actions.includes(a)}
                    label={t(`cu.act.${a}`)}
                    onChange={(on) =>
                      void save({ actions: on ? [...s.actions, a] : s.actions.filter((x) => x !== a) })
                    }
                  />
                ))}
              </fieldset>
            </div>
          )}

          <div className="ap-cu-grid">
            <div className="ap-cu-box">
              <b className="ap-cu-h">{t('cu.always')}</b>
              <ul className="a-muted">
                <li>{t('cu.always.apps')}</li>
                <li>{t('cu.always.password')}</li>
                <li>{t('cu.always.keys')}</li>
                <li>{t('cu.always.other')}</li>
              </ul>
            </div>
            <div className="ap-cu-box">
              <b className="ap-cu-h">{t('cu.mac')}</b>
              {doctor?.platform && doctor.platform !== 'darwin' ? (
                <span className="a-muted ap-cu-small">{t('cu.notMac')}</span>
              ) : (
                <>
                  <span className="ap-cu-line">
                    <span className="grow">{t('cu.perm.ax')}</span>
                    <PermPill t={t} ok={check1('ax')?.ok} />
                  </span>
                  <span className="ap-cu-line">
                    <span className="grow">{t('cu.perm.screen')}</span>
                    <PermPill t={t} ok={check1('screen')?.ok} />
                  </span>
                </>
              )}
              {state.loadError && <span className="ap-cu-small ap-cu-bad">{state.loadError}</span>}
              <span className="ap-cu-row">
                <Button size="sm" aria-expanded={guide} onClick={() => setGuide(!guide)}>
                  {t('cu.guide')}
                </Button>
                <Button size="sm" disabled={checking} onClick={() => void check()}>
                  {t('cu.recheck')}
                </Button>
              </span>
              {guide && (
                <>
                  <ol className="ap-cu-steps">
                    <li>{t('cu.guide.1')}</li>
                    <li>
                      {t('cu.guide.2')} <code className="a-mono">{doctor?.process.execPath ?? 'node'}</code>
                    </li>
                    <li>{t('cu.guide.3')}</li>
                  </ol>
                  <span className="ap-cu-row">
                    <Button size="sm" variant="primary" onClick={() => window.open(SETTINGS_URL.ax)}>
                      {t('cu.openAx')}
                    </Button>
                    <Button size="sm" onClick={() => window.open(SETTINGS_URL.screen)}>
                      {t('cu.openScreen')}
                    </Button>
                  </span>
                  <span className="a-muted ap-cu-small">{t('cu.noAutoGrant')}</span>
                </>
              )}
            </div>
          </div>
          <span className="a-muted ap-cu-small">{t('cu.limits')}</span>
        </div>
      )}
    </Card>
  )
}
