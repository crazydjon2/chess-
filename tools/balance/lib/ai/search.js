// Alpha-beta search over the player's OWN VIEW of the game (hidden enemy
// pieces/mines/meteor squares stay hidden — no cheating), with capture
// quiescence. A turn is "optionally one card, then one move" — cards are
// explored by actually applying them through the real card engine, so the
// search needs no per-card knowledge (see eval.js for how their effects
// are valued).
import { chess, cards, opp, legalMoves, quickMove, quickCard, quickTerminal, kingSquare, dist, advanceOnePly } from '../engine.js'
import { evaluate, pieceValue } from './eval.js'
import { playbookCandidates } from './playbook.js'

const WIN = 100000

export const STRENGTHS = {
  // depth = full plies searched before quiescence; nodes = per-decision budget
  weak:   { depth: 1, nodes: 1500,  qDepth: 2, cardOptions: 3, noise: 0.35 },
  normal: { depth: 2, nodes: 10000, qDepth: 4, cardOptions: 5, noise: 0.15 },
  strong: { depth: 3, nodes: 25000, qDepth: 4, cardOptions: 6, noise: 0.05 },
  // Fuzzing only: near-random play to reach weird positions.
  chaos:  { depth: 1, nodes: 300,   qDepth: 0, cardOptions: 2, noise: 25, cardChance: 0.35 },
}

function victimValue(gs, to) {
  const t = gs.pieces[to]
  if (!t) return 0
  if (t.type === 'king') return (t.hp ?? 1) > 1 ? 50 : 1000
  return pieceValue(t)
}

function orderMoves(gs, moves) {
  for (const m of moves) {
    const v = victimValue(gs, m.to)
    const a = gs.pieces[m.from]
    m.o = v ? 10 * v - (a ? pieceValue(a) * 0.1 : 0) : 0
  }
  return moves.sort((x, y) => y.o - x.o)
}

class Search {
  constructor(me, mem, cfg, rng) {
    this.me = me; this.mem = mem; this.cfg = cfg; this.rng = rng
    this.nodes = 0
  }
  out() { return this.nodes > this.cfg.nodes }

  // Score from the perspective of the side to move in `gs`.
  leaf(gs) {
    const t = quickTerminal(gs)
    if (t) return t === 'draw' ? 0 : (t === gs.turn ? WIN : -WIN)
    const e = evaluate(gs, this.me, this.mem)
    return gs.turn === this.me ? e : -e
  }

  quiesce(gs, alpha, beta, qd) {
    this.nodes++
    const stand = this.leaf(gs)
    if (Math.abs(stand) >= WIN || qd <= 0) return stand
    if (stand >= beta) return stand
    if (stand > alpha) alpha = stand
    const caps = orderMoves(gs, legalMoves(gs, gs.turn).filter(m => gs.pieces[m.to] && gs.pieces[m.to].color !== gs.turn))
    for (const m of caps) {
      const v = -this.quiesce(quickMove(gs, m.from, m.to), -beta, -alpha, qd - 1)
      if (v >= beta) return v
      if (v > alpha) alpha = v
      if (this.out()) break
    }
    return alpha
  }

  negamax(gs, depth, alpha, beta) {
    this.nodes++
    const t = quickTerminal(gs)
    if (t) return t === 'draw' ? 0 : (t === gs.turn ? WIN + depth : -WIN - depth)
    if (depth <= 0 || this.out()) return this.quiesce(gs, alpha, beta, this.cfg.qDepth)
    const moves = orderMoves(gs, legalMoves(gs, gs.turn))
    if (!moves.length) return -WIN / 2 // stuck = loses (no_moves), modulo rescue cards
    let best = -Infinity
    for (const m of moves) {
      const v = -this.negamax(quickMove(gs, m.from, m.to), depth - 1, -beta, -alpha)
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
      if (this.out()) break
    }
    return best
  }

  // All root moves for the side to move, scored (iterative deepening).
  rootMoves(gs) {
    const moves = orderMoves(gs, legalMoves(gs, gs.turn))
    let scored = moves.map(m => ({ ...m, s: 0 }))
    for (let d = 1; d <= this.cfg.depth; d++) {
      const pass = []
      for (const m of scored) {
        const v = -this.negamax(quickMove(gs, m.from, m.to), d - 1, -Infinity, Infinity)
        pass.push({ ...m, s: v })
        if (this.out() && d > 1) break
      }
      if (pass.length === scored.length || d === 1) scored = pass
      if (this.out()) break
    }
    for (const m of scored) m.s += (this.rng() - 0.5) * this.cfg.noise
    return scored.sort((a, b) => b.s - a.s)
  }
}

// A card's outcome may be random (the engine rolls inside applyCardEffect —
// e.g. which type an unstable piece turns into). Looking at ONE roll while
// deciding would be peeking at a future the real play won't have, so a
// card is judged over several rolls (identical results collapse to one,
// so deterministic cards cost nothing extra).
const ROLLS = 3
function cardOutcomes(view, me, cardId, target) {
  const out = [], seen = new Set()
  for (let i = 0; i < ROLLS; i++) {
    const s = quickCard(view, me, cardId, target)
    const key = JSON.stringify(s.pieces) + JSON.stringify(s.meteors ?? []) + JSON.stringify(s.mines ?? []) + JSON.stringify(s.fogZones ?? []) + JSON.stringify(s.board.extraCells ?? [])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

// What the opponent could grab next turn (their best capture, by value).
function bestEnemyCapture(gs, me) {
  let best = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color === me || p.color === 'neutral' || p.frozen) continue
    for (const to of chess.getLegalMoves(gs, sq)) {
      const t = gs.pieces[to]
      if (t && t.color === me) best = Math.max(best, victimValue(gs, to))
    }
  }
  return best
}

