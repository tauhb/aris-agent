/**
 * Hộp "Nhập từ Claude Code và Codex" (giai đoạn 8, plan 8.1; bản vẽ `NhapKetNoi.dc.html`): aris đọc cấu hình MCP
 * trên máy, người dùng chọn máy chủ, phạm vi và mức hỏi rồi nhập thành kết nối của đội. Giá trị khoá ở lại phía máy
 * chủ; giao diện chỉ thấy tên khoá.
 */
import { Button, Dialog, Pill, teamAction } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { ALL_SCOPE, ScopePicker, type Scope } from './ScopePicker.js'

interface Candidate {
  key: string
  source: 'claude-code' | 'codex'
  name: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  url?: string
  secretKeys: string[]
  needs: string[]
  note?: string
  exists: boolean
}
interface Scan {
  scanId: string
  candidates: Candidate[]
  skipped: { source: string; name: string; reason: string }[]
}
type Ask = 'write' | 'always' | 'never'

export function McpImportDialog({ t, nav }: PageProps) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<Scope>(ALL_SCOPE)
  const [ask, setAsk] = useState<Ask>('write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void teamAction<Scan>({ op: 'mcp-import-scan' })
      .then((s) => {
        if (!live) return
        setScan(s)
        // Mặc định chọn máy chủ chưa có trong aris và không cần nhập tay khoá nào.
        setPicked(new Set(s.candidates.filter((c) => !c.exists && c.needs.length === 0).map((c) => c.key)))
      })
      .catch((e: unknown) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [])

  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(key)
    else next.delete(key)
    setPicked(next)
  }

  async function run() {
    if (!scan) return
    setBusy(true)
    setError(null)
    try {
      await teamAction({ op: 'mcp-import', scanId: scan.scanId, keys: [...picked], scope, ask })
      nav.go('settings', { section: 'connections' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const asks: [Ask, string][] = [
    ['write', t('mcp.askWriteShort')],
    ['always', t('mcp.askAlwaysShort')],
    ['never', t('mcp.askNeverShort')],
  ]
  const nothing = scan && scan.candidates.length === 0

  return (
    <Dialog open width={640} title={t('conn.importTitle')} closeLabel={t('cb.close')} onClose={nav.close}>
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        {t('conn.importHint')}
      </div>
      {!scan && !error && <div className="ap-hint a-muted">{t('conn.scanning')}</div>}
      {nothing && <div className="ap-hint a-muted">{t('conn.importNone')}</div>}
      {scan && scan.candidates.length > 0 && (
        <div className="a-card">
          {scan.candidates.map((c) => (
            <label className="a-row" key={c.key} style={c.exists ? { opacity: 0.6 } : undefined}>
              <input
                type="checkbox"
                style={{ width: 18, height: 18, accentColor: 'var(--a-accent)', flex: 'none' }}
                disabled={c.exists}
                checked={picked.has(c.key)}
                onChange={(e) => toggle(c.key, e.target.checked)}
              />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span>
                  <b>{c.name}</b>{' '}
                  <Pill tone="accent">
                    {t(c.source === 'codex' ? 'conn.fromCodexShort' : 'conn.fromClaudeShort')}
                  </Pill>{' '}
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    · {t(c.transport === 'stdio' ? 'mcp.howCommand' : 'conn.howUrl')}
                  </span>
                  {c.exists && (
                    <>
                      {' '}
                      <Pill tone="muted">{t('conn.exists')}</Pill>
                    </>
                  )}
                </span>
                <span
                  className="a-muted"
                  style={{
                    fontSize: 12.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.secretKeys.length > 0
                    ? t('conn.keys', { list: c.secretKeys.join(', ') })
                    : c.needs.length > 0
                      ? (c.note ?? t('conn.needKey'))
                      : t('conn.noKey')}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {scan && scan.skipped.length > 0 && (
        <details className="ap-sc-skipped">
          <summary className="a-muted">{t('conn.skipped', { n: scan.skipped.length })}</summary>
          {scan.skipped.map((s) => (
            <div key={`${s.source}:${s.name}`} className="a-muted">
              <b>{s.name}</b> · {s.reason}
            </div>
          ))}
        </details>
      )}
      {scan && scan.candidates.length > 0 && (
        <>
          <div className="a-field">
            <span className="l">{t('conn.whoUses')}</span>
            <ScopePicker t={t} value={scope} onChange={setScope} />
          </div>
          <div>
            <div className="a-field">
              <span className="l">{t('conn.askWhen')}</span>
            </div>
            {asks.map(([v, label]) => (
              <label className="ap-radio" key={v}>
                <input type="radio" name="imp-ask" checked={ask === v} onChange={() => setAsk(v)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </>
      )}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg" disabled={busy || picked.size === 0} onClick={() => void run()}>
          {busy ? t('conn.importing') : t('conn.importN', { n: picked.size })}
        </Button>
      </div>
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        ⓘ {t('conn.importNote')}
      </div>
    </Dialog>
  )
}
