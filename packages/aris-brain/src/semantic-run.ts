/**
 * Chạy tìm theo nghĩa (giai đoạn 5, đợt 5a; bản vẽ 6.2b): đồng bộ đoạn của trang và ký ức bot vào kho vector,
 * nhúng dần ở nền qua dịch vụ `arisEmbed` (@aris/providers), tạm dừng khi chạm hạn mức gói miễn phí, và tìm gộp
 * từ khoá với theo nghĩa. Không có khoá hay model thì mọi lời tìm vẫn chạy theo từ khoá như trước.
 */
import type { Entry, Hit } from './catalog.js'
import type { MemHit } from './ask.js'
import { bestBySource, chunksOf, excerpt, fuse, VectorStore, type ChunkKind, type Via } from './semantic.js'

export interface SemanticConfig {
  /** Model nhúng; null là tắt tìm theo nghĩa. */
  model: { provider: string; model: string } | null
  scopes: { personal: boolean; company: boolean; memory: boolean }
  paused?: boolean | undefined
}

export const DEFAULT_SEMANTIC: SemanticConfig = {
  model: { provider: 'google', model: 'gemini-embedding-2' },
  scopes: { personal: true, company: true, memory: true },
}

export type SemanticState = 'off' | 'nokey' | 'running' | 'ready' | 'limited' | 'paused' | 'error'

export interface EmbedPort {
  models(): { provider: string; model: string; dims: number }[]
  hasKey(provider: string): Promise<boolean>
  embed(r: {
    provider: string
    model: string
    texts: readonly string[]
    mode: 'doc' | 'query'
    titles?: readonly (string | undefined)[]
  }): Promise<Float32Array[]>
}

interface EmbedFailure {
  kind?: string
  message?: string
  retryMs?: number
}

export interface SemanticDeps {
  store: VectorStore
  config(): SemanticConfig
  embedder(): EmbedPort | undefined
  /** Mọi trang của người dùng nên nhúng (đã lọc lớp, không gian) kèm thân trang. */
  pages(): { entry: Entry; body: string }[]
  page(path: string): { entry: Entry; body: string } | undefined
  /** Trang đáng nhúng: của người dùng, có chữ. */
  wanted(e: Entry): boolean
  /** Ký ức đang hiệu lực; undefined khi dịch vụ ký ức chưa sẵn (khỏi xoá nhầm đoạn đã nhúng). */
  memories(): MemHit[] | undefined
  botName(id: string): string
  keyword(query: string, allow: (e: Entry) => boolean, limit: number): Hit[]
  memoryKeyword(query: string, limit: number): MemHit[]
  logger: { info(...a: unknown[]): void; warn(...a: unknown[]): void }
  now?: () => number
}

export interface SemanticStatus {
  state: SemanticState
  model: SemanticConfig['model']
  scopes: SemanticConfig['scopes']
  done: number
  total: number
  parts: { personal: number; company: number; memory: number }
  /** Hạn mức: chạy lại lúc (ms). */
  resumeAt?: number | undefined
  error?: string | undefined
  /** Phút còn lại ước tính khi đang nhúng. */
  etaMin?: number | undefined
}

export type FusedHit = Hit & { via: Via }

const BATCH = 50
const memSrc = (id: string) => `ky-uc:${id}`

