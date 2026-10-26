/**
 * Cảnh three.js của Văn phòng 3D (bản vẽ `VanPhong3D`, hàm `build`): sàn, tường, cửa kính, thảm theo phòng ban, bàn có
 * laptop, bàn chỉ huy, bàn họp, sofa, tủ, cây, đèn bàn; bot capsule đi tới chỗ mới khi đổi trạng thái. Xoay, phóng to, bấm
 * chọn tự viết (không dùng addon). Dọn đủ khi `dispose()`. Chỉ nạp khi người dùng bật 3D (`import()` động ở `Office3D`).
 */
import * as T from 'three'
import { buildAccessory, disposeAccessory } from './accessory3d.js'
import type { OfficeLayout, Spot } from './layout.js'
import type { Scene } from './model.js'

export interface Actor {
  id: string
  /** Màu thân (màu chủ đạo của linh vật). */
  color: string
  /** Mã linh vật, để chọn phụ kiện mặc định của dáng. */
  mascot: string
  /** Phụ kiện đã lưu của bot (xem `resolveAccessory`); bỏ trống là mặc định của dáng. */
  accessory?: string | undefined
  scene: Scene
  commander: boolean
}

export interface SceneInput {
  layout: OfficeLayout
  actors: readonly Actor[]
  spots: Readonly<Record<string, Spot>>
}

export interface SceneOptions {
  canvas: HTMLCanvasElement
  stage: HTMLElement
  /** Bấm vào bot (mã bot) hoặc vào chỗ trống (`null`). */
  onPick: (id: string | null) => void
  /** Rê chuột vào bot (mã bot) hoặc ra khỏi mọi bot (`null`); chỉ gọi khi giá trị đổi. */
  onHover: (id: string | null) => void
  /** Vị trí màn hình (px, trong `stage`) của thẻ tên: khoá bot, `zone:<mã phòng>` hoặc `sofa:<thứ tự sofa>`. */
  onProject: (key: string, x: number, y: number, visible: boolean) => void
  /** Gọi sau khi đã chiếu xong mọi thẻ của một khung hình, để nơi gọi giãn các thẻ đang chồng nhau. */
  onProjected: () => void
}

export interface OfficeScene {
  update: (input: SceneInput) => void
  select: (id: string | null) => void
  dispose: () => void
}

const SPEED = 3.4
const SIT_Y = 0.42
/** Góc nhìn mặc định của máy ảnh (xoay quanh trục đứng, ngẩng so với mặt sàn). */
const YAW0 = 0.62
const PITCH0 = 0.7

const LIGHT = {
  bg: 0xf6f5f2,
  floor: 0xd9cdb8,
  wall: 0xf2efe9,
  glass: 0xbfdcff,
  wood: 0xb08a62,
  sofa: 0x8a9bb0,
  rugs: [0xcfe0f7, 0xd4ecdc, 0xe6e3dc, 0xf3e1c8, 0xe9d5f0, 0xf7d6d6],
}
const DARK = {
  bg: 0x0f1013,
  floor: 0x2b2621,
  wall: 0x1c1e24,
  glass: 0x0b1630,
  wood: 0x7a5f44,
  sofa: 0x56627a,
  rugs: [0x1f3350, 0x1f3d2e, 0x35332e, 0x4a3a26, 0x3a2c46, 0x4a2a2a],
}

interface Themed {
  mat: T.MeshStandardMaterial
  light: number
  dark: number
}

interface BotState {
  group: T.Group
  body: T.MeshStandardMaterial
  x: number
  z: number
  ang: number
  y: number
  tilt: number
  phase: number
  scale: number
  /** Khoá phụ kiện đang đeo (dáng + phụ kiện đã lưu), để dựng lại khi đổi. */
  accKey: string
  /** Nhóm phụ kiện đang đeo; hình và vật liệu riêng của bot nên tự dọn khi bỏ bot hay đổi phụ kiện. */
  acc: T.Object3D | null
}

/** Số giả ngẫu nhiên có hạt giống: đèn thành phố giống nhau mỗi lần dựng. */
const rand = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Quay `from` về `to` theo đường ngắn nhất, tối đa `step` rad. */
const approachAngle = (from: number, to: number, step: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step
}

