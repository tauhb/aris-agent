import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TeamView } from '@aris/ui-kit/react'
import { ChatPanel, NEW_SESSION } from './ChatPanel.js'
import { Feed } from './Feed.js'
import { TeamBlock } from './TeamBlock.js'
import type { ConvStep } from './chatModel.js'
import type { Desk, FeedItem } from './model.js'

/** Bản dịch giả: khoá kèm tham số. */
const t = (key: string, p: Record<string, unknown> = {}) =>
  Object.keys(p).length ? `${key}(${Object.values(p).join(',')})` : key

const item = (extra: Partial<FeedItem>): FeedItem => ({
  at: Date.UTC(2026, 9, 26, 3, 52),
  bot: 'minh',
  kind: 'done',
  tone: 'ok',
  what: 'So sánh 3 đối thủ',
  session: 's1',
  ...extra,
})

const feedProps = (lines: FeedItem[]) => ({
  t,
  lines,
  range: 'today' as const,
  onRange: () => {},
  faceOf: (bot: string) => ({ id: bot === 'minh' ? 'trang-giay' : 'ha' }),
  nameOf: (bot: string) => (bot === 'minh' ? 'Minh' : 'Thơ'),
  externalOf: () => false,
  waitingOf: (bot: string) => bot === 'an',
  onChat: () => {},
  reload: () => {},
  onClose: () => {},
})

describe('Feed', () => {
  it('mỗi dòng có pill tên bot, pill trạng thái, câu; đếm kết quả mới', () => {
    const html = renderToStaticMarkup(
      <Feed
        {...feedProps([
          item({}),
          item({ bot: 'tho', kind: 'running', session: 's2', what: 'Viết bài' }),
          item({ bot: 'tho', kind: 'failed', tone: 'bad', session: 's3', what: 'Hỏng' }),
        ])}
      />,
    )
    expect(html).toContain('of.fd.fresh(1)')
    expect(html).toContain('>Minh<')
    expect(html).toContain('>Thơ<')
    expect(html).toContain('ap-of-sp run')
    expect(html).toContain('of.fd.st.running')
    expect(html).toContain('ap-of-sp ok')
    expect(html).toContain('of.feed.k.failed')
    expect(html).toContain('Viết bài')
    // Dòng Xong chưa nhận có chấm xanh; kết quả chưa mở nên chưa có nút.
    expect(html).toContain('ap-of-fr unread')
    expect(html).not.toContain('of.fd.receive')
  })

  it('dòng chờ duyệt có nút Từ chối, Duyệt, Xem; dòng hỏi chỉ có Trả lời khi bot còn đợi', () => {
    const html = renderToStaticMarkup(
      <Feed
        {...feedProps([
          item({
            bot: 'an',
            kind: 'asked',
            tone: 'warn',
            approval: 'ap-1',
            session: 'member:s7',
            what: 'gửi email',
          }),
          item({ bot: 'an', kind: 'asked', tone: 'warn', session: 's8', what: 'Giọng nào?' }),
          item({ bot: 'tho', kind: 'asked', tone: 'warn', session: 's9', what: 'Cũ rồi' }),
        ])}
      />,
    )
    expect(html).toContain('of.fd.perm(gửi email)')
    expect(html).toContain('of.need.reject')
    expect(html).toContain('of.need.approve')
    expect(html).toContain('of.fd.view')
    expect(html).toContain('of.need.answer')
    // Lần hỏi cũ của bot không còn đợi chỉ còn là nhãn mờ.
    expect(html.match(/of\.need\.answer/g)).toHaveLength(1)
    expect(html).toContain('ap-of-sp dim')
  })

  it('đầu cột có nút đóng (✕, có aria-label) cho ngăn trượt ở màn hẹp', () => {
    const html = renderToStaticMarkup(<Feed {...feedProps([])} />)
    expect(html).toContain('class="ap-of-colx"')
    expect(html).toContain('aria-label="of.col.close"')
  })

  it('chưa có dòng nào thì báo trống; đang đọc thì không báo gì', () => {
    expect(renderToStaticMarkup(<Feed {...feedProps([])} />)).toContain('of.feed.empty')
    expect(renderToStaticMarkup(<Feed {...{ ...feedProps([]), lines: null }} />)).not.toContain(
      'of.feed.empty',
    )
  })
})

const desk: Desk = {
  id: 'b-tho',
  name: 'Thơ',
  role: 'Nội dung',
  mascot: 'ha',
  status: 'working',
  scene: 'work',
  task: '',
  since: 0,
  model: '',
  external: false,
}
const team = {
  bots: [
    { id: 'b-minh', handle: 'minh', name: 'Minh', mascot: 'trang-giay' },
    { id: 'b-an', handle: 'an', name: 'An', mascot: 'tron' },
  ],
} as unknown as TeamView

