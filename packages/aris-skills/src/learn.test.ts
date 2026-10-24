import { describe, expect, it } from 'vitest'
import { LEARN_TOOL, learnPrompt } from './learn.js'

describe('/learn', () => {
  it('lời nhắc có nguồn, chuẩn viết, công cụ nộp; có skill trùng tên thì nhắc thành bản vá', () => {
    const p = learnPrompt('~/du-an/sdk, phần đăng nhập', ['kiem-tra-repo'])
    expect(p).toContain('Nguồn: ~/du-an/sdk, phần đăng nhập')
    expect(p).toContain('## Các bước')
    expect(p).toContain(LEARN_TOOL)
    expect(p).toContain('kiem-tra-repo')
    expect(learnPrompt('quy trình xuất hoá đơn', [])).not.toContain('bản vá')
  })
})
