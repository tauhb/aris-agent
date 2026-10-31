/**
 * Khối "Đội đang làm" trong bảng chat với Aris (bản vẽ `VanPhongChatAris`): hiện ngay sau tin Aris chia việc. Giao cho từng
 * bot (`assign_task`): dữ liệu là chính lần gọi mà khung chat đầy đủ vẽ thành nhánh (`dispatchItems` của `@aris/ui-kit`).
 * Giao cả phòng (`assign_department`): một nhánh cho trưởng nhóm, tìm theo bảng việc lớn của máy chủ (`?jobs=1`), kèm các nhánh con
 * thụt vào cho thành viên trưởng nhóm đã giao (một cấp, đọc từ các lần `assign_task` trong phiên của trưởng nhóm). Trạng
 * thái từng nhánh đọc từ kết quả phiên, lần chạy của bot ngoài và danh sách yêu cầu quyền đang chờ.
 */
import { argOf, currentToolName, dispatchItems, type DispatchItem, type SubagentCall } from '@aris/ui-kit'
import {
  Mascot,
  answerApproval,
  branchColor,
  useExternalRun,
  type PendingApproval,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import {
  branchState,
  jobState,
  matchJob,
  departmentItem,
  teamProgress,
  type BranchState,
  type ConvStep,
  type JobLike,
} from './chatModel.js'
import { useBranchResult, useConversation, useJobs } from './data.js'

type T = PageProps['t']

const PILL: Record<BranchState, { tone: string; key: string }> = {
  running: { tone: 'run', key: 'of.fd.st.running' },
  waiting: { tone: 'warn', key: 'of.fd.st.waiting' },
  done: { tone: 'ok', key: 'of.feed.k.done' },
  failed: { tone: 'err', key: 'of.feed.k.failed' },
}

/** Lần gọi `assign_task` từ bước phát lại: có kết quả rồi thì pha `result`, chưa thì pha `start`. */
export function callOfStep(step: ConvStep): SubagentCall {
  return step.out !== undefined
    ? {
        phase: 'result',
        block: {
          callId: String(step.n),
          call: { argsRaw: step.body },
          content: [{ type: 'text', text: step.out }],
          isError: !!step.error,
        },
      }
    : { phase: 'start', block: { callId: String(step.n), argsRaw: step.body } }
}

const approvalFor = (approvals: readonly PendingApproval[], item: DispatchItem) =>
  approvals.find(
    (a) =>
      (item.sessionId && a.run === `member:${item.sessionId}`) ||
      (item.externalRun && a.run === item.externalRun),
  )

/** Một nhánh: bot, việc, trạng thái, nút theo trạng thái. Nhánh trưởng nhóm có `job` và `dept`, có thể kèm nhánh con. */
function Branch({
  item,
  team,
  approvals,
  t,
  job,
  dept,
  onState,
  onChat,
  reload,
  children,
}: {
  item: DispatchItem
  team: TeamView
  approvals: readonly PendingApproval[]
  t: T
  job?: JobLike | undefined
  dept?: string | undefined
  onState?: (state: BranchState) => void
  onChat: (bot: string, session?: string) => void
  reload: () => void
  children?: ReactNode
}) {
  const bot = team.bots.find((b) => b.handle === item.handle)
  const approval = approvalFor(approvals, item)
  const result = useBranchResult(item.externalRun ? undefined : item.sessionId)
  const [run] = useExternalRun(item.externalRun)
  const state = job
    ? jobState(job, result?.status, !!approval)
    : branchState(item, { session: result?.status, run: run?.status }, !!approval)
  // Báo trạng thái lên khối để đếm "k/n xong".
  useEffect(() => onState?.(state), [state, onState])
  const [busy, setBusy] = useState(false)
  const mascot = bot?.mascot ?? bot?.id ?? 'tron'
  const pill = PILL[state]
  const task = item.title || result?.title || run?.title || ''
  const session = item.externalRun ?? item.sessionId
  const answer = async (allow: boolean) => {
    if (!approval) return
    setBusy(true)
    await answerApproval(approval.id, allow).catch(() => false)
    setBusy(false)
    reload()
  }
  return (
    <div className="ap-of-brw">
      <div className="ap-of-br">
        <Mascot id={mascot} size={26} accessory={bot?.accessory} />
        <div className="ap-of-fx">
          <div className="ap-of-fl">
            <span className="ap-of-np" style={{ '--c': branchColor(mascot) } as CSSProperties}>
              {bot?.name ?? (dept || `@${item.handle}`)}
            </span>
            {dept && bot && <span className="ap-of-sp dim">{dept}</span>}
            <span className={`ap-of-sp ${pill.tone}`}>{t(pill.key)}</span>
          </div>
          {task && <div className="ap-of-ft">{task}</div>}
          {item.error && <div className="ap-of-ft bad">{item.error}</div>}
          <div className="ap-of-fa">
            {state === 'waiting' && approval && (
              <>
                <button type="button" className="ap-of-b2" disabled={busy} onClick={() => void answer(false)}>
                  {t('of.need.reject')}
                </button>
                <button type="button" className="ap-of-b1" disabled={busy} onClick={() => void answer(true)}>
                  {t('of.need.approve')}
                </button>
              </>
            )}
            {state === 'done' && bot && session && (
              <button type="button" className="ap-of-b1" onClick={() => onChat(bot.id, session)}>
                {t('of.ch.result')}
              </button>
            )}
            {(state === 'running' || state === 'failed') && bot && session && !item.error && (
              <button type="button" className="ap-of-b2" onClick={() => onChat(bot.id, session)}>
                {t('of.fd.view')}
              </button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Nhánh con của trưởng nhóm: các việc trưởng nhóm đã giao cho thành viên (`assign_task` trong phiên của trưởng nhóm), một
 * cấp, thụt vào dưới nhánh trưởng nhóm. Đọc lại chậm khi việc lớn đã xong.
 */
function LeadKids({
  session,
  running,
  ...rest
}: {
  session: string
  running: boolean
  team: TeamView
  approvals: readonly PendingApproval[]
  t: T
  onChat: (bot: string, session?: string) => void
  reload: () => void
}) {
  const conv = useConversation(session, running ? 6000 : 60_000)
  const kids = useMemo(
    () =>
      (conv?.steps ?? [])
        .filter((s) => s.type === 'tool' && currentToolName(s.tool ?? '') === 'assign_task')
        .flatMap((s) => dispatchItems(callOfStep(s))),
    [conv],
  )
  if (kids.length === 0) return null
  return (
    <div className="ap-of-sub">
      {kids.map((item) => (
        <Branch
          key={`${item.handle}:${item.sessionId ?? item.externalRun ?? item.title}`}
          item={item}
          {...rest}
        />
      ))}
    </div>
  )
}

export function TeamBlock({
  step,
  parent,
  team,
  approvals,
  t,
  onChat,
  reload,
}: {
  step: ConvStep
  /** Phiên Aris đang xem (phiên giao việc), để tìm việc lớn của lần `assign_department`. */
  parent: string | undefined
  team: TeamView
  approvals: readonly PendingApproval[]
  t: T
  onChat: (bot: string, session?: string) => void
  reload: () => void
}) {
  const wholeDept = currentToolName(step.tool ?? '') === 'assign_department'
  const jobs = useJobs(wholeDept)
  // Mỗi nhánh gồm việc, và việc lớn (có khi là lần giao cả phòng).
  const entries = useMemo(() => {
    if (!wholeDept) return dispatchItems(callOfStep(step)).map((item) => ({ item, job: undefined }))
    const job = matchJob(step, parent, jobs ?? [])
    const leadHandle = team.bots.find((b) => b.id === job?.lead)?.handle ?? ''
    const item = departmentItem(step, job, leadHandle)
    return item ? [{ item, job }] : []
  }, [step.body, step.out, step.error, step.at, wholeDept, parent, jobs, team.bots])
  const [states, setStates] = useState<Record<string, BranchState>>({})
  if (entries.length === 0) return null
  const keyOf = (e: (typeof entries)[number]) => e.job?.id ?? (e.item.handle || e.item.title || '')
  const list = entries.map((e) => states[keyOf(e)] ?? 'running')
  const { done, total, pct } = teamProgress(list)
  return (
    <div className="ap-of-team">
      <div className="ap-of-tmh">
        <b>{t('of.ch.team')}</b>
        <span className="a-muted ap-of-sm">{t('of.ch.teamDone', { done, total })}</span>
        <span
          className="ap-of-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
      {entries.map((e) => (
        <Branch
          key={keyOf(e)}
          item={e.item}
          job={e.job}
          dept={e.job?.departmentName ?? (wholeDept ? departmentName(step) : undefined)}
          team={team}
          approvals={approvals}
          t={t}
          onState={(s) => setStates((cur) => (cur[keyOf(e)] === s ? cur : { ...cur, [keyOf(e)]: s }))}
          onChat={onChat}
          reload={reload}
        >
          {e.job && e.item.sessionId && (
            <LeadKids
              session={e.item.sessionId}
              running={e.job.status === 'running'}
              team={team}
              approvals={approvals}
              t={t}
              onChat={onChat}
              reload={reload}
            />
          )}
        </Branch>
      ))}
    </div>
  )
}

/** Tên phòng người giao gõ trong lần `assign_department` (khi chưa có bản ghi việc lớn). */
function departmentName(step: ConvStep): string | undefined {
  try {
    // Log cũ ghi tham số `phong`: đọc cả hai.
    const v = JSON.parse(step.body) as Record<string, unknown>
    const name = argOf(v, 'department', 'phong')
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}
