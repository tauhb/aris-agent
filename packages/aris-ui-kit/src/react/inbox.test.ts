import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchInboxCount, inboxTotal } from './inbox.js'

describe('inboxTotal', () => {
  it('cộng yêu cầu quyền, ký ức, skill và một thẻ soát bộ não khi còn phát hiện', () => {
    expect(inboxTotal({ actions: 2, memories: 3, skills: 1, auditOpen: 0 })).toBe(6)
    expect(inboxTotal({ actions: 2, memories: 3, skills: 1, auditOpen: 7 })).toBe(7)
    expect(inboxTotal({ actions: 0, memories: 0, skills: 0, auditOpen: 0 })).toBe(0)
  })
})

describe('fetchInboxCount', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) })
  const stub = (routes: Record<string, unknown>) => {
    vi.stubGlobal('document', { baseURI: 'http://localhost/' })
    vi.stubGlobal('fetch', (u: URL) => {
      const key = Object.keys(routes).find((k) => u.href.includes(k))
      const body = key ? routes[key] : undefined
      return body === undefined ? Promise.reject(new Error('lỗi mạng')) : Promise.resolve(ok(body))
    })
  }

  it('đọc đủ bốn nguồn của Hộp duyệt', async () => {
    stub({
      'commander?approvals=all': { approvals: [{}, {}] },
      'memory?pending=all': { pending: [{}] },
      'skills?pending=all': { pending: [{}, {}, {}] },
      'brain?audit=summary': { open: 4 },
    })
    const c = await fetchInboxCount({ actions: 0, memories: 0, skills: 0, auditOpen: 0 })
    expect(c).toEqual({ actions: 2, memories: 1, skills: 3, auditOpen: 4 })
    expect(inboxTotal(c)).toBe(7)
  })

  it('nguồn nào lỗi thì giữ số cũ của nguồn đó', async () => {
    stub({ 'memory?pending=all': { pending: [] } })
    const c = await fetchInboxCount({ actions: 2, memories: 5, skills: 1, auditOpen: 3 })
    expect(c).toEqual({ actions: 2, memories: 0, skills: 1, auditOpen: 3 })
  })
})
