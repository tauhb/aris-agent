import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ApprovalBox,
  BotPicker,
  BotRow,
  BranchStep,
  Button,
  Card,
  CardRow,
  Checkbox,
  Dialog,
  Field,
  filterBotOptions,
  IconButton,
  KIT_CSS,
  Mascot,
  Menu,
  MenuItem,
  MenuLabel,
  NavItem,
  PageShell,
  Pill,
  PlusIcon,
  Progress,
  Segmented,
  SettingsShell,
  StatusPill,
  Switch,
  SwitchRow,
  Tabs,
  Tag,
  TaskBranch,
  TextInput,
  branchColor,
  rovingIndex,
} from './index.js'

const html = (node: React.ReactElement) => renderToStaticMarkup(node)
const noop = () => {}

describe('bộ thành phần', () => {
  it('nút mang biến thể và cỡ, nút icon bắt buộc có nhãn', () => {
    expect(html(<Button variant="primary">Lưu</Button>)).toBe(
      '<button type="button" class="a-btn primary">Lưu</button>',
    )
    expect(
      html(
        <Button size="sm" block>
          Việc mới
        </Button>,
      ),
    ).toContain('class="a-btn secondary sm block"')
    expect(html(<IconButton label="Thêm">+</IconButton>)).toContain('aria-label="Thêm"')
  })

  it('viên trạng thái có màu theo trạng thái và glyph ẩn với trình đọc màn hình', () => {
    const out = html(<StatusPill status="waiting" label="Chờ anh" />)
    expect(out).toContain('class="a-st waiting"')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('Chờ anh')
  })

  it('công tắc báo trạng thái bằng aria-checked, dòng công tắc có câu hệ quả', () => {
    expect(html(<Switch checked label="Bật" onChange={noop} />)).toContain('role="switch"')
    const row = html(
      <SwitchRow
        checked={false}
        label="Aris giao việc cho Lâm"
        hint="Tắt: Lâm chỉ làm khi anh nhắn"
        onChange={noop}
      />,
    )
    expect(row).toContain('aria-checked="false"')
    expect(row).toContain('Tắt: Lâm chỉ làm khi anh nhắn')
  })

  it('màu riêng của bot đi qua biến --a-on', () => {
    expect(html(<Checkbox checked label="Đọc web" color="#0F766E" onChange={noop} />)).toContain(
      '--a-on:#0F766E',
    )
  })

  it('nút chọn đoạn và tab chỉ để mục đang chọn trong vòng Tab', () => {
    const opts = [
      { value: 'ask', label: 'Hỏi anh' },
      { value: 'auto', label: 'Tự cho việc rủi ro thấp' },
    ] as const
    const seg = html(<Segmented options={opts} value="auto" label="Chế độ duyệt" onChange={noop} />)
    expect(seg).toContain('role="radiogroup"')
    expect(seg.match(/tabindex="0"/g)).toHaveLength(1)
    const tabs = html(<Tabs tabs={opts} value="ask" label="Mục" onChange={noop} />)
    expect(tabs).toContain('aria-selected="true"')
  })

  it('phím mũi tên đi vòng trong nhóm', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0)
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2)
    expect(rovingIndex(1, 'End', 3)).toBe(2)
    expect(rovingIndex(1, 'Enter', 3)).toBeUndefined()
  })

  it('mục menu dạng lựa chọn có aria-selected, dạng lệnh thì không', () => {
    expect(
      html(
        <MenuItem role="option" selected onSelect={noop}>
          Phiên A
        </MenuItem>,
      ),
    ).toContain('aria-selected="true"')
    expect(html(<MenuItem onSelect={noop}>Mở</MenuItem>)).not.toContain('aria-selected')
  })

  it('hộp thoại đóng thì không vẽ gì, mở thì có tiêu đề gắn với role dialog', () => {
    expect(html(<Dialog open={false} title="Xoá?" onClose={noop} />)).toBe('')
    const out = html(<Dialog open title="Xoá bot?" onClose={noop} />)
    expect(out).toContain('role="dialog"')
    expect(out).toMatch(/aria-labelledby="([^"]+)-t".*id="\1-t"/)
  })

  it('dòng bot: Commander không có glyph trạng thái, bot thường có glyph mang nhãn', () => {
    const lead = html(
      <BotRow mascot="aris" name="Aris" note="Chỉ huy" status="working" statusLabel="Đang làm" lead />,
    )
    expect(lead).not.toContain('role="img"')
    const mai = html(<BotRow mascot="mai" name="Mai" note="đợi anh" status="waiting" statusLabel="Chờ anh" />)
    expect(mai).toContain('aria-label="Chờ anh"')
    expect(mai).toContain('class="note waiting"')
  })

  it('nhánh việc mang màu linh vật của bot, thanh tiến độ báo phần trăm', () => {
    expect(branchColor('lam')).toMatch(/^#/)
    expect(html(<TaskBranch mascot="lam" name="Lâm" />)).toContain(`--a-branch:${branchColor('lam')}`)
    expect(html(<Progress value={0.6} label="12/20" />)).toContain('aria-valuenow="60"')
    expect(html(<Progress value={3} label="x" />)).toContain('width:100%')
  })

  it('dòng điều hướng thu gọn chỉ còn icon, nhãn vẫn đọc được', () => {
    const out = html(<NavItem label="Routine" icon={<PlusIcon />} collapsed active />)
    expect(out).toContain('aria-label="Routine"')
    expect(out).toContain('aria-current="page"')
    expect(out).not.toContain('class="l"')
  })

  it('mọi lớp a-* mà thành phần dùng đều có trong KIT_CSS', () => {
    const all = html(
      <>
        <Button variant="ghost" size="lg" />
        <Button variant="danger" />
        <IconButton label="x" size="sm">
          x
        </IconButton>
        {(['working', 'waiting', 'done', 'failed', 'idle'] as const).map((s) => (
          <StatusPill key={s} status={s} label={s} size="sm" />
        ))}
        {(['accent', 'ok', 'warn', 'danger', 'muted'] as const).map((t) => (
          <Pill key={t} tone={t}>
            {t}
          </Pill>
        ))}
        <Tag mono>v3</Tag>
        <Card title="Ngân sách" subtitle="Hôm nay" actions={<Button>Sửa</Button>}>
          <CardRow label="Trần chi phí">5 USD</CardRow>
        </Card>
        <SwitchRow checked label="a" hint="b" onChange={noop} />
        <Checkbox checked={false} label="c" onChange={noop} />
        <Field label="Khoá API" hint="Lưu ngoài tệp cài đặt">
          <TextInput mono />
        </Field>
        <Menu label="m" align="end" inline>
          <MenuLabel separated>Nhóm</MenuLabel>
          <MenuItem onSelect={noop} meta="hôm nay">
            Mục
          </MenuItem>
        </Menu>
        <Dialog open inline title="t" description="d" footer={<Button>OK</Button>} onClose={noop}>
          nội dung
        </Dialog>
        <NavItem label="n" icon={<PlusIcon />} meta="4 phiên" variant="warn" />
        <TaskBranch mascot="lam" name="Lâm" task="nghiên cứu" meta="10:42">
          <BranchStep status="done">Tìm được 20 nguồn</BranchStep>
          <BranchStep status="working">
            Đang đọc <Progress value={0.6} label="12/20" />
          </BranchStep>
          <ApprovalBox title="Mai đợi anh gật đầu">
            <Button variant="primary" size="sm">
              Cho Mai gửi
            </Button>
          </ApprovalBox>
        </TaskBranch>
        <BotRow mascot="aris" name="Aris" note="Chỉ huy" status="working" statusLabel="Đang làm" lead />
        <BotRow mascot="mai" name="Mai" note="đợi anh" status="waiting" statusLabel="Chờ anh" collapsed />
        <SettingsShell
          caption="Cài đặt"
          sections={[{ id: 'a', label: 'A' }]}
          active="a"
          navLabel="Cài đặt"
          onSelect={noop}
        >
          <PageShell title="Trang" subtitle="phụ" actions={<Button>Lưu</Button>} />
        </SettingsShell>
      </>,
    )
    const used = new Set([...all.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' ')))
    const missing = [...used].filter((c) => c.startsWith('a-') && !KIT_CSS.includes(`.${c}`))
    expect(missing).toEqual([])
    expect(KIT_CSS).toContain('[data-ds-dark-theme] .aris{')
  })
})

