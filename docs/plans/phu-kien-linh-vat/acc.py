# Bộ sinh phụ kiện linh vật: mỗi phụ kiện là SVG trong hệ 0..100, đặt theo số đo của từng dáng (geo.json).
import json, math
S = './'  # chạy trong thư mục này; all.json là danh sách 50 linh vật xuất từ mascots.generated.ts
ALL = json.load(open(S + 'all.json'))
M = {m['id']: m for m in ALL}
G = json.load(open(S + 'geo.json'))

INK = '#16171B'
EDGE = 'var(--acc-edge)'  # viền mảnh để phụ kiện tối không chìm vào nền tối
f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')

# Chỗ đặt mũ cho dáng có đỉnh lõm hay nhọn (đo tự động lệch).
HAT = {
  'trang-khuyet': (40, 14), 'ngon-lua': (50, 12), 'tia-chop': (56, 10), 'manh-ghep': (40, 14),
  'qua-tao': (44, 16), 'ngon-nui': (52, 30), 'aris': (50, 13), 'sao-nam-canh': (50, 13), 'mat-troi': (50, 12),
  'ha': (40, 22), 'chiec-la': (40, 22), 'hat-dau': (42, 14), 'cai-pheu': (50, 14), 'vuong-mien': (50, 27),
  'mai': (55, 13), 'qua-le': (50, 15), 'coc-ca-phe': (44, 31), 'tam-giac-bo': (50, 17), 'ten-lua': (50, 11),
  'bong-hoa': (50, 14), 'banh-rang': (50, 10), 'banh-quy': (49, 16), 'may-anh': (50, 16), 'ngon-nui': (50, 29), 'tron': (52, 11), 'vien-ngoc': (50, 16),
}

def hat_at(k):
  g = G[k]
  if k in HAT: return HAT[k]
  return (g['hx'], g['top'] + 2)

def eyes(k):
  g = G[k]; e = g['eb']; w = e[2] - e[0]
  return (e[0] + w * 0.24, g['ey']), (e[2] - w * 0.24, g['ey'])

# --- Phụ kiện -----------------------------------------------------------------------------------------------
def crown(k, c='#FFAA00'):
  x, y = hat_at(k); y += 3
  return f'<path d="M{f(x-14)} {f(y)}V{f(y-13)}L{f(x-7)} {f(y-6)}L{f(x)} {f(y-16)}L{f(x+7)} {f(y-6)}L{f(x+14)} {f(y-13)}V{f(y)}Z" fill="{c}" stroke-linejoin="round"/>'

def cap(k, c='#1D4ED8'):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-16)} {f(y)}C{f(x-16)} {f(y-19)} {f(x+16)} {f(y-19)} {f(x+16)} {f(y)}Z" fill="{c}"/>'
          f'<rect x="{f(x+6)}" y="{f(y-4)}" width="22" height="6" rx="3" fill="{c}"/>'
          f'<circle cx="{f(x)}" cy="{f(y-14)}" r="2.6" fill="{c}"/>')

def beret(k, c='#7C3AED'):
  x, y = hat_at(k); y += 4
  return (f'<ellipse cx="{f(x+2)}" cy="{f(y-4)}" rx="20" ry="8.5" transform="rotate(-10 {f(x+2)} {f(y-4)})" fill="{c}"/>'
          f'<path d="M{f(x+2)} {f(y-12)}l2 -5" stroke="{c}" stroke-width="3.5" stroke-linecap="round"/>')

def hardhat(k, c='#FACC15'):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-16)} {f(y-2)}C{f(x-16)} {f(y-21)} {f(x+16)} {f(y-21)} {f(x+16)} {f(y-2)}Z" fill="{c}"/>'
          f'<rect x="{f(x-22)}" y="{f(y-4)}" width="44" height="6.5" rx="3.2" fill="#EAB308"/>'
          f'<path d="M{f(x)} {f(y-19)}V{f(y-5)}" stroke="#EAB308" stroke-width="3"/>')

def beanie(k, c='#2563EB'):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-16)} {f(y-2)}C{f(x-16)} {f(y-22)} {f(x+16)} {f(y-22)} {f(x+16)} {f(y-2)}Z" fill="{c}"/>'
          f'<rect x="{f(x-17.5)}" y="{f(y-6)}" width="35" height="8" rx="4" fill="{c}" style="filter:brightness(.82)"/>'
          f'<circle cx="{f(x)}" cy="{f(y-21)}" r="5" fill="#fff" stroke="{INK}" stroke-width="1.2"/>')

