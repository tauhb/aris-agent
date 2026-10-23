/** 2.4 · Nhân bản hoặc xuất một bot: chọn phần được sao chép; kênh nhắn tin không bao giờ sao chép. */
import { Button, Dialog, Mascot, Tabs, TextInput } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { botName } from '../mind/names.js'
import { DEMO_PROFILE } from './demo.js'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)', marginTop: 2, flex: 'none' }

export function CloneBot({ t, nav, params }: PageProps) {
  const id = params.id ?? DEMO_PROFILE.id
  const name = botName(id)
  const [tab, setTab] = useState<'clone' | 'export'>('clone')
  const parts: [string, string | null, boolean][] = [
    [t('clone.config'), t('clone.configHint'), true],
    [t('clone.soul'), null, true],
    [t('clone.skills', { n: DEMO_PROFILE.skillCount }), t('clone.skillsHint'), true],
    [t('clone.memory'), t('clone.memoryHint'), false],
    [t('clone.keys'), null, true],
  ]
  return (
    <Dialog
      open
      width={620}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mascot id={id} size={28} />
          {t('clone.title', { name })}
        </span>
      }
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      <Tabs
        label={t('clone.title', { name })}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'clone', label: t('clone.cloneTab') },
          { value: 'export', label: t('clone.exportTab') },
        ]}
      />
      {tab === 'clone' && (
        <label className="a-field">
          <span className="l">{t('clone.newName')}</span>
          <TextInput defaultValue={`${name} 2 — nghiên cứu sản phẩm`} />
        </label>
      )}
      {tab === 'export' && (
        <p className="a-muted" style={{ margin: 0, fontSize: 13 }}>
          {t('clone.exportHint')}
        </p>
      )}
      <div>
        {parts.map(([title, hint, on]) => (
          <label className="ap-ck" key={title}>
            <input type="checkbox" defaultChecked={on} style={check} />
            <span>
              <b>{title}</b>
              {hint && (
                <>
                  <br />
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    {hint}
                  </span>
                </>
              )}
            </span>
          </label>
        ))}
        <div className="ap-ck">
          <input type="checkbox" disabled aria-label={t('clone.channels')} style={check} />
          <span>
            <b>{t('clone.channels')}</b>
            <br />
            <span style={{ fontSize: 12.5, color: 'var(--a-warn)' }}>{t('clone.channelsHint')}</span>
          </span>
        </div>
        <div className="a-muted" style={{ fontSize: 12.5, paddingTop: 10 }}>
          {t('clone.noHistory')}
        </div>
      </div>
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg">
          {tab === 'clone' ? t('clone.create') : t('clone.export')}
        </Button>
      </div>
    </Dialog>
  )
}
