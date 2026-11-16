// Balance report from REAL games (rows recorded by stats.js). Used by the
// CLI (tools/stats/run.js → npm run stats) and by the server's /admin/stats.
import { BALANCE_VERSION } from './stats.js'
import { esc, num, pct, date, table, bar, page } from './reportKit.js'
import { CARD_DEFS } from '../client/src/game/cards.js'
import { SHOP_PIECE_TYPES, SHOP_PRICES } from '../client/src/game/economy.js'

// Every recorded round, oldest first.
export function loadRounds(db) {
  return db.prepare('SELECT data FROM rounds ORDER BY ended_at').all().map(r => JSON.parse(r.data))
}

// opts: { ver: 'current'|'all'|<hash>, mode: 'auto'|'pvp'|'bot'|'all', days: number|null, notes?: string[] }
export function buildStatsReport(all, opts = {}) {
  const o = { ver: 'current', mode: 'auto', days: null, ...opts }
  const { rows, ver, mode, notes } = filter(all, o)
  notes.unshift(...(opts.notes ?? []))
  const a = analyze(rows)
  const html = render(a, { date: date(Date.now()), ver, mode, notes, versions: versions(all), nav: !!opts.nav })
  const summary = [
    `Раундов: ${a.n} (решённых ${a.decisive}), матчей ${a.matches}, игроков ${a.players} · версия ${ver} · режим ${mode}`,
    ...notes.map(n => '  ! ' + n),
    ...a.flags.map(f => `  [${f.sev}] ${f.area}: ${f.text}`),
  ].join('\n')
  return { html, summary }
}

// ── math ────────────────────────────────────────────────────────────────
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1]
  const p = k / n, d = 1 + z * z / n
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
// Two-proportion z: is k1/n1 really different from k2/n2?
function zDiff(k1, n1, k2, n2) {
  if (!n1 || !n2) return 0
  const p = (k1 + k2) / (n1 + n2)
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  return se ? (k1 / n1 - k2 / n2) / se : 0
}
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const groupBy = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x) } return m }


function filter(all, o) {
  const notes = []
  let rows = all
  if (o.days) rows = rows.filter(r => r.endedAt >= Date.now() - o.days * 864e5)
  let ver = o.ver === 'current' ? BALANCE_VERSION : o.ver
  if (ver !== 'all') {
    const own = rows.filter(r => r.balanceVer === ver)
    if (!own.length && o.ver === 'current' && rows.length) {
      notes.push(`Для текущей версии баланса (${BALANCE_VERSION}) раундов ещё нет — показаны все версии вместе.`)
      ver = 'all'
    } else rows = own
  }
  let mode = o.mode
  if (mode === 'auto') {
    mode = rows.some(r => r.mode === 'pvp') ? 'pvp' : 'all'
    if (mode === 'all' && rows.length) notes.push('Партий человек-против-человека ещё нет — показаны игры с ИИ (стороны ИИ в статистику предметов не входят).')
  }
  if (mode !== 'all') rows = rows.filter(r => r.mode === mode)
  return { rows, ver, mode, notes }
}

// ── analysis ────────────────────────────────────────────────────────────
const COLORS = ['white', 'black']
const isDecisive = r => r.result.winner === 'white' || r.result.winner === 'black'

// One entry per HUMAN side of a round (bot drafts are synthetic, so they'd
// only blur what players actually choose and win with).
function humanSides(rows) {
  const out = []
  for (const r of rows) for (const c of COLORS) {
    const s = r.sides[c]
    if (s.bot) continue
    out.push({ r, c, s, won: isDecisive(r) ? r.result.winner === c : null })
  }
  return out
}

