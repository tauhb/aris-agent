/**
 * 6.7 · Kết nối của đội (giai đoạn 8, plan 8.1; bản vẽ `KetNoiDoi.dc.html`): máy chủ MCP cấu hình một lần, chọn bot
 * nào được dùng (cả đội, theo phòng, từng bot). Thêm và sửa ở hộp `McpDialog` (`team=1`), nhập từ Claude Code và
 * Codex ở `McpImportDialog`. Mỗi bot vẫn tắt riêng hay đặt mức hỏi chặt hơn trong hồ sơ của mình.
 */
import {
  Button,
  Card,
  CardRow,
  Mascot,
  PageShell,
  Pill,
  Switch,
  isTeamMcp,
  teamAction,
  useTeam,
  type McpData,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Logo, RowMenu, howOf, scopeText } from '../team/BotTools.js'
import { ConnectorLogo, oauthLogin } from '../team/Catalog.js'
import { ScopePicker, type Scope } from '../team/ScopePicker.js'

/** Dải linh vật các bot được dùng (tối đa 4), theo phạm vi: bot nêu tên, và bot thuộc phòng đã chọn. */
function Faces({ c }: { c: McpData }) {
  const team = useTeam()
  const s = c.scope
  const bots = team.bots.filter(
    (b) =>
      !b.external &&
      (s?.bots === 'all' ||
        (s?.bots ?? []).includes(b.id) ||
        (!!b.department && !!s?.departments?.includes(b.department))),
  )
  if (bots.length === 0) return null
  return (
    <span className="ap-sc-faces" aria-hidden="true">
      {bots.slice(0, 4).map((b) => (
        <Mascot key={b.id} id={b.mascot} accessory={b.accessory} size={22} />
      ))}
    </span>
  )
}

export function Connections({ t, nav }: PageProps) {
  const team = useTeam()
  const list = team.mcp.filter(isTeamMcp)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Scope>({ bots: 'all' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const askText = {
    write: t('mcp.askWriteShort'),
    always: t('mcp.askAlwaysShort'),
    never: t('mcp.askNeverShort'),
  }

  async function saveScope(id: string) {
    setBusy(true)
    setError(null)
    try {
      await teamAction({ op: 'mcp-team-scope', id, scope: draft })
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t('sec.connections')}
      subtitle={t('conn.subtitle')}
      actions={
        <>
          <Button size="sm" onClick={() => nav.go('mcp-import')}>
            {t('conn.import')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => nav.go('mcp-catalog')}>
            {t('conn.add')}
          </Button>
        </>
      }
    >
      <Card title={<b>{t('conn.title', { n: list.length })}</b>}>
        {list.length === 0 && (
          <CardRow>
            <span className="a-muted" style={{ fontSize: 13 }}>
              {t('conn.empty')}
            </span>
          </CardRow>
        )}
        {list.map((c) => {
          const login = c.oauth?.state === 'login'
          const ok = c.check?.ok && !login
          const tools = c.check?.tools ?? []
          return (
            <div key={c.id}>
              <div className="a-row">
                {c.catalog ? (
                  <ConnectorLogo id={c.catalog} name={c.name} size={30} />
                ) : (
                  <Logo preset={c.preset} />
                )}
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{c.name}</b>{' '}
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      · {howOf(t, c)}
                    </span>
                    {c.from && (
                      <>
                        {' '}
                        <Pill tone="accent">
                          {t(c.from === 'codex' ? 'conn.fromCodex' : 'conn.fromClaude')}
                        </Pill>
                      </>
                    )}
                  </span>
                  {login ? (
                    <span style={{ fontSize: 12.5, color: 'var(--a-warn)' }}>
                      {t(c.check ? 'cat.needLogin' : 'cat.notLogged')}
                      {c.oauth?.error ? ` · ${c.oauth.error}` : ''}
                    </span>
                  ) : c.check && !ok ? (
                    <span style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>
                      {t('mcp.failed', { error: c.check.error ?? '' })}
                    </span>
                  ) : (
                    <span className="a-muted" style={{ fontSize: 12.5 }}>
                      {c.check
                        ? t('mcp.tools', {
                            n: tools.length,
                            list: tools
                              .slice(0, 3)
                              .map((x) => x.name)
                              .join(', '),
                          })
                        : t('mcp.unchecked')}{' '}
                      · {askText[c.ask]}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="ap-sc-pill"
                  aria-label={t('conn.changeScope', { name: c.name })}
                  aria-expanded={editing === c.id}
                  onClick={() => {
                    setError(null)
                    setDraft(c.scope ?? { bots: 'all' })
                    setEditing(editing === c.id ? null : c.id)
                  }}
                >
                  <Faces c={c} />
                  {scopeText(t, c, team)} ▾
                </button>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: !c.enabled
                      ? 'var(--a-muted)'
                      : login
                        ? 'var(--a-warn)'
                        : ok
                          ? 'var(--a-ok)'
                          : c.check
                            ? 'var(--a-danger)'
                            : 'var(--a-muted)',
                  }}
                >
                  ●{' '}
                  {!c.enabled
                    ? t('mcp.off')
                    : login
                      ? t('cat.needLoginShort')
                      : ok
                        ? t('mcp.ok')
                        : c.check
                          ? t('mcp.error')
                          : t('mcp.unchecked')}
                </span>
                {login && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void oauthLogin(c.id).catch((e: unknown) => setError((e as Error).message))
                    }
                  >
                    {t('cat.relogin')}
                  </Button>
                )}
                <Switch
                  checked={c.enabled}
                  label={t(c.enabled ? 'conn.turnOffAll' : 'conn.turnOnAll', { name: c.name })}
                  onChange={(on) =>
                    void teamAction({ op: 'mcp-update', id: c.id, input: { enabled: on } }).catch(() => {})
                  }
                />
                <RowMenu
                  t={t}
                  c={c}
                  onEdit={() =>
                    c.catalog
                      ? nav.go('mcp-catalog', { id: c.id })
                      : nav.go('mcp-add', { team: '1', id: c.id })
                  }
                />
              </div>
              {editing === c.id && (
                <div className="ap-sc-panel">
                  <b>{t('conn.whoUsesConn', { name: c.name })}</b>
                  <ScopePicker t={t} value={draft} onChange={setDraft} />
                  {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
                  <div className="ap-dfoot" style={{ border: 0, paddingTop: 0 }}>
                    <Button size="sm" onClick={() => setEditing(null)}>
                      {t('cb.cancel')}
                    </Button>
                    <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveScope(c.id)}>
                      {t('conn.save')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </Card>
      {error && !editing && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-hint a-muted">ⓘ {t('conn.note')}</div>
    </PageShell>
  )
}
