/**
 * Chọn phạm vi của kết nối dùng chung (bản vẽ 6.7, 6.7b): cả đội, hay theo phòng và từng bot. Phòng ban tính cả bot
 * tạo sau; bot ngoài (Claude Code, Codex) không có phiên dsh nên không nằm trong danh sách.
 */
import { Checkbox, Mascot, useTeam, type McpData } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'

type T = PageProps['t']
export type Scope = NonNullable<McpData['scope']>

export const ALL_SCOPE: Scope = { bots: 'all' }

const toggle = (list: readonly string[], id: string, on: boolean) =>
  on ? [...new Set([...list, id])] : list.filter((x) => x !== id)

export function ScopePicker({ t, value, onChange }: { t: T; value: Scope; onChange: (next: Scope) => void }) {
  const team = useTeam()
  const all = value.bots === 'all'
  const bots = value.bots === 'all' ? [] : value.bots
  const departments = value.departments ?? []
  const set = (next: { bots?: string[]; departments?: string[] }) => {
    const deps = next.departments ?? departments
    onChange({ bots: next.bots ?? bots, ...(deps.length ? { departments: deps } : {}) })
  }
  return (
    <div className="ap-sc">
      <div className="ap-seg" role="tablist" aria-label={t('conn.scope')}>
        <button
          type="button"
          role="tab"
          aria-selected={all}
          className={all ? 'on' : ''}
          onClick={() => onChange(ALL_SCOPE)}
        >
          {t('conn.scopeAll')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!all}
          className={!all ? 'on' : ''}
          onClick={() => all && onChange({ bots: [] })}
        >
          {t('conn.scopePick')}
        </button>
      </div>
      {!all && (
        <>
          {team.departments.length > 0 && (
            <div className="ap-sc-group">
              <span className="a-muted ap-sc-h">{t('conn.scopeDepts')}</span>
              <div className="ap-sc-chips">
                {team.departments.map((d) => (
                  <label key={d.id} className={departments.includes(d.id) ? 'ap-sc-chip on' : 'ap-sc-chip'}>
                    <input
                      type="checkbox"
                      checked={departments.includes(d.id)}
                      onChange={(e) => set({ departments: toggle(departments, d.id, e.target.checked) })}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="ap-sc-group">
            <span className="a-muted ap-sc-h">{t('conn.scopeBots')}</span>
            <div className="ap-sc-bots">
              {team.bots
                .filter((b) => !b.external)
                .map((b) => (
                  <Checkbox
                    key={b.id}
                    checked={bots.includes(b.id)}
                    onChange={(on) => set({ bots: toggle(bots, b.id, on) })}
                    label={
                      <span className="ap-sc-bot">
                        <Mascot id={b.mascot} accessory={b.accessory} size={22} />
                        {b.name}
                      </span>
                    }
                  />
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
