// Turns raw game records into findings: where the balance is off, in which
// situations, and how sure we are. Thresholds live in one place (LIMITS)
// so they're easy to tune as the game evolves.
import { pools, CARD_IDS, PIECE_TYPES, baseCost, cards } from './engine.js'

export const LIMITS = {
  firstMoveScore: 0.56,      // white's share of decisive mirror games
  boardDrawRate: 0.6,        // a board where most games go nowhere
  shortGamePlies: 12,        // "lost before it started"
  earlyKillRate: 0.1,
  cardKillShare: 0.2,        // one card responsible for this share of king kills
  cardStrong: 0.6,           // card vs no-card score
  cardWeak: 0.42,
  cardDeadPlayRate: 0.3,     // AI found a use for it in fewer games than this
  archetypeDominant: 0.65,
  archetypeUseless: 0.3,
  itemPriceDeviation: 0.4,   // value-per-coin this far from the median
  skillMin: 0.65,            // strong AI vs weak AI score
  comebackLow: 0.08,
  flagRate: 0.15,            // games that would run out of clock time
  secondsPerMove: 4,         // assumed human think time for the clock estimate
}

const isDec = r => r.winner === 'white' || r.winner === 'black'
const pct = x => (x == null || Number.isNaN(x) ? '—' : Math.round(100 * x) + '%')
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1]
  const p = k / n, d = 1 + z * z / n
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
function groupBy(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x) } return m }

// score of side `a` in paired experiments: win 1, draw/other 0.5, loss 0
function pairOutcome(x) {
  const r = x.rec, aColor = x.cfg.aIs
  if (!isDec(r)) return 0.5
  return r.winner === aColor ? 1 : 0
}

function endTypes(recs) {
  const m = {}
  for (const r of recs) { const k = r.result + (r.reason ? ':' + r.reason : ''); m[k] = (m[k] ?? 0) + 1 }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / recs.length]))
}

// ── logistic regression (Newton–Raphson, light ridge) ─────────────────
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]])
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r
    ;[M[i], M[p]] = [M[p], M[i]]
    const d = M[i][i] || 1e-12
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / d; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c] }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12))
}
function invertDiag(A) {
  const n = A.length, out = []
  for (let i = 0; i < n; i++) { const e = Array(n).fill(0); e[i] = 1; out.push(solve(A, e)[i]) }
  return out
}
function logistic(X, y, lambda = 0.5) {
  const k = X[0].length
  let w = Array(k).fill(0)
  let H
  for (let it = 0; it < 30; it++) {
    const g = Array(k).fill(0)
    H = Array.from({ length: k }, () => Array(k).fill(0))
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, x, j) => s + x * w[j], 0)
      const p = 1 / (1 + Math.exp(-z))
      const r = p * (1 - p)
      for (let a = 0; a < k; a++) {
        g[a] += (y[i] - p) * X[i][a]
        for (let b = 0; b < k; b++) H[a][b] += r * X[i][a] * X[i][b]
      }
    }
    for (let a = 0; a < k; a++) { g[a] -= lambda * w[a]; H[a][a] += lambda }
    const step = solve(H, g)
    w = w.map((x, i) => x + step[i])
    if (Math.max(...step.map(Math.abs)) < 1e-6) break
  }
  const se = invertDiag(H).map(v => Math.sqrt(Math.max(v, 0)))
  return { w, se }
}

