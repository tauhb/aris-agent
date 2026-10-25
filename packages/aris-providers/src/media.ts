/**
 * Tạo ảnh và video (giai đoạn 5, đợt 5c; bản vẽ 6.2c, 2.2f, 1.9): danh mục model, thứ tự ưu tiên chung hay riêng
 * của bot, gọi Gemini (`/v1beta/interactions`), OpenRouter (`/api/v1/images`) và fal.ai (hàng đợi
 * `queue.fal.run`), phân loại lỗi để thử model kế tiếp. Thuần phần dựng yêu cầu, đọc kết quả, chọn chuỗi; phần gọi mạng nhận `fetch` và hàm đọc khoá từ ngoài.
 */
import type { Link } from './domain.js'
import { GOOGLE_KEY_REFS } from './embed.js'

export type MediaKind = 'image' | 'video'
export const MEDIA_KINDS = ['image', 'video'] as const

export interface MediaModel {
  kind: MediaKind
  provider: string
  model: string
  /** Giá ước tính một ảnh, hay một giây video (USD); không có là tính theo hoá đơn của nhà cung cấp. */
  usd?: number | undefined
  /** Cần bật thanh toán ở nhà cung cấp (không có gói miễn phí). */
  paid: boolean
  /** Tỉ lệ nhận được. */
  ratios: readonly string[]
  /** Video: số giây một lần tạo (để ước tính tiền). */
  seconds?: number | undefined
}

