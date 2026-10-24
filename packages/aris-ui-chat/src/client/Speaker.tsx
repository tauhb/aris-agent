/**
 * Ai đang nói (bản vẽ 1.7 `AiDangNoi.dc.html`): đầu tin của mỗi lượt (Aris hay bot của phiên), tên
 * thành viên (linh vật, tên, nền theo màu linh vật; bấm mở hồ sơ), thẻ kết quả bot gửi về phiên.
 */
import { getMascot } from '@aris/ui-kit'
import { Mascot, arisNavigate, useSessionBot, useTeamData, type BotData } from '@aris/ui-kit/react'
import { useState, type CSSProperties } from 'react'
import type { Translate } from './locale.js'
import { clock } from './room-data.js'
import { botSource, inlineParts, reportParts, splitMentions } from './who-data.js'

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

function Head({ bot, time, note, t }: { bot: BotData; time?: string; note?: string; t: Translate }) {
  const lead = bot.kind === 'commander'
  return (
    <div className="aris-head">
      <Mascot id={bot.mascot} size={24} />
      <b>{bot.name}</b>
      {roleOf(bot, t) && (
        <span
          className={lead ? 'role lead' : 'role'}
          style={lead ? undefined : ({ '--who': colorOf(bot.mascot) } as CSSProperties)}
        >
          {roleOf(bot, t)}
        </span>
      )}
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
  if (!bot) return null
  return (
    <div className="aris aris-turn-head">
      <Head bot={bot} time={timeOf(node.data.time)} t={t} />
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
