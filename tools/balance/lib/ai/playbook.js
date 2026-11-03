// How a PERSON plays each card. The generic search only sees 2–3 plies and
// values material; people play cards for reasons that pay off later or
// that are about the shape of the position ("that enemy piece is bothering
// me", "close the line onto my king"). Each intent below proposes concrete
// targets with a reason and a bonus — the human-perceived value the search
// can't see. The search still checks the play actually works (the bonus is
// added on top of its score, see search.js's decide).
//
// New card? Add its intents here (keyed by card id). Without an entry the
// card is still played, by the generic search alone.
import { chess, cards, opp, kingSquare, dist, col, rnk } from '../engine.js'
import { pieceValue } from './eval.js'

const SLIDERS = new Set(['rook', 'bishop', 'queen'])

// Squares strictly between a and b if they share a rank/file/diagonal.
function between(a, b) {
  const dc = Math.sign(col(b) - col(a)), dr = Math.sign(rnk(b) - rnk(a))
  const lenC = Math.abs(col(b) - col(a)), lenR = Math.abs(rnk(b) - rnk(a))
  if (!(lenC === 0 || lenR === 0 || lenC === lenR)) return []
  const out = []
  let c = col(a) + dc, r = rnk(a) + dr
  while (c !== col(b) || r !== rnk(b)) { out.push(String.fromCharCode(97 + c) + r); c += dc; r += dr }
  return out
}

function neighbors(sq) {
  const out = []
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) out.push(String.fromCharCode(97 + col(sq) + dc) + (rnk(sq) + dr))
  return out
}

// Everything the intents need, computed once per decision.
function context(gs, me) {
  const them = opp(me)
  const myKing = kingSquare(gs, me), enKing = kingSquare(gs, them)
  const attacksBy = { [me]: new Map(), [them]: new Map() } // target square -> attacker squares
  const moves = {}
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color !== me && p.color !== them) continue
    const ms = chess.getLegalMoves(gs, sq)
    moves[sq] = ms
    for (const t of ms) { const m = attacksBy[p.color]; if (!m.has(t)) m.set(t, []); m.get(t).push(sq) }
  }
  const valuable = sq => { const p = gs.pieces[sq]; return p ? (p.type === 'king' ? 20 : pieceValue(p)) : 0 }
  // my pieces the enemy can hit right now
  const threatened = Object.keys(gs.pieces).filter(sq => gs.pieces[sq].color === me && attacksBy[them].has(sq))
  // enemy pieces that hit something of mine (king, or worth ≥ 3)
  const bothering = new Map()
  for (const sq of threatened) if (sq === myKing || valuable(sq) >= 3) for (const a of attacksBy[them].get(sq)) bothering.set(a, Math.max(bothering.get(a) ?? 0, valuable(sq)))
  // empty squares next to a king
  const empty = sq => chess.getValidSquares(gs.board).has(sq) && !gs.pieces[sq]
  const enKingEscapes = enKing ? neighbors(enKing).filter(empty) : []
  const myKingEscapes = myKing ? neighbors(myKing).filter(empty) : []
  return { gs, me, them, myKing, enKing, attacksBy, moves, valuable, threatened, bothering, enKingEscapes, myKingEscapes, empty }
}

