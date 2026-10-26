/**
 * Ghép dữ liệu cho trang 6.2 từ các nguồn của dsh, không giữ bản sao riêng:
 * - danh bạ route: `llm.listProviders` (route đang chạy) nối với
 *   `llm.listConfigurableProviders` (route cấu hình được);
 * - hồ sơ route: namespace cấu hình của gói lo route đó (`llm-pi-ai`, `llm-deepseek`);
 * - khoá: `credentials.describe` (chỉ biết có hay không, không đọc được giá trị);
 * - model đang phục vụ: `session.modelCatalog`.
 * Quy ước tên khoá và cách nối danh bạ theo đúng trang Model của dsh để hai bên đọc
 * cùng một chỗ.
 */
import type { CredentialState, DiscoveredModel, ModelGroup, ProviderEntry } from '../page.js'

/** Route của tài khoản DeepSeek: đăng nhập, không có khoá. */
export const ACCOUNT_ROUTE = 'deepseek-account'

/** Tên khoá mặc định của một route, giống dsh: `minimax-cn` → `MINIMAX_CN_API_KEY`. */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Nối route đang chạy với route cấu hình được; tài khoản rồi DeepSeek chính thức lên đầu. */
export function joinProviders(
  registered: readonly { id: string; name: string }[],
  declared: readonly Omit<ProviderEntry, 'active'>[],
): ProviderEntry[] {
  const active = new Set(registered.map((p) => p.id))
  const known = new Set(declared.map((d) => d.id))
  const rows: ProviderEntry[] = declared.map((d) => ({
    ...d,
    name: providerName(d.id, d.name),
    active: active.has(d.id),
  }))
  for (const p of registered)
    if (!known.has(p.id))
      rows.push({ id: p.id, name: providerName(p.id, p.name), ns: '', path: [], nativeEnv: [], active: true })
  const rank = (id: string) => (id === ACCOUNT_ROUTE ? 0 : id === 'deepseek-official' ? 1 : 2)
  return rows.toSorted((a, b) => rank(a.id) - rank(b.id))
}

export type Profile = Record<string, unknown>

/** Hồ sơ của route trong giá trị namespace; undefined khi chưa có. */
export function profileAt(value: unknown, path: readonly string[]): Profile | undefined {
  let node = value
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return typeof node === 'object' && node !== null && !Array.isArray(node) ? (node as Profile) : undefined
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)

export type ProviderStatus = 'ok' | 'nokey' | 'error' | 'off'

export interface ProviderRow {
  entry: ProviderEntry
  /** Đã có hồ sơ trong cấu hình (đã thêm vào). */
  configured: boolean
  profile: Profile
  /** Tên khoá route đọc: tên hồ sơ ghi (`apiKeyEnv`) hoặc tên mặc định. */
  keyRef: string | undefined
  /** Hồ sơ có ghi tên khoá. */
  keyNamed: boolean
  key: CredentialState | undefined
  /** Có khoá ở biến môi trường mà route tự đọc. */
  nativeKey: boolean
  status: ProviderStatus
}

/** Mọi tên khoá cần hỏi `credentials.describe` cho danh bạ này. */
export function credentialRefs(
  entries: readonly ProviderEntry[],
  nsValue: (ns: string) => unknown,
): string[] {
  const refs = new Set<string>()
  for (const e of entries) {
    if (e.id === ACCOUNT_ROUTE) continue
    const named = str(profileAt(nsValue(e.ns), e.path)?.apiKeyEnv)
    if (named) refs.add(named)
    else {
      refs.add(deriveKeyRef(e.id))
      for (const env of e.nativeEnv) refs.add(env)
    }
  }
  return [...refs]
}