function itemStats(sides) {
  const keys = [...SHOP_PIECE_TYPES.map(p => ({ key: p, kind: 'piece', name: pieceName(p), price: SHOP_PRICES[p] })),
    ...Object.keys(CARD_DEFS).map(id => ({ key: id, kind: 'card', name: CARD_DEFS[id].name, price: CARD_DEFS[id].cost }))]
  const dec = sides.filter(x => x.won !== null)
  return keys.map(k => {
    const count = x => k.kind === 'piece' ? x.s.pieces.filter(p => p === k.key).length : x.s.cards.filter(c => c === k.key).length
    const taken = sides.filter(x => count(x) > 0)
    const tDec = dec.filter(x => count(x) > 0), nDec = dec.filter(x => count(x) === 0)
    const tW = tDec.filter(x => x.won).length, nW = nDec.filter(x => x.won).length
    const row = {
      ...k,
      sides: sides.length,
      pickRate: sides.length ? taken.length / sides.length : null,
      copies: avg(taken.map(count)),
      nTaken: tDec.length,
      wrTaken: tDec.length ? tW / tDec.length : null,
      ciTaken: wilson(tW, tDec.length),
      wrNot: nDec.length ? nW / nDec.length : null,
      z: zDiff(tW, tDec.length, nW, nDec.length),
    }
    if (k.kind === 'card') {
      const played = taken.filter(x => x.s.cardsPlayed.includes(k.key))
      const pDec = played.filter(x => x.won !== null)
      row.playRate = taken.length ? played.length / taken.length : null
      row.wrPlayed = pDec.length ? pDec.filter(x => x.won).length / pDec.length : null
      row.nPlayed = pDec.length
    }
    return row
  })
}

function winShare(rows, colorOf) {
  const dec = rows.filter(isDecisive)
  const k = dec.filter(r => r.result.winner === colorOf(r)).length
  return { n: dec.length, rate: dec.length ? k / dec.length : null, ci: wilson(k, dec.length) }
}

function analyze(rows) {
  const sides = humanSides(rows)
  const flags = []
  const flag = (sev, area, text) => flags.push({ sev, area, text })

  const items = itemStats(sides)
  for (const it of items) {
    // ~12 items tested at once: plain z ≥ 2 would cry wolf on pure noise
    // about half the time, so the bars sit higher.
    if (it.nTaken >= 20 && Math.abs(it.z) >= 2.5) {
      flag(Math.abs(it.z) >= 3 ? 'high' : 'medium', it.name, `с ним побеждают ${pct(it.wrTaken)} против ${pct(it.wrNot)} без него (${it.nTaken} наборов в решённых раундах, z ${num(it.z, 1)}) — ${it.z > 0 ? 'сильнее' : 'слабее'} своей цены`)
    }
    if (it.sides >= 50 && it.pickRate < 0.05) flag('medium', it.name, `почти не берут: ${pct(it.pickRate)} наборов`)
    if (it.kind === 'card' && it.pickRate * it.sides >= 20 && it.playRate < 0.4) flag('medium', it.name, `берут, но играют лишь в ${pct(it.playRate)} раундов — мёртвая или непонятная карта`)
  }

  const whiteWin = winShare(rows, () => 'white')
  const firstPick = winShare(rows.filter(r => r.firstColor), r => r.firstColor)
  for (const [label, w] of [['Белые (первый ход в бою)', whiteWin], ['Первым выбирающий в наборе', firstPick]]) {
    if (w.n >= 30 && (w.ci[0] > 0.5 || w.ci[1] < 0.5)) flag('high', label, `выигрывает ${pct(w.rate)} решённых раундов (интервал ${pct(w.ci[0])}–${pct(w.ci[1])})`)
  }

  const endTypes = {}
  for (const r of rows) endTypes[r.result.type] = (endTypes[r.result.type] ?? 0) + 1
  const abandoned = rows.filter(r => r.result.type === 'abandoned').length
  if (rows.length >= 30 && abandoned / rows.length > 0.15) flag('medium', 'Уходы', `${pct(abandoned / rows.length)} раундов брошены посреди боя`)

  const byRound = [...groupBy(rows, r => Math.min(r.round, 3))].sort((a, b) => a[0] - b[0]).map(([round, xs]) => {
    const s = humanSides(xs)
    return {
      round, n: xs.length,
      decisive: xs.filter(isDecisive).length / xs.length,
      plies: avg(xs.map(r => r.plies)),
      minutes: avg(xs.filter(r => r.durationMs).map(r => r.durationMs / 60000)),
      budgetLeft: avg(s.map(x => x.s.budgetLeft).filter(v => v != null)),
      draftTimeout: s.length ? s.filter(x => x.s.draftTimedOut).length / s.length : null,
      white: winShare(xs, () => 'white').rate,
    }
  })

  const boards = [...groupBy(rows, r => r.board ?? '—')].map(([board, xs]) => ({
    board, n: xs.length,
    decisive: xs.filter(isDecisive).length / xs.length,
    plies: avg(xs.map(r => r.plies)),
    white: winShare(xs, () => 'white'),
  })).sort((a, b) => b.n - a.n)

  // Human vs each bot level.
  const vsBot = [...groupBy(rows.filter(r => r.mode === 'bot'), r => COLORS.map(c => r.sides[c].botLevel).find(Boolean) ?? '?')].map(([level, xs]) => {
    const w = winShare(xs, r => COLORS.find(c => !r.sides[c].bot))
    return { level, n: xs.length, ...w, abandoned: xs.filter(r => r.result.type === 'abandoned').length / xs.length }
  })

  const firstBuys = {}
  for (const r of rows) for (const c of COLORS) {
    if (r.sides[c].bot) continue
    const e = r.draftLog.find(e => e.color === c && (e.kind === 'card' || (e.kind === 'piece' && e.pieceType !== 'king')))
    const key = !e ? '—' : e.kind === 'card' ? CARD_DEFS[e.cardId]?.name ?? e.cardId : pieceName(e.pieceType)
    firstBuys[key] = (firstBuys[key] ?? 0) + 1
  }

  return {
    n: rows.length, sides: sides.length,
    decisive: rows.filter(isDecisive).length,
    matches: new Set(rows.map(r => r.matchId)).size,
    players: new Set(sides.map(x => x.s.player).filter(Boolean)).size,
    flags, items, whiteWin, firstPick, endTypes, abandoned, byRound, boards, vsBot, firstBuys,
    plies: avg(rows.map(r => r.plies)),
    minutes: avg(rows.filter(r => r.durationMs).map(r => r.durationMs / 60000)),
  }
}

