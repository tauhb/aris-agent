/**
 * Chọn bot được dùng một skill của đội (bản vẽ `ThuVienSkillDoi.dc.html`): "Cả đội" (kể cả bot tạo sau) hoặc từng
 * bot. Bot ngoài (Claude Code, Codex) không có phiên dsh nên không nằm trong danh sách.
 */
import { Button, Checkbox, Mascot, useTeamData } from '@aris/ui-kit/react'
import { useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import type { Assigned } from './skill-team.js'

type T = PageProps['t']

export function AssignPicker({
  t,
  name,
  assigned,
  busy,
  onSave,
  onCancel,
  title,
  hint,
  saveLabel,
}: {
  t: T
  name: string
  /** Thay tiêu đề, chú thích dưới danh sách bot và nhãn nút lưu (hộp cài gói của kho dựng sẵn). */
  title?: ReactNode
  hint?: ReactNode
  saveLabel?: string
  assigned: Assigned | undefined
  busy?: boolean
  onSave: (next: Assigned) => void
  onCancel: () => void
}) {
  const team = useTeamData()
  const bots = (team?.bots ?? []).filter((b) => !b.external)
  const [all, setAll] = useState(assigned === 'all')
  const [picked, setPicked] = useState<Set<string>>(new Set(Array.isArray(assigned) ? assigned : []))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(id)
    else next.delete(id)
    setPicked(next)
  }
  return (
    <div className="ap-sc-panel" onClick={(e) => e.stopPropagation()}>
      <b>{title ?? t('ski.assignTitle', { name })}</b>
      <Checkbox
        checked={all}
        onChange={setAll}
        label={
          <span>
            <b>{t('conn.scopeAll')}</b> <span className="a-muted">{t('ski.allHint')}</span>
          </span>
        }
      />
      <div className="ap-sc-bots" style={all ? { opacity: 0.45 } : undefined}>
        {bots.map((b) => (
          <Checkbox
            key={b.id}
            disabled={all}
            checked={all || picked.has(b.id)}
            onChange={(on) => toggle(b.id, on)}
            label={
              <span className="ap-sc-bot">
                <Mascot id={b.mascot} accessory={b.accessory} size={22} />
                {b.name}
              </span>
            }
          />
        ))}
      </div>
      {hint && (
        <span className="a-muted" style={{ fontSize: 12.5 }}>
          {hint}
        </span>
      )}
      <div className="ap-dfoot" style={{ border: 0, paddingTop: 0 }}>
        <Button size="sm" onClick={onCancel}>
          {t('cb.cancel')}
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => onSave(all ? 'all' : [...picked])}>
          {saveLabel ?? t('conn.save')}
        </Button>
      </div>
    </div>
  )
}
