// Placement AI. Placement is open and simultaneous in the real game: both
// sides see each other's board live until the timer runs out. Modelled as
// a few alternating rounds of local improvement against the opponent's
// current arrangement; `lastEditor` decides who gets the final word (the
// real game has no fixed order — that's exactly what this lets us probe).
import { boards, placement, chess, buildBattle, opp, col, rnk, dist } from '../engine.js'
import { pieceValue } from './eval.js'

function homeSquares(pattern, color) {
  const [lo, hi] = boards.homeRanks(pattern.rows, color)
  const blocked = new Set(pattern.blockedCells ?? [])
  const out = []
  for (let r = lo; r <= hi; r++) for (let c = 0; c < pattern.cols; c++) {
    const sq = String.fromCharCode(97 + c) + r
    if (!blocked.has(sq)) out.push(sq)
  }
  return out
}

// Starting template by style; then refined by improve().
export function template(pattern, color, pieces, style, rng) {
  const [lo, hi] = boards.homeRanks(pattern.rows, color)
  const back = color === 'white' ? lo : hi, front = color === 'white' ? hi : lo
  const free = new Set(homeSquares(pattern, color))
  const map = {}
  const kc = style === 'corner' ? (rng() < 0.5 ? 0 : pattern.cols - 1)
    : style === 'random' ? Math.floor(rng() * pattern.cols)
    : Math.floor(pattern.cols / 2) - (rng() < 0.5 ? 1 : 0)
  const order = [...pieces].sort((a, b) => (a === 'king' ? -1 : b === 'king' ? 1 : 0))
  for (const t of order) {
    let opts = [...free]
    if (style !== 'random') {
      const wantRank = t === 'king' ? back : t === 'pawn' ? front : back
      const onRank = opts.filter(s => rnk(s) === wantRank)
      if (onRank.length) opts = onRank
      opts.sort((a, b) => Math.abs(col(a) - kc) - Math.abs(col(b) - kc))
    } else opts.sort(() => rng() - 0.5)
    const sq = opts[0]
    free.delete(sq)
    map[sq] = t
  }
  return map
}

// How bad is this arrangement for `me`, given the opponent's arrangement?
function exposure(pattern, maps, me) {
  const gs = buildBattle(pattern, maps, { white: [], black: [] })
  const g = { ...gs, turn: opp(me) }
  let worst = 0, total = 0, kingLines = 0
  const k = Object.keys(g.pieces).find(s => g.pieces[s].type === 'king' && g.pieces[s].color === me)
  for (const sq in g.pieces) {
    if (g.pieces[sq].color !== opp(me)) continue
    for (const to of chess.getLegalMoves(g, sq)) {
      const t = g.pieces[to]
      if (t?.color === me) { const v = t.type === 'king' ? 50 : pieceValue(t); worst = Math.max(worst, v); total += v }
      if (k && dist(to, k) <= 1) kingLines++
    }
  }
  let shelter = 0
  if (k) for (const sq in g.pieces) if (sq !== k && g.pieces[sq].color === me && dist(sq, k) === 1) shelter++
  let score = worst * 2 + total * 0.3 + kingLines * 0.4 - shelter * 0.5
  if (!k) return score

  // ── How a person sets up (on top of "nothing hangs") ────────────────
  const forward = me === 'white' ? 1 : -1
  const sqAt = (c, r) => String.fromCharCode(97 + c) + r
  // pawns right in front of the king are the real shield
  for (let dc = -1; dc <= 1; dc++) {
    const p = g.pieces[sqAt(col(k) + dc, rnk(k) + forward)]
    if (p?.color === me && p.type === 'pawn') score -= 0.6
  }
  // never line the king up with an enemy slider, even behind a blocker —
  // one piece moving away and it's an open shot
  for (const sq in g.pieces) {
    const p = g.pieces[sq]
    if (p.color !== opp(me)) continue
    const sameLine = col(sq) === col(k) || rnk(sq) === rnk(k)
    const sameDiag = Math.abs(col(sq) - col(k)) === Math.abs(rnk(sq) - rnk(k))
    if (((p.type === 'rook' || p.type === 'queen') && sameLine) || ((p.type === 'bishop' || p.type === 'queen') && sameDiag)) score += 0.8
  }
  // own pieces: sliders on open lines, knights toward the centre. (No bonus
  // for lining up on enemy pieces at the start: with white moving first it
  // just set up a free capture on move one — 21% of round-3 games.)
  const own = { ...g, turn: me }
  const centre = (pattern.cols - 1) / 2
  for (const sq in own.pieces) {
    const p = own.pieces[sq]
    if (p.color !== me || p.type === 'king') continue
    const ms = chess.getLegalMoves(own, sq)
    if (p.type === 'rook' || p.type === 'bishop' || p.type === 'queen') score -= 0.04 * ms.length
    if (p.type === 'knight') score -= 0.1 * (centre - Math.abs(col(sq) - centre))
  }
  return score
}

function improve(pattern, me, maps, rng, iters = 3) {
  let cur = { ...maps[me] }
  let best = exposure(pattern, { ...maps, [me]: cur }, me)
  const squares = homeSquares(pattern, me)
  for (let i = 0; i < iters; i++) {
    let improved = false
    const froms = Object.keys(cur).sort(() => rng() - 0.5)
    for (const from of froms) for (const to of squares) {
      // `cur` changes as we go — the piece may have moved off `from` already.
      if (from === to || !cur[from]) continue
      const trial = { ...cur }
      const a = trial[from], b = trial[to]
      trial[to] = a
      if (b) trial[from] = b; else delete trial[from]
      const s = exposure(pattern, { ...maps, [me]: trial }, me)
      if (s < best - 1e-9) { best = s; cur = trial; improved = true }
    }
    if (!improved) break
  }
  return cur
}

export function runPlacement(pattern, armies, styles, rng, { passes = 2, lastEditor = 'random', smart = true } = {}) {
  const maps = {
    white: template(pattern, 'white', armies.white, styles.white, rng),
    black: template(pattern, 'black', armies.black, styles.black, rng),
  }
  if (smart) {
    const last = lastEditor === 'random' ? (rng() < 0.5 ? 'white' : 'black') : lastEditor
    const order = [opp(last), last]
    for (let p = 0; p < passes; p++) for (const c of order) maps[c] = improve(pattern, c, maps, rng)
  }
  for (const c of ['white', 'black']) {
    const chk = placement.validatePlacement(pattern, c, maps[c], armies[c])
    if (chk.error) throw new Error('placement invalid: ' + chk.error)
  }
  return maps
}

// One side's placement against whatever the opponent has on the board right
// now (the in-game bot uses this during live, open placement).
export function placeAgainst(pattern, me, pieces, oppMap, rng, { smart = true, style = 'king-back' } = {}) {
  const other = me === 'white' ? 'black' : 'white'
  const maps = { [me]: template(pattern, me, pieces, style, rng), [other]: oppMap ?? {} }
  if (smart) maps[me] = improve(pattern, me, maps, rng)
  const chk = placement.validatePlacement(pattern, me, maps[me], pieces)
  if (chk.error) throw new Error('placement invalid: ' + chk.error)
  return maps[me]
}