def partyhat(k, c='#8B5CF6'):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-11)} {f(y)}L{f(x+1)} {f(y-25)}L{f(x+12)} {f(y)}Z" fill="{c}"/>'
          f'<path d="M{f(x-6)} {f(y-11)}L{f(x+7)} {f(y-11)}M{f(x-8.5)} {f(y-5)}L{f(x+9.5)} {f(y-5)}" stroke="#FDE047" stroke-width="2.6" stroke-linecap="round"/>'
          f'<circle cx="{f(x+1)}" cy="{f(y-26)}" r="3.6" fill="#FDE047"/>')

def chef(k):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-12)} {f(y)}V{f(y-8)}C{f(x-22)} {f(y-10)} {f(x-18)} {f(y-26)} {f(x-8)} {f(y-21)}C{f(x-6)} {f(y-30)} {f(x+6)} {f(y-30)} {f(x+8)} {f(y-21)}C{f(x+18)} {f(y-26)} {f(x+22)} {f(y-10)} {f(x+12)} {f(y-8)}V{f(y)}Z" fill="#fff" stroke="{INK}" stroke-width="2"/>'
          f'<path d="M{f(x-12)} {f(y-4)}H{f(x+12)}" stroke="{INK}" stroke-width="1.6"/>')

def gradcap(k):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-11)} {f(y)}V{f(y-8)}H{f(x+11)}V{f(y)}Z" fill="{INK}" stroke="{EDGE}" stroke-width="1.2"/>'
          f'<path d="M{f(x-24)} {f(y-11)}L{f(x)} {f(y-19)}L{f(x+24)} {f(y-11)}L{f(x)} {f(y-3)}Z" fill="{INK}" stroke="{EDGE}" stroke-width="1.2"/>'
          f'<path d="M{f(x)} {f(y-11)}L{f(x+17)} {f(y-6)}V{f(y+6)}" stroke="#FACC15" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
          f'<circle cx="{f(x+17)}" cy="{f(y+7)}" r="2.8" fill="#FACC15"/>')

def nightcap(k, c='#6366F1'):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-15)} {f(y)}C{f(x-14)} {f(y-18)} {f(x+6)} {f(y-26)} {f(x+26)} {f(y-14)}C{f(x+14)} {f(y-14)} {f(x+12)} {f(y-6)} {f(x+15)} {f(y)}Z" fill="{c}"/>'
          f'<rect x="{f(x-17)}" y="{f(y-5)}" width="34" height="7" rx="3.5" fill="#fff" stroke="{INK}" stroke-width="1.2"/>'
          f'<circle cx="{f(x+27)}" cy="{f(y-13)}" r="4.5" fill="#fff" stroke="{INK}" stroke-width="1.2"/>')

def nursecap(k):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-15)} {f(y)}L{f(x-12)} {f(y-14)}H{f(x+12)}L{f(x+15)} {f(y)}Z" fill="#fff" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
          f'<path d="M{f(x)} {f(y-11)}V{f(y-3)}M{f(x-4)} {f(y-7)}H{f(x+4)}" stroke="#E11D48" stroke-width="3" stroke-linecap="round"/>')

def sunhat(k):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x-13)} {f(y-2)}C{f(x-13)} {f(y-19)} {f(x+13)} {f(y-19)} {f(x+13)} {f(y-2)}Z" fill="#F2C879"/>'
          f'<ellipse cx="{f(x)}" cy="{f(y-2)}" rx="27" ry="5.5" fill="#E9B95E"/>'
          f'<rect x="{f(x-13)}" y="{f(y-8)}" width="26" height="4.5" fill="#E11D48"/>')

def sprout(k):
  x, y = hat_at(k); y += 3
  return (f'<path d="M{f(x)} {f(y)}V{f(y-14)}" stroke="#15803D" stroke-width="3" stroke-linecap="round"/>'
          f'<path d="M{f(x)} {f(y-12)}C{f(x-4)} {f(y-22)} {f(x-16)} {f(y-22)} {f(x-17)} {f(y-15)}C{f(x-12)} {f(y-9)} {f(x-3)} {f(y-9)} {f(x)} {f(y-12)}Z" fill="#22C55E"/>'
          f'<path d="M{f(x)} {f(y-12)}C{f(x+4)} {f(y-24)} {f(x+15)} {f(y-25)} {f(x+17)} {f(y-18)}C{f(x+13)} {f(y-11)} {f(x+4)} {f(y-10)} {f(x)} {f(y-12)}Z" fill="#4ADE80"/>')

