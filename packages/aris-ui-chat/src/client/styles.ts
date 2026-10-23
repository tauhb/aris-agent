/**
 * CSS riêng của khung chat aris: hàng nút / @, nhãn model, khoảng cách nhánh việc.
 * Thành phần lấy từ bộ thành phần (`KIT_CSS` của `@aris/ui-kit/react`).
 */
export const CSS = `
.aris-triggers{display:inline-flex;align-items:center;gap:2px}
.aris-triggers .a-ib{font-size:15px;font-weight:500}
.aris-model{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.aris-model .logo{width:20px;height:20px;border-radius:6px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex:none}
.aris-taskline{padding:4px 0 6px;font-size:13.5px}
.aris-room{display:flex;flex-direction:column;gap:10px;padding:4px 0 8px;font-size:14px}
.aris-room-msg{display:flex;gap:10px;align-items:flex-start}
.aris-room-msg .b{min-width:0;flex:1}
.aris-room-msg .h{font-size:12.5px;color:var(--a-muted);margin-bottom:2px}
.aris-room-msg .h b{color:var(--a-ink);font-weight:600}
.aris-room-msg .x{white-space:pre-wrap;line-height:1.55;overflow-wrap:anywhere}
.aris-room-msg .at{color:var(--a-accent);font-weight:600}
.aris-room-note{align-self:center;text-align:center;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing .dot{width:7px;height:7px;border-radius:50%;background:var(--a-accent);animation:aris-room-pulse 1.2s ease-in-out infinite}
@keyframes aris-room-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.aris-room-dock{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:6px 10px;font-size:12.5px}
.aris-room-dock .lbl{font-weight:600}
`
