/**
 * Cột phải "Vừa làm gì" (bản vẽ `VanPhongNhatKy`): mỗi dòng có giờ, linh vật, pill tên bot, pill trạng thái và một câu. Dòng
 * Xong mở ra kết quả của bot ngay tại chỗ, dòng chờ duyệt có nút duyệt trên dòng, dòng hỏi {you} và dòng lỗi mở bảng chat
 * đúng phiên. Kết quả "đã nhận" lưu ở `localStorage` theo mã phiên. Dùng chung cho 2D và 3D.
 */
import { Mascot, answerApproval, branchColor, fetchExternalRun } from '@aris/ui-kit/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PageProps } from '../page.js'
import { MdShort } from './Md.js'
import { useResult, type FeedRange } from './data.js'
import {
  excerpt,
  externalResult,
  hasResult,
  isUnread,
  loadSeen,
  markSeen,
  pillOf,
  rowKey,
  saveSeen,
  unreadCount,
  type Seen,
} from './feedModel.js'
import { hhmm, type Face, type FeedItem } from './model.js'

type T = PageProps['t']

export interface FeedProps {
  t: T
  /** Các dòng đã lọc theo phòng ban; `null` là đang đọc. */
  lines: readonly FeedItem[] | null
  range: FeedRange
  onRange: (range: FeedRange) => void
  faceOf: (bot: string) => Face
  nameOf: (bot: string) => string
  /** Bot ngoài: kết quả đọc từ lần chạy, không có log phiên. */
  externalOf: (bot: string) => boolean
  /** Bot đang đợi {you} trả lời (dòng hỏi cũ thì không còn là "chờ"). */
  waitingOf: (bot: string) => boolean
  /** Mở bảng chat với bot, đúng phiên nếu có. */
  onChat: (bot: string, session?: string) => void
  /** Đọc lại nhật ký và danh sách duyệt (sau khi duyệt). */
  reload: () => void
  /** Màn hẹp: đóng ngăn trượt. */
  onClose: () => void
}

const FILE_ICON = (name: string) => (/\.(csv|tsv|xlsx?|json)$/i.test(name) ? '▦' : '▤')