def hairbow(k, c='#F43F5E'):
  x, y = hat_at(k); x += 9; y += 4
  return (f'<path d="M{f(x)} {f(y-6)}L{f(x-13)} {f(y-14)}L{f(x-13)} {f(y+2)}Z M{f(x)} {f(y-6)}L{f(x+13)} {f(y-14)}L{f(x+13)} {f(y+2)}Z" fill="{c}" stroke="{c}" stroke-width="2.5" stroke-linejoin="round"/>'
          f'<circle cx="{f(x)}" cy="{f(y-6)}" r="4" fill="{c}" style="filter:brightness(.85)"/>')

def headset(k, mic=False):
  g = G[k]; ey = g['ey']; L = g['L']; R = g['R']; x, top = hat_at(k)
  s = (f'<path d="M{f(L+3)} {f(ey)}C{f(L+3)} {f(top-14)} {f(R-3)} {f(top-14)} {f(R-3)} {f(ey)}" fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round" style="paint-order:stroke"/>'
       f'<rect x="{f(L-3)}" y="{f(ey-9)}" width="10" height="18" rx="4.5" fill="{INK}" stroke="{EDGE}" stroke-width="1.2"/>'
       f'<rect x="{f(R-7)}" y="{f(ey-9)}" width="10" height="18" rx="4.5" fill="{INK}" stroke="{EDGE}" stroke-width="1.2"/>')
  if mic:
    s += (f'<path d="M{f(L+3)} {f(ey+7)}C{f(L+6)} {f(ey+18)} {f(g["ex"]-16)} {f(ey+20)} {f(g["ex"]-9)} {f(ey+17)}" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'
          f'<circle cx="{f(g["ex"]-8)}" cy="{f(ey+17)}" r="3.4" fill="{INK}"/>')
  return s

def glasses(k):
  (lx, ly), (rx, ry) = eyes(k); r = max(9.5, min(11, G[k]['eh'] * 0.52))
  return (f'<g fill="none" stroke="{INK}" stroke-width="3.2"><circle cx="{f(lx)}" cy="{f(ly)}" r="{f(r)}"/><circle cx="{f(rx)}" cy="{f(ry)}" r="{f(r)}"/>'
          f'<path d="M{f(lx+r)} {f(ly-1)}Q{f((lx+rx)/2)} {f(ly-5)} {f(rx-r)} {f(ry-1)}"/></g>')

def halfglasses(k):
  (lx, ly), (rx, ry) = eyes(k); r = 8; y = ly + 3; c = '#B45309'
  return (f'<g fill="none" stroke="{c}" stroke-width="3.2" stroke-linecap="round"><path d="M{f(lx-r)} {f(y)}H{f(lx+r)}A{r} {r} 0 0 1 {f(lx-r)} {f(y)}Z"/>'
          f'<path d="M{f(rx-r)} {f(y)}H{f(rx+r)}A{r} {r} 0 0 1 {f(rx-r)} {f(y)}Z"/><path d="M{f(lx+r)} {f(y)}H{f(rx-r)}"/></g>')

def necktie(k, c='#1E3A8A'):
  g = G[k]; x = g['ex']; y = g['eb'][3] + 3; end = min(g['bot'] - 3, y + 32)
  return (f'<path d="M{f(x-6)} {f(y)}H{f(x+6)}L{f(x+4)} {f(y+7)}H{f(x-4)}Z" fill="{c}"/>'
          f'<path d="M{f(x-4)} {f(y+7)}H{f(x+4)}L{f(x+8.5)} {f(end-8)}L{f(x)} {f(end)}L{f(x-8.5)} {f(end-8)}Z" fill="{c}"/>'
          f'<path d="M{f(x-4)} {f(y+14)}L{f(x+5)} {f(y+10)}M{f(x-5.5)} {f(y+22)}L{f(x+6)} {f(y+17)}" stroke="#FDE047" stroke-width="2.2"/>')

def bowtie(k, c='#E11D48'):
  g = G[k]; x = g['ex']; y = min(g['eb'][3] + 9, g['bot'] - 10)
  return (f'<path d="M{f(x)} {f(y)}L{f(x-12)} {f(y-7)}V{f(y+7)}Z M{f(x)} {f(y)}L{f(x+12)} {f(y-7)}V{f(y+7)}Z" fill="{c}" stroke="{c}" stroke-width="2.5" stroke-linejoin="round"/>'
          f'<rect x="{f(x-3.5)}" y="{f(y-4)}" width="7" height="8" rx="2.5" fill="{c}" style="filter:brightness(.8)"/>')