function versions(all) {
  return [...groupBy(all, r => r.balanceVer)].map(([ver, xs]) => ({
    ver, n: xs.length, pvp: xs.filter(r => r.mode === 'pvp').length,
    from: xs[0].endedAt, to: xs.at(-1).endedAt,
  })).sort((a, b) => b.to - a.to)
}

// ── render ──────────────────────────────────────────────────────────────
const PIECE_NAMES = { pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь', king: 'Король' }
function pieceName(t) { return PIECE_NAMES[t] ?? t }
const END_NAMES = { king_captured: 'Взятие короля', elimination: 'Уничтожение', checkmate: 'Мат', timeout: 'Время', surrender: 'Сдача', draw: 'Ничья', stalemate: 'Пат', no_moves: 'Нет ходов', abandoned: 'Брошен' }
const SEV = { high: ['Важно', 'sev-high'], medium: ['Обратить внимание', 'sev-med'] }
// Sample too small to mean anything → greyed.
const weak = (n, html, min = 20) => n < min ? `<span class="weak" title="мало данных">${html}</span>` : html

function render(a, meta) {
  const s = []
  s.push(`<header><h1>Mischess — статистика живых игр</h1><p class="meta">${esc(meta.date)} · версия баланса ${esc(meta.ver)} · режим ${esc(meta.mode)} · ${a.n} раундов, ${a.matches} матчей, ${a.players} игроков</p>${meta.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}</header>`)

  if (!a.n) {
    s.push('<section><p>Данных пока нет. Сыграй несколько раундов на сервере и запусти отчёт снова.</p></section>')
  } else {
    s.push(`<section><h2>Где перекос</h2>${a.flags.length ? `<ul class="flags">${a.flags.map(f => `<li><span class="sev ${SEV[f.sev][1]}">${SEV[f.sev][0]}</span><b>${esc(f.area)}:</b> ${esc(f.text)}</li>`).join('')}</ul>` : `<p>Статистически значимых перекосов нет${a.decisive < 200 ? ' — но данных мало, выводы появятся с ростом выборки' : ''}.</p>`}</section>`)

    s.push(`<section><h2>Раунды в целом</h2><div class="kpis">
      <div><span>Раундов</span><b>${a.n}</b><i>решённых ${pct(a.decisive / a.n)}</i></div>
      <div><span>Полуходов</span><b>${num(a.plies)}</b><i>в среднем</i></div>
      <div><span>Длина боя</span><b>${num(a.minutes, 1)}</b><i>мин</i></div>
      <div><span>Белые побеждают</span><b>${weak(a.whiteWin.n, pct(a.whiteWin.rate), 30)}</b><i>${pct(a.whiteWin.ci[0])}–${pct(a.whiteWin.ci[1])}</i></div>
      <div><span>Первый в наборе</span><b>${weak(a.firstPick.n, pct(a.firstPick.rate), 30)}</b><i>${pct(a.firstPick.ci[0])}–${pct(a.firstPick.ci[1])}</i></div>
      <div><span>Брошено</span><b>${pct(a.abandoned / a.n)}</b></div></div>`)
    s.push('<h3>Чем заканчиваются</h3>' + table(['Итог', 'Доля'], Object.entries(a.endTypes).sort((x, y) => y[1] - x[1]).map(([k, v]) => [esc(END_NAMES[k] ?? k), bar(v / a.n)])))
    s.push('<h3>По раундам матча</h3>' + table(['Раунд', 'Раундов', 'Решённых', 'Полуходов', 'Минут', 'Остаток бюджета', 'Время набора вышло', 'Белые'],
      a.byRound.map(r => [r.round === 3 ? '3+' : r.round, r.n, pct(r.decisive), num(r.plies), num(r.minutes, 1), num(r.budgetLeft, 1), pct(r.draftTimeout), weak(r.n, pct(r.white))])))
    s.push('</section>')

    s.push(`<section><h2>Фигуры и карты</h2><p class="hint">Только стороны людей. «Победы с ним» против «без него» — по решённым раундам; |z| ≥ 2.5 — скорее всего не случайность, ≥ 3 — почти точно. Серое — меньше 20 раундов, верить рано. Корреляция, не причина: сильные игроки могут просто чаще брать одно и то же.</p>` +
      table(['Предмет', 'Цена', 'Берут', 'Копий', 'Побед с ним', 'Без него', 'z', 'Играют', 'Побед, если сыграна'],
        [...a.items].sort((x, y) => y.z - x.z).map(it => [
          `${esc(it.name)}${it.kind === 'card' ? ' <i class="tag">карта</i>' : ''}`, it.price, bar(it.pickRate), num(it.copies, 1),
          weak(it.nTaken, `${pct(it.wrTaken)} <i class="ci">${pct(it.ciTaken[0])}–${pct(it.ciTaken[1])} · ${it.nTaken}</i>`),
          pct(it.wrNot),
          weak(it.nTaken, `<b class="${it.z > 0 ? 'up' : 'down'}">${num(it.z, 1)}</b>`),
          it.kind === 'card' ? pct(it.playRate) : '',
          it.kind === 'card' ? weak(it.nPlayed ?? 0, pct(it.wrPlayed)) : '',
        ])))
    s.push('<h3>Первая покупка</h3>' + table(['Что', 'Доля'], Object.entries(a.firstBuys).sort((x, y) => y[1] - x[1]).map(([k, v]) => [esc(k), bar(v / (a.sides || 1))])))
    s.push('</section>')

    s.push('<section><h2>Доски</h2>' + table(['Доска', 'Раундов', 'Решённых', 'Полуходов', 'Белые'],
      a.boards.map(b => [esc(b.board), b.n, pct(b.decisive), num(b.plies), weak(b.white.n, pct(b.white.rate))])) + '</section>')

    if (a.vsBot.length) {
      s.push('<section><h2>Против ИИ</h2><p class="hint">Доля побед человека по уровню бота.</p>' + table(['Уровень', 'Раундов', 'Человек побеждает', 'Интервал', 'Брошено'],
        a.vsBot.map(b => [esc(b.level), b.n, weak(b.n, bar(b.rate)), `${pct(b.ci[0])}–${pct(b.ci[1])}`, pct(b.abandoned)])) + '</section>')
    }
  }

  if (meta.versions.length) {
    s.push('<section><h2>Версии баланса</h2>' + table(['Версия', 'Раундов', 'Из них PvP', 'С', 'По'],
      meta.versions.map(v => [`<code>${esc(v.ver)}</code>${v.ver === BALANCE_VERSION ? ' <i class="tag">текущая</i>' : ''}`, v.n, v.pvp, date(v.from), date(v.to)])) + '</section>')
  }

  return page('Статистика Mischess', s.join('\n'), meta.nav ? '/admin/stats' : undefined)
}

