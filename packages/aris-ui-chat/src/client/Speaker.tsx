/**
 * Ai đang nói (bản vẽ 1.7 `AiDangNoi.dc.html`): đầu tin của mỗi lượt (Aris hay bot của phiên), tên
 * thành viên (linh vật, tên, nền theo màu linh vật; bấm mở hồ sơ), thẻ kết quả bot gửi về phiên.
 */
import { getMascot } from '@aris/ui-kit'
import {
  Mascot,
  arisNavigate,
  openBotSession,
  useSessionBot,
  useTeamData,
  type BotData,
} from '@aris/ui-kit/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Translate } from './locale.js'
import { clock } from './room-data.js'
import { botSource, inlineParts, mdBlocks, reportParts, splitMentions, type HandoffData } from './who-data.js'

const colorOf = (mascot: string) => getMascot(mascot)?.color ?? '#64748B'

/** Tên thành viên trong chữ: bấm mở hồ sơ bot. */
export function Who({ bot, inverse, t }: { bot: BotData; inverse?: boolean; t: Translate }) {
  return (
    <button
      type="button"
      className={inverse ? 'aris-who inv' : 'aris-who'}
      style={{ '--who': colorOf(bot.mascot) } as CSSProperties}
      title={t('who.open', { name: bot.name })}
      onClick={() => arisNavigate('bot', { id: bot.id })}
    >
      <Mascot id={bot.mascot} size={18} />
      {bot.name}
    </button>
  )
}

/** Chữ có `@tên`: tên của bot trong đội thành {@link Who}, phần còn lại giữ nguyên. */
export function WithMentions({ text, t }: { text: string; t: Translate }) {
  const bots = useTeamData()?.bots ?? []
  const byHandle = new Map(bots.map((b) => [b.handle.toLowerCase(), b]))
  return (
    <>
      {splitMentions(text, new Set(byHandle.keys())).map((p, i) =>
        p.kind === 'mention' ? <Who key={i} bot={byHandle.get(p.handle)!} t={t} /> : p.text,
      )}
    </>
  )
}

/** Nhãn vai cạnh tên: Aris "Điều phối", bot ngoài "bot ngoài · Claude Code", bot khác theo chức danh. */
function roleOf(bot: BotData, t: Translate): string {
  if (bot.kind === 'commander') return t('room.lead')
  if (bot.external) return t('who.external', { agent: t(`ext.agent.${bot.external.agent}`) })
  return bot.role
}

export function Head({
  bot,
  time,
  note,
  big,
  bare,
  t,
}: {
  bot: BotData
  time?: string
  note?: string
  /** Đầu lượt (phương án B): linh vật 32px đứng ở cột trái, tên mang màu linh vật. */
  big?: boolean
  /** Linh vật đã vẽ ở cột trái (lượt chuyển giao): đầu tin chỉ còn tên. */
  bare?: boolean
  t: Translate
}) {
  const lead = bot.kind === 'commander'
  return (
    <div
      className={big ? 'aris-head big' : 'aris-head'}
      style={{ '--who': colorOf(bot.mascot) } as CSSProperties}
    >
      {!bare && <Mascot id={bot.mascot} size={big ? 32 : 24} />}
      <b className="nm">{bot.name}</b>
      {roleOf(bot, t) && <span className={lead ? 'role lead' : 'role'}>{roleOf(bot, t)}</span>}
      <span className="time">{[note, time].filter(Boolean).join(' · ')}</span>
    </div>
  )
}

/** Mốc giờ của sự kiện dsh (số mili giây hoặc chuỗi ISO). */
function timeOf(v: unknown): string {
  const d = typeof v === 'number' || typeof v === 'string' ? new Date(v) : undefined
  return d && !Number.isNaN(d.getTime()) ? clock(d.toISOString()) : ''
}

/** Đầu tin của lượt (`conversation.chat.node`, kiểu `aris-turn-head`): ai trả lời trong phiên này. */
export function TurnHead({
  node,
  sessionId,
  t,
}: {
  node: { data: { time?: number | string } }
  sessionId: string
  t: Translate
}) {
  const bot = useSessionBot(sessionId)
  const ref = useRef<HTMLDivElement>(null)
  const color = bot ? colorOf(bot.mascot) : undefined
  // Màu của người trả lời cho cả khung dòng chảy: các dòng của lượt (dsh vẽ) thụt vào và có vạch màu này.
  useEffect(() => {
    const flow = ref.current?.closest<HTMLElement>('[data-slot="conversation.chat.flow"]')
    if (flow && color) flow.style.setProperty('--aris-who', color)
  }, [color])
  if (!bot) return null
  return (
    <div ref={ref} className="aris aris-turn-head">
      <Head bot={bot} time={timeOf(node.data.time)} big t={t} />
    </div>
  )
}