def calculator(k):
  g = G[k]; x = min(g['Rb'] - 8, 80); y = min(g['ey'] + 12, g['bot'] - 24)
  b = ''.join(f'<rect x="{f(x+3.5+i*5)}" y="{f(y+12+j*5)}" width="3.4" height="3.4" rx="1" fill="#C9CED6"/>' for i in range(3) for j in range(3))
  return (f'<g transform="rotate(8 {f(x+9)} {f(y+14)})"><rect x="{f(x)}" y="{f(y)}" width="19" height="28" rx="3.5" fill="#2A2D35" stroke="{EDGE}" stroke-width="1.2"/>'
          f'<rect x="{f(x+3)}" y="{f(y+3)}" width="13" height="6.5" rx="1.5" fill="#9BE3B5"/>{b}</g>')

def pencil(k):
  g = G[k]; x = min(g['R'] - 4, g['eb'][2] + 14); y = g['eb'][1] - 4
  return (f'<g transform="rotate(-38 {f(x)} {f(y)})"><rect x="{f(x-3.5)}" y="{f(y-14)}" width="7" height="26" fill="#FACC15"/>'
          f'<rect x="{f(x-3.5)}" y="{f(y-19)}" width="7" height="5" rx="1.5" fill="#F472B6"/>'
          f'<path d="M{f(x-3.5)} {f(y+12)}L{f(x)} {f(y+19)}L{f(x+3.5)} {f(y+12)}Z" fill="#F2D3A8"/><path d="M{f(x-1.2)} {f(y+16.5)}L{f(x)} {f(y+19)}L{f(x+1.2)} {f(y+16.5)}Z" fill="{INK}"/></g>')

def badge(k):
  g = G[k]; x = max(g['Lb'] + 11, g['ex'] - g['ew'] * 0.55 - 6); y = min(g['ey'] + 18, g['bot'] - 14)
  return (f'<path d="M{f(x)} {f(y-9)}L{f(x+8)} {f(y-6)}V{f(y+1)}C{f(x+8)} {f(y+6)} {f(x+4)} {f(y+9)} {f(x)} {f(y+11)}C{f(x-4)} {f(y+9)} {f(x-8)} {f(y+6)} {f(x-8)} {f(y+1)}V{f(y-6)}Z" fill="#FACC15" stroke="#B45309" stroke-width="1.6"/>'
          f'<path d="M{f(x)} {f(y-4)}l1.8 3.6 4 .5-2.9 2.7.8 4-3.7-2-3.7 2 .8-4-2.9-2.7 4-.5Z" fill="#B45309"/>')

ACC = {  # tên hiện, hàm vẽ
  'vuong-mien': ('Vương miện', crown), 'kinh': ('Kính tròn', glasses), 'kinh-doc': ('Kính đọc sách', halfglasses),
  'tai-nghe': ('Tai nghe', headset), 'tai-nghe-mic': ('Tai nghe có mic', lambda k: headset(k, True)),
  'mu-luoi-trai': ('Mũ lưỡi trai', cap), 'mu-noi': ('Mũ nồi', beret), 'mu-bao-ho': ('Mũ bảo hộ', hardhat),
  'mu-len': ('Mũ len', beanie), 'mu-tiec': ('Mũ tiệc', partyhat), 'mu-dau-bep': ('Mũ đầu bếp', chef),
  'mu-tot-nghiep': ('Mũ tốt nghiệp', gradcap), 'mu-ngu': ('Mũ ngủ', nightcap), 'mu-y-ta': ('Mũ y tá', nursecap),
  'mu-rong-vanh': ('Mũ rộng vành', sunhat), 'mam-cay': ('Mầm cây', sprout), 'no-cai': ('Nơ cài tóc', hairbow),
  'ca-vat': ('Cà vạt', necktie), 'no-co': ('Nơ cổ', bowtie), 'may-tinh': ('Máy tính bỏ túi', calculator),
  'but-chi': ('Bút chì giắt tai', pencil), 'huy-hieu': ('Huy hiệu', badge),
}

