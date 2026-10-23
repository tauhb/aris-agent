/**
 * Hộp thoại cài (bản vẽ 6.7b): xác nhận gói, phiên bản, nguồn → đang cài kèm nhật ký → xong.
 * Cài nhiều gói (cập nhật tất cả) thì lần lượt từng gói.
 */
import { Button, Dialog } from '@aris/ui-kit/react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeResult, InstallProgress, PageProps, PluginSource } from '../../page.js'
import { newRequestId, outcomeOf, type ChangeOutcome } from './model.js'

type T = PageProps['t']

export interface InstallItem {
  title: string
  spec: string
  version?: string | undefined
  source: string
  registry?: string | undefined
  /** Gói chính thức cài theo yêu cầu: cài xong thì bật gói này. */
  enable?: string | undefined
}

type Phase = 'confirm' | 'running' | 'done'

export function InstallDialog({
  t,
  src,
  items,
  onClose,
  onResult,
}: {
  t: T
  src: PluginSource
  items: readonly InstallItem[]
  onClose: () => void
  /** Mỗi gói cài xong (để trang thêm vào danh sách cần khởi động lại, nạp lại). */
  onResult: (item: InstallItem, r: ChangeResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [log, setLog] = useState('')
  const [results, setResults] = useState<{ title: string; outcome: ChangeOutcome }[]>([])
  const request = useRef<string | null>(null)
  const cancelled = useRef(false)
  const logBox = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const offLog = src.on('log', (c) => {
      if (c.requestId && c.requestId !== request.current) return
      setLog((l) => (l + c.text).slice(-20_000))
    })
    const offState = src.on('state', (p) => {
      if (p.requestId === request.current) setProgress(p)
    })
    return () => {
      offLog()
      offState()
    }
  }, [src])

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight })
  }, [log])

  const run = async () => {
    setPhase('running')
    for (const [i, item] of items.entries()) {
      if (cancelled.current) break
      setIndex(i)
      setProgress(null)
      const id = newRequestId()
      request.current = id
      const r = await src.install(item.spec, id, item.registry)
      const outcome: ChangeOutcome = r.ok ? outcomeOf(r.value) : { kind: 'failed', detail: r.error }
      setResults((xs) => [...xs, { title: item.title, outcome }])
      if (r.ok) onResult(item, r.value)
    }
    request.current = null
    setPhase('done')
  }

  const cancel = () => {
    cancelled.current = true
    if (request.current) void src.cancel(request.current)
  }

  const item = items[index] ?? items[0]!
  const many = items.length > 1
  const title =
    phase === 'confirm'
      ? many
        ? t('pl.install.titleMany', { n: items.length })
        : t('pl.install.title', { name: item.title })
      : phase === 'running'
        ? t('pl.install.running', { name: item.title })
        : t('pl.install.done')

  const footer =
    phase === 'confirm' ? (
      <>
        <Button onClick={onClose}>{t('pl.cancel')}</Button>
        <Button variant="primary" onClick={() => void run()}>
          {t('pl.install.go')}
        </Button>
      </>
    ) : phase === 'running' ? (
      <Button variant="danger" onClick={cancel} disabled={progress?.phase === 'cancelling'}>
        {t('pl.install.cancel')}
      </Button>
    ) : (
      <Button variant="primary" onClick={onClose}>
        {t('pl.close')}
      </Button>
    )

  return (
    <Dialog open width={560} title={title} onClose={phase === 'running' ? () => {} : onClose} footer={footer}>
      {phase === 'confirm' && (
        <>
          {items.map((it) => (
            <div key={it.spec} className="ap-pl-kv">
              <span className="a-muted">{t('pl.install.pkg')}</span>
              <span className="a-mono" style={{ wordBreak: 'break-all' }}>
                {it.spec}
              </span>
              {it.version && (
                <>
                  <span className="a-muted">{t('pl.install.version')}</span>
                  <span>{it.version}</span>
                </>
              )}
              <span className="a-muted">{t('pl.install.source')}</span>
              <span>{it.source}</span>
            </div>
          ))}
          <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
            {t('pl.install.warn')}
          </p>
        </>
      )}
      {phase !== 'confirm' && (
        <>
          {phase === 'running' && (
            <div className="a-muted" style={{ fontSize: 12.5 }}>
              {[
                many && t('pl.install.step', { i: index + 1, n: items.length }),
                progress && t(`pl.install.phase.${progress.phase}`),
                progress?.attempt &&
                  progress.attempt.total > 1 &&
                  t('pl.install.attempt', { i: progress.attempt.index + 1, n: progress.attempt.total }),
              ]
                .filter(Boolean)
                .join(' · ') || t('pl.install.phase.installing')}
            </div>
          )}
          {results.map((r) => (
            <div key={r.title} style={{ fontSize: 13 }}>
              <b>{r.title}</b>{' '}
              <span
                style={{
                  color:
                    r.outcome.kind === 'failed'
                      ? 'var(--a-danger)'
                      : r.outcome.kind === 'cancelled'
                        ? undefined
                        : 'var(--a-ok)',
                }}
              >
                {r.outcome.kind === 'failed'
                  ? t('pl.result.failed', { error: r.outcome.detail })
                  : t(`pl.result.${r.outcome.kind}`)}
              </span>
            </div>
          ))}
          <pre ref={logBox} className="ap-pl-log a-mono">
            {log || t('pl.install.waiting')}
          </pre>
        </>
      )}
    </Dialog>
  )
}
