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
.aris-ext-more{align-self:flex-start;border:0;background:transparent;color:var(--a-muted);font:inherit;font-size:12.5px;padding:0 0 0 24px;cursor:pointer}
.aris-ext-dock{display:flex;flex-direction:column;gap:6px;padding:6px 10px}
.aris-ext-dock .h{display:flex;align-items:center;gap:6px}
.aris-ext-ask{background:var(--a-warnSoft);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;margin:2px 0}
.aris-ext-ask .h{color:var(--a-warn);font-weight:600;font-size:13px}
.aris-ext-ask .what{font-family:'JetBrains Mono',monospace;font-size:12.5px;background:var(--a-panel);border-radius:8px;padding:6px 10px;overflow-wrap:anywhere}
.aris-ext-ask .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.aris-ext-ask .note{font-size:12px;color:var(--a-muted)}
.aris-ext-result{border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);padding:10px 12px;display:flex;flex-direction:column;gap:6px;margin-top:4px}
.aris-ext-result .h{font-size:12px;font-weight:600;color:var(--a-muted)}
.aris-ext-result .x{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
.aris-ext-result .w{font-size:12.5px;color:var(--a-muted);font-family:'JetBrains Mono',monospace;overflow-wrap:anywhere}
.aris-room{display:flex;flex-direction:column;gap:10px;padding:4px 0 8px;font-size:14px}





.aris-room-say{padding:8px 0}
.aris-room-msg{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--a-line);border-radius:14px;background:var(--a-panel)}
.aris-room-msg .b{min-width:0;flex:1}
.aris-room-msg .h{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.aris-room-msg .h b{font-size:14.5px;font-weight:650;color:var(--a-ink)}
.aris-room-msg .h span{font-size:12.5px;color:var(--a-muted)}
.aris-room-msg .x{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere;color:var(--a-ink)}
.aris-room-lead{display:flex;align-items:center;gap:10px;padding:14px 0 2px}
.aris-room-lead b{font-size:14.5px;font-weight:650;color:var(--a-ink)}
.aris-room-lead span{font-size:12.5px;color:var(--a-muted)}
.aris-room-msg .at{color:var(--a-accent);font-weight:600}
.aris-room-note{align-self:center;text-align:center;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing .dot{width:7px;height:7px;border-radius:50%;background:var(--a-accent);animation:aris-room-pulse 1.2s ease-in-out infinite}
@keyframes aris-room-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.aris-room-dock{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:6px 10px;font-size:12.5px}
.aris-room-dock .lbl{font-weight:600}
`
