import { describe, expect, it } from 'vitest'
import { FEED_PANEL, panelJson, parsePanel } from './panel.js'

describe('trạng thái cột phải', () => {
  it('lưu và đọc lại bảng chat với một bot, bỏ phiên', () => {
    const saved = panelJson({ view: 'chat', bot: 'b-tho', session: 's1' })
    expect(JSON.parse(saved)).toEqual({ view: 'chat', bot: 'b-tho' })
    expect(parsePanel(saved)).toEqual({ view: 'chat', bot: 'b-tho' })
  })

  it('nhật ký lưu và đọc lại là nhật ký', () => {
    expect(parsePanel(panelJson(FEED_PANEL))).toEqual(FEED_PANEL)
  })

  it('chưa lưu, hỏng hay lạ thì về nhật ký', () => {
    for (const raw of [
      null,
      '',
      'không phải JSON',
      '{"view":"chat"}',
      '{"view":"chat","bot":""}',
      '{"view":"x"}',
      '[]',
      '5',
    ])
      expect(parsePanel(raw)).toEqual(FEED_PANEL)
  })
})
