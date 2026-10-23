/**
 * CSS của bộ thành phần, theo màn "Ngôn ngữ thiết kế mới" và các màn Cài đặt trên
 * canvas. Mọi thành phần nằm trong một gốc có lớp `aris`: gốc khai báo biến màu
 * `--a-*` (sáng; tối khi theme dsh đặt `data-ds-dark-theme` trên `<body>`), các
 * thành phần dùng lớp `a-*`. Gắn một lần cho cả trang bằng {@link mountKitCss}.
 * Lớp bổ nghĩa (`sm`, `lg`, `sep`, `icon`, `warn`…) đi kèm lớp `a-*`, nên CSS riêng của
 * từng gói không đặt các tên trơn này cho phần tử nằm trong gốc `aris`.
 */
import { FONTS, dshScopedVars } from '../tokens.js'

/** Thành phần chỉ có kiểu khi nằm trong gốc `aris` (chính gốc hoặc phần tử con). */
const IN_KIT = ':is(.aris,.aris *)'

/**
 * Gắn mọi quy tắc `.a-*` vào gốc `aris`: thêm {@link IN_KIT} sau phần đầu của mỗi
 * selector, vừa giới hạn phạm vi vừa đủ độ ưu tiên để CSS của dsh không đè.
 */
export function scope(css: string): string {
  return css.replace(
    /^(\.a-[^{]+)\{/gm,
    (_, selectors: string) =>
      selectors
        .split(',')
        .map((part) => part.replace(/^(\.a-[^\s>+~]+)/, `$1${IN_KIT}`))
        .join(',') + '{',
  )
}

const SHADOW = { light: '0 18px 40px rgba(20,23,28,.16)', dark: '0 18px 40px rgba(0,0,0,.5)' }

export const KIT_CSS = `
${dshScopedVars('.aris')}
.aris{--a-shadow:${SHADOW.light};font-family:${FONTS.body};color:var(--a-ink);line-height:1.45}
[data-ds-dark-theme] .aris{--a-shadow:${SHADOW.dark}}
.aris,.aris *,.aris *::before,.aris *::after{box-sizing:border-box}
.aris button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;text-align:left;margin:0;padding:0}
.aris :is(button,a,input,textarea,select,[tabindex]):focus-visible{outline:2px solid var(--a-accent);outline-offset:2px}
${scope(`
.a-num{font-variant-numeric:tabular-nums}
.a-mono{font-family:${FONTS.mono}}
.a-muted{color:var(--a-muted)}
.a-kbd{margin-left:auto;font-size:11px;opacity:.7;font-weight:400}

.a-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:10px;font-size:13px;font-weight:600;white-space:nowrap;flex:none;text-align:center}
.a-btn.sm{height:30px;padding:0 10px;border-radius:8px;font-size:12.5px}
.a-btn.lg{height:38px;padding:0 16px;font-size:13.5px}
.a-btn.block{width:100%;justify-content:flex-start}
.a-btn.primary{background:var(--a-ink);color:var(--a-panel)}
.a-btn.primary:hover{opacity:.88}
.a-btn.secondary{border:1px solid var(--a-line);background:var(--a-panel);color:var(--a-ink);font-weight:500}
.a-btn.secondary:hover{background:var(--a-hover)}
.a-btn.ghost{color:var(--a-muted);font-weight:500}
.a-btn.ghost:hover{background:var(--a-hover);color:var(--a-ink)}
.a-btn.danger{background:var(--a-danger);color:#fff}
.a-btn:disabled{opacity:.5;cursor:default}

.a-ib{width:34px;height:34px;border-radius:9px;color:var(--a-muted);display:inline-flex;align-items:center;justify-content:center;flex:none}
.a-ib.sm{width:28px;height:28px;border-radius:8px}
.a-ib:hover,.a-ib[aria-expanded=true]{background:var(--a-hover);color:var(--a-ink)}

.a-glyph{flex:none}
.a-glyph.working{animation:a-spin 1.2s linear infinite}
.a-glyph.waiting{animation:a-breathe 1.8s ease-in-out infinite}
@keyframes a-spin{to{transform:rotate(360deg)}}
@keyframes a-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.a-st{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;border-radius:999px;padding:3px 10px 3px 6px;background:var(--a-panel2);white-space:nowrap}
.a-st.sm{font-size:12px;gap:5px;padding:1px 8px 1px 4px}
.a-st.working .a-glyph{color:var(--a-accent)}
.a-st.waiting{background:var(--a-warnSoft);color:var(--a-warn)}
.a-st.done{background:var(--a-okSoft);color:var(--a-ok)}
.a-st.failed{background:var(--a-dangerSoft);color:var(--a-danger)}
.a-st.idle{color:var(--a-muted)}

.a-pill{display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;border-radius:999px;padding:0 8px;line-height:18px;white-space:nowrap}
.a-pill.accent{background:var(--a-accentSoft);color:var(--a-accent)}
.a-pill.ok{background:var(--a-okSoft);color:var(--a-ok)}
.a-pill.warn{background:var(--a-warnSoft);color:var(--a-warn)}
.a-pill.danger{background:var(--a-dangerSoft);color:var(--a-danger)}
.a-pill.muted{background:var(--a-panel2);color:var(--a-muted)}
.a-tag{display:inline-flex;align-items:center;font-size:11.5px;border-radius:6px;padding:1px 7px;background:var(--a-panel2);color:var(--a-muted);white-space:nowrap}

.a-card{background:var(--a-panel);border:1px solid var(--a-line);border-radius:12px;min-width:0}
.a-card-head{display:flex;align-items:center;gap:10px;padding:12px 14px}
.a-card-title{font-weight:600}
.a-card-sub{font-size:12px;color:var(--a-muted)}
.a-card-actions{margin-left:auto;display:flex;gap:6px;align-items:center}
.a-row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--a-line);font-size:13.5px}
.a-row>.grow{flex:1;min-width:0}