const approach = (from: number, to: number, step: number) =>
  Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step

function disposeTree(root: T.Object3D) {
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose()
      const m: T.Material | T.Material[] = o.material
      for (const x of Array.isArray(m) ? m : [m]) x.dispose()
    }
  })
}

/** Dựng cảnh trên `canvas`. Ném lỗi khi không tạo được WebGL (nơi gọi quay về 2D). */
export function createScene(opts: SceneOptions): OfficeScene {
  const { canvas, stage } = opts
  const ren = new T.WebGLRenderer({ canvas, antialias: true })
  ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  ren.shadowMap.enabled = true
  ren.shadowMap.type = T.PCFSoftShadowMap

  const scene = new T.Scene()
  const cam = new T.PerspectiveCamera(38, 1, 0.1, 300)
  let yaw = YAW0
  let pitch = PITCH0
  let dist = 30
  let distMin = 10
  let distMax = 48
  // Người dùng đã tự phóng to thì không tự lùi ra vừa khung nữa khi cửa sổ đổi cỡ.
  let zoomed = false
  const target = new T.Vector3(0, 0.4, 0)
  const place = () => {
    cam.position.set(
      target.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.y + dist * Math.sin(pitch),
      target.z + dist * Math.cos(pitch) * Math.cos(yaw),
    )
    cam.lookAt(target)
  }

  const hemi = new T.HemisphereLight(0xffffff, 0x444444, 1)
  scene.add(hemi)
  const sun = new T.DirectionalLight(0xffffff, 1.4)
  sun.position.set(-8, 16, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)

  // Vật liệu và hình dùng chung cho cả cảnh; dọn ở dispose.
  const shared: { dispose: () => void }[] = []
  const own = <X extends { dispose: () => void }>(x: X): X => {
    shared.push(x)
    return x
  }
  const eyeM = own(new T.MeshBasicMaterial({ color: 0xffffff }))
  const pupM = own(new T.MeshBasicMaterial({ color: 0x16171b }))
  const ringM = own(new T.MeshBasicMaterial({ color: 0x1d6fe0, transparent: true, opacity: 0.9 }))
  const ring = new T.Mesh(own(new T.RingGeometry(0.62, 0.78, 40)), ringM)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  ring.visible = false
  scene.add(ring)

  // --- Phần tĩnh: dựng lại khi bố cục đổi -------------------------------------------------------------------
  let office = new T.Group()
  scene.add(office)
  let themed: Themed[] = []
  let city: T.Group | null = null
  let lamps: T.PointLight[] = []
  let layout: OfficeLayout | null = null
  const screens = new Map<string, T.Mesh>()

  const mat = (c: number, o: T.MeshStandardMaterialParameters = {}) =>
    new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...o })
  const themedMat = (light: number, dark: number, o: T.MeshStandardMaterialParameters = {}) => {
    const m = mat(light, o)
    themed.push({ mat: m, light, dark })
    return m
  }

  /** Lùi ra vừa cả sàn theo cỡ khung (tính cả khung hẹp); giới hạn phóng to theo đó. */
  const fit = () => {
    if (!layout) return
    // Cỡ sàn chiếu lên màn hình ở góc nhìn mặc định (xoay `yaw0`, ngẩng `pitch0`), cộng chiều cao tường; lùi thêm 15% vì
    // phần gần máy ảnh to hơn khi nhìn phối cảnh.
    const vtan = Math.tan(T.MathUtils.degToRad(cam.fov) / 2)
    const htan = vtan * cam.aspect
    const halfX = (layout.width * Math.abs(Math.cos(YAW0)) + layout.depth * Math.abs(Math.sin(YAW0))) / 2
    const halfY =
      ((layout.width * Math.abs(Math.sin(YAW0)) + layout.depth * Math.abs(Math.cos(YAW0))) *
        Math.sin(PITCH0)) /
        2 +
      2
    const base = Math.max(halfX / htan, halfY / vtan) * 1.15
    distMin = base * 0.35
    distMax = base * 1.8
    dist = zoomed ? Math.max(distMin, Math.min(distMax, dist)) : base
  }

  const buildOffice = (l: OfficeLayout) => {
    scene.remove(office)
    disposeTree(office)
    for (const lamp of lamps) lamp.dispose()
    office = new T.Group()
    scene.add(office)
    themed = []
    lamps = []
    screens.clear()
    const add = (o: T.Object3D) => {
      office.add(o)
      return o
    }
    const box = (w: number, h: number, d: number, m: T.Material, x: number, y: number, z: number) => {
      const g = new T.Mesh(new T.BoxGeometry(w, h, d), m)
      g.position.set(x, y, z)
      g.castShadow = true
      g.receiveShadow = true
      add(g)
      return g
    }
    const W = l.width
    const D = l.depth
    const woodM = themedMat(LIGHT.wood, DARK.wood)
    const lapM = mat(0x2a2d35)
    const wallM = themedMat(LIGHT.wall, DARK.wall)

    // Sàn, hai tường
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), themedMat(LIGHT.floor, DARK.floor))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    add(floor)
    box(W, 4, 0.2, wallM, 0, 2, -D / 2)
    box(0.2, 4, D, wallM, -W / 2, 2, 0)

    // Cửa kính trên tường sau, đèn thành phố ngoài cửa (hiện khi tối)
    const glassM = themedMat(LIGHT.glass, DARK.glass, { roughness: 0.2 })
    const panes = Math.max(2, Math.floor((W - 2) / 3.2))
    const x0 = -((panes - 1) * 3.2) / 2
    for (let i = 0; i < panes; i++) box(2.4, 2, 0.05, glassM, x0 + i * 3.2, 2.3, -D / 2 + 0.12)
    const cityGroup = new T.Group()
    const dotG = new T.PlaneGeometry(0.12, 0.18)
    const dotM = new T.MeshBasicMaterial({ color: 0xffd27a })
    for (let i = 0; i < panes * 12; i++) {
      const p = Math.floor(rand(i) * panes)
      const s = new T.Mesh(dotG, dotM)
      s.position.set(x0 + p * 3.2 + (rand(i + 500) - 0.5) * 2.2, 1.5 + rand(i + 900) * 1.6, -D / 2 + 0.16)
      cityGroup.add(s)
    }
    city = cityGroup
    add(cityGroup)

    // Thảm theo phòng ban
    for (const z of l.zones) {
      const r = new T.Mesh(
        new T.PlaneGeometry(z.w - 0.3, z.d - 0.3),
        themedMat(LIGHT.rugs[z.tone % LIGHT.rugs.length]!, DARK.rugs[z.tone % DARK.rugs.length]!),
      )
      r.rotation.x = -Math.PI / 2
      r.position.set(z.x, 0.01, z.z)
      r.receiveShadow = true
      add(r)
    }

    // Bàn có laptop, ghế
    const chairM = mat(0x3a3e48)
    for (const d of l.desks) {
      box(2.2, 0.12, 1.1, woodM, d.x, 0.95, d.z)
      for (const [a, b] of [
        [-1, -0.45],
        [1, -0.45],
        [-1, 0.45],
        [1, 0.45],
      ] as const)
        box(0.08, 0.95, 0.08, woodM, d.x + a, 0.47, d.z + b)
      box(0.9, 0.04, 0.6, lapM, d.x, 1.03, d.z - 0.05)
      const screen = box(
        0.9,
        0.6,
        0.04,
        mat(0x1d6fe0, { emissive: 0x1d6fe0, emissiveIntensity: 0.15 }),
        d.x,
        1.33,
        d.z + 0.25,
      )
      screens.set(d.id, screen)
      box(0.7, 0.08, 0.7, chairM, d.seat.x, 0.38, d.seat.z)
      box(0.7, 0.6, 0.08, chairM, d.seat.x, 0.7, d.seat.z - 0.34)
    }

    // Bàn chỉ huy, bàn họp
    const cmdM = mat(0x2a2d35)
    const cmd = new T.Mesh(new T.CylinderGeometry(1.3, 1.3, 0.12, 40), cmdM)
    cmd.position.set(l.command.x, 0.95, l.command.z)
    cmd.castShadow = true
    add(cmd)
    box(0.1, 0.9, 0.1, cmdM, l.command.x, 0.45, l.command.z)
    const meet = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 0.1, 40), woodM)
    meet.position.set(l.meeting.x, 0.8, l.meeting.z)
    meet.castShadow = true
    add(meet)
    box(0.1, 0.75, 0.1, woodM, l.meeting.x, 0.4, l.meeting.z)

    // Sofa
    const sofaM = themedMat(LIGHT.sofa, DARK.sofa)
    for (const s of l.sofas) {
      box(4, 0.5, 1.1, sofaM, s.x, 0.25, s.z)
      box(4, 0.8, 0.3, sofaM, s.x, 0.8, s.z - 0.5)
    }

    // Tủ tài liệu, cây, cửa phòng
    box(1.2, 2, 0.6, mat(0x6b6f78), l.cabinet.x, 1, l.cabinet.z)
    for (const p of l.plants) {
      box(0.5, 0.6, 0.5, mat(0x7a5b44), p.x, 0.3, p.z)
      const leaf = new T.Mesh(new T.SphereGeometry(0.6, 16, 12), mat(0x3f8f5a))
      leaf.position.set(p.x, 1.1, p.z)
      leaf.castShadow = true
      add(leaf)
    }
    box(0.15, 2.6, 1.8, mat(0x8a6d52), l.door.x - 0.1, 1.3, l.door.z)

    // Đèn bàn (sáng khi tối); không quá 6 đèn để cảnh nhẹ
    for (const d of l.desks.slice(0, 6)) {
      const p = new T.PointLight(0xffc27a, 0, 5)
      p.position.set(d.x, 2.2, d.z)
      add(p)
      lamps.push(p)
    }

    layout = l
    fit()
    const half = Math.max(W, D) / 2 + 2
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half })
    sun.shadow.camera.updateProjectionMatrix()
    applyTheme(true)
  }

  // --- Bot ------------------------------------------------------------------------------------------------------
  const bots = new Map<string, BotState>()
  let input: SceneInput | null = null
  let selected: string | null = null

  const accessoryKey = (a: Actor) => `${a.mascot}|${a.accessory ?? ''}`
  /** Đeo phụ kiện của bot lên nhóm `g` (phóng theo cỡ bot `s`); trả nhóm phụ kiện, hoặc `null` khi không đeo. */
  const wear = (g: T.Group, a: Actor, s: number) => {
    const acc = buildAccessory(a.mascot, a.accessory)
    if (!acc) return null
    acc.scale.setScalar(s)
    acc.traverse((m) => {
      m.userData['key'] = a.id
    })
    g.add(acc)
    return acc
  }

  /** Bỏ phụ kiện đang đeo, giải phóng hình và vật liệu của nó. */
  const takeOff = (b: BotState) => {
    if (!b.acc) return
    b.group.remove(b.acc)
    disposeAccessory(b.acc)
    b.acc = null
  }

  const makeBot = (a: Actor, spot: Spot | undefined): BotState => {
    const s = a.commander ? 1.15 : 1
    const g = new T.Group()
    const bodyM = new T.MeshStandardMaterial({ color: new T.Color(a.color), roughness: 0.5 })
    const body = new T.Mesh(new T.CapsuleGeometry(0.42 * s, 0.45 * s, 8, 20), bodyM)
    body.position.y = 0.66 * s
    body.castShadow = true
    g.add(body)
    const eyeG = new T.SphereGeometry(0.1 * s, 12, 10)
    const pupG = new T.SphereGeometry(0.05 * s, 10, 8)
    for (const ex of [-0.15, 0.15]) {
      const e = new T.Mesh(eyeG, eyeM)
      e.position.set(ex * s, 0.85 * s, 0.36 * s)
      const p = new T.Mesh(pupG, pupM)
      p.position.set(ex * s, 0.85 * s, 0.45 * s)
      g.add(e, p)
    }
    const acc = wear(g, a, s)
    g.traverse((m) => {
      m.userData['key'] = a.id
    })
    scene.add(g)
    const st: BotState = {
      group: g,
      body: bodyM,
      x: spot?.x ?? 0,
      z: spot?.z ?? 0,
      ang: spot?.face ?? 0,
      y: 0,
      tilt: 0,
      phase: rand(a.id.length * 31 + (a.id.codePointAt(0) ?? 0)) * Math.PI * 2,
      scale: s,
      accKey: accessoryKey(a),
      acc,
    }
    return st
  }

  const dropBot = (b: BotState) => {
    scene.remove(b.group)
    takeOff(b)
    b.group.traverse((o) => {
      if (o instanceof T.Mesh && o.geometry) o.geometry.dispose()
    })
    b.body.dispose()
  }

  // --- Màu theo sáng tối của app ----------------------------------------------------------------------------
  let dark: boolean | null = null
  const bgOf = (isDark: boolean) => {
    const css = getComputedStyle(canvas).getPropertyValue('--a-bg').trim()
    if (css) {
      try {
        return new T.Color(css)
      } catch {
        /* màu lạ: dùng màu mặc định */
      }
    }
    return new T.Color(isDark ? DARK.bg : LIGHT.bg)
  }
  const applyTheme = (force = false) => {
    const isDark = canvas.closest('[data-ds-dark-theme]') !== null
    if (!force && isDark === dark) return
    dark = isDark
    scene.background = bgOf(isDark)
    for (const t of themed) t.mat.color.set(isDark ? t.dark : t.light)
    if (city) city.visible = isDark
    hemi.intensity = isDark ? 0.5 : 1
    sun.intensity = isDark ? 0.35 : 1.4
    for (const l of lamps) l.intensity = isDark ? 9 : 0
  }

  // --- Chuyển động ------------------------------------------------------------------------------------------
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = mq.matches
  const onMotion = () => {
    reduced = mq.matches
  }
  mq.addEventListener('change', onMotion)

  const v = new T.Vector3()
  let w = 1
  let h = 1
  const resize = () => {
    w = Math.max(1, stage.clientWidth)
    h = Math.max(1, stage.clientHeight)
    ren.setSize(w, h, false)
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    fit()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  resize()

  const project = (key: string, x: number, y: number, z: number) => {
    v.set(x, y, z).project(cam)
    opts.onProject(key, ((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, v.z < 1)
  }

  let raf = 0
  let last = 0
  let clock = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    clock += dt
    applyTheme()
    const cur = input
    if (cur) {
      const actors = new Map(cur.actors.map((a) => [a.id, a]))
      for (const [id, b] of bots) {
        const a = actors.get(id)
        const spot = cur.spots[id]
        if (!a || !spot) continue
        let tx = spot.x
        let tz = spot.z
        if (spot.patrol && !reduced) {
          const p = (Math.sin(clock * 0.35 + b.phase) + 1) / 2
          tx += (spot.patrol.x - spot.x) * p
          tz += (spot.patrol.z - spot.z) * p
        }
        const dx = tx - b.x
        const dz = tz - b.z
        const d = Math.hypot(dx, dz)
        const moving = !reduced && d > 0.05
        if (moving) {
          const step = Math.min(d, SPEED * dt)
          b.x += (dx / d) * step
          b.z += (dz / d) * step
        } else {
          b.x = tx
          b.z = tz
        }
        const faceTo = moving && d > 0.15 ? Math.atan2(dx, dz) : spot.face
        b.ang = reduced ? spot.face : approachAngle(b.ang, faceTo, 9 * dt)
        const seated = !moving && (spot.pose === 'type' || spot.pose === 'lean')
        const baseY = seated ? SIT_Y : 0
        b.y = reduced ? baseY : approach(b.y, baseY, 3 * dt)
        const tiltTo = seated && spot.pose === 'lean' ? spot.tilt : 0
        b.tilt = reduced ? tiltTo : approach(b.tilt, tiltTo, 1.4 * dt)
        let bob = 0
        let pulse = 1
        if (!reduced) {
          if (moving) bob = Math.abs(Math.sin(clock * 9 + b.phase)) * 0.08
          else if (spot.pose === 'type') bob = Math.abs(Math.sin(clock * 6 + b.phase)) * 0.05
          else if (spot.pose === 'hop') bob = Math.abs(Math.sin(clock * 3 + b.phase)) * 0.18
          else if (spot.pose === 'lean') pulse = 1 + Math.sin(clock * 1.5 + b.phase) * 0.02
        }
        b.group.position.set(b.x, b.y + bob, b.z)
        b.group.rotation.set(0, b.ang, b.tilt)
        b.group.scale.setScalar(pulse)
        const scr = screens.get(id)
        if (scr) {
          const m = scr.material as T.MeshStandardMaterial
          m.emissiveIntensity =
            a.scene === 'work' ? (reduced ? 0.8 : 0.5 + Math.sin(clock * 5 + b.phase) * 0.3) : 0.12
        }
      }
    }
    const sel = selected ? bots.get(selected) : undefined
    ring.visible = !!sel
    if (sel) {
      ring.position.x = sel.x
      ring.position.z = sel.z
      ring.scale.setScalar(sel.scale)
    }
    place()
    ren.render(scene, cam)
    for (const [id, b] of bots) project(id, b.x, b.group.position.y + 1.75 * b.scale, b.z)
    if (layout) {
      for (const z of layout.zones) project(`zone:${z.id}`, z.x, 0.1, z.z + z.d / 2 - 0.1)
      // Nhãn chung của sofa nằm cao hơn đầu bot ngồi, để nhãn riêng của bot rảnh (khi rê chuột) nằm dưới nó.
      layout.sofas.forEach((sofa, i) => project(`sofa:${i}`, sofa.x, 2.6, sofa.z))
    }
    opts.onProjected()
  }
  const start = () => {
    if (raf || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const onVisibility = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)

  // --- Kéo xoay, cuộn phóng to, bấm chọn --------------------------------------------------------------------
  let hovered: string | null = null
  let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }
    canvas.setPointerCapture(e.pointerId)
    canvas.style.cursor = 'grabbing'
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      setHover(botAt(e))
      return
    }
    // Đang kéo xoay thì không coi là đang rê vào bot nào.
    setHover(null)
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    yaw = drag.yaw - dx * 0.006
    pitch = Math.max(0.25, Math.min(1.25, drag.pitch + dy * 0.004))
  }
  /** Bot nằm dưới con trỏ (tia từ máy ảnh), hoặc `null` khi trỏ vào chỗ trống. */
  const botAt = (e: PointerEvent): string | null => {
    const r = canvas.getBoundingClientRect()
    const m = new T.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    )
    const rc = new T.Raycaster()
    rc.setFromCamera(m, cam)
    const hit = rc.intersectObjects(
      [...bots.values()].map((b) => b.group),
      true,
    )[0]
    const key: unknown = hit?.object.userData['key']
    return typeof key === 'string' ? key : null
  }
  const setHover = (id: string | null) => {
    if (id === hovered) return
    hovered = id
    canvas.style.cursor = drag ? 'grabbing' : id ? 'pointer' : 'grab'
    opts.onHover(id)
  }
  const onUp = (e: PointerEvent) => {
    canvas.style.cursor = 'grab'
    const was = drag
    drag = null
    if (!was || was.moved) return
    opts.onPick(botAt(e))
  }
  const onLeave = () => setHover(null)
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    zoomed = true
    dist = Math.max(distMin, Math.min(distMax, dist + e.deltaY * 0.02))
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.style.cursor = 'grab'

  const update = (next: SceneInput) => {
    if (next.layout !== layout) buildOffice(next.layout)
    input = next
    const ids = new Set(next.actors.map((a) => a.id))
    for (const [id, b] of bots) {
      if (!ids.has(id)) {
        dropBot(b)
        bots.delete(id)
        opts.onProject(id, 0, 0, false)
        if (hovered === id) setHover(null)
      }
    }
    for (const a of next.actors) {
      const have = bots.get(a.id)
      if (have) {
        have.body.color.set(a.color)
        // Đổi dáng hay phụ kiện trong hồ sơ bot thì đeo lại ngay, không đợi dựng lại cảnh.
        if (have.accKey !== accessoryKey(a)) {
          takeOff(have)
          have.acc = wear(have.group, a, have.scale)
          have.accKey = accessoryKey(a)
        }
      } else bots.set(a.id, makeBot(a, next.spots[a.id]))
    }
  }

  applyTheme(true)
  start()

  return {
    update,
    select: (id) => {
      selected = id
    },
    dispose: () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      mq.removeEventListener('change', onMotion)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      for (const b of bots.values()) dropBot(b)
      bots.clear()
      disposeTree(office)
      for (const lamp of lamps) lamp.dispose()
      for (const s of shared) s.dispose()
      sun.shadow.map?.dispose()
      scene.clear()
      ren.dispose()
    },
  }
}
