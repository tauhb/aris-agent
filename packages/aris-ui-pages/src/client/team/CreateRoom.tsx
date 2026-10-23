/**
 * 1.5 · Tạo phòng: tên, thành viên (Aris luôn chủ trì), thư mục làm việc, mục tiêu,
 * luật trò chuyện. "Chọn…" và "Tạo phòng" dùng bộ chọn thư mục và tạo workspace
 * thật của dsh; thành viên và mục tiêu nối ở giai đoạn 2.
 */
import { Button, Dialog, Mascot, TextInput } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Disclosure } from '../ui.js'
import { botName } from '../mind/names.js'
import { DEMO_ROOM as R } from './demo.js'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }

export interface RoomActions {
  pickDirectory(): Promise<string | null>
  createRoom(path: string): Promise<void>
}

export function CreateRoom({ t, nav, rooms }: PageProps & { rooms: RoomActions }) {
  const [members, setMembers] = useState(R.members)
  const [dir, setDir] = useState(R.dir)
  const [adv, setAdv] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = Object.values(members).filter(Boolean).length
  const create = async () => {
    setBusy(true)
    try {
      await rooms.createRoom(dir)
      nav.close()
    } catch (err) {
      console.error('aris: không tạo được phòng', err)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      width={620}
      title={t('room.title')}
      description={t('room.intro')}
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      <label className="a-field">
        <span className="l">{t('room.name')}</span>
        <TextInput defaultValue={R.name} />
      </label>
      <div>
        <div className="ap-lb" style={{ color: 'var(--a-ink)', paddingBottom: 6 }}>
          {t('room.members')}{' '}
          <span className="a-muted" style={{ fontWeight: 400 }}>
            {t('room.count', { n: count })}
          </span>
        </div>
        <div role="group" aria-label={t('room.pick')} className="ap-tags" style={{ gap: 6 }}>
          {Object.entries(members).map(([id, on]) => (
            <button
              key={id}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-pressed={on}
              className="ap-chip ap-pick"
              onClick={() => id !== 'aris' && setMembers({ ...members, [id]: !on })}
            >
              <Mascot id={id} size={18} />
              {R.external[id] ?? botName(id)}
              {id === 'aris' && <span className="a-muted"> {t('room.lead')}</span>}
              {R.external[id] && <span className="a-muted"> {t('room.external')}</span>}
            </button>
          ))}
        </div>
      </div>
      <label className="a-field">
        <span className="l">{t('room.dir')}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <TextInput mono value={dir} onChange={(e) => setDir(e.currentTarget.value)} />
          <Button
            onClick={async () => {
              const picked = await rooms.pickDirectory()
              if (picked) setDir(picked)
            }}
          >
            {t('room.choose')}
          </Button>
        </span>
        <span className="h">{t('room.dirHint')}</span>
      </label>
      <label className="a-field">
        <span className="l">
          {t('room.goal')}{' '}
          <span className="a-muted" style={{ fontWeight: 400 }}>
            {t('room.optional')}
          </span>
        </span>
        <textarea
          className="a-inp"
          rows={2}
          defaultValue={R.goal}
          style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
        />
      </label>
      <Disclosure
        title={t('cb.advanced')}
        hint={t('room.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <div className="ap-frow">
          <span>{t('room.maxRounds')}</span>
          <span className="a-muted">3</span>
        </div>
        <div className="ap-frow">
          <span>{t('room.maxMessages')}</span>
          <span className="a-muted">10</span>
        </div>
        <label className="ap-frow">
          <span>{t('room.stopCmd')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
        <label className="ap-frow">
          <span>{t('room.leadSummary')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
      </Disclosure>
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg" disabled={busy} onClick={create}>
          {t('room.create')}
        </Button>
      </div>
    </Dialog>
  )
}
