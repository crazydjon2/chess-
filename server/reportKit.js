// Shared HTML bits for the owner-only report pages (/admin/*): helpers,
// styles and the nav between reports.
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export const num = (x, d = 0) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d))
export const pct = x => (x == null || Number.isNaN(x) || !Number.isFinite(x) ? '—' : `${Math.round(x * 100)}%`)
export const date = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ')

export function table(head, rows) {
  return `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
export function bar(x) {
  if (x == null || Number.isNaN(x) || !Number.isFinite(x)) return '—'
  return `<span class="bar"><span style="width:${Math.max(0, Math.min(100, x * 100))}%"></span></span> ${pct(x)}`
}

const NAV = [['/admin/funnel', 'Воронка'], ['/admin/stats', 'Баланс'], ['/admin/feedback', 'Отзывы']]

// `active`: the nav path to highlight; omitted (e.g. the CLI report) → no nav.
export function page(title, body, active) {
  const nav = active ? `<nav>${NAV.map(([href, label]) => `<a href="${href}"${href === active ? ' class="on"' : ''}>${label}</a>`).join('')}</nav>` : ''
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--bg:#f7f2e8;--fg:#241708;--muted:#7a6a55;--card:#fffaf0;--line:#e3d8c3;--bar:#c9a227;--high:#c0392b;--med:#d68910;--up:#1e8449;--down:#c0392b}
@media (prefers-color-scheme:dark){:root{--bg:#1b1712;--fg:#f1e9da;--muted:#b3a58e;--card:#252019;--line:#3a3227;--bar:#d4ac2b;--up:#58d68d;--down:#ec7063}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
nav{max-width:1100px;margin:0 auto;padding:12px 16px 0;display:flex;gap:6px}nav a{color:var(--muted);text-decoration:none;padding:6px 12px;border-radius:999px;border:1px solid var(--line)}nav a.on{color:var(--fg);background:var(--card);font-weight:600}
header,section{max-width:1100px;margin:0 auto;padding:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:14px auto}
h1{margin:8px 0 2px;font-size:24px}h2{margin:0 0 10px;font-size:19px}h3{margin:16px 0 6px;font-size:15px;color:var(--muted)}
.meta,.hint{color:var(--muted);margin:0 0 8px}.note{margin:6px 0 0;padding:6px 10px;border-left:3px solid var(--med);background:var(--card)}
.flags{list-style:none;padding:0;margin:0}.flags li{padding:8px 0;border-bottom:1px solid var(--line)}
.sev{display:inline-block;min-width:92px;font-size:12px;font-weight:700;margin-right:8px;padding:2px 8px;border-radius:999px;color:#fff;text-align:center}
.sev-high{background:var(--high)}.sev-med{background:var(--med)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.bar{display:inline-block;width:80px;height:8px;background:var(--line);border-radius:4px;vertical-align:middle;overflow:hidden}.bar span{display:block;height:100%;background:var(--bar)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpis div{border:1px solid var(--line);border-radius:10px;padding:10px}.kpis span{display:block;color:var(--muted);font-size:13px}.kpis b{font-size:22px}.kpis i{color:var(--muted);font-size:12px;margin-left:4px}
.up{color:var(--up)}.down{color:var(--down)}.weak{opacity:.45}.ci{color:var(--muted);font-size:12px;font-style:normal}.tag{color:var(--muted);font-size:12px}code{font-size:13px}
.fb{padding:12px 0;border-bottom:1px solid var(--line)}.fb p{margin:0 0 6px;white-space:pre-wrap}.fb small{color:var(--muted)}
</style></head><body>${nav}${body}</body></html>`
}