.a-sw{position:relative;display:inline-block;width:40px;height:24px;border-radius:99px;background:var(--a-line);flex:none;transition:background .15s}
.a-sw[aria-checked=true],.a-swrow[aria-checked=true] .a-sw{background:var(--a-on,var(--a-accent))}
.a-sw i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}
.a-sw[aria-checked=true] i,.a-swrow[aria-checked=true] .a-sw i{left:19px}
.a-swrow{display:flex;gap:12px;align-items:flex-start;width:100%}
.a-swrow .t{display:block;font-weight:600;font-size:14px}
.a-swrow .h{display:block;font-size:12.5px;color:var(--a-muted)}
.a-swrow>.grow{flex:1;min-width:0}
.a-swrow:disabled,.a-sw:disabled{opacity:.5;cursor:default}

.a-ck{display:inline-flex;gap:8px;align-items:center;font-size:13px;cursor:pointer}
.a-ck input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.a-ckbox{width:20px;height:20px;border-radius:6px;border:1.75px solid var(--a-line);display:inline-flex;align-items:center;justify-content:center;flex:none;color:transparent}
.a-ck input:checked+.a-ckbox{background:var(--a-on,var(--a-accent));border-color:transparent;color:#fff}
.a-ck input:focus-visible+.a-ckbox{outline:2px solid var(--a-accent);outline-offset:2px}
.a-ck input:disabled+.a-ckbox{opacity:.5}

.a-seg{display:inline-flex;border:1px solid var(--a-line);border-radius:8px;padding:2px;background:var(--a-panel)}
.a-seg button{border-radius:6px;padding:4px 10px;font-size:12.5px;color:var(--a-muted);white-space:nowrap}
.a-seg button[aria-checked=true]{background:var(--a-hover);color:var(--a-ink);font-weight:600}

.a-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.a-field>.l{font-size:12.5px;font-weight:600}
.a-field>.h{font-size:12px;color:var(--a-muted)}
.a-inp{height:36px;border:1px solid var(--a-line);border-radius:9px;background:var(--a-panel);color:var(--a-ink);font:inherit;font-size:13px;padding:0 10px;width:100%;min-width:0}
.a-inp::placeholder{color:var(--a-muted)}
.a-inp:focus-visible{outline:none;border-color:var(--a-accent);box-shadow:0 0 0 3px var(--a-accentSoft)}
.a-inp.mono{font-family:${FONTS.mono};font-size:12.5px}

.a-tabs{display:flex;gap:18px;border-bottom:1px solid var(--a-line)}
.a-tab{padding:10px 2px;font-size:13.5px;color:var(--a-muted);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.a-tab[aria-selected=true]{color:var(--a-ink);font-weight:600;border-bottom-color:var(--a-accent)}

.a-pop{position:relative;display:inline-flex}
.a-menu{position:absolute;z-index:50;top:calc(100% + 8px);left:-8px;min-width:240px;max-width:min(360px,90vw);background:var(--a-panel);border:1px solid var(--a-line);border-radius:14px;box-shadow:var(--a-shadow);padding:6px;display:flex;flex-direction:column;white-space:normal;color:var(--a-ink)}
.a-menu.end{left:auto;right:-8px}
.a-menu.inline{position:static}
.a-mi{display:flex;align-items:center;gap:8px;border-radius:9px;padding:7px 10px;width:100%;font-size:13.5px}
.a-mi:hover{background:var(--a-hover)}
.a-mi[aria-selected=true]{background:var(--a-accentSoft);color:var(--a-accent);font-weight:600}
.a-mi .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-mi .meta{font-size:12px;color:var(--a-muted);font-weight:400;white-space:nowrap}
.a-ml{font-size:12px;color:var(--a-muted);padding:8px 10px 4px}
.a-ml.sep{border-top:1px solid var(--a-line);margin-top:2px}
.a-mempty{font-size:13px;color:var(--a-muted);padding:6px 10px 8px}

.a-overlay{position:fixed;inset:0;z-index:1000;background:rgba(15,16,19,.42);display:flex;align-items:center;justify-content:center;padding:24px}
.a-overlay.inline{position:relative;inset:auto;z-index:auto;border-radius:14px;padding:16px}
.a-dialog{background:var(--a-panel);border:1px solid var(--a-line);border-radius:18px;box-shadow:var(--a-shadow);width:min(480px,100%);max-height:calc(100vh - 48px);overflow:auto;display:flex;flex-direction:column;color:var(--a-ink)}
.a-dialog:focus{outline:none}
.a-dialog-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 6px}
.a-dialog-head>.grow{flex:1;min-width:0}
.a-dialog-title{margin:0;font-family:${FONTS.heading};font-weight:600;font-size:17px;letter-spacing:-.01em}
.a-dialog-titlebar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.a-dialog-desc{font-size:13px;color:var(--a-muted);margin-top:2px}
.a-dialog-body{padding:8px 20px 14px;display:flex;flex-direction:column;gap:12px}
.a-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px}

