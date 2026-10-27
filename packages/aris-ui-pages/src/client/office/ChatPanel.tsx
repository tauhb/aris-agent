/**
 * Bảng chat gọn ở cột phải (bản vẽ `VanPhongChatBot`, `VanPhongChatAris`): đầu bảng có "‹ Cả đội", linh vật, tên, trạng
 * thái và ô chọn phiên; thân bảng đọc hội thoại của phiên (tin của {you}, tin của bot, một dòng tiến độ cho các bước giữa
 * hai tin, khối "Đội đang làm" khi Aris giao việc); ô nhắn gửi vào phiên bằng `session-send`. Bot ngoài không có phiên chat:
 * bảng chỉ hiện tiến độ của lần chạy và nút mở hồ sơ.
 */
import {
  Mascot,
  openBotSession,
  stopExternalRun,
  useDismiss,
  useExternalRun,
  type PendingApproval,
  type TeamLive,
  type TeamView,
} from '@aris/ui-kit/react'
import { useEffect, useRef, useState } from 'react'
import { ChatScreen } from '../computer/ChatScreen.js'
import type { PageProps } from '../page.js'
import { MdFull } from './Md.js'
import { TeamBlock } from './TeamBlock.js'
import { STATUS_DOT } from './Desk.js'
import {
  pendingEcho,
  progressText,
  stepLabel,
  toTurns,
  type ConvStep,
  type Echo,
  type Turn,
} from './chatModel.js'
import { sendToSession, stopSession, useBotSessions, useConversation, type RecentSession } from './data.js'
import { hhmm, type Desk } from './model.js'

type T = PageProps['t']

/** Giá trị của `session` khi người dùng bấm "＋ Phiên mới": chưa có phiên cho tới tin đầu tiên. */
export const NEW_SESSION = 'new'

