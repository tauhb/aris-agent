/**
 * Nhánh giao việc cho bot ngoài (bản vẽ 2.1c `GiaoBotNgoai.dc.html`): đã nhận, đang làm bao lâu (bot
 * ngoài không báo từng bước) kèm nút Dừng, rồi xong với kết quả hoặc vấp với lý do.
 */
import { BranchStep, Button, TaskBranch, stopExternalRun, useExternalRun } from '@aris/ui-kit/react'
import { useState } from 'react'
import { branchBot, type DispatchItem } from './branch.js'
import type { Translate } from './locale.js'

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000))
/** Dòng đầu của lời báo lỗi an toàn, bỏ phần mã kỹ thuật trong ngoặc. */
const reasonOf = (d: string | undefined) => d?.split('\n')[0]?.trim()

export function ExternalBranch({ t, item }: { t: Translate; item: DispatchItem }) {
  const run = useExternalRun(item.externalRun)
  const [open, setOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const bot = branchBot(item.handle, item.handle)
  const n = run ? minutes(run.elapsedMs) : 0
  const tag = run ? t('ext.tag', { agent: t(`ext.agent.${run.agent}`) }) : undefined
  const output = run?.output ?? ''
  const long = output.length > 420
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
            disabled={stopping}
            onClick={() => {
              setStopping(true)
              void stopExternalRun(run.id)
            }}
          >
            {t('ext.stop')}
          </Button>
        )
      }
    >
      <BranchStep status="done" label={t('status.done')}>
        {run?.worktree ? t('ext.receivedWorktree', { branch: run.worktree.branch }) : t('ext.received')}
      </BranchStep>
      {(!run || run.status === 'running') && (
        <BranchStep status="working" label={t('status.working')}>
          {t('ext.running', { n })}
        </BranchStep>
      )}
      {run?.status === 'done' && (
        <BranchStep status="done" label={t('status.done')}>
          {t('ext.done', { n })}
        </BranchStep>
      )}
      {run?.status === 'failed' && (
        <BranchStep status="failed" label={t('status.failed')}>
          {reasonOf(run.diagnostic)
            ? t('ext.failed', { n, reason: reasonOf(run.diagnostic) })
            : t('ext.failedNoReason', { n })}
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
