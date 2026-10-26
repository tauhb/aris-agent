/**
 * Khối "Đội đang làm" trong bảng chat với Aris (bản vẽ `VanPhongChatAris`): hiện ngay sau tin Aris chia việc. Dữ liệu là
 * chính lần gọi `giao_viec` mà khung chat đầy đủ vẽ thành nhánh (`dispatchItems` của `@aris/ui-kit`): bot nào nhận, việc
 * gì, phiên con nào hay lần chạy của bot ngoài nào. Trạng thái từng nhánh đọc từ kết quả phiên con, lần chạy của bot ngoài
 * và danh sách yêu cầu quyền đang chờ.
 */
import { dispatchItems, type DispatchItem, type SubagentCall } from '@aris/ui-kit'
import {
  Mascot,
  answerApproval,
  branchColor,
  useExternalRun,
  type PendingApproval,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { PageProps } from '../page.js'
import { branchState, teamProgress, type BranchState, type ConvStep } from './chatModel.js'
import { useBranchResult } from './data.js'

type T = PageProps['t']

const PILL: Record<BranchState, { tone: string; key: string }> = {
  running: { tone: 'run', key: 'of.fd.st.running' },
  waiting: { tone: 'warn', key: 'of.fd.st.waiting' },
  done: { tone: 'ok', key: 'of.feed.k.done' },
  failed: { tone: 'err', key: 'of.feed.k.failed' },
}

/** Lần gọi `giao_viec` từ bước phát lại: có kết quả rồi thì pha `result`, chưa thì pha `start`. */
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

/** Một nhánh: bot, việc, trạng thái, nút theo trạng thái. */
function Branch({
  item,
  team,
  approval,
  t,
  onState,
  onChat,
  reload,
}: {
  item: DispatchItem
  team: TeamView
  approval: PendingApproval | undefined
  t: T
  onState: (state: BranchState) => void
  onChat: (bot: string, session?: string) => void
  reload: () => void
}) {
  const bot = team.bots.find((b) => b.handle === item.handle)
  const result = useBranchResult(item.externalRun ? undefined : item.sessionId)
  const [run] = useExternalRun(item.externalRun)
  const state = branchState(item, { session: result?.status, run: run?.status }, !!approval)
  // Báo trạng thái lên khối để đếm "k/n xong".
  useEffect(() => onState(state), [state, onState])
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
    <div className="ap-of-br">
      <Mascot id={mascot} size={26} accessory={bot?.accessory} />
      <div className="ap-of-fx">
        <div className="ap-of-fl">
          <span className="ap-of-np" style={{ '--c': branchColor(mascot) } as CSSProperties}>
            {bot?.name ?? `@${item.handle}`}
          </span>
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
  )
}

export function TeamBlock({
  step,
  team,
  approvals,
  t,
  onChat,
  reload,
}: {
  step: ConvStep
  team: TeamView
  approvals: readonly PendingApproval[]
  t: T
  onChat: (bot: string, session?: string) => void
  reload: () => void
}) {
  const items = useMemo(() => dispatchItems(callOfStep(step)), [step.body, step.out, step.error])
  const [states, setStates] = useState<Record<string, BranchState>>({})
  if (items.length === 0) return null
  const list = items.map((i) => states[i.handle] ?? 'running')
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
      {items.map((item) => (
        <Branch
          key={item.handle}
          item={item}
          team={team}
          approval={approvals.find(
            (a) =>
              (item.sessionId && a.run === `member:${item.sessionId}`) ||
              (item.externalRun && a.run === item.externalRun),
          )}
          t={t}
          onState={(s) => setStates((cur) => (cur[item.handle] === s ? cur : { ...cur, [item.handle]: s }))}
          onChat={onChat}
          reload={reload}
        />
      ))}
    </div>
  )
}
