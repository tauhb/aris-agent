/**
 * 5.1 · Ghi chú (giai đoạn 5, đợt 1; bản vẽ GhiChu.dc.html): hai không gian Cá nhân / Công ty, cây Nhật ký ·
 * Wiki · Nguồn, đọc trang (Markdown, `[[liên kết]]`, chú thích nguồn, liên kết ngược), sửa trang có gợi ý
 * `[[`, trạng thái trống, "Ai đọc được". Dữ liệu từ `/api/aris/brain`.
 */
import { Button, Pill } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PageProps, Translate } from '../page.js'
import { Later } from '../team/BotTools.js'
import { frontValue, Inline, Markdown, parseMarkdown, type LinkTarget } from './markdown.js'
import { GROUP_ICON, Group, Ico, Layer, Row, type Depth } from './tree.js'

type Space = 'ca-nhan' | 'cong-ty'

interface Entry {
  path: string
  name: string
  title: string
  space: Space | null
  layer: 'wiki' | 'nhat-ky' | 'nguon' | 'he-thong' | 'hop-thu-vao'
  dept: string | null
  group: string | null
  kind: string | null
  status: string | null
  tags: string[]
  binary: boolean
  mtime: number
}

interface State {
  root: string
  obsidian: boolean
  git: boolean
  today: string
  departments: { id: string; name: string }[]
  inbox: number
  entries: Entry[]
  readers: Record<Space, string[]>
}

interface PageData {
  page: Entry
  text: string
  backlinks: Entry[]
  readers: string[]
}

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const LIBRARIAN = 'b-thu-thu'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
const slug = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const PERSONAL_GROUPS = ['nguoi', 'du-an', 'chu-de', 'tom-tat', 'tong-hop']
const COMPANY_GROUPS = ['nguoi', 'khach-hang', 'san-pham', 'du-an', 'chu-de', 'tom-tat', 'tong-hop']
const DEPT_GROUPS = ['quy-trinh', 'du-an', 'chu-de', 'tom-tat', 'so-lieu']

const dmy = (key: string) => {
  const [y, m, d] = key.split('-')
  return d && m ? `${d}/${m}${y ? `/${y}` : ''}` : key
}

function groupLabel(t: Translate, g: string) {
  return t(`nb.g.${g}`)
}

