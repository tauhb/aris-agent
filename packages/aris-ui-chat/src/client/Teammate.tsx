/**
 * Dòng công cụ "Đã hỏi <đồng đội>" (`ask_teammate` của @aris/commander, GĐ9.5): viên tên đồng đội, câu hỏi, câu trả lời
 * gấp gọn (bấm mở ra). Đang chờ thì "Đang hỏi".
 */
import type { SubagentCall } from '@aris/ui-kit'
import { useTeamData } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { Translate } from './locale.js'
import { Who } from './Speaker.js'

const argsOf = (call: SubagentCall): Record<string, unknown> => {
  const raw =
    call.phase === 'start' ? call.block.argsRaw : call.phase === 'result' ? call.block.call?.argsRaw : ''
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const resultText = (call: SubagentCall) =>
  call.phase === 'result' ? call.block.content.map((c) => c.text ?? '').join('\n') : ''

/** Câu trả lời trong kết quả công cụ: bỏ dòng đầu "<tên> trả lời:". */
export const teammateAnswer = (text: string) => text.replace(/^[^\n]*trả lời:\n/, '').trim()

export function TeammateCall(props: SubagentCall & { t: Translate }) {
  const { t } = props
  const [open, setOpen] = useState(false)
  const bots = useTeamData()?.bots ?? []
  const ref = String(argsOf(props).teammate ?? '')
    .replace(/^@/, '')
    .toLowerCase()
  const bot = bots.find((b) => b.handle.toLowerCase() === ref || b.name.toLowerCase() === ref)
  const question = String(argsOf(props).question ?? '')
  const text = resultText(props)
  const answered = /trả lời:\n/.test(text)
  const answer = answered ? teammateAnswer(text) : text
  const long = answer.length > 220
  return (
    <div className="aris aris-tm">
      <div className="h">
        <span className="lb">{props.phase === 'result' ? t('tm.asked') : t('tm.asking')}</span>
        {bot ? <Who bot={bot} t={t} /> : <b>{ref}</b>}
        <span className="q">{question}</span>
      </div>
      {props.phase === 'result' && answer && (
        <div className={answered ? 'a' : 'a muted'}>
          {open || !long ? answer : `${answer.slice(0, 220)}…`}
          {long && (
            <button type="button" className="more" onClick={() => setOpen(!open)}>
              {open ? t('tm.less') : t('tm.more')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
