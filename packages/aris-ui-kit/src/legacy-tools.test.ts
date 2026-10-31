import { describe, expect, it } from 'vitest'
import { argOf, currentToolName, LEGACY_TOOL_NAMES, toolNamesOf } from './legacy-tools.js'

describe('tên công cụ cũ trong log phiên cũ', () => {
  it('tên cũ quy về tên mới; tên khác giữ nguyên', () => {
    expect(currentToolName('giao_viec')).toBe('assign_task')
    expect(currentToolName('man_hinh_bam')).toBe('screen_click')
    expect(currentToolName('assign_task')).toBe('assign_task')
    expect(currentToolName('brain_search')).toBe('brain_search')
  })
  it('mỗi tên mới kèm đúng các tên cũ của nó; không tên cũ nào trùng tên mới', () => {
    expect(toolNamesOf('assign_task')).toEqual(['assign_task', 'giao_viec'])
    expect(toolNamesOf('brain_read')).toEqual(['brain_read'])
    const now = new Set(Object.values(LEGACY_TOOL_NAMES))
    for (const old of Object.keys(LEGACY_TOOL_NAMES)) expect(now.has(old)).toBe(false)
  })
  it('đọc tham số theo tên mới, không có thì theo tên cũ', () => {
    expect(argOf({ title: 'a', tieu_de: 'b' }, 'title', 'tieu_de')).toBe('a')
    expect(argOf({ tieu_de: 'b' }, 'title', 'tieu_de')).toBe('b')
    expect(argOf({}, 'title', 'tieu_de')).toBeUndefined()
  })
})
