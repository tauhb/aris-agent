import { describe, expect, it } from 'vitest'
import { MASCOTS } from '@aris/ui-kit'
import {
  branchBot,
  branchSteps,
  dispatchItems,
  subagentArgs,
  subagentId,
  type SubagentCall,
} from './branch.js'

const result = (over: Partial<Extract<SubagentCall, { phase: 'result' }>['block']> = {}): SubagentCall => ({
  phase: 'result',
  block: {
    callId: 'c1',
    call: { argsRaw: '{"description":"nghiên cứu 3 đối thủ","prompt":"…","agent_preset":"lam"}' },
    content: [{ type: 'text', text: 'started subagent s-42' }],
    isError: false,
    ...over,
  },
})

describe('nhánh việc từ lần gọi subagent', () => {
  it('đọc mô tả việc và mẫu bot từ tham số', () => {
    expect(subagentArgs(result())).toEqual({ description: 'nghiên cứu 3 đối thủ', agentPreset: 'lam' })
    expect(subagentArgs({ phase: 'start', block: { callId: 'c', argsRaw: '{"desc' } })).toEqual({})
    expect(subagentArgs({ phase: 'preparing', block: { callId: 'c' } })).toEqual({})
  })

  it('lấy mã phiên bot con từ kết quả dạng chữ hoặc JSON', () => {
    expect(subagentId(result())).toBe('s-42')
    expect(
      subagentId(result({ content: [{ type: 'json', text: '{"kind":"activation","subagentId":"s-7"}' }] })),
    ).toBe('s-7')
    expect(subagentId(result({ isError: true }))).toBeUndefined()
  })

  it('tên bot con trùng tên gọi trong đội thì dùng bot đó, không thì linh vật chưa dùng và ổn định', () => {
    // Chưa tải đội: chỉ có Commander.
    expect(branchBot('aris', 'x')).toEqual({ mascot: 'aris', name: 'Aris' })
    const a = branchBot(undefined, 's-42')
    expect(a).toEqual(branchBot(undefined, 's-42'))
    expect(MASCOTS.find((m) => m.id === a.mascot)?.inUse).toBe(false)
  })

  it('bước theo pha: đang giao, đã nhận và đang làm, xong, lỗi, dừng', () => {
    expect(branchSteps({ phase: 'preparing', block: { callId: 'c' } }, undefined)).toEqual([
      { status: 'working', key: 'branch.preparing' },
    ])
    expect(branchSteps(result(), { running: true }).map((s) => s.key)).toEqual([
      'branch.received',
      'branch.running',
    ])
    expect(branchSteps(result(), { running: false }).at(-1)).toEqual({ status: 'done', key: 'branch.done' })
    expect(
      branchSteps(
        result({ isError: true, content: [{ type: 'text', text: 'hết hạn mức\nchi tiết' }] }),
        undefined,
      ),
    ).toEqual([{ status: 'failed', key: 'branch.failed', params: { error: 'hết hạn mức' } }])
    expect(branchSteps(result({ isError: true, error: { code: 'interrupted' } }), undefined)[0]!.key).toBe(
      'branch.stopped',
    )
  })
})

describe('nhánh giao việc', () => {
  const NEW_ARGS = '{"tasks":[{"bot":"khoa","title":"Trả lời ok"},{"bot":"minh","task":"Tóm tắt"}]}'
  const call = (text: string, isError = false, argsRaw = NEW_ARGS): SubagentCall => ({
    phase: 'result',
    block: {
      callId: 'c2',
      call: { argsRaw },
      content: [{ type: 'text', text }],
      isError,
    },
  })
  it('đọc phiên và lỗi theo từng bot', () => {
    const items = dispatchItems(
      call('- @khoa (Khoa): đã nhận việc, phiên p-1\n- @minh: không giao được — đang bận'),
    )
    expect(items.map((i) => [i.handle, i.sessionId, i.error])).toEqual([
      ['khoa', 'p-1', undefined],
      ['minh', undefined, 'đang bận'],
    ])
  })
  it('cả lần giao bị chặn hay bị từ chối: mọi nhánh báo không giao được', () => {
    expect(
      dispatchItems(call('Không giao được: Đã có 6 bot đang chạy (tối đa 6).')).map((i) => i.error),
    ).toEqual(['Đã có 6 bot đang chạy (tối đa 6).', 'Đã có 6 bot đang chạy (tối đa 6).'])
    expect(dispatchItems(call('Error: the user rejected tool "assign_task"', true))[0]?.rejected).toBe(true)
  })
  it('lời gọi trong log cũ (giao_viec, tham số tiếng Việt) vẫn đọc được', () => {
    const old =
      '{"viec":[{"bot":"khoa","tieu_de":"Trả lời ok"},{"bot":"minh","noi_dung":"Tóm tắt\\ndòng hai"}]}'
    expect(dispatchItems(call('- @khoa (Khoa): đã nhận việc, phiên p-1', false, old))).toMatchObject([
      { handle: 'khoa', title: 'Trả lời ok', sessionId: 'p-1' },
      { handle: 'minh', title: 'Tóm tắt' },
    ])
  })
})
