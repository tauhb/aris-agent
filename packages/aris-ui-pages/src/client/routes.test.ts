import { describe, expect, it } from 'vitest'
import { ROUTES, createNavStore, navigate, panelId, resolveRoute } from './routes.js'

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

  it('Bản đồ đội và Kanban cũ chuyển sang Văn phòng, giữ tham số dự án', () => {
    expect(resolveRoute('map')).toEqual({ to: 'office', params: {} })
    expect(resolveRoute('kanban', { project: 'ws-1' })).toEqual({
      to: 'office',
      params: { project: 'ws-1', tab: 'kanban' },
    })
    expect(resolveRoute('brain', { view: 'notes' })).toEqual({ to: 'brain', params: { view: 'notes' } })
  })

  it('thanh bên có bốn mục: Văn phòng, Brain, Routine, Tự học', () => {
    const nav = Object.entries(ROUTES)
      .filter(([, r]) => 'nav' in r && r.nav)
      .sort(([, a], [, b]) => ('order' in a ? a.order : 0) - ('order' in b ? b.order : 0))
      .map(([id]) => id)
    expect(nav).toEqual(['office', 'brain', 'routine', 'learn'])
  })
})
