import { describe, expect, it } from 'vitest'
import { mediaMeta } from './Media.js'

describe('khung ảnh, video trong chat', () => {
  it('đọc dòng [aris-media] cuối kết quả công cụ', () => {
    const text =
      'Đã tạo 2 ảnh bằng m.\nTệp: /a.png, /b.png\n[aris-media] {"kind":"image","ids":["m-1","m-2"],"model":"m","usd":0.07}'
    expect(mediaMeta(text)).toMatchObject({ ids: ['m-1', 'm-2'], model: 'm', usd: 0.07 })
    expect(mediaMeta('không có gì')).toBeUndefined()
    expect(mediaMeta('[aris-media] {hỏng')).toBeUndefined()
  })
})
