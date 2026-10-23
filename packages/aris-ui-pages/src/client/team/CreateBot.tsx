/** 2.1 · Tạo bot mới (bot của aris) và 2.1b · Thêm bot ngoài nói ACP, chung một hộp thoại hai loại. */
import { MASCOTS, getMascot } from '@aris/ui-kit'
import { Button, Dialog, Mascot, Segmented, TextInput } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { Disclosure, Dot } from '../ui.js'
import { botName } from '../mind/names.js'
import { DEMO_AGENTS, DEMO_CREATE_BOT as C } from './demo.js'

const check = { width: 18, height: 18, accentColor: 'var(--a-accent)' }

function ArisBot({ t, nav }: PageProps) {
  const [mascot, setMascot] = useState(C.suggested[0]!)
  const [template, setTemplate] = useState(C.template)
  const [clone, setClone] = useState<string>('blank')
  const [adv, setAdv] = useState(true)
  return (
    <>
      <div style={{ display: 'flex', gap: 24 }}>
        <div
          style={{
            flex: 'none',
            width: 210,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div className="ap-tile" style={{ width: 128, height: 128, borderRadius: 32 }}>
            <Mascot id={mascot} size={96} label={getMascot(mascot)?.shape} />
          </div>
          <div className="ap-lb" style={{ alignSelf: 'flex-start', color: 'var(--a-ink)' }}>
            {t('cb.mascot')}{' '}
            <span className="a-muted" style={{ fontWeight: 400 }}>
              {t('cb.mascotHint')}
            </span>
          </div>
          <div role="radiogroup" aria-label={t('cb.pickMascot')} className="ap-mascots">
            {C.suggested.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mascot === id}
                aria-label={getMascot(id)?.shape}
                onClick={() => setMascot(id)}
              >
                <Mascot id={id} size={30} />
              </button>
            ))}
          </div>
          <a className="ap-link" style={{ alignSelf: 'flex-start', fontSize: 12.5 }}>
            {t('cb.allMascots', { n: MASCOTS.length })}
          </a>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
              {t('cb.template')}
            </div>
            <div className="ap-tags" style={{ gap: 6 }}>
              {C.templates.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="ap-chip ap-pick"
                  aria-pressed={template === x}
                  onClick={() => setTemplate(x)}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
          <label className="a-field">
            <span className="l">{t('cb.name')}</span>
            <TextInput defaultValue={C.name} />
          </label>
          <label className="a-field">
            <span className="l">{t('cb.jobTitle')}</span>
            <TextInput defaultValue={C.title} />
          </label>
          <label className="a-field">
            <span className="l">{t('cb.about')}</span>
            <textarea
              className="a-inp"
              rows={3}
              defaultValue={C.about}
              style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }}
            />
            <span className="h">{t('cb.aboutHint', { name: C.name })}</span>
          </label>
        </div>
      </div>
      <Disclosure
        title={t('cb.advanced')}
        hint={t('cb.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <div className="ap-frow">
          <span>{t('cb.cloneFrom')}</span>
          <Segmented
            label={t('cb.cloneFrom')}
            value={clone}
            onChange={setClone}
            options={C.cloneFrom.map((id) => ({
              value: id,
              label: id === 'blank' ? t('cb.blank') : botName(id),
            }))}
          />
        </div>
        <div className="ap-frow">
          <span>{t('cb.model')}</span>
          <span className="ap-sel">
            <Dot color="#4D6BFE" size={8} />
            <span className="a-muted">DeepSeek</span>
            <b>deepseek-chat</b> ▾
          </span>
        </div>
        <div className="ap-frow">
          <span>{t('cb.perms')}</span>
          <span className="a-muted">{t('cb.permsValue')}</span>
        </div>
        <div className="ap-frow">
          <span>{t('cb.channel')}</span>
          <span className="a-muted">{t('cb.channelValue')}</span>
        </div>
        <label className="ap-frow">
          <span>{t('cb.copyKeys')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
        <label className="ap-frow">
          <span>{t('cb.delegable')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
      </Disclosure>
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg">
          {t('cb.create')}
        </Button>
      </div>
    </>
  )
}

function ExternalBot({ t, nav }: PageProps) {
  const [agent, setAgent] = useState<string>('claude')
  const [perm, setPerm] = useState<'ask' | 'reject' | 'allow'>('ask')
  const [adv, setAdv] = useState(false)
  const a = DEMO_AGENTS.find((x) => x.id === agent)!
  const name = 'Khoa'
  return (
    <>
      <div style={{ display: 'flex', gap: 24 }}>
        <div
          style={{
            flex: 'none',
            width: 150,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div className="ap-tile" style={{ width: 112, height: 112, borderRadius: 28 }}>
            <Mascot id="banh-rang" size={84} />
          </div>
          <a className="ap-link" style={{ fontSize: 12.5 }}>
            {t('ext.changeMascot')}
          </a>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
              {t('ext.agent')}{' '}
              <span className="a-muted" style={{ fontWeight: 400 }}>
                {t('ext.detected')}
              </span>
            </div>
            <div role="radiogroup" aria-label={t('ext.agent')} className="ap-tags" style={{ gap: 6 }}>
              {DEMO_AGENTS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  className="ap-chip ap-pick"
                  aria-checked={agent === x.id}
                  aria-pressed={agent === x.id}
                  onClick={() => setAgent(x.id)}
                >
                  {x.name || t('ext.other')}
                  {x.state === 'login' && <Dot color="var(--a-warn)" size={7} />}
                  {x.state === 'missing' && <span className="a-muted"> {t('ext.notInstalled')}</span>}
                </button>
              ))}
            </div>
            <div className="a-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {a.note}
            </div>
          </div>
          <label className="a-field">
            <span className="l">{t('cb.name')}</span>
            <TextInput defaultValue={name} />
          </label>
          <label className="a-field">
            <span className="l">{t('ext.workDir')}</span>
            <TextInput mono defaultValue="~/Desktop/working-project" />
          </label>
        </div>
      </div>
      <Disclosure
        title={t('cb.advanced')}
        hint={t('ext.advancedHint')}
        open={adv}
        onToggle={() => setAdv(!adv)}
      >
        <div className="ap-frow">
          <span>{t('ext.whenAsks', { name })}</span>
          <Segmented
            label={t('ext.whenAsks', { name })}
            value={perm}
            onChange={setPerm}
            options={[
              { value: 'ask', label: t('ext.ask') },
              { value: 'reject', label: t('ext.reject') },
              { value: 'allow', label: t('ext.allow') },
            ]}
          />
        </div>
        <div className="ap-frow">
          <span>{t('ext.cap')}</span>
          <span className="a-muted">$3 · 45 phút</span>
        </div>
        <label className="ap-frow">
          <span>{t('ext.worktree')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
        <label className="ap-frow">
          <span>{t('cb.delegable')}</span>
          <input type="checkbox" defaultChecked style={check} />
        </label>
        <div className="ap-frow">
          <span>{t('ext.command')}</span>
          <span className="a-mono a-muted">{a.cmd}</span>
        </div>
      </Disclosure>
      <div className="ap-dfoot">
        <Button size="lg" onClick={nav.close}>
          {t('cb.cancel')}
        </Button>
        <Button variant="primary" size="lg">
          {t('ext.add')}
        </Button>
      </div>
    </>
  )
}

export function CreateBot(props: PageProps) {
  const { t, nav, params } = props
  const [kind, setKind] = useState<'aris' | 'external'>(params.kind === 'external' ? 'external' : 'aris')
  return (
    <Dialog
      open
      width={760}
      title={t('cb.title')}
      description={kind === 'aris' ? t('cb.intro') : t('ext.intro')}
      closeLabel={t('cb.close')}
      onClose={nav.close}
      aside={
        <Segmented
          label={t('cb.kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'aris', label: t('cb.aris') },
            { value: 'external', label: t('cb.external') },
          ]}
        />
      }
    >
      {kind === 'aris' ? <ArisBot {...props} /> : <ExternalBot {...props} />}
    </Dialog>
  )
}
