import { describe, expect, it } from 'vitest'
import { EN, VI } from './locale.js'

// `{you}`/`{You}` là cách gọi người dùng, điền lúc đăng ký chữ (registerPersonal), không phải biến.
const vars = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((v) => v !== 'you' && v !== 'You')
    .sort()

describe('chữ thanh bên', () => {
  it('tiếng Việt có đủ khoá và cùng biến {tên} với tiếng Anh', () => {
    expect(Object.keys(VI).sort()).toEqual(Object.keys(EN).sort())
    for (const [key, text] of Object.entries(EN))
      expect(vars(VI[key as keyof typeof EN]), key).toEqual(vars(text))
  })
})
