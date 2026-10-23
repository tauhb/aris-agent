/**
 * Thẻ "Chợ plugin" (bản vẽ 6.7b): tìm, sắp xếp, lọc danh mục trên mọi nguồn chợ; quản lý nguồn;
 * thẻ gói với Cài / Đã cài / Chưa hợp phiên bản.
 */
import { Button, Card, CardRow, SearchIcon, TextInput } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MarketEntry, MarketIndexSummary, PageProps, PluginSource } from '../../page.js'
import type { InstallItem } from './InstallDialog.js'
import { debrand, letterOf, marketCard, searchUpTo } from './model.js'

type T = PageProps['t']
type Market = NonNullable<PluginSource['market']>
type Sort = 'relevance' | 'published' | 'name'

export interface Listed {
  url: string
  entry: MarketEntry
}

const PAGE = 48

export const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Tên một nguồn chợ: tiêu đề nguồn (bỏ tên nền tảng), không có thì tên máy chủ. */
export function indexLabel(ix: MarketIndexSummary, resolve: PluginSource['resolveText']) {
  const title = ix.title ? debrand(resolve(ix.title)).trim() : ''
  return title && title !== 'aris' ? title : hostOf(ix.url)
}

/** Mục chợ hiện ra: tên, mô tả, danh mục (đã bỏ tên nền tảng). */
export function entryView(e: MarketEntry, resolve: PluginSource['resolveText']) {
  return {
    title: debrand(e.title ? resolve(e.title) : e.name),
    description: e.description ? debrand(resolve(e.description)) : undefined,
  }
}

function useIndexes(market: Market) {
  const [indexes, setIndexes] = useState<readonly MarketIndexSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    void market.indexes().then((r) => (r.ok ? setIndexes(r.value) : setError(r.error)))
  }, [market])
  useEffect(load, [load])
  return { indexes, error, reload: load }
}

function Sources({
  t,
  src,
  market,
  indexes,
  onChanged,
}: {
  t: T
  src: PluginSource
  market: Market
  indexes: readonly MarketIndexSummary[]
  onChanged: () => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = async (urls: string[]) => {
    setError(null)
    const r = await market.setIndexes(urls)
    if (!r.ok) setError(r.error)
    else {
      setUrl('')
      onChanged()
    }
  }
  return (
    <Card title={t('pl.mk.sources')} subtitle={t('pl.mk.sourcesHint')}>
      {indexes.map((ix) => (
        <CardRow
          key={ix.url}
          label={
            <span style={{ minWidth: 0 }}>
              <b>{indexLabel(ix, src.resolveText)}</b>{' '}
              <span className="a-muted a-mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                {ix.url}
              </span>
              {ix.error && <div style={{ fontSize: 12, color: 'var(--a-danger)' }}>{ix.error}</div>}
            </span>
          }
        >
          <span className="a-muted" style={{ fontSize: 12 }}>
            {ix.error ? t('pl.mk.sourceError') : t('pl.mk.sourceOn')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void save(indexes.filter((x) => x.url !== ix.url).map((x) => x.url))}
          >
            {t('pl.mk.sourceRemove')}
          </Button>
        </CardRow>
      ))}
      <CardRow>
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('pl.mk.sourceUrl')}
          aria-label={t('pl.mk.sourceUrl')}
          className="a-mono"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          size="sm"
          disabled={!/^https?:\/\/\S+$/.test(url.trim())}
          onClick={() => void save([...indexes.map((x) => x.url), url.trim()])}
        >
          {t('pl.mk.sourceAdd')}
        </Button>
      </CardRow>
      {error && <CardRow label={<span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>} />}
    </Card>
  )
}

