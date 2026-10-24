/**
 * Bot ngoài (bước 4, `@aris/commander`): plugin chính thức của dsh đã cài chưa, đã đăng nhập agent
 * trên máy chưa, bot ngoài nào sẵn sàng; một lần chạy của bot ngoài và nút Dừng.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ExternalAgent } from './team.js'

/** Gói plugin chính thức của dsh cho từng loại agent. */
export const EXTERNAL_PACKAGES: Record<ExternalAgent, string> = {
  'claude-code': '@deepseek-ai/dsh-subagent-claude-code',
  codex: '@deepseek-ai/dsh-subagent-codex',
  acp: '@deepseek-ai/dsh-subagent-acp',
}

/** Mức quyền của từng plugin, theo thứ tự trong hộp Thêm bot ngoài. */
export const EXTERNAL_PERMISSIONS: Record<ExternalAgent, readonly string[]> = {
  'claude-code': ['manual', 'acceptEdits', 'dontAsk', 'plan', 'bypassPermissions'],
  codex: ['ask', 'approve-for-me', 'never', 'dangerously-bypass-approvals-and-sandbox'],
  acp: ['reject', 'allow'],
}
export const DEFAULT_PERMISSION: Record<ExternalAgent, string> = {
  'claude-code': 'manual',
  codex: 'ask',
  acp: 'reject',
}
/** Mức chỉ có khi aris tự chạy CLI trên máy (hỏi người dùng). */
export const CLI_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(['manual', 'ask'])
export const DANGEROUS_PERMISSIONS: ReadonlySet<string> = new Set([
  'bypassPermissions',
  'dangerously-bypass-approvals-and-sandbox',
  'allow',
])

export interface ExternalStatus {
  agents: Record<
    ExternalAgent,
    {
      installed: boolean
      login: 'yes' | 'no' | 'unknown'
      /** CLI trên máy aris tự chạy được (từng bước, hỏi quyền); không có thì dùng plugin dsh. */
      cli: { path: string; version: string | null } | null
      runtime: 'cli' | 'plugin'
    }
  >
  /** Theo mã bot: plugin đã gắn chưa. */
  bots: Record<string, 'ready' | 'missing' | 'error'>
}

/** Một bước của bot ngoài trên nhánh. */
export interface ExternalStep {
  id: string
  kind: string
  target?: string
  tool?: string
  status?: 'running' | 'done' | 'failed'
  at: string
}

/** Một lần chạy của bot ngoài (nhánh 2.1c). */
export interface ExternalRun {
  id: string
  bot: string
  handle: string
  name: string
  agent: ExternalAgent
  title: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  stoppedBy?: 'user' | 'timeout' | 'restart'
  worktree?: { branch: string; dir: string }
  cwd?: string
  timeoutMin: number
  startedAt: string
  finishedAt?: string
  output?: string
  diagnostic?: string
  elapsedMs: number
  runtime?: 'cli' | 'plugin'
  steps?: ExternalStep[]
  /** Yêu cầu quyền đang chờ người dùng. */
  pending?: ExternalStep[]
  answered?: (ExternalStep & { allow: boolean; by: 'user' | 'timeout' | 'ended' })[]
  costUsd?: number
  budgetUsd?: number
  resumedFrom?: string
}

const endpoint = (query: string) => new URL(`api/aris/commander?${query}`, document.baseURI)

export async function fetchExternalStatus(): Promise<ExternalStatus | null> {
  const res = await fetch(endpoint('externals=1'), { credentials: 'same-origin' })
  return res.ok ? ((await res.json()) as ExternalStatus) : null
}

export function useExternalStatus(): [ExternalStatus | null, () => void] {
  const [status, setStatus] = useState<ExternalStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void fetchExternalStatus()
      .catch(() => null)
      .then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [tick])
  return [status, useCallback(() => setTick((n) => n + 1), [])]
}

export async function fetchExternalRun(id: string): Promise<ExternalRun | null> {
  const res = await fetch(endpoint(`external=${encodeURIComponent(id)}`), { credentials: 'same-origin' })
  return res.ok ? ((await res.json()) as { run: ExternalRun | null }).run : null
}

export async function stopExternalRun(id: string): Promise<void> {
  await fetch(endpoint(''), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'external-stop', run: id }),
  })
}

/** Trả lời một yêu cầu quyền của bot ngoài (thẻ duyệt trên nhánh). */
export async function answerApproval(id: string, allow: boolean): Promise<boolean> {
  const res = await fetch(endpoint(''), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'external-approve', id, allow }),
  })
  return res.ok
}

/** Một yêu cầu quyền đang chờ (thanh duyệt trên ô nhập của phiên giao việc). */
export type PendingApproval = ExternalStep & {
  run: string
  name: string
  bot: string
  /** Bot ngoài (lần chạy CLI) hay bot trong đội (phiên con). */
  source?: 'external' | 'member'
  /** Phiên giao việc có thanh duyệt hiện yêu cầu này. */
  parentSession?: string
  reason?: string
}

/** Yêu cầu quyền của bot đang chờ trong một phiên (`all`: mọi phiên), đọc lại mỗi 3 giây. */
export function usePendingApprovals(sessionId: string | undefined): [PendingApproval[], () => void] {
  const [list, setList] = useState<PendingApproval[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const res = await fetch(endpoint(`approvals=${encodeURIComponent(sessionId)}`), {
        credentials: 'same-origin',
      }).catch(() => null)
      const body = res?.ok ? ((await res.json()) as { approvals: PendingApproval[] }) : null
      if (!alive) return
      if (body) setList(body.approvals)
      timer = setTimeout(() => void load(), 3000)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [sessionId, tick])
  return [list, useCallback(() => setTick((n) => n + 1), [])]
}

/** Một lần chạy, đọc lại mỗi 3 giây khi còn chạy. */
export function useExternalRun(id: string | undefined): [ExternalRun | null, () => void] {
  const [run, setRun] = useState<ExternalRun | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!id) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const r = await fetchExternalRun(id).catch(() => null)
      if (!alive) return
      if (r) setRun(r)
      if (!r || r.status === 'running') timer = setTimeout(() => void load(), 2000)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [id, tick])
  return [run, useCallback(() => setTick((n) => n + 1), [])]
}
