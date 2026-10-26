import { describe, expect, it } from 'vitest'
import { joinChain, linkStatus, moveLink, planChain, removeLink, splitChain } from './chain-list.js'

const L = (provider: string, model: string) => ({ provider, model })
const flash = L('deepseek', 'flash')
const pro = L('deepseek', 'pro')
const qwen = L('openrouter', 'qwen')

describe('chuỗi chat: model chính và dự phòng', () => {
  it('ghép và tách: dòng 1 là model chính, bỏ trùng', () => {
    expect(joinChain(flash, [pro, flash, qwen])).toEqual([flash, pro, qwen])
    expect(splitChain([flash, pro, qwen])).toEqual({ main: flash, fallback: [pro, qwen] })
    expect(splitChain([])).toEqual({ main: undefined, fallback: [] })
  })

  it('↑ ở dòng 2 đưa model đó lên chính, model chính cũ xuống dòng 2; ghi cả hai chỗ', () => {
    const cur = { main: flash, fallback: [pro, qwen] }
    const next = moveLink(joinChain(cur.main, cur.fallback), 1, -1)
    expect(next).toEqual([pro, flash, qwen])
    expect(planChain(cur, next)).toEqual({
      main: pro,
      fallback: [flash, qwen],
      mainChanged: true,
      fallbackChanged: true,
    })
  })

  it('đổi chỗ trong chuỗi dự phòng chỉ ghi chuỗi', () => {
    const cur = { main: flash, fallback: [pro, qwen] }
    const plan = planChain(cur, moveLink(joinChain(cur.main, cur.fallback), 2, -1))
    expect(plan.main).toEqual(flash)
    expect(plan.fallback).toEqual([qwen, pro])
    expect(plan.mainChanged).toBe(false)
    expect(plan.fallbackChanged).toBe(true)
  })

  it('↑ ở dòng 1 và ↓ ở dòng cuối không đổi gì', () => {
    expect(moveLink([flash, pro], 0, -1)).toEqual([flash, pro])
    expect(moveLink([flash, pro], 1, 1)).toEqual([flash, pro])
    const cur = { main: flash, fallback: [pro] }
    const plan = planChain(cur, moveLink([flash, pro], 0, -1))
    expect(plan.mainChanged || plan.fallbackChanged).toBe(false)
  })

  it('× ở dòng 1 đưa dòng 2 lên chính; hết dự phòng thì không bỏ được', () => {
    const cur = { main: flash, fallback: [pro, qwen] }
    const next = removeLink(joinChain(cur.main, cur.fallback), 0)
    expect(planChain(cur, next)).toEqual({
      main: pro,
      fallback: [qwen],
      mainChanged: true,
      fallbackChanged: true,
    })
    expect(removeLink([flash], 0)).toEqual([flash])
  })

  it('× ở dự phòng chỉ ghi chuỗi; thêm model vào cuối chuỗi', () => {
    const cur = { main: flash, fallback: [pro, qwen] }
    expect(planChain(cur, removeLink([flash, pro, qwen], 1))).toMatchObject({
      main: flash,
      fallback: [qwen],
      mainChanged: false,
      fallbackChanged: true,
    })
    expect(planChain({ main: flash, fallback: [] }, [flash, qwen])).toMatchObject({
      fallback: [qwen],
      mainChanged: false,
      fallbackChanged: true,
    })
  })

  it('chưa có model chính: thêm model đầu tiên thành model chính', () => {
    expect(planChain({ main: undefined, fallback: [] }, [pro])).toEqual({
      main: pro,
      fallback: [],
      mainChanged: true,
      fallbackChanged: false,
    })
  })
})

describe('trạng thái dòng chuỗi chat', () => {
  const price = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }
  it('khoá hay provider chưa dùng được chặn trước thiếu giá', () => {
    expect(linkStatus('nokey', null)).toBe('nokey')
    expect(linkStatus('off', price)).toBe('off')
    expect(linkStatus('error', undefined)).toBe('error')
  })
  it('có khoá: có giá là sẵn sàng, không có giá là chưa có giá, chưa tải bảng giá thì chưa kết luận', () => {
    expect(linkStatus('ok', price)).toBe('ready')
    expect(linkStatus('ok', null)).toBe('noprice')
    expect(linkStatus('ok', undefined)).toBeUndefined()
    expect(linkStatus(undefined, price)).toBeUndefined()
  })
})