describe('ChatPanel', () => {
  const panel = (over: Partial<Desk> = {}, commander = false) => (
    <ChatPanel
      t={t}
      nav={{ go() {}, openPanel() {}, openSession() {}, close() {} }}
      desk={{ ...desk, ...over }}
      commander={commander}
      live={{
        status: { 'b-tho': { status: 'working', since: 0, running: 1, sessions: ['s-run'] } },
        activity: [],
      }}
      team={team}
      session={undefined}
      approvals={[]}
      onSession={() => {}}
      onBack={() => {}}
      onChat={() => {}}
      reload={() => {}}
      onClose={() => {}}
    />
  )

  it('đầu bảng có Cả đội, tên, pill trạng thái, ô chọn phiên; ô nhắn có Chèn vào việc, Xếp sau, Dừng khi bot đang làm', () => {
    const html = renderToStaticMarkup(panel())
    expect(html).toContain('of.ch.back')
    expect(html).toContain('>Thơ<')
    expect(html).toContain('of.fd.bot.working')
    expect(html).toContain('ap-of-sess')
    expect(html).toContain('of.ch.steer')
    expect(html).toContain('of.ch.queue')
    expect(html).toContain('of.dr.stop')
    expect(html).toContain('<textarea')
    expect(html).toContain('of.ch.openFull')
    // Nút đóng nằm ở đầu bảng, ngay sau "‹ Cả đội", trước thân bảng.
    expect(html.indexOf('of.ch.back')).toBeLessThan(html.indexOf('ap-of-colx'))
    expect(html.indexOf('ap-of-colx')).toBeLessThan(html.indexOf('ap-of-bh'))
  })

  it('Aris: pill "đang điều phối"; bot ngoài: nút mở hồ sơ thay ô nhắn', () => {
    expect(renderToStaticMarkup(panel({ id: 'aris', name: 'Aris' }, true))).toContain('of.ch.coordinating')
    const ext = renderToStaticMarkup(panel({ external: true }))
    expect(ext).toContain('of.ch.profile')
    expect(ext).not.toContain('<textarea')
  })

  it('phiên mới chưa có tin: không có Dừng', () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        t={t}
        nav={{ go() {}, openPanel() {}, openSession() {}, close() {} }}
        desk={{ ...desk, status: 'idle', scene: 'idle' }}
        commander={false}
        live={null}
        team={team}
        session={NEW_SESSION}
        approvals={[]}
        onSession={() => {}}
        onBack={() => {}}
        onChat={() => {}}
        reload={() => {}}
        onClose={() => {}}
      />,
    )
    expect(html).not.toContain('of.dr.stop')
    expect(html).toContain('of.ch.new')
  })
})

describe('TeamBlock', () => {
  const step = (out: string | undefined): ConvStep => ({
    n: 4,
    at: 0,
    type: 'tool',
    tool: 'assign_task',
    title: 'assign_task',
    body: JSON.stringify({
      tasks: [
        { bot: 'minh', title: 'So sánh 3 đối thủ' },
        { bot: 'an', title: 'Gửi email mời 120 học viên' },
      ],
    }),
    bodyFull: true,
    ...(out === undefined ? {} : { out, outFull: true }),
  })

  it('mỗi bot một nhánh với tên và việc, thanh tiến độ k/n', () => {
    const html = renderToStaticMarkup(
      <TeamBlock
        parent="aris-s"
        step={step(
          '- @minh (Minh): đã nhận việc, thẻ task-1, phiên s-minh\n- @an (An): đã nhận việc, thẻ task-2, phiên s-an',
        )}
        team={team}
        approvals={[]}
        t={t}
        onChat={() => {}}
        reload={() => {}}
      />,
    )
    expect(html).toContain('of.ch.team')
    expect(html).toContain('of.ch.teamDone(0,2)')
    expect(html).toContain('>Minh<')
    expect(html).toContain('>An<')
    expect(html).toContain('So sánh 3 đối thủ')
    expect(html).toContain('Gửi email mời 120 học viên')
    expect(html).toContain('role="progressbar"')
  })

  it('lần giao chưa có kết quả vẫn vẽ nhánh theo tham số; không có việc nào thì không vẽ gì', () => {
    const props = { parent: 'aris-s', team, approvals: [], t, onChat: () => {}, reload: () => {} }
    expect(renderToStaticMarkup(<TeamBlock step={step(undefined)} {...props} />)).toContain('>Minh<')
    expect(renderToStaticMarkup(<TeamBlock step={{ ...step(undefined), body: '{}' }} {...props} />)).toBe('')
  })

  it('giao cả phòng: một nhánh cho phòng theo tên việc; lỗi giao thì hiện lời báo', () => {
    const props = { parent: 'aris-s', team, approvals: [], t, onChat: () => {}, reload: () => {} }
    const dept = (out: string | undefined): ConvStep => ({
      n: 24,
      at: 0,
      type: 'tool',
      tool: 'assign_department',
      title: 'assign_department',
      body: JSON.stringify({ department: 'Tăng trưởng', title: 'Chiến dịch ra mắt', task: 'x', reason: 'y' }),
      bodyFull: true,
      ...(out === undefined ? {} : { out, outFull: true }),
    })
    const html = renderToStaticMarkup(<TeamBlock step={dept(undefined)} {...props} />)
    expect(html).toContain('Tăng trưởng')
    expect(html).toContain('Chiến dịch ra mắt')
    expect(html).toContain('of.ch.teamDone(0,1)')
    const bad = renderToStaticMarkup(<TeamBlock step={dept('Không có phòng «X».')} {...props} />)
    expect(bad).toContain('Không có phòng «X».')
  })
})