// Cheap first look at a card play: let one ply of time pass through the
// engine's upkeep (so delayed effects — a cursed piece's new type, a fog
// zone, a meteor countdown — have landed), then value the position minus
// whatever the opponent could still take. That's what catches "that enemy
// piece was bothering me and now it can't".
function quickLook(state, me, mem) {
  const later = advanceOnePly(state, me)
  return evaluate(later, me, mem) - 0.9 * Math.min(bestEnemyCapture(later, me), 50)
}

// Card candidates worth searching: every legal target gets the quick look
// (averaged over rolls), keep the best few per card plus a random one so
// unusual uses still get tried.
function cardCandidates(view, me, mem, cfg, rng) {
  if (view.cardPlayedThisTurn) return []
  const hand = view.cards?.[me]?.hand ?? []
  const seen = new Set()
  const out = []
  for (const c of hand) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    let targets
    try { targets = cards.getValidTargets(c.id, view, me) } catch { targets = [] }
    if (!targets.length) continue
    const scored = targets.map(t => {
      const outcomes = cardOutcomes(view, me, c.id, t)
      const s = outcomes.reduce((a, o) => a + quickLook(o, me, mem), 0) / outcomes.length
      return { cardId: c.id, target: t, s: s + (rng() - 0.5) * 0.05 }
    }).sort((a, b) => b.s - a.s)
    out.push(...scored.slice(0, cfg.cardOptions))
    if (scored.length > cfg.cardOptions) out.push(scored[cfg.cardOptions + Math.floor(rng() * (scored.length - cfg.cardOptions))])
  }
  return out
}

// One full decision for `me`: maybe a card, then an ordered list of moves
// (best first — the caller falls back down the list if the real board
// rejects one, e.g. a slide into a fog-hidden piece).
export function decide(view, me, mem, cfg, rng) {
  let nodes = 0
  let card = null
  // Fuzzing: sometimes play any card at any legal target, sensible or not.
  if (cfg.cardChance && !view.cardPlayedThisTurn && rng() < cfg.cardChance) {
    const hand = view.cards?.[me]?.hand ?? []
    if (hand.length) {
      const c = hand[Math.floor(rng() * hand.length)]
      let targets = []
      try { targets = cards.getValidTargets(c.id, view, me) } catch { targets = [] }
      if (targets.length) card = { cardId: c.id, target: targets[Math.floor(rng() * targets.length)] }
    }
  }
  let cands = card ? [] : cardCandidates(view, me, mem, cfg, rng)
  if (!card) {
    // Human intents (playbook.js) propose plays the generic look would
    // miss, each with the long-term value a person sees in it.
    const human = playbookCandidates(view, me, mem).slice(0, cfg.cardOptions + 2)
    const byKey = new Map(cands.map(c => [c.cardId + '@' + c.target, { ...c, bonus: 0 }]))
    for (const h of human) {
      const k = h.cardId + '@' + h.target
      byKey.set(k, { ...(byKey.get(k) ?? { cardId: h.cardId, target: h.target }), bonus: h.bonus, why: h.why })
    }
    cands = [...byKey.values()]
  }
  if (cands.length) {
    // Card or no card is decided at ONE shared, equal depth: comparing a
    // deep no-card search against shallower card searches is biased (a
    // shallow search misses replies and looks rosier), which made the AI
    // throw cards away for nothing.
    const cmpCfg = { ...cfg, depth: Math.min(cfg.depth, 2), nodes: Math.max(600, cfg.nodes / 4), noise: 0 }
    const judge = state => {
      const s = new Search(me, mem, cmpCfg, rng)
      const moves = s.rootMoves(state)
      nodes += s.nodes
      return moves.length ? moves[0].s : -WIN
    }
    let best = judge(view)
    for (const c of cands) {
      // averaged over rolls — a gamble is worth its expected outcome
      const outcomes = cardOutcomes(view, me, c.cardId, c.target)
      const score = outcomes.reduce((a, o) => a + judge(o), 0) / outcomes.length + (c.bonus ?? 0)
      // Playing a card must beat holding it (its hand value is already in
      // the eval) by a small margin.
      if (score > best + 0.25) { best = score; card = c }
    }
  }
  // With a card chosen, the move is searched only AFTER the card has really
  // been played (the caller re-asks via searchMoves on the real board) —
  // otherwise it'd be planned around an imagined roll.
  if (card) return { card, moves: null, score: null, nodes }
  const res = searchMoves(view, me, mem, cfg, rng)
  return { card: null, moves: res.moves, score: res.score, nodes: nodes + res.nodes }
}

export function searchMoves(view, me, mem, cfg, rng) {
  const s = new Search(me, mem, cfg, rng)
  const moves = s.rootMoves(view)
  return { moves, score: moves.length ? moves[0].s : -WIN, nodes: s.nodes }
}

export { WIN }