# Phụ kiện mặc định của từng dáng, theo vai gợi ý của dáng.
DEFAULT = {
  'aris': 'vuong-mien', 'lam': 'kinh', 'mai': 'tai-nghe-mic', 'tin': 'may-tinh', 'dev': 'mu-luoi-trai', 'ha': 'mu-noi',
  'tron': 'tai-nghe-mic', 'qua-trung': 'mu-tot-nghiep', 'vien-thuoc-ngang': 'kinh', 'tam-giac-bo': 'but-chi',
  'dam-may': 'mu-rong-vanh', 'luc-giac': 'huy-hieu', 'hinh-thang': 'ca-vat', 'hat-dau': 'but-chi', 'co-bon-la': 'mu-luoi-trai',
  'bong-hoa': 'no-cai', 'bat-giac': 'no-co', 'vien-thuoc-dung': 'but-chi', 'mai-vom': 'mu-bao-ho', 'khien': 'huy-hieu',
  'chiec-chuong': 'tai-nghe', 'trang-khuyet': 'mu-ngu', 'sao-nam-canh': 'ca-vat', 'qua-le': 'no-cai', 'vien-ngoc': 'kinh',
  'chu-thap': 'mu-y-ta', 'banh-rang': 'mu-bao-ho', 'bong-bong-thoai': 'mu-luoi-trai', 'chiec-la': 'mam-cay',
  'vuong-mien': 'no-co', 'tia-chop': 'mu-bao-ho', 'trang-giay': 'kinh-doc', 'coc-ca-phe': 'mu-len', 'ngon-lua': 'mu-tiec',
  'banh-quy': 'mu-dau-bep', 'qua-tao': 'mu-tot-nghiep', 'mui-ten-len': 'mam-cay', 'o-khoa': 'huy-hieu', 'bong-den': 'mu-noi',
  'da-cuoi': 'mu-len', 'cai-pheu': 'ca-vat', 'mat-troi': 'mu-rong-vanh', 'manh-ghep': 'mu-bao-ho', 'cuon-sach': 'kinh-doc',
  'ngoi-nha': 'ca-vat', 'cai-o': 'no-co', 'bong-bay': 'mu-tiec', 'ngon-nui': 'mu-len', 'may-anh': 'mu-noi', 'ten-lua': 'mu-luoi-trai',
}

# Đội thật đang chạy (lấy từ /api/aris/bots): tên, vai, dáng, phụ kiện chọn theo vai bot.
TEAM = [
  ('Aris', 'Chỉ huy', 'aris', 'vuong-mien'), ('Minh', 'Nghiên cứu', 'lam', 'kinh'), ('Thơ', 'Nội dung', 'ha', 'mu-noi'),
  ('Phát', 'Bán hàng và chăm khách', 'hinh-thang', 'ca-vat'), ('An', 'Thư ký', 'mai', 'tai-nghe-mic'),
  ('Ngân', 'Tài chính', 'tin', 'may-tinh'), ('Khoa', 'Kỹ thuật', 'dev', 'mu-luoi-trai'),
  ('Kiệt', 'Bot ngoài · Claude Code', 'banh-rang', 'mu-bao-ho'), ('Lan', 'Bot ngoài · Codex', 'bong-bay', 'mu-len'),
  ('Thủ thư', 'Giữ bộ não', 'trang-giay', 'kinh-doc'),
]

# Màu phụ kiện tránh trùng màu thân.
TINT = {('hinh-thang', 'ca-vat'): '#1E3A8A', ('bong-bay', 'mu-len'): '#2563EB', ('dev', 'mu-luoi-trai'): '#1D4ED8',
        ('ha', 'mu-noi'): '#6D28D9', ('co-bon-la', 'mu-luoi-trai'): '#E11D48', ('bong-bong-thoai', 'mu-luoi-trai'): '#F59E0B',
        ('ten-lua', 'mu-luoi-trai'): '#F59E0B', ('bong-den', 'mu-noi'): '#1E293B', ('may-anh', 'mu-noi'): '#E11D48',
        ('qua-le', 'no-cai'): '#EC4899', ('bong-hoa', 'no-cai'): '#E11D48', ('cai-o', 'no-co'): '#F59E0B',
        ('bat-giac', 'no-co'): '#E11D48', ('vuong-mien', 'no-co'): '#E11D48', ('sao-nam-canh', 'ca-vat'): '#1E3A8A',
        ('cai-pheu', 'ca-vat'): '#1E293B', ('ngoi-nha', 'ca-vat'): '#1E3A8A', ('ngon-lua', 'mu-tiec'): '#2563EB',
        ('bong-bay', 'mu-tiec'): '#8B5CF6', ('da-cuoi', 'mu-len'): '#E11D48', ('ngon-nui', 'mu-len'): '#F97316',
        ('coc-ca-phe', 'mu-len'): '#E11D48', ('trang-khuyet', 'mu-ngu'): '#A5B4FC'}

def acc_svg(k, a):
  fn = ACC[a][1]; c = TINT.get((k, a))
  try:
    return fn(k, c) if c else fn(k)
  except TypeError:
    return fn(k)

def svg(k, a, size, label=''):
  m = M[k]
  return (f'<svg width="{size}" height="{size}" viewBox="0 0 100 100" style="overflow: visible" aria-hidden="true">'
          f'{m["body"]}{acc_svg(k, a) if a else ""}</svg>')
