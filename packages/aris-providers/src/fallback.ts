/**
 * Dự phòng giữa các nhà cung cấp và đổi khoá khi một lần gọi model lỗi (đặc tả:
 * docs/specs/aris-providers.md, bước 6). Móc vào `agent/request-error` (quyết định) và
 * `agent/request` (đổi provider/model của lần gọi kế tiếp, kể cả lần thử lại).
 */
import type { Link } from './domain.js'
import type { KeyPools } from './keys.js'

export interface Failure {
  code: string
  message: string
  status?: number
}

/**
 * - `key`: khoá hỏng hoặc hết hạn mức → đổi khoá, hết khoá thì chuyển ngay.
 * - `rate`: giới hạn tốc độ → đổi khoá, hết khoá thì để dsh thử lại rồi mới chuyển.
 * - `transient`: lỗi tạm → để dsh thử lại rồi mới chuyển.
 * - `missing`: model không có (404) hoặc không nhận nổi yêu cầu cỡ này (413) → chuyển ngay.
 * - `overflow`: tràn ngữ cảnh (hoặc nhà cung cấp gắn nhãn vậy cho giới hạn token mỗi phút) → để dsh
 *   nén trước, không được mới chuyển.
 * - `pass`: không phải việc của dự phòng (yêu cầu sai, ảnh quá lớn…).
 */
export type Kind = 'key' | 'rate' | 'transient' | 'missing' | 'overflow' | 'pass'

export function classify(f: Failure): Kind {
  if (['AUTH', 'QUOTA', 'ACCOUNT_QUOTA'].includes(f.code) || [401, 402, 403].includes(f.status ?? 0))
    return 'key'
  if (f.code === 'RATE_LIMIT' || f.status === 429) return 'rate'
  if (['SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'].includes(f.code)) return 'transient'
  if (f.status === 404 || f.status === 413) return 'missing'
  if (f.code === 'CONTEXT_WINDOW_EXCEEDED') return 'overflow'
  return 'pass'
}

export const linkKey = (l: Link) => `${l.provider}\n${l.model}`
export const sameLink = (a: Link, b: Link) => a.provider === b.provider && a.model === b.model

/** Mắt xích kế tiếp: sau model đang lỗi trong chuỗi, hoặc từ đầu chuỗi nếu nó không có trong chuỗi. */
export async function nextLink(
  chain: readonly Link[],
  current: Link,
  failed: ReadonlySet<string>,
  fits: (l: Link) => Promise<boolean>,
): Promise<Link | undefined> {
  const at = chain.findIndex((l) => sameLink(l, current))
  for (const l of chain.slice(at + 1)) {
    if (sameLink(l, current) || failed.has(linkKey(l))) continue
    if (await fits(l)) return l
  }
  return undefined
}

interface TurnState {
  turn: number
  /** Model của lần gọi đầu lượt (trước khi chuyển). */
  origin?: Link
  override?: Link
  failed: Set<string>
  /** Khoá đã thử của mỗi provider trong bước hiện tại. */
  keys: Map<string, Set<number>>
  step: number
}

export interface RouterDeps {
  chain(): readonly Link[]
  pools: KeyPools
  /** Mắt xích có chứa nổi ngữ cảnh hiện tại của phiên không. */
  fits(sessionId: string, l: Link): Promise<boolean>
  /** Đã chuyển: ghi log phiên, báo trong phiên. */
  switched(sessionId: string, from: Link, to: Link, f: Failure): void
  /** Phiên vừa chuyển ở lượt `turn`: nhớ để lượt sau trả về model cũ. */
  remember(sessionId: string, rec: { from: Link; to: Link; turn: number } | undefined): Promise<void>
  recall(sessionId: string): { from: Link; to: Link; turn: number } | undefined
  /** Model riêng của bot cho phiên được giao việc (thành viên đội); không có thì theo phiên. */
  botModel?(sessionId: string): Link | undefined
  /** Model của bot khi phiên đang chạy /goal (thắng model riêng). */
  goalModel?(sessionId: string): Link | undefined
  /** Dự phòng riêng của bot: thử trước chuỗi dự phòng chung. */
  botFallback?(sessionId: string): Link | undefined
  logger?: { info(fmt: string, ...a: unknown[]): void }
}

type Config = { provider: string; model: string; reasoningEffort?: unknown } & Record<string, unknown>

