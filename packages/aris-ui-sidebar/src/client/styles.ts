import { FONTS } from '@aris/ui-kit'

/**
 * CSS riêng của thanh bên: chỉ bố cục cột (thương hiệu, vùng cuộn, chân) và dòng
 * chủ nhân. Nút, dòng điều hướng, dòng bot, đầu mục lấy từ bộ thành phần
 * (`KIT_CSS` của `@aris/ui-kit/react`).
 */
export const CSS = `
.aris-sb{height:100%;display:flex;flex-direction:column;gap:1px;padding:12px 10px;background:var(--a-panel);border-right:1px solid var(--a-line);font-size:13.5px;overflow:hidden}
.aris-sb .brand{display:flex;align-items:center;gap:8px;padding:2px 4px 10px;flex:none}
.aris-sb .brandName{font-family:${FONTS.heading};font-weight:700;font-size:18px;letter-spacing:-.02em}
.aris-sb .a-btn.newTask{margin-bottom:8px;border-radius:12px}
.aris-sb .nav{display:flex;flex-direction:column;gap:1px;flex:none}
.aris-sb .middle{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;margin:0 -10px 0 0;padding-right:10px;scrollbar-width:thin}
.aris-sb .team,.aris-sb .projects{flex:none;display:flex;flex-direction:column}
.aris-sb .projects .a-nav .g{width:18px;height:18px}
.aris-sb .foot{flex:none;border-top:1px solid var(--a-line);padding-top:8px;display:flex;flex-direction:column;gap:4px}
.aris-sb .owner{display:flex;align-items:center;gap:8px;padding:6px 4px 0 10px}
.aris-sb .avatar{width:28px;height:28px;border-radius:50%;background:var(--a-ink);color:var(--a-panel);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}
.aris-sb .ownerText{flex:1;min-width:0;display:flex;flex-direction:column}
.aris-sb .ownerName{font-size:13px;font-weight:600}
.aris-sb .ownerCost{font-size:11.5px;color:var(--a-muted)}
.aris-sb .seat{min-width:0}
.aris-sb.rail{padding:12px 8px;align-items:center}
.aris-sb.rail .brand{padding:2px 0 10px;flex-direction:column}
.aris-sb.rail .a-btn.newTask{width:40px;height:40px;padding:0;justify-content:center}
.aris-sb.rail .middle{margin:0;padding:0;align-items:center}
.aris-sb.rail .foot{align-items:center;width:100%}
.aris-lead{display:flex;flex-direction:row;gap:8px}
.aris-sb .nav .as-working{font-size:11px;font-weight:600;color:var(--a-accent)}
.aris-sb .nav .as-count{font-size:11px;font-weight:600;color:var(--a-warn);background:var(--a-warnSoft);border-radius:999px;padding:0 7px;line-height:18px}
.aris-sb .as-att{position:relative;display:flex;align-items:center;gap:10px;border-radius:10px;padding:5px 8px;width:100%}
.aris-sb .as-att:hover,.aris-sb .as-att:has(.as-att-hit[aria-current=page]){background:var(--a-hover)}
.aris-sb .as-att-hit{position:absolute;inset:0;border-radius:10px}
.aris-sb .as-att>:not(.as-att-hit){position:relative;pointer-events:none}
.aris-sb .as-att .as-dept{pointer-events:auto}
.aris-sb .as-mv{display:inline-flex;border-radius:10px;flex:none}
.aris-sb .as-att.waiting .as-mv{animation:as-ping 1.6s ease-out infinite}
.aris-sb .as-att .txt{flex:1;min-width:0;display:flex;flex-direction:column}
.aris-sb .as-att .nm{font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-sb .as-dept{font-size:11.5px;font-weight:400;color:var(--a-muted);border-radius:4px;padding:0 2px;margin-left:2px}
.aris-sb .as-dept:hover{color:var(--a-ink);text-decoration:underline}
.aris-sb .as-att .note{font-size:12px;color:var(--a-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-sb .as-att.waiting .note{color:var(--a-warn)}
.aris-sb .as-rest{padding:4px 6px 2px}
.aris-sb .as-rest-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px;font-size:11.5px;color:var(--a-muted)}
.aris-sb .as-all{font-size:11.5px;color:var(--a-accent);border-radius:4px}
.aris-sb .as-all:hover{text-decoration:underline}
.aris-sb .as-rest-row{display:flex;flex-wrap:wrap;gap:2px}
.aris-sb .as-m{position:relative;display:inline-flex;border-radius:10px;padding:3px}
.aris-sb .as-m:hover{background:var(--a-hover)}
.aris-sb .as-dot{position:absolute;right:1px;bottom:1px;width:8px;height:8px;border-radius:50%;border:2px solid var(--a-panel);background:var(--a-muted)}
.aris-sb .as-dot.done{background:var(--a-ok)}
.aris-sb .as-dot.failed{background:var(--a-danger)}
@keyframes as-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--a-warn) 45%,transparent)}100%{box-shadow:0 0 0 7px transparent}}
@media (prefers-reduced-motion:reduce){.aris-sb .as-att.waiting .as-mv{animation:none}}
.aris-sb .pick{display:flex;flex-direction:column;gap:8px;align-items:flex-start;margin:6px 10px 4px;padding:10px 12px;border:1px dashed var(--a-line);border-radius:10px;font-size:12.5px;color:var(--a-muted)}
.aris .tpl{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--a-line);border-radius:10px;font-size:13px}
.aris .tpl .a-muted{font-size:12.5px;margin-top:2px}
`
