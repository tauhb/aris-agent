/** 5.4 · Hỏi bộ não: câu trả lời chỉ dựa trên nguồn của anh, mỗi ý có số trích dẫn. */
import { Button, IconButton } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { DEMO_ASK as A } from './demo.js'

export function Ask({ t, nav }: PageProps) {
  const [scope, setScope] = useState(A.scopes[0])
  return (
    <div className="ap-split ap-brain">
      <main className="ap-note-main">
        <div className="ap-note-bar">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain')}>
            ‹
          </IconButton>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t('br.ask')}</span>
          <span className="a-muted" style={{ fontSize: 13 }}>
            {t('ask.subtitle')}
          </span>
        </div>
        <div className="ap-ask">
          <div className="ap-tags" style={{ alignItems: 'center' }} role="group" aria-label={t('ask.scope')}>
            <span className="a-muted">{t('ask.scope')}</span>
            {A.scopes.map((s) => (
              <button
                type="button"
                key={s}
                className="ap-chip ap-click"
                aria-pressed={s === scope}
                onClick={() => setScope(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ap-q">{A.question}</div>
          <div className="ap-ans">
            {A.answer.map((para, i) => (
              <p key={i}>
                {para.map((part, j) =>
                  typeof part === 'string' ? (
                    part
                  ) : 'b' in part ? (
                    <b key={j}>{part.b}</b>
                  ) : (
                    <a key={j} className="ap-cit" href={`#ap-src-${part.cite}`}>
                      {part.cite}
                    </a>
                  ),
                )}
              </p>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm">{t('ask.saveNote')}</Button>
              <Button size="sm">{A.followUp}</Button>
              <Button size="sm">{t('ask.copy')}</Button>
            </div>
          </div>
          <div className="a-card ap-askbox">
            <textarea
              className="ap-bare"
              rows={2}
              placeholder={t('ask.followUp')}
              aria-label={t('ask.question')}
            />
            <Button variant="primary" size="sm">
              {t('ask.send')}
            </Button>
          </div>
        </div>
      </main>
      <aside className="ap-aside" aria-label={t('ask.sources', { n: A.sources.length })}>
        <b>{t('ask.sources', { n: A.sources.length })}</b>
        {A.sources.map((s) => (
          <div className="ap-src" id={`ap-src-${s.n}`} key={s.n}>
            <span className="ap-cit">{s.n}</span>
            <span>
              <b>{s.title}</b>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {s.note}
              </div>
            </span>
          </div>
        ))}
        <div className="a-muted" style={{ fontSize: 12.5 }}>
          {t('ask.noGuess')}
        </div>
      </aside>
    </div>
  )
}
