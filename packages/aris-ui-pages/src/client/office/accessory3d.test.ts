import { ACCESSORIES, MASCOTS, NO_ACCESSORY, defaultAccessory } from '@aris/ui-kit'
import * as T from 'three'
import { describe, expect, it } from 'vitest'
import { ACC3D, buildAccessory, disposeAccessory } from './accessory3d.js'

const meshes = (g: T.Object3D) => {
  const out: T.Mesh[] = []
  g.traverse((o) => o instanceof T.Mesh && out.push(o))
  return out
}

describe('phụ kiện 3D', () => {
  it('có đủ builder cho cả 22 phụ kiện, không thừa', () => {
    expect(Object.keys(ACC3D).sort()).toEqual(ACCESSORIES.map((a) => a.id).sort())
  })

  it('mỗi phụ kiện dựng ra khối hữu hạn nằm quanh thân bot', () => {
    for (const a of ACCESSORIES) {
      const g = buildAccessory('aris', a.id)!
      expect(g, a.id).not.toBeNull()
      expect(meshes(g).length, a.id).toBeGreaterThan(0)
      g.updateMatrixWorld(true)
      const box = new T.Box3().setFromObject(g)
      for (const v of [...box.min.toArray(), ...box.max.toArray()])
        expect(Number.isFinite(v), a.id).toBe(true)
      // Thân capsule cao 1,3 và rộng 0,84: phụ kiện không bay ra xa.
      expect(box.min.y, a.id).toBeGreaterThan(0)
      expect(box.max.y, a.id).toBeLessThan(2)
      expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z), a.id).toBeLessThan(0.7)
    }
  })

  it('chọn theo resolveAccessory: chưa lưu là mặc định của dáng, none là không đeo', () => {
    expect(buildAccessory('aris', undefined)?.name).toBe(defaultAccessory('aris'))
    expect(buildAccessory('aris', NO_ACCESSORY)).toBeNull()
    expect(buildAccessory('aris', 'kinh')?.name).toBe('kinh')
    expect(buildAccessory('khong-co', undefined)).toBeNull()
    for (const m of MASCOTS) expect(buildAccessory(m.id, undefined), m.id).not.toBeNull()
  })

  it('màu riêng của cặp dáng × phụ kiện: mũ nồi của Hạ màu tím đậm, mặc định thì màu của hàm 2D', () => {
    const ha = meshes(buildAccessory('ha', 'mu-noi')!)[0]!.material as T.MeshStandardMaterial
    expect(ha.color.getHexString()).toBe('6d28d9')
    const other = meshes(buildAccessory('aris', 'mu-noi')!)[0]!.material as T.MeshStandardMaterial
    expect(other.color.getHexString()).toBe('7c3aed')
  })

  it('disposeAccessory giải phóng mọi hình và vật liệu', () => {
    const g = buildAccessory('aris', 'may-tinh')!
    let geo = 0
    let mat = 0
    for (const m of meshes(g)) {
      m.geometry.addEventListener('dispose', () => geo++)
      ;(m.material as T.Material).addEventListener('dispose', () => mat++)
    }
    disposeAccessory(g)
    expect(geo).toBe(meshes(g).length)
    expect(mat).toBeGreaterThanOrEqual(3)
  })
})