export function Notes({ t, nav, params }: PageProps) {
  const [space, setSpace] = useState<Space>(params.space === 'cong-ty' ? 'cong-ty' : 'ca-nhan')
  const [state, setState] = useState<State | null>(null)
  const [current, setCurrent] = useState<string | undefined>(params.path)
  const [page, setPage] = useState<PageData | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<(Entry & { snippet: string })[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setState((await r.json()) as State)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 8000)
    return () => clearInterval(timer)
  }, [load])

  /** Trang mở xong thì vào chế độ sửa luôn (nhật ký vừa tạo). */
  const editNext = useRef<string | null>(null)
  const loadPage = useCallback(async (path: string) => {
    const r = await fetch(endpoint(`?page=${encodeURIComponent(path)}`)).catch(() => null)
    if (!r?.ok) return setPage(null)
    const data = (await r.json()) as PageData
    setPage(data)
    if (editNext.current === path) {
      editNext.current = null
      setDraft(data.text)
      setEditing(true)
    }
  }, [])

  const entries = useMemo(() => (state?.entries ?? []).filter((e) => e.space === space), [state, space])
  const by = (f: (e: Entry) => boolean) =>
    entries.filter(f).sort((a, b) => a.title.localeCompare(b.title, 'vi'))

  // Trang mở mặc định: tổng quan, nhật ký hôm nay, hay trang wiki đầu tiên.
  useEffect(() => {
    if (!state) return
    if (current && entries.some((e) => e.path === current)) return
    const pick =
      entries.find((e) => e.layer === 'wiki' && e.name === 'tong-quan') ??
      entries.find((e) => e.layer === 'nhat-ky' && e.name === state.today) ??
      entries.find((e) => e.layer === 'wiki') ??
      entries.find((e) => e.layer === 'nhat-ky')
    setCurrent(pick?.path)
    if (!pick) setPage(null)
  }, [state, entries, current])

  useEffect(() => {
    if (!current) return
    setEditing(false)
    setError(null)
    void loadPage(current)
    // Mở sẵn nhóm chứa trang đang xem.
    const e = state?.entries.find((x) => x.path === current)
    if (e) setOpen((s) => new Set([...s, ...keysOf(e)]))
    // Chỉ chạy khi đổi trang (danh sách tải lại mỗi 8 giây, không mở lại nhóm).
  }, [current, loadPage])

  // Tìm (gõ xong 250 ms).
  useEffect(() => {
    if (!query.trim()) return setHits(null)
    const id = setTimeout(() => {
      void fetch(endpoint(`?q=${encodeURIComponent(query)}&space=${space}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { hits: (Entry & { snippet: string })[] } | null) => setHits(j?.hits ?? []))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(id)
  }, [query, space])

  const post = async (body: Record<string, unknown>) => {
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as Record<string, unknown> | null
    if (!r?.ok) setError((j?.error as string | undefined) ?? 'HTTP error')
    return r?.ok ? j : null
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const select = (path: string) => {
    setQuery('')
    setCurrent(path)
  }
  const switchSpace = (s: Space) => {
    setSpace(s)
    setCurrent(undefined)
    setPage(null)
    setQuery('')
    setEditing(false)
  }

  const links: LinkTarget = {
    exists: (name) => !!state?.entries.some((e) => e.name === name && e.path.endsWith('.md')),
    open: (name) => {
      const list = state?.entries.filter((e) => e.name === name && e.path.endsWith('.md')) ?? []
      const hit = list.find((e) => e.space === space) ?? list[0]
      if (!hit) return
      if (hit.space && hit.space !== space) setSpace(hit.space)
      select(hit.path)
    },
  }

  const writeToday = async () => {
    const j = await post({ op: 'today', space })
    if (j?.path) {
      const path = j.path as string
      editNext.current = path
      await load()
      if (path === current) await loadPage(path)
      else setCurrent(path)
    }
  }
  const [setup, setSetup] = useState<string | null>(null)
  const openExternal = (path?: string) =>
    void post({ op: 'open', path }).then((j) => setSetup((j?.setup as string | null | undefined) ?? null))

  // --- Cây -----------------------------------------------------------------------------
  const diary = by((e) => e.layer === 'nhat-ky').sort((a, b) => b.name.localeCompare(a.name))
  const sources = entries.filter(
    (e) =>
      e.layer === 'nguon' &&
      !(
        e.path.endsWith('.md') &&
        entries.some((x) => x.binary && x.path.replace(/\.[^.]+$/, '') === e.path.replace(/\.md$/, ''))
      ),
  )
  const months = [...new Set(sources.map((e) => e.path.split('/')[2] ?? ''))].sort().reverse()
  const overview = entries.find((e) => e.layer === 'wiki' && e.name === 'tong-quan')
  const wikiOf = (f: (e: Entry) => boolean) => by((e) => e.layer === 'wiki' && e.name !== 'tong-quan' && f(e))
  const isEmpty = state !== null && !entries.some((e) => e.layer !== 'he-thong')

  const ME = 'var(--a-accent)'
  const LIB = 'var(--a-warn)'
  const SRC = 'var(--a-muted)'
  const today = state?.today ?? ''
  const todayEntry = diary.find((d) => d.name === today)
  const weekday = (() => {
    const [y, m, d] = today.split('-').map(Number)
    return y && m && d ? t(`nb.wd.${new Date(y, m - 1, d).getDay()}`) : ''
  })()
  const wikiCount = wikiOf(() => true).length + (overview ? 1 : 0)

  /** Các nhóm của một chỗ trong wiki: nhóm có trang trước, nhóm trống gom vào một dòng. */
  const groups = (
    prefix: string,
    ids: string[],
    pagesOf: (g: string) => Entry[],
    depth: Depth = 0,
    showEmpty = true,
  ) => {
    const full = ids.filter((g) => pagesOf(g).length)
    const empty = ids.filter((g) => g !== 'khac' && !pagesOf(g).length)
    const more = `${prefix}:trong`
    return (
      <>
        {full.map((g) => (
          <Group
            key={g}
            id={`${prefix}:${g}`}
            label={groupLabel(t, g)}
            icon={GROUP_ICON[g]}
            color={LIB}
            pages={pagesOf(g)}
            open={open.has(`${prefix}:${g}`)}
            toggle={toggle}
            current={current}
            select={select}
            depth={depth}
          />
        ))}
        {showEmpty &&
          empty.length > 0 &&
          (open.has(more) ? (
            empty.map((g) => (
              <Row key={g} label={groupLabel(t, g)} icon={GROUP_ICON[g]} depth={depth} muted />
            ))
          ) : (
            <button type="button" className="ap-more" onClick={() => toggle(more)}>
              {t('nb.emptyGroups', { n: empty.length })}
            </button>
          ))}
      </>
    )
  }

  const tree = (
    <nav className="ap-tree ap-btree" aria-label={t('br.tree')}>
      <div role="tablist" aria-label={t('nb.space')} className="ap-spaces">
        {(['ca-nhan', 'cong-ty'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={space === s}
            className={space === s ? 'on' : undefined}
            onClick={() => switchSpace(s)}
          >
            <Ico
              name={s === 'ca-nhan' ? 'user' : 'building'}
              color={space === s ? (s === 'ca-nhan' ? ME : 'var(--ap-co)') : undefined}
            />
            {t(`nb.space.${s}`)}
          </button>
        ))}
      </div>
      <label className="ap-bsearch">
        <Ico name="search" />
        <input
          type="search"
          placeholder={t('nb.search', { space: t(`nb.space.${space}`) })}
          aria-label={t('nb.searchLabel')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={`ap-row d0 ap-binbox${state?.inbox ? ' has' : ''}`}
        onClick={() => nav.go('brain', { view: 'inbox' })}
      >
        <span className="ap-ico" />
        <Ico name="inbox" />
        <span className="lbl">{t('br.inbox')}</span>
        <span className="n">{state?.inbox ?? 0}</span>
      </button>

      {hits ? (
        <div className="ap-bhits" aria-live="polite">
          <div className="ap-sec">
            <span>{t('nb.results', { n: hits.length })}</span>
          </div>
          {hits.map((h) => (
            <button type="button" key={h.path} className="ap-hit" onClick={() => select(h.path)}>
              <b className="ap-ell">{h.title}</b>
              <span className="a-muted">{h.snippet}</span>
            </button>
          ))}
          {!hits.length && <div className="ap-lempty">{t('nb.noResult')}</div>}
        </div>
      ) : (
        <div className="ap-layers">
          <Layer kind="me" icon="pen" title={t('nb.diary')} sub={t('nb.l.diary')}>
            <Row
              label={t('nb.today', { w: weekday, d: dmy(today).slice(0, 5) })}
              icon="cal"
              color={ME}
              note={todayEntry ? undefined : t('nb.write')}
              current={!!todayEntry && todayEntry.path === current}
              onClick={() => void writeToday()}
            />
            {diary.some((d) => d.name !== today) && (
              <Group
                id="diary"
                label={t('nb.diaryPast')}
                pages={diary.filter((d) => d.name !== today)}
                open={open.has('diary')}
                toggle={toggle}
                current={current}
                select={select}
              />
            )}
          </Layer>

          <Layer
            kind="lib"
            icon="book"
            title={t('nb.wiki')}
            sub={wikiCount ? t('nb.l.wiki', { n: wikiCount }) : t('nb.l.wikiNone')}
          >
            {overview && (
              <Row
                label={overview.title}
                icon="home"
                color={LIB}
                current={overview.path === current}
                onClick={() => select(overview.path)}
              />
            )}
            {space === 'ca-nhan' ? (
              groups('w', [...PERSONAL_GROUPS, 'khac'], (g) =>
                g === 'khac'
                  ? wikiOf((e) => !e.group || !PERSONAL_GROUPS.includes(e.group))
                  : wikiOf((e) => e.group === g),
              )
            ) : (
              <>
                <div className="ap-sec">
                  <span>{t('nb.common')}</span>
                  <i>{t('nb.allBots')}</i>
                </div>
                {groups('c', [...COMPANY_GROUPS, 'khac'], (g) =>
                  g === 'khac'
                    ? wikiOf((e) => !e.dept && !COMPANY_GROUPS.some((x) => e.group === `chung/${x}`))
                    : wikiOf((e) => !e.dept && e.group === `chung/${g}`),
                )}
                <div className="ap-sec">
                  <span>{t('nb.depts')}</span>
                  <i>{t('nb.deptBots')}</i>
                </div>
                {(state?.departments ?? []).map((d) => {
                  const pages = wikiOf((e) => e.dept === d.id && !e.name.startsWith('_'))
                  const key = `d:${d.id}`
                  return (
                    <div key={d.id}>
                      <Row
                        label={d.name}
                        icon="lock"
                        color={LIB}
                        count={pages.length}
                        open={open.has(key)}
                        onClick={() => toggle(key)}
                      />
                      {open.has(key) &&
                        (pages.length ? (
                          groups(
                            key,
                            [...DEPT_GROUPS, 'khac'],
                            (g) =>
                              pages.filter((e) =>
                                g === 'khac' ? !e.group || !DEPT_GROUPS.includes(e.group) : e.group === g,
                              ),
                            1,
                            false,
                          )
                        ) : (
                          <div className="ap-lempty d1">{t('nb.deptEmpty')}</div>
                        ))}
                    </div>
                  )
                })}
              </>
            )}
            {!wikiCount && space === 'ca-nhan' && <div className="ap-lempty">{t('nb.wikiEmpty')}</div>}
          </Layer>

          <Layer kind="src" icon="lock" title={t('nb.sources')} sub={t('nb.l.src')}>
            {months.map((m) => (
              <Group
                key={m}
                id={`n:${m}`}
                label={t('nb.month', { m: m.split('-').reverse().join('/') })}
                icon="box"
                color={SRC}
                pages={sources.filter((e) => e.path.split('/')[2] === m)}
                open={open.has(`n:${m}`)}
                toggle={toggle}
                current={current}
                select={select}
              />
            ))}
            {!months.length && <div className="ap-lempty">{t('nb.srcEmpty')}</div>}
          </Layer>
        </div>
      )}

      <div className="ap-bfoot">
        <Button size="sm" onClick={() => openExternal()}>
          <Ico name="gem" />
          {state?.obsidian === false ? t('nb.openFinder') : t('nb.openObsidian')}
        </Button>
        <span className="a-muted">
          <span className="a-mono">
            {(state?.root ?? '~/aris/brain').replace(/^\/Users\/[^/]+/, '~')}/{space}
          </span>
          {state && !state.git ? ` · ${t('nb.noGit')}` : ''}
        </span>
      </div>
    </nav>
  )

  // --- Giữa --------------------------------------------------------------------------------
  const p = page?.page
  const doc = useMemo(() => (page ? parseMarkdown(page.text) : null), [page])
  const editable = !!p && !p.binary && p.layer !== 'nguon'
  const crumb = p
    ? [
        t(`nb.space.${p.space ?? space}`),
        t(`nb.layer.${p.layer}`),
        p.dept ? (state?.departments.find((d) => d.id === p.dept)?.name ?? p.dept) : null,
        p.group ? groupLabel(t, p.group.replace(/^chung\//, '')) : null,
      ].filter(Boolean)
    : [t(`nb.space.${space}`)]

  const startEdit = () => {
    if (!page) return
    setDraft(page.text)
    setEditing(true)
  }
  const save = async () => {
    if (!p) return
    setSaving(true)
    const j = await post({ op: 'save', path: p.path, text: draft, mtime: p.mtime })
    setSaving(false)
    if (j) {
      setEditing(false)
      await Promise.all([load(), loadPage(p.path)])
    }
  }

  const sourceCount = page ? frontValue(page.text, 'nguon') : undefined
  const updated = page ? frontValue(page.text, 'cap-nhat') : undefined

  const main = (
    <main className="ap-note-main">
      <div className="ap-note-bar">
        <span className="a-muted">{crumb.join(' / ')} /</span>
        <span style={{ fontWeight: 600 }}>{p ? p.title : t('nb.start')}</span>
        {editing && <Pill tone="accent">{t('nb.editing')}</Pill>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('nb.cancel')}
              </Button>
              <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
                {t('nb.save')}
              </Button>
            </>
          ) : (
            <>
              {editable && (
                <Button size="sm" onClick={startEdit}>
                  {t('nb.edit')}
                </Button>
              )}
              <Button size="sm" onClick={() => nav.go('brain', { view: 'ask' })}>
                {t('br.ask')}
              </Button>
              <Button size="sm" onClick={() => nav.go('brain', { view: 'graph' })}>
                {t('br.graph')}
              </Button>
            </>
          )}
        </span>
      </div>
      {error && (
        <div className="ap-berror" role="alert">
          {error}
        </div>
      )}
      {setup && (
        <div className="ap-bnotice ap-bsetup" role="status">
          <span>{t('nb.obsidianSetup', { path: setup.replace(/^\/Users\/[^/]+/, '~') })}</span>
          <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>
            {t('nb.gotIt')}
          </Button>
        </div>
      )}

      {isEmpty && !p ? (
        <div className="ap-note ap-bempty">
          <h1>{t('nb.empty.title', { space: t(`nb.space.${space}`) })}</h1>
          <p className="a-muted">{t('nb.empty.lead')}</p>
          <div className="ap-blayers">
            <div className="a-card">
              <b>{t('nb.sources')}</b>
              <span className="a-muted">{t('nb.empty.sources')}</span>
            </div>
            <div className="a-card">
              <b>{t('nb.diary')}</b>
              <span className="a-muted">{t('nb.empty.diary')}</span>
            </div>
            <div className="a-card lib">
              <b>{t('nb.wiki')}</b>
              <span className="a-muted">{t('nb.empty.wiki')}</span>
            </div>
          </div>
          <div className="a-card ap-bstart">
            <b>{t('nb.empty.how')}</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="primary" onClick={() => void writeToday()}>
                {t('nb.writeToday')}
              </Button>
              <Later t={t} stage={5} label={t('nb.wave2')} row>
                <Button disabled>{t('nb.dropFile')}</Button>
              </Later>
              <Button onClick={() => openExternal()}>
                {state?.obsidian === false ? t('nb.openFinder') : t('nb.openFolderObsidian')}
              </Button>
            </div>
          </div>
          <div className="a-card ap-blib">
            <b>{t('nb.libReady')}</b>
            <span className="a-muted">{t('nb.libAbout')}</span>
            <button type="button" className="ap-link" onClick={() => nav.go('bot', { id: LIBRARIAN })}>
              {t('nb.libProfile')}
            </button>
          </div>
        </div>
      ) : editing ? (
        <Editor
          t={t}
          text={draft}
          onChange={setDraft}
          wiki={p?.layer === 'wiki'}
          entries={entries}
          onSave={() => void save()}
        />
      ) : p && page && doc ? (
        <article className="ap-note ap-bnote">
          <div className="ap-bprov">
            {p.layer === 'wiki' && <span className="ap-libpill">{t('nb.libWrote')}</span>}
            {p.layer === 'nhat-ky' && <Pill tone="muted">{t('nb.diaryPill')}</Pill>}
            {p.layer === 'nguon' && <Pill tone="muted">{t('nb.sourcePill')}</Pill>}
            {p.dept && <Pill tone="muted">🔒 {t('nb.deptPill', { name: crumb[2] ?? p.dept })}</Pill>}
            <span className="a-muted">
              {[
                sourceCount && sourceCount !== '0' ? t('nb.fromSources', { n: sourceCount }) : null,
                updated ? t('nb.updated', { d: dmy(updated) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {p.status === 'luu-tru' && <Pill tone="muted">{t('nb.archived')}</Pill>}
            {p.tags.map((tag) => (
              <span key={tag} className="a-tag">
                #{tag}
              </span>
            ))}
          </div>
          {p.binary ? (
            <div className="a-card ap-bfile">
              <b>{p.title}</b>
              <span className="a-muted">{t('nb.binary')}</span>
              <Button size="sm" onClick={() => openExternal(p.path)}>
                {t('nb.openFile')}
              </Button>
            </div>
          ) : (
            <>
              {!doc.blocks.some((b) => b.kind === 'h' && b.level === 1) && <h1>{p.title}</h1>}
              <Markdown doc={doc} links={links} />
              {doc.notes.length > 0 && (
                <div className="ap-bnotes">
                  <b>{t('nb.pageSources', { n: doc.notes.length })}</b>
                  {doc.notes.map((n) => (
                    <div className="ap-src" key={n.id}>
                      <span className="ap-cit">{n.id}</span>
                      <span>
                        <Inline text={n.text} links={links} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="ap-backlinks">
            <div className="a-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {t('br.backlinks', { n: page.backlinks.length })}
            </div>
            {page.backlinks.length > 0 ? (
              <div className="ap-bls">
                {page.backlinks.map((b) => (
                  <button type="button" className="ap-bl" key={b.path} onClick={() => select(b.path)}>
                    {b.title}
                  </button>
                ))}
              </div>
            ) : (
              <span className="a-muted" style={{ fontSize: 13 }}>
                {t('nb.noBacklinks')}
              </span>
            )}
          </div>
        </article>
      ) : (
        <div className="ap-note a-muted">{state ? t('nb.pick') : t('nb.loading')}</div>
      )}
    </main>
  )

  // --- Phải --------------------------------------------------------------------------------
  const readers = page?.readers ?? state?.readers[space] ?? []
  const aside = (
    <aside className="ap-aside" aria-label={t('nb.aside')}>
      <Later t={t} stage={5} label={t('nb.wave4')}>
        <div className="ap-bgraph">
          <b>{t('nb.around')}</b>
          <span className="a-muted">{t('nb.graphLater')}</span>
        </div>
      </Later>
      <div className="ap-breaders">
        <b>{p ? t('nb.whoPage') : t('nb.whoSpace', { space: t(`nb.space.${space}`) })}</b>
        <span>{readers.join(' · ')}</span>
        <span className="a-muted">{t(p?.dept ? 'nb.whoDept' : `nb.who.${space}`)}</span>
      </div>
    </aside>
  )

  return (
    <div className="ap-split ap-brain">
      {tree}
      {main}
      {aside}
    </div>
  )
}

/** Các nhóm cần mở để thấy một trang trong cây. */
function keysOf(e: Entry): string[] {
  if (e.layer === 'nhat-ky') return ['diary']
  if (e.layer === 'nguon') return [`n:${e.path.split('/')[2] ?? ''}`]
  if (e.layer !== 'wiki') return []
  if (e.space === 'ca-nhan') return [`w:${PERSONAL_GROUPS.includes(e.group ?? '') ? e.group : 'khac'}`]
  if (e.dept) {
    const g = DEPT_GROUPS.includes(e.group ?? '') ? e.group : 'khac'
    return [`d:${e.dept}`, `d:${e.dept}:${g}`]
  }
  const g = (e.group ?? '').replace(/^chung\//, '')
  return [`c:${COMPANY_GROUPS.includes(g) ? g : 'khac'}`]
}

/** Khung sửa Markdown: gõ `[[` thì gợi ý tên trang trong không gian. */
function Editor({
  t,
  text,
  onChange,
  wiki,
  entries,
  onSave,
}: {
  t: Translate
  text: string
  onChange: (s: string) => void
  wiki: boolean
  entries: Entry[]
  onSave: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const open = /\[\[([^\]\n[]*)$/.exec(text.slice(0, caret))
  const q = open?.[1] ?? ''
  const list = open
    ? entries
        .filter((e) => e.path.endsWith('.md') && !e.name.startsWith('_') && e.layer !== 'he-thong')
        .filter((e) => !q || fold(e.name).includes(fold(q)) || fold(e.title).includes(fold(q)))
        .slice(0, 6)
    : []
  const options = open
    ? [
        ...list.map((e) => ({
          name: e.name,
          label: e.title,
          hint: e.group ? t(`nb.g.${e.group.replace(/^chung\//, '')}`) : t(`nb.layer.${e.layer}`),
        })),
        ...(q.trim() ? [{ name: slug(q), label: t('nb.newPage', { q }), hint: t('nb.libLater') }] : []),
      ]
    : []

  const pick = (name: string) => {
    if (!open) return
    const start = caret - q.length
    const next = `${text.slice(0, start)}${name}]]${text.slice(caret)}`
    onChange(next)
    const pos = start + name.length + 2
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      onSave()
      return
    }
    if (!options.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(options[Math.min(active, options.length - 1)]!.name)
    } else if (e.key === 'Escape') setCaret(-1)
  }

  return (
    <div className="ap-note ap-bedit">
      {wiki && <div className="ap-bnotice">{t('nb.editNotice')}</div>}
      <div className="ap-bed">
        <textarea
          ref={ref}
          className="a-inp a-mono"
          value={text}
          spellCheck={false}
          aria-label={t('nb.editor')}
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
            setActive(0)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKey}
        />
        {options.length > 0 && (
          <div role="listbox" aria-label={t('nb.linkTo')} className="ap-bsugg">
            <div className="a-muted ap-bsugg-h">{t('nb.linkTo')}</div>
            {options.map((o, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                key={`${o.name}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o.name)
                }}
              >
                <span className="ap-ell">{o.label}</span>
                <span className="a-muted">{o.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="a-muted" style={{ fontSize: 12 }}>
        {t('nb.editHelp')}
      </div>
    </div>
  )
}