/** Sao chép vào bộ nhớ tạm; trình duyệt chặn thì thôi. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Kết quả mở ra dưới một dòng Xong: đoạn đầu, tệp, ba nút. */
function Result({
  item,
  t,
  external,
  onChat,
  onReceive,
}: {
  item: FeedItem
  t: T
  external: boolean
  onChat: () => void
  onReceive: () => void
}) {
  const read = useResult(item.session, !external)
  const [run, setRun] = useState<ReturnType<typeof externalResult> | 'error' | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!external || !item.session) return
    let alive = true
    void fetchExternalRun(item.session)
      .then((r) => alive && setRun(r ? externalResult(r) : 'error'))
      .catch(() => alive && setRun('error'))
    return () => {
      alive = false
    }
  }, [external, item.session])
  const got = external ? run : read
  const data = got && got !== 'error' ? got : null
  const text = data?.text ?? ''
  const short = excerpt(text)

  return (
    <div className="ap-of-res">
      {got === null && <div className="ap-of-rt a-muted">{t('of.fd.loading')}</div>}
      {got === 'error' && <div className="ap-of-rt a-muted">{t('of.fd.noRead')}</div>}
      {data && (
        <>
          {text ? (
            <div className="ap-of-rt">
              <MdShort text={short.text} />
              {short.cut && '…'}
            </div>
          ) : (
            <div className="ap-of-rt a-muted">{t('of.fd.noText')}</div>
          )}
          {data.files.length > 0 && (
            <div className="ap-of-rf">
              {data.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="ap-of-file"
                  title={t('of.fd.copyPath', { path: f.path })}
                  onClick={() => void copy(f.path)}
                >
                  {FILE_ICON(f.name)} {f.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="ap-of-fa">
        <button type="button" className="ap-of-b1" onClick={onChat}>
          {t('of.fd.full')}
        </button>
        <button
          type="button"
          className="ap-of-b2"
          disabled={!text}
          onClick={() =>
            void copy(text).then((ok) => {
              if (!ok) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
        >
          {copied ? t('of.fd.copied') : t('of.fd.copy')}
        </button>
        <button type="button" className="ap-of-b2" onClick={onReceive}>
          {t('of.fd.receive')}
        </button>
      </div>
    </div>
  )
}

function Row({
  item,
  t,
  face,
  name,
  open,
  unread,
  external,
  botWaiting,
  decided,
  busy,
  onToggle,
  onChat,
  onReceive,
  onAnswer,
}: {
  item: FeedItem
  t: T
  face: Face
  name: string
  open: boolean
  unread: boolean
  external: boolean
  botWaiting: boolean
  /** Đã trả lời yêu cầu quyền của dòng này ngay tại đây. */
  decided: 'allow' | 'reject' | undefined
  busy: boolean
  onToggle: () => void
  onChat: () => void
  onReceive: () => void
  onAnswer: (allow: boolean) => void
}) {
  const pill = decided
    ? {
        tone: decided === 'allow' ? 'ok' : 'err',
        key: decided === 'allow' ? 'of.feed.k.approved' : 'of.feed.k.rejected',
      }
    : pillOf(item, botWaiting)
  const result = hasResult(item)
  // Dòng bấm vào được: Xong có kết quả thì mở ra; lỗi và đang làm có phiên thì mở bảng chat ở phiên đó.
  const action = result
    ? onToggle
    : (item.kind === 'failed' || item.kind === 'running') && item.session
      ? onChat
      : undefined
  const line =
    item.kind === 'asked' && item.approval
      ? t('of.fd.perm', { what: item.what })
      : item.kind === 'asked' && item.what
        ? t('of.fd.asks', { what: item.what })
        : item.what || t(`of.feed.k.${item.kind}`)
  return (
    <div className={`ap-of-fr${open ? ' open' : ''}${unread ? ' unread' : ''}`}>
      <div
        className={`ap-of-frh${action ? ' click' : ''}`}
        role={action ? 'button' : undefined}
        tabIndex={action ? 0 : undefined}
        aria-expanded={result ? open : undefined}
        onClick={action}
        onKeyDown={(e) => {
          if (action && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            action()
          }
        }}
      >
        <span className="ap-of-tm">{hhmm(item.at)}</span>
        <Mascot id={face.id} size={26} accessory={face.accessory} />
        <div className="ap-of-fx">
          <div className="ap-of-fl">
            <span className="ap-of-np" style={{ '--c': branchColor(face.id) } as CSSProperties}>
              {name}
            </span>
            <span className={`ap-of-sp ${pill.tone}`}>{t(pill.key)}</span>
          </div>
          <div className="ap-of-ft">{line}</div>
        </div>
      </div>
      {item.approval && !decided && (
        <div className="ap-of-fa ind">
          <button type="button" className="ap-of-b2" disabled={busy} onClick={() => onAnswer(false)}>
            {t('of.need.reject')}
          </button>
          <button type="button" className="ap-of-b1" disabled={busy} onClick={() => onAnswer(true)}>
            {t('of.need.approve')}
          </button>
          <button type="button" className="ap-of-b2 ghost" onClick={onChat}>
            {t('of.fd.view')}
          </button>
        </div>
      )}
      {item.kind === 'asked' && !item.approval && botWaiting && (
        <div className="ap-of-fa ind">
          <button type="button" className="ap-of-b1" onClick={onChat}>
            {t('of.need.answer')}
          </button>
        </div>
      )}
      {result && open && (
        <Result item={item} t={t} external={external} onChat={onChat} onReceive={onReceive} />
      )}
    </div>
  )
}

export function Feed(p: FeedProps) {
  const { t, lines } = p
  const [seen, setSeen] = useState<Seen>(loadSeen)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [decided, setDecided] = useState<Record<string, 'allow' | 'reject'>>({})
  const [busy, setBusy] = useState<string | null>(null)
  // Giữ bản "đã nhận" mới nhất cho hàm gọi trễ (lưu và đánh dấu không dẫm lên nhau).
  const seenRef = useRef(seen)
  seenRef.current = seen

  const receive = (item: FeedItem) => {
    const next = markSeen(seenRef.current, item)
    if (next === seenRef.current) return
    setSeen(next)
    saveSeen(next)
  }
  const toggle = (item: FeedItem) => {
    const key = rowKey(item)
    const isOpen = opened.has(key)
    setOpened((cur) => {
      const next = new Set(cur)
      if (isOpen) next.delete(key)
      else next.add(key)
      return next
    })
    // Mở xem là đã nhận.
    if (!isOpen) receive(item)
  }
  const answer = async (item: FeedItem, allow: boolean) => {
    if (!item.approval) return
    setBusy(item.approval)
    await answerApproval(item.approval, allow).catch(() => false)
    setDecided((cur) => ({ ...cur, [item.approval!]: allow ? 'allow' : 'reject' }))
    setBusy(null)
    p.reload()
  }

  const fresh = lines ? unreadCount(lines, seen) : 0
  return (
    <>
      <div className="ap-of-ch">
        <b className="ap-of-ct">{t('of.feed.title')}</b>
        {fresh > 0 && <span className="ap-of-sp new">{t('of.fd.fresh', { n: fresh })}</span>}
        <select
          className="ap-of-range"
          value={p.range}
          aria-label={t('of.fd.range')}
          onChange={(e) => p.onRange(e.target.value === '7d' ? '7d' : 'today')}
        >
          <option value="today">{t('of.fd.today')}</option>
          <option value="7d">{t('of.fd.week')}</option>
        </select>
        <button type="button" className="ap-of-colx" aria-label={t('of.col.close')} onClick={p.onClose}>
          ✕
        </button>
      </div>
      <div className="ap-of-cb">
        {lines?.length === 0 && <div className="a-muted ap-of-empty">{t('of.feed.empty')}</div>}
        {lines?.map((item) => {
          const key = rowKey(item)
          return (
            <Row
              key={key}
              item={item}
              t={t}
              face={p.faceOf(item.bot)}
              name={p.nameOf(item.bot)}
              open={opened.has(key)}
              unread={isUnread(item, seen)}
              external={p.externalOf(item.bot)}
              botWaiting={p.waitingOf(item.bot)}
              decided={item.approval ? decided[item.approval] : undefined}
              busy={busy === item.approval}
              onToggle={() => toggle(item)}
              onChat={() => p.onChat(item.bot, item.session)}
              onReceive={() => {
                receive(item)
                setOpened((cur) => {
                  const next = new Set(cur)
                  next.delete(key)
                  return next
                })
              }}
              onAnswer={(allow) => void answer(item, allow)}
            />
          )
        })}
      </div>
    </>
  )
}
