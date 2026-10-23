/**
 * 2.3 · Bot hiểu gì về người dùng: cách xưng hô (thật, `@aris/bots`), rồi điều bot chưa chắc,
 * nhận định kèm độ tin cậy và bằng chứng (mẫu tới giai đoạn 3).
 */
import { BotPicker, Button, Card, PageShell, TextInput, teamAction, useTeam } from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { botName, botOptions } from '../mind/names.js'
import { DEMO_OWNER as O } from './demo.js'

type Insight = (typeof O.communication)[number]

function Section({
  title,
  rows,
  t,
  color,
}: {
  title: string
  rows: readonly Insight[]
  t: PageProps['t']
  color: string
}) {
  return (
    <div className="a-card">
      <div className="ap-cl a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
        <span>{title}</span>
        <span>{t('own.confidence')}</span>
        <span>{t('own.evidence')}</span>
        <span />
      </div>
      {rows.map((r) => {
        const weak = r.pct < 60
        return (
          <div className="ap-cl" key={r.text}>
            <span className={weak ? 'a-muted' : undefined}>{r.text}</span>
            <span className="ap-track" style={{ height: 6 }}>
              <span style={{ width: `${r.pct}%`, background: weak ? 'var(--a-warn)' : color }} />
            </span>
            <a className="ap-link">{t('own.times', { n: r.evidence })}</a>
            <span style={{ display: 'flex', gap: 6 }}>
              <Button size="sm">{t('own.right')}</Button>
              <Button size="sm">{weak ? t('own.wrong') : t('own.fix')}</Button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Cách xưng hô: bot hỏi lần đầu rồi lưu; sửa tay ở đây. Cả đội dùng chung. */
function AddressCard({ t }: { t: PageProps['t'] }) {
  const owner = useTeam().owner
  const [form, setForm] = useState({ name: '', call: '', self: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    setForm({ name: owner.name ?? '', call: owner.call ?? '', self: owner.self ?? '' })
  }, [owner.name, owner.call, owner.self])
  const dirty =
    form.name !== (owner.name ?? '') || form.call !== (owner.call ?? '') || form.self !== (owner.self ?? '')
  async function save() {
    try {
      await teamAction({ op: 'owner', owner: { name: form.name, call: form.call, self: form.self } })
      setMsg({ ok: true, text: t('own.addrSaved') })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  const field = (k: keyof typeof form, label: string, hint: string) => (
    <label className="a-field" style={{ flex: 1, minWidth: 180 }}>
      <span className="l">{label}</span>
      <TextInput
        value={form[k]}
        onChange={(e) => (setForm({ ...form, [k]: e.target.value }), setMsg(null))}
      />
      <span className="h">{hint}</span>
    </label>
  )
  return (
    <Card title={t('own.addrTitle')} subtitle={t('own.addrHint')}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '4px 14px 12px' }}>
        {field('name', t('own.addrName'), t('own.addrNameHint'))}
        {field('call', t('own.addrCall'), t('own.addrCallHint'))}
        {field('self', t('own.addrSelf'), t('own.addrSelfHint'))}
      </div>
      <div className="a-row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--a-ok)' : 'var(--a-danger)' }}>
            {msg.text}
          </span>
        )}
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void save()}>
          {t('own.addrSave')}
        </Button>
      </div>
    </Card>
  )
}

export function OwnerProfile({ t, params }: PageProps) {
  const team = useTeam()
  const [bot, setBot] = useState<string>(params.bot ?? team.commander.id)
  const name = botName(bot)
  return (
    <PageShell
      title={t('own.title', { name })}
      subtitle={t('own.subtitle', { n: O.insights })}
      actions={
        <>
          <BotPicker
            label={t('mem.pickBot')}
            value={bot}
            onChange={setBot}
            options={botOptions()}
            searchPlaceholder={t('pick.search')}
            emptyLabel={t('pick.empty')}
          />
          <Button size="sm">{t('own.copy')}</Button>
        </>
      }
    >
      <div style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AddressCard t={t} />
        <div className="a-muted" style={{ fontSize: 12.5 }}>
          {t('own.sample')}
        </div>
        <div className="ap-warnbox" style={{ padding: '12px 14px' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>{t('own.unsure', { name })}</b> {O.unsure}
          </div>
          {O.unsureOptions.map((o) => (
            <Button key={o} size="sm">
              {o}
            </Button>
          ))}
        </div>
        <Section title={t('own.communication')} rows={O.communication} t={t} color="var(--a-ok)" />
        <Section title={t('own.goals')} rows={O.goals} t={t} color="var(--a-accent)" />
        <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
          {t('own.note', { name })}
        </p>
      </div>
    </PageShell>
  )
}
