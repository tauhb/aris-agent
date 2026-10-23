import { describe, expect, it } from 'vitest'
import { rowOf } from './MascotPicker.js'

describe('chọn linh vật', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  it('một hàng giữ thứ tự; linh vật đang chọn ngoài hàng thì đứng đầu', () => {
    expect(rowOf('b', ids, 3)).toEqual(['a', 'b', 'c'])
    expect(rowOf('e', ids, 3)).toEqual(['e', 'a', 'b'])
    expect(rowOf('zz', ids, 3)).toEqual(['a', 'b', 'c'])
  })
})