/** Kết quả một bot gửi về phiên (`conversation.chat.node`, kiểu `aris-bot-report`). */
export function BotReport({
  node,
  t,
}: {
  node: { data: { time?: number | string; source: unknown; text: string } }
  t: Translate
}) {
  const data = useTeamData()
  const [open, setOpen] = useState(false)
  const src = botSource(node.data.source)
  if (!src) return null
  const bot: BotData = data?.bots.find((b) => b.id === src.bot) ?? {
    id: src.bot,
    kind: 'member',
    handle: src.bot,
    name: src.name,
    role: '',
    description: '',
    soul: '',
    mascot: 'dev',
    createdAt: '',
  }
  const { status, body } = reportParts(node.data.text)
  const long = body.split('\n').length > 8 || body.length > 700
  return (
    <div className="aris aris-report">
      <Head bot={bot} time={timeOf(node.data.time)} note={t('who.reported')} t={t} />
      {status && <div className="st">{status}</div>}
      {body && (
        <div className={long && !open ? 'x clamp' : 'x'}>
          {inlineParts(body).map((p, i) =>
            p.kind === 'bold' ? (
              <b key={i}>
                <WithMentions text={p.text} t={t} />
              </b>
            ) : p.kind === 'code' ? (
              <code key={i}>{p.text}</code>
            ) : (
              <WithMentions key={i} text={p.text} t={t} />
            ),
          )}
        </div>
      )}
      {long && (
        <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('who.less') : t('who.more')}
        </button>
      )}
    </div>
  )
}

/** `@tên` trong tin của người dùng (`conversation.user.text.node`, khoá `aris-bot`). */
export function UserMention({ node, t }: { node: { data: { handle: string } }; t: Translate }) {
  const data = useTeamData()
  const bot = data?.bots.find((b) => b.handle.toLowerCase() === node.data.handle)
  return bot ? <Who bot={bot} inverse t={t} /> : <>@{node.data.handle}</>
}

/** Chữ trong một khối: đậm, mã, tên thành viên. */
function Inline({ text, t }: { text: string; t: Translate }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.kind === 'bold' ? (
          <b key={i}>
            <WithMentions text={p.text} t={t} />
          </b>
        ) : p.kind === 'code' ? (
          <code key={i}>{p.text}</code>
        ) : (
          <WithMentions key={i} text={p.text} t={t} />
        ),
      )}
    </>
  )
}

/** Câu trả lời Markdown của bot (đoạn, tiêu đề, danh sách, mã). */
export function BotText({ text, t }: { text: string; t: Translate }) {
  return (
    <div className="aris-bot-text">
      {mdBlocks(text).map((b, i) =>
        b.kind === 'h' ? (
          <p key={i}>
            <b>
              <Inline text={b.text} t={t} />
            </b>
          </p>
        ) : b.kind === 'p' ? (
          <p key={i}>
            <Inline text={b.text} t={t} />
          </p>
        ) : b.kind === 'code' ? (
          <pre key={i}>
            <code>{b.text}</code>
          </pre>
        ) : b.kind === 'ul' ? (
          <ul key={i}>
            {b.items.map((x, j) => (
              <li key={j}>
                <Inline text={x} t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((x, j) => (
              <li key={j}>
                <Inline text={x} t={t} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  )
}

/**
 * Chuyển giao (`conversation.chat.node`, kiểu `aris-handoff`, bản vẽ 1.8): dòng "Chuyển cho …" dưới
 * vạch của Aris, rồi lượt của bot đích (linh vật cột trái, vạch màu của bot), nút nhắn tiếp với bot.
 */
export function HandoffTurn({
  node,
  openSession,
  t,
}: {
  node: { data: HandoffData }
  openSession: (sessionId: string) => void
  t: Translate
}) {
  const data = useTeamData()
  const h = node.data
  const bot: BotData = data?.bots.find((b) => b.id === h.bot) ?? {
    id: h.bot,
    kind: 'member',
    handle: h.handle,
    name: h.name,
    role: h.role ?? '',
    description: '',
    soul: '',
    mascot: 'dev',
    createdAt: '',
  }
  return (
    <div className="aris aris-handoff">
      <div className="hand">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h12M13 6l6 6-6 6" />
        </svg>
        <span>
          {t('handoff.to')} <Who bot={bot} t={t} />
        </span>
        {h.reason && <span className="why">· {h.reason}</span>}
      </div>
      <div className="turn" style={{ '--who': colorOf(bot.mascot) } as CSSProperties}>
        <div className="gut">
          <Mascot id={bot.mascot} size={32} />
          <span className="rail" />
        </div>
        <div className="col">
          <Head bot={bot} time={clock(h.at)} note={t('handoff.from')} big bare t={t} />
          <BotText text={h.text} t={t} />
          <div className="acts">
            <button
              type="button"
              className="cont"
              onClick={() => void openBotSession(bot.id).then(openSession, () => undefined)}
            >
              {t('handoff.continue', { name: bot.name })} ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
