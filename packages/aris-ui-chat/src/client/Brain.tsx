/**
 * Bộ não trong khung chat (giai đoạn 5, đợt 3b; bản vẽ 5.7): nhãn trang trong tin của người dùng, dòng
 * công cụ "Tra bộ não" / "Đọc trang", nút "Từ Second Brain" ở ô nhập, nhóm "Trang bộ não" trong menu `@`.
 */
import { IconButton } from '@aris/ui-kit/react'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  brainPages,
  brainUrl,
  cachedPages,
  findPage,
  layerClass,
  matchPages,
  type BrainPage,
  type PickPage,
} from './brain-data.js'
import type { SubagentCall } from './branch.js'
import type { ChatKey, Translate } from './locale.js'

const PageIcon = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5" />
  </svg>
)
const BookIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
  </svg>
)

function usePages(): readonly BrainPage[] {
  const [pages, setPages] = useState(cachedPages)
  useEffect(() => {
    let live = true
    void brainPages().then((p) => live && setPages(p))
    return () => {
      live = false
    }
  }, [])
  return pages
}

/** Nhãn trang (tin của người dùng, dòng công cụ): bấm thì thẻ xem nhanh (bắt ở `brain-dom.ts`). */
export function PageChip({ page, text }: { page?: BrainPage | undefined; text: string }) {
  if (!page) return <span className="aris-pg none">{text}</span>
  return (
    <button type="button" className={`aris-pg ${layerClass(page.layer)}`.trim()} data-path={page.path}>
      <PageIcon />
      {text}
    </button>
  )
}

/** `[[...]]` trong tin của người dùng (quy tắc chữ `aris-page`). */
export function UserPage({ node }: { node: { data: { ref: string; shown?: string } } }) {
  const pages = usePages()
  const page = findPage(pages, node.data.ref)
  return <PageChip page={page} text={node.data.shown || page?.title || node.data.ref} />
}

const LAYER_OF: Record<string, string> = { wiki: 'wiki', nguồn: 'nguon', 'nhật ký': 'nhat-ky' }

/** Kết quả `brain_search`: `N. [[ten]] · Tiêu đề — Không gian / lớp / nhóm`. */
export function parseSearch(text: string): { name: string; title: string; where: string; layer: string }[] {
  const out: { name: string; title: string; where: string; layer: string }[] = []
  for (const m of text.matchAll(/^\d+\. \[\[([^\]]+)\]\] · (.+?) — (.+)$/gm)) {
    const parts = m[3]!.split(' / ')
    out.push({
      name: m[1]!,
      title: m[2]!,
      where: [parts[0], parts.slice(2).join(' / ')].filter(Boolean).join(' · '),
      layer: LAYER_OF[parts[1] ?? ''] ?? 'wiki',
    })
  }
  return out
}

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

/** Dòng công cụ "Tra bộ não": từ khoá, số trang, mỗi trang một dòng (lớp, tiêu đề, nơi). */
export function BrainSearchCall(props: SubagentCall & { t: Translate }) {
  const { t } = props
  const pages = usePages()
  const q = String(argsOf(props).query ?? '')
  const hits = parseSearch(resultText(props))
  const done = props.phase === 'result'
  return (
    <div className="aris aris-bcall">
      <div className="h">
        <BookIcon size={15} />
        <b>{t('brain.tool.search')}</b>
        {q && <span className="mut">“{q}”</span>}
        <span className="mut end">
          {!done
            ? t('brain.tool.searching')
            : hits.length
              ? t('brain.tool.n', { n: hits.length })
              : t('brain.tool.none')}
        </span>
      </div>
      {hits.slice(0, 8).map((h) => (
        <div className="r" key={h.name}>
          <span className={`lay ${layerClass(h.layer)}`.trim()}>
            {t(`brain.layer.${h.layer}` as ChatKey)}
          </span>
          <PageChip page={findPage(pages, h.name)} text={h.title} />
          <span className="mut end">{h.where}</span>
        </div>
      ))}
    </div>
  )
}

/** Dòng công cụ "Đọc trang": nhãn trang (bấm xem nhanh). */
export function BrainReadCall(props: SubagentCall & { t: Translate }) {
  const { t } = props
  const pages = usePages()
  const ten = String(argsOf(props).ten ?? '').replace(/^\[\[|\]\]$/g, '')
  const text = resultText(props)
  const title = /^# (.+)$/m.exec(text)?.[1]
  const path = /^Đường dẫn: (\S+)/m.exec(text)?.[1]
  const page = (path && pages.find((p) => p.path === path)) || findPage(pages, ten)
  return (
    <div className="aris aris-bcall">
      <div className="h">
        <PageIcon size={15} />
        <b>{t('brain.tool.read')}</b>
        <PageChip page={page} text={title ?? page?.title ?? ten} />
      </div>
    </div>
  )
}

