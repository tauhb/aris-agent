/**
 * Nhánh giao việc cho bot ngoài (bản vẽ 2.1c `GiaoBotNgoai.dc.html`): đã nhận, từng bước (CLI trên
 * máy), thẻ duyệt khi bot xin quyền, chi phí trên trần, nút Dừng; xong với kết quả, vấp với lý do.
 * Bot chạy bằng plugin dsh thì không có từng bước, chỉ đang làm bao lâu.
 */
import {
  BranchStep,
  Button,
  TaskBranch,
  Mascot,
  answerApproval,
  currentTeam,
  stopExternalRun,
  useExternalRun,
  usePendingApprovals,
  type ExternalStep,
} from '@aris/ui-kit/react'
import { useState } from 'react'
import { branchBot, type DispatchItem } from './branch.js'
import type { ChatKey, Translate } from './locale.js'

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000))
const usd = (n: number) => n.toFixed(2).replace('.', ',')
/** Dòng đầu của lời báo lỗi an toàn. */
const reasonOf = (d: string | undefined) => d?.split('\n')[0]?.trim()
const SHOWN = 6

/** Chữ của một bước: "Đọc src/a.ts", "Chạy: npm test"… */
export function stepText(t: Translate, s: Pick<ExternalStep, 'kind' | 'target' | 'tool'>): string {
  return t(`ext.step.${s.kind}` as ChatKey, { target: s.target ?? '', tool: s.tool ?? s.kind })
}

export function ExternalBranch({ t, item }: { t: Translate; item: DispatchItem }) {
  const [run, reload] = useExternalRun(item.externalRun)
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const bot = branchBot(item.handle, item.handle)
  const n = run ? minutes(run.elapsedMs) : 0
  const tag = run ? t('ext.tag', { agent: t(`ext.agent.${run.agent}` as ChatKey) }) : undefined
  const output = run?.output ?? ''
  const long = output.length > 420
  const cli = run?.runtime === 'cli'
  const steps = run?.steps ?? []
  const shown = all ? steps : steps.slice(-SHOWN)
  const cost =
    run?.costUsd !== undefined
      ? run.budgetUsd
        ? t('ext.cost', { cost: usd(run.costUsd), budget: usd(run.budgetUsd) })
        : t('ext.costOnly', { cost: usd(run.costUsd) })
      : ''
  const answer = async (id: string, allow: boolean) => {
    setBusy(id)
    await answerApproval(id, allow).catch(() => false)
    setBusy(null)
    reload()
  }
  return (
    <TaskBranch
      mascot={bot.mascot}
      name={bot.name ?? `@${item.handle}`}
      task={tag ? `${tag} · ${item.title ?? ''}` : item.title}
      meta={
        run?.status === 'running' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy === 'stop'}
            onClick={() => {
              setBusy('stop')
              void stopExternalRun(run.id).then(reload)
            }}
          >
            {t('ext.stop')}
          </Button>
        )
      }
    >
      <BranchStep status="done" label={t('status.done')}>
        {run?.resumedFrom
          ? t('ext.resumed')
          : run?.worktree
            ? t('ext.receivedWorktree', { branch: run.worktree.branch })
            : t('ext.received')}
      </BranchStep>
      {steps.length > shown.length && (
        <button type="button" className="aris-ext-more" onClick={() => setAll(true)}>
          {t('ext.moreSteps', { n: steps.length - shown.length })}
        </button>
      )}
      {shown.map((s) => (
        <BranchStep
          key={s.id}
          status={s.status === 'running' ? 'working' : s.status === 'failed' ? 'failed' : 'done'}
          label={t(
            s.status === 'running'
              ? 'status.working'
              : s.status === 'failed'
                ? 'status.failed'
                : 'status.done',
          )}
        >
          {stepText(t, s)}
        </BranchStep>
      ))}
      {(run?.answered ?? [])
        .filter((a) => !a.allow && a.by !== 'ended')
        .slice(-2)
        .map((a) => (
          <BranchStep key={a.id} status="failed" label={t('status.failed')}>
            {t(a.by === 'timeout' ? 'ext.answered.timeout' : 'ext.answered.user', { what: stepText(t, a) })}
          </BranchStep>
        ))}
      {(run?.pending ?? []).map((p) => (
        <div key={p.id} className="aris-ext-ask">
          <div className="h">{t('ext.ask.title', { name: run?.name ?? bot.name ?? '' })}</div>
          <div className="what">{stepText(t, p)}</div>
          <div className="row">
            <Button
              size="sm"
              variant="primary"
              disabled={busy === p.id}
              onClick={() => void answer(p.id, true)}
            >
              {t('ext.ask.allow')}
            </Button>
            <Button size="sm" disabled={busy === p.id} onClick={() => void answer(p.id, false)}>
              {t('ext.ask.deny')}
            </Button>
            <span className="note">{t('ext.ask.expire')}</span>
          </div>
        </div>
      ))}
      {(!run || run.status === 'running') && (
        <BranchStep status="working" label={t('status.working')}>
          {cli ? t('ext.runningCli', { n }) : t('ext.running', { n })}
          {cost && ` · ${cost}`}
        </BranchStep>
      )}
      {run?.status === 'done' && (
        <BranchStep status="done" label={t('status.done')}>
          {cli ? t('ext.doneSteps', { n, steps: steps.length }) : t('ext.done', { n })}
          {cost && ` · ${cost}`}
        </BranchStep>
      )}
      {run?.status === 'failed' && (
        <BranchStep status="failed" label={t('status.failed')}>
          {reasonOf(run.diagnostic)
            ? t('ext.failed', { n, reason: reasonOf(run.diagnostic) })
            : t('ext.failedNoReason', { n })}
          {cost && ` · ${cost}`}
        </BranchStep>
      )}
      {run?.status === 'stopped' && (
        <BranchStep status="idle" label={t('status.idle')}>
          {t(`ext.stopped.${run.stoppedBy ?? 'user'}`, { n: run.timeoutMin })}
        </BranchStep>
      )}
      {run && run.status !== 'running' && (output || run.worktree) && (
        <div className="aris-ext-result">
          {output && (
            <>
              <div className="h">{t('ext.result', { name: run.name })}</div>
              <div className="x">{open || !long ? output : `${output.slice(0, 420)}…`}</div>
              {long && (
                <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
                  {open ? t('ext.less') : t('ext.more')}
                </Button>
              )}
            </>
          )}
          {run.worktree && <div className="w">{t('ext.worktreeAt', { dir: run.worktree.dir })}</div>}
        </div>
      )}
    </TaskBranch>
  )
}

