import { describe, expect, it } from 'vitest'
import { mcpInScope, mcpScopeLabel, stricterMcpAsk, teamMcpOf, type McpData } from './team.js'

const conn = (over: Partial<McpData>): McpData => ({
  id: 'm-1',
  bot: '_doi',
  name: 'X',
  serverName: 'doi-x',
  preset: 'custom',
  transport: 'stdio',
  secretKeys: [],
  ask: 'write',
  enabled: true,
  createdAt: '',
  ...over,
})

describe('phạm vi kết nối dùng chung ở giao diện', () => {
  const depts = [
    { id: 'tt', name: 'Tăng trưởng' },
    { id: 'kt', name: 'Kỹ thuật' },
  ]
  it('đúng bot, đúng phòng, cả đội; kết nối riêng của bot không tính', () => {
    const c = conn({ scope: { bots: ['b-1'], departments: ['kt'] } })
    expect(mcpInScope(c, { id: 'b-1' })).toBe(true)
    expect(mcpInScope(c, { id: 'b-2', department: 'kt' })).toBe(true)
    expect(mcpInScope(c, { id: 'b-3', department: 'tt' })).toBe(false)
    expect(mcpInScope(conn({ scope: { bots: 'all' } }), { id: 'b-9' })).toBe(true)
    expect(mcpInScope(conn({ bot: 'b-1' }), { id: 'b-1' })).toBe(false)
    expect(teamMcpOf([c, conn({ bot: 'b-2' })], { id: 'b-1' })).toEqual([c])
  })
  it('mức hỏi chặt hơn', () => {
    expect(stricterMcpAsk('write', 'always')).toBe('always')
    expect(stricterMcpAsk('always', 'never')).toBe('always')
    expect(stricterMcpAsk('never', 'write')).toBe('write')
  })
  it('nhãn phạm vi: cả đội, một phòng, phòng và bot', () => {
    const labels = { all: 'Cả đội', bots: (n: number) => `${n} bot` }
    expect(mcpScopeLabel(conn({ scope: { bots: 'all' } }), depts, labels)).toBe('Cả đội')
    expect(mcpScopeLabel(conn({ scope: { bots: [], departments: ['kt'] } }), depts, labels)).toBe('Kỹ thuật')
    expect(mcpScopeLabel(conn({ scope: { bots: ['a', 'b'], departments: ['tt'] } }), depts, labels)).toBe(
      'Tăng trưởng + 2 bot',
    )
    expect(mcpScopeLabel(conn({ scope: { bots: ['a'] } }), depts, labels)).toBe('1 bot')
  })
})