const INTENTS = {
  barricade(c, add) {
    // Close a slider's line onto my king or a threatened valuable piece.
    for (const victim of c.threatened) {
      for (const a of c.attacksBy[c.them].get(victim)) {
        if (!SLIDERS.has(c.gs.pieces[a]?.type)) continue
        for (const sq of between(a, victim)) add(sq, victim === c.myKing ? 0.9 : 0.35 * c.valuable(victim) / 5, 'закрыть линию атаки')
      }
    }
    // Take a square away from the enemy king when I'm pressing.
    for (const sq of c.enKingEscapes) add(sq, 0.3, 'отнять клетку у короля')
    // Shore up the open side of my own king against sliders.
    if (Object.values(c.gs.pieces).some(p => p.color === c.them && SLIDERS.has(p.type))) for (const sq of c.myKingEscapes) add(sq, 0.15, 'прикрыть короля')
  },
  add_cell(c, add) {
    // Reopen a hole that blocks my slider's line to the enemy king.
    const holes = new Set(c.gs.board.blockedCells ?? [])
    if (c.enKing) for (const sq in c.gs.pieces) {
      const p = c.gs.pieces[sq]
      if (p.color !== c.me || !SLIDERS.has(p.type)) continue
      for (const b of between(sq, c.enKing)) if (holes.has(b)) add(b, 0.45, 'пробить проход к королю')
    }
    // Give a boxed-in king a way out.
    if (c.myKing && c.myKingEscapes.length <= 1) for (const sq of neighbors(c.myKing)) add(sq, 0.4, 'клетка для отхода короля')
  },
  freeze(c, add) {
    // Where an enemy piece would step to start attacking my king/pieces.
    for (const from in c.moves) {
      const p = c.gs.pieces[from]
      if (p?.color !== c.them) continue
      for (const to of c.moves[from]) {
        if (c.gs.pieces[to]) continue
        const moved = { ...c.gs, pieces: { ...c.gs.pieces, [to]: p } }
        delete moved.pieces[from]
        const hits = chess.getLegalMoves(moved, to)
        if (c.myKing && hits.includes(c.myKing)) add(to, 0.45, 'подход к моему королю')
        else if (hits.some(h => c.gs.pieces[h]?.color === c.me && c.valuable(h) >= 5)) add(to, 0.25, 'подход к моей фигуре')
      }
    }
    for (const sq of c.enKingEscapes) add(sq, 0.3, 'заморозить короля на отходе')
    for (const sq of c.myKingEscapes) if (c.attacksBy[c.them].has(sq)) add(sq, 0.25, 'прикрыть подход к королю')
  },
  smoke_screen(c, add) {
    if (c.myKing) {
      const pressed = c.attacksBy[c.them].has(c.myKing) || Object.keys(c.gs.pieces).some(sq => c.gs.pieces[sq].color === c.them && dist(sq, c.myKing) <= 2)
      if (pressed) add(c.myKing, c.attacksBy[c.them].has(c.myKing) ? 0.7 : 0.35, 'спрятать короля')
    }
    for (const sq of c.threatened) if (sq !== c.myKing && c.valuable(sq) >= 3) add(sq, 0.35 * c.valuable(sq) / 5, 'спрятать атакованную фигуру')
    if (c.enKing) {
      const near = Object.keys(c.gs.pieces).filter(sq => c.gs.pieces[sq].color === c.me && sq !== c.myKing && dist(sq, c.enKing) <= 2)
      if (near.length >= 2) add(near[0], 0.3, 'скрыть атаку')
    }
  },
  meteor(c, add) {
    for (const sq in c.gs.pieces) {
      const p = c.gs.pieces[sq]
      if (p.color !== c.them || p.type === 'king') continue
      const v = pieceValue(p)
      const stuck = (c.moves[sq] ?? []).filter(t => !c.attacksBy[c.me].has(t)).length <= 1
      if (stuck) add(sq, 0.12 * v, 'фигуре некуда уйти')
      if (c.enKing && dist(sq, c.enKing) === 1) add(sq, 0.06 * v + 0.15, 'защитник короля')
      if (c.bothering.has(sq)) add(sq, 0.25, 'фигура, которая угрожает')
    }
  },
  unstable(c, add) {
    // The way people use it: the enemy piece that's bothering me, hoping it
    // turns into something that no longer reaches.
    for (const [sq, v] of c.bothering) add(sq, 0.35 + 0.03 * Math.min(v, 20), 'мешающая фигура')
    for (const sq in c.gs.pieces) {
      const p = c.gs.pieces[sq]
      if (p.color === c.them && (p.type === 'queen' || p.type === 'rook')) add(sq, p.type === 'queen' ? 0.35 : 0.2, 'ослабить тяжёлую фигуру')
      if (p.color === c.me && (p.type === 'knight' || p.type === 'bishop') && c.enKing && dist(sq, c.enKing) <= 2) add(sq, 0.2, 'шанс усилить атаку')
    }
  },
  shield(c, add) {
    for (const sq of c.threatened) if (c.valuable(sq) >= 3) add(sq, 0.3 + 0.05 * Math.min(c.valuable(sq), 9), 'спасти атакованную фигуру')
    if (c.enKing) for (const sq in c.gs.pieces) {
      const p = c.gs.pieces[sq]
      if (p.color === c.me && p.type !== 'king' && dist(sq, c.enKing) <= 2) add(sq, 0.25, 'усилить атакующую фигуру')
    }
    if ((c.gs.meteors ?? []).some(m => m.hidden) && c.memAim) add(c.memAim, 0.45, 'прикрыть от метеора')
  },
}

// Candidate plays proposed by human intents, only for cards in hand and
// only at targets the game allows. Best reason per (card, target) wins.
export function playbookCandidates(gs, me, mem = {}) {
  const hand = gs.cards?.[me]?.hand ?? []
  if (!hand.length || gs.cardPlayedThisTurn) return []
  const c = context(gs, me)
  c.memAim = mem.lastMeteorAim
  const out = new Map()
  for (const id of new Set(hand.map(h => h.id))) {
    const intent = INTENTS[id]
    if (!intent) continue
    let valid
    try { valid = new Set(cards.getValidTargets(id, gs, me)) } catch { continue }
    intent(c, (target, bonus, why) => {
      if (!valid.has(target)) return
      const key = id + '@' + target
      const prev = out.get(key)
      if (!prev || prev.bonus < bonus) out.set(key, { cardId: id, target, bonus, why })
    })
  }
  return [...out.values()].sort((a, b) => b.bonus - a.bonus)
}