const pad = (n: number) => String(n).padStart(2, '0')
const dayTime = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Ô chọn phiên: phiên đang xem, các phiên gần đây, "＋ Phiên mới". */
function SessionPicker({
  t,
  label,
  current,
  list,
  running,
  onPick,
}: {
  t: T
  label: string
  current: string | undefined
  list: readonly RecentSession[]
  running: readonly string[]
  onPick: (session: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(root, open, () => setOpen(false))
  const known = new Set(list.map((s) => s.id))
  // Phiên đang chạy chưa vào danh sách 5 phiên gần nhất vẫn phải chọn được.
  const rows = [
    ...running.filter((id) => !known.has(id)).map((id) => ({ id, title: '', at: 0, running: true })),
    ...list,
  ]
  return (
    <div className="ap-of-pick" ref={root}>
      <button
        type="button"
        className="ap-of-sess"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span> ▾
      </button>
      {open && (
        <div className="ap-of-menu" role="listbox" aria-label={t('of.ch.sessions')}>
          {rows.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === current}
              className={s.id === current ? 'on' : undefined}
              onClick={() => {
                setOpen(false)
                onPick(s.id)
              }}
            >
              {(s.running || running.includes(s.id)) && <i className="ap-of-dotrun" />}
              <span className="ti">{s.title || t('of.ch.untitled')}</span>
              {s.at > 0 && <span className="ap-of-tm">{dayTime(s.at)}</span>}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => {
              setOpen(false)
              onPick(NEW_SESSION)
            }}
          >
            {t('of.ch.new')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Dòng tiến độ gộp các bước giữa hai tin; bấm thì xổ danh sách giờ và tiêu đề từng bước. */
function Progress({
  turn,
  open,
  now,
  t,
  onToggle,
}: {
  turn: Extract<Turn, { kind: 'progress' }>
  open: boolean
  now: number
  t: T
  onToggle: () => void
}) {
  return (
    <>
      <button type="button" className="ap-of-prog" aria-expanded={open} onClick={onToggle}>
        {turn.live ? <i className="ap-of-dotrun" /> : null}
        <span className="tx">{progressText(turn, now, t)}</span>
        <span className="ar">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ap-of-steps">
          {turn.steps.map((s, i) => (
            <div key={s.n} className={turn.live && i === turn.steps.length - 1 ? 'now' : undefined}>
              <span className="ap-of-tm">{hhmm(s.at)}</span> {stepLabel(s, t)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Bot ngoài: tiến độ của lần chạy (bước và lời báo cuối), không có ô nhắn vì bot ngoài không có phiên chat. */
function ExternalBody({
  t,
  run: runId,
  faceId,
  accessory,
}: {
  t: T
  run: string | undefined
  faceId: string
  accessory?: string | undefined
}) {
  const [run] = useExternalRun(runId)
  if (!runId)
    return (
      <div className="ap-of-cb ap-of-msgs">
        <div className="a-muted ap-of-empty">{t('of.ch.noRun')}</div>
      </div>
    )
  const steps = run?.steps ?? []
  return (
    <div className="ap-of-cb ap-of-msgs">
      {run && <div className="ap-of-me">{run.title}</div>}
      {steps.length > 0 && (
        <div className="ap-of-steps solo">
          {steps.map((s) => (
            <div key={s.id}>
              <span className="ap-of-tm">{hhmm(Date.parse(s.at))}</span> {s.tool ?? s.kind}
              {s.target ? ` ${s.target}` : ''}
            </div>
          ))}
        </div>
      )}
      {run?.output && (
        <div className="ap-of-bm">
          <Mascot id={faceId} size={26} accessory={accessory} />
          <div className="ap-of-bb">
            <MdFull text={run.output} />
          </div>
        </div>
      )}
      {run?.status === 'running' && (
        <div className="ap-of-prog static">
          <i className="ap-of-dotrun" />
          <span className="tx">{t('of.fd.st.running')}</span>
        </div>
      )}
    </div>
  )
}

export function ChatPanel({
  t,
  nav,
  desk,
  commander,
  live,
  team,
  session,
  approvals,
  onSession,
  onBack,
  onChat,
  reload,
  onClose,
}: {
  t: T
  nav: PageProps['nav']
  desk: Desk
  /** Chat với Aris (chỉ huy): có khối "Đội đang làm" và đầu bảng ghi "đang điều phối". */
  commander: boolean
  live: TeamLive | null
  team: TeamView
  /** Phiên đang chọn; `NEW_SESSION` là phiên mới chưa có tin; trống thì phiên đang chạy, không có thì phiên gần nhất. */
  session: string | undefined
  approvals: readonly PendingApproval[]
  onSession: (session: string | undefined) => void
  onBack: () => void
  onChat: (bot: string, session?: string) => void
  reload: () => void
  /** Màn hẹp: đóng ngăn trượt. */
  onClose: () => void
}) {
  const running = live?.status[desk.id]?.sessions ?? []
  const recent = useBotSessions(desk.id, !desk.external)
  const picked = session === NEW_SESSION ? undefined : session
  const sid = session === NEW_SESSION ? undefined : (picked ?? running[0] ?? recent?.[0]?.id)
  const busyMs = running.includes(sid ?? '')
  const conv = useConversation(desk.external ? undefined : sid, busyMs ? 2000 : 10_000)
  const busy = busyMs || !!conv?.running

  const [text, setText] = useState('')
  const [mode, setMode] = useState<'steer' | 'queue'>('steer')
  const [sending, setSending] = useState(false)
  const [echoes, setEchoes] = useState<Echo[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(Date.now())
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Đồng hồ cho thời gian của dòng tiến độ đang chạy.
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const steps: ConvStep[] = conv?.steps ?? []
  const turns = toTurns(steps, busy)
  const unsent = pendingEcho(steps, echoes)
  // Đã thấy trong phiên thì thôi giữ.
  useEffect(() => {
    if (unsent.length !== echoes.length) setEchoes(unsent)
  }, [unsent.length, echoes.length])

  // Tự cuộn xuống cuối khi có tin mới, trừ khi {you} đang cuộn lên đọc.
  const last = turns.at(-1)
  const tail = last
    ? `${last.key}:${'text' in last ? last.text.length : last.kind === 'progress' ? last.steps.length : 0}`
    : ''
  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [tail, unsent.length])

  const title = conv?.title || recent?.find((s) => s.id === sid)?.title || ''
  const label = sid ? title || t('of.ch.untitled') : t('of.ch.new')
  const dot = STATUS_DOT[desk.status]
  const pillTone =
    desk.status === 'working'
      ? 'run'
      : desk.status === 'waiting'
        ? 'warn'
        : desk.status === 'failed'
          ? 'err'
          : desk.status === 'done'
            ? 'ok'
            : 'dim'
  const pillText =
    commander && desk.status === 'working' ? t('of.ch.coordinating') : t(`of.fd.bot.${desk.status}`)

  const send = async () => {
    const msg = text.trim()
    if (!msg || sending) return
    setSending(true)
    setNote(null)
    const echo: Echo = { id: String(Date.now()), text: msg, at: Date.now() }
    try {
      let target = sid
      if (!target) {
        target = await openBotSession(desk.id, true)
        onSession(target)
      }
      setEchoes((cur) => [...cur, echo])
      setText('')
      stick.current = true
      await sendToSession(target, msg, mode)
      reload()
    } catch (e) {
      setEchoes((cur) => cur.filter((x) => x.id !== echo.id))
      setNote(t('of.dr.error', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSending(false)
    }
  }
  const stop = async () => {
    if (!sid) return
    setNote(null)
    try {
      await stopSession(sid)
      reload()
    } catch (e) {
      setNote(t('of.dr.error', { error: e instanceof Error ? e.message : String(e) }))
    }
  }

  return (
    <>
      <div className="ap-of-ch">
        <button type="button" className="ap-of-back" onClick={onBack}>
          ‹ {t('of.ch.back')}
        </button>
        <button type="button" className="ap-of-colx" aria-label={t('of.col.close')} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ap-of-bh">
        <Mascot id={desk.mascot} size={44} accessory={desk.accessory} />
        <div className="ap-of-bhx">
          <div className="ap-of-fl">
            <b className="ap-of-ct">{desk.name}</b>
            <span className={`ap-of-sp ${pillTone}`}>
              <i style={{ background: dot }} />
              {pillText}
            </span>
          </div>
          {desk.external ? (
            <span className="a-muted ap-of-sm">{desk.role}</span>
          ) : (
            <SessionPicker
              t={t}
              label={label}
              current={sid}
              list={recent ?? []}
              running={running}
              onPick={(s) => {
                // Đổi phiên thì bỏ tin đang gửi và ghi chú của phiên cũ, cuộn xuống cuối phiên mới.
                setEchoes([])
                setNote(null)
                stick.current = true
                onSession(s)
              }}
            />
          )}
        </div>
      </div>

      {desk.external ? (
        <ExternalBody t={t} run={picked ?? running[0]} faceId={desk.mascot} accessory={desk.accessory} />
      ) : (
        <div
          className="ap-of-cb ap-of-msgs"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
          }}
        >
          {turns.map((turn) => {
            switch (turn.kind) {
              case 'user':
                return (
                  <div key={turn.key} className="ap-of-me">
                    {turn.text}
                  </div>
                )
              case 'assistant':
                return (
                  <div key={turn.key} className="ap-of-bm">
                    <Mascot id={desk.mascot} size={26} accessory={desk.accessory} />
                    <div className="ap-of-bb">
                      <MdFull text={turn.text} />
                    </div>
                  </div>
                )
              case 'progress':
                return (
                  <Progress
                    key={turn.key}
                    turn={turn}
                    open={openSteps[turn.key] ?? turn.live}
                    now={now}
                    t={t}
                    onToggle={() =>
                      setOpenSteps((cur) => ({ ...cur, [turn.key]: !(cur[turn.key] ?? turn.live) }))
                    }
                  />
                )
              case 'team':
                return commander ? (
                  <TeamBlock
                    key={turn.key}
                    step={turn.step}
                    parent={sid}
                    team={team}
                    approvals={approvals}
                    t={t}
                    onChat={onChat}
                    reload={reload}
                  />
                ) : null
            }
          })}
          {desk.waiting && (
            <div className="ap-of-prog static" role="status">
              <span aria-hidden="true">⏳</span>
              <span className="tx">
                {t('of.ch.waitLine', { what: desk.waiting.for, at: hhmm(desk.waiting.until) })}
              </span>
            </div>
          )}
          {unsent.map((e) => (
            <div key={e.id} className="ap-of-me sending">
              {e.text}
              <small>{t('of.ch.sending')}</small>
            </div>
          ))}
          <ChatScreen t={t} sessionId={sid} name={desk.name} approvals={approvals} reloadApprovals={reload} />
        </div>
      )}

      {desk.external ? (
        <div className="ap-of-cmp">
          <div className="ap-of-cm">
            <button type="button" className="ap-of-b1" onClick={() => nav.go('bot', { id: desk.id })}>
              {t('of.ch.profile')}
            </button>
            {busy || running[0] ? (
              <button
                type="button"
                className="ap-of-b2 stop"
                onClick={() => {
                  const run = picked ?? running[0]
                  if (run) void stopExternalRun(run).then(reload)
                }}
              >
                ■ {t('of.dr.stop')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="ap-of-cmp">
          {busy && (
            <div className="ap-of-cm">
              <span className="ap-of-seg2" role="group" aria-label={t('of.ch.mode')}>
                <button
                  type="button"
                  className={mode === 'steer' ? 'on' : undefined}
                  aria-pressed={mode === 'steer'}
                  onClick={() => setMode('steer')}
                >
                  {t('of.ch.steer')}
                </button>
                <button
                  type="button"
                  className={mode === 'queue' ? 'on' : undefined}
                  aria-pressed={mode === 'queue'}
                  onClick={() => setMode('queue')}
                >
                  {t('of.ch.queue')}
                </button>
              </span>
              <button type="button" className="ap-of-b2 stop" onClick={() => void stop()}>
                ■ {t('of.dr.stop')}
              </button>
            </div>
          )}
          {note && <div className="ap-of-note bad">{note}</div>}
          <div className="ap-of-ci">
            <textarea
              rows={2}
              value={text}
              maxLength={4000}
              placeholder={t('of.dr.msg', { name: desk.name })}
              aria-label={t('of.dr.msg', { name: desk.name })}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button
              type="button"
              className="ap-of-b1 send"
              aria-label={t('of.dr.send')}
              disabled={sending || !text.trim()}
              onClick={() => void send()}
            >
              ↑
            </button>
          </div>
          <div className="ap-of-cl">
            <button
              type="button"
              className="ap-of-link"
              disabled={!sid}
              onClick={() => sid && nav.openSession(sid)}
            >
              {t('of.ch.openFull')} ↗
            </button>
          </div>
        </div>
      )}
    </>
  )
}
