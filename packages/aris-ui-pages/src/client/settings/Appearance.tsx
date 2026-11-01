/**
 * Cài đặt › Giao diện: công tắc "Giao diện mới (GĐ9)" (thanh bên danh bạ theo phòng, đầu chat viên tên bot,
 * hồ sơ bot ở khung phải, chuông Hoạt động). Các gói đọc công tắc lúc nạp nên đổi xong thì nạp lại trang.
 */
import { Card, PageShell, SwitchRow, isUiV2, setUiV2 } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'

export function Appearance({ t }: PageProps) {
  const [on, setOn] = useState(isUiV2)
  return (
    <PageShell title={t('sec.appearance')}>
      <Card>
        <SwitchRow
          checked={on}
          label={t('ap.v2')}
          hint={t('ap.v2Hint')}
          onChange={(next) => {
            setOn(next)
            setUiV2(next)
            location.reload()
          }}
        />
      </Card>
    </PageShell>
  )
}
