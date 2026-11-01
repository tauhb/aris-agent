/**
 * CSS riêng của khung chat aris: hàng nút / @, nhãn model, khoảng cách nhánh việc.
 * Thành phần lấy từ bộ thành phần (`KIT_CSS` của `@aris/ui-kit/react`).
 */
export const CSS = `
.aris-who,.aris .aris-who{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px 0 2px;margin:0 1px;border-radius:999px;border:1px solid color-mix(in srgb,var(--who) 40%,transparent);background:color-mix(in srgb,var(--who) 14%,transparent);font:inherit;font-size:.93em;font-weight:600;line-height:1;vertical-align:-3px;color:inherit;cursor:pointer;white-space:nowrap}
.aris-who svg{flex:none}
/* Dòng bot trong menu @ của dsh (mã dòng theo tên nguồn "aris-bots"): biểu tượng là cả tên thành viên. */
.aris-who.aris-who-menu{cursor:inherit;margin:0}
[id^="dsh-slash-option-aris-bots-"] [class*="itemIcon"]{width:auto;height:auto;flex:none}
[id^="dsh-slash-option-aris-bots-"] [class*="itemName"]{display:none}
.aris-who:hover,.aris .aris-who:hover{background:color-mix(in srgb,var(--who) 24%,transparent)}
.aris-who:focus-visible,.aris .aris-who:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.aris-who.inv,.aris .aris-who.inv{background:color-mix(in srgb,currentColor 14%,transparent);border-color:color-mix(in srgb,currentColor 32%,transparent)}
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
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-turn-head"]::after,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-room-lead"]::after{content:"";position:absolute;left:15px;top:52px;bottom:0;width:2px;border-radius:1px 1px 0 0;background:var(--aris-rail)}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-process"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="assistant-step"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="tool-call"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-error"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-max-tokens"],[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="model-retry"],[data-slot="conversation.chat.flow"]>[data-chat-group-key]{position:relative;padding-left:44px}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-process"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="assistant-step"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="tool-call"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-error"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-max-tokens"]::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="model-retry"]::before,[data-slot="conversation.chat.flow"]>[data-chat-group-key]::before{content:"";position:absolute;left:15px;top:-16px;bottom:0;width:2px;background:var(--aris-rail)}
/* Vạch bắt đầu cách đáy linh vật của đầu tin khoảng 8px, không chạm hình. */
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-turn-head"]+*::before,[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="aris-room-lead"]+*::before{top:-8px}
[data-slot="conversation.chat.flow"]>[data-chat-flow-kind="turn-tail"]::before{border-radius:0 0 2px 2px}
.aris-handoff{display:flex;flex-direction:column;gap:18px;padding-top:14px}
.aris-handoff .hand{position:relative;margin-left:44px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px;color:var(--a-ink);border:1px solid var(--a-line);background:var(--a-panel);border-radius:12px;padding:9px 12px}
.aris-handoff .hand::before{content:"";position:absolute;left:-29px;top:-28px;bottom:-4px;width:2px;background:var(--aris-rail)}
.aris-handoff .hand .why{color:var(--a-muted);font-size:13px}
.aris-handoff .turn{display:grid;grid-template-columns:32px minmax(0,1fr);column-gap:12px}
.aris-handoff .gut{display:flex;flex-direction:column;align-items:center;gap:8px}
.aris-handoff .gut .rail{flex:1;width:2px;border-radius:1px;background:color-mix(in srgb,var(--who) 55%,Canvas)}
.aris-handoff .col{min-width:0;display:flex;flex-direction:column;gap:8px}
.aris-handoff .acts{display:flex;justify-content:flex-end}
.aris-handoff .cont{height:30px;border:1px solid color-mix(in srgb,var(--who) 45%,transparent);background:color-mix(in srgb,var(--who) 10%,transparent);border-radius:999px;padding:0 12px;font:inherit;font-size:13px;font-weight:600;color:var(--a-ink);cursor:pointer}
.aris-bot-text{line-height:1.65;color:var(--a-ink);overflow-wrap:anywhere}
.aris-bot-text p{margin:0 0 10px}
.aris-bot-text p:last-child{margin-bottom:0}
.aris-bot-text ul,.aris-bot-text ol{margin:0 0 10px;padding-left:22px}
.aris-bot-text pre{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:var(--a-hover);overflow:auto;font-size:12.5px}
.aris-bot-text code{font-family:var(--a-mono,ui-monospace,monospace);font-size:12.5px;background:var(--a-hover);border-radius:5px;padding:1px 5px}
.aris-bot-text pre code{background:none;padding:0}
.aris-report{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--a-line);border-radius:14px;background:var(--a-panel)}
.aris-report .st{font-size:12.5px;color:var(--a-muted)}
.aris-report .x{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere;color:var(--a-ink);font-size:14px}
.aris-report .x code{font-family:var(--a-mono,ui-monospace,monospace);font-size:12.5px;background:var(--a-hover);border-radius:5px;padding:1px 5px}
.aris-report .x.clamp{display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden}
.aris-report .more{align-self:flex-start;border:0;background:transparent;color:var(--a-accent);font:inherit;font-size:12.5px;padding:0;cursor:pointer}
[data-chat-flow-kind="aris-bot-report"]+[data-chat-flow-kind="turn-trigger"]{display:none}
/* Lượt rỗng (không bước nào, ví dụ dsh đánh thức rồi tin bị gỡ sau chuyển giao): ẩn cả khối quá trình lẫn hàng cuối. */
[data-chat-flow-kind="turn-process"]:has(+ [data-chat-flow-kind="turn-tail"]),[data-chat-flow-kind="turn-process"]+[data-chat-flow-kind="turn-tail"]{display:none}
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
/* Bộ não trong chat (bản vẽ 5.7): nhãn trang theo lớp (wiki cam, nguồn xám, nhật ký xanh), thẻ xem nhanh, dòng công cụ, ô chọn trang. */
.aris-pg{--pg:#C2620A;display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;padding:0 6px 0 4px;margin:0 1px;font:inherit;font-size:.93em;font-weight:600;line-height:21px;vertical-align:baseline;background:color-mix(in srgb,var(--pg) 13%,transparent);color:color-mix(in srgb,var(--pg) 88%,#000);cursor:pointer;white-space:nowrap}
[data-ds-dark-theme] .aris-pg{--pg:#F5A35C;color:var(--pg)}
.aris-pg.src{--pg:#5C616C}
[data-ds-dark-theme] .aris-pg.src{--pg:#9CA3B0}
.aris-pg.jr{--pg:#1D6FE0}
[data-ds-dark-theme] .aris-pg.jr{--pg:#5AA5FF}
.aris-pg svg{flex:none}
.aris-pg:hover{background:color-mix(in srgb,var(--pg) 22%,transparent)}
.aris-pg:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.aris-pg.none{background:transparent;border:1px dashed color-mix(in srgb,currentColor 30%,transparent);color:inherit;opacity:.7;font-weight:500;cursor:default}
.aris-peek{position:fixed;z-index:1000;width:340px;box-sizing:border-box;background:var(--a-panel,Canvas);color:var(--a-ink,CanvasText);border:1px solid var(--a-line,#E4E2DC);border-radius:12px;box-shadow:0 12px 32px rgba(20,23,28,.14),0 2px 6px rgba(20,23,28,.06);padding:12px 14px;font-size:13px;line-height:1.5;display:flex;flex-direction:column;gap:6px}
.aris-peek .hd{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.aris-peek .hd b{font-size:14px}
.aris-peek .sum{color:var(--a-ink,CanvasText)}
.aris-media{border:1px solid var(--a-line,#E4E2DC);border-radius:12px;background:var(--a-panel,#fff);font-size:13px;overflow:hidden;max-width:720px}
.aris-media .h{display:flex;align-items:center;gap:8px;padding:8px 12px;flex-wrap:wrap}
.aris-media .mut{color:var(--a-muted,#5C616C);font-size:12.5px}
.aris-media .st{margin-left:auto;font-size:12px;font-weight:600;border-radius:999px;padding:1px 9px;background:var(--a-accentSoft,#E6F0FE);color:var(--a-accent,#1D6FE0)}
.aris-media .st.ok{background:var(--a-okSoft,#E2F3E9);color:var(--a-ok,#15803D)}
.aris-media .st.warn{background:var(--a-warnSoft,#FCEFDF);color:var(--a-warn,#B45309)}
.aris-media .p{padding:8px 12px;border-top:1px solid var(--a-line,#E4E2DC);font-size:12.5px;color:var(--a-muted,#5C616C)}
.aris-media .grid{display:grid;gap:10px;padding:10px 12px;border-top:1px solid var(--a-line,#E4E2DC)}
.aris-media .grid.two{grid-template-columns:1fr 1fr}
.aris-media .sk{aspect-ratio:16/9;border-radius:10px;background:linear-gradient(90deg,var(--a-panel2,#F0EFEB) 0%,var(--a-hover,#EAE9E4) 50%,var(--a-panel2,#F0EFEB) 100%);background-size:200% 100%;animation:aris-sh 1.4s linear infinite}
.aris-media .sk.tall{aspect-ratio:9/16;max-height:360px}
@keyframes aris-sh{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.aris-media .sk{animation:none}}
.aris-media-item{margin:0;display:flex;flex-direction:column;gap:6px}
.aris-media-item img,.aris-media-item video{width:100%;border-radius:10px;border:1px solid var(--a-line,#E4E2DC);display:block;background:var(--a-panel2,#F0EFEB)}
.aris-media-item figcaption{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px}
.aris-media-item a,.aris-media-item button{color:var(--a-accent,#1D6FE0);text-decoration:none;border:0;background:transparent;padding:0;font:inherit;font-size:12.5px;cursor:pointer}
.aris-media-item button:disabled{color:var(--a-muted,#5C616C);cursor:default}
.aris-media .foot{padding:0 12px 10px}
.aris-media-show{margin:6px 0 4px;border:0;background:transparent;max-width:640px}
.aris-media-show .grid{border-top:0;padding:0}
.aris-media-show .foot{padding:6px 0 0}
.aris-media .warnbox{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 12px 12px;padding:8px 10px;border-radius:9px;background:var(--a-warnSoft,#FCEFDF);font-size:12.5px}
.aris-media .warnbox span{flex:1;min-width:200px}
.aris-media .warnbox button{border:1px solid var(--a-line,#E4E2DC);border-radius:8px;background:var(--a-panel,#fff);padding:3px 10px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit}
.aris-peek .mut,.aris-bcall .mut,.aris-bpick .mut{color:var(--a-muted,#5C616C);font-size:12.5px}
.aris-peek .go{align-self:flex-start;border:0;background:none;padding:0;font:inherit;font-size:12.5px;font-weight:600;color:var(--a-accent,#1D6FE0);cursor:pointer}
.aris-peek .lay,.aris-bcall .lay,.aris-bpick .lay{--pg:#C2620A;font-size:11px;font-weight:600;border-radius:6px;padding:1px 7px;white-space:nowrap;background:color-mix(in srgb,var(--pg) 13%,transparent);color:color-mix(in srgb,var(--pg) 88%,#000)}
.aris-peek .lay.src,.aris-bcall .lay.src,.aris-bpick .lay.src{--pg:#5C616C}
.aris-peek .lay.jr,.aris-bcall .lay.jr,.aris-bpick .lay.jr{--pg:#1D6FE0}
[data-ds-dark-theme] .aris-peek .lay,[data-ds-dark-theme] .aris-bcall .lay,[data-ds-dark-theme] .aris-bpick .lay{color:var(--pg)}
.aris-bcall{border:1px solid var(--a-line);border-radius:10px;background:var(--a-panel);font-size:13px;margin:2px 0}
.aris-bcall .h{display:flex;align-items:center;gap:8px;padding:7px 10px;min-width:0}
.aris-bcall .h svg{color:#C2620A;flex:none}
.aris-bcall .r{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 33px;border-top:1px solid var(--a-line);font-size:12.5px;min-width:0}
.aris-bcall .end{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-bpick{position:relative;display:inline-flex}
.aris-bpick .pop{position:absolute;bottom:calc(100% + 10px);left:-60px;z-index:50;width:min(520px,calc(100vw - 32px));box-sizing:border-box;background:var(--a-panel);border:1px solid var(--a-line);border-radius:12px;box-shadow:0 12px 32px rgba(20,23,28,.14),0 2px 6px rgba(20,23,28,.06);padding:8px;display:flex;flex-direction:column;gap:2px}
.aris-bpick .top{display:flex;align-items:center;gap:8px;padding-bottom:4px}
.aris-bpick .top input{flex:1;min-width:0;height:32px;border:1px solid var(--a-accent);border-radius:9px;padding:0 10px;font:inherit;font-size:13.5px;background:transparent;color:var(--a-ink);outline:none}
.aris-bpick .tabs{display:flex;gap:3px;padding:3px;border-radius:10px;background:var(--a-panel2)}
.aris-bpick .tabs button{border:0;border-radius:7px;padding:3px 10px;background:transparent;font:inherit;font-size:12px;color:var(--a-muted);cursor:pointer}
.aris-bpick .tabs button.on{background:var(--a-panel);color:var(--a-ink);font-weight:600;box-shadow:0 0 0 1px var(--a-line)}
.aris-bpick .row{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;border-radius:8px;padding:7px 8px;text-align:left;font:inherit;font-size:13.5px;color:var(--a-ink);cursor:pointer;min-width:0}
.aris-bpick .row b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aris-bpick .row.sel{background:var(--a-hover)}
.aris-bpick .lock{margin-left:auto;font-size:11px;font-weight:600;border-radius:6px;padding:1px 7px;background:var(--a-warnSoft);color:var(--a-warn);white-space:nowrap}
.aris-bpick .foot{border-top:1px solid var(--a-line);padding:6px 8px 2px;font-size:12px}
[id^="dsh-slash-option-aris-brain-"] [class*="itemIcon"]{width:auto;height:auto;flex:none}
body.aris-v2 .aris-who,body.aris-v2 .aris .aris-who{height:24px;padding:0 9px 0 4px;gap:5px;border:0;font-weight:500;background:color-mix(in srgb,var(--who) 18%,transparent);color:color-mix(in srgb,var(--who) 62%,var(--g9-ink))}
body.aris-v2 .aris-who:hover,body.aris-v2 .aris .aris-who:hover{background:color-mix(in srgb,var(--who) 28%,transparent)}
`
