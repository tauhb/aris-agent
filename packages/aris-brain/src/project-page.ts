/**
 * Dự án Kanban nối trang Dự án trong bộ não (bản vẽ 4.3b): trang mới từ mẫu Dự án, nhãn `kanban: <mã dự án>`
 * ở đầu trang. Thuần.
 */
import { parsePage } from './page.js'

/** Trang Dự án mới cho một dự án Kanban. */
export function projectPageText(o: {
  name: string
  goal?: string | undefined
  workspace: string
  today: string
}) {
  return [
    '---',
    'loai: du-an',
    'trang-thai: dang-chay',
    `kanban: ${o.workspace}`,
    'the: []',
    'nguon: 0',
    `cap-nhat: ${o.today}`,
    `tom-tat: ${JSON.stringify(`Dự án ${o.name}${o.goal ? `: ${o.goal.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`)}`,
    '---',
    '',
    `# ${o.name}`,
    '',
    '## Mục tiêu',
    '',
    o.goal?.trim() ?? '',
    '',
    '## Quyết định',
    '',
    '## Lịch sử',
    '',
    '## Nguồn',
    '',
  ].join('\n')
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Ghi (hay thay) nhãn `kanban:` ở đầu trang; trang chưa có nhãn đầu trang thì thêm khối mới. */
export function withKanban(text: string, workspace: string): string {
  const m = FRONT.exec(text)
  if (!m) return `---\nkanban: ${workspace}\n---\n\n${text}`
  const lines = m[1]!.split(/\r?\n/).filter((l) => !/^kanban\s*:/.test(l))
  const at = lines.findIndex((l) => /^trang-thai\s*:/.test(l))
  lines.splice(at >= 0 ? at + 1 : lines.length, 0, `kanban: ${workspace}`)
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`
}

/** Mã dự án Kanban ghi ở đầu trang, nếu có. */
export function kanbanOf(text: string): string | undefined {
  const v = parsePage(text, '').meta.kanban
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}