export function buildRows(
  entries: readonly ProviderEntry[],
  nsValue: (ns: string) => unknown,
  creds: Readonly<Record<string, CredentialState>>,
): ProviderRow[] {
  return entries.map((entry) => {
    const value = entry.ns ? nsValue(entry.ns) : undefined
    const profile = profileAt(value, entry.path)
    const configured = entry.path.length === 0 ? value !== undefined : profile !== undefined
    if (entry.id === ACCOUNT_ROUTE)
      return {
        entry,
        configured: true,
        profile: profile ?? {},
        keyRef: undefined,
        keyNamed: false,
        key: undefined,
        nativeKey: false,
        status: entry.error ? 'error' : entry.active ? 'ok' : 'off',
      }
    const named = str(profile?.apiKeyEnv)
    const keyRef = named ?? deriveKeyRef(entry.id)
    const key = creds[keyRef]
    const nativeKey = !named && entry.nativeEnv.some((env) => creds[env]?.configured)
    const hasKey = key?.configured === true || nativeKey
    const status: ProviderStatus = entry.error ? 'error' : !entry.active ? 'off' : hasKey ? 'ok' : 'nokey'
    return { entry, configured, profile: profile ?? {}, keyRef, keyNamed: !!named, key, nativeKey, status }
  })
}

/** Bỏ dấu để tìm không phân biệt dấu. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

/** Chia danh bạ: đã kết nối (đã thêm hoặc đang chạy) và có sẵn; lọc theo tên hoặc mã. */
export function splitDirectory(rows: readonly ProviderRow[], query = '') {
  const q = fold(query.trim())
  const shown = q ? rows.filter((r) => fold(`${r.entry.name} ${r.entry.id}`).includes(q)) : rows
  const isConnected = (r: ProviderRow) => r.configured || r.entry.active
  return {
    connected: shown.filter(isConnected),
    available: shown
      .filter((r) => !isConnected(r))
      .toSorted((a, b) => a.entry.name.localeCompare(b.entry.name)),
  }
}

/** Mã dòng của nhà cung cấp chỉ cho ảnh, video (fal.ai) trong danh bạ: `media:<mã>`. */
export const MEDIA_PREFIX = 'media:'

/**
 * Chia danh bạ theo việc provider làm được, cho cột trái của mục Provider và khoá:
 * - `chat`: đã kết nối, trừ nhà cung cấp chỉ cho ảnh, video;
 * - `media`: nhà cung cấp chỉ cho ảnh, video và provider đã kết nối có model ảnh hay video (`media`);
 * - `embed`: provider đã kết nối có model nhúng (`embed`);
 * - `available`: chưa kết nối.
 * Một provider có thể nằm ở nhiều nhóm (Google ở Chat, Ảnh và video, Nhúng).
 */
export function groupDirectory(
  rows: readonly ProviderRow[],
  query: string,
  has: { media: ReadonlySet<string>; embed: ReadonlySet<string> },
) {
  const { connected, available } = splitDirectory(rows, query)
  const mediaOnly = (r: ProviderRow) => r.entry.id.startsWith(MEDIA_PREFIX)
  return {
    chat: connected.filter((r) => !mediaOnly(r)),
    media: connected.filter((r) => mediaOnly(r) || has.media.has(r.entry.id)),
    embed: connected.filter((r) => has.embed.has(r.entry.id)),
    available,
  }
}

/** Nơi model của một provider đang được gán: chat mặc định, bậc dự phòng, chuỗi ảnh, video hay model nhúng. */
export interface UseRow {
  kind: 'chat' | 'fallback' | 'image' | 'video' | 'embed'
  /** Bậc trong chuỗi (từ 1); chat mặc định và nhúng không có bậc. */
  step?: number
  model: string
}

/** Các nguồn gán model mà `usedAt` đọc. */
export interface UseSources {
  chat: { provider: string; model: string } | undefined
  /** Chuỗi dự phòng chat (bậc 1 của chuỗi này là bậc 2 sau model chính). */
  chain: readonly { provider: string; model: string }[]
  image: readonly { provider: string; model: string }[]
  video: readonly { provider: string; model: string }[]
  embed: { provider: string; model: string } | null | undefined
  /** Bot có model riêng (chat, mục tiêu, dự phòng) hay danh sách ảnh, video riêng, kèm các provider nó dùng. */
  bots: readonly { name: string; providers: readonly string[] }[]
}

