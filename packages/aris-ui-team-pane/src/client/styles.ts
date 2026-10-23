/** CSS riêng của cột phải "Đội bot" theo màn R3: nền thẻ, ô sơ đồ bo 18, danh sách việc có vạch ngăn. */
export const CSS = `
.aris-team{display:flex;flex-direction:column;gap:12px;padding:14px 16px 18px;height:100%;overflow-y:auto;background:var(--a-panel);font-size:13px}
.aris-team .head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.aris-team h2{margin:0;font-size:14px;font-weight:600}
.aris .aris-team .mapLink{color:var(--a-accent);font-size:12.5px;font-weight:500;padding:0 6px}
.aris-team .map{border-radius:18px;background:var(--a-bg);border:1px solid var(--a-line);overflow:hidden;flex:none}
.aris-team .hint{font-size:11.5px;color:var(--a-muted);text-align:center;margin-top:-4px}
.aris-team .list{display:flex;flex-direction:column}
.aris-team .act{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--a-line)}
.aris-team .act:last-child{border-bottom:0}
.aris-team .act .a-glyph{margin-top:2px}
.aris-team .act .txt{min-width:0}
.aris-team .more{display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--a-line);padding-top:6px}
.aris-project .act{align-items:center}
.aris-project .act .txt{flex:1}
.aris-project .act .state{font-size:12px;white-space:nowrap}
.aris-project .list>.a-btn,.aris-project .list>.a-pop{align-self:flex-start;margin-top:4px}
.aris-project .goal{display:flex;flex-direction:column;gap:2px;padding-bottom:6px;border-bottom:1px solid var(--a-line)}
.aris-project .goal .txt{font-size:13px;line-height:1.5}
.aris-project .sect{display:flex;flex-direction:column;border-top:1px solid var(--a-line);padding-top:6px}
.aris-project .sect>.a-btn{align-self:flex-start;margin-top:4px}
.aris-project .kv{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;font-size:13px}
.aris-project .kv .path{max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.aris-project .kv input{width:16px;height:16px;accent-color:var(--a-accent)}
`
