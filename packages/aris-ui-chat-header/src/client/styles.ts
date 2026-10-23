import { FONTS, dshScopedVars } from '@aris/ui-kit'

/** CSS đầu khung chat aris; màu theo theme của dsh qua `data-ds-dark-theme`. */
export const CSS = `
${dshScopedVars('.aris-ch')}
.aris-ch{display:inline-flex;align-items:center;gap:8px;color:var(--a-ink);font-family:${FONTS.body};font-size:14px;white-space:nowrap}
.aris-ch button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
.aris-ch button:focus-visible{outline:2px solid var(--a-accent);outline-offset:1px}
.aris-ch .botName{font-family:${FONTS.heading};font-weight:600;font-size:15px}
.aris-ch .role{font-size:11.5px;font-weight:600;color:var(--a-accent);background:var(--a-accentSoft);border-radius:999px;padding:0 8px;line-height:18px}
.aris-ch .sep{color:var(--a-muted);font-size:16px;padding:0 2px}
[data-conversation-header-leading]:not(:has(+ * nav)) .aris-ch .sep{display:none}
.aris-ch .chev{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:var(--a-muted)}
.aris-ch .chev:hover,.aris-ch .chev[aria-expanded=true]{background:var(--a-hover);color:var(--a-ink)}
.aris-ch .icon{width:32px;height:32px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:var(--a-muted)}
.aris-ch .icon:hover{background:var(--a-hover);color:var(--a-ink)}
.aris-ch.pop{position:relative}
.aris-ch .menu{position:absolute;z-index:50;top:calc(100% + 8px);left:-8px;width:330px;background:var(--a-panel);border:1px solid var(--a-line);border-radius:14px;box-shadow:0 18px 40px rgba(20,23,28,.16);padding:6px;display:flex;flex-direction:column;white-space:normal}
.aris-ch .item{display:flex;align-items:center;gap:8px;border-radius:9px;padding:7px 10px;width:100%;text-align:left}
.aris-ch .item:hover{background:var(--a-hover)}
.aris-ch .item[aria-selected=true]{background:var(--a-accentSoft);color:var(--a-accent);font-weight:600}
.aris-ch .item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aris-ch .item .meta{font-size:12px;color:var(--a-muted);font-weight:400}
.aris-ch .new{font-weight:600}
.aris-ch .label{font-size:12px;color:var(--a-muted);padding:8px 10px 4px;border-top:1px solid var(--a-line);margin-top:2px}
.aris-ch .empty{font-size:13px;color:var(--a-muted);padding:6px 10px 8px}
`