export class Router {
  private turns = new Map<string, TurnState>()
  /** Phiên đang hoặc vừa chạy /goal: model trước đó và model /goal (dsh giữ model vừa dùng cho phiên). */
  private goals = new Map<string, { origin: Link; goal: Link }>()

  constructor(private d: RouterDeps) {}

  private state(sessionId: string, turn: number, step: number): TurnState {
    let s = this.turns.get(sessionId)
    if (!s || s.turn !== turn) {
      s = { turn, failed: new Set(), keys: new Map(), step }
      this.turns.set(sessionId, s)
    }
    if (s.step !== step) {
      s.step = step
      s.keys.clear()
    }
    return s
  }

  /** `agent/request`: cấu hình lần gọi sắp tới. */
  async request(sessionId: string, turn: number, step: number, resolved: Config): Promise<Config> {
    const s = this.state(sessionId, turn, step)
    const goal = this.d.goalModel?.(sessionId)
    const was = this.goals.get(sessionId)
    if (goal) {
      if (!sameLink(resolved, goal)) {
        this.goals.set(sessionId, { origin: { provider: resolved.provider, model: resolved.model }, goal })
        resolved = withLink(resolved, goal)
      }
    } else if (was) {
      // /goal đã xong: phiên còn giữ model /goal thì trả về model trước đó.
      this.goals.delete(sessionId)
      if (sameLink(resolved, was.goal)) resolved = withLink(resolved, was.origin)
    }
    const own = goal ? undefined : this.d.botModel?.(sessionId)
    if (own && !sameLink(resolved, own)) resolved = withLink(resolved, own)
    s.origin ??= { provider: resolved.provider, model: resolved.model }
    if (s.override) return withLink(resolved, s.override)
    // Lượt mới: phiên không có model chọn thì header còn giữ model dự phòng; trả về model cũ.
    const back = this.d.recall(sessionId)
    if (back && back.turn < turn) {
      await this.d.remember(sessionId, undefined)
      if (sameLink(resolved, back.to)) {
        s.origin = back.from
        return withLink(resolved, back.from)
      }
    }
    return resolved
  }

  /** `agent/request-error`: trả `retry` khi đã đổi khoá hoặc chuyển model; không thì `next()`. */
  async error(
    sessionId: string,
    turn: number,
    step: number,
    provider: string,
    model: string,
    f: Failure,
    next: () => Promise<{ kind: 'retry' } | undefined>,
  ): Promise<{ kind: 'retry' } | undefined> {
    const s = this.state(sessionId, turn, step)
    const kind = classify(f)
    if (kind === 'pass') return next()
    const current: Link = s.override ?? { provider, model }

    if (kind === 'key' || kind === 'rate') {
      let tried = s.keys.get(current.provider)
      if (!tried) s.keys.set(current.provider, (tried = new Set()))
      const slot = await this.d.pools.rotate(current.provider, tried, f.code)
      if (slot !== undefined) {
        this.d.logger?.info('%s: đổi sang khoá %d (%s)', current.provider, slot, f.code)
        return { kind: 'retry' }
      }
    }
    if (kind === 'rate' || kind === 'transient' || kind === 'overflow') {
      const r = await next()
      if (r?.kind === 'retry') return r
    }

    s.failed.add(linkKey(current))
    const own = this.d.botFallback?.(sessionId)
    const ownOk =
      own && !sameLink(own, current) && !s.failed.has(linkKey(own)) && (await this.d.fits(sessionId, own))
    const to = ownOk
      ? own
      : await nextLink(this.d.chain(), current, s.failed, (l) => this.d.fits(sessionId, l))
    if (!to) return kind === 'key' || kind === 'missing' ? next() : undefined
    s.override = to
    const from = s.origin ?? current
    await this.d.remember(sessionId, { from, to, turn })
    this.d.switched(sessionId, current, to, f)
    return { kind: 'retry' }
  }

  forget(sessionId: string) {
    this.turns.delete(sessionId)
  }
}

/** Đổi provider/model; bỏ mức suy luận kế thừa vì model mới có thể không nhận mức đó. */
function withLink(c: Config, l: Link): Config {
  const rest = { ...c }
  delete rest.reasoningEffort
  return { ...rest, provider: l.provider, model: l.model }
}
