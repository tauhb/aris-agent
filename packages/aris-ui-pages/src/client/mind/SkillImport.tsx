/**
 * Hộp "Nhập skill" (giai đoạn 8, plan 8.1; bản vẽ `NhapSkill.dc.html`): quét GitHub, Claude Code, Codex hay một thư
 * mục, chọn skill rồi nộp vào kho của đội, chờ duyệt. Skill nhập về chưa bot nào dùng cho tới khi người dùng duyệt;
 * bot chọn ở đây được gán ngay khi duyệt.
 */
import { Button, Dialog, Mascot, Pill, useTeamData } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { skillsPost } from './skills-api.js'
import { shortSha, TEAM_SKILL_OWNER } from './skill-team.js'

type Tab = 'github' | 'claude-code' | 'codex' | 'folder'

interface Item {
  key: string
  name: string
  description: string
  files: number
  dropped: number
  risks: string[]
  error?: string
  /** Mã bot (hay `_doi`) đang có skill cùng tên. */
  exists: string[]
}

interface Scan {
  scanId: string
  kind: Tab
  label: string
  github?: { repo: string; sha?: string }
  items: Item[]
}

interface Outcome {
  name: string
  status: 'proposed' | 'unchanged' | 'error'
  error?: string
}

export function SkillImportDialog({ t, nav }: PageProps) {
  const team = useTeamData()
  const bots = (team?.bots ?? []).filter((b) => !b.external)
  const [tab, setTab] = useState<Tab>('github')
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [who, setWho] = useState<Set<string>>(new Set())
  const [whoAll, setWhoAll] = useState(false)
  const [busy, setBusy] = useState<'scan' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null)

  async function find(kind: Tab = tab) {
    setBusy('scan')
    setError(null)
    setScan(null)
    setPicked(new Set())
    setOutcomes(null)
    try {
      const source = kind === 'github' ? { kind, url } : kind === 'folder' ? { kind, path } : { kind }
      setScan(await skillsPost<Scan>({ op: 'import-scan', source }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  // Claude Code và Codex quét ngay khi mở tab (đọc thư mục trên máy, không cần nhập gì).
  useEffect(() => {
    if (tab === 'claude-code' || tab === 'codex') void find(tab)
    else {
      setScan(null)
      setError(null)
      setOutcomes(null)
    }
  }, [tab])

  const q = query.trim().toLowerCase()
  const shown = (scan?.items ?? []).filter(
    (i) => !q || i.name.includes(q) || i.description.toLowerCase().includes(q),
  )
  const selectable = shown.filter((i) => !i.error)
  const nameOf = (id: string) =>
    id === TEAM_SKILL_OWNER ? t('ski.inTeam') : (bots.find((b) => b.id === id)?.name ?? id)
  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(key)
    else next.delete(key)
    setPicked(next)
  }

  async function run() {
    if (!scan) return
    setBusy('import')
    setError(null)
    try {
      const r = await skillsPost<{ outcomes: Outcome[] }>({
        op: 'import',
        scanId: scan.scanId,
        keys: [...picked],
        bots: whoAll ? 'all' : [...who],
      })
      setOutcomes(r.outcomes)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const tabs: [Tab, string][] = [
    ['github', t('ski.tabGithub')],
    ['claude-code', t('ski.tabClaude')],
    ['codex', t('ski.tabCodex')],
    ['folder', t('ski.tabFolder')],
  ]
  const count = (o: Outcome['status']) => outcomes?.filter((x) => x.status === o).length ?? 0

  return (
    <Dialog open width={760} title={t('ski.importTitle')} closeLabel={t('cb.close')} onClose={nav.close}>
      <div
        className="ap-seg"
        role="tablist"
        aria-label={t('ski.importTitle')}
        style={{ alignSelf: 'flex-start' }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === 'github' || tab === 'folder') && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="a-inp a-mono"
              style={{ flex: 1 }}
              aria-label={t(tab === 'github' ? 'ski.urlLabel' : 'ski.folderLabel')}
              placeholder={tab === 'github' ? 'https://github.com/anthropics/skills' : '/Users/…/skills'}
              value={tab === 'github' ? url : path}
              onChange={(e) => (tab === 'github' ? setUrl(e.target.value) : setPath(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (tab === 'github' ? url.trim() : path.trim())) void find()
              }}
            />
            <Button
              variant="primary"
              disabled={busy === 'scan' || !(tab === 'github' ? url.trim() : path.trim())}
              onClick={() => void find()}
            >
              {t('ski.find')}
            </Button>
          </div>
          {tab === 'github' && (
            <div className="a-muted" style={{ fontSize: 12, marginTop: -6 }}>
              {t('ski.urlHint')}
            </div>
          )}
        </>
      )}

      {busy === 'scan' && <div className="ap-hint a-muted">{t('ski.scanning')}</div>}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      {scan && scan.items.length === 0 && <div className="ap-hint a-muted">{t('ski.nothing')}</div>}

      {scan && scan.items.length > 0 && !outcomes && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pill tone="ok">{t('ski.found', { n: scan.items.length })}</Pill>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {scan.label}
              {scan.github?.sha ? ` · ${shortSha(scan.github.sha)}` : ''}
            </span>
            <input
              type="search"
              className="a-inp"
              style={{ marginLeft: 'auto', width: 170 }}
              aria-label={t('ski.filter')}
              placeholder={t('ski.filter')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" onClick={() => setPicked(new Set(selectable.map((i) => i.key)))}>
              {t('ski.selectAll')}
            </Button>
          </div>
          <div className="a-card ap-si-list">
            {shown.map((i) => (
              <label className="a-row" key={i.key} style={i.error ? { opacity: 0.55 } : undefined}>
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18, accentColor: 'var(--a-accent)', flex: 'none' }}
                  disabled={!!i.error}
                  checked={picked.has(i.key)}
                  onChange={(e) => toggle(i.key, e.target.checked)}
                />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span className="a-mono" style={{ fontWeight: 500 }}>
                    {i.name}
                  </span>
                  <span
                    className="a-muted"
                    style={{
                      fontSize: 12.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={i.error ?? i.description}
                  >
                    {i.error ?? i.description}
                  </span>
                </span>
                {i.exists.length > 0 && (
                  <Pill tone="warn">{t('ski.dupWith', { who: i.exists.map(nameOf).join(', ') })}</Pill>
                )}
                {i.risks.length > 0 && (
                  <span title={i.risks.join('\n')}>
                    <Pill tone="danger">{t('ski.risks', { n: i.risks.length })}</Pill>
                  </span>
                )}
                <span className="a-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {t('ski.files', { n: i.files })}
                </span>
              </label>
            ))}
          </div>
          <div className="a-field">
            <span className="l">{t('ski.whoAfter')}</span>
            <div className="ap-sc-chips">
              <label className={whoAll ? 'ap-sc-chip on' : 'ap-sc-chip'}>
                <input type="checkbox" checked={whoAll} onChange={(e) => setWhoAll(e.target.checked)} />
                {t('conn.scopeAll')}
              </label>
              {bots.map((b) => (
                <label key={b.id} className={who.has(b.id) && !whoAll ? 'ap-sc-chip on' : 'ap-sc-chip'}>
                  <input
                    type="checkbox"
                    disabled={whoAll}
                    checked={whoAll || who.has(b.id)}
                    onChange={(e) => {
                      const next = new Set(who)
                      if (e.target.checked) next.add(b.id)
                      else next.delete(b.id)
                      setWho(next)
                    }}
                  />
                  <Mascot id={b.mascot} accessory={b.accessory} size={18} />
                  {b.name}
                </label>
              ))}
            </div>
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('ski.whoHint')}
            </span>
          </div>
        </>
      )}

      {outcomes && (
        <div className="ap-hint ap-hint-ok">
          <b>{t('ski.result', { ok: count('proposed'), same: count('unchanged'), err: count('error') })}</b>
          {outcomes
            .filter((o) => o.status === 'error')
            .map((o) => (
              <div key={o.name} style={{ color: 'var(--a-danger)' }}>
                {o.name}: {o.error}
              </div>
            ))}
        </div>
      )}

      <div className="ap-dfoot">
        {!outcomes && scan && scan.items.length > 0 && (
          <span className="a-muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
            {t('ski.selected', { n: picked.size })}
          </span>
        )}
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        {outcomes ? (
          <Button variant="primary" size="lg" onClick={() => nav.go('approvals')}>
            {t('ski.openInbox')}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={busy !== null || picked.size === 0}
            onClick={() => void run()}
          >
            {busy === 'import' ? t('ski.importing') : t('ski.doImport', { n: picked.size })}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
