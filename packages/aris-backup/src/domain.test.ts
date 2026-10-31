import { describe, expect, it } from 'vitest'
import { LEGACY_STEP_IDS, runRecord } from './domain.js'

describe('nhật ký diễn tập đã lưu', () => {
  it('mã bước cũ (tiếng Việt) quy về mã mới khi đọc', () => {
    const old = {
      id: 'r1',
      kind: 'drill',
      at: '2026-10-01T02:00:00.000Z',
      ok: true,
      ms: 1200,
      steps: Object.keys(LEGACY_STEP_IDS).map((id) => ({ id, ok: true })),
    }
    expect(runRecord.parse(old).steps?.map((s) => s.id)).toEqual([
      'decrypt',
      'unpack',
      'stores',
      'brain',
      'file-count',
    ])
    expect(runRecord.parse({ ...old, steps: [{ id: 'unpack', ok: true, n: 3 }] }).steps).toEqual([
      { id: 'unpack', ok: true, n: 3 },
    ])
    expect(() => runRecord.parse({ ...old, steps: [{ id: 'la', ok: true }] })).toThrow()
  })
})
