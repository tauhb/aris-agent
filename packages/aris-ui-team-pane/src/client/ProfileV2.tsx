/**
 * Hồ sơ bot ở khung phải (giao diện GĐ9, bản vẽ V10, V11, V12): mở từ viên tên bot ở đầu chat. Linh vật, tên,
 * ba thẻ Chi tiết / Thư viện / Máy; bánh răng mở "Cài đặt bot". Bot là bot của phiên đang mở (phiên chưa gắn
 * bot là của Aris). Mỗi dòng mở trình sửa đầy đủ đang có ở trang hồ sơ bot.
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GearIcon,
  Mascot,
  arisNavigate,
  openBotSession,
  useSessionBot,
  useTeamData,
  type BotData,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { Translate } from './locale.js'
import { profileGroups, type ProfileGroup, type ProfileRow, type ProfileView } from './profile-model.js'

interface TabInfo {
  tab: { navigation: { params?: unknown; revision: number } }
}

interface ScreenView {
  active: boolean
  screen?: { app: string; title: string; image?: { png: string } }
}

const api = (path: string) => new URL(`api/aris/${path}`, document.baseURI)

const viewOf = (params: unknown): ProfileView => {
  const v = (params as { view?: unknown } | undefined)?.view
  return v === 'computer' || v === 'library' || v === 'settings' ? v : 'details'
}

/** Bot của phiên; phiên chưa gắn bot là của Aris. */
function useProfileBot(sessionId: string | undefined): BotData | undefined {
  const bot = useSessionBot(sessionId)
  const data = useTeamData()
  return bot ?? data?.bots.find((b) => b.kind === 'commander')
}

/** Số routine đang bật của bot. */
function useRoutinesOn(botId: string | undefined): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!botId) return
    let alive = true
    void fetch(api(`routines?bot=${encodeURIComponent(botId)}`), { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ routines: { enabled: boolean }[] }>) : null))
      .then((d) => alive && d && setN(d.routines.filter((r) => r.enabled).length))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [botId])
  return n
}

/** Ảnh màn hình mới nhất của phiên khi bot đang dùng máy. */
function useScreen(sessionId: string | undefined, on: boolean): ScreenView | null {
  const [view, setView] = useState<ScreenView | null>(null)
  useEffect(() => {
    if (!on || !sessionId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const r = await fetch(api(`computer?screen=${encodeURIComponent(sessionId)}`), {
        credentials: 'same-origin',
      }).catch(() => null)
      const v = r?.ok ? ((await r.json()) as ScreenView) : null
      if (!alive) return
      setView(v)
      timer = setTimeout(() => void load(), 3000)
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [sessionId, on])
  return view
}

function Group({ group, t, onRow }: { group: ProfileGroup; t: Translate; onRow: (row: ProfileRow) => void }) {
  // Giá trị là khoá chữ (`pf.*`) thì dịch, còn lại hiện nguyên.
  const value = (v: string) => (v.startsWith('pf.') ? t(v as Parameters<Translate>[0]) : v)
  return (
    <>
      {group.title && <div className="g9-sub">{t(group.title as Parameters<Translate>[0])}</div>}
      <div className="g9-box">
        {group.rows.map((r) => {
          const body = (
            <>
              <span className="k">{t(r.label as Parameters<Translate>[0])}</span>
              {r.value && <span className="v">{value(r.value)}</span>}
              {r.target && (
                <span className="chev" style={r.value ? undefined : { marginLeft: 'auto' }}>
                  <ChevronRightIcon size={13} />
                </span>
              )}
            </>
          )
          return r.target ? (
            <button key={r.key} type="button" className="g9-li" onClick={() => onRow(r)}>
              {body}
            </button>
          ) : (
            <div key={r.key} className="g9-li">
              {body}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function ProfileV2({
  t,
  sessionId,
  useTabInfo,
  openSession,
}: {
  t: Translate
  sessionId?: string
  useTabInfo: () => TabInfo
  openSession: (id: string) => void
}) {
  const { tab } = useTabInfo()
  const [view, setView] = useState<ProfileView>(() => viewOf(tab.navigation.params))
  // Mở lại từ đầu chat (viên tên hay nút máy) thì về đúng thẻ được gọi.
  const revision = tab.navigation.revision
  const [seen, setSeen] = useState(revision)
  if (seen !== revision) {
    setSeen(revision)
    setView(viewOf(tab.navigation.params))
  }
  const bot = useProfileBot(sessionId)
  const data = useTeamData()
  const routinesOn = useRoutinesOn(bot?.id)
  const screen = useScreen(sessionId, view === 'computer')
  if (!bot) return <div className="aris g9-rp" />

  const modelId = bot.model?.model
  const model = data?.catalog?.flatMap((g) => g.models).find((m) => m.id === modelId)?.name ?? modelId
  const groups = profileGroups(bot, view, { model, routinesOn })
  const onRow = (row: ProfileRow) => {
    const target = row.target
    if (!target) return
    if (target.kind === 'topic') return void openBotSession(bot.id, true).then(openSession, () => {})
    if (target.kind === 'bot') return arisNavigate('bot', { id: bot.id, tab: target.tab })
    arisNavigate(target.to, target.params)
  }

  return (
    <div className="aris g9-rp">
      <div className="g9-rtop">
        {view === 'settings' ? (
          <button type="button" className="g9-back" onClick={() => setView('details')}>
            <ChevronLeftIcon size={13} />
            {t('pf.details')}
          </button>
        ) : (
          <span className="sp" />
        )}
        {view !== 'settings' && (
          <button
            type="button"
            className="g9-ib"
            aria-label={t('pf.settings')}
            title={t('pf.settings')}
            onClick={() => setView('settings')}
          >
            <GearIcon size={17} />
          </button>
        )}
      </div>
      {view === 'settings' ? (
        <div className="g9-prof">
          <b>{t('pf.settings')}</b>
          <span>{bot.name}</span>
        </div>
      ) : (
        <>
          <div className="g9-prof">
            <Mascot id={bot.mascot} size={76} accessory={bot.accessory} seed={bot.name} />
            <b>{bot.name}</b>
            {bot.role && <span>{bot.role}</span>}
          </div>
          <div className="g9-tabs" role="tablist">
            {(['details', 'library', 'computer'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="g9-tab"
                aria-pressed={view === id}
                aria-selected={view === id}
                onClick={() => setView(id)}
              >
                {t(`pf.tab.${id}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {groups.map((g) => (
        <Group key={g.key} group={g} t={t} onRow={onRow} />
      ))}
      {view === 'computer' && (
        <>
          <div className="g9-shot">
            {screen?.screen?.image ? (
              <img src={`data:image/png;base64,${screen.screen.image.png}`} alt={screen.screen.title} />
            ) : (
              <div className="none">{t('pf.noScreen')}</div>
            )}
          </div>
          {screen?.screen && (
            <div className="g9-note">
              {screen.screen.app} · {screen.screen.title}
            </div>
          )}
          <div className="g9-box">
            <button
              type="button"
              className="g9-li"
              onClick={() => arisNavigate('bot', { id: bot.id, tab: 'perms' })}
            >
              <span className="k">{t('pf.where')}</span>
              <span className="chev" style={{ marginLeft: 'auto' }}>
                <ChevronRightIcon size={13} />
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Tên tab ở dải tab khung phải: tên bot. */
export function ProfileTitle({ sessionId }: { sessionId?: string }) {
  const bot = useProfileBot(sessionId)
  return <>{bot?.name ?? 'Aris'}</>
}