.a-nav{display:flex;align-items:center;gap:10px;border-radius:10px;padding:7px 10px;width:100%;font-size:13.5px}
.a-nav:hover{background:var(--a-hover)}
.a-nav .g{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--a-muted)}
.a-nav[aria-current=page]{background:var(--a-accentSoft);color:var(--a-accent);font-weight:600}
.a-nav[aria-current=page] .g{color:var(--a-accent)}
.a-nav.plain[aria-current=page]{background:var(--a-hover);color:var(--a-ink)}
.a-nav .l{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-nav .meta{margin-left:auto;font-size:11.5px;color:var(--a-muted);white-space:nowrap;font-weight:400}
.a-nav.warn{background:var(--a-warnSoft);color:var(--a-warn);font-weight:600}
.a-nav.warn .g{color:inherit}
.a-nav.icon{width:40px;height:40px;padding:0;justify-content:center}
.a-bot{display:flex;align-items:center;gap:10px;border-radius:10px;padding:5px 8px;width:100%}
.a-bot:hover{background:var(--a-hover)}
.a-bot.lead{border-radius:12px;padding:8px;background:var(--a-panel2)}
.a-bot.icon{width:40px;height:40px;padding:0;justify-content:center}
.a-bot .txt{flex:1;min-width:0;display:flex;flex-direction:column}
.a-bot .nm{font-weight:600}
.a-bot.lead .nm{font-family:${FONTS.heading};font-size:14px}
.a-bot .note{font-size:12px;color:var(--a-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-bot .note.waiting{color:var(--a-warn)}
.a-sec{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 10px 4px;font-family:${FONTS.heading};font-size:13px;font-weight:600}
.a-grp{font-size:11.5px;font-weight:500;color:var(--a-muted);padding:8px 10px 2px}

.a-branch{flex:1 1 240px;min-width:0;border-left:3px solid var(--a-branch,var(--a-accent));padding:2px 0 2px 14px;display:flex;flex-direction:column;gap:8px}
.a-branch-head{display:flex;align-items:center;gap:8px;min-width:0}
.a-branch-head .nm{font-weight:700;font-size:13.5px;white-space:nowrap}
.a-branch-head .task{font-size:13px;color:var(--a-muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-branch-head .meta{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--a-muted)}
.a-step{display:flex;align-items:center;gap:8px;font-size:13px;min-width:0}
.a-step.idle{color:var(--a-muted)}
.a-progress{flex:1;max-width:90px;height:5px;border-radius:99px;background:var(--a-panel2);overflow:hidden}
.a-progress>span{display:block;height:100%;background:var(--a-branch,var(--a-accent))}
.a-approve{background:var(--a-warnSoft);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.a-approve>.a-step{color:var(--a-warn);font-weight:600}
.a-approve>.acts{display:flex;gap:6px;flex-wrap:wrap}

.a-orbit{display:block;width:100%;touch-action:none}
.a-graph{display:block;width:100%;height:100%;touch-action:none;cursor:grab}

.a-page{display:flex;flex-direction:column;min-height:100%;min-width:0;background:var(--a-bg);flex:1}
.a-page-head{display:flex;align-items:center;gap:12px;padding:12px 24px;border-bottom:1px solid var(--a-line)}
.a-page-head>.grow{display:flex;flex-direction:column;min-width:0}
.a-page-title{margin:0;font-size:14px;font-weight:600}
.a-page-sub{font-size:12px;color:var(--a-muted)}
.a-page-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.a-page-body{padding:18px 24px;display:flex;flex-direction:column;gap:16px}
.a-settings{display:flex;min-height:100%;background:var(--a-bg)}
.a-settings-nav{flex:0 1 210px;min-width:190px;border-right:1px solid var(--a-line);padding:16px 10px;display:flex;flex-direction:column;gap:2px}
.a-settings-nav>.foot{margin-top:auto;border-top:1px solid var(--a-line);padding-top:6px}
.a-settings-nav>.cap{color:var(--a-muted);padding:0 10px 8px;font-weight:600;font-size:12px}

`)}
@media (prefers-reduced-motion:reduce){.aris *{transition:none!important;animation:none!important}}
`

/**
 * Gắn {@link KIT_CSS} vào `<head>` một lần cho cả trang; nhiều plugin cùng gọi
 * thì dùng chung một thẻ, thẻ được gỡ khi plugin cuối cùng trả lại.
 * @returns hàm trả lại (gọi trong `ctx.effect`).
 */
export function mountKitCss(doc: Document = document): () => void {
  let el = doc.querySelector<HTMLStyleElement>('style[data-aris-kit]')
  if (!el) {
    el = doc.createElement('style')
    el.dataset.arisKit = ''
    el.textContent = KIT_CSS
    doc.head.appendChild(el)
  }
  const style = el
  style.dataset.users = String(Number(style.dataset.users ?? 0) + 1)
  return () => {
    const left = Number(style.dataset.users) - 1
    style.dataset.users = String(left)
    if (left <= 0) style.remove()
  }
}
