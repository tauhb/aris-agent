import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { G9_THEMES } from '@aris/ui-kit'
import type { RosterRow, RosterV2 } from '@aris/ui-kit/react'
import { G9_CSS } from '../../../aris-ui-kit/src/react/css-v2.js'
import { EN, VI, type Translate } from './locale.js'
import { RosterListV2 } from './SidebarV2.js'

const t: Translate = (key, params) =>
  VI[key].replace(/\{(\w+)\}/g, (_, k: string) => (k === 'you' ? 'anh' : String(params?.[k] ?? '')))

const row = (id: string, extra: Partial<RosterRow> = {}): RosterRow => ({
  id,
  name: id.toUpperCase(),
  mascot: id,
  color: '#000',
  dot: null,
  line: 'Vai ' + id,
  needs: 0,
  ...extra,
})

const roster: RosterV2 = {
  pinned: row('aris'),
  groups: [
    {
      id: 'kd',
      label: 'Kinh doanh',
      rows: [row('mai', { dot: 'need', needs: 2, line: '' }), row('ha', { line: 'Đã lọc 214 khách' })],
    },
    { id: 'nd', label: 'Nội dung', rows: [row('lam', { dot: 'run', line: 'Viết bài 2 trên 3' })] },
  ],
}

const html = (current?: string, collapsed: string[] = []) =>
  renderToStaticMarkup(
    <RosterListV2
      roster={roster}
      t={t}
      current={current}
      collapsed={new Set(collapsed)}
      onToggle={() => {}}
      onOpen={() => {}}
    />,
  )

describe('thanh bên GĐ9', () => {
  it('có Aris, tiêu đề phòng, chấm và dòng việc cùng màu trạng thái', () => {
    const out = html()
    expect(out).toContain('ARIS')
    expect(out).toContain('Kinh doanh')
    expect(out).toContain('g9-dot need')
    expect(out).toContain('Cần anh duyệt 2 việc')
    expect(out).toContain('class="l run"')
    expect(out).toContain('Viết bài 2 trên 3')
  })

  it('dòng của bot đang chat được đánh dấu', () => {
    expect(html('lam')).toMatch(/aria-current="true"[^>]*aria-label="LAM/)
  })

  it('phòng đã gập không còn dòng bot', () => {
    const out = html(undefined, ['kd'])
    expect(out).toContain('aria-expanded="false"')
    expect(out).not.toContain('MAI')
    expect(out).toContain('LAM')
  })

  it('chữ mới đủ hai thứ tiếng', () => {
    for (const k of Object.keys(EN).filter((k) => k.startsWith('v2.'))) expect(VI).toHaveProperty(k)
  })

  it('CSS GĐ9 chỉ dùng biến có trong bảng màu', () => {
    const used = [...G9_CSS.matchAll(/var\(--g9-([\w-]+)/g)].map((m) => m[1]!)
    expect(used.length).toBeGreaterThan(0)
    for (const name of used)
      if (name !== 'drawer-left') expect(Object.keys(G9_THEMES.dark), name).toContain(name)
  })
})
