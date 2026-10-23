import { FONTS, THEMES } from '@aris/ui-kit'

const vars = (theme: keyof typeof THEMES) =>
  Object.entries(THEMES[theme])
    .map(([k, v]) => `--a-${k}:${v}`)
    .join(';')

/**
 * CSS của thanh bên. Màu lấy từ @aris/ui-kit; giao diện tối theo thuộc tính
 * `data-ds-dark-theme` mà theme của dsh đặt trên `<body>`.
 */
export const CSS = `
.aris-sb{${vars('light')}}
[data-ds-dark-theme] .aris-sb{${vars('dark')}}
.aris-sb{box-sizing:border-box;height:100%;display:flex;flex-direction:column;gap:1px;padding:12px 10px;background:var(--a-panel);border-right:1px solid var(--a-line);color:var(--a-ink);font-family:${FONTS.body};font-size:13.5px;line-height:1.45;overflow:hidden}
.aris-sb *{box-sizing:border-box}
.aris-sb button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;text-align:left}
.aris-sb button:focus-visible{outline:2px solid var(--a-accent);outline-offset:-2px}
.aris-sb .brand{display:flex;align-items:center;gap:8px;padding:2px 4px 10px;flex:none}
.aris-sb .brandName{font-family:${FONTS.heading};font-weight:700;font-size:18px;letter-spacing:-.02em}
.aris-sb .iconBtn{width:32px;height:32px;border-radius:10px;color:var(--a-muted);display:inline-flex;align-items:center;justify-content:center;flex:none}
.aris-sb .iconBtn:hover{background:var(--a-hover)}
.aris-sb .newTask{display:flex;align-items:center;gap:8px;border-radius:12px;padding:9px 12px;background:var(--a-ink);color:var(--a-panel);font-weight:600;margin-bottom:8px;flex:none}
.aris-sb .newTask .kbd{margin-left:auto;font-size:11px;opacity:.7;font-weight:400}
.aris-sb .nav{display:flex;flex-direction:column;gap:1px;flex:none}
.aris-sb .navRow{display:flex;align-items:center;gap:10px;border-radius:10px;padding:7px 10px;width:100%}
.aris-sb .navRow:hover{background:var(--a-hover)}
.aris-sb .navRow[aria-current=page]{background:var(--a-accentSoft);color:var(--a-accent);font-weight:600}
.aris-sb .glyph{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex:none}
.aris-sb .label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-sb .section{display:flex;align-items:center;justify-content:space-between;padding:14px 10px 4px;font-family:${FONTS.heading};font-size:13px;font-weight:600;flex:none}
.aris-sb .group{font-size:11.5px;font-weight:500;color:var(--a-muted);padding:8px 10px 2px}
.aris-sb .middle{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;margin:0 -10px 0 0;padding-right:10px;scrollbar-width:thin}
.aris-sb .team{flex:none;display:flex;flex-direction:column}
.aris-sb .bot{display:flex;align-items:center;gap:10px;border-radius:10px;padding:5px 8px;width:100%}
.aris-sb .bot:hover{background:var(--a-hover)}
.aris-sb .bot.lead{border-radius:12px;padding:8px;background:var(--a-panel2)}
.aris-sb .botText{flex:1;min-width:0;display:flex;flex-direction:column}
.aris-sb .botName{font-weight:600}
.aris-sb .lead .botName{font-family:${FONTS.heading};font-size:14px}
.aris-sb .botNote{font-size:12px;color:var(--a-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-sb .botNote.waiting{color:var(--a-warn)}
.aris-sb .sessions{flex:1 0 260px;min-height:260px;display:flex;flex-direction:column;overflow:hidden;margin:8px -10px 0 -4px;padding-left:4px}
.aris-sb.rail .middle{margin:0;padding:0;align-items:center}
.aris-sb .foot{flex:none;border-top:1px solid var(--a-line);padding-top:8px;display:flex;flex-direction:column;gap:4px}
.aris-sb .approvals{display:flex;align-items:center;gap:10px;border-radius:10px;padding:7px 10px;background:var(--a-warnSoft);color:var(--a-warn);font-weight:600}
.aris-sb .owner{display:flex;align-items:center;gap:8px;padding:6px 4px 0 10px}
.aris-sb .avatar{width:28px;height:28px;border-radius:50%;background:var(--a-ink);color:var(--a-panel);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}
.aris-sb .ownerText{flex:1;min-width:0;display:flex;flex-direction:column}
.aris-sb .ownerName{font-size:13px;font-weight:600}
.aris-sb .ownerCost{font-size:11.5px;color:var(--a-muted);font-variant-numeric:tabular-nums}
.aris-sb .seat{min-width:0}
.aris-sb.rail{padding:12px 8px;align-items:center}
.aris-sb.rail .brand{padding:2px 0 10px;flex-direction:column}
.aris-sb.rail .newTask{width:40px;height:40px;padding:0;justify-content:center}
.aris-sb.rail .navRow,.aris-sb.rail .bot{width:40px;height:40px;padding:0;justify-content:center}
.aris-sb.rail .bot.lead{padding:0}
.aris-sb.rail .foot{align-items:center;width:100%}
@media (prefers-reduced-motion:reduce){.aris-sb *{transition:none!important;animation:none!important}}
`
