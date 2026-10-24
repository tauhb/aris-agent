/**
 * Các mảnh khung chat aris cắm vào dsh: dấu Aris ở màn trống, nút "/" và "@" trong
 * ô nhập (màn 1.2), nhãn model có dấu nhà cung cấp (màn "Ngôn ngữ thiết kế mới"
 * mục 5), và nhánh "dòng việc" cho mỗi lần Aris giao việc cho bot con (màn R3).
 */
import { BranchStep, Button, IconButton, Mascot, TaskBranch, useTeamData } from '@aris/ui-kit/react'
import {
  branchBot,
  branchSteps,
  dispatchItems,
  subagentArgs,
  subagentId,
  type SubagentCall,
} from './branch.js'
import type { BotStatus } from '@aris/ui-kit'
import type { ChatKey, Translate } from './locale.js'
import { ExternalBranch } from './External.js'

/** Dấu Aris thay con cá DeepSeek ở màn trống (`conversation.hero.brand.mark`). */
export function HeroMark({ size, className, t }: { size: number; className?: string; t: Translate }) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <Mascot id="aris" size={size} label={t('hero.mark')} />
    </span>
  )
}

/** Nút "/" (lệnh, skill) và "@" (giao việc cho bot) bên trái ô nhập (`conversation.input.left`). */
export function TriggerButtons({ insert, t }: { insert: (text: string) => void; t: Translate }) {
  return (
    <span className="aris aris-triggers">
      <IconButton label={t('input.command')} size="sm" onClick={() => insert('/')}>
        <span aria-hidden="true">/</span>
      </IconButton>
      <IconButton label={t('input.mention')} size="sm" onClick={() => insert('@')}>
        <span aria-hidden="true">@</span>
      </IconButton>
    </span>
  )
}

/** Màu dấu của vài nhà cung cấp quen; còn lại dùng màu mực. */
const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#4D6BFE',
  anthropic: '#D97757',
  openai: '#10A37F',
  google: '#4285F4',
  openrouter: '#6467F2',
}

export function providerColor(providerId: string): string {
  const key = Object.keys(PROVIDER_COLORS).find((k) => providerId.toLowerCase().includes(k))
  return key ? PROVIDER_COLORS[key]! : 'var(--dsw-alias-label-primary)'
}

/** Nhãn model: ô vuông chữ đầu nhà cung cấp + tên model; tên kỹ thuật khi rê chuột. */
export function ModelLabel({
  provider,
  model,
  t,
}: {
  provider: { id: string; name?: string }
  model: { id: string; name: string }
  t: Translate
}) {
  const providerName = provider.name ?? provider.id
  return (
    <span className="aris-model" title={t('model.title', { provider: provider.id, model: model.id })}>
      <span className="logo" aria-hidden="true" style={{ background: providerColor(provider.id) }}>
        {providerName.trim().charAt(0).toUpperCase()}
      </span>
      <span>{model.name}</span>
    </span>
  )
}

type Selector<T> = <R>(select: (value: T) => R) => R

export interface SessionList {
  readonly byId: Readonly<Record<string, { readonly running: boolean } | undefined>>
}

/** Một lần gọi `subagent` vẽ thành nhánh việc (`tool.call.toolview`, khoá `subagent`). */
export function SubagentBranch(
  props: SubagentCall & {
    callId: string
    t: Translate
    useSessions: Selector<SessionList>
    openSession: (sessionId: string) => void
  },
) {
  const { t } = props
  const call = { phase: props.phase, block: props.block } as SubagentCall
  const args = subagentArgs(call)
  const childId = subagentId(call)
  const running = props.useSessions((list) =>
    childId === undefined ? undefined : list.byId[childId]?.running,
  )
  // Theo dõi đội để nhánh đổi tên và linh vật khi đội tải xong.
  useTeamData()
  const bot = branchBot(args.agentPreset, childId ?? props.callId)
  const steps = branchSteps(call, running === undefined ? undefined : { running })
  return (
    <div className="aris aris-taskline">
      <TaskBranch
        mascot={bot.mascot}
        name={bot.name ?? t('branch.subagent')}
        task={args.description}
        meta={
          childId !== undefined && (
            <Button variant="ghost" size="sm" onClick={() => props.openSession(childId)}>
              {t('branch.open')}
            </Button>
          )
        }
      >
        {steps.map((s) => (
          <BranchStep key={s.key} status={s.status} label={t(`status.${s.status}`)}>
            {t(s.key, s.params)}
          </BranchStep>
        ))}
      </TaskBranch>
    </div>
  )
}

/** Một việc của lần giao: nhánh theo bot, bước theo phiên của bot. */
function DispatchBranch(props: {
  t: Translate
  item: ReturnType<typeof dispatchItems>[number]
  phase: SubagentCall['phase']
  useSessions: Selector<SessionList>
  openSession: (sessionId: string) => void
}) {
  const { t, item } = props
  const sid = item.sessionId
  const running = props.useSessions((list) => (sid === undefined ? undefined : list.byId[sid]?.running))
  const bot = branchBot(item.handle, item.handle)
  const steps: { status: BotStatus; key: ChatKey; params?: Record<string, unknown> }[] = item.error
    ? [{ status: 'failed', key: 'branch.failed', params: { error: item.error } }]
    : props.phase !== 'result'
      ? [{ status: 'working', key: 'branch.preparing' }]
      : [
          { status: 'done', key: 'branch.received' },
          running ? { status: 'working', key: 'branch.running' } : { status: 'done', key: 'branch.done' },
        ]
  return (
    <TaskBranch
      mascot={bot.mascot}
      name={bot.name ?? `@${item.handle}`}
      task={item.title}
      meta={
        sid !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => props.openSession(sid)}>
            {t('branch.open')}
          </Button>
        )
      }
    >
      {steps.map((s) => (
        <BranchStep key={s.key} status={s.status} label={t(`status.${s.status}`)}>
          {t(s.key, s.params)}
        </BranchStep>
      ))}
    </TaskBranch>
  )
}

/** Lần gọi `giao_viec` của Commander vẽ thành các nhánh song song, mỗi bot một nhánh. */
export function DispatchBranches(
  props: SubagentCall & {
    callId: string
    t: Translate
    useSessions: Selector<SessionList>
    openSession: (sessionId: string) => void
  },
) {
  useTeamData()
  const call = { phase: props.phase, block: props.block } as SubagentCall
  const items = dispatchItems(call)
  if (items.length === 0) return null
  return (
    <div className="aris aris-taskline">
      {items.map((item) =>
        item.externalRun ? (
          <ExternalBranch key={item.handle} t={props.t} item={item} />
        ) : (
          <DispatchBranch
            key={item.handle}
            t={props.t}
            item={item}
            phase={props.phase}
            useSessions={props.useSessions}
            openSession={props.openSession}
          />
        ),
      )}
    </div>
  )
}