export function analyze(results, opts = {}) {
  const L = { ...LIMITS, ...(opts.limits ?? {}) }
  const flags = []
  const flag = (severity, area, text) => flags.push({ severity, area, text })
  const ok = results.filter(x => x.rec && !x.rec.crash)
  const crashes = results.filter(x => x.rec?.crash)
  const byExp = groupBy(ok, x => x.exp)
  const real = ok.filter(x => x.exp !== 'fuzz')
  const out = { counts: { games: results.length, crashes: crashes.length, byExp: Object.fromEntries([...byExp].map(([k, v]) => [k, v.length])) } }

  // ── Engine health: crashes & invariant violations ────────────────────
  const viol = new Map()
  for (const x of ok) for (const v of x.rec.violations ?? []) {
    const key = v.replace(/^ply \d+(: | after \S+: )?/, '').replace(/[a-h]-?\d+/g, '□')
    const e = viol.get(key) ?? { count: 0, example: v, seed: x.seed, exp: x.exp, cfg: x.cfg }
    e.count++; viol.set(key, e)
  }
  out.engine = {
    crashes: crashes.slice(0, 20).map(c => ({ error: c.rec.error, stack: c.rec.stack, seed: c.seed, exp: c.exp, cfg: c.cfg })),
    violations: [...viol.values()].sort((a, b) => b.count - a.count).slice(0, 30),
    stuck: ok.filter(x => x.rec.result === 'ai_stuck').length,
  }
  if (crashes.length) flag('high', 'Движок', `${crashes.length} партий упали с ошибкой (первая: ${crashes[0].rec.error})`)
  for (const v of out.engine.violations.slice(0, 8)) flag('high', 'Движок', `Нарушение правила (${v.count}×): ${v.example}`)

  // ── Global battle health ─────────────────────────────────────────────
  const recs = real.map(x => x.rec)
  const dec = recs.filter(isDec)
  out.global = {
    endTypes: endTypes(recs),
    decisive: dec.length / (recs.length || 1),
    avgPliesDecisive: avg(dec.map(r => r.plies)),
    earlyKills: dec.filter(r => r.plies <= L.shortGamePlies).length / (dec.length || 1),
    plyOneCapture: recs.filter(r => r.firstCapturePly === 0).length / (recs.length || 1),
  }
  // what kills the king
  const killers = {}
  for (const r of dec) if (r.kingKiller) killers[r.kingKiller] = (killers[r.kingKiller] ?? 0) + 1
  const kills = Object.values(killers).reduce((a, b) => a + b, 0)
  out.global.kingKillers = Object.fromEntries(Object.entries(killers).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / kills]))
  for (const [k, share] of Object.entries(out.global.kingKillers)) {
    if (!PIECE_TYPES.includes(k) && k !== 'king' && share >= L.cardKillShare) flag('high', 'Карты', `«${cardName(k)}» убивает короля в ${pct(share)} всех решённых партий — карта решает раунд сама по себе`)
  }
  if (out.global.earlyKills > L.earlyKillRate) flag('medium', 'Темп', `${pct(out.global.earlyKills)} решённых партий кончаются за ${L.shortGamePlies} полуходов и меньше — раунд проигран почти сразу после расстановки`)
  // per round: clock pressure, kills, length
  out.rounds = {}
  for (const [round, xs] of groupBy(real, x => x.rec.round)) {
    const rs = xs.map(x => x.rec), d = rs.filter(isDec)
    const limit = pools.TIME_LIMIT_BY_ROUND[round] ?? 0, inc = pools.TIME_INCREMENT_BY_ROUND[round] ?? 0
    const wouldFlag = rs.filter(r => {
      const myMoves = Math.ceil(r.plies / 2)
      return myMoves * L.secondsPerMove > limit + inc * myMoves
    }).length / (rs.length || 1)
    const k = {}
    for (const r of d) if (r.kingKiller) k[r.kingKiller] = (k[r.kingKiller] ?? 0) + 1
    out.rounds[round] = {
      games: rs.length, decisive: d.length / (rs.length || 1), endTypes: endTypes(rs),
      avgPlies: avg(rs.map(r => r.plies)), avgPliesDecisive: avg(d.map(r => r.plies)),
      wouldFlag, plyOneCapture: rs.filter(r => r.firstCapturePly === 0).length / (rs.length || 1),
      kingKillers: k,
    }
    if (wouldFlag > L.flagRate) flag('medium', 'Часы', `Раунд ${round}: при ${L.secondsPerMove} с на ход ${pct(wouldFlag)} партий закончились бы по времени — партия длиннее часов`)
    if (out.rounds[round].plyOneCapture > 0.05) flag('medium', 'Расстановка', `Раунд ${round}: в ${pct(out.rounds[round].plyOneCapture)} партий белые что-то берут первым же ходом, хотя обе стороны видят расстановку`)
  }
  // comebacks: who was ahead in material at ply 20 (timeline[2]) and who won
  const ahead = dec.filter(r => r.timeline?.length > 2 && Math.abs(r.timeline[2]) >= 3)
  const comebacks = ahead.filter(r => (r.timeline[2] > 0 ? 'black' : 'white') === r.winner).length
  out.global.comeback = { games: ahead.length, rate: ahead.length ? comebacks / ahead.length : null }
  if (ahead.length >= 30 && out.global.comeback.rate < L.comebackLow) flag('medium', 'Динамика', `Камбэков почти нет: кто к 20-му полуходу впереди на 3+ материала, проигрывает лишь в ${pct(out.global.comeback.rate)} случаев`)

  // ── First-move advantage & boards (mirror) ───────────────────────────
  const mirror = byExp.get('mirror') ?? []
  if (mirror.length) {
    const md = mirror.filter(x => isDec(x.rec))
    const w = md.filter(x => x.rec.winner === 'white').length
    out.firstMove = { all: { n: md.length, white: w / (md.length || 1), ci: wilson(w, md.length) }, rounds: {} }
    for (const [round, xs] of groupBy(md, x => x.rec.round)) {
      const ww = xs.filter(x => x.rec.winner === 'white').length
      out.firstMove.rounds[round] = { n: xs.length, white: ww / xs.length, ci: wilson(ww, xs.length) }
      if (ww / xs.length > L.firstMoveScore && wilson(ww, xs.length)[0] > 0.5) flag('medium', 'Первый ход', `Раунд ${round}: белые выигрывают ${pct(ww / xs.length)} решённых зеркальных партий (статистически значимо)`)
    }
    out.boards = []
    for (const [key, xs] of groupBy(mirror, x => x.rec.round + ' · ' + x.rec.board)) {
      const rs = xs.map(x => x.rec), d = rs.filter(isDec)
      const row = {
        board: key, n: rs.length, decisive: d.length / rs.length,
        draws: rs.filter(r => r.result === 'draw' || r.result === 'cap').length / rs.length,
        avgPlies: avg(d.map(r => r.plies)), white: d.length ? d.filter(r => r.winner === 'white').length / d.length : null,
        plyOneCapture: rs.filter(r => r.firstCapturePly === 0).length / rs.length,
      }
      out.boards.push(row)
      if (row.draws > L.boardDrawRate && rs.length >= 10) flag('medium', 'Доски', `«${key}»: ${pct(row.draws)} партий без результата — доска слишком закрытая, партии застревают`)
      if (row.avgPlies < L.shortGamePlies * 1.5 && d.length >= 5) flag('medium', 'Доски', `«${key}»: решённые партии в среднем всего ${Math.round(row.avgPlies)} полуходов — слишком быстрый контакт`)
    }
    out.boards.sort((a, b) => a.board.localeCompare(b.board))
  }

  // ── Item values (random drafts → logistic regression) ────────────────
  const items = (byExp.get('items') ?? []).filter(x => isDec(x.rec))
  if (items.length >= 60) {
    const keys = [...PIECE_TYPES, ...CARD_IDS.map(c => 'card:' + c)]
    const rounds = [...new Set(items.map(x => x.rec.round))].sort()
    const count = (army, key) => key.startsWith('card:') ? army.cards.filter(c => c === key.slice(5)).length : army.pieces.filter(p => p === key).length
    // Everyone drafts against the same budget, so "one more X" always means
    // "less of something else". Unspent coins are in the model too: their
    // coefficient is what a coin is worth in wins (λ), which makes every
    // other coefficient readable as "worth this many coins more than it costs".
    const X = items.map(x => [
      ...keys.map(k => count(x.rec.armies.white, k) - count(x.rec.armies.black, k)),
      (x.rec.left?.white ?? 0) - (x.rec.left?.black ?? 0),
      ...rounds.map(r => (x.rec.round === r ? 1 : 0)),
    ])
    const y = items.map(x => (x.rec.winner === 'white' ? 1 : 0))
    const { w, se } = logistic(X, y)
    const iLeft = keys.length
    const lambda = -w[iLeft], lambdaZ = lambda / (se[iLeft] || 1)
    const coinKnown = lambda > 0 && lambdaZ >= 2
    const rows = keys.map((k, i) => {
      const item = k.startsWith('card:') ? { kind: 'card', cardId: k.slice(5) } : { kind: 'piece', pieceType: k }
      const cost = baseCost(item)
      const z = w[i] / (se[i] || 1)
      const row = { key: k, name: k.startsWith('card:') ? cardName(k.slice(5)) : pieceName(k), cost, beta: w[i], se: se[i], z }
      // fair price: the cost at which one more copy would be worth exactly
      // what the same coins spent elsewhere are worth
      row.fairPrice = coinKnown ? Math.max(0, cost + w[i] / lambda) : null
      row.extraCoins = coinKnown ? w[i] / lambda : null
      row.perCoin = w[i] / cost
      return row
    })
    // When unspent coins don't measurably matter (armies almost always spend
    // everything), there's no absolute coin value — so items are compared to
    // EACH OTHER instead: wins per coin relative to the median item.
    const median = [...rows.map(r => r.perCoin)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]
    for (const r of rows) {
      r.relative = median > 0 ? r.perCoin / median : null
      if (!coinKnown && median > 0) r.fairPrice = r.beta > 0 ? r.beta / median : 0
      const fair = r.fairPrice != null ? ` Цена по пользе ≈ ${Math.round(r.fairPrice)} (сейчас ${r.cost})` : ''
      if (coinKnown) {
        if (Math.abs(r.z) < 2) continue
        if (r.beta > 0) flag('high', 'Цены', `${r.name} стоит дешевле, чем приносит.${fair}`)
        else flag('medium', 'Цены', `${r.name} не окупает свою цену.${fair}`)
      } else if (r.relative != null) {
        if (r.relative > 1.6 && r.z >= 2) flag('high', 'Цены', `${r.name} даёт в ${r.relative.toFixed(1)} раза больше побед на монету, чем средний предмет — слишком дёшево.${fair}`)
        if (r.relative < 0.5) flag('medium', 'Цены', `${r.name} даёт ${r.beta <= 0 ? 'не больше побед, чем те же монеты, потраченные на другое' : `лишь ${Math.round(100 * r.relative)}% побед на монету от среднего предмета`} — слишком дорого или слабо.${fair}`)
      }
    }
    out.items = {
      games: items.length, coinValue: lambda, coinValueZ: lambdaZ, coinKnown,
      rows: rows.sort((a, b) => b.perCoin - a.perCoin),
      whiteByRound: Object.fromEntries(rounds.map((r, i) => [r, w[keys.length + 1 + i]])),
    }
  }

  // ── Archetypes / meta: strategy round-robins ─────────────────────────
  const roundRobin = (exp, label) => {
    const games = byExp.get(exp) ?? []
    if (!games.length) return undefined
    const score = new Map(), pairs = new Map()
    for (const x of games) {
      const [a, b] = x.cfg.pair, s = pairOutcome(x)
      for (const [k, v] of [[a, s], [b, 1 - s]]) { const t = score.get(k) ?? { pts: 0, n: 0 }; t.pts += v; t.n++; score.set(k, t) }
      const key = a + ' — ' + b, p = pairs.get(key) ?? { a, b, pts: 0, n: 0, draws: 0 }
      p.pts += s; p.n++; if (!isDec(x.rec)) p.draws++; pairs.set(key, p)
    }
    const res = {
      ranking: [...score].map(([k, v]) => ({ name: k, score: v.pts / v.n, n: v.n })).sort((a, b) => b.score - a.score),
      pairs: [...pairs.values()].map(p => ({ ...p, score: p.pts / p.n, drawRate: p.draws / p.n })),
    }
    // how far the field is from "every strategy ≈ 50%"
    res.spread = res.ranking.reduce((s, r) => s + Math.abs(r.score - 0.5), 0) / res.ranking.length
    const top = res.ranking[0]
    if (top && top.score > L.archetypeDominant) flag('high', label, `Стратегия «${top.name}» доминирует: ${pct(top.score)} очков против всех остальных — в драфте нет настоящего выбора`)
    for (const r of res.ranking) if (r.score < L.archetypeUseless) flag('medium', label, `Стратегия «${r.name}» почти не работает: ${pct(r.score)} очков`)
    return res
  }
  out.archetypes = roundRobin('archetypes', 'Драфт')
  out.meta = roundRobin('meta', 'Мета')

  // ── Draft diversity: what human-style drafters actually buy ──────────
  // An item in almost every army is a must-buy (too cheap/strong for its
  // price); one nobody takes is dead weight (too expensive/weak). Either
  // makes drafting predictable.
  const humanArmies = []
  for (const x of ok) for (const c of ['white', 'black']) {
    const pol = x.cfg?.draft?.[c]
    if (typeof pol === 'string' && pol.startsWith('human')) humanArmies.push(x.rec.armies[c])
  }
  if (humanArmies.length >= 30) {
    const keys = [...PIECE_TYPES, ...CARD_IDS.map(c => 'card:' + c)]
    out.picks = keys.map(k => {
      const has = humanArmies.filter(a => (k.startsWith('card:') ? a.cards.includes(k.slice(5)) : a.pieces.includes(k))).length
      return { key: k, name: k.startsWith('card:') ? cardName(k.slice(5)) : pieceName(k), rate: has / humanArmies.length }
    }).sort((a, b) => b.rate - a.rate)
    for (const p of out.picks) {
      if (p.rate > 0.9) flag('medium', 'Драфт', `${p.name} — в ${pct(p.rate)} армий: почти обязательная покупка, выбор предсказуем`)
      if (p.rate < 0.05) flag('medium', 'Драфт', `${p.name} почти никто не покупает (${pct(p.rate)} армий)`)
    }
  }

  // ── Cards ───────────────────────────────────────────────────────────
  const cardsExp = byExp.get('cards') ?? []
  if (cardsExp.length) {
    out.cards = []
    for (const [id, xs] of groupBy(cardsExp, x => x.cfg.cardUnderTest)) {
      const s = xs.map(pairOutcome)
      const k = s.reduce((a, b) => a + b, 0)
      const played = xs.filter(x => x.rec.events.some(e => e.t === 'card' && e.card === id && e.by === x.cfg.aIs))
      const targets = {}, reasons = {}
      let firstPly = []
      for (const x of played) {
        const evs = x.rec.events.filter(e => e.t === 'card' && e.card === id && e.by === x.cfg.aIs)
        firstPly.push(evs[0].ply)
        for (const e of evs) { targets[e.on] = (targets[e.on] ?? 0) + 1; if (e.why) reasons[e.why] = (reasons[e.why] ?? 0) + 1 }
      }
      const kills = xs.filter(x => isDec(x.rec) && x.rec.winner === x.cfg.aIs && x.rec.kingKiller === id).length
      const row = {
        id, name: cardName(id), cost: cards.CARD_DEFS[id].cost, n: xs.length, score: k / xs.length, ci: wilson(k, xs.length),
        playRate: played.length / xs.length, avgFirstPly: avg(firstPly), targets, reasons, kingKills: kills / xs.length,
        rounds: Object.fromEntries([...groupBy(xs, x => x.rec.round)].map(([r, ys]) => [r, avg(ys.map(pairOutcome))])),
      }
      out.cards.push(row)
      if (row.score > L.cardStrong && row.ci[0] > 0.5) flag('high', 'Карты', `«${row.name}» слишком сильная: армия с ней набирает ${pct(row.score)} против той же армии без неё`)
      if (row.score < L.cardWeak && row.ci[1] < 0.5) flag('medium', 'Карты', `«${row.name}» не окупается: ${pct(row.score)} против армии, потратившей деньги на фигуры`)
      if (row.playRate < L.cardDeadPlayRate) flag('medium', 'Карты', `«${row.name}» почти не находит применения: ИИ сыграл её лишь в ${pct(row.playRate)} партий`)
      const roundSpread = Object.values(row.rounds)
      if (roundSpread.length > 1 && Math.max(...roundSpread) - Math.min(...roundSpread) > 0.2) flag('info', 'Карты', `«${row.name}» сильно зависит от раунда: ${Object.entries(row.rounds).map(([r, v]) => `R${r} ${pct(v)}`).join(', ')}`)
    }
    out.cards.sort((a, b) => b.score - a.score)
  }

  // ── Placement ───────────────────────────────────────────────────────
  const place = byExp.get('placement') ?? []
  if (place.length) {
    const styles = new Map()
    for (const x of place.filter(x => x.cfg.pair)) {
      const k = x.cfg.pair[0], t = styles.get(k) ?? { pts: 0, n: 0 }
      t.pts += pairOutcome(x); t.n++; styles.set(k, t)
    }
    const last = new Map()
    for (const x of place.filter(x => x.cfg.lastEditor)) {
      const le = x.cfg.lastEditor, t = last.get(le) ?? { pts: 0, n: 0, ply1: 0 }
      t.pts += isDec(x.rec) ? (x.rec.winner === le ? 1 : 0) : 0.5; t.n++
      if (x.rec.firstCapturePly === 0) t.ply1++
      last.set(le, t)
    }
    out.placement = {
      styles: [...styles].map(([k, v]) => ({ style: k, score: v.pts / v.n, n: v.n })),
      lastEditor: [...last].map(([k, v]) => ({ color: k, score: v.pts / v.n, n: v.n, plyOneCapture: v.ply1 / v.n })),
    }
    for (const s of out.placement.styles) if (Math.abs(s.score - 0.5) > 0.12) flag('info', 'Расстановка', `Стиль «${s.style}» против короля в центре: ${pct(s.score)}`)
    for (const s of out.placement.lastEditor) if (s.score > 0.58) flag('medium', 'Расстановка', `Кто правит расстановку последним (${s.color === 'white' ? 'белые' : 'чёрные'}), набирает ${pct(s.score)} — выгодно тянуть до конца таймера`)
  }

  // ── Skill ───────────────────────────────────────────────────────────
  const skill = byExp.get('skill') ?? []
  if (skill.length) {
    const s = skill.map(pairOutcome), k = s.reduce((a, b) => a + b, 0)
    out.skill = { n: skill.length, score: k / skill.length, ci: wilson(k, skill.length), rounds: Object.fromEntries([...groupBy(skill, x => x.rec.round)].map(([r, ys]) => [r, avg(ys.map(pairOutcome))])) }
    if (out.skill.score < L.skillMin) flag('high', 'Умение', `Сильный ИИ набирает против слабого лишь ${pct(out.skill.score)} — исход во многом решает случай, а не игра`)
  }

  // ── Situations: what happened right before a decisive loss ───────────
  const sit = { lastCardBeforeWin: {}, mineThenKing: 0, frozenStuck: 0, noMoves: 0 }
  for (const r of dec) {
    const lastCard = [...r.events].reverse().find(e => e.t === 'card' && e.by === r.winner && r.plies - e.ply <= 4)
    if (lastCard) sit.lastCardBeforeWin[lastCard.card] = (sit.lastCardBeforeWin[lastCard.card] ?? 0) + 1
    if (r.result === 'no_moves') sit.noMoves++
    const mineOnKing = r.events.some(e => e.t === 'mine' && e.v === 'king')
    if (mineOnKing && r.kingKiller) sit.mineThenKing++
  }
  out.situations = sit
  if (sit.noMoves / (dec.length || 1) > 0.03) flag('medium', 'Ситуации', `${pct(sit.noMoves / dec.length)} решённых партий кончаются «нет ходов» — обычно когда последние фигуры заморожены или заперты`)

  const order = { high: 0, medium: 1, info: 2 }
  out.flags = flags.sort((a, b) => order[a.severity] - order[b.severity])
  out.metrics = flatMetrics(out)
  return out
}