function EntryCard({
  t,
  src,
  item,
  categories,
  onInstall,
}: {
  t: T
  src: PluginSource
  item: Listed
  categories: Record<string, string>
  onInstall: (items: InstallItem[]) => void
}) {
  const { entry } = item
  const { title, description } = entryView(entry, src.resolveText)
  const card = marketCard(entry)
  const cat = entry.metadata.category
    ? (categories[entry.metadata.category] ?? entry.metadata.category)
    : null
  const install = () =>
    card.version &&
    onInstall([
      {
        title,
        spec: card.version.install.spec,
        version: card.version.version,
        source: hostOf(item.url),
        registry: card.version.install.registry,
      },
    ])
  return (
    <div className="ap-pl-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span className="ap-pl-tile builtin" aria-hidden>
          {letterOf(title)}
        </span>
        <span style={{ minWidth: 0 }}>
          <b>{title}</b>
          <div className="a-muted" style={{ fontSize: 12 }}>
            {[card.version?.version, cat].filter(Boolean).join(' · ')}
          </div>
        </span>
      </div>
      {description && (
        <div className="a-muted grow" style={{ fontSize: 12.5 }}>
          {description}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        {card.installed && <span className="a-pill ok">{t('pl.mk.installed')}</span>}
        {card.incompatible && !card.installed && (
          <span className="a-pill muted">{t('pl.mk.incompatible')}</span>
        )}
        {card.canInstall && (
          <Button size="sm" variant="primary" onClick={install}>
            {card.update ? t('pl.updates.one') : t('pl.mk.install')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function MarketTab({
  t,
  src,
  market,
  onInstall,
}: {
  t: T
  src: PluginSource
  market: Market
  onInstall: (items: InstallItem[]) => void
}) {
  const { indexes, error, reload } = useIndexes(market)
  const [text, setText] = useState('')
  const [sort, setSort] = useState<Sort>('relevance')
  const [category, setCategory] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [showSources, setShowSources] = useState(false)
  const [items, setItems] = useState<Listed[] | null>(null)
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!indexes) return
    let live = true
    const query = {
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(category ? { category } : {}),
      sort: { kind: sort === 'name' ? ('index' as const) : sort },
    }
    const timer = setTimeout(() => {
      void Promise.all(
        indexes.filter((ix) => !ix.error).map((ix) => searchUpTo(market, ix.url, query, limit)),
      ).then((rs) => {
        if (!live) return
        const ok = rs.flatMap((r) => (r.ok ? [r.value] : []))
        const failed = rs.find((r) => !r.ok)
        setSearchError(ok.length === 0 && failed && !failed.ok ? failed.error : null)
        const cats: Record<string, string> = {}
        for (const s of ok)
          for (const [id, c] of Object.entries(s.metadata.categories))
            cats[id] = debrand(src.resolveText(c.title))
        setCategories(cats)
        const listed = ok.flatMap((s) => s.entries.map((entry) => ({ url: s.url, entry })))
        if (sort === 'name')
          listed.sort((a, b) =>
            entryView(a.entry, src.resolveText).title.localeCompare(
              entryView(b.entry, src.resolveText).title,
              'vi',
            ),
          )
        setItems(listed)
        setTotal(ok.reduce((n, s) => n + s.total, 0))
      })
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [indexes, market, src, text, category, sort, limit])

  const chips = useMemo(
    () => Object.entries(categories).sort((a, b) => a[1].localeCompare(b[1], 'vi')),
    [categories],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ position: 'relative', display: 'flex', flex: '1 1 260px' }}>
          <TextInput
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setLimit(PAGE)
            }}
            placeholder={t('pl.mk.search')}
            aria-label={t('pl.mk.search')}
            style={{ paddingLeft: 32, width: '100%' }}
          />
          <span className="a-muted" style={{ position: 'absolute', left: 10, top: 8, pointerEvents: 'none' }}>
            <SearchIcon size={15} />
          </span>
        </span>
        <label
          className="a-muted"
          style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          {t('pl.mk.sort')}
          <select
            className="ap-sel"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            style={{ height: 32, fontSize: 13 }}
          >
            <option value="relevance">{t('pl.mk.sort.relevance')}</option>
            <option value="published">{t('pl.mk.sort.published')}</option>
            <option value="name">{t('pl.mk.sort.name')}</option>
          </select>
        </label>
        <Button size="sm" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
          {t('pl.mk.sourcesCount', { n: indexes?.length ?? 0 })}
        </Button>
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ap-chip"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
          >
            {t('pl.mk.all')}
          </button>
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ap-chip"
              aria-pressed={category === id}
              onClick={() => {
                setCategory(category === id ? null : id)
                setLimit(PAGE)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {showSources && indexes && (
        <Sources t={t} src={src} market={market} indexes={indexes} onChanged={reload} />
      )}
      {(error || searchError) && (
        <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>
          {/\b404\b/.test(error ?? searchError ?? '')
            ? t('pl.mk.needRestart')
            : t('pl.loadError', { error: error ?? searchError })}
        </div>
      )}
      {indexes?.length === 0 && <div className="a-muted">{t('pl.mk.noSources')}</div>}
      {!items && !error && indexes?.length !== 0 && <div className="a-muted">{t('pl.loading')}</div>}
      {items && items.length === 0 && indexes?.length !== 0 && <div className="a-muted">{t('pl.none')}</div>}
      {items && items.length > 0 && (
        <div className="ap-pl-cards">
          {items.map((it) => (
            <EntryCard
              key={`${it.url}|${it.entry.name}`}
              t={t}
              src={src}
              item={it}
              categories={categories}
              onInstall={onInstall}
            />
          ))}
        </div>
      )}
      {items && total > items.length && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('pl.mk.shown', { n: items.length, total })}
          </span>
          <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            {t('pl.mk.more')}
          </Button>
        </div>
      )}
    </div>
  )
}
