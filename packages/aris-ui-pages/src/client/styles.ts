/**
 * CSS dùng chung của các trang aris (tiền tố `ap-`): ô số liệu, cột co giãn, dòng
 * danh sách, thanh tỉ lệ, ô chọn dạng viên. Thành phần cơ bản lấy từ bộ thành phần.
 */
export const CSS = `
.ap-root{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--a-bg);font-size:14px;overflow:hidden}
.ap-root>.a-settings,.ap-root>.a-page{flex:1;min-height:0}
.ap-root .a-page{overflow-y:auto}
.ap-root .a-page-head{position:sticky;top:0;z-index:2;background:var(--a-bg);min-height:59px}
.ap-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.ap-stat{border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);padding:14px 16px}
.ap-k{font-size:12px;color:var(--a-muted)}
.ap-v{font-size:22px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.ap-v small{font-size:14px;font-weight:400;color:var(--a-muted)}
.ap-cols{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
.ap-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.ap-pad{padding:14px 16px}
.ap-ln{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--a-line);font-size:13.5px}
.ap-ln:first-of-type{border-top:0}
.ap-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block}
.ap-bar{display:grid;grid-template-columns:22px 60px minmax(0,1fr) 70px;gap:10px;align-items:center;font-size:13px;padding:5px 0}
.ap-av{flex:none;width:22px;height:22px;border-radius:50%;background:var(--a-panel2);color:var(--a-muted);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.ap-track{height:8px;border-radius:4px;background:var(--a-panel2);overflow:hidden}
.ap-track>span{display:block;height:100%;border-radius:4px}
.ap-sel{height:32px;border:1px solid var(--a-line);border-radius:999px;background:var(--a-panel);padding:0 12px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;justify-self:start;color:var(--a-ink)}
.ap-grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--a-line);font-size:13px}
.ap-link{color:var(--a-accent);font-size:13px;cursor:pointer}
.ap-warnbox{border:1px solid var(--a-warn);background:var(--a-warnSoft);border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ap-h{font-size:11.5px;font-weight:600;color:var(--a-muted);padding:12px 10px 4px;text-transform:uppercase;letter-spacing:.05em}
.ap-side{flex:0 1 250px;min-width:220px;border-right:1px solid var(--a-line);padding:14px 10px;display:flex;flex-direction:column;gap:1px;overflow-y:auto}
.ap-split{display:flex;flex:1;min-height:0}
.ap-split>.a-page{flex:1}
.ap-search{display:flex;align-items:center;gap:6px;border:1px solid var(--a-line);border-radius:9px;padding:5px 8px;margin:0 4px 4px;background:var(--a-panel);color:var(--a-muted)}
.ap-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--a-ink);font:inherit;font-size:13px;outline:none}
.ap-logo{width:28px;height:28px;border-radius:8px;flex:none}
.ap-mrow{display:grid;grid-template-columns:28px minmax(0,1.3fr) minmax(0,1.6fr) 90px;gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--a-line);font-size:13px}
.ap-tags{display:flex;flex-wrap:wrap;gap:4px}
.ap-chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;font-size:13px}
.ap-root{--ap-c1:#1084FE;--ap-c2:#00B5A5;--ap-c3:#FF6700;--ap-c4:#FFAA00}
[data-ds-dark-theme] .ap-root{--ap-c1:#5AA5FF;--ap-c2:#2CC9BA;--ap-c3:#FF8A3D;--ap-c4:#FFC14D}
.ap-lg{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--a-muted)}
.ap-sw{width:10px;height:10px;border-radius:3px}
.ap-chart{display:flex;gap:10px;height:170px;align-items:flex-end;border-bottom:1px solid var(--a-line);padding-bottom:4px}
.ap-chart .col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;flex:1}
.ap-chart .stk{width:34px;display:flex;flex-direction:column-reverse;border-radius:5px;overflow:hidden}
.ap-days{display:flex;gap:10px;font-size:12px}
.ap-days span{flex:1;text-align:center}
.ap-lr{display:grid;grid-template-columns:70px 40px minmax(0,1.6fr) 90px 80px 80px;gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--a-line);font-size:13px;min-width:700px}
.ap-dr{display:grid;grid-template-columns:52px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.3fr) 54px;gap:12px;align-items:center;padding:10px 14px;border-top:1px solid var(--a-line);font-size:13px}
.ap-ev{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;padding:7px 0;border-top:1px solid var(--a-line);font-size:13px}
.ap-desk{border-radius:12px;overflow:hidden;border:1px solid var(--a-line);background:#1B1E24;aspect-ratio:16/10;display:flex;flex-direction:column}
.ap-desk .bar{height:26px;background:#2A2E36;display:flex;align-items:center;gap:6px;padding:0 10px}
.ap-desk .bar>span{width:9px;height:9px;border-radius:50%}
.ap-desk .bar>.url{width:auto;height:auto;border-radius:6px;background:#1B1E24;color:#9CA3B0;font-size:11.5px;padding:2px 10px;margin-left:10px;font-family:'JetBrains Mono',monospace}
.ap-desk .view{flex:1;background:#F4F5F7;display:flex;align-items:center;justify-content:center}
.ap-desk .dlg{width:300px;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:22px;display:flex;flex-direction:column;gap:10px;color:#15171C}
.ap-desk .dlg b{font-size:16px}
.ap-desk .hint{font-size:13px;color:#5B6270}
.ap-desk .code{display:flex;gap:6px}
.ap-desk .code span{flex:1;height:38px;border:1px solid #D0D3DA;border-radius:8px}
.ap-desk .go{height:36px;border-radius:8px;background:#15171C}
.ap-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ap-meter{height:6px;border-radius:99px;background:var(--a-panel2);margin-top:8px;overflow:hidden}
.ap-meter>span{display:block;height:100%;border-radius:99px}
.ap-it{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-top:1px solid var(--a-line);font-size:14px}
.a-card>.ap-it:first-child{border-top:0}
.ap-it .a-ib{width:30px;height:30px}
.aris .ap-chip{height:30px;border:1px solid var(--a-line);border-radius:999px;background:var(--a-panel);padding:0 12px;font-size:12.5px;color:var(--a-muted)}
.aris .ap-chip[aria-pressed=true]{background:var(--a-hover);color:var(--a-ink);font-weight:600}
.aris .ap-sk{display:grid;grid-template-columns:minmax(0,2fr) 70px 70px 120px 70px 120px 90px;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid var(--a-line);font-size:13.5px;min-width:760px;width:100%;text-align:left}
.aris button.ap-sk:hover{background:var(--a-hover)}
.aris .ap-sk[data-hot]{background:var(--a-accentSoft)}
.ap-dl{font-family:'JetBrains Mono',monospace;font-size:12.5px;padding:2px 14px;white-space:pre-wrap;color:var(--a-muted)}
.ap-dl[data-kind="+"]{background:var(--a-okSoft);color:var(--a-ok)}
.ap-dl[data-kind="-"]{background:var(--a-dangerSoft);color:var(--a-danger)}
.ap-er{display:grid;grid-template-columns:minmax(0,1.6fr) 80px 80px 70px;gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--a-line);font-size:13px}
.ap-inbox{flex:0 1 380px;min-width:300px;border-right:1px solid var(--a-line);background:var(--a-panel);display:flex;flex-direction:column;overflow-y:auto}
.aris .ap-li{display:flex;gap:10px;align-items:flex-start;width:100%;border-top:1px solid var(--a-line);padding:12px 14px;text-align:left}
.aris .ap-li:hover{background:var(--a-hover)}
.aris .ap-li[aria-current]{background:var(--a-accentSoft)}
.ap-detail{flex:999 1 520px;min-width:0;padding:22px 28px;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
.ap-kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid var(--a-line);font-size:13.5px}
.ap-kv:first-child{border-top:0}
.ap-cap{font-size:12px;font-weight:600;color:var(--a-muted);text-transform:uppercase;letter-spacing:.05em}
.ap-tr{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--a-line);font-size:13.5px}
.a-card>.ap-tr:first-child,.a-card>div:first-child>.ap-tr:first-child{border-top:0}
@keyframes ap-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ap-pulse{animation:ap-pulse 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.ap-pulse{animation:none}}
.ap-click{cursor:pointer}
.ap-click:hover{border-color:var(--a-accent)}
.ap-stage{position:relative;flex:1;min-height:420px;margin:-18px -24px 0}
.ap-stage>.a-orbit{position:absolute;inset:0;width:100%;height:100%}
.ap-stage .legend{position:absolute;left:20px;bottom:16px;display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--a-muted);background:var(--a-panel);border:1px solid var(--a-line);border-radius:12px;padding:7px 12px}
.ap-stage .legend span{display:inline-flex;align-items:center;gap:6px}
.ap-timeline{border-top:1px solid var(--a-line);margin:0 -24px -18px;padding:10px 20px 14px}
.ap-timeline .head{display:flex;justify-content:space-between;font-size:12px;color:var(--a-muted);padding-bottom:6px}
.ap-timeline .rows{display:grid;grid-template-columns:44px minmax(0,1fr);row-gap:6px;column-gap:10px;align-items:center;font-size:12px}
.ap-timeline .bar{height:6px;border-radius:3px}
.ap-aside{flex:1 1 300px;max-width:330px;min-width:268px;border-left:1px solid var(--a-line);background:var(--a-panel);padding:18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.ap-tile{width:60px;height:60px;border-radius:18px;background:var(--a-panel2);display:flex;align-items:center;justify-content:center;flex:none}
.ap-stamp{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 4px;border-radius:8px;background:var(--a-panel2);font-weight:600}
.ap-stamp>span{background:var(--a-accentSoft);color:var(--a-accent);border-radius:5px;padding:0 5px;font-size:11px}
.ap-split>.a-page>.a-page-body{flex:1;min-height:0}
.ap-lb{font-size:12px;font-weight:600;color:var(--a-muted)}
.ap-soul{border:1px solid var(--a-line);border-radius:12px;background:var(--a-panel);color:var(--a-ink);padding:14px 16px;font-size:13px;line-height:1.7;resize:vertical;width:100%}
.ap-cl{display:grid;grid-template-columns:minmax(0,1fr) 120px 110px 150px;gap:14px;align-items:center;padding:12px 14px;border-top:1px solid var(--a-line);font-size:13.5px}
.ap-mascots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%}
.aris .ap-mascots button{width:44px;height:44px;border-radius:12px;border:1px solid var(--a-line);background:var(--a-panel);display:inline-flex;align-items:center;justify-content:center}
.aris .ap-mascots button[aria-checked=true]{border:2px solid var(--a-accent);background:var(--a-accentSoft)}
.aris .ap-chip.ap-pick{height:32px;font-size:13px;color:var(--a-ink);display:inline-flex;align-items:center;gap:6px}
.aris .ap-chip.ap-pick[aria-pressed=true]{border-color:var(--a-accent);color:var(--a-accent);background:var(--a-accentSoft);font-weight:600}
.ap-disc{border-top:1px solid var(--a-line);margin-top:6px}
.aris .ap-disc>button{width:100%;display:flex;align-items:center;gap:8px;padding:12px 0;font-size:13.5px;font-weight:600}
.ap-disc .chev{display:inline-block;transition:transform .15s;color:var(--a-muted)}
.ap-disc>button[aria-expanded=true] .chev{transform:rotate(90deg)}
.ap-disc>.body{padding-bottom:6px}
.ap-frow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--a-line);font-size:13.5px}
.ap-dfoot{display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid var(--a-line)}
.ap-ck{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:1px solid var(--a-line);font-size:14px}
.ap-key{font-size:11.5px;border:1px solid var(--a-line);border-radius:5px;padding:0 5px;color:var(--a-muted)}
.ap-search-overlay{align-items:flex-start;padding-top:120px}
.ap-search-box{width:min(640px,100%);background:var(--a-panel);border-radius:16px;box-shadow:var(--a-shadow);overflow:hidden;color:var(--a-ink)}
.ap-search-box .top{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--a-line);color:var(--a-muted)}
.ap-search-box .top input{flex:1;border:0;background:transparent;color:var(--a-ink);font:inherit;font-size:15px;outline:none}
.ap-search-box .filters{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px 6px}
.ap-search-box .list{padding:4px 6px 8px;max-height:420px;overflow-y:auto}
.ap-search-box .res{display:flex;align-items:flex-start;gap:12px;border-radius:10px;padding:9px 10px;cursor:pointer}
.ap-search-box .res[aria-selected=true]{background:var(--a-hover)}
.ap-search-box .snip{display:block;font-size:12.5px;color:var(--a-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-search-box mark{background:var(--a-warnSoft);color:var(--a-ink);border-radius:3px;padding:0 1px}
.ap-search-box .foot{display:flex;gap:16px;align-items:center;padding:10px 16px;border-top:1px solid var(--a-line);font-size:12px}
`