function cardName(id) { return cards.CARD_DEFS[id]?.name ?? id }
const PIECE_NAMES = { pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь', king: 'Король' }
function pieceName(t) { return PIECE_NAMES[t] ?? t }

// Flat numbers for baseline comparison.
function flatMetrics(out) {
  const m = {}
  if (out.global) { m['global.decisive'] = out.global.decisive; m['global.avgPliesDecisive'] = out.global.avgPliesDecisive; m['global.earlyKills'] = out.global.earlyKills; m['global.plyOneCapture'] = out.global.plyOneCapture }
  for (const [k, v] of Object.entries(out.global?.kingKillers ?? {})) m['killer.' + k] = v
  for (const [r, v] of Object.entries(out.firstMove?.rounds ?? {})) m[`firstMove.R${r}`] = v.white
  for (const c of out.cards ?? []) m['card.' + c.id] = c.score
  for (const a of out.archetypes?.ranking ?? []) m['archetype.' + a.name] = a.score
  for (const a of out.meta?.ranking ?? []) m['meta.' + a.name] = a.score
  if (out.meta) m['meta.spread'] = out.meta.spread
  for (const i of out.items?.rows ?? []) m['itemBeta.' + i.key] = i.beta
  if (out.skill) m['skill'] = out.skill.score
  return m
}

export { pct }
