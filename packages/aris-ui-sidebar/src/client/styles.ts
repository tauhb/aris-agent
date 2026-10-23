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
`
