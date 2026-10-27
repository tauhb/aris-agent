import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { McpOAuth, OAuthFlowError, OAuthLoginNeeded, oauthRef, type KeyPort } from './mcp-oauth.js'

const SERVER = 'https://mcp.example.com/mcp'
const ISSUER = 'https://auth.example.com'
const REDIRECT = 'http://127.0.0.1:7777/api/aris/mcp/oauth/callback'

/**
 * Máy chủ uỷ quyền giả (không gọi mạng): metadata tài nguyên được bảo vệ, metadata máy chủ uỷ quyền, đăng ký client
 * động, trang đăng nhập (giả lập người dùng bấm đồng ý), cấp và làm mới token, kiểm PKCE S256.
 */
class FakeAuth {
  registered: { client_id: string; redirect_uris: string[] }[] = []
  tokenCalls: Record<string, string>[] = []
  allowRegister = true
  refreshOk = true
  expiresIn = 3600
  private challenges = new Map<string, string>()
  private n = 0
  log: string[] = []

  fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    this.log.push(`${method} ${url.origin}${url.pathname}`)
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (
      url.origin === 'https://mcp.example.com' &&
      url.pathname.startsWith('/.well-known/oauth-protected-resource')
    )
      return json({ resource: SERVER, authorization_servers: [ISSUER] })
    if (url.origin === ISSUER && url.pathname.startsWith('/.well-known/oauth-authorization-server'))
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        ...(this.allowRegister ? { registration_endpoint: `${ISSUER}/register` } : {}),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      })
    if (url.origin === ISSUER && url.pathname === '/register' && method === 'POST') {
      const meta = JSON.parse(String(init?.body)) as { redirect_uris: string[] }
      const client = { client_id: `dyn-${++this.n}`, redirect_uris: meta.redirect_uris }
      this.registered.push(client)
      return json(client, 201)
    }
    if (url.origin === ISSUER && url.pathname === '/token' && method === 'POST') {
      const p = Object.fromEntries(new URLSearchParams(String(init?.body)))
      this.tokenCalls.push(p)
      if (p.grant_type === 'authorization_code') {
        const challenge = this.challenges.get(p.code ?? '')
        const got = createHash('sha256')
          .update(p.code_verifier ?? '')
          .digest('base64url')
        if (!challenge || challenge !== got)
          return json({ error: 'invalid_grant', error_description: 'PKCE sai' }, 400)
        this.challenges.delete(p.code!)
        return json({
          access_token: `at-${++this.n}`,
          token_type: 'Bearer',
          expires_in: this.expiresIn,
          refresh_token: `rt-${this.n}`,
        })
      }
      if (p.grant_type === 'refresh_token') {
        if (!this.refreshOk) return json({ error: 'invalid_grant' }, 400)
        return json({
          access_token: `at-${++this.n}`,
          token_type: 'Bearer',
          expires_in: this.expiresIn,
          refresh_token: `rt-${this.n}`,
        })
      }
    }
    return new Response('not found', { status: 404 })
  }

  /** Người dùng mở trang đăng nhập và đồng ý: hãng trả về địa chỉ gọi về có `code`, `state`. */
  approve(authUrl: string): URLSearchParams {
    const u = new URL(authUrl)
    expect(u.origin + u.pathname).toBe(`${ISSUER}/authorize`)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT)
    const code = `code-${++this.n}`
    this.challenges.set(code, u.searchParams.get('code_challenge')!)
    return new URLSearchParams({ code, state: u.searchParams.get('state')! })
  }
}

function setup(over: Partial<{ redirect: string | undefined }> = {}) {
  const fake = new FakeAuth()
  const keys = new Map<string, string>()
  const port: KeyPort = {
    resolve: async (r) => keys.get(r),
    set: async (r, v) => void keys.set(r, v),
    unset: async (r) => void keys.delete(r),
  }
  const clock = { t: 1_800_000_000_000 }
  const oauth = new McpOAuth({
    keys: port,
    redirectUrl: () => ('redirect' in over ? over.redirect : REDIRECT),
    fetchFn: fake.fetchFn,
    now: () => clock.t,
  })
  return { fake, keys, oauth, clock }
}

const TARGET = { id: 'm-abc123', url: SERVER }