/**
 * Model của provider `id` đang được gán ở đâu, và tên các bot có model riêng thuộc provider này. Thứ tự: chat
 * mặc định, dự phòng chat, tạo ảnh, tạo video, nhúng.
 */
export function usedAt(id: string, src: UseSources): { rows: UseRow[]; bots: string[] } {
  const rows: UseRow[] = []
  if (src.chat?.provider === id) rows.push({ kind: 'chat', model: src.chat.model })
  const chain = (kind: 'fallback' | 'image' | 'video', links: UseSources['chain'], first: number) =>
    links.forEach((l, i) => l.provider === id && rows.push({ kind, step: i + first, model: l.model }))
  // Model chính là bậc 1 của chuỗi chat, nên dự phòng bắt đầu từ bậc 2.
  chain('fallback', src.chain, 2)
  chain('image', src.image, 1)
  chain('video', src.video, 1)
  if (src.embed?.provider === id) rows.push({ kind: 'embed', model: src.embed.model })
  return { rows, bots: src.bots.filter((b) => b.providers.includes(id)).map((b) => b.name) }
}

/** Một dòng trong bảng model của nhà cung cấp. */
export interface ModelLine {
  id: string
  name: string
  /** dsh đang phục vụ model này. */
  served: boolean
  /** Model nằm trong danh sách tự khai của hồ sơ (bật/tắt được ở đây). */
  listed: boolean
  reasoning: boolean
  contextWindow?: number | undefined
  image: boolean
}

/** Model tự khai trong hồ sơ (`models` của route). */
export function profileModels(profile: Profile): DiscoveredModel[] {
  const list = Array.isArray(profile.models) ? (profile.models as unknown[]) : []
  return list.flatMap((m) => {
    if (typeof m !== 'object' || m === null) return []
    const o = m as Record<string, unknown>
    const id = str(o.id)
    if (!id) return []
    const input = (o.input ?? o.inputModalities) as unknown
    return [
      {
        id,
        ...(str(o.name) ? { name: o.name as string } : {}),
        ...(typeof o.contextWindow === 'number' ? { contextWindow: o.contextWindow } : {}),
        ...(Array.isArray(input)
          ? { inputModalities: input.filter((x): x is string => typeof x === 'string') }
          : {}),
      },
    ]
  })
}

/** Gộp model đang phục vụ, model tự khai và model vừa dò được thành một bảng. */
export function modelLines(
  served: ModelGroup | undefined,
  listed: readonly DiscoveredModel[],
  discovered: readonly DiscoveredModel[],
): ModelLine[] {
  const lines = new Map<string, ModelLine>()
  const facts = (m: DiscoveredModel, line: ModelLine) => {
    if (m.contextWindow !== undefined) line.contextWindow ??= m.contextWindow
    if (m.inputModalities?.includes('image')) line.image = true
  }
  for (const m of served?.models ?? [])
    lines.set(m.id, {
      id: m.id,
      name: m.name || m.id,
      served: true,
      listed: false,
      reasoning: !!m.reasoning,
      image: false,
    })
  for (const [list, isListed] of [
    [listed, true],
    [discovered, false],
  ] as const)
    for (const m of list) {
      const line = lines.get(m.id) ?? {
        id: m.id,
        name: m.name ?? m.id,
        served: false,
        listed: false,
        reasoning: false,
        image: false,
      }
      if (isListed) line.listed = true
      facts(m, line)
      lines.set(m.id, line)
    }
  return [...lines.values()]
}