/** Giá theo trang giá của Google (10/2026) và OpenRouter. Video tính khoảng 8 giây mỗi lần tạo. */
export const MEDIA_MODELS: readonly MediaModel[] = [
  {
    kind: 'image',
    provider: 'google',
    model: 'gemini-3.1-flash-lite-image',
    usd: 0.0336,
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  {
    kind: 'image',
    provider: 'google',
    model: 'gemini-nano-banana-2.1',
    usd: 0.0336,
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    kind: 'image',
    provider: 'google',
    model: 'gemini-3.1-flash-image',
    usd: 0.067,
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    kind: 'image',
    provider: 'openrouter',
    model: 'openai/gpt-image-2',
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  {
    kind: 'image',
    provider: 'fal',
    model: 'fal-ai/flux/schnell',
    usd: 0.006,
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    kind: 'image',
    provider: 'fal',
    model: 'fal-ai/flux/dev',
    usd: 0.05,
    paid: true,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  {
    kind: 'video',
    provider: 'google',
    model: 'gemini-omni-1.1-flash',
    usd: 0.1,
    paid: true,
    ratios: ['16:9', '9:16'],
    seconds: 8,
  },
  {
    kind: 'video',
    provider: 'fal',
    model: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    usd: 0.07,
    paid: true,
    ratios: ['16:9', '9:16', '1:1'],
    seconds: 5,
  },
]

/** Giây video ước tính cho một lần tạo (Gemini không cho đặt độ dài ở lần tạo đầu). */
export const VIDEO_SECONDS = 8

export const mediaModel = (kind: MediaKind, l: Link) =>
  MEDIA_MODELS.find((m) => m.kind === kind && m.provider === l.provider && m.model === l.model)

/** Tên khoá có thể chứa khoá của nhà cung cấp. */
export const KEY_REFS: Record<string, readonly string[]> = {
  google: GOOGLE_KEY_REFS,
  openrouter: ['OPENROUTER_API_KEY'],
  fal: ['FAL_KEY'],
}

/** Nhà cung cấp chỉ dùng cho ảnh, video (không có ở trang Provider của dsh): khoá nhập ở mục Ảnh và video. */
export const MEDIA_ONLY_PROVIDERS: Record<string, { name: string; ref: string; site: string }> = {
  fal: { name: 'fal.ai', ref: 'FAL_KEY', site: 'fal.ai/dashboard/keys' },
}

// --- Chính sách -------------------------------------------------------------------------------

export interface MediaPolicy {
  /** `off`: bot không dùng; `shared`: theo thứ tự chung; `own`: danh sách riêng. */
  mode: 'off' | 'shared' | 'own'
  list?: Link[] | undefined
  /** Hết danh sách riêng thì thử tiếp thứ tự chung. */
  fallback?: boolean | undefined
  /** Trần riêng mỗi ngày (USD). */
  capUsd?: number | undefined
}

export interface MediaSettings {
  image: Link[]
  video: Link[]
  /** Trần chung mỗi ngày (USD) cho cả đội. */
  caps: { image: number; video: number }
}

export const DEFAULT_MEDIA: MediaSettings = {
  image: [
    { provider: 'google', model: 'gemini-3.1-flash-lite-image' },
    { provider: 'openrouter', model: 'openai/gpt-image-2' },
    { provider: 'fal', model: 'fal-ai/flux/dev' },
  ],
  video: [
    { provider: 'google', model: 'gemini-omni-1.1-flash' },
    { provider: 'fal', model: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video' },
  ],
  caps: { image: 1, video: 2 },
}

/** Thứ tự model bot dùng cho một loại; rỗng là bot không được dùng. */
export function chainFor(kind: MediaKind, settings: MediaSettings, policy?: MediaPolicy): Link[] {
  const shared = settings[kind]
  const mode = policy?.mode ?? 'shared'
  if (mode === 'off') return []
  if (mode === 'shared') return [...shared]
  const own = policy?.list ?? []
  if (!policy?.fallback) return [...own]
  const key = (l: Link) => `${l.provider}/${l.model}`
  const seen = new Set(own.map(key))
  return [...own, ...shared.filter((l) => !seen.has(key(l)))]
}

/** Chuẩn hoá một danh sách model gửi lên: chỉ model có trong danh mục của loại đó, bỏ trùng. */
export function cleanLinks(kind: MediaKind, v: unknown): Link[] {
  if (!Array.isArray(v)) return []
  const out: Link[] = []
  for (const x of v) {
    const l = x as Partial<Link>
    if (typeof l?.provider !== 'string' || typeof l.model !== 'string') continue
    if (!mediaModel(kind, l as Link)) continue
    if (out.some((o) => o.provider === l.provider && o.model === l.model)) continue
    out.push({ provider: l.provider, model: l.model })
  }
  return out.slice(0, 8)
}

// --- Gọi nhà cung cấp ---------------------------------------------------------------------------

export interface MediaRequest {
  kind: MediaKind
  prompt: string
  ratio?: string | undefined
  /** Số ảnh (1–4); video luôn 1. */
  count?: number | undefined
  /** Ảnh để sửa (base64). */
  image?: { mime: string; data: string } | undefined
}

export interface MediaFile {
  mime: string
  data: Uint8Array
}

export type FailKind =
  'nokey' | 'key' | 'billing' | 'money' | 'rate' | 'unsupported' | 'model' | 'network' | 'other'

export class MediaError extends Error {
  constructor(
    readonly kind: FailKind,
    message: string,
  ) {
    super(message)
  }
}

/** Lỗi nói bằng lời cho người dùng (tin trả lời và màn chat). */
export const FAIL_TEXT: Record<FailKind, string> = {
  nokey: 'chưa có khoá',
  key: 'khoá hỏng hay không có quyền',
  billing: 'chưa bật thanh toán',
  money: 'hết tiền',
  rate: 'đang giới hạn tốc độ',
  unsupported: 'không làm được yêu cầu này',
  model: 'không có model này',
  network: 'lỗi mạng',
  other: 'lỗi',
}

export function classifyMedia(status: number, body: unknown): MediaError {
  const b = body as { error?: { message?: unknown; status?: unknown } | string; detail?: unknown } | undefined
  const err = typeof b?.error === 'object' ? b.error : undefined
  // fal trả `{"detail": "..."}` hay `{"detail": [{"msg": "..."}]}`.
  const detail = Array.isArray(b?.detail)
    ? b.detail.map((d) => String((d as { msg?: unknown }).msg ?? '')).join('; ')
    : b?.detail
  const text = String(
    err?.message ??
      (typeof b?.error === 'string' ? b.error : undefined) ??
      detail ??
      (typeof body === 'string' ? body : `HTTP ${status}`),
  ).slice(0, 300)
  const all = `${text} ${String(err?.status ?? '')}`
  // Gói miễn phí có hạn mức 0 cho model trả phí: Google trả 429, nhưng thật ra là chưa bật thanh toán.
  if (status === 429 && /free[_ ]?tier/i.test(all)) return new MediaError('billing', text)
  if (status === 429) return new MediaError('rate', text)
  if (status === 402 || /insufficient (credits|balance|funds)|exhausted balance|user is locked/i.test(all))
    return new MediaError('money', text)
  if (/billing|paid tier|free tier|FAILED_PRECONDITION|not available.*free/i.test(all))
    return new MediaError('billing', text)
  if (status === 401 || status === 403 || /api key/i.test(all)) return new MediaError('key', text)
  if (status === 404) return new MediaError('model', text)
  if (status === 400 || status === 422) return new MediaError('unsupported', text)
  return new MediaError('other', text)
}

const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'))

/** Thân yêu cầu `interactions` của Gemini. Ảnh xin JPEG: model ảnh Gemini báo lỗi khi xin PNG. */
export function geminiBody(model: string, r: MediaRequest) {
  const input = r.image
    ? [
        { type: 'text', text: r.prompt },
        { type: 'image', mime_type: r.image.mime, data: r.image.data },
      ]
    : r.prompt
  return {
    model,
    input,
    response_format:
      r.kind === 'image'
        ? { type: 'image', mime_type: 'image/jpeg', ...(r.ratio ? { aspect_ratio: r.ratio } : {}) }
        : { type: 'video', aspect_ratio: r.ratio === '9:16' ? '9:16' : '16:9', resolution: '720p' },
    background: false,
    stream: false,
    store: false,
  }
}

/** Mọi khối ảnh hay video trong câu trả lời (tìm khắp cây JSON, khỏi phụ thuộc đúng tên bước). */
export function mediaBlocks(body: unknown, kind: MediaKind): { mime: string; data?: string; uri?: string }[] {
  const out: { mime: string; data?: string; uri?: string }[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.type === kind && (typeof o.data === 'string' || typeof o.uri === 'string')) {
      const mime = String(o.mime_type ?? o.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'))
      out.push({
        mime,
        ...(typeof o.data === 'string' ? { data: o.data } : {}),
        ...(typeof o.uri === 'string' ? { uri: o.uri } : {}),
      })
      return
    }
    for (const x of Object.values(o)) walk(x)
  }
  walk(body)
  return out
}

/** Ảnh của OpenRouter (`data[i].b64_json`) và tiền nhà cung cấp tính (`usage.cost`). */
export function openrouterFiles(body: unknown): { files: MediaFile[]; usd?: number | undefined } {
  const b = body as { data?: { b64_json?: unknown; media_type?: unknown }[]; usage?: { cost?: unknown } }
  const files = (b?.data ?? []).flatMap((d) =>
    typeof d.b64_json === 'string'
      ? [{ mime: typeof d.media_type === 'string' ? d.media_type : 'image/png', data: b64(d.b64_json) }]
      : [],
  )
  return { files, usd: typeof b?.usage?.cost === 'number' ? b.usage.cost : undefined }
}

export interface MediaDeps {
  fetch: typeof fetch
  key(ref: string): Promise<string | undefined>
  /** Chờ giữa hai lần hỏi trạng thái hàng đợi (thay được khi kiểm thử). */
  sleep?: (ms: number) => Promise<void>
}

/** Kích thước ảnh của FLUX trên fal theo tỉ lệ. */
const FAL_SIZE: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}

/** Thân yêu cầu gửi fal theo loại model. */
export function falBody(r: MediaRequest, count: number) {
  if (r.kind === 'video')
    return {
      prompt: r.prompt,
      duration: '5',
      aspect_ratio: r.ratio && ['16:9', '9:16', '1:1'].includes(r.ratio) ? r.ratio : '16:9',
    }
  return {
    prompt: r.prompt,
    image_size: FAL_SIZE[r.ratio ?? '1:1'] ?? 'square_hd',
    num_images: count,
    output_format: 'jpeg',
  }
}

/** Đường dẫn tệp trong kết quả fal: `images[].url` hay `video.url`. */
export function falUrls(body: unknown, kind: MediaKind): { url: string; mime: string }[] {
  const b = body as {
    images?: { url?: unknown; content_type?: unknown }[]
    video?: { url?: unknown; content_type?: unknown }
  }
  const list = kind === 'image' ? (b?.images ?? []) : b?.video ? [b.video] : []
  return list.flatMap((f) =>
    typeof f.url === 'string'
      ? [
          {
            url: f.url,
            mime:
              typeof f.content_type === 'string'
                ? f.content_type
                : kind === 'image'
                  ? 'image/jpeg'
                  : 'video/mp4',
          },
        ]
      : [],
  )
}

/** Gửi vào hàng đợi fal, chờ xong, lấy kết quả rồi tải tệp về. */
async function viaFal(
  d: MediaDeps,
  key: string,
  model: string,
  r: MediaRequest,
  count: number,
): Promise<MediaFile[]> {
  const auth = { authorization: `Key ${key}` }
  const sub = (await call(
    d,
    `https://queue.fal.run/${model}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify(falBody(r, count)),
    },
    60_000,
  )) as { status_url?: string; response_url?: string }
  if (!sub?.status_url || !sub.response_url) throw new MediaError('other', 'fal không trả mã yêu cầu')
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)))
  const deadline = Date.now() + (r.kind === 'video' ? 600_000 : 180_000)
  for (;;) {
    const st = (await call(d, sub.status_url, { headers: auth }, 30_000)) as {
      status?: string
      error?: unknown
    }
    if (st?.status === 'COMPLETED') {
      if (st.error) throw new MediaError('unsupported', String(st.error).slice(0, 300))
      break
    }
    if (Date.now() > deadline) throw new MediaError('network', 'fal làm quá lâu, đã thôi chờ')
    await sleep(r.kind === 'video' ? 5000 : 1500)
  }
  const out = await call(d, sub.response_url, { headers: auth }, 60_000)
  const files: MediaFile[] = []
  for (const f of falUrls(out, r.kind)) {
    let res: Response
    try {
      res = await d.fetch(f.url, { signal: AbortSignal.timeout(300_000) })
    } catch (e) {
      throw new MediaError('network', String(e))
    }
    if (!res.ok) throw new MediaError('network', `tải tệp từ fal: HTTP ${res.status}`)
    const type = res.headers.get('content-type')?.split(';')[0]
    files.push({
      mime: type && !type.includes('octet') ? type : f.mime,
      data: new Uint8Array(await res.arrayBuffer()),
    })
  }
  return files
}

async function keyOf(d: MediaDeps, provider: string): Promise<string | undefined> {
  for (const ref of KEY_REFS[provider] ?? []) {
    const k = await d.key(ref)
    if (k) return k
  }
  return undefined
}

export async function hasMediaKey(d: Pick<MediaDeps, 'key'>, provider: string): Promise<boolean> {
  return !!(await keyOf(d as MediaDeps, provider))
}

async function call(d: MediaDeps, url: string, init: RequestInit, ms: number): Promise<unknown> {
  let res: Response
  try {
    res = await d.fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    throw new MediaError('network', String(e))
  }
  const body = (await res.json().catch(() => undefined)) as unknown
  if (!res.ok) throw classifyMedia(res.status, body)
  return body
}

/** Gọi một model; trả tệp và tiền (ước tính khi nhà cung cấp không báo). */
export async function generateOne(
  d: MediaDeps,
  link: Link,
  r: MediaRequest,
): Promise<{ files: MediaFile[]; usd: number }> {
  const info = mediaModel(r.kind, link)
  if (!info) throw new MediaError('model', `chưa hỗ trợ ${link.provider}/${link.model}`)
  const key = await keyOf(d, link.provider)
  if (!key) throw new MediaError('nokey', `chưa có khoá ${link.provider}`)
  const count = r.kind === 'video' ? 1 : Math.min(4, Math.max(1, Math.round(r.count ?? 1)))
  if (link.provider === 'openrouter') {
    const body = await call(
      d,
      'https://openrouter.ai/api/v1/images',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: link.model,
          prompt: r.prompt,
          n: count,
          ...(r.ratio ? { aspect_ratio: r.ratio } : {}),
          ...(r.image ? { input_references: [`data:${r.image.mime};base64,${r.image.data}`] } : {}),
        }),
      },
      180_000,
    )
    const { files, usd } = openrouterFiles(body)
    if (!files.length) throw new MediaError('other', 'không nhận được ảnh')
    return { files, usd: usd ?? 0 }
  }
  if (link.provider === 'fal') {
    const files = await viaFal(d, key, link.model, r, count)
    if (!files.length)
      throw new MediaError('other', `không nhận được ${r.kind === 'image' ? 'ảnh' : 'video'}`)
    const unit = info.usd ?? 0
    return { files, usd: r.kind === 'video' ? unit * (info.seconds ?? 5) : unit * files.length }
  }
  // Gemini: mỗi lần gọi một ảnh; muốn nhiều ảnh thì gọi nhiều lần.
  const files: MediaFile[] = []
  for (let i = 0; i < count; i++) {
    const body = await call(
      d,
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(geminiBody(link.model, r)),
      },
      r.kind === 'video' ? 600_000 : 180_000,
    )
    const blocks = mediaBlocks(body, r.kind)
    for (const b of blocks.slice(0, 1)) {
      if (b.data) files.push({ mime: b.mime, data: b64(b.data) })
      else if (b.uri) {
        let res: Response
        try {
          res = await d.fetch(b.uri, {
            headers: { 'x-goog-api-key': key },
            signal: AbortSignal.timeout(300_000),
          })
        } catch (e) {
          throw new MediaError('network', String(e))
        }
        if (!res.ok) throw classifyMedia(res.status, await res.text().catch(() => ''))
        files.push({ mime: b.mime, data: new Uint8Array(await res.arrayBuffer()) })
      }
    }
  }
  if (!files.length) throw new MediaError('other', `không nhận được ${r.kind === 'image' ? 'ảnh' : 'video'}`)
  const unit = info.usd ?? 0
  return { files, usd: r.kind === 'video' ? unit * (info.seconds ?? VIDEO_SECONDS) : unit * files.length }
}

export interface Attempt {
  link: Link
  kind: FailKind
  message: string
}

/** Thử lần lượt theo chuỗi; trả model đã làm được và các lần thử hỏng trước đó. */
export async function generate(
  d: MediaDeps,
  chain: readonly Link[],
  r: MediaRequest,
): Promise<
  | { ok: true; link: Link; files: MediaFile[]; usd: number; tried: Attempt[] }
  | { ok: false; tried: Attempt[] }
> {
  const tried: Attempt[] = []
  for (const link of chain) {
    try {
      const out = await generateOne(d, link, r)
      return { ok: true, link, ...out, tried }
    } catch (e) {
      const m = e instanceof MediaError ? e : new MediaError('other', String(e))
      tried.push({ link, kind: m.kind, message: m.message })
    }
  }
  return { ok: false, tried }
}

/** Phần mở rộng tệp theo kiểu. */
export const extOf = (mime: string) =>
  mime.includes('jpeg')
    ? 'jpg'
    : mime.includes('webp')
      ? 'webp'
      : mime.includes('mp4')
        ? 'mp4'
        : mime.includes('webm')
          ? 'webm'
          : 'png'