describe('đăng nhập OAuth cho MCP hosted', () => {
  it('tìm metadata, đăng ký client động, PKCE S256, đổi mã lấy token, cất vào kho khoá', async () => {
    const s = setup()
    const r = await s.oauth.begin(TARGET)
    expect('authUrl' in r).toBe(true)
    expect(s.fake.registered).toHaveLength(1)
    expect(s.fake.registered[0]!.redirect_uris).toEqual([REDIRECT])
    const q = s.fake.approve((r as { authUrl: string }).authUrl)
    expect(await s.oauth.finish(q)).toBe(TARGET.id)
    const saved = JSON.parse(s.keys.get(oauthRef(TARGET.id))!) as { tokens: { access_token: string } }
    expect(saved.tokens.access_token).toMatch(/^at-/)
    expect(await s.oauth.token(TARGET)).toBe(saved.tokens.access_token)
    expect(oauthRef('m-abc123')).toBe('MCP_M_ABC123_OAUTH')
  })

  it('có Client ID / Secret riêng thì không đăng ký động, gửi secret khi đổi mã', async () => {
    const s = setup()
    s.fake.allowRegister = false
    const target = { ...TARGET, clientId: 'my-app', clientSecret: 'shh' }
    const r = (await s.oauth.begin(target)) as { authUrl: string }
    expect(new URL(r.authUrl).searchParams.get('client_id')).toBe('my-app')
    expect(s.fake.registered).toHaveLength(0)
    await s.oauth.finish(s.fake.approve(r.authUrl))
    const call = s.fake.tokenCalls.at(-1)!
    expect(call.client_id).toBe('my-app')
    expect(call.client_secret).toBe('shh')
    // Client ID / Secret của người dùng không bị chép vào kho khoá OAuth.
    expect(s.keys.get(oauthRef(TARGET.id))).not.toContain('shh')
  })

  it('hãng không cho đăng ký động mà không có Client ID: báo rõ cách làm', async () => {
    const s = setup()
    s.fake.allowRegister = false
    const e = await s.oauth.begin(TARGET).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(OAuthFlowError)
  })

  it('state: lạ, dùng lại, hay hết hạn đều bị từ chối', async () => {
    const s = setup()
    const r = (await s.oauth.begin(TARGET)) as { authUrl: string }
    const q = s.fake.approve(r.authUrl)
    const bad = new URLSearchParams(q)
    bad.set('state', 'khong-phai')
    await expect(s.oauth.finish(bad)).rejects.toBeInstanceOf(OAuthFlowError)
    await s.oauth.finish(q)
    // Dùng lại đúng state đó lần nữa: không còn hiệu lực.
    await expect(s.oauth.finish(q)).rejects.toThrow(/không còn hiệu lực/)
    // Hết hạn sau 10 phút.
    const r2 = (await s.oauth.begin(TARGET)) as { authUrl: string }
    const q2 = s.fake.approve(r2.authUrl)
    s.clock.t += 11 * 60_000
    await expect(s.oauth.finish(q2)).rejects.toThrow(/không còn hiệu lực/)
  })

  it('người dùng bấm từ chối ở trang của hãng', async () => {
    const s = setup()
    const r = (await s.oauth.begin(TARGET)) as { authUrl: string }
    const state = new URL(r.authUrl).searchParams.get('state')!
    await expect(
      s.oauth.finish(
        new URLSearchParams({ state, error: 'access_denied', error_description: 'người dùng huỷ' }),
      ),
    ).rejects.toThrow(/người dùng huỷ/)
  })

  it('token sắp hết hạn thì làm mới bằng refresh token', async () => {
    const s = setup()
    const r = (await s.oauth.begin(TARGET)) as { authUrl: string }
    await s.oauth.finish(s.fake.approve(r.authUrl))
    const first = await s.oauth.token(TARGET)
    s.clock.t += 3600_000 - 30_000
    const second = await s.oauth.token(TARGET)
    expect(second).not.toBe(first)
    expect(s.fake.tokenCalls.at(-1)!.grant_type).toBe('refresh_token')
    // Token mới cũng cất vào kho khoá.
    expect(s.keys.get(oauthRef(TARGET.id))).toContain(second)
  })

  it('hết hạn mà làm mới không được: "Cần đăng nhập lại"', async () => {
    const s = setup()
    const r = (await s.oauth.begin(TARGET)) as { authUrl: string }
    await s.oauth.finish(s.fake.approve(r.authUrl))
    s.fake.refreshOk = false
    s.clock.t += 2 * 3600_000
    await expect(s.oauth.token(TARGET)).rejects.toBeInstanceOf(OAuthLoginNeeded)
  })

  it('chưa đăng nhập thì token() báo cần đăng nhập; forget xoá khỏi kho khoá', async () => {
    const s = setup()
    await expect(s.oauth.token(TARGET)).rejects.toBeInstanceOf(OAuthLoginNeeded)
    const r = (await s.oauth.begin(TARGET)) as { authUrl: string }
    await s.oauth.finish(s.fake.approve(r.authUrl))
    expect(await s.oauth.hasToken(TARGET.id)).toBe(true)
    await s.oauth.forget(TARGET.id)
    expect(s.keys.has(oauthRef(TARGET.id))).toBe(false)
  })

  it('không có web aris để nhận lời gọi về: báo lỗi rõ', async () => {
    const s = setup({ redirect: undefined })
    await expect(s.oauth.begin(TARGET)).rejects.toThrow(/giao diện web/)
  })
})