/** Nút "Từ Second Brain" ở ô nhập và ô chọn trang (bản vẽ 5.7 C). */
export function BrainPicker({
  insert,
  sessionId,
  t,
}: {
  insert: (text: string) => void
  sessionId: string
  t: Translate
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [space, setSpace] = useState<'' | 'ca-nhan' | 'cong-ty'>('')
  const [list, setList] = useState<PickPage[]>([])
  const [bot, setBot] = useState<{ id: string; name: string } | null>(null)
  const [sel, setSel] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ pick: q, session: sessionId, ...(space ? { space } : {}) })
      void fetch(brainUrl(`?${p.toString()}`))
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ pages: PickPage[]; bot: { id: string; name: string } | null }>)
            : null,
        )
        .then((j) => {
          if (!live || !j) return
          setList(j.pages)
          setBot(j.bot)
          setSel(0)
        })
        .catch(() => undefined)
    }, 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, q, space, sessionId])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  const choose = (p: PickPage) => {
    setOpen(false)
    setQ('')
    insert(`[[${p.title}]] `)
  }
  const place = (p: PickPage) =>
    [t(`brain.space.${p.space}` as ChatKey), p.dept ?? p.group].filter(Boolean).join(' · ')

  return (
    <span className="aris aris-bpick" ref={box}>
      <IconButton label={t('brain.pick')} size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <BookIcon />
      </IconButton>
      {open && (
        <div className="pop" role="dialog" aria-label={t('brain.pick')}>
          <div className="top">
            <input
              autoFocus
              value={q}
              placeholder={t('brain.search')}
              aria-label={t('brain.search')}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSel((s) => Math.min(list.length - 1, s + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSel((s) => Math.max(0, s - 1))
                } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (list[sel]) choose(list[sel])
                } else if (e.key === 'Escape') setOpen(false)
              }}
            />
            <span className="tabs" role="tablist" aria-label={t('brain.pick')}>
              {(['', 'ca-nhan', 'cong-ty'] as const).map((s) => (
                <button
                  type="button"
                  role="tab"
                  key={s}
                  aria-selected={space === s}
                  className={space === s ? 'on' : ''}
                  onClick={() => setSpace(s)}
                >
                  {t(s === '' ? 'brain.all' : s === 'ca-nhan' ? 'brain.personal' : 'brain.company')}
                </button>
              ))}
            </span>
          </div>
          {!list.length && <div className="mut row">{t('brain.empty')}</div>}
          {list.map((p, i) => (
            <button
              type="button"
              key={p.path}
              className={i === sel ? 'row sel' : 'row'}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(p)}
            >
              <span className={`lay ${layerClass(p.layer)}`.trim()}>
                {t(`brain.layer.${p.layer}` as ChatKey)}
              </span>
              <b>{p.title}</b>
              <span className="mut">{place(p)}</span>
              {!p.readable && bot && <span className="lock">{t('brain.locked', { bot: bot.name })}</span>}
            </button>
          ))}
          <div className="mut foot">{t('brain.hint')}</div>
        </div>
      )}
    </span>
  )
}

interface Candidate {
  name: string
  label?: string
  description?: string
  icon?: ComponentType<{ size?: number | undefined; className?: string | undefined }>
  section?: string
}

/** Nhóm "Trang bộ não" trong menu `@` (sau nhóm bot): gõ `@chi ha` thì chọn được trang, chèn `[[Tiêu đề]]`. */
export function brainTriggerSource(text: { section: () => string; place: (p: BrainPage) => string }) {
  return {
    trigger: '@' as const,
    name: 'aris-brain',
    order: -50,
    candidates: async (_session: unknown, req: { query: string }): Promise<readonly Candidate[]> => {
      if (req.query.trim().length < 2) return []
      const section = text.section()
      return matchPages(await brainPages(), req.query).map((p) => ({
        name: p.name,
        label: p.title,
        description: text.place(p),
        icon: ({ className }) => (
          <span className={`aris-pg ${layerClass(p.layer)} ${className ?? ''}`.trim()}>
            <PageIcon />
          </span>
        ),
        section,
      }))
    },
    onPick: ({ candidate }: { candidate: Candidate }) => ({
      text: `[[${candidate.label ?? candidate.name}]] `,
    }),
  }
}
