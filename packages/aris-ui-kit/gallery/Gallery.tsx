/**
 * Trang thử bộ thành phần: mọi thành phần ở các trạng thái chính, nền sáng và
 * nền tối cạnh nhau. `node scripts/ui/gallery.mjs` vẽ trang này thành
 * `docs/giao-dien/thanh-phan.html` để đối chiếu với canvas.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import {
  ApprovalBox,
  BrandMark,
  BranchStep,
  Button,
  Card,
  CardRow,
  Checkbox,
  ChevronDownIcon,
  ComposeIcon,
  Dialog,
  Field,
  GroupLabel,
  IconButton,
  KIT_CSS,
  Mascot,
  Menu,
  MenuItem,
  MenuLabel,
  NavItem,
  PageShell,
  PanelIcon,
  Pill,
  PlusIcon,
  Progress,
  RoomIcon,
  SectionHeader,
  Segmented,
  SettingsShell,
  StatusGlyph,
  StatusPill,
  Switch,
  SwitchRow,
  Tabs,
  Tag,
  TaskBranch,
  TextInput,
  WaitingIcon,
} from '../src/react/index.js'
import { FONT_HREF, FONTS } from '../src/tokens.js'
import { STATUSES, type BotStatus } from '../src/status.js'

const noop = () => {}
const LAM = '#0F766E'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="g-block">
      <h3>{title}</h3>
      <div className="g-items">{children}</div>
    </section>
  )
}

function Column() {
  return (
    <div className="aris g-col">
      <Block title="Chữ">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 600, fontSize: 20, letterSpacing: '-.01em' }}>
            Thư viện skill
          </span>
          <span className="a-muted" style={{ fontWeight: 500, fontSize: 13 }}>
            Đang dùng
          </span>
          <span className="a-num" style={{ fontSize: 15, fontWeight: 600 }}>
            0,42{' '}
            <span className="a-muted" style={{ fontWeight: 400 }}>
              / 5 USD hôm nay
            </span>
          </span>
        </div>
      </Block>

      <Block title="Nút">
        <Button variant="primary">Lưu thay đổi</Button>
        <Button>Kiểm tra kết nối</Button>
        <Button variant="ghost">Huỷ</Button>
        <Button variant="danger">Xoá bot</Button>
        <Button size="sm">Tải danh sách mới</Button>
        <Button variant="primary" disabled>
          Đang lưu…
        </Button>
        <IconButton label="Thêm">
          <PlusIcon size={16} />
        </IconButton>
        <IconButton label="Thu gọn thanh bên">
          <PanelIcon />
        </IconButton>
        <IconButton label="Phiên mới">
          <ComposeIcon />
        </IconButton>
        <IconButton label="Đổi phiên" size="sm" aria-expanded>
          <ChevronDownIcon />
        </IconButton>
        <div style={{ width: 240 }}>
          <Button variant="primary" block icon={<PlusIcon size={16} />}>
            Việc mới<span className="a-kbd">⌘ N</span>
          </Button>
        </div>
      </Block>

      <Block title="Năm trạng thái">
        {(Object.keys(STATUSES) as BotStatus[]).map((s) => (
          <StatusPill key={s} status={s} label={STATUSES[s].label} />
        ))}
        {(Object.keys(STATUSES) as BotStatus[]).map((s) => (
          <StatusPill key={s} status={s} label={STATUSES[s].label} size="sm" />
        ))}
        {(Object.keys(STATUSES) as BotStatus[]).map((s) => (
          <StatusGlyph key={s} status={s} label={STATUSES[s].label} />
        ))}
      </Block>

      <Block title="Pill và tem">
        <Pill>Commander</Pill>
        <Pill tone="ok">Kết nối tốt · 210 ms</Pill>
        <Pill tone="warn">Chờ duyệt</Pill>
        <Pill tone="danger">Lỗi khoá</Pill>
        <Pill tone="muted">Nháp</Pill>
        <Tag>tự thêm</Tag>
        <Tag mono>deepseek-chat</Tag>
      </Block>

      <Block title="Công tắc và ô tích">
        <SwitchRow
          checked
          color={LAM}
          label="Aris được giao việc cho Lâm"
          hint="Bật: việc nghiên cứu sẽ tự đến tay Lâm, anh không cần gọi tên"
          onChange={noop}
        />
        <SwitchRow
          checked={false}
          label="Aris được giao việc cho Lâm"
          hint="Tắt: Lâm chỉ làm khi anh nhắn thẳng cho Lâm"
          onChange={noop}
        />
        <Switch checked label="Bật" onChange={noop} />
        <Switch checked={false} label="Tắt" onChange={noop} />
        <Checkbox checked color={LAM} label="Đọc web" onChange={noop} />
        <Checkbox checked color={LAM} label="Đọc tệp" onChange={noop} />
        <Checkbox checked={false} label="Chạy lệnh" onChange={noop} />
        <Checkbox checked disabled label="Luôn bật" onChange={noop} />
      </Block>

      <Block title="Chọn đoạn và tab">
        <Segmented
          label="Chế độ duyệt"
          value="ask"
          options={[
            { value: 'ask', label: 'Hỏi anh' },
            { value: 'auto', label: 'Tự cho việc rủi ro thấp' },
          ]}
          onChange={noop}
        />
        <div style={{ width: '100%' }}>
          <Tabs
            label="Hồ sơ bot"
            value="skill"
            tabs={[
              { value: 'info', label: 'Thông tin' },
              { value: 'skill', label: 'Skill' },
              { value: 'memory', label: 'Ký ức' },
              { value: 'log', label: 'Nhật ký' },
            ]}
            onChange={noop}
          />
        </div>
      </Block>

      <Block title="Ô nhập">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Khoá API" hint="2 khoá · xoay vòng khi chạm giới hạn">
            <TextInput mono defaultValue="sk-••••••••••••3f2a" />
          </Field>
          <Field label="Tên bot">
            <TextInput placeholder="Ví dụ: Lâm" />
          </Field>
        </div>
      </Block>

      <Block title="Thẻ">
        <div style={{ width: '100%' }}>
          <Card
            title="Ngân sách"
            subtitle="Hàng rào chi phí cho mọi bot"
            actions={<Button size="sm">Sửa</Button>}
          >
            <CardRow label="Trần chi phí mỗi ngày">
              <span className="a-num">5 USD</span>
            </CardRow>
            <CardRow label="Báo khi chạm">
              <span className="a-num">80%</span>
            </CardRow>
          </Card>
        </div>
      </Block>

      <Block title="Menu thả">
        <Menu label="Các phiên với Aris" role="listbox" inline width={320}>
          <MenuItem icon={<PlusIcon size={15} />} meta="⌘ N" onSelect={noop}>
            Phiên mới với Aris
          </MenuItem>
          <MenuLabel separated>Các phiên với Aris</MenuLabel>
          <MenuItem role="option" selected meta="đang mở" onSelect={noop}>
            Chào aris, anh là Tầu
          </MenuItem>
          <MenuItem role="option" meta="hôm qua" onSelect={noop}>
            Tóm tắt đối thủ tuần này
          </MenuItem>
        </Menu>
      </Block>

      <Block title="Dòng việc">
        <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <TaskBranch mascot="lam" name="Lâm" task="nghiên cứu 3 đối thủ">
            <BranchStep status="done">Tìm được 20 nguồn</BranchStep>
            <BranchStep status="working">
              Đang đọc · 12/20 <Progress value={0.6} label="12/20" />
            </BranchStep>
            <BranchStep status="idle">Gửi tổng hợp cho Aris</BranchStep>
          </TaskBranch>
          <TaskBranch mascot="mai" name="Mai" task="lời mời họp thứ 5">
            <BranchStep status="done">Soạn thư cho 4 người · 14:00, Google Meet</BranchStep>
            <ApprovalBox title="Mai đợi anh gật đầu">
              <Button variant="primary" size="sm">
                Cho Mai gửi
              </Button>
              <Button size="sm">Xem thư</Button>
            </ApprovalBox>
          </TaskBranch>
        </div>
      </Block>

      <Block title="Hộp thoại">
        <Dialog
          open
          inline
          title="Xoá bot Lâm?"
          description="Ký ức và skill riêng của Lâm sẽ mất. Việc đang chạy dừng ngay."
          footer={
            <>
              <Button variant="ghost">Huỷ</Button>
              <Button variant="danger">Xoá Lâm</Button>
            </>
          }
          onClose={noop}
        />
      </Block>

      <Block title="Điều hướng">
        <div style={{ width: 250, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <NavItem label="Chat" icon={<ComposeIcon size={17} />} active />
          <NavItem label="Routine" icon={<PanelIcon size={17} />} />
          <SectionHeader
            title="Phòng"
            action={
              <IconButton label="Tạo phòng" size="sm">
                <PlusIcon size={15} width={2} />
              </IconButton>
            }
          />
          <NavItem label="Phòng aris-agent" icon={<RoomIcon />} meta="4 phiên">
            aris-agent
          </NavItem>
          <GroupLabel>Nghiên cứu</GroupLabel>
          <NavItem label="3 việc đợi anh gật đầu" icon={<WaitingIcon />} variant="warn" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavItem label="Chat" icon={<ComposeIcon size={17} />} active collapsed />
          <NavItem label="Phòng aris-agent" icon={<RoomIcon />} collapsed />
        </div>
      </Block>

      <Block title="Linh vật">
        <BrandMark size={34} />
        {['aris', 'lam', 'mai', 'tin', 'ha', 'dev'].map((id) => (
          <Mascot key={id} id={id} size={34} label={id} />
        ))}
      </Block>

      <Block title="Khung trang Cài đặt">
        <div className="g-frame">
          <SettingsShell
            caption="Cài đặt và vận hành"
            navLabel="Cài đặt"
            active="guard"
            sections={[
              { id: 'dash', label: 'Bảng điều khiển' },
              { id: 'provider', label: 'Provider và model' },
              { id: 'guard', label: 'Ngân sách, duyệt, mạng' },
              { id: 'plugin', label: 'Plugin' },
            ]}
            onSelect={noop}
          >
            <PageShell title="Ngân sách, duyệt, mạng" subtitle="Hàng rào an toàn cho mọi bot">
              <Card title="Tự học">
                <CardRow label="Skill mới và bản vá cần anh duyệt">
                  <Switch checked label="Skill mới và bản vá cần anh duyệt" onChange={noop} />
                </CardRow>
              </Card>
            </PageShell>
          </SettingsShell>
        </div>
      </Block>
    </div>
  )
}

const PAGE_CSS = `
body{margin:0;background:#DAD8D2;font-family:${FONTS.body}}
.g-head{padding:20px 28px 0;font-family:${FONTS.heading};font-size:22px;font-weight:600}
.g-sub{padding:2px 28px 16px;font-size:13px;color:#5C616C}
.g-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}
.g-col{background:var(--a-bg);padding:24px 28px;display:flex;flex-direction:column;gap:22px;min-width:0}
.g-block h3{margin:0 0 10px;font-family:${FONTS.heading};font-size:13px;font-weight:600;color:var(--a-muted)}
.g-items{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.g-frame{width:100%;border:1px solid var(--a-line);border-radius:12px;overflow:hidden;height:260px}
@media (max-width:900px){.g-cols{grid-template-columns:1fr}}
`

/** HTML hoàn chỉnh của trang thử. */
export function renderGallery(): string {
  const body = renderToStaticMarkup(
    <>
      <div className="g-head">Bộ thành phần aris</div>
      <div className="g-sub">@aris/ui-kit/react · trái: nền sáng · phải: nền tối</div>
      <div className="g-cols">
        <Column />
        <div data-ds-dark-theme="">
          <Column />
        </div>
      </div>
    </>,
  )
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bộ thành phần aris</title>
<link rel="stylesheet" href="${FONT_HREF}">
<style>${KIT_CSS}${PAGE_CSS}</style>
</head>
<body>${body}</body>
</html>
`
}
