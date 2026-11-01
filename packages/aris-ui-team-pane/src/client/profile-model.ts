/**
 * Dữ liệu các dòng của hồ sơ bot ở khung phải (giao diện GĐ9, bản vẽ V10, V11): hàm thuần để test. Mỗi dòng
 * mở trình sửa đầy đủ đang có (trang hồ sơ bot ở đúng thẻ), 9.1 chưa viết lại các trình sửa.
 */
import type { BotData } from '@aris/ui-kit/react'

export type ProfileView = 'details' | 'library' | 'computer' | 'settings'

/** Đích khi bấm một dòng: thẻ của trang hồ sơ bot, trang khác của aris, hay việc riêng. */
export type RowTarget =
  | { kind: 'bot'; tab: 'soul' | 'model' | 'skills' | 'perms' | 'routine' }
  | { kind: 'page'; to: string; params?: Record<string, string> }
  | { kind: 'topic' }

export interface ProfileRow {
  key: string
  /** Khoá chữ của nhãn. */
  label: string
  value?: string | undefined
  target?: RowTarget
}

export interface ProfileGroup {
  key: string
  /** Khoá chữ của tiêu đề nhóm (không có thì không tiêu đề). */
  title?: string
  rows: ProfileRow[]
}

export interface ProfileExtra {
  /** Tên model hiệu lực. */
  model?: string | undefined
  routinesOn: number
  skills?: number | undefined
}

/** Một dòng tóm tắt lời dặn: bỏ xuống dòng và dấu đầu dòng markdown, cắt bằng "…". */
export function soulSummary(soul: string, max = 48): string {
  const one = soul
    .replace(/^[#>*\-\s]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

const isCommander = (bot: BotData) => bot.kind === 'commander'

/** Các nhóm dòng của một view; giá trị đã định dạng sẵn, nhãn là khoá chữ. */
export function profileGroups(bot: BotData, view: ProfileView, extra: ProfileExtra): ProfileGroup[] {
  if (view === 'details') {
    const main: ProfileGroup = {
      key: 'main',
      rows: [
        { key: 'model', label: 'pf.model', value: extra.model, target: { kind: 'bot', tab: 'model' } },
        { key: 'topic', label: 'pf.topic', target: { kind: 'topic' } },
        {
          key: 'routine',
          label: 'pf.routine',
          value: String(extra.routinesOn),
          target: { kind: 'bot', tab: 'routine' },
        },
      ],
    }
    const about: ProfileGroup = {
      key: 'about',
      rows: [
        { key: 'role', label: 'pf.role', value: bot.role || undefined, target: { kind: 'bot', tab: 'soul' } },
        { key: 'handle', label: 'pf.handle', value: `@${bot.handle}`, target: { kind: 'bot', tab: 'soul' } },
      ],
    }
    if (!isCommander(bot)) return [main, about]
    return [
      main,
      {
        key: 'lead',
        title: 'pf.lead',
        rows: [
          { key: 'manage', label: 'pf.manage', value: 'pf.yes' },
          {
            key: 'who',
            label: 'pf.whoFits',
            target: { kind: 'page', to: 'settings', params: { section: 'commander' } },
          },
        ],
      },
    ]
  }
  if (view === 'library')
    return [
      {
        key: 'lib',
        rows: [
          {
            key: 'memory',
            label: 'pf.memory',
            target: { kind: 'page', to: 'memory', params: { bot: bot.id } },
          },
          {
            key: 'skills',
            label: 'pf.skills',
            value: extra.skills === undefined ? undefined : String(extra.skills),
            target: { kind: 'bot', tab: 'skills' },
          },
          {
            key: 'brain',
            label: 'pf.brain',
            target: { kind: 'page', to: 'brain', params: { view: 'graph' } },
          },
        ],
      },
    ]
  if (view === 'settings') {
    const version = bot.soulMeta?.version
    return [
      {
        key: 'soul',
        rows: [
          {
            key: 'soul',
            label: 'pf.soul',
            value: version ? `v${version}` : soulSummary(bot.soul, 28) || undefined,
            target: { kind: 'bot', tab: 'soul' },
          },
          {
            key: 'about',
            label: 'pf.about',
            value: soulSummary(bot.description, 28) || undefined,
            target: { kind: 'bot', tab: 'soul' },
          },
        ],
      },
      {
        key: 'safety',
        title: 'pf.safety',
        rows: [
          {
            key: 'danger',
            label: 'pf.before',
            value: bot.perms?.danger === 'deny' ? 'pf.deny' : 'pf.ask',
            target: { kind: 'bot', tab: 'perms' },
          },
          { key: 'apps', label: 'pf.apps', target: { kind: 'bot', tab: 'perms' } },
          { key: 'computer', label: 'pf.where', target: { kind: 'bot', tab: 'perms' } },
        ],
      },
      {
        key: 'models',
        rows: [
          {
            key: 'fallback',
            label: 'pf.fallback',
            value: bot.models?.fallback?.model,
            target: { kind: 'bot', tab: 'model' },
          },
        ],
      },
    ]
  }
  return []
}
