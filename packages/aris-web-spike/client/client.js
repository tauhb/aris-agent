// Viết tay theo đúng định dạng gói client mà dsh build ra (window.__ModuleLoader__),
// để thử nghiệm không cần chuỗi build tsdown. Giai đoạn 1 sẽ thay bằng mã React
// biên dịch từ TypeScript.
window.__ModuleLoader__.load({
  id: '@aris/web-spike',
  factory: (require) => {
    const module = { exports: {} }
    const { jsx, jsxs } = require('react/jsx-runtime')
    const React = require('react')
    const PANEL_ID = 'aris-map'
    const BOTS = [
      { name: 'Lâm', color: '#00B5A5' },
      { name: 'Mai', color: '#FF6700' },
      { name: 'Tín', color: '#FFAA00' },
      { name: 'Hạ', color: '#FF309C' },
      { name: 'Dev', color: '#00C972' },
    ]

    function Icon({ size }) {
      return jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 100 100',
        'aria-hidden': true,
        children: jsx('path', {
          d: 'M50 6C57 6 62 24 72 32C82 40 94 42 94 50C94 58 82 60 72 68C62 76 57 94 50 94C43 94 38 76 28 68C18 60 6 58 6 50C6 42 18 40 28 32C38 24 43 6 50 6Z',
          fill: 'currentColor',
        }),
      })
    }

    // Quỹ đạo 3D tối giản: Aris ở giữa, 5 bot quay quanh trên mặt phẳng nghiêng.
    function MapPage() {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const cv = ref.current
        const g = cv.getContext('2d')
        let raf = 0
        const draw = (t) => {
          const dpr = window.devicePixelRatio || 1
          const w = cv.clientWidth
          const h = cv.clientHeight
          if (cv.width !== w * dpr) {
            cv.width = w * dpr
            cv.height = h * dpr
          }
          g.setTransform(dpr, 0, 0, dpr, 0, 0)
          g.clearRect(0, 0, w, h)
          const cx = w / 2
          const cy = h / 2
          const R = Math.min(w, h) * 0.36
          g.strokeStyle = 'rgba(128,128,128,.35)'
          g.beginPath()
          g.ellipse(cx, cy, R, R * 0.36, 0, 0, Math.PI * 2)
          g.stroke()
          const pts = BOTS.map((b, i) => {
            const a = t / 4000 + (i / BOTS.length) * Math.PI * 2
            return { ...b, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.36, z: Math.sin(a) }
          }).sort((p, q) => p.z - q.z)
          const node = (x, y, r, color, label) => {
            g.fillStyle = color
            g.beginPath()
            g.arc(x, y, r, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = '#fff'
            g.beginPath()
            g.arc(x - r * 0.22, y - r * 0.05, r * 0.16, 0, Math.PI * 2)
            g.arc(x + r * 0.22, y - r * 0.08, r * 0.12, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = getComputedStyle(cv).color
            g.font = '12px system-ui'
            g.textAlign = 'center'
            g.fillText(label, x, y + r + 14)
          }
          pts.filter((p) => p.z < 0).forEach((p) => node(p.x, p.y, 14 + p.z * 4, p.color, p.name))
          node(cx, cy, 26, '#1084FE', 'Aris')
          pts.filter((p) => p.z >= 0).forEach((p) => node(p.x, p.y, 14 + p.z * 4, p.color, p.name))
          raf = requestAnimationFrame(draw)
        }
        raf = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(raf)
      }, [])
      return jsxs('div', {
        style: {
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          boxSizing: 'border-box',
        },
        children: [
          jsx('h2', { style: { margin: 0, fontSize: 18 }, children: 'Bản đồ đội (thử nghiệm)' }),
          jsx('canvas', { ref, 'data-aris-spike': 'map', style: { width: '100%', flex: 1, minHeight: 320 } }),
        ],
      })
    }

    module.exports.name = 'aris-web-spike'
    module.exports.inject = ['slots']
    module.exports.apply = function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, MapPage))
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: 'Bản đồ đội' }, Icon),
      )
    }
    return module.exports
  },
})
