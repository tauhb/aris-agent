import { ACCESSORIES } from '@aris/ui-kit'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACCESSORY_CHOICES, AccessoryPicker, chosenAccessory } from './AccessoryPicker.js'
import { TEAM_TEXT } from './text.js'

const t = (key: string) => TEAM_TEXT.vi[key as keyof typeof TEAM_TEXT.vi] ?? key
const html = (value: string | undefined, mascot = 'ha') =>
  renderToStaticMarkup(<AccessoryPicker t={t} mascot={mascot} name="Thơ" value={value} onChange={() => {}} />)

describe('chọn phụ kiện trong hồ sơ bot', () => {
  it('lưới gồm Không đeo và 22 phụ kiện', () => {
    expect(ACCESSORY_CHOICES).toHaveLength(23)
    expect(ACCESSORY_CHOICES[0]).toBe('none')
    expect(ACCESSORY_CHOICES.slice(1)).toEqual(ACCESSORIES.map((a) => a.id))
  })

  it('mỗi phụ kiện có tên đủ hai thứ tiếng', () => {
    for (const a of ACCESSORIES) {
      expect(TEAM_TEXT.en[`acc.${a.id}` as keyof typeof TEAM_TEXT.en], a.id).toBeTruthy()
      expect(TEAM_TEXT.vi[`acc.${a.id}` as keyof typeof TEAM_TEXT.vi], a.id).toBe(a.name)
    }
  })

  it('chưa lưu thì ô mặc định của dáng được chọn; none và mã đã lưu theo đó', () => {
    expect(chosenAccessory('ha', undefined)).toBe('mu-noi')
    expect(chosenAccessory('ha', 'none')).toBe('none')
    expect(chosenAccessory('ha', 'kinh')).toBe('kinh')
    expect(chosenAccessory('khong-co', undefined)).toBe('none')
  })

  it('một ô được chọn, mỗi ô có tên ở title và aria-label, chỉ ô chọn nhận Tab', () => {
    const out = html(undefined)
    expect(out.match(/role="radio"/g)).toHaveLength(23)
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(out).toContain('aria-label="Mũ nồi" title="Mũ nồi" tabindex="0"')
    expect(out.match(/tabindex="0"/g)).toHaveLength(1)
    expect(out).toContain('aria-label="Không đeo" title="Không đeo" tabindex="-1"')
  })

  it('đổi phụ kiện thì chip và ô chọn đổi theo', () => {
    const out = html('kinh')
    expect(out).toContain('<span class="ap-acc-chip">Kính tròn</span>')
    expect(out).toContain('aria-label="Kính tròn" title="Kính tròn" tabindex="0"')
  })
})
