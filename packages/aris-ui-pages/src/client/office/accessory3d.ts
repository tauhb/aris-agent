/**
 * Phụ kiện 3D của linh vật trong Văn phòng 3D (bản vẽ `PhuKien3D`): đủ 22 món như bản 2D (`@aris/ui-kit`,
 * `accessories.ts`), chọn theo `resolveAccessory`. Mọi bot 3D cùng một thân capsule nên một món vừa cho mọi dáng.
 * Toạ độ theo thân chưa phóng: cao khoảng 1,3 (tâm y 0,66, bán kính 0,42), mắt ở y 0,85, mặt trước z 0,42.
 * Mười món đầu chép từ bản vẽ; mười hai món còn lại dựng cùng phong cách bằng khối đơn giản. Hình và vật liệu
 * của mỗi lần dựng là riêng, nơi dùng tự dọn bằng {@link disposeAccessory}.
 */
import { accessoryTint, resolveAccessory } from '@aris/ui-kit'
import * as T from 'three'

type Build = (g: T.Group, tint: string | undefined) => void

const mat = (c: T.ColorRepresentation, o: T.MeshStandardMaterialParameters = {}) =>
  new T.MeshStandardMaterial({ color: c, roughness: 0.55, ...o })

/** Thêm một khối vào nhóm `g` tại vị trí và góc xoay cho trước (rad). */
function add(
  g: T.Object3D,
  geo: T.BufferGeometry,
  m: T.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const o = new T.Mesh(geo, m)
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.castShadow = true
  g.add(o)
  return o
}

/** Màu riêng của cặp dáng × phụ kiện nếu có, không thì màu mặc định của hàm 2D. */
const pick = (tint: string | undefined, fallback: number) => new T.Color(tint ?? fallback)

const INK = 0x16171b
const WHITE = 0xffffff
const YELLOW = 0xfde047

/** Một cánh nơ: hình nón nằm ngang, đỉnh hướng vào nút giữa, hơi quặp ra sau để ôm theo mặt cong của thân. */
const wing = (g: T.Object3D, m: T.Material, dir: -1 | 1, r: number, len: number) => {
  const w = new T.Group()
  w.rotation.y = dir * 0.5
  g.add(w)
  add(w, new T.ConeGeometry(r, len, 14), m, (dir * len) / 2, 0, 0, 0, 0, dir * (Math.PI / 2))
}

