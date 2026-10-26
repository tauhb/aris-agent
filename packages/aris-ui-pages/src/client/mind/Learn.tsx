/**
 * Trang Tự học (`learn`): ba tab Hộp duyệt, Ký ức, Thư viện skill, mỗi tab dùng lại trang hiện có. Các trang đó vẫn mở
 * được riêng (`approvals`, `memory`, `skills`) từ nơi khác.
 */
import { Tabs, useInboxCount } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Approvals } from './Approvals.js'
import { Memory } from './Memory.js'
import { Skills } from './Skills.js'

type Tab = 'inbox' | 'memory' | 'skills'
const TABS: readonly Tab[] = ['inbox', 'memory', 'skills']
const tabOf = (v: string | undefined): Tab => TABS.find((x) => x === v) ?? 'inbox'

export function Learn(props: PageProps) {
  const { t, params } = props
  const [tab, setTab] = useState<Tab>(tabOf(params.tab))
  useEffect(() => setTab(tabOf(params.tab)), [params])
  // Số việc chờ duyệt: mọi thứ trong Hộp duyệt, cùng số với mục Tự học ở thanh bên.
  const pending = useInboxCount()
  const label = (id: Tab) =>
    id === 'inbox' && pending > 0 ? `${t('lr.tab.inbox')} · ${pending}` : t(`lr.tab.${id}`)
  return (
    <div className="ap-lr">
      <header className="ap-lr-head">
        <h1>{t('lr.title')}</h1>
        <Tabs
          label={t('lr.tabs')}
          value={tab}
          onChange={setTab}
          tabs={TABS.map((id) => ({ value: id, label: label(id) }))}
        />
      </header>
      <div className="ap-lr-body">
        {tab === 'inbox' && <Approvals {...props} />}
        {tab === 'memory' && <Memory {...props} />}
        {tab === 'skills' && <Skills {...props} />}
      </div>
    </div>
  )
}

export const LEARN_CSS = `
.ap-lr{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--a-bg)}
.ap-lr-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:0 24px;width:100%;box-sizing:border-box;border-bottom:1px solid var(--a-line);flex:none;flex-wrap:wrap}
.ap-lr-head h1{margin:0;font-size:16px;font-weight:600;padding:12px 0}
.ap-lr-head .a-tabs{border-bottom:0;margin-left:auto}
.ap-lr-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.ap-lr-body>.a-page{min-height:0}
`
