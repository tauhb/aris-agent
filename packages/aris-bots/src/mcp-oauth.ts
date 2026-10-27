/**
 * Đăng nhập OAuth cho máy chủ MCP hosted (GĐ8.5), theo đặc tả uỷ quyền của MCP: tìm metadata của máy chủ uỷ quyền,
 * đăng ký client động khi hãng cho (không thì dùng Client ID / Secret của ứng dụng người dùng tự tạo), PKCE, `state`,
 * làm mới token. Phần giao thức dùng hàm `auth` của `@modelcontextprotocol/client`; ở đây chỉ có nơi cất dữ liệu và
 * vòng đời một lần đăng nhập.
 *
 * Cách truyền token: `@deepseek-ai/dsh-mcp-client` 0.2.1-rc.2 không nhận `authProvider`, chỉ nhận `headers` cố định,
 * nên aris tự làm mới token mỗi lần gắn kết nối vào phiên hay kiểm tra, rồi truyền `Authorization: Bearer` qua header.
 *
 * Token, thông tin client đăng ký động: kho khoá (Keychain), tên `MCP_<mã kết nối>_OAUTH`, dạng JSON. Không vào bảng
 * kết nối, không gửi giao diện, không ghi log. Mã PKCE chỉ nằm trong bộ nhớ trong lúc chờ người dùng đăng nhập.
 */
import { randomBytes } from 'node:crypto'
import type {
  FetchLike,
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client'

export interface KeyPort {
  resolve(ref: string): Promise<string | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** Đường gọi về trên web aris. */
export const OAUTH_CALLBACK_PATH = '/api/aris/mcp/oauth/callback'

export const oauthRef = (id: string) => `MCP_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_OAUTH`

/** Một lần đăng nhập chờ người dùng quá chừng này thì bỏ. */
const PENDING_TTL_MS = 10 * 60_000
/** Token còn ít hơn chừng này thì làm mới trước. */
const REFRESH_EARLY_MS = 60_000

/** Dữ liệu cất trong kho khoá cho một kết nối. */
interface Saved {
  client?: StoredOAuthClientInformation
  tokens?: StoredOAuthTokens
  /** Lúc nhận token (ms), để tính `expires_in`. */
  savedAt?: number
}

/** Kết nối cần cho đăng nhập: mã, địa chỉ máy chủ, Client ID / Secret riêng (nếu có). */
export interface OAuthTarget {
  id: string
  url: string
  clientId?: string | undefined
  clientSecret?: string | undefined
}

/** Phải đăng nhập (lại): chưa có token, hay làm mới không được. */
export class OAuthLoginNeeded extends Error {
  constructor(message = 'cần đăng nhập lại') {
    super(message)
    this.name = 'OAuthLoginNeeded'
  }
}

/** Lỗi ở bước gọi về (state lạ, hết hạn, người dùng từ chối…). */
export class OAuthFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthFlowError'
  }
}

class Provider implements OAuthClientProvider {
  authUrl: URL | undefined
  private verifier: string | undefined

  constructor(
    private readonly saved: Saved,
    private readonly persist: () => Promise<void>,
    private readonly redirect: string,
    private readonly target: OAuthTarget,
    private readonly stateValue: string,
    private readonly now: () => number,
  ) {}

  get redirectUrl() {
    return this.redirect
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'aris',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.target.clientSecret ? 'client_secret_post' : 'none',
    }
  }

  state() {
    return this.stateValue
  }

  clientInformation(): StoredOAuthClientInformation | undefined {
    if (this.target.clientId)
      return {
        client_id: this.target.clientId,
        ...(this.target.clientSecret ? { client_secret: this.target.clientSecret } : {}),
      } as StoredOAuthClientInformation
    return this.saved.client
  }

  async saveClientInformation(info: StoredOAuthClientInformation) {
    // Client ID / Secret riêng của người dùng đã nằm trong bản ghi kết nối: không chép thêm vào kho khoá OAuth.
    if (this.target.clientId) return
    this.saved.client = info
    await this.persist()
  }

  tokens() {
    return this.saved.tokens
  }

  async saveTokens(tokens: StoredOAuthTokens) {
    this.saved.tokens = tokens
    this.saved.savedAt = this.now()
    await this.persist()
  }

  redirectToAuthorization(url: URL) {
    this.authUrl = url
  }

  saveCodeVerifier(v: string) {
    this.verifier = v
  }

  codeVerifier() {
    if (!this.verifier) throw new OAuthFlowError('mất mã PKCE: bắt đầu đăng nhập lại')
    return this.verifier
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'tokens') delete this.saved.tokens
    if (scope === 'all' || scope === 'client') delete this.saved.client
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined
    await this.persist()
  }
}

export interface OAuthDeps {
  keys: KeyPort
  /** Địa chỉ gọi về đầy đủ (`<web aris>/api/aris/mcp/oauth/callback`); không có web thì không đăng nhập được. */
  redirectUrl: () => string | undefined
  fetchFn?: FetchLike
  now?: () => number
}

export class McpOAuth {
  private readonly pending = new Map<string, { target: OAuthTarget; provider: Provider; at: number }>()
  private readonly now: () => number

  constructor(private readonly d: OAuthDeps) {
    this.now = d.now ?? Date.now
  }

  private async load(id: string): Promise<Saved> {
    const raw = await this.d.keys.resolve(oauthRef(id))
    if (!raw) return {}
    try {
      return JSON.parse(raw) as Saved
    } catch {
      return {}
    }
  }

  private provider(target: OAuthTarget, saved: Saved, redirect: string, state: string) {
    return new Provider(
      saved,
      () => this.d.keys.set(oauthRef(target.id), JSON.stringify(saved)),
      redirect,
      target,
      state,
      this.now,
    )
  }

