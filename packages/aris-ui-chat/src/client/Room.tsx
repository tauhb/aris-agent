/**
 * Phòng nhóm trong khung chat (bản vẽ `Phong2.dc.html`): mỗi vòng Aris mời (`moi_noi`) vẽ thành
 * các tin của bot, bỏ lượt và bị bỏ qua là dòng ghi chú, bot đang nói có dấu "đang nghĩ". Thanh
 * phòng trên ô nhập: vòng, số tin, ai đang nói, nút Dừng phòng hoặc Gửi cả phòng.
 */
import { Button, Mascot, currentTeam, stopRoom, useRoomStatus, useTeamData } from '@aris/ui-kit/react'
import { Fragment, useEffect, useState } from 'react'
import type { Translate } from './locale.js'
import { clock, fetchRound, noteKey, textParts, type RoomEntry, type RoundData } from './room-data.js'
import type { SubagentCall } from './branch.js'

const mascotOf = (handle: string) => {
  const team = currentTeam()
  return [team.commander, ...team.members].find((m) => m.handle === handle)?.mascot ?? handle
}

/** Đọc một vòng; vòng còn chạy thì đọc lại mỗi 1,5 giây. */
function useRound(callId: string, finished: boolean): RoundData | null {
  const [round, setRound] = useState<RoundData | null>(null)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const r = await fetchRound(callId).catch(() => null)
      if (!alive) return
      if (r) setRound(r)
      if (!finished || !r || r.status === 'running') timer = setTimeout(() => void load(), 1500)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [callId, finished])
  return round
}

function Said({ e }: { e: RoomEntry }) {
  return (
    <div className="aris-room-msg">
      <Mascot id={mascotOf(e.handle)} size={28} />
      <div className="b">
        <div className="h">
          <b>{e.name}</b>
          {e.role ? ` · ${e.role}` : ''} · {clock(e.at)}
        </div>
        <div className="x">
          {textParts(e.text).map((p, i) =>
            p.kind === 'bold' ? (
              <b key={i}>{p.text}</b>
            ) : p.kind === 'mention' ? (
              <span key={i} className="at">
                {p.text}
              </span>
            ) : (
              <Fragment key={i}>{p.text}</Fragment>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

/** Một lần gọi `moi_noi` (`tool.call.toolview`, khoá `moi_noi`): các tin của vòng. */
export function RoomRound(props: SubagentCall & { callId: string; t: Translate }) {
  useTeamData()
  const { t } = props
  const round = useRound(props.callId, props.phase === 'result')
  if (!round)
    return props.phase === 'result' ? null : (
      <div className="aris aris-room aris-room-note">{t('room.opening')}</div>
    )
  const speaking = round.speaking
    ? (currentTeam().members.find((m) => m.handle === round.speaking)?.name ?? `@${round.speaking}`)
    : undefined
  return (
    <div className="aris aris-room">
      <div className="aris-room-note">{t('room.round', { n: round.round, max: round.maxRounds })}</div>
      {round.entries.map((e, i) =>
        e.kind === 'say' ? (
          <Said key={i} e={e} />
        ) : (
          <div key={i} className="aris-room-note">
            {t(noteKey(e), { name: e.name, text: e.text })}
          </div>
        ),
      )}
      {speaking && round.status === 'running' && (
        <div className="aris-room-typing">
          <span className="dot" aria-hidden="true" />
          {t('room.thinking', { name: speaking })}
        </div>
      )}
      {round.status === 'stopped' && <div className="aris-room-note">{t('room.closed')}</div>}
    </div>
  )
}

/** Thanh phòng trên ô nhập (`conversation.input.dock`), chỉ ở phiên chính của dự án. */
export function RoomDock({
  sessionId,
  insert,
  t,
}: {
  sessionId: string
  insert: (text: string) => void
  t: Translate
}) {
  const [room, reload] = useRoomStatus(sessionId)
  const [stopping, setStopping] = useState(false)
  if (!room?.project) return null
  const stop = async () => {
    setStopping(true)
    await stopRoom(sessionId).catch(() => undefined)
    setStopping(false)
    reload()
  }
  return (
    <div className="aris aris-room-dock">
      <span className="lbl">{t('room.label')}</span>
      {(room.round ?? 0) > 0 && (
        <span className="a-muted">
          {t('room.count', {
            n: room.round,
            max: room.maxRounds,
            used: room.used,
            maxMessages: room.maxMessages,
          })}
        </span>
      )}
      {room.running && room.speaking && (
        <span className="aris-room-typing">
          <span className="dot" aria-hidden="true" />
          {t('room.thinking', { name: room.speaking.name })}
        </span>
      )}
      {(room.stopped?.length ?? 0) > 0 && (
        <span className="a-muted">
          {t('room.stoppedList', { list: room.stopped!.map((h) => `@${h}`).join(', ') })}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {room.running ? (
        <Button size="sm" disabled={stopping} onClick={() => void stop()}>
          {t('room.stop')}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => insert('@all ')}>
          {t('room.all')}
        </Button>
      )}
    </div>
  )
}