export function startSemantic(d: SemanticDeps) {
  const now = d.now ?? Date.now
  let state: SemanticState = 'off'
  let resumeAt: number | undefined
  let lastError: string | undefined
  let timer: NodeJS.Timeout | undefined
  let busy = false
  let stopped = false
  let rate: number | undefined
  const queryCache = new Map<string, Float32Array>()

  const scopeOk = (src: string, kind: ChunkKind) => {
    const s = d.config().scopes
    if (kind === 'memory') return s.memory
    if (src.startsWith('ca-nhan/')) return s.personal
    if (src.startsWith('cong-ty/')) return s.company
    return false
  }
  const modelId = () => {
    const m = d.config().model
    return m ? `${m.provider}/${m.model}` : ''
  }

  function syncPage(path: string): void {
    const p = d.page(path)
    if (!p || !d.wanted(p.entry)) {
      d.store.remove(path)
      return
    }
    if (d.store.sync(path, 'page', p.entry.title, chunksOf(p.body))) kick()
  }

  function syncAllPages(): void {
    const keep = new Set<string>()
    for (const p of d.pages()) {
      if (!d.wanted(p.entry)) continue
      keep.add(p.entry.path)
      d.store.sync(p.entry.path, 'page', p.entry.title, chunksOf(p.body))
    }
    d.store.keepOnly('page', keep)
  }

  function syncMemories(): void {
    const list = d.memories()
    if (!list) return
    const keep = new Set<string>()
    for (const m of list) {
      const src = memSrc(m.id)
      keep.add(src)
      d.store.sync(src, 'memory', `Ký ức của ${d.botName(m.bot)}`, chunksOf(m.text))
    }
    d.store.keepOnly('memory', keep)
  }

  function schedule(ms: number): void {
    clearTimeout(timer)
    if (!stopped) timer = setTimeout(() => void tick(), ms)
  }
  function kick(): void {
    if (!busy && state !== 'limited' && state !== 'paused') schedule(1500)
  }

  const fail = (e: unknown) => {
    const f = e as EmbedFailure
    lastError = f.message ?? String(e)
    if (f.kind === 'rate') {
      state = 'limited'
      resumeAt = now() + (f.retryMs ?? 60_000)
      d.logger.info('tìm theo nghĩa: chạm hạn mức, chạy lại sau %ds', Math.round((resumeAt - now()) / 1000))
      return resumeAt - now()
    }
    if (f.kind === 'nokey') {
      state = 'nokey'
      return 60_000
    }
    state = 'error'
    d.logger.warn('tìm theo nghĩa: %s', lastError)
    return f.kind === 'network' ? 30_000 : 5 * 60_000
  }

  async function tick(): Promise<void> {
    if (busy || stopped) return
    busy = true
    try {
      const cfg = d.config()
      const port = d.embedder()
      if (!cfg.model || !port) {
        state = 'off'
        return
      }
      if (cfg.paused) {
        state = 'paused'
        return
      }
      if (!(await port.hasKey(cfg.model.provider))) {
        state = 'nokey'
        schedule(60_000)
        return
      }
      const todo = d.store.pending(modelId(), BATCH, scopeOk)
      if (!todo.length) {
        state = 'ready'
        resumeAt = undefined
        lastError = undefined
        return
      }
      state = 'running'
      const t0 = now()
      try {
        const vecs = await port.embed({
          ...cfg.model,
          mode: 'doc',
          texts: todo.map((r) => r.text),
          titles: todo.map((r) => r.title),
        })
        d.store.setVectors(
          modelId(),
          todo.map((r, i) => ({ id: r.id, v: vecs[i]! })),
        )
        const ms = Math.max(1, now() - t0)
        rate = todo.length / ms
        resumeAt = undefined
        lastError = undefined
        schedule(250)
      } catch (e) {
        schedule(fail(e))
      }
    } finally {
      busy = false
    }
  }

  async function queryVector(q: string): Promise<Float32Array | undefined> {
    const cfg = d.config()
    const port = d.embedder()
    if (!cfg.model || !port || cfg.paused) return undefined
    if (state === 'limited' && resumeAt && now() < resumeAt) return undefined
    const key = `${modelId()}\u0000${q}`
    const hit = queryCache.get(key)
    if (hit) return hit
    try {
      const [v] = await port.embed({ ...cfg.model, mode: 'query', texts: [q] })
      if (!v) return undefined
      if (queryCache.size > 300) queryCache.delete(queryCache.keys().next().value!)
      queryCache.set(key, v)
      return v
    } catch (e) {
      const ms = fail(e)
      if (state === 'limited') schedule(ms)
      return undefined
    }
  }

  /** Tìm trang: từ khoá gộp với theo nghĩa (khi có vector); `allow` lọc theo quyền và phạm vi. */
  async function searchPages(
    query: string,
    allow: (e: Entry) => boolean,
    limit: number,
  ): Promise<FusedHit[]> {
    const kw = d.keyword(query, allow, Math.max(limit, 20))
    const qv = query.trim() ? await queryVector(query) : undefined
    if (!qv) return kw.slice(0, limit).map((h) => ({ ...h, via: 'tu-khoa' as const }))
    const entries = new Map<string, Entry | undefined>()
    const entryOf = (src: string) => {
      if (!entries.has(src)) entries.set(src, d.page(src)?.entry)
      return entries.get(src)
    }
    const vec = bestBySource(
      d.store.search(modelId(), qv, (src, kind) => {
        if (kind !== 'page' || !scopeOk(src, kind)) return false
        const e = entryOf(src)
        return !!e && allow(e)
      }),
    ).slice(0, 20)
    const kwBy = new Map(kw.map((h) => [h.entry.path, h]))
    const vecBy = new Map(vec.map((h) => [h.src, h]))
    return fuse(
      kw.map((h) => h.entry.path),
      vec.map((h) => h.src),
      limit,
    ).flatMap(({ id, via }) => {
      const k = kwBy.get(id)
      if (k) return [{ ...k, via }]
      const e = entryOf(id)
      const v = vecBy.get(id)
      return e && v ? [{ entry: e, snippet: excerpt(v.text), via }] : []
    })
  }

  /** Tìm ký ức các bot: từ khoá gộp với theo nghĩa. */
  async function searchMemories(query: string, limit: number): Promise<(MemHit & { via: Via })[]> {
    const kw = d.memoryKeyword(query, Math.max(limit, 20))
    const cfg = d.config()
    const qv = cfg.scopes.memory && query.trim() ? await queryVector(query) : undefined
    if (!qv) return kw.slice(0, limit).map((m) => ({ ...m, via: 'tu-khoa' as const }))
    const vec = bestBySource(d.store.search(modelId(), qv, (_s, kind) => kind === 'memory')).slice(0, 20)
    const all = new Map((d.memories() ?? []).map((m) => [memSrc(m.id), m]))
    for (const m of kw) all.set(memSrc(m.id), m)
    return fuse(
      kw.map((m) => memSrc(m.id)),
      vec.map((h) => h.src),
      limit,
    ).flatMap(({ id, via }) => {
      const m = all.get(id)
      return m ? [{ ...m, via }] : []
    })
  }

  function status(): SemanticStatus {
    const cfg = d.config()
    const id = modelId()
    const c = d.store.counts(id, scopeOk)
    const part = (pred: (src: string, kind: ChunkKind) => boolean) =>
      d.store.counts(id, (s, k) => pred(s, k)).total
    const left = c.total - c.done
    return {
      state: cfg.paused ? 'paused' : !cfg.model ? 'off' : state === 'ready' && left > 0 ? 'running' : state,
      model: cfg.model,
      scopes: cfg.scopes,
      done: c.done,
      total: c.total,
      parts: {
        personal: part((s, k) => k === 'page' && s.startsWith('ca-nhan/')),
        company: part((s, k) => k === 'page' && s.startsWith('cong-ty/')),
        memory: part((_s, k) => k === 'memory'),
      },
      resumeAt: state === 'limited' ? resumeAt : undefined,
      error: state === 'error' || state === 'limited' ? lastError : undefined,
      etaMin:
        state === 'running' && rate && left > 0 ? Math.max(1, Math.ceil(left / rate / 60_000)) : undefined,
    }
  }

  syncAllPages()
  // Dịch vụ ký ức có thể nạp sau bộ não: đồng bộ ký ức một lát sau khi khởi động.
  const firstMem = setTimeout(() => {
    syncMemories()
    kick()
  }, 20_000)
  const memTimer = setInterval(() => {
    syncMemories()
    kick()
  }, 10 * 60_000)
  schedule(3000)

  return {
    syncPage,
    syncMemories,
    searchPages,
    searchMemories,
    status,
    /** Cấu hình vừa đổi (model, phạm vi, tạm dừng): chạy lại vòng nhúng. */
    changed(): void {
      queryCache.clear()
      state = 'running'
      resumeAt = undefined
      schedule(500)
    },
    reset(): void {
      d.store.clearVectors()
      queryCache.clear()
      schedule(500)
    },
    stop(): void {
      stopped = true
      clearTimeout(timer)
      clearInterval(memTimer)
      clearTimeout(firstMem)
    },
  }
}

export type Semantic = ReturnType<typeof startSemantic>