/** Một model trong hồ sơ pi-ai, dựng từ kết quả dò. */
export function profileModel(m: DiscoveredModel): Record<string, unknown> {
  return {
    id: m.id,
    ...(m.name && m.name !== m.id ? { name: m.name } : {}),
    ...(m.contextWindow !== undefined ? { contextWindow: m.contextWindow } : {}),
    ...(m.maxTokens !== undefined ? { maxTokens: m.maxTokens } : {}),
    ...(m.inputModalities ? { input: [...m.inputModalities] } : {}),
  }
}

/** Mã route cho nhà cung cấp tự thêm, từ tên hiển thị. */
export function routeIdOf(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export const ROUTE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

/** Tên quen thuộc của route pi-ai (dsh chỉ trả mã khi gói không có tên hiển thị). */
const NAMES: Record<string, string> = {
  'amazon-bedrock': 'Amazon Bedrock',
  'ant-ling': 'Ant Ling',
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  deepseek: 'DeepSeek (qua pi-ai)',
  'github-copilot': 'GitHub Copilot',
  google: 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  huggingface: 'Hugging Face',
  meta: 'Meta Llama',
  moonshotai: 'Moonshot AI',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  opencode: 'OpenCode',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  xai: 'xAI',
  zai: 'Z.ai',
}

const WORDS: Record<string, string> = { ai: 'AI', cn: 'CN', sgp: 'SGP', ams: 'AMS', go: 'Go' }

/** Tên hiển thị: tên dsh trả về, hoặc tên quen thuộc, hoặc viết hoa từ mã route. */
export function providerName(id: string, name: string): string {
  if (name && name !== id) return name
  if (NAMES[id]) return NAMES[id]
  const base = Object.keys(NAMES)
    .filter((k) => id.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0]
  const rest = (base ? id.slice(base.length + 1) : id)
    .split('-')
    .map((w) => WORDS[w] ?? w[0]!.toUpperCase() + w.slice(1))
  return base ? `${NAMES[base]} ${rest.join(' ')}` : rest.join(' ')
}

const BRAND: Record<string, string> = {
  deepseek: '#4D6BFE',
  anthropic: '#D97757',
  openai: '#10A37F',
  google: '#4285F4',
  gemini: '#4285F4',
  openrouter: '#6467F2',
  groq: '#F55036',
  mistral: '#FA520F',
  xai: '#111111',
  ollama: '#111111',
  qwen: '#615CED',
  moonshot: '#16191E',
  zhipu: '#3859FF',
  minimax: '#E2167E',
  azure: '#0078D4',
  bedrock: '#FF9900',
  amazon: '#FF9900',
  vertex: '#4285F4',
}

/** Màu chấm của nhà cung cấp: màu thương hiệu nếu biết, không thì một màu ổn định theo mã. */
export function providerColor(id: string): string {
  const hit = Object.keys(BRAND).find((k) => id.includes(k))
  if (hit) return BRAND[hit]!
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 50%)`
}

/** Model chỉ chạy theo lô (OpenRouter `:batch`): không gọi được qua chat, nên không đưa vào ô chọn. */
export function isChatModel(id: string): boolean {
  return !id.endsWith(':batch')
}

export type ProbeReason = 'auth' | 'credits' | 'notFound' | 'rateLimit' | 'timeout' | 'batch' | 'other'

/** Đọc lời báo lỗi của nhà cung cấp ra lý do dễ hiểu (mã HTTP và các câu quen thuộc). */
export function probeReason(error: string | undefined): ProbeReason {
  const e = error ?? ''
  if (/chat\/completions endpoint|batch/i.test(e)) return 'batch'
  if (/\b401\b|unauthori[sz]ed|invalid (api )?key|incorrect api key/i.test(e)) return 'auth'
  if (/\b402\b|insufficient (credits|balance|quota)|billing/i.test(e)) return 'credits'
  if (/\b429\b|rate.?limit/i.test(e)) return 'rateLimit'
  if (/\b404\b|model_not_found|does not exist|no endpoints found/i.test(e)) return 'notFound'
  if (/quá thời gian|timed? ?out|timeout/i.test(e)) return 'timeout'
  return 'other'
}