/**
 * Thanh duyệt trên ô nhập (`conversation.input.dock`): yêu cầu quyền của bot ngoài và bot trong đội được giao việc từ phiên này.
 * Luôn hiện, vì nhánh giao việc nằm trong phần quá trình mà dsh gập khi lượt của Aris xong.
 */
export function ApprovalDock({ sessionId, t }: { sessionId: string; t: Translate }) {
  const [list, reload] = usePendingApprovals(sessionId)
  const [busy, setBusy] = useState<string | null>(null)
  if (!list.length) return null
  const mascotOf = (bot: string) => currentTeam().members.find((m) => m.id === bot)?.mascot ?? bot
  return (
    <div className="aris aris-ext-dock">
      {list.map((p) => (
        <div key={p.id} className="aris-ext-ask">
          <div className="h">
            <Mascot id={mascotOf(p.bot)} size={18} /> {t('ext.ask.title', { name: p.name })}
          </div>
          <div className="what">{stepText(t, p)}</div>
          <div className="row">
            <Button
              size="sm"
              variant="primary"
              disabled={busy === p.id}
              onClick={() => {
                setBusy(p.id)
                void answerApproval(p.id, true).then(() => (setBusy(null), reload()))
              }}
            >
              {t('ext.ask.allow')}
            </Button>
            <Button
              size="sm"
              disabled={busy === p.id}
              onClick={() => {
                setBusy(p.id)
                void answerApproval(p.id, false).then(() => (setBusy(null), reload()))
              }}
            >
              {t('ext.ask.deny')}
            </Button>
            <span className="note">{t('ext.ask.expire')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
