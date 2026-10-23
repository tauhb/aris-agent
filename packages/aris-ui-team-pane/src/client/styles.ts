/** CSS riêng của cột phải "Đội bot": bố cục trang và ô đội hình. */
export const CSS = `
.aris-team{display:flex;flex-direction:column;gap:12px;padding:14px 14px 18px;height:100%;overflow-y:auto;background:var(--a-bg);font-size:13.5px}
.aris-team .head{display:flex;align-items:center;gap:8px}
.aris-team h2{margin:0;font-family:'Lexend',sans-serif;font-size:15px;font-weight:600;flex:1}
.aris-team .map{position:relative;height:200px;border-radius:14px;background:var(--a-panel2);overflow:hidden;flex:none}
.aris-team .seat{position:absolute;transform:translate(-50%,-50%);display:inline-flex;transition:transform .2s ease}
.aris-team .seat:hover{transform:translate(-50%,-50%) scale(1.1)}
.aris-team .list{display:flex;flex-direction:column;gap:8px}
.aris-team .act{display:flex;align-items:center;gap:8px}
.aris-team .act .txt{min-width:0}
.aris-team .more{display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--a-line);padding-top:6px}
@media (prefers-reduced-motion:reduce){.aris-team .seat{transition:none}}
`
