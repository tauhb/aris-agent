/**
 * 6.2c · Tìm theo nghĩa (bản vẽ `TimTheoNghia.dc.html`): bot tìm bộ não, ký ức theo nghĩa, không chỉ theo từ
 * khoá. Cột trái: model nhúng (và khoá của provider đó) cùng phần nào được gửi đi nhúng. Cột phải: chỉ mục,
 * tiến độ và thử tìm. Dữ liệu qua `/api/aris/brain?semantic` (`@aris/brain`).
 * Chưa có từ API nên không vẽ: chi phí nhúng (sổ chi phí chưa ghi lần nhúng), nguồn "Hồ sơ chủ nhân".
 */
import { Card, PageShell } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Col, Dot } from '../ui.js'
import { providerLabel } from './Media.js'
import { providerColor } from './provider-data.js'
import { EmbedSelect, IndexCard, SendCard, StateBadge, useSemantic } from './Semantic.js'

export function SemanticPage({ t, nav }: PageProps) {
  const sem = useSemantic()
  const d = sem.data
  // Khoá của provider nhúng: model đang chọn, chưa chọn thì provider của model nhúng đầu tiên.
  const provider = d?.model?.provider ?? d?.models[0]?.provider
  const name = provider ? providerLabel(provider) : ''
  return (
    <PageShell
      title={t('sec.semantic')}
      subtitle={t('tn.subtitle')}
      actions={d?.available ? <StateBadge t={t} state={d.state} /> : undefined}
    >
      {!d ? (
        <div className="a-muted">…</div>
      ) : !d.available ? (
        <div className="a-muted">{t('sm.unavailable')}</div>
      ) : (
        <div className="ap-cols">
          <Col basis={380}>
            <Card title={t('tn.embedTitle')} subtitle={t('tn.embedHint')}>
              <div className="ap-grid2">
                <span>{t('tn.model')}</span>
                <EmbedSelect t={t} sem={sem} />
              </div>
              {provider && (
                <div className="ap-grid2">
                  <span>{t('tn.keyOf', { name })}</span>
                  <span
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 12.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: d.hasKey ? 'var(--a-ok)' : 'var(--a-warn)' }}>
                      <Dot color={providerColor(provider)} size={8} />{' '}
                      {t(d.hasKey ? 'tn.keySaved' : 'tn.keyNone')}
                    </span>
                    <a
                      className="ap-link"
                      style={{ fontSize: 12.5 }}
                      onClick={() => nav.go('settings', { section: 'provider', provider })}
                    >
                      {t('tn.toProviders')}
                    </a>
                  </span>
                </div>
              )}
              {d.model?.provider === 'google' && (
                <div style={{ padding: '9px 14px', borderTop: '1px solid var(--a-line)' }}>
                  <div
                    className="ap-box2"
                    style={{ background: 'var(--a-warnSoft)', display: 'flex', gap: 8 }}
                  >
                    <b style={{ color: 'var(--a-warn)' }}>!</b>
                    <span>{t('tn.freeWarn')}</span>
                  </div>
                </div>
              )}
              {d.model && (
                <div
                  className="a-muted"
                  style={{ padding: '9px 14px', fontSize: 12, borderTop: '1px solid var(--a-line)' }}
                >
                  {t('sm.reembedHint')}
                </div>
              )}
            </Card>
            <SendCard t={t} sem={sem} />
          </Col>
          <Col basis={380}>
            <IndexCard t={t} sem={sem} />
          </Col>
        </div>
      )}
    </PageShell>
  )
}
