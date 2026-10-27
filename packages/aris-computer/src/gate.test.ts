import { describe, expect, it } from 'vitest'
import { decide } from './gate.js'
import { cleanSettings } from './policy.js'
import { setup } from './runtime.test.js'
import { makeTools, TOOL_SPECS } from './tools.js'

const ask = cleanSettings({ on: true })

describe('điều khiển máy · duyệt trước khi chạy', () => {
  it('bot chưa bật: từ chối, không tra gì trên máy', async () => {
    const { rt, drv } = setup()
    const d = await decide({
      settings: cleanSettings({}),
      bot: 'Khoa',
      runtime: rt,
      sessionId: 'p1',
      tool: 'man_hinh_xem',
      args: {},
      viewed: new Set(),
    })
    expect(d).toMatchObject({ kind: 'deny', what: 'điều khiển máy đang tắt' })
    expect(drv.snapshots).toBe(0)
  })

  it('hỏi từng bước: xem màn hình hỏi lần đầu mỗi phiên, thao tác thay đổi luôn hỏi kèm mô tả và chỗ đánh dấu', async () => {
    const { rt } = setup()
    const viewed = new Set<string>()
    const first = await decide({
      settings: ask,
      bot: 'Khoa',
      runtime: rt,
      sessionId: 'p1',
      tool: 'man_hinh_xem',
      args: { ung_dung: 'Notes' },
      viewed,
    })
    expect(first).toMatchObject({ kind: 'ask', reason: 'Khoa muốn xem màn hình: Chụp cửa sổ Notes' })
    await rt.run('p1', 'Khoa', 'man_hinh_xem', { ung_dung: 'Notes' })
    viewed.add('p1')
    expect(
      (
        await decide({
          settings: ask,
          bot: 'Khoa',
          runtime: rt,
          sessionId: 'p1',
          tool: 'man_hinh_xem',
          args: {},
          viewed,
        })
      ).kind,
    ).toBe('allow')
    const click = await decide({
      settings: ask,
      bot: 'Khoa',
      runtime: rt,
      sessionId: 'p1',
      tool: 'man_hinh_bam',
      args: { phan_tu: 's1:1' },
      viewed,
    })
    expect(click).toMatchObject({
      kind: 'ask',
      reason: 'Khoa muốn điều khiển máy: Bấm AXButton "Ghi chú mới" trong Notes',
    })
    expect(click.kind === 'ask' && click.inspected.mark).toEqual({ x: 16, y: 16, width: 64, height: 32 })
    expect(click.kind === 'ask' && click.inspected.win?.image).toBeTruthy()
  })

  it('chặn cứng thắng mọi chế độ; tham số sai hay mã cũ thì từ chối kèm lời dặn cho bot, không hỏi người dùng', async () => {
    const { rt } = setup()
    const bounded = cleanSettings({
      on: true,
      mode: 'bounded',
      apps: ['Terminal'],
      actions: ['xem', 'bam', 'go', 'phim', 'mo'],
    })
    const t = await decide({
      settings: bounded,
      bot: 'Khoa',
      runtime: rt,
      sessionId: 'p1',
      tool: 'man_hinh_xem',
      args: { ung_dung: 'Terminal' },
      viewed: new Set(),
    })
    expect(t).toMatchObject({ kind: 'deny', what: 'thao tác trong Terminal' })
    const stale = await decide({
      settings: ask,
      bot: 'Khoa',
      runtime: rt,
      sessionId: 'p1',
      tool: 'man_hinh_bam',
      args: { phan_tu: 'cu:1', ung_dung: 'Notes' },
      viewed: new Set(),
    })
    expect(stale).toMatchObject({ kind: 'deny', what: 'stale' })
  })

  it('trong phạm vi: trong phạm vi thì tự làm (không hỏi), ngoài phạm vi thì từ chối', async () => {
    const { rt } = setup()
    const s = cleanSettings({ on: true, mode: 'bounded', apps: ['Notes'], actions: ['xem', 'bam', 'mo'] })
    const base = { settings: s, bot: 'Khoa', runtime: rt, sessionId: 'p1', viewed: new Set<string>() }
    expect((await decide({ ...base, tool: 'man_hinh_xem', args: { ung_dung: 'Notes' } })).kind).toBe('allow')
    expect((await decide({ ...base, tool: 'ung_dung_mo', args: { ten: 'Notes' } })).kind).toBe('allow')
    expect(await decide({ ...base, tool: 'ung_dung_mo', args: { ten: 'Safari' } })).toMatchObject({
      kind: 'deny',
      what: 'Safari ngoài phạm vi',
    })
    expect(
      await decide({ ...base, tool: 'man_hinh_phim', args: { phim: 'cmd+n', ung_dung: 'Notes' } }),
    ).toMatchObject({
      kind: 'deny',
      what: 'bấm phím tắt ngoài phạm vi',
    })
  })
})

describe('điều khiển máy · công cụ cho bot', () => {
  it('tám công cụ tên tiếng Việt; kết quả có ảnh thì kèm khối ảnh, không có thì chỉ chữ', async () => {
    const tools = makeTools(async (name) =>
      name === 'man_hinh_xem'
        ? { text: 'ảnh', image: { attachmentId: 'a1', mediaType: 'image/png' } }
        : { text: 'xong' },
    )
    expect(tools.map((t) => t.name)).toEqual(TOOL_SPECS.map((s) => s.name))
    expect(tools.map((t) => t.name)).toEqual([
      'man_hinh_xem',
      'man_hinh_tim',
      'man_hinh_bam',
      'man_hinh_go',
      'man_hinh_phim',
      'man_hinh_cuon',
      'man_hinh_keo',
      'ung_dung_mo',
    ])
    const xem = tools[0]!
    const exec = { signal: new AbortController().signal } as never
    const v = (await xem.execute({}, exec)) as { text: string; image?: unknown }
    expect(v).toEqual({ text: 'ảnh', image: { attachmentId: 'a1', mediaType: 'image/png' } })
    const render = (xem.output as unknown as { render(a: unknown, v: unknown): unknown[] }).render({}, v)
    expect(render).toEqual([
      { type: 'text', text: 'ảnh' },
      { type: 'image', attachment: { attachmentId: 'a1', mediaType: 'image/png' } },
    ])
    expect(await tools[2]!.execute({ phan_tu: 's1:1' }, exec)).toEqual({ text: 'xong' })
  })
})
