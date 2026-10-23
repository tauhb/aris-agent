// Trích mọi từ điển tiếng Anh mà các gói client của dsh đăng ký (`ctx.locale.register`)
// bằng cách nạp từng gói trong Node với một `ctx` giả. Kết quả là nguồn để dịch
// sang tiếng Việt và để phát hiện chuỗi mới/đổi khi nâng phiên bản dsh.
// Dùng: node scripts/ui/extract-strings.mjs <tệp-ra.json>
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { repoRoot } from '../paths.mjs'

const store = join(repoRoot, 'node_modules/.pnpm/node_modules/@deepseek-ai')

/** Một vật thể "nuốt mọi thứ": gọi, đọc thuộc tính, new đều trả về chính nó. */
function sink() {
  const fn = function () {}
  const p = new Proxy(fn, {
    get: (_t, key) => {
      if (key === Symbol.toPrimitive) return () => ''
      if (key === Symbol.iterator) return function* () {}
      if (key === 'then') return undefined
      return p
    },
    apply: () => p,
    construct: () => p,
    set: () => true,
    has: () => true,
  })
  return p
}

/** React giả: đủ các hàm mà gói client gọi khi nạp mô-đun. */
function fakeReact() {
  const names = [
    'memo',
    'forwardRef',
    'createContext',
    'lazy',
    'useState',
    'useEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useContext',
    'useSyncExternalStore',
    'useLayoutEffect',
    'useId',
    'useReducer',
    'createElement',
    'Fragment',
    'Children',
    'cloneElement',
    'isValidElement',
    'Component',
    'PureComponent',
    'startTransition',
    'useTransition',
    'useDeferredValue',
    'jsx',
    'jsxs',
  ]
  const react = {}
  for (const n of names) react[n] = n === 'memo' || n === 'forwardRef' ? (x) => x : sink()
  return react
}

// Bỏ qua lỗi bất đồng bộ của gói chạy với ctx giả; chỉ cần lần gọi register đồng bộ.
process.on('uncaughtException', () => {})
process.on('unhandledRejection', () => {})

const out = {}
const errors = []
const factories = {}
const window = { __ModuleLoader__: { load: ({ id, factory }) => (factories[id] = factory) } }
const fakeDocument = sink()

for (const dir of readdirSync(store)) {
  const file = join(store, dir, 'lib/client.js')
  if (!existsSync(file)) continue
  const src = readFileSync(file, 'utf8')
  if (!src.includes('locale.register(')) continue
  try {
    vm.runInNewContext(
      src,
      {
        window,
        document: fakeDocument,
        navigator: { languages: ['en'], language: 'en', platform: 'MacIntel', userAgent: 'node' },
        AbortController,
        getComputedStyle: () => sink(),
        MutationObserver: class {
          observe() {}
          disconnect() {}
        },
        ResizeObserver: class {
          observe() {}
          disconnect() {}
        },
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame() {},
        crypto: globalThis.crypto,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask,
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        location: { href: 'http://localhost/', origin: 'http://localhost' },
        console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      },
      { filename: file },
    )
  } catch (err) {
    errors.push(`${dir}: nạp lỗi ${err.message}`)
  }
}

for (const [id, factory] of Object.entries(factories)) {
  let mod
  try {
    mod = factory((name) => (name === 'react' || name === 'react/jsx-runtime' ? fakeReact() : sink()))
  } catch (err) {
    errors.push(`${id}: factory lỗi ${err.message}`)
    continue
  }
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'locale') {
          return new Proxy(
            {},
            {
              get: (_l, k) => {
                if (k === 'register')
                  return (ns, a, b) => {
                    const dicts = typeof a === 'string' ? { [a]: b } : a
                    if (dicts?.en) out[ns] = { package: id, en: dicts.en }
                    return () => {}
                  }
                return sink()
              },
            },
          )
        }
        if (key === 'effect') return (fn) => fn()
        return sink()
      },
    },
  )
  try {
    mod.apply?.(ctx, sink())
  } catch (err) {
    errors.push(`${id}: apply dừng ở ${err.message.slice(0, 60)}`)
  }
}

// Gói locale tự đăng ký hai namespace của nó trong runtime, không qua ctx.locale:
// đọc thẳng hai từ điển tiếng Anh (chỉ gồm chuỗi) từ mã của gói.
{
  const src = readFileSync(join(store, 'dsh-client-locale/lib/client.js'), 'utf8')
  const literal = (name) => {
    const start = src.indexOf(`const ${name} = {`)
    if (start < 0) return undefined
    const open = src.indexOf('{', start)
    const close = src.indexOf('\n\t\t};', open)
    return new Function(`return ${src.slice(open, close + 4)}`)()
  }
  const common = literal('en$1')
  const settings = literal('en')
  if (common) out.common = { package: '@deepseek-ai/dsh-client-locale', en: common }
  if (settings) out['settings.locale'] = { package: '@deepseek-ai/dsh-client-locale', en: settings }
}

// Lượt quét tĩnh bù cho gói có `apply` dừng giữa chừng với `ctx` giả: tìm mọi
// `locale.register(ns, { zh, en })` trong mã rồi đọc thẳng object tiếng Anh.
// Chỉ bù namespace còn thiếu; kết quả chạy thật vẫn được ưu tiên.
function constValue(src, name) {
  const at = src.search(new RegExp(`\\bconst ${name.replace('$', '\\$')} = `))
  if (at < 0) return undefined
  const start = src.indexOf('=', at) + 1
  const first = src.slice(start).trimStart()[0]
  if (first === '"') return JSON.parse(src.slice(start).match(/^\s*("(?:[^"\\]|\\.)*")/)[1])
  if (first !== '{') return undefined
  const open = src.indexOf('{', start)
  let depth = 0
  let quote = ''
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try {
        return new Function(`return ${src.slice(open, i + 1)}`)()
      } catch {
        return undefined
      }
    }
  }
  return undefined
}
for (const dir of readdirSync(store)) {
  const file = join(store, dir, 'lib/client.js')
  // Gói thử nghiệm không nằm trong profile `aris`.
  if (dir.startsWith('dsh-experimental-') || !existsSync(file)) continue
  const src = readFileSync(file, 'utf8')
  const call =
    /locale\.register\(\s*([\w$]+|"[^"]+")\s*,\s*\{\s*zh(?:\s*:\s*[\w$]+)?\s*,\s*en(?:\s*:\s*([\w$]+))?\s*\}/g
  for (const m of src.matchAll(call)) {
    const ns = m[1].startsWith('"') ? JSON.parse(m[1]) : constValue(src, m[1])
    if (typeof ns !== 'string' || out[ns]) continue
    const dict = constValue(src, m[2] ?? 'en')
    if (!dict || typeof dict !== 'object') continue
    const en = Object.fromEntries(Object.entries(dict).filter(([, v]) => typeof v === 'string'))
    if (Object.keys(en).length) out[ns] = { package: `@deepseek-ai/${dir}`, en }
  }
}

const target = process.argv[2]
const flat = Object.values(out).reduce((n, v) => n + Object.keys(v.en).length, 0)
writeFileSync(target, JSON.stringify(out, null, 1) + '\n')
console.log(`${Object.keys(out).length} namespace, ${flat} chuỗi → ${target}`)
if (errors.length)
  console.log(
    `(${errors.length} gói không nạp trọn: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ' …' : ''})`,
  )