describe('Mascot', () => {
  it('phụ kiện mặc định mở rộng khung nhìn, none giữ khung cũ', () => {
    expect(html(<Mascot id="aris" />)).toContain('viewBox="-10 -16 120 120"')
    expect(html(<Mascot id="aris" accessory="kinh" />)).toContain('stroke="#16171B"')
    const plain = html(<Mascot id="aris" accessory="none" />)
    expect(plain).toContain('viewBox="0 0 100 100"')
    expect(plain).not.toContain('--acc-edge')
  })
  it('chỉ đánh dấu mắt trên thân, phần trắng của phụ kiện không chớp', () => {
    const body = html(<Mascot id="lam" motion="idle" accessory="none" />)
    const withHat = html(<Mascot id="lam" motion="idle" accessory="mu-len" />)
    expect(withHat.match(/class="eye"/g)).toEqual(body.match(/class="eye"/g))
    expect(withHat).toContain('fill="#fff" stroke="#16171B"')
  })
})

describe('BotPicker', () => {
  const options = [
    { id: 'aris', name: 'Aris', note: 'Chỉ huy' },
    { id: 'lam', name: 'Lâm', note: 'Nghiên cứu' },
    { id: 'mai', name: 'Mai', note: 'Thư ký' },
  ]
  it('lọc theo tên hoặc vai trò, không phân biệt dấu', () => {
    expect(filterBotOptions(options, 'lam').map((o) => o.id)).toEqual(['lam'])
    expect(filterBotOptions(options, 'thu ky').map((o) => o.id)).toEqual(['mai'])
    expect(filterBotOptions(options, '  ')).toHaveLength(3)
  })
  it('nút hiện bot đang chọn', () => {
    const html = renderToStaticMarkup(
      <BotPicker label="Chọn bot" value="lam" onChange={() => {}} options={options} />,
    )
    expect(html).toContain('aria-label="Chọn bot: Lâm"')
    expect(html).toContain('aria-haspopup="listbox"')
  })
})
