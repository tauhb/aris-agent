import { describe, expect, it } from 'vitest'
import type { BundleInfo, MarketEntry } from '../../page.js'
import {
  bundleText,
  debrand,
  fold,
  groupBundles,
  groupOf,
  marketCard,
  outcomeOf,
  shortName,
  stateOf,
} from './model.js'

const b = (over: Partial<BundleInfo>): BundleInfo => ({
  name: 'x',
  official: false,
  availability: 'profile',
  enabled: true,
  installed: true,
  optional: true,
  removable: true,
  rows: [],
  ...over,
})

describe('trang Plugin', () => {
  it('chia gói: lõi aris và nền là bắt buộc, gói có sẵn, gói tự thêm', () => {
    expect(groupOf(b({ name: '@aris/bundle' }))).toBe('core')
    expect(groupOf(b({ name: '@deepseek-ai/dsh-web-app', readOnlyReason: 'management-required' }))).toBe(
      'core',
    )
    expect(groupOf(b({ name: '@deepseek-ai/dsh-acp-app', optional: false, removable: false }))).toBe('core')
    expect(groupOf(b({ name: '@deepseek-ai/dsh-experimental-agent-team-profile', official: true }))).toBe(
      'core',
    )
    expect(groupOf(b({ name: 'pkg', readOnlyReason: 'management-required' }))).toBe('core')
    expect(groupOf(b({ name: '@deepseek-ai/dsh-experimental-voice-input-bundle', official: true }))).toBe(
      'builtin',
    )
    expect(groupOf(b({ name: 'aris-plugin-hoa-don' }))).toBe('added')
    const g = groupBundles([b({ name: 'b-z' }), b({ name: '@aris/web-bundle' }), b({ name: 'b-a' })], (t) =>
      String(t),
    )
    expect(g.core.map((x) => x.name)).toEqual(['@aris/web-bundle'])
    expect(g.added.map((x) => x.name)).toEqual(['b-a', 'b-z'])
  })

  it('trạng thái gói và tên ngắn', () => {
    expect(stateOf(b({}))).toBe('active')
    expect(stateOf(b({ enabled: false }))).toBe('off')
    expect(stateOf(b({ error: { code: 'operation-error' } }))).toBe('failed')
    expect(stateOf(b({ availability: 'missing' }))).toBe('missing')
    expect(shortName('@deepseek-ai/dsh-experimental-voice-input-bundle')).toBe('voice-input')
    expect(fold('Chuyển Giọng Nói')).toBe('chuyen giong noi')
  })

  it('kết quả một thay đổi', () => {
    const base = { changed: true, target: 'x' }
    expect(outcomeOf({ ...base, application: 'applied' })).toEqual({ kind: 'applied' })
    expect(outcomeOf({ ...base, application: 'restart-required' })).toEqual({ kind: 'restart' })
    expect(
      outcomeOf({
        ...base,
        application: 'failed',
        error: { code: 'bundle-in-use', diagnostic: 'đang dùng' },
      }),
    ).toEqual({
      kind: 'failed',
      detail: 'đang dùng',
    })
  })

  it('thẻ chợ: cài được, đã cài, có bản mới, không hợp phiên bản', () => {
    const e = (status: MarketEntry['installation']['status'], compatible = true): MarketEntry => ({
      name: 'p',
      metadata: { labels: [], keywords: [] },
      versions: [{ version: '1.0.0', install: { spec: 'p@1.0.0' }, compatibility: { compatible } }],
      defaultVersion: '1.0.0',
      installation: { status },
    })
    expect(marketCard(e('not-installed'))).toMatchObject({ canInstall: true, installed: false })
    expect(marketCard(e('installed'))).toMatchObject({ canInstall: false, installed: true })
    expect(marketCard(e('update-available'))).toMatchObject({ canInstall: true, update: true })
    expect(marketCard(e('not-installed', false))).toMatchObject({ canInstall: false, incompatible: true })
  })
})

describe('chữ hiện cho người dùng', () => {
  it('không nhắc tên nền tảng bên dưới', () => {
    expect(debrand('DeepSeek Harness plugins')).toBe('aris plugins')
    expect(debrand('Voice input for DeepSeek')).toBe('Voice input for aris')
    expect(debrand('@deepseek-ai/dsh-base')).toBe('@deepseek-ai/dsh-base')
  })

  it('gói đã biết dùng tên dịch sẵn', () => {
    const t = (k: string) => `[${k}]`
    expect(bundleText(b({ name: '@aris/bundle' }), String, t).title).toBe('[pl.b.aris]')
    expect(bundleText(b({ name: '@deepseek-ai/dsh-experimental-voice-input-bundle' }), String, t).title).toBe(
      '[pl.b.voice-input]',
    )
    expect(bundleText(b({ name: 'la' }), String, t).title).toBe('la')
  })
})
