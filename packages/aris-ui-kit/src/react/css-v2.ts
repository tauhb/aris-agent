/**
 * CSS các thành phần của giao diện mới GĐ9 (lớp `g9-*`), chép kích thước từ `design/gd9/gd9.css`: thanh bên
 * danh bạ, menu, viên tên bot ở đầu chat, hồ sơ bot ở khung phải, bảng Hoạt động. Biến `--g9-*` do
 * `@aris/ui-theme` đặt trên `body.aris-v2`, nên các lớp này chỉ có màu khi bật giao diện mới.
 */
const B = 'body.aris-v2'
const DARK = 'body.aris-v2[data-ds-dark-theme]'

export const G9_CSS = `
${B} .g9-sb{height:100%;width:100%;display:flex;flex-direction:column;padding:10px 12px 12px;background:var(--g9-win);color:var(--g9-ink);font-size:14.5px;line-height:1.45;overflow:hidden}
${B} .g9-top{display:flex;align-items:center;gap:2px;height:36px;flex:none}
${B} .g9-top .sp{flex:1}
${B} .g9-ib{width:32px;height:32px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:var(--g9-ink2);position:relative;flex:none}
${B} .g9-ib:hover,${B} .g9-ib[aria-expanded=true]{background:var(--g9-pill);color:var(--g9-ink)}
${B} .g9-n{position:absolute;top:1px;right:-1px;min-width:15px;height:15px;border-radius:8px;background:var(--g9-ink);color:var(--g9-inv);font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;padding:0 3px;line-height:1}
${B} .g9-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin:6px -12px 0;padding:0 12px 8px;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px}
${B} .g9-row{width:100%;min-height:60px;border-radius:14px;display:flex;align-items:center;gap:12px;padding:8px 10px;text-align:left;color:var(--g9-ink);flex:none}
${B} .g9-row:hover{background:color-mix(in srgb,var(--g9-card) 65%,transparent)}
${B} .g9-row[aria-current=true]{background:var(--g9-card)}
${B} .g9-row .tb{display:flex;flex-direction:column;min-width:0;flex:1}
${B} .g9-row .nm{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${B} .g9-row .l{font-size:13px;color:var(--g9-ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${B} .g9-row .l.need{color:var(--g9-warn)}
${B} .g9-row .l.run{color:var(--g9-acc2)}
${B} .g9-row .l.err{color:var(--g9-err)}
${B} .g9-dot{margin-left:auto;flex:none;width:8px;height:8px;border-radius:50%}
${B} .g9-dot.need{background:var(--g9-warn)}
${B} .g9-dot.run{background:var(--g9-acc)}
${B} .g9-dot.err{background:var(--g9-err)}
${B} .g9-grp{display:flex;align-items:center;gap:6px;width:100%;padding:14px 10px 4px;font-size:12.5px;color:var(--g9-ink3);flex:none}
${B} .g9-grp:hover{color:var(--g9-ink2)}
${B} .g9-grp svg{transition:transform .15s}
${B} .g9-grp[aria-expanded=false] svg{transform:rotate(-90deg)}
${B} .g9-foot{flex:none;display:flex;align-items:center;gap:8px;padding-top:8px}
${B} .g9-av{width:36px;height:36px;border-radius:50%;background:var(--g9-card);color:var(--g9-ink2);font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;flex:none}
${B} .g9-av:hover,${B} .g9-av[aria-expanded=true]{background:var(--g9-pill);color:var(--g9-ink)}
${B} .g9-apps{flex:1;min-width:0;height:36px;border-radius:999px;background:var(--g9-card);display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;white-space:nowrap;overflow:hidden;padding:0 6px 0 12px;color:var(--g9-ink)}
${B} .g9-apps:hover{background:var(--g9-pill)}
${B} .g9-apps>span:first-child{overflow:hidden;text-overflow:ellipsis}
${B} .g9-lgs{display:flex;padding-left:4px;flex:none}
${B} .g9-lg{width:18px;height:18px;border-radius:5px;background:var(--g9-ink);color:var(--g9-inv);font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-left:-4px;box-shadow:0 0 0 2px var(--g9-card)}
${B} .g9-pop{position:relative;display:inline-flex}
${B} .g9-menu{position:absolute;z-index:60;min-width:230px;background:var(--g9-card2);border-radius:12px;box-shadow:0 0 0 1px var(--g9-line),0 16px 32px #00000040;padding:5px;display:flex;flex-direction:column;color:var(--g9-ink)}
${DARK} .g9-menu{background:#1c1c1c}
${B} .g9-menu.up{bottom:44px;left:0}
${B} .g9-menu.down{top:36px;right:0}
${B} .g9-mi{display:flex;align-items:center;gap:10px;min-height:32px;padding:0 10px;border-radius:8px;font-size:13.5px;white-space:nowrap;color:var(--g9-ink);width:100%;text-align:left}
${B} .g9-mi:hover,${B} .g9-mi:focus-visible{background:var(--g9-pill)}
${B} .g9-mi .v{margin-left:auto;color:var(--g9-ink3);font-size:12.5px}
${B} .g9-mh{padding:8px 10px 6px;display:flex;flex-direction:column;gap:1px}
${B} .g9-mh b{font-weight:600;font-size:14px}
${B} .g9-mh span{font-size:12.5px;color:var(--g9-ink3)}
${B} .g9-sep{height:1px;background:var(--g9-line);margin:4px 6px;flex:none}
${B} .g9-whoAt{position:absolute;left:50%;top:26px;transform:translate(-50%,-50%);z-index:1}
${B} .g9-who{height:36px;display:inline-flex;align-items:center;gap:8px;padding:0 14px 0 8px;border-radius:999px;background:var(--g9-pill);font-size:14.5px;font-weight:500;white-space:nowrap;color:var(--g9-ink);max-width:40vw}
${B} .g9-who:hover{background:var(--g9-pill2)}
${B} .g9-who>span{overflow:hidden;text-overflow:ellipsis}
${B} .g9-hr{display:inline-flex;align-items:center;gap:6px}
${B} .g9-mp{height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:999px;background:var(--g9-pill);font-size:13px;color:var(--g9-ink2);white-space:nowrap;max-width:220px}
${B} .g9-mp>span{overflow:hidden;text-overflow:ellipsis}
${B} .g9-mp:hover{color:var(--g9-ink)}
${B} .g9-drawer{position:fixed;top:8px;bottom:8px;left:var(--g9-drawer-left,288px);width:380px;max-width:calc(100vw - 16px);background:var(--g9-pane);border-radius:14px;box-shadow:0 0 0 1px var(--g9-line),0 24px 48px #0000004d;display:flex;flex-direction:column;padding:12px;gap:8px;z-index:1000;color:var(--g9-ink);font-size:14.5px;line-height:1.45}
${B} .g9-dh{display:flex;align-items:center;justify-content:space-between;height:36px;font-size:15px;font-weight:600;padding-left:4px;flex:none}
${B} .g9-seg{display:flex;background:var(--g9-pill);border-radius:999px;padding:3px;flex:none}
${B} .g9-seg button{flex:1;min-width:0;height:30px;border-radius:999px;font-size:13px;color:var(--g9-ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px;text-align:center}
${B} .g9-seg button[aria-pressed=true]{background:var(--g9-pill2);color:var(--g9-ink)}
${B}:not([data-ds-dark-theme]) .g9-seg button[aria-pressed=true]{background:#fff;box-shadow:0 1px 2px #0000001a}
${B} .g9-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin}
${B} .g9-it{display:flex;gap:12px;align-items:center;padding:10px;border-radius:12px;width:100%;text-align:left;color:var(--g9-ink);flex:none}
${B} .g9-it:hover{background:var(--g9-card)}
${B} .g9-it .b{flex:1;min-width:0;display:flex;flex-direction:column}
${B} .g9-it .ti{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${B} .g9-it .l{font-size:13px;color:var(--g9-ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${B} .g9-it .t{font-size:12px;color:var(--g9-ink3);flex:none;white-space:nowrap}
${B} .g9-it .t.err{color:var(--g9-err)}
${B} .g9-lab{font-size:12.5px;color:var(--g9-ink3);padding:10px 4px 2px}
${B} .g9-empty{margin:0;padding:16px 10px;color:var(--g9-ink3);font-size:13.5px}
${B} .g9-rp{display:flex;flex-direction:column;gap:12px;padding:12px 16px 16px;height:100%;overflow-y:auto;color:var(--g9-ink);font-size:14.5px;line-height:1.45;background:var(--g9-pane);scrollbar-width:thin}
${B} .g9-rtop{display:flex;align-items:center;gap:4px;min-height:32px}
${B} .g9-rtop .sp{flex:1}
${B} .g9-back{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px 0 6px;border-radius:999px;color:var(--g9-ink2);font-size:13.5px;white-space:nowrap}
${B} .g9-back:hover{background:var(--g9-pill);color:var(--g9-ink)}
${B} .g9-prof{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
${B} .g9-prof b{font-size:17px;font-weight:600}
${B} .g9-prof span{font-size:13px;color:var(--g9-ink3)}
${B} .g9-tabs{display:flex;justify-content:center;gap:4px}
${B} .g9-tab{height:30px;padding:0 12px;border-radius:999px;font-size:13.5px;color:var(--g9-ink2);white-space:nowrap}
${B} .g9-tab[aria-pressed=true]{background:var(--g9-pill);color:var(--g9-ink)}
${B} .g9-box{background:var(--g9-card);border-radius:14px;overflow:hidden;flex:none}
${B} .g9-li{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 14px;font-size:14px;box-shadow:inset 0 1px 0 var(--g9-line);width:100%;text-align:left;color:var(--g9-ink)}
${B} .g9-li:first-child{box-shadow:none}
${B} button.g9-li:hover{background:color-mix(in srgb,var(--g9-pill) 70%,transparent)}
${B} .g9-li .k{white-space:nowrap}
${B} .g9-li .v{margin-left:auto;color:var(--g9-ink3);font-size:13px;max-width:58%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
${B} .g9-li .chev{color:var(--g9-ink3);flex:none}
${B} .g9-sub{font-size:12.5px;color:var(--g9-ink3);padding:4px 2px 0}
${B} .g9-shot{border-radius:12px;overflow:hidden;background:var(--g9-card);display:block;width:100%}
${B} .g9-shot img{display:block;width:100%}
${B} .g9-shot .none{padding:28px 14px;text-align:center;font-size:13px;color:var(--g9-ink3)}
${B} .g9-bt{height:36px;padding:0 16px;border-radius:999px;background:var(--g9-pill);display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:14px;white-space:nowrap;color:var(--g9-ink)}
${B} .g9-bt.p{background:var(--g9-ink);color:var(--g9-inv);font-weight:500}
${B} .g9-note{font-size:13px;color:var(--g9-ink3);padding:0 2px}
`
