import { describe, expect, it } from 'vitest'
import { createNavStore, navigate, panelId } from './routes.js'

describe('định tuyến trang aris', () => {
  it('trang: ghi tham số, đóng hộp thoại, trả mã panel', () => {
    const store = createNavStore({ params: {}, dialog: { id: 'search', params: {} } })
    expect(navigate(store, 'bot', { id: 'lam' })).toBe('aris-bot')
    expect(store.getSnapshot()).toEqual({ params: { bot: { id: 'lam' } }, dialog: null })
  })

  it('hộp thoại: mở hộp, giữ tham số các trang, không đổi panel', () => {
    const store = createNavStore({ params: { bot: { id: 'lam' } }, dialog: null })
    let calls = 0
    store.subscribe(() => calls++)
    expect(navigate(store, 'clone-bot', { id: 'lam' })).toBeUndefined()
    expect(store.getSnapshot().dialog).toEqual({ id: 'clone-bot', params: { id: 'lam' } })
    expect(store.getSnapshot().params.bot).toEqual({ id: 'lam' })
    expect(calls).toBe(1)
  })

  it('mã panel có tiền tố aris-', () => {
    expect(panelId('settings')).toBe('aris-settings')
  })
})
