/** Second Brain: một trang, năm khung (ghi chú, hộp thư vào, đồ thị, hỏi bộ não, nhật ký) chọn qua `params.view`. */
import type { PageProps } from '../page.js'
import { Ask } from './Ask.js'
import { BrainGraph } from './Graph.js'
import { Inbox } from './Inbox.js'
import { BrainLog } from './Log.js'
import { Notes } from './Notes.js'

const VIEWS = { notes: Notes, inbox: Inbox, graph: BrainGraph, ask: Ask, log: BrainLog } as const

export function Brain(props: PageProps) {
  const View = VIEWS[props.params.view as keyof typeof VIEWS] ?? Notes
  return <View {...props} />
}
