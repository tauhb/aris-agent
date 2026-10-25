/**
 * Ảnh, video bot tạo trong khung chat (giai đoạn 5, đợt 5c; bản vẽ 1.9): dòng công cụ "Tạo ảnh" / "Tạo video" với
 * mô tả gửi đi, trạng thái, ảnh hay video ngay trong tin, Mở lớn / Tải về / Lưu vào bộ não, model đã dùng và tiền;
 * không tạo được thì nói đã thử model nào, vì sao. Tệp lấy qua `/api/aris/media?file=<mã>`.
 */
import { useState } from 'react'
import type { SubagentCall } from './branch.js'
import type { ChatKey, Translate } from './locale.js'

interface Meta {
  kind: 'image' | 'video'
  ids: string[]
  model?: string
  usd?: number
  tried?: { model: string; kind: string }[]
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

/** Dòng `[aris-media] {...}` cuối kết quả công cụ. */
export function mediaMeta(text: string): Meta | undefined {
  const m = /\[aris-media\] (\{.*\})\s*$/m.exec(text)
  if (!m) return undefined
  try {
    const v = JSON.parse(m[1]!) as Meta
    return Array.isArray(v.ids) ? v : undefined
  } catch {
    return undefined
  }
}

const fileUrl = (id: string) =>
  new URL(`api/aris/media?file=${encodeURIComponent(id)}`, document.baseURI).href
const usd = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

async function saveToBrain(id: string, name: string): Promise<boolean> {
  const r = await fetch(fileUrl(id)).catch(() => null)
  if (!r?.ok) return false
  const bytes = new Uint8Array(await r.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const res = await fetch(new URL('api/aris/brain', document.baseURI), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'add', file: { name, data: btoa(bin) } }),
  }).catch(() => null)
  return !!res?.ok
}

function Item({ t, id, kind, n }: { t: Translate; id: string; kind: Meta['kind']; n: number }) {
  const [saved, setSaved] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle')
  const name = `${kind === 'image' ? 'anh' : 'video'}-${n}.${kind === 'image' ? 'png' : 'mp4'}`
  return (
    <figure className="aris-media-item">
      {kind === 'image' ? (
        <img src={fileUrl(id)} alt={t('media.alt', { n })} loading="lazy" />
      ) : (
        <video src={fileUrl(id)} controls preload="metadata" />
      )}
      <figcaption>
        <a href={fileUrl(id)} target="_blank" rel="noreferrer">
          {t('media.open')}
        </a>
        <a href={fileUrl(id)} download={name}>
          {t('media.download')}
        </a>
        <button
          type="button"
          disabled={saved === 'busy' || saved === 'ok'}
          onClick={() => {
            setSaved('busy')
            void saveToBrain(id, name).then((ok) => setSaved(ok ? 'ok' : 'fail'))
          }}
        >
          {t(saved === 'ok' ? 'media.saved' : saved === 'fail' ? 'media.saveFail' : 'media.save')}
        </button>
      </figcaption>
    </figure>
  )
}

const FAIL: Record<string, ChatKey> = {
  nokey: 'media.f.nokey',
  key: 'media.f.key',
  billing: 'media.f.billing',
  money: 'media.f.money',
  rate: 'media.f.rate',
  unsupported: 'media.f.unsupported',
  model: 'media.f.model',
  network: 'media.f.network',
}

export function MediaCall(props: SubagentCall & { t: Translate; kind: Meta['kind'] }) {
  const { t, kind } = props
  const args = argsOf(props)
  const done = props.phase === 'result'
  const text = resultText(props)
  const meta = done ? mediaMeta(text) : undefined
  const count = kind === 'video' ? 1 : Math.min(4, Math.max(1, Number(args.so_luong) || 1))
  const ratio = typeof args.ti_le === 'string' ? args.ti_le : kind === 'video' ? '16:9' : '1:1'
  const failed = done && (!meta || !meta.ids.length)
  const go = () =>
    document.dispatchEvent(
      new CustomEvent('aris:navigate', { detail: { to: 'settings', params: { section: 'media' } } }),
    )
  return (
    <div className="aris aris-media">
      <div className="h">
        <b>{t(kind === 'image' ? 'media.image' : 'media.video')}</b>
        <span className="mut">
          {kind === 'image' ? t('media.count', { n: count }) : t('media.oneVideo')} · {ratio}
          {meta?.model ? ` · ${meta.model}` : ''}
        </span>
        <span className={`st ${failed ? 'warn' : done ? 'ok' : ''}`}>
          {!done ? t('media.making') : failed ? t('media.failed') : t('media.done')}
        </span>
      </div>
      {typeof args.mo_ta === 'string' && <div className="p">{args.mo_ta}</div>}
      {!done && (
        <div className={`grid ${count > 1 ? 'two' : ''}`}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={`sk ${ratio === '9:16' ? 'tall' : ''}`} />
          ))}
        </div>
      )}
      {meta && meta.ids.length > 0 && (
        <>
          <div className={`grid ${meta.ids.length > 1 ? 'two' : ''}`}>
            {meta.ids.map((id, i) => (
              <Item key={id} t={t} id={id} kind={kind} n={i + 1} />
            ))}
          </div>
          <div className="foot mut">
            {t('media.cost', { n: meta.ids.length, usd: usd(meta.usd ?? 0) })}
            {meta.tried?.length
              ? ` · ${t('media.triedBefore', { list: meta.tried.map((x) => x.model).join(', ') })}`
              : ''}
          </div>
        </>
      )}
      {failed && (
        <div className="warnbox">
          <span>
            {meta?.tried?.length
              ? meta.tried.map((x) => `${x.model}: ${t(FAIL[x.kind] ?? 'media.f.other')}`).join(' · ')
              : text.split('\n')[0]}
          </span>
          <button type="button" onClick={go}>
            {t('media.settings')}
          </button>
        </div>
      )}
    </div>
  )
}
