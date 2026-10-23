import { describe, expect, it } from 'vitest'
import { findForbiddenImports, findForbiddenPackages } from './check-deps.mjs'
import { findViolations, isAllowed } from './check-licenses.mjs'

describe('check-deps', () => {
  it('bắt gói và nguồn của NousResearch trong lockfile', () => {
    const lock = [
      "  '@nousresearch/hermes@1.0.0':",
      '  hermes-agent@0.3.0:',
      '    resolution: {tarball: https://github.com/NousResearch/hermes-agent}',
      '  hermes-parser@0.25.1:',
    ].join('\n')
    expect(findForbiddenPackages(lock)).toHaveLength(3)
  })
  it('không bắt nhầm hermes-parser của engine Hermes JS', () => {
    expect(findForbiddenPackages('  hermes-parser@0.25.1:\n  hermes-estree@0.25.1:')).toEqual([])
  })
  it('bắt import trỏ tới Hermes trong mã nguồn', () => {
    expect(
      findForbiddenImports("import x from 'hermes-agent/run'\nconst y = require('nousresearch/tools')"),
    ).toHaveLength(2)
    expect(findForbiddenImports("import { a } from './hermes-notes.js'")).toEqual([])
  })
})

describe('check-licenses', () => {
  it('chấp nhận biểu thức OR có một nhánh hợp lệ', () => {
    expect(isAllowed('(MIT OR CC0-1.0)')).toBe(true)
    expect(isAllowed('GPL-3.0-only')).toBe(false)
    expect(isAllowed('MIT AND GPL-2.0')).toBe(false)
  })
  it('báo gói GPL, bỏ qua ngoại lệ đã ghi lý do', () => {
    const report = {
      MIT: [{ name: 'a' }],
      'GPL-3.0': [{ name: 'b', versions: ['1.0.0'] }],
      'LGPL-3.0-or-later': [{ name: '@img/sharp-libvips-darwin-arm64' }],
    }
    expect(findViolations(report)).toEqual(['b@1.0.0: GPL-3.0'])
  })
})
