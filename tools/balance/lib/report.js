// Self-contained HTML report (no external assets) + console summary.
import { pct } from './analysis.js'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (x, d = 0) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d))
const SEV = { high: ['Высокий', 'sev-high'], medium: ['Средний', 'sev-med'], info: ['К сведению', 'sev-info'] }

function table(head, rows) {
  return `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
function bar(x) {
  if (x == null || Number.isNaN(x)) return '—'
  const w = Math.max(0, Math.min(100, x * 100))
  return `<span class="bar"><span style="width:${w}%"></span></span> ${pct(x)}`
}

export function renderHTML(a, meta, comparison) {
  const s = []
  s.push(`<header><h1>Chess+ — баланс-лаборатория</h1><p class="meta">${esc(meta.date)} · ${meta.games} партий · эксперименты: ${esc(meta.experiments.join(', '))} · ИИ: ${esc(meta.strength)} · сид ${meta.seed} · ${num(meta.seconds)} с</p></header>`)

  s.push(`<section><h2>Где перекос</h2>${a.flags.length ? `<ul class="flags">${a.flags.map(f => `<li><span class="sev ${SEV[f.severity][1]}">${SEV[f.severity][0]}</span><b>${esc(f.area)}.</b> ${esc(f.text)}</li>`).join('')}</ul>` : '<p>Явных перекосов не найдено.</p>'}</section>`)

  if (comparison?.length) {
    s.push(`<section><h2>Что изменилось относительно эталона</h2>${table(['Метрика', 'Было', 'Стало', 'Разница'], comparison.map(c => [esc(c.key), num(c.before, 3), num(c.after, 3), `<b class="${c.delta > 0 ? 'up' : 'down'}">${c.delta > 0 ? '+' : ''}${num(c.delta, 3)}</b>`]))}</section>`)
  }

  const e = a.engine
  s.push(`<section><h2>Здоровье движка</h2><p>Падений: <b>${a.counts.crashes}</b> · нарушений правил: <b>${e.violations.reduce((x, v) => x + v.count, 0)}</b> · ИИ не нашёл исполнимого хода: <b>${e.stuck}</b></p>`)
  if (e.crashes.length) s.push(table(['Ошибка', 'Эксперимент', 'Сид'], e.crashes.map(c => [`<code>${esc(c.error)}</code><pre>${esc(c.stack)}</pre>`, esc(c.exp), c.seed])))
  if (e.violations.length) s.push(table(['Нарушение', 'Раз', 'Пример (сид)'], e.violations.map(v => [esc(v.example), v.count, `${esc(v.exp)} · ${v.seed}`])))
  s.push('</section>')

  const g = a.global
  if (g) {
    s.push(`<section><h2>Партии в целом</h2><div class="kpis">
      <div><span>Решённых</span><b>${pct(g.decisive)}</b></div>
      <div><span>Длина решённой</span><b>${num(g.avgPliesDecisive)}</b><i>полуходов</i></div>
      <div><span>Конец за ≤12 полуходов</span><b>${pct(g.earlyKills)}</b></div>
      <div><span>Взятие первым ходом</span><b>${pct(g.plyOneCapture)}</b></div>
      <div><span>Камбэки</span><b>${pct(g.comeback?.rate)}</b><i>из ${g.comeback?.games ?? 0}</i></div></div>`)
    s.push('<h3>Чем заканчиваются</h3>' + table(['Итог', 'Доля'], Object.entries(g.endTypes).map(([k, v]) => [esc(k), bar(v)])))
    s.push('<h3>Кто берёт короля</h3>' + table(['Чем', 'Доля решённых'], Object.entries(g.kingKillers).map(([k, v]) => [esc(k), bar(v)])))
    s.push('<h3>По раундам</h3>' + table(['Раунд', 'Партий', 'Решённых', 'Полуходов (решённые)', 'Не хватило бы часов', 'Взятие 1-м ходом'],
      Object.entries(a.rounds).map(([r, v]) => [r, v.games, pct(v.decisive), num(v.avgPliesDecisive), pct(v.wouldFlag), pct(v.plyOneCapture)])))
    s.push('</section>')
  }

  if (a.firstMove) {
    s.push(`<section><h2>Преимущество первого хода</h2><p>Доля побед белых среди решённых зеркальных партий (95% интервал).</p>` + table(['Раунд', 'Партий', 'Белые', 'Интервал'],
      [['все', a.firstMove.all.n, bar(a.firstMove.all.white), `${pct(a.firstMove.all.ci[0])}–${pct(a.firstMove.all.ci[1])}`],
        ...Object.entries(a.firstMove.rounds).map(([r, v]) => [r, v.n, bar(v.white), `${pct(v.ci[0])}–${pct(v.ci[1])}`])]) + '</section>')
  }
  if (a.boards) {
    s.push('<section><h2>Доски</h2>' + table(['Доска', 'Партий', 'Решённых', 'Без результата', 'Полуходов', 'Белые', 'Взятие 1-м ходом'],
      a.boards.map(b => [esc(b.board), b.n, pct(b.decisive), bar(b.draws), num(b.avgPlies), pct(b.white), pct(b.plyOneCapture)])) + '</section>')
  }
  if (a.items) {
    s.push(`<section><h2>Ценность предметов</h2><p>Случайные армии (${a.items.games} решённых партий), логистическая регрессия при общем бюджете: насколько одна лишняя копия предмета (вместо того же количества монет, потраченных иначе) меняет шанс победы. Цена монеты в победах: ${num(a.items.coinValue, 3)} (z ${num(a.items.coinValueZ, 1)}${a.items.coinKnown ? '' : ' — слишком неточно для честных цен'}). Надёжно только то, где |z| ≥ 2.</p>` +
      table(['Предмет', 'Цена', 'Вклад копии', 'Надёжность (z)', 'Побед на монету vs средний', 'Цена по пользе'],
        a.items.rows.map(r => [esc(r.name), r.cost, `<b class="${r.beta > 0 ? 'up' : 'down'}">${r.beta > 0 ? '+' : ''}${num(r.beta, 2)}</b>`, `${num(r.z, 1)}${Math.abs(r.z) >= 2 ? ' ✓' : ''}`, r.relative == null ? '—' : `×${num(r.relative, 1)}`, r.fairPrice != null ? num(r.fairPrice) : '—'])) + '</section>')
  }
  if (a.picks) {
    s.push('<section><h2>Что покупают в драфте</h2><p>Доля армий «человеческих» драфтеров, в которых есть предмет. Почти всегда — обязательная покупка, почти никогда — мёртвый предмет; и то и другое делает драфт предсказуемым.</p>' +
      table(['Предмет', 'В армиях'], a.picks.map(p => [esc(p.name), bar(p.rate)])) + '</section>')
  }
  if (a.meta) {
    s.push('<section><h2>Мета: все стратегии против всех</h2><p>Среднее отклонение от 50%: ' + pct(a.meta.spread) + '</p>' + table(['Стратегия', 'Очки', 'Партий'], a.meta.ranking.map(r => [esc(r.name), bar(r.score), r.n])) +
      '<h3>Самые перекошенные пары</h3>' + table(['Пара', 'Очки первой', 'Ничьи', 'Партий'], [...a.meta.pairs].sort((x, y) => Math.abs(y.score - 0.5) - Math.abs(x.score - 0.5)).slice(0, 40).map(p => [`${esc(p.a)} — ${esc(p.b)}`, bar(p.score), pct(p.drawRate), p.n])) + '</section>')
  }
  if (a.archetypes) {
    s.push('<section><h2>Стратегии драфта</h2>' + table(['Стратегия', 'Очки', 'Партий'], a.archetypes.ranking.map(r => [esc(r.name), bar(r.score), r.n])) +
      '<h3>Пары</h3>' + table(['Пара', 'Очки первой', 'Ничьи', 'Партий'], a.archetypes.pairs.map(p => [`${esc(p.a)} — ${esc(p.b)}`, bar(p.score), pct(p.drawRate), p.n])) + '</section>')
  }
  if (a.cards) {
    s.push('<section><h2>Карты</h2><p>Та же армия с картой против армии, потратившей эти деньги на фигуры.</p>' + table(['Карта', 'Цена', 'Очки', 'Интервал', 'Сыграна', 'Первый раз (полуход)', 'Убила короля', 'Зачем играли', 'На что играли', 'По раундам'],
      a.cards.map(c => [esc(c.name), c.cost, bar(c.score), `${pct(c.ci[0])}–${pct(c.ci[1])}`, pct(c.playRate), num(c.avgFirstPly), pct(c.kingKills),
        esc(Object.entries(c.reasons ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join(', ')),
        esc(Object.entries(c.targets).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join(', ')),
        Object.entries(c.rounds).map(([r, v]) => `R${r} ${pct(v)}`).join(' · ')])) + '</section>')
  }
  if (a.placement) {
    s.push('<section><h2>Расстановка</h2>' + table(['Стиль против «король в центре»', 'Очки', 'Партий'], a.placement.styles.map(r => [esc(r.style), bar(r.score), r.n])) +
      table(['Кто правит последним', 'Его очки', 'Взятие 1-м ходом', 'Партий'], a.placement.lastEditor.map(r => [r.color === 'white' ? 'белые' : 'чёрные', bar(r.score), pct(r.plyOneCapture), r.n])) + '</section>')
  }
  if (a.skill) {
    s.push(`<section><h2>Влияние умения</h2><p>Сильный ИИ против слабого с одинаковыми армиями: <b>${pct(a.skill.score)}</b> (интервал ${pct(a.skill.ci[0])}–${pct(a.skill.ci[1])}). ${Object.entries(a.skill.rounds).map(([r, v]) => `Раунд ${r}: ${pct(v)}`).join(' · ')}</p></section>`)
  }
  if (a.situations) {
    s.push(`<section><h2>Ситуации</h2><p>Карта победителя за ≤4 полухода до конца: ${esc(Object.entries(a.situations.lastCardBeforeWin).map(([k, v]) => `${k} ×${v}`).join(', ') || '—')}. «Нет ходов»: ${a.situations.noMoves}. Мина на короле перед его гибелью: ${a.situations.mineThenKing}.</p></section>`)
  }

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Баланс Chess+</title><style>
:root{--bg:#f7f2e8;--fg:#241708;--muted:#7a6a55;--card:#fffaf0;--line:#e3d8c3;--bar:#c9a227;--high:#c0392b;--med:#d68910;--info:#5d6d7e;--up:#1e8449;--down:#c0392b}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1712;--fg:#f1e9da;--muted:#b3a58e;--card:#252019;--line:#3a3227;--bar:#d4ac2b;--up:#58d68d;--down:#ec7063}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header,section{max-width:1100px;margin:0 auto;padding:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:14px auto}
h1{margin:8px 0 2px;font-size:24px}h2{margin:0 0 10px;font-size:19px}h3{margin:16px 0 6px;font-size:15px;color:var(--muted)}
.meta{color:var(--muted);margin:0}
.flags{list-style:none;padding:0;margin:0}.flags li{padding:8px 0;border-bottom:1px solid var(--line)}
.sev{display:inline-block;min-width:92px;font-size:12px;font-weight:700;margin-right:8px;padding:2px 8px;border-radius:999px;color:#fff;text-align:center}
.sev-high{background:var(--high)}.sev-med{background:var(--med)}.sev-info{background:var(--info)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.bar{display:inline-block;width:90px;height:8px;background:var(--line);border-radius:4px;vertical-align:middle;overflow:hidden}.bar span{display:block;height:100%;background:var(--bar)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpis div{border:1px solid var(--line);border-radius:10px;padding:10px}.kpis span{display:block;color:var(--muted);font-size:13px}.kpis b{font-size:22px}.kpis i{color:var(--muted);font-size:12px;margin-left:4px}
.up{color:var(--up)}.down{color:var(--down)}pre{white-space:pre-wrap;font-size:12px;color:var(--muted)}code{font-size:13px}
</style></head><body>${s.join('\n')}</body></html>`
}

export function printSummary(a) {
  const lines = []
  lines.push(`\nПартий: ${a.counts.games}, падений: ${a.counts.crashes}, нарушений правил: ${a.engine.violations.reduce((x, v) => x + v.count, 0)}`)
  if (!a.flags.length) lines.push('Явных перекосов не найдено.')
  for (const f of a.flags) lines.push(`[${SEV[f.severity][0]}] ${f.area}: ${f.text}`)
  return lines.join('\n')
}

export function compareMetrics(before, after, threshold = 0.03) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out = []
  for (const k of keys) {
    const b = before[k], a = after[k]
    if (b == null || a == null) { out.push({ key: k, before: b, after: a, delta: a == null ? -Infinity : Infinity }); continue }
    if (Math.abs(a - b) >= threshold) out.push({ key: k, before: b, after: a, delta: a - b })
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
}
