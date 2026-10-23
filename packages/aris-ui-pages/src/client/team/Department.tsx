/**
 * Phòng ban (quyết định 12): trưởng nhóm, thành viên, chính sách chung áp cho mọi bot
 * của phòng, và các việc lớn phòng đang nhận (trưởng nhóm chạy một Team riêng cho mỗi
 * việc). Canvas chưa vẽ màn này; dựng bằng bộ thành phần. Thành viên và trưởng nhóm là thật
 * (`@aris/bots`); chính sách chung và việc lớn của phòng là bước 3.
 */
import {
  Button,
  Card,
  CardRow,
  CrownIcon,
  Mascot,
  Pill,
  StatusPill,
  Tag,
  teamAction,
  useTeam,
} from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Col } from '../ui.js'
import { DEMO_DEPARTMENTS } from './demo.js'

export function Department({ t, nav, params }: PageProps) {
  const team = useTeam()
  const group = team.groups.find((g) => g.id === params.id) ?? team.groups.find((g) => g.id)
  if (!group)
    return (
      <main className="a-page">
        <div className="a-page-body a-muted">{t(team.ready ? 'dep.none' : 'dep.loading')}</div>
      </main>
    )
  const policy = DEMO_DEPARTMENTS[group.id]
  const lead = group.members.find((m) => m.id === group.lead)
  const makeLead = (id: string) =>
    void teamAction({ op: 'department', department: { id: group.id, name: group.label, lead: id } }).catch(
      () => {},
    )
  return (
    <main className="a-page">
      <header className="a-page-head">
        <div className="grow">
          <h1 className="a-page-title">{t('dep.title', { name: group.label })}</h1>
          <span className="a-page-sub">
            {t('dep.subtitle', { n: group.members.length, lead: lead?.name ?? '—' })}
            {policy ? ` · ${policy.about}` : ''}
          </span>
        </div>
        <div className="a-page-actions">
          <Button onClick={() => nav.go('create-bot')}>{t('dep.addBot')}</Button>
          <Button variant="primary">{t('dep.editPolicy')}</Button>
        </div>
      </header>
      <div className="a-page-body">
        <div className="ap-cols">
          <Col basis={360}>
            <Card title={t('dep.members')}>
              {group.members.map((m) => (
                <CardRow
                  key={m.id}
                  label={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Mascot id={m.mascot ?? m.id} size={26} />
                      <span>
                        <b>{m.name}</b>
                        <div className="a-muted" style={{ fontSize: 12.5 }}>
                          {m.role}
                        </div>
                      </span>
                    </span>
                  }
                >
                  {m.id === group.lead ? (
                    <Pill tone="accent">
                      <span className="ic" aria-hidden>
                        <CrownIcon size={12} />
                      </span>
                      {t('dep.lead')}
                    </Pill>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => makeLead(m.id)}>
                      {t('dep.makeLead')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => nav.go('bot', { id: m.id })}>
                    {t('dep.profile')}
                  </Button>
                </CardRow>
              ))}
            </Card>
            <Card title={t('dep.work')} subtitle={t('dep.workHint')}>
              {!policy && <CardRow label={<span className="a-muted">{t('dep.step3')}</span>} />}
              {policy?.work.length === 0 && (
                <CardRow label={<span className="a-muted">{t('dep.noWork')}</span>} />
              )}
              {policy?.work.map((w) => (
                <CardRow
                  key={w.title}
                  label={
                    <span>
                      <b>{w.title}</b>
                      <div className="a-muted" style={{ fontSize: 12.5 }}>
                        {t('dep.workMeta', { project: w.project, progress: w.progress })}
                      </div>
                    </span>
                  }
                >
                  <StatusPill status={w.status} label={t(`dep.status.${w.status}`)} />
                </CardRow>
              ))}
            </Card>
          </Col>
          <Col basis={360}>
            <Card title={t('dep.policy')} subtitle={t('dep.policyHint')}>
              {!policy && <CardRow label={<span className="a-muted">{t('dep.step3')}</span>} />}
              {policy && (
                <>
                  <CardRow label={t('dep.skills')}>
                    <span className="ap-tags" style={{ justifyContent: 'flex-end' }}>
                      {policy.skills.map((s) => (
                        <Tag key={s} mono>
                          {s}
                        </Tag>
                      ))}
                    </span>
                  </CardRow>
                  <CardRow label={t('dep.brain')}>
                    <span className="ap-tags" style={{ justifyContent: 'flex-end' }}>
                      {policy.brain.map((b) => (
                        <Tag key={b}>{b}</Tag>
                      ))}
                    </span>
                  </CardRow>
                  <CardRow label={t('dep.model')}>
                    <span>{policy.model}</span>
                  </CardRow>
                  <CardRow label={t('dep.budget')}>
                    <span>{policy.budget}</span>
                  </CardRow>
                  {policy.perms.map(([k, v]) => (
                    <CardRow key={k} label={k}>
                      <span className="a-muted">{v}</span>
                    </CardRow>
                  ))}
                </>
              )}
            </Card>
          </Col>
        </div>
      </div>
    </main>
  )
}
