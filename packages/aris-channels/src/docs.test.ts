import { describe, expect, it } from 'vitest'
import { DocsGate, NO_INFO, type DocsPort } from './docs.js'

function port() {
  const scopes = new Map<string, readonly string[]>()
  const hits = new Map<string, number>()
  const p: DocsPort = {
    scope: (sid, f) => {
      if (f) scopes.set(sid, f)
      else scopes.delete(sid)
      hits.set(sid, 0)
    },
    hits: (sid) => hits.get(sid) ?? 0,
    folders: () => [{ path: 'cong-ty/wiki/san-pham', title: 'san-pham', pages: 3 }],
  }
  return { p, scopes, hits }
}

describe('chỉ trả lời theo tài liệu', () => {
  it('lượt có tra thấy trong nguồn: giữ câu trả lời; không tra thấy: thay bằng câu chưa có thông tin; xong thì bỏ giới hạn', () => {
    const { p, scopes, hits } = port()
    const gate = new DocsGate(() => p)
    expect(gate.begin('s1', { on: true, folders: ['cong-ty/wiki/san-pham'] })).toContain(NO_INFO)
    expect(scopes.get('s1')).toEqual(['cong-ty/wiki/san-pham'])
    expect(gate.on('s1')).toBe(true)
    hits.set('s1', 2)
    expect(gate.end('s1')).toBeUndefined()
    expect(scopes.has('s1')).toBe(false)
    expect(gate.on('s1')).toBe(false)
    gate.begin('s1', { on: true, folders: ['x'], noInfo: 'Chưa có thông tin ạ.' })
    expect(gate.end('s1')).toBe('Chưa có thông tin ạ.')
    expect(gate.end('s1')).toBeUndefined()
  })

  it('bộ não chưa chạy: vẫn bật, lượt nào cũng ra câu chưa có thông tin', () => {
    const gate = new DocsGate(() => undefined)
    gate.begin('s1', { on: true, folders: ['x'] })
    expect(gate.end('s1')).toBe(NO_INFO)
    expect(gate.folders()).toEqual([])
  })
})
