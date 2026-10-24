/**
 * CSS riêng của khung chat aris: hàng nút / @, nhãn model, khoảng cách nhánh việc.
 * Thành phần lấy từ bộ thành phần (`KIT_CSS` của `@aris/ui-kit/react`).
 */
export const CSS = `
.aris-who{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px 0 2px;margin:0 1px;border-radius:999px;border:1px solid color-mix(in srgb,var(--who) 40%,transparent);background:color-mix(in srgb,var(--who) 14%,transparent);font:inherit;font-size:.93em;font-weight:600;line-height:1;vertical-align:-3px;color:inherit;cursor:pointer;white-space:nowrap}
.aris-who svg{flex:none}
.aris-who:hover{background:color-mix(in srgb,var(--who) 24%,transparent)}
.aris-who:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.aris-who.inv{background:color-mix(in srgb,currentColor 14%,transparent);border-color:color-mix(in srgb,currentColor 32%,transparent)}
.aris-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.aris-head .nm{font-size:14.5px;font-weight:650;color:var(--a-ink)}
.aris-head .role{font-size:11.5px;font-weight:600;border-radius:6px;padding:1px 7px;color:var(--a-ink);background:color-mix(in srgb,var(--who,#64748B) 14%,transparent)}
.aris-head .role.lead{color:var(--a-accent);background:var(--a-accentSoft)}
.aris-head .time{font-size:12.5px;color:var(--a-muted)}
.aris-head.big{gap:8px 12px;min-height:32px}
.aris-head.big .nm{font-size:15.5px;font-weight:700;color:color-mix(in srgb,var(--who) 72%,#000)}
[data-ds-dark-theme] .aris-head.big .nm{color:color-mix(in srgb,var(--who) 62%,#fff)}
.aris-turn-head,.aris-room-lead{padding:14px 0 2px}
/* Phương án B (bản vẽ 1.7b): lượt trả lời thụt vào thẳng hàng với tên, vạch màu linh vật chạy dọc từ dưới linh vật tới hết lượt. */
[data-slot="conversation.chat.flow"]{--aris-rail:color-mix(in srgb,var(--aris-who,#64748B) 55%,Canvas)}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-turn-head"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-room-lead"]{position:relative}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-turn-head"]::after,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-room-lead"]::after{content:"";position:absolute;left:14.5px;top:52px;bottom:0;width:3px;border-radius:2px 2px 0 0;background:var(--aris-rail)}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-process"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="assistant-step"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="tool-call"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-error"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-max-tokens"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="model-retry"],[data-slot="conversation.chat.flow"]>[data-chat-group-key]{position:relative;padding-left:44px}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-process"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="assistant-step"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="tool-call"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-error"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-max-tokens"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="model-retry"]::before,[data-slot="conversation.chat.flow"]>[data-chat-group-key]::before{content:"";position:absolute;left:14.5px;top:-16px;bottom:0;width:3px;background:var(--aris-rail)}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"]::before{border-radius:0 0 2px 2px}
.aris-report{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--a-line);border-radius:14px;background:var(--a-panel)}
.aris-report .st{font-size:12.5px;color:var(--a-muted)}
.aris-report .x{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere;color:var(--a-ink);font-size:14px}
.aris-report .x code{font-family:var(--a-mono,ui-monospace,monospace);font-size:12.5px;background:var(--a-hover);border-radius:5px;padding:1px 5px}
.aris-report .x.clamp{display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden}
.aris-report .more{align-self:flex-start;border:0;background:transparent;color:var(--a-accent);font:inherit;font-size:12.5px;padding:0;cursor:pointer}
[data-chat-flow-kind="aris-bot-report"]+[data-chat-flow-kind="turn-trigger"]{display:none}
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
.aris-room-note{align-self:center;text-align:center;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--a-muted)}
.aris-room-typing .dot{width:7px;height:7px;border-radius:50%;background:var(--a-accent);animation:aris-room-pulse 1.2s ease-in-out infinite}
@keyframes aris-room-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.aris-room-dock{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:6px 10px;font-size:12.5px}
.aris-room-dock .lbl{font-weight:600}
`