  private redirect(): string {
    const r = this.d.redirectUrl()
    if (!r) throw new OAuthFlowError('aris chưa có giao diện web để nhận lời gọi về')
    return r
  }

  private async run(p: Provider, target: OAuthTarget, code?: string, iss?: string) {
    const { auth } = await import('@modelcontextprotocol/client')
    return auth(p, {
      serverUrl: target.url,
      ...(code ? { authorizationCode: code } : {}),
      ...(iss ? { iss } : {}),
      ...(this.d.fetchFn ? { fetchFn: this.d.fetchFn } : {}),
    })
  }

  /**
   * Bắt đầu đăng nhập: trả địa chỉ trang đăng nhập của hãng để mở trong cửa sổ mới. Đã có token còn dùng được
   * (hay làm mới được) thì trả `authorized` luôn.
   */
  async begin(target: OAuthTarget): Promise<{ authUrl: string } | { authorized: true }> {
    this.prune()
    const state = randomBytes(24).toString('base64url')
    const saved = await this.load(target.id)
    // Đăng nhập lại từ đầu: bỏ token cũ, giữ thông tin client đã đăng ký.
    delete saved.tokens
    const p = this.provider(target, saved, this.redirect(), state)
    const res = await this.run(p, target).catch((e: unknown) => {
      throw new OAuthFlowError(explainOAuth(e))
    })
    if (res === 'AUTHORIZED') return { authorized: true }
    if (!p.authUrl) throw new OAuthFlowError('máy chủ không trả trang đăng nhập')
    this.pending.set(state, { target, provider: p, at: this.now() })
    return { authUrl: p.authUrl.toString() }
  }

  /**
   * Bước gọi về: kiểm `state` (đúng lần đăng nhập đang chờ, dùng một lần, chưa hết hạn), đổi mã lấy token.
   * Trả mã kết nối.
   */
  async finish(q: URLSearchParams): Promise<string> {
    this.prune()
    const state = q.get('state') ?? ''
    const hit = this.pending.get(state)
    if (!state || !hit)
      throw new OAuthFlowError('lần đăng nhập này không còn hiệu lực (state không khớp hay đã hết hạn)')
    this.pending.delete(state)
    const err = q.get('error')
    if (err) throw new OAuthFlowError(`hãng từ chối: ${q.get('error_description') ?? err}`)
    const code = q.get('code')
    if (!code) throw new OAuthFlowError('thiếu mã đăng nhập')
    const res = await this.run(hit.provider, hit.target, code, q.get('iss') ?? undefined).catch(
      (e: unknown) => {
        throw new OAuthFlowError(explainOAuth(e))
      },
    )
    if (res !== 'AUTHORIZED') throw new OAuthFlowError('đổi mã lấy token không được')
    return hit.target.id
  }

  /**
   * Token truy cập còn dùng được; sắp hết hạn thì làm mới. Không có token, hay làm mới không được, thì ném
   * `OAuthLoginNeeded` để kết nối chuyển sang "Cần đăng nhập lại".
   */
  async token(target: OAuthTarget): Promise<string> {
    const saved = await this.load(target.id)
    const t = saved.tokens
    if (!t?.access_token) throw new OAuthLoginNeeded('chưa đăng nhập')
    const expiresAt =
      typeof t.expires_in === 'number' && saved.savedAt ? saved.savedAt + t.expires_in * 1000 : undefined
    if (expiresAt === undefined || expiresAt - REFRESH_EARLY_MS > this.now()) return t.access_token
    if (!t.refresh_token) throw new OAuthLoginNeeded('token hết hạn, không làm mới được')
    const redirect = this.d.redirectUrl() ?? 'http://127.0.0.1/'
    const p = this.provider(target, saved, redirect, randomBytes(8).toString('hex'))
    const res = await this.run(p, target).catch((e: unknown) => {
      throw new OAuthLoginNeeded(`làm mới token không được: ${explainOAuth(e)}`)
    })
    const fresh = saved.tokens?.access_token
    if (res !== 'AUTHORIZED' || !fresh) throw new OAuthLoginNeeded('làm mới token không được')
    return fresh
  }

  /** Đã có token trong kho khoá chưa (không làm mới). */
  async hasToken(id: string): Promise<boolean> {
    return !!(await this.load(id)).tokens?.access_token
  }

  /** Gỡ kết nối hay đăng xuất: xoá token và thông tin client. */
  async forget(id: string) {
    for (const [k, v] of this.pending) if (v.target.id === id) this.pending.delete(k)
    await this.d.keys.unset(oauthRef(id))
  }

  private prune() {
    for (const [k, v] of this.pending) if (this.now() - v.at > PENDING_TTL_MS) this.pending.delete(k)
  }
}

/** Lỗi OAuth thành lời ngắn; nói rõ khi hãng không nhận địa chỉ gọi về trên máy. */
export function explainOAuth(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/redirect_uri/i.test(msg))
    return `hãng không nhận địa chỉ gọi về của aris (thường do chỉ cho https hay địa chỉ đã đăng ký trước): thêm địa chỉ gọi về vào ứng dụng đã tạo ở hãng (${msg})`
  if (/registration|register/i.test(msg))
    return `hãng không cho đăng ký client tự động: tạo ứng dụng ở hãng rồi dán Client ID và Secret (${msg})`
  return msg
}

/** Trang nhỏ hiện ở cửa sổ đăng nhập sau khi gọi về: báo kết quả rồi tự đóng. */
export function callbackPage(ok: boolean, text: string): Response {
  const esc = text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const body = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>aris</title><body style="font-family:system-ui;padding:32px"><p>${esc}</p><script>${ok ? 'setTimeout(()=>window.close(),800)' : ''}</script></body></html>`
  return new Response(body, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
