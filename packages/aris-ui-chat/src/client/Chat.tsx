/**
 * Các mảnh khung chat aris cắm vào dsh: dấu Aris ở màn trống, nút "/" và "@" trong
 * ô nhập (màn 1.2), nhãn model có dấu nhà cung cấp (màn "Ngôn ngữ thiết kế mới"
 * mục 5), và nhánh "dòng việc" cho mỗi lần Aris giao việc cho bot con (màn R3).
 */
import { BranchStep, Button, IconButton, Mascot, TaskBranch } from '@aris/ui-kit/react'
import { branchBot, branchSteps, subagentArgs, subagentId, type SubagentCall } from './branch.js'
import type { Translate } from './locale.js'

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