export const ACC3D: Readonly<Record<string, Build>> = {
  'vuong-mien': (g, tint) => {
    const gold = mat(pick(tint, 0xffaa00), { metalness: 0.3, roughness: 0.35 })
    add(g, new T.CylinderGeometry(0.24, 0.22, 0.14, 20, 1, true), gold, 0, 1.36, 0)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      add(g, new T.ConeGeometry(0.06, 0.16, 8), gold, Math.sin(a) * 0.23, 1.5, Math.cos(a) * 0.23)
    }
  },
  kinh: (g) => {
    const ink = mat(INK)
    for (const x of [-0.15, 0.15]) add(g, new T.TorusGeometry(0.13, 0.022, 10, 28), ink, x, 0.85, 0.47)
    add(g, new T.CylinderGeometry(0.015, 0.015, 0.06, 8), ink, 0, 0.87, 0.47, 0, 0, Math.PI / 2)
  },
  'kinh-doc': (g) => {
    const m = mat(0xb45309)
    for (const x of [-0.15, 0.15])
      add(g, new T.TorusGeometry(0.11, 0.02, 10, 20, Math.PI), m, x, 0.82, 0.47, 0, 0, Math.PI)
    add(g, new T.CylinderGeometry(0.014, 0.014, 0.08, 8), m, 0, 0.82, 0.47, 0, 0, Math.PI / 2)
  },
  'tai-nghe': (g) => {
    const ink = mat(INK)
    add(g, new T.TorusGeometry(0.45, 0.035, 10, 32, Math.PI), ink, 0, 0.88, 0)
    for (const x of [-0.45, 0.45])
      add(g, new T.CylinderGeometry(0.11, 0.11, 0.08, 20), ink, x, 0.85, 0, 0, 0, Math.PI / 2)
  },
  'tai-nghe-mic': (g) => {
    const ink = mat(INK)
    add(g, new T.TorusGeometry(0.45, 0.035, 10, 32, Math.PI), ink, 0, 0.88, 0)
    for (const x of [-0.45, 0.45])
      add(g, new T.CylinderGeometry(0.11, 0.11, 0.08, 20), ink, x, 0.85, 0, 0, 0, Math.PI / 2)
    add(g, new T.CylinderGeometry(0.014, 0.014, 0.42, 8), ink, -0.32, 0.67, 0.25, 0.9, 0.6, 0)
    add(g, new T.SphereGeometry(0.04, 10, 8), ink, -0.18, 0.55, 0.42)
  },
  'mu-luoi-trai': (g, tint) => {
    const m = mat(pick(tint, 0x1d4ed8))
    add(g, new T.SphereGeometry(0.43, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 1.06, 0)
    add(g, new T.CylinderGeometry(0.26, 0.26, 0.03, 24, 1, false, -Math.PI / 2, Math.PI), m, 0, 1.07, 0.36)
  },
  'mu-noi': (g, tint) => {
    const m = mat(pick(tint, 0x7c3aed))
    add(g, new T.SphereGeometry(0.4, 24, 12), m, 0.04, 1.3, 0, 0, 0, -0.18).scale.set(1, 0.32, 1)
    add(g, new T.CylinderGeometry(0.02, 0.03, 0.1, 8), m, 0.02, 1.45, 0)
  },
  'mu-bao-ho': (g, tint) => {
    const shell = mat(pick(tint, 0xfacc15))
    const rim = mat(0xeab308)
    add(g, new T.SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 1.05, 0)
    add(g, new T.CylinderGeometry(0.58, 0.58, 0.04, 32), rim, 0, 1.06, 0.04)
    add(g, new T.BoxGeometry(0.06, 0.06, 0.8), rim, 0, 1.42, 0)
  },
  'mu-len': (g, tint) => {
    const wool = mat(pick(tint, 0x2563eb), { roughness: 0.95 })
    add(g, new T.SphereGeometry(0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), wool, 0, 1.04, 0)
    add(g, new T.TorusGeometry(0.43, 0.07, 10, 32), wool, 0, 1.06, 0, Math.PI / 2)
    add(g, new T.SphereGeometry(0.11, 14, 10), mat(WHITE, { roughness: 1 }), 0, 1.52, 0)
  },
  'ca-vat': (g, tint) => {
    const m = mat(pick(tint, 0x1e3a8a))
    add(g, new T.BoxGeometry(0.1, 0.08, 0.04), m, 0, 0.62, 0.41)
    add(g, new T.ConeGeometry(0.1, 0.42, 4), m, 0, 0.38, 0.41, Math.PI, Math.PI / 4, 0).scale.set(1, 1, 0.25)
  },
  'may-tinh': (g) => {
    const c = new T.Group()
    add(c, new T.BoxGeometry(0.26, 0.36, 0.05), mat(0x2a2d35), 0, 0, 0)
    add(c, new T.BoxGeometry(0.18, 0.07, 0.01), new T.MeshBasicMaterial({ color: 0x9be3b5 }), 0, 0.1, 0.03)
    const key = mat(0xc9ced6)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        add(c, new T.BoxGeometry(0.04, 0.04, 0.01), key, -0.06 + i * 0.06, -0.02 - j * 0.055, 0.03)
    c.position.set(0.42, 0.5, 0.28)
    c.rotation.set(-0.2, -0.5, 0.15)
    g.add(c)
  },

  // --- Mười hai món dựng thêm ---------------------------------------------------------------------------------
  'mu-tiec': (g, tint) => {
    // Nón nghiêng nhẹ, đứng trên đỉnh đầu; hai vòng vàng và quả bông vàng ở chóp.
    const hat = new T.Group()
    hat.position.set(0, 1.2, 0)
    hat.rotation.z = -0.12
    add(hat, new T.ConeGeometry(0.2, 0.5, 20), mat(pick(tint, 0x8b5cf6)), 0, 0.25, 0)
    const gold = mat(YELLOW)
    add(hat, new T.TorusGeometry(0.15, 0.016, 8, 24), gold, 0, 0.11, 0, Math.PI / 2)
    add(hat, new T.TorusGeometry(0.1, 0.016, 8, 24), gold, 0, 0.24, 0, Math.PI / 2)
    add(hat, new T.SphereGeometry(0.05, 12, 10), gold, 0, 0.51, 0)
    g.add(hat)
  },
  'mu-dau-bep': (g) => {
    // Dải trắng quanh đầu và ba khối phồng ở trên.
    const white = mat(WHITE, { roughness: 0.9 })
    add(g, new T.CylinderGeometry(0.33, 0.31, 0.2, 24), white, 0, 1.22, 0)
    add(g, new T.SphereGeometry(0.24, 16, 12), white, 0, 1.5, 0)
    add(g, new T.SphereGeometry(0.17, 14, 10), white, -0.2, 1.4, 0)
    add(g, new T.SphereGeometry(0.17, 14, 10), white, 0.2, 1.4, 0)
    add(g, new T.SphereGeometry(0.15, 14, 10), white, 0, 1.4, 0.18)
  },
  'mu-tot-nghiep': (g) => {
    // Chóp tròn thấp, tấm vuông xoay chéo, tua vàng buông xuống cạnh.
    const ink = mat(INK)
    const gold = mat(0xfacc15)
    add(g, new T.CylinderGeometry(0.28, 0.3, 0.14, 24), ink, 0, 1.2, 0)
    add(g, new T.BoxGeometry(0.8, 0.04, 0.8), ink, 0, 1.31, 0, 0, Math.PI / 4, 0)
    add(g, new T.SphereGeometry(0.035, 10, 8), gold, 0, 1.34, 0)
    add(g, new T.CylinderGeometry(0.008, 0.008, 0.3, 6), gold, 0.15, 1.34, 0, 0, 0, Math.PI / 2)
    add(g, new T.CylinderGeometry(0.008, 0.008, 0.26, 6), gold, 0.3, 1.2, 0)
    add(g, new T.SphereGeometry(0.04, 10, 8), gold, 0.3, 1.05, 0)
  },
  'mu-ngu': (g, tint) => {
    // Nón dài rủ về một bên, viền trắng quanh đầu, quả bông trắng ở chóp.
    const cap = new T.Group()
    cap.position.set(0, 1.12, 0)
    cap.rotation.z = -0.55
    add(cap, new T.ConeGeometry(0.31, 0.6, 20), mat(pick(tint, 0x6366f1)), 0, 0.3, 0)
    add(cap, new T.SphereGeometry(0.075, 12, 10), mat(WHITE, { roughness: 1 }), 0, 0.62, 0)
    g.add(cap)
    add(g, new T.TorusGeometry(0.34, 0.06, 10, 28), mat(WHITE, { roughness: 0.9 }), 0, 1.15, 0, Math.PI / 2)
  },
  'mu-y-ta': (g) => {
    // Mũ trắng thấp hơi loe, chữ thập đỏ ở mặt trước.
    add(g, new T.CylinderGeometry(0.27, 0.3, 0.2, 24), mat(WHITE, { roughness: 0.9 }), 0, 1.24, 0)
    const red = mat(0xe11d48)
    add(g, new T.BoxGeometry(0.14, 0.04, 0.02), red, 0, 1.26, 0.29)
    add(g, new T.BoxGeometry(0.04, 0.14, 0.02), red, 0, 1.26, 0.29)
  },
  'mu-rong-vanh': (g) => {
    // Chóp bầu, vành rộng phẳng và dải đỏ quanh chóp.
    add(
      g,
      new T.SphereGeometry(0.37, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0xf2c879),
      0,
      1.13,
      0,
    ).scale.set(1, 0.7, 1)
    add(g, new T.CylinderGeometry(0.62, 0.62, 0.03, 36), mat(0xe9b95e), 0, 1.15, 0)
    add(g, new T.TorusGeometry(0.36, 0.035, 8, 32), mat(0xe11d48), 0, 1.2, 0, Math.PI / 2)
  },
  'mam-cay': (g) => {
    // Thân mảnh trên đỉnh đầu và hai lá bầu dục.
    add(g, new T.CylinderGeometry(0.02, 0.025, 0.2, 8), mat(0x15803d), 0, 1.4, 0)
    add(g, new T.SphereGeometry(0.1, 12, 8), mat(0x22c55e), -0.1, 1.53, 0, 0, 0, 0.5).scale.set(
      1.6,
      0.35,
      0.9,
    )
    add(g, new T.SphereGeometry(0.1, 12, 8), mat(0x4ade80), 0.1, 1.55, 0, 0, 0, -0.5).scale.set(
      1.6,
      0.35,
      0.9,
    )
  },
  'no-cai': (g, tint) => {
    // Nơ nằm lệch về bên phải trên đầu, nghiêng theo mặt cong của thân.
    const c = pick(tint, 0xf43f5e)
    const bow = new T.Group()
    bow.position.set(0.17, 1.24, 0.12)
    bow.rotation.set(-0.5, 0, -0.25)
    const m = mat(c)
    wing(bow, m, -1, 0.13, 0.26)
    wing(bow, m, 1, 0.13, 0.26)
    add(bow, new T.SphereGeometry(0.06, 12, 10), mat(c.clone().multiplyScalar(0.8)), 0, 0, 0)
    g.add(bow)
  },
  'no-co': (g, tint) => {
    // Nơ đặt ngay dưới mắt, sát mặt trước của thân.
    const c = pick(tint, 0xe11d48)
    const bow = new T.Group()
    bow.position.set(0, 0.6, 0.43)
    const m = mat(c)
    wing(bow, m, -1, 0.1, 0.22)
    wing(bow, m, 1, 0.1, 0.22)
    add(bow, new T.BoxGeometry(0.08, 0.1, 0.06), mat(c.clone().multiplyScalar(0.8)), 0, 0, 0)
    g.add(bow)
  },
  'but-chi': (g) => {
    // Bút chì giắt bên phải đầu: gốc (đầu tẩy) chạm thân, đầu nhọn chĩa chếch ra ngoài, lên trên và ra trước.
    const dir = new T.Vector3(0.55, 0.45, 0.7).normalize()
    const aim = new T.Group()
    aim.position.set(0.39, 1.0, 0.05).addScaledVector(dir, 0.2)
    aim.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir)
    const pencil = new T.Group()
    pencil.rotation.x = -Math.PI / 2
    add(pencil, new T.CylinderGeometry(0.028, 0.028, 0.36, 8), mat(0xfacc15), 0, 0, 0)
    add(pencil, new T.CylinderGeometry(0.03, 0.03, 0.05, 8), mat(0xf472b6), 0, 0.205, 0)
    add(pencil, new T.ConeGeometry(0.028, 0.08, 8), mat(0xf2d3a8), 0, -0.22, 0, Math.PI)
    add(pencil, new T.ConeGeometry(0.01, 0.025, 6), mat(INK), 0, -0.2575, 0, Math.PI)
    aim.add(pencil)
    g.add(aim)
  },
  'huy-hieu': (g) => {
    // Huy hiệu vàng sáu cạnh gắn ngực bên trái, quay mặt ra theo độ cong của thân.
    const badge = new T.Group()
    badge.position.set(-0.2, 0.55, 0.375)
    badge.rotation.y = -0.5
    add(
      badge,
      new T.CylinderGeometry(0.1, 0.1, 0.03, 6),
      mat(0xfacc15, { metalness: 0.3, roughness: 0.35 }),
      0,
      0,
      0,
      Math.PI / 2,
    )
    add(badge, new T.CylinderGeometry(0.05, 0.05, 0.035, 5), mat(0xb45309), 0, 0, 0.004, Math.PI / 2)
    g.add(badge)
  },
}

/**
 * Nhóm phụ kiện của bot (theo `resolveAccessory`), hoặc `null` khi không đeo. Nhóm này nằm trong khung toạ độ của bot
 * chưa phóng; nơi gọi phóng theo cỡ bot.
 */
export function buildAccessory(mascot: string, accessory: string | undefined): T.Group | null {
  const id = resolveAccessory(mascot, accessory)
  const build = id ? ACC3D[id] : undefined
  if (!id || !build) return null
  const g = new T.Group()
  g.name = id
  build(g, accessoryTint(mascot, id))
  return g
}

/** Giải phóng hình và vật liệu của một nhóm phụ kiện (mỗi lần dựng có hình và vật liệu riêng). */
export function disposeAccessory(root: T.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return
    o.geometry.dispose()
    const m: T.Material | T.Material[] = o.material
    for (const x of Array.isArray(m) ? m : [m]) x.dispose()
  })
}
