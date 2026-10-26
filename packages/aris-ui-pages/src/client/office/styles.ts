import { FONTS } from '@aris/ui-kit'

/**
 * CSS trang Văn phòng (tiền tố `ap-of-`), theo bản vẽ `VanPhong2D`, `VanPhongPhongBan`, `VanPhongKanban`, `VanPhongNhatKy`,
 * `VanPhongChatBot`, `VanPhongChatAris`. Màu lấy từ biến `--a-*` nên tự theo sáng tối; vài màu riêng của cảnh bàn làm việc
 * khai báo ở gốc `.ap-of`. Mọi chuyển động tắt khi người dùng bật giảm chuyển động.
 */
export const OFFICE_CSS = `
.ap-of{--ap-of-stage:#EFEDE7;--ap-of-wood:#C9A27A;--ap-of-wood2:#A9825C;--ap-of-laptop:#2A2D35;--ap-of-screen:#9DC3FF;--ap-of-term:#16171B;--ap-of-termInk:#D5F5DD;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--a-bg);color:var(--a-ink)}
[data-ds-dark-theme] .ap-of{--ap-of-stage:#14161B;--ap-of-wood:#5B4632;--ap-of-wood2:#47362A;--ap-of-laptop:#3A3E48;--ap-of-screen:#5AA5FF;--ap-of-term:#0B0C0F;--ap-of-termInk:#9BE3B5}
.ap-of-mono{font-family:${FONTS.mono}}
.ap-of-head{display:flex;align-items:center;gap:12px;padding:12px 24px;border-bottom:1px solid var(--a-line);flex:none;flex-wrap:wrap}
.ap-of-title{margin:0;font-family:${FONTS.heading};font-weight:600;font-size:16px}
.ap-of-modes,.ap-of-tabs{display:inline-flex}
.ap-of-modes{border:1px solid var(--a-line);border-radius:8px;padding:2px}
.ap-of-tabs{gap:2px;margin-left:8px}
.ap-of .ap-of-seg{white-space:nowrap;border-radius:7px;padding:4px 10px;font-size:12.5px;color:var(--a-muted)}
.ap-of .ap-of-seg:hover:not([aria-disabled=true]){color:var(--a-ink)}
.ap-of .ap-of-seg.on{background:var(--a-hover);color:var(--a-ink);font-weight:600}
.ap-of-clock{margin-left:auto;font-size:12px;color:var(--a-muted);font-variant-numeric:tabular-nums}
.ap-of .ap-of-bellwrap{position:relative}
.ap-of .ap-of-bell{height:32px;padding:0 12px;border:1px solid var(--a-line);border-radius:999px;background:var(--a-panel);color:var(--a-muted);font-weight:600;font-size:13px;white-space:nowrap}
.ap-of .ap-of-bell.has{border-color:var(--a-warn);background:var(--a-warnSoft);color:var(--a-warn)}
.ap-of-need{position:absolute;right:0;top:calc(100% + 8px);width:360px;max-width:calc(100vw - 32px);z-index:6;border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);box-shadow:var(--a-shadow)}
.ap-of-need>div{padding:10px 12px;display:flex;gap:10px;align-items:center;font-size:13px}
.ap-of-need>div+div{border-top:1px solid var(--a-line)}
.ap-of-need .t{flex:1;min-width:0}
.ap-of-need .t small{display:block;color:var(--a-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-of-need .none{color:var(--a-muted)}
.ap-of-main{flex:1;min-height:0;position:relative}
.ap-of-split{display:flex;height:100%;min-height:0;position:relative}
.ap-of-body{container-type:inline-size;flex:1;min-width:0;overflow-y:auto;padding:18px 24px;display:flex;flex-direction:column;gap:14px}
.ap-of-left3d{position:relative;flex:1;min-width:0}
.ap-of-kb{height:100%;overflow-y:auto}
.ap-of-kb .a-page{min-height:0;overflow:visible}
.ap-of-hero{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}
.ap-of-aris{display:flex;align-items:flex-end;gap:14px;flex:1 1 520px;min-width:0}
.ap-of .ap-of-aris>button{border-radius:16px;padding:0;flex:none}
.ap-of .ap-of-aris>button.sel{outline:2px solid var(--a-accent);outline-offset:4px}
.ap-of-aris svg{display:block;overflow:visible}
.ap-of-say{position:relative;background:var(--a-panel);border:1px solid var(--a-line);border-radius:14px;padding:10px 14px;font-size:15px;max-width:520px;margin-bottom:34px}
.ap-of-say:after{content:"";position:absolute;left:-8px;bottom:14px;width:14px;height:14px;background:var(--a-panel);border-left:1px solid var(--a-line);border-bottom:1px solid var(--a-line);transform:rotate(45deg)}
.ap-of-bigs{display:flex;gap:10px;flex-wrap:wrap}
.ap-of-big{display:flex;flex-direction:column;align-items:flex-start;padding:10px 16px;border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);min-width:110px}
.ap-of-big b{font-family:${FONTS.heading};font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}
.ap-of-big b.warn{color:var(--a-warn)}
.ap-of-big span{font-size:12px;color:var(--a-muted)}
.ap-of-left{flex:1;min-width:0;display:flex;flex-direction:column;gap:14px}
.ap-of .ap-of-pills{display:flex;gap:8px;flex-wrap:wrap}
.ap-of .ap-of-pill{border:1px solid var(--a-line);background:var(--a-panel);border-radius:999px;padding:6px 14px;font-size:13.5px;font-weight:600;display:inline-flex;gap:6px;align-items:center}
.ap-of .ap-of-pill:hover{border-color:var(--a-muted)}
.ap-of .ap-of-pill.on{background:var(--a-ink);color:var(--a-panel);border-color:var(--a-ink)}
.ap-of .ap-of-pill small{font-weight:600;font-size:11px;border-radius:999px;padding:1px 7px;background:var(--a-accentSoft);color:var(--a-accent)}
.ap-of .ap-of-pill small.warn{background:var(--a-warnSoft);color:var(--a-warn)}
.ap-of-dept{display:flex;align-items:baseline;gap:10px;margin-top:4px}
.ap-of .ap-of-dept button,.ap-of-dept span{font-family:${FONTS.heading};font-weight:600;font-size:15px;color:var(--a-ink)}
.ap-of .ap-of-dept button:hover{text-decoration:underline}
.ap-of-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.ap-of .ap-of-desk{border:1px solid var(--a-line);border-radius:16px;background:var(--a-panel);padding:12px 12px 10px;display:flex;flex-direction:column;align-items:stretch;gap:6px;text-align:left}
.ap-of .ap-of-desk:hover{border-color:var(--a-muted)}
.ap-of .ap-of-desk.sel{outline:2px solid var(--a-accent);outline-offset:2px}
.ap-of-term{background:var(--ap-of-term);color:var(--ap-of-termInk);font-family:${FONTS.mono};font-size:12px;border-radius:8px;padding:7px 10px;height:18px;box-sizing:content-box;overflow:hidden;white-space:nowrap}
.ap-of-typ{display:inline-block;overflow:hidden;vertical-align:top;border-right:2px solid var(--ap-of-termInk);animation:ap-of-typing 3.2s steps(28) infinite,ap-of-caret .8s step-end infinite;max-width:100%}
.ap-of .ap-of-desk.idle .ap-of-typ{animation:ap-of-caret 1.2s step-end infinite;opacity:.6}
.ap-of .ap-of-desk.wait .ap-of-term{color:#FFD7A8}
.ap-of-stage{position:relative;height:150px;background:var(--ap-of-stage);border-radius:12px;overflow:hidden;display:block}
.ap-of-bot{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);display:block}
.ap-of-bot svg{display:block;overflow:visible}
.ap-of-table{position:absolute;left:50%;bottom:0;width:220px;height:70px;transform:translateX(-50%)}
.ap-of-lap,.ap-of-lapb{fill:var(--ap-of-laptop)}
.ap-of-top{fill:var(--ap-of-wood)}
.ap-of-leg{fill:var(--ap-of-wood2)}
.ap-of-scr{fill:var(--ap-of-screen);opacity:.25}
.ap-of .ap-of-desk.work .ap-of-scr{animation:ap-of-glow 1.4s ease-in-out infinite}
.ap-of .ap-of-desk.work .ap-of-bot svg{animation:ap-of-type .5s ease-in-out infinite}
.ap-of .ap-of-desk.wait .ap-of-bot svg{animation:ap-of-hop 1s ease-in-out infinite}
.ap-of .ap-of-desk.idle .ap-of-bot svg{transform-origin:50% 90%;transform:rotate(-14deg) translateY(10px);animation:ap-of-snore 3.4s ease-in-out infinite}
.ap-of-bang{position:absolute;left:calc(50% + 36px);top:8px;width:24px;height:24px;border-radius:50%;background:var(--a-warn);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;animation:ap-of-hop 1s ease-in-out infinite;z-index:2}
.ap-of-zz{position:absolute;font-weight:800;color:var(--a-muted);animation:ap-of-zz 2.6s ease-in-out infinite;z-index:2}
.ap-of-zz.z1{left:calc(50% + 34px);top:30px;font-size:14px}
.ap-of-zz.z2{left:calc(50% + 46px);top:16px;font-size:18px;animation-delay:-1.3s}
.ap-of-who{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap}
.ap-of-who b{font-family:${FONTS.heading};font-size:14.5px}
.ap-of-st{display:inline-flex;align-items:center;gap:5px;font-size:12px;margin-left:auto}
.ap-of-st i{width:8px;height:8px;border-radius:50%}
.ap-of-md{font-size:11px;width:100%}
/* Cột phải: nhật ký "Vừa làm gì" và bảng chat gọn, dùng chung cho 2D và 3D. */
.ap-of-col{flex:0 0 384px;width:384px;border-left:1px solid var(--a-line);background:var(--a-panel);display:flex;flex-direction:column;min-height:0}
.ap-of-colbtn{display:none}
.ap-of-ch{display:flex;align-items:center;gap:8px;padding:12px 16px 8px;flex:none}
.ap-of-ct{font-family:${FONTS.heading};font-size:15px;font-weight:600}
.ap-of-sm{font-size:12px}
.ap-of .ap-of-range{margin-left:auto;border:0;background:transparent;color:var(--a-muted);font:inherit;font-size:12px;cursor:pointer;padding:2px 0}
.ap-of-cb{flex:1;min-height:0;overflow-y:auto;padding:4px 12px 12px}
.ap-of-empty{padding:8px;font-size:13px}
.ap-of-np{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;background:color-mix(in srgb,var(--c) 15%,transparent);color:color-mix(in srgb,var(--c) 70%,var(--a-ink))}
.ap-of-sp{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap}
.ap-of-sp i{width:7px;height:7px;border-radius:50%;flex:none}
.ap-of-sp.ok{background:var(--a-okSoft);color:var(--a-ok)}
.ap-of-sp.warn{background:var(--a-warnSoft);color:var(--a-warn)}
.ap-of-sp.err{background:color-mix(in srgb,var(--a-danger) 14%,transparent);color:var(--a-danger)}
.ap-of-sp.run{background:var(--a-accentSoft);color:var(--a-accent)}
.ap-of-sp.run:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;animation:ap-of-glow 1.2s ease-in-out infinite}
.ap-of-sp.new{background:var(--a-accent);color:#fff}
.ap-of-sp.dim{background:var(--a-panel2);color:var(--a-muted)}
.ap-of-fr{border-radius:12px;padding:8px;margin-bottom:2px;position:relative}
.ap-of-fr:hover,.ap-of-fr.open{background:var(--a-panel2)}
.ap-of-fr.unread:after{content:"";position:absolute;right:10px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--a-accent)}
.ap-of-frh{display:flex;gap:8px;align-items:flex-start;border-radius:8px}
.ap-of-frh.click{cursor:pointer}
.ap-of-frh svg,.ap-of-br>svg,.ap-of-bm>svg,.ap-of-bh>svg{flex:none}
.ap-of-tm{font-family:${FONTS.mono};font-size:11.5px;color:var(--a-muted)}
.ap-of-frh>.ap-of-tm{padding-top:4px;width:36px;flex:none}
.ap-of-fx{flex:1;min-width:0}
.ap-of-fl{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ap-of-ft{font-size:13px;margin-top:3px;line-height:1.4;overflow-wrap:anywhere}
.ap-of-ft.bad{color:var(--a-danger)}
.ap-of-fa{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.ap-of-fa.ind{margin-left:70px}
.aris .ap-of-b1,.aris .ap-of-b2{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;border-radius:8px;font-size:12.5px;white-space:nowrap}
.aris .ap-of-b1{border:0;background:var(--a-ink);color:var(--a-panel);font-weight:600}
.aris .ap-of-b2{border:1px solid var(--a-line);background:var(--a-panel);color:var(--a-ink)}
.aris .ap-of-b2.ghost{border-color:transparent;background:transparent;color:var(--a-muted)}
.aris .ap-of-b2.stop{margin-left:auto;color:var(--a-danger);height:26px}
.ap-of .ap-of-b1:disabled,.ap-of .ap-of-b2:disabled{opacity:.5;cursor:default}
.ap-of-res{margin:8px 0 2px 70px;border-left:2px solid var(--a-ok);padding-left:10px}
.ap-of-rt{font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.ap-of-rf{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ap-of .ap-of-file{font-size:12px;border:1px solid var(--a-line);background:var(--a-panel);border-radius:8px;padding:3px 8px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-of-res .ap-of-fa{margin-left:0}
.ap-of .ap-of-back{font-size:13px;color:var(--a-muted);font-weight:600;padding:0}
.ap-of-bh{display:flex;gap:10px;align-items:center;padding:0 16px 10px;border-bottom:1px solid var(--a-line);flex:none}
.ap-of-bhx{flex:1;min-width:0}
.ap-of-pick{position:relative}
.ap-of .ap-of-sess{border:0;background:transparent;padding:0;font-size:12.5px;color:var(--a-muted);max-width:100%;text-align:left}
.ap-of-sess span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:240px;vertical-align:bottom}
.ap-of-menu{position:absolute;left:0;top:calc(100% + 4px);z-index:6;width:280px;max-width:calc(100vw - 32px);border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);box-shadow:var(--a-shadow);padding:4px;display:flex;flex-direction:column}
.ap-of-menu button{display:flex;align-items:center;gap:8px;border-radius:8px;padding:6px 8px;font-size:12.5px;text-align:left}
.ap-of-menu button:hover,.ap-of-menu button.on{background:var(--a-hover)}
.ap-of-menu .ti{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-of-msgs{display:flex;flex-direction:column;gap:10px;padding-top:12px}
.ap-of-me{align-self:flex-end;max-width:85%;background:var(--a-ink);color:var(--a-panel);border-radius:14px 14px 4px 14px;padding:8px 12px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.ap-of-me.sending{opacity:.65}
.ap-of-me small{display:block;font-size:11px;opacity:.8}
.ap-of-bm{display:flex;gap:8px;align-items:flex-start}
.ap-of-bb{background:var(--a-panel2);border-radius:14px 14px 14px 4px;padding:8px 12px;font-size:13px;line-height:1.5;max-width:88%;min-width:0;overflow-wrap:anywhere}
.ap-of-md>*:first-child{margin-top:0}
.ap-of-md>*:last-child{margin-bottom:0}
.ap-of-md p,.ap-of-md ul,.ap-of-md ol,.ap-of-md pre,.ap-of-md blockquote{margin:0 0 6px}
.ap-of-md h1,.ap-of-md h2,.ap-of-md h3{font-size:13.5px;margin:6px 0 4px}
.ap-of-md ul,.ap-of-md ol{padding-left:18px}
.ap-of-md pre{background:var(--a-panel);border-radius:8px;padding:6px 8px;font-family:${FONTS.mono};font-size:12px;overflow-x:auto;white-space:pre}
.ap-of-md code{font-family:${FONTS.mono};font-size:12px}
.ap-of-md blockquote{border-left:2px solid var(--a-line);padding-left:8px;color:var(--a-muted)}
.ap-of-md .ap-mdtable{overflow-x:auto}
.ap-of-md table{border-collapse:collapse;font-size:12px}
.ap-of-md th,.ap-of-md td{border:1px solid var(--a-line);padding:2px 6px}
.ap-of .ap-of-prog{display:flex;gap:8px;align-items:center;border:1px solid var(--a-line);background:var(--a-panel);border-radius:10px;padding:7px 10px;font-size:12.5px;margin-left:34px;text-align:left}
.ap-of-prog .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-of-prog .ar{color:var(--a-muted)}
.ap-of-dotrun{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--a-accent);animation:ap-of-glow 1.2s ease-in-out infinite;flex:none}
.ap-of-steps{margin:-4px 0 0 46px;font-size:12px;display:flex;flex-direction:column;gap:3px;border-left:1px solid var(--a-line);padding-left:10px}
.ap-of-steps.solo{margin-left:0}
.ap-of-steps .now{color:var(--a-accent)}
.ap-of-team{margin-left:34px;border:1px solid var(--a-line);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:8px}
.ap-of-tmh{display:flex;align-items:center;gap:8px;font-size:12.5px}
.ap-of-bar{flex:1;height:5px;border-radius:3px;background:var(--a-panel2);overflow:hidden}
.ap-of-bar i{display:block;height:100%;background:var(--a-ok)}
.ap-of-br{display:flex;gap:8px;align-items:flex-start;border-top:1px solid var(--a-line);padding-top:8px}
.ap-of-br .ap-of-fa{margin-top:6px}
.ap-of-cmp{border-top:1px solid var(--a-line);padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;flex:none}
.ap-of-cm{display:flex;align-items:center;gap:8px}
.ap-of-seg2{display:inline-flex;border:1px solid var(--a-line);border-radius:8px;padding:2px}
.ap-of .ap-of-seg2 button{border-radius:6px;font-size:12px;padding:3px 9px;color:var(--a-muted)}
.ap-of .ap-of-seg2 button.on{background:var(--a-hover);color:var(--a-ink);font-weight:600}
.ap-of-ci{display:flex;gap:6px;align-items:flex-end;border:1px solid var(--a-line);border-radius:12px;padding:6px 6px 6px 10px}
.ap-of-ci textarea{flex:1;min-width:0;border:0;background:transparent;color:var(--a-ink);font:inherit;font-size:13px;resize:none;outline:none}
.aris .ap-of-b1.send{width:32px;height:32px;padding:0;border-radius:9px}
.ap-of-cl{display:flex;gap:8px}
.ap-of .ap-of-link{margin-left:auto;font-size:12px;color:var(--a-muted);padding:0}
.ap-of .ap-of-link:disabled{opacity:.5;cursor:default}
.ap-of-note{font-size:12px;color:var(--a-muted)}
.ap-of-note.bad{color:var(--a-danger)}
.ap-of-dphead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ap-of-dphead h2{margin:0;font-family:${FONTS.heading};font-size:16px}
.ap-of-dphead .n{font-size:13px;color:var(--a-muted)}
.ap-of-dphead .a-btn{margin-left:auto}
.ap-of-dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.ap-of .ap-of-dc{border:1px solid var(--a-line);border-radius:16px;background:var(--a-panel);padding:14px;display:flex;flex-direction:column;gap:10px;color:var(--a-ink);text-align:left}
.ap-of .ap-of-dc:hover{border-color:var(--a-muted)}
.ap-of .ap-of-dc.new{border-style:dashed;align-items:center;justify-content:center;color:var(--a-muted);min-height:200px;background:transparent}
.ap-of .ap-of-dc .top{display:flex;align-items:center;gap:8px}
.ap-of .ap-of-dc .top b{font-family:${FONTS.heading};font-size:16px}
.ap-of .ap-of-dc .top .go{margin-left:auto;color:var(--a-muted)}
.ap-of .ap-of-dc .about{font-size:12.5px;color:var(--a-muted)}
.ap-of-crew{display:flex;align-items:flex-end;gap:2px;height:58px;background:var(--ap-of-stage);border-radius:12px;padding:6px 10px}
.ap-of-crew svg{display:block;overflow:visible}
.ap-of-bob{display:inline-flex;animation:ap-of-bob 3s ease-in-out infinite}
.ap-of-kv{display:flex;gap:14px;font-size:12.5px}
.ap-of-kv b{font-family:${FONTS.heading};font-size:16px;display:block}
.ap-of-kv .m{color:var(--a-muted)}
.ap-of-kv .model{margin-left:auto;text-align:right}
.ap-of-kv .model b{font-family:${FONTS.mono};font-size:12.5px}
.ap-of-bar{height:6px;border-radius:99px;background:var(--a-panel2);overflow:hidden}
.ap-of-bar span{display:block;height:100%;background:var(--a-accent);border-radius:99px}
.ap-of-bar.over span{background:var(--a-danger)}
.ap-of-loose{border:1px solid var(--a-line);border-radius:14px;background:var(--a-panel);padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ap-of-loose>b{font-size:13.5px}
.ap-of-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--a-line);border-radius:999px;padding:2px 10px 2px 4px;font-size:13px}
@keyframes ap-of-typing{0%{width:0}60%,100%{width:100%}}
@keyframes ap-of-caret{50%{border-color:transparent}}
@keyframes ap-of-glow{0%,100%{opacity:.35}50%{opacity:.9}}
@keyframes ap-of-type{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes ap-of-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-8px)}}
@keyframes ap-of-snore{0%,100%{transform:rotate(-14deg) translateY(10px)}50%{transform:rotate(-12deg) translateY(8px) scale(1.02)}}
@keyframes ap-of-zz{0%{opacity:0;transform:translate(0,6px)}40%{opacity:1}100%{opacity:0;transform:translate(10px,-14px)}}
@keyframes ap-of-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.ap-of-note3d{padding:6px 24px;font-size:12.5px;color:var(--a-warn);background:var(--a-warnSoft);border-bottom:1px solid var(--a-line);flex:none}
.ap-of-3d{position:absolute;inset:0;overflow:hidden;background:var(--a-bg)}
.ap-of-3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.ap-of-tags{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.ap-of-tag{position:absolute;left:0;top:0;visibility:hidden;font-size:12px;font-weight:600;background:var(--a-panel);color:var(--a-ink);border:1px solid var(--a-line);border-radius:999px;padding:2px 9px;white-space:nowrap;display:flex;align-items:center;gap:6px;box-shadow:var(--a-shadow)}
.ap-of-tag i{width:7px;height:7px;border-radius:50%;display:inline-block}
.ap-of-tag span{font-weight:800;color:var(--a-warn)}
.ap-of-tag.sofa{font-weight:500;color:var(--a-muted)}
.ap-of-tag.sofa i{background:var(--a-muted)}
.ap-of-tag.zone{font-weight:500;color:var(--a-muted);background:transparent;border-color:transparent;box-shadow:none}
.ap-of-sr{position:absolute;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;list-style:none}
.ap-of-3d-load{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;color:var(--a-muted)}
.ap-of-3d-nums{position:absolute;left:16px;top:14px;display:flex;gap:10px;pointer-events:none;flex-wrap:wrap;max-width:calc(100% - 32px)}
.ap-of-3d-nums .ap-of-big{padding:8px 14px;min-width:96px}
.ap-of-3d-nums .ap-of-big b{font-size:22px}
/* Dưới ~1100px cột phải thành ngăn trượt, mở bằng nút ở góc phải dưới. */
@media (max-width:1100px){
.ap-of-col{position:absolute;top:0;right:0;bottom:0;z-index:5;max-width:100%;box-shadow:-12px 0 30px rgba(0,0,0,.08);transform:translateX(100%);visibility:hidden;transition:transform .2s ease,visibility .2s}
.ap-of-col.open{transform:none;visibility:visible}
.ap-of .ap-of-colbtn{display:inline-flex;align-items:center;position:absolute;right:14px;bottom:14px;z-index:6;height:32px;padding:0 14px;border:1px solid var(--a-line);border-radius:999px;background:var(--a-panel);color:var(--a-ink);font-size:13px;font-weight:600;box-shadow:var(--a-shadow)}
.ap-of-col.open+.ap-of-colbtn{right:min(398px,calc(100% - 100px))}
}
@media (prefers-reduced-motion:reduce){.ap-of-col{transition:none}.ap-of *{animation:none!important}.ap-of-typ{width:auto!important;border:0!important}.ap-of-desk.idle .ap-of-bot svg{transform:rotate(-14deg) translateY(10px)}}
`
