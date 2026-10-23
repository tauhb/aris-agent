// Danh sách 36 màn của canvas và cách mở màn tương ứng trong app thật, cho G6.
// `canvas`: tệp trong design/canvas. `app`: bước mở màn trong app, hoặc null khi app
// chưa có màn này (`why` ghi giai đoạn sẽ làm).
//   { chat: true }                — trang chat (phiên đang mở)
//   { go: [route, params?] }      — trang hoặc hộp thoại aris (sự kiện `aris:navigate`)

export const SCREENS = [
  { id: '1.1', title: 'Chat với Aris', canvas: 'Main.dc.html', app: { chat: true } },
  { id: '1.2', title: 'Khung chat', canvas: 'KhungChat.dc.html', app: { chat: true } },
  { id: '1.3', title: 'Bản đồ đội 3D', canvas: 'BanDo2.dc.html', app: { go: ['map'] } },
  { id: '1.4', title: 'Dự án (canvas: Phòng)', canvas: 'Phong2.dc.html', app: { chat: true } },
  { id: '1.5', title: 'Tạo dự án', canvas: 'TaoPhong.dc.html', app: { go: ['create-project'] } },
  { id: '1.6', title: 'Tìm trong mọi phiên', canvas: 'TimPhien.dc.html', app: { go: ['search'] } },
  { id: '2.1', title: 'Tạo bot', canvas: 'TaoBot.dc.html', app: { go: ['create-bot'] } },
  {
    id: '2.1b',
    title: 'Thêm bot ngoài (ACP)',
    canvas: 'TaoBotNgoai.dc.html',
    app: { go: ['create-bot', { kind: 'external' }] },
  },
  { id: '2.2', title: 'Hồ sơ bot', canvas: 'HoSoBot.dc.html', app: { go: ['bot', { id: 'lam' }] } },
  { id: '2.3', title: 'Hồ sơ chủ nhân', canvas: 'HoSoChuNhan.dc.html', app: { go: ['owner'] } },
  {
    id: '2.4',
    title: 'Nhân bản / xuất bot',
    canvas: 'NhanBan.dc.html',
    app: { go: ['clone-bot', { id: 'lam' }] },
  },
  {
    id: '2.5',
    title: 'Commander',
    canvas: 'Commander.dc.html',
    app: { go: ['settings', { section: 'commander' }] },
  },
  { id: '3.1', title: 'Ký ức', canvas: 'KyUc.dc.html', app: { go: ['memory'] } },
  { id: '3.2', title: 'Thư viện skill', canvas: 'ThuVienSkill.dc.html', app: { go: ['skills'] } },
  { id: '3.3', title: 'Chi tiết skill', canvas: 'SkillChiTiet.dc.html', app: { go: ['skill'] } },
  { id: '3.4', title: 'Hộp duyệt', canvas: 'HopDuyet.dc.html', app: { go: ['approvals'] } },
  { id: '3.5', title: 'Việc đang chạy', canvas: 'DangChay.dc.html', app: { go: ['runs'] } },
  { id: '4.1', title: 'Routine', canvas: 'Routine.dc.html', app: { go: ['routine'] } },
  { id: '4.2', title: 'Tạo routine bằng lời', canvas: 'TaoRoutine.dc.html', app: { go: ['routine-new'] } },
  {
    id: '4.3',
    title: 'Kanban',
    canvas: 'Kanban.dc.html',
    app: { go: ['kanban', { project: 'kenh-youtube-q4' }] },
  },
  { id: '5.1', title: 'Ghi chú', canvas: 'GhiChu.dc.html', app: { go: ['brain'] } },
  { id: '5.2', title: 'Hộp thư vào', canvas: 'HopThuVao.dc.html', app: { go: ['brain', { view: 'inbox' }] } },
  { id: '5.3', title: 'Đồ thị toàn cục', canvas: 'DoThi.dc.html', app: { go: ['brain', { view: 'graph' }] } },
  { id: '5.4', title: 'Hỏi bộ não', canvas: 'HoiBoNao.dc.html', app: { go: ['brain', { view: 'ask' }] } },
  {
    id: '6.1',
    title: 'Bảng điều khiển',
    canvas: 'DieuKhien.dc.html',
    app: { go: ['settings', { section: 'dashboard' }] },
  },
  {
    id: '6.2',
    title: 'Provider & model',
    canvas: 'Provider.dc.html',
    app: { go: ['settings', { section: 'provider' }] },
  },
  {
    id: '6.3',
    title: 'Kênh & ghép đôi',
    canvas: 'Kenh.dc.html',
    app: { go: ['settings', { section: 'channels' }] },
  },
  {
    id: '6.3b',
    title: 'Mặt tích hợp',
    canvas: 'MatTichHop.dc.html',
    app: { go: ['settings', { section: 'integrations' }] },
  },
  {
    id: '6.4',
    title: 'Ngân sách, duyệt, mạng',
    canvas: 'BaoMat.dc.html',
    app: { go: ['settings', { section: 'guard' }] },
  },
  {
    id: '6.5',
    title: 'Thống kê & nhật ký',
    canvas: 'ThongKe.dc.html',
    app: { go: ['settings', { section: 'stats' }] },
  },
  {
    id: '6.6',
    title: 'Màn hình của bot',
    canvas: 'ManHinhBot.dc.html',
    app: { go: ['settings', { section: 'screen' }] },
  },
  { id: '6.7', title: 'Plugin', canvas: 'Plugin.dc.html', app: { go: ['settings', { section: 'plugin' }] } },
  { id: '7.1', title: 'Telegram · thẻ duyệt', canvas: 'TeleDuyet.dc.html', app: null, why: 'GĐ1 / GĐ3' },
  { id: '7.2', title: 'Telegram · báo cáo routine', canvas: 'TeleRoutine.dc.html', app: null, why: 'GĐ4' },
  { id: '7.3', title: 'Telegram · đề xuất ký ức/skill', canvas: 'TeleDeXuat.dc.html', app: null, why: 'GĐ3' },
  { id: '7.4', title: 'Chat web trên điện thoại', canvas: 'MobileChat.dc.html', app: { chat: true } },
]
