// Static evaluation, in pawns, from `me`'s point of view.
//
// Deliberately written against the GAME STATE's generic building blocks
// (pieces/hp/frozen/unstable, meteors, mines, fog zones, hand) rather than
// against specific cards: a new card that works through those blocks is
// valued correctly with no change here. A card that introduces a brand-new
// kind of state needs one more term below — see "HOOK" comments.
import { chess, cards, opp, kingSquare, dist, rnk } from '../engine.js'

export const DEFAULT_VALUES = { pawn: 1, knight: 3, bishop: 3.2, rook: 5, queen: 9, king: 0, barricade: 0 }
const UNSTABLE_AVG = types => types.reduce((s, t) => s + (DEFAULT_VALUES[t] ?? 3), 0) / types.length
const UNSTABLE_EXPECTED = UNSTABLE_AVG(chess.UNSTABLE_TYPES)

// An unstable piece is worth the AVERAGE of what it will be over the rest of
// the effect, following the engine's own schedule (chess.js's
// tickUnstablePieces): a shift on every odd remaining tick — first to the
// already-announced nextType, later ones random — and back to its original
// type at the end. So a cursed enemy queen is correctly seen as mostly a
// minor piece for a while, not as "still a queen".
function unstableValue(p, V) {
  const u = p.unstable
  const val = t => V[t] ?? 3
  let cur = val(p.type), shifted = false, sum = cur, n = 1
  for (let left = u.turnsLeft; left > 0; left--) {
    const rem = left - 1
    if (rem <= 0) cur = val(u.originalType)
    else if (rem % 2 === 1) { cur = shifted ? UNSTABLE_EXPECTED : val(u.nextType); shifted = true }
    sum += cur; n++
  }
  return sum / n
}

export function pieceValue(p, V = DEFAULT_VALUES) {
  let v = V[p.type] ?? 3
  if (p.unstable) v = unstableValue(p, V)
  const hp = p.hp ?? 1
  if (hp > 1) v *= 1 + 0.6 * (hp - 1)
  if (p.frozen) v *= 0.85
  return v
}

// Squares each side attacks (pseudo-legal capture reach), with attacker count.
function attackMap(gs, color) {
  const map = new Map()
  let mobility = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color !== color) continue
    const moves = chess.getLegalMoves(gs, sq)
    mobility += moves.length
    for (const to of moves) map.set(to, (map.get(to) ?? 0) + 1)
  }
  return { map, mobility }
}

function kingSafety(gs, color, enemyAttacks, ownAttacks) {
  const k = kingSquare(gs, color)
  if (!k) return -50
  const king = gs.pieces[k]
  let s = 0
  // A shield on the king is a whole extra life — the round is lost on the
  // king's last one.
  s += 4 * ((king.hp ?? 1) - 1)
  if (king.frozen) s -= 1
  // Pressure around the king.
  let pressure = 0, escapes = 0, shelter = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (sq !== k && dist(sq, k) === 1 && (p.color === color || p.color === 'neutral')) shelter++
  }
  for (const [sq, n] of enemyAttacks.map) if (dist(sq, k) <= 1) pressure += n
  for (const to of chess.getLegalMoves(gs, k)) if (!enemyAttacks.map.has(to)) escapes++
  s -= 0.3 * pressure
  s += 0.12 * Math.min(escapes, 4)
  s += 0.15 * Math.min(shelter, 3)
  // Attacked right now = the opponent can take it next move.
  if (enemyAttacks.map.has(k)) s -= (king.hp ?? 1) > 1 ? 1.5 : 6
  return s
}

function rawMaterial(gs, color) {
  let s = 0
  for (const sq in gs.pieces) { const p = gs.pieces[sq]; if (p.color === color && p.type !== 'king') s += DEFAULT_VALUES[p.type] ?? 0 }
  return s
}

// `mem` is the AI's own memory across the game (e.g. which of its pieces an
// unseen enemy meteor was most likely aimed at).
export function evaluate(gs, me, mem = {}, V = DEFAULT_VALUES) {
  const them = opp(me)
  let s = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color === 'neutral') continue
    const sign = p.color === me ? 1 : -1
    s += sign * pieceValue(p, V)
    if (p.type === 'pawn') {
      const adv = p.color === 'white' ? rnk(sq) - 1 : gs.board.size.rows - rnk(sq)
      s += sign * 0.07 * adv
    }
  }
  const mine = attackMap(gs, me), theirs = attackMap(gs, them)
  s += 0.02 * (mine.mobility - theirs.mobility)
  s += kingSafety(gs, me, theirs, mine) - kingSafety(gs, them, mine, theirs)
  const edge = rawMaterial(gs, me) - rawMaterial(gs, them)
  if (edge >= 2) s += huntTerm(gs, me, them, edge)
  else if (edge <= -2) s -= huntTerm(gs, them, me, -edge)

  // ── Pending effects (HOOK: add a term here for new delayed mechanics) ──
  // Meteors: what a strike would do is asked of the ENGINE (detonate a copy
  // right now), never assumed here — so rule changes (e.g. kings immune)
  // are picked up automatically.
  for (const m of gs.meteors ?? []) {
    // Unseen enemy meteor: assume it's aimed at the piece of ours it would
    // hurt most when it appeared (see likeliestMeteorTarget) — still there?
    // then that's the danger, and stepping off removes it.
    const square = m.hidden ? (gs.pieces[mem.lastMeteorAim]?.color === me ? mem.lastMeteorAim : null) : m.square
    if (!square) continue
    const victim = gs.pieces[square]
    if (!victim || victim.color === 'neutral') continue
    const loss = strikeLoss(gs, { ...m, square, turnsLeft: 1 }, victim, V)
    if (!loss) continue
    const sign = victim.color === me ? -1 : 1
    // A piece that can't step off is far more likely to still be there.
    const stuck = chess.getLegalMoves(gs, square).length === 0 ? 1 : 0.45
    s += sign * loss * stuck * (m.turnsLeft <= 1 ? 0.8 : 0.5)
  }
  for (const mine of gs.mines ?? []) {
    if (mine.owner !== me || !mine.square) continue
    // Worth something if an enemy piece can actually walk onto it.
    let best = 0
    for (const sq in gs.pieces) {
      const p = gs.pieces[sq]
      if (p.color !== them) continue
      if (chess.getLegalMoves(gs, sq).includes(mine.square)) best = Math.max(best, p.type === 'king' ? 4 : pieceValue(p, V))
    }
    s += 0.12 * best + 0.15
  }
  // Fog: the opponent can't aim at what it can't see — a hidden piece
  // that's under attack is effectively out of reach, and a hidden king
  // can't be hunted directly. (Only our OWN zones are known in full; the
  // opponent's hide their pieces from this very view already.)
  for (const z of gs.fogZones ?? []) {
    if (z.owner !== me) continue
    for (const sq of z.cells) {
      const p = gs.pieces[sq]
      if (!p || p.color !== me) continue
      const v = p.type === 'king' ? 3 : pieceValue(p, V)
      s += 0.12 * v + (theirs.map.has(sq) ? 0.45 * v : 0)
    }
  }
  // Cards still in hand have option value — so the AI only spends one when
  // it actually gains more than holding it.
  s += handValue(gs, me) - handValue(gs, them)
  return s
}

// Value the victim would lose if meteor `m` landed now (via the real
// tickMeteors). A king's loss counts as the round.
function strikeLoss(gs, m, victim, V) {
  const { pieces } = chess.tickMeteors(gs.pieces, [m], opp(m.owner))
  const after = pieces[m.square]
  const full = victim.type === 'king' ? 8 : pieceValue(victim, V)
  if (!after) return full
  if ((after.hp ?? 1) < (victim.hp ?? 1)) return victim.type === 'king' ? 4 : full * 0.4
  return 0
}

// Holding a card has option value — but the SAME for every card. It used to
// scale with the price, which made the AI hoard expensive cards and dump
// cheap ones: a sunk cost changing how it plays, so re-pricing a card
// changed its measured strength for the wrong reason.
export const HAND_VALUE = 0.6
export function handValue(gs, color) {
  return HAND_VALUE * (gs.cards?.[color]?.hand?.length ?? 0)
}

// Which of `me`'s pieces an enemy meteor that just appeared is most likely
// aimed at: the one a strike would hurt most, as the engine itself rules it
// (so e.g. kings being immune is respected automatically).
export function likeliestMeteorTarget(gs, me, V = DEFAULT_VALUES) {
  let best = null, bestLoss = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color !== me) continue
    const loss = strikeLoss(gs, { owner: opp(me), square: sq, turnsLeft: 1 }, p, V)
    if (loss > bestLoss) { bestLoss = loss; best = sq }
  }
  return best
}

// Endgame drive: with a clear material edge, close in on the enemy king and
// take its squares away, and don't shuffle (the 50-move counter running up
// while winning is a wasted win). Without this the AI drew far too many
// won positions, which no human would.
function huntTerm(gs, hunter, prey, edge) {
  const k = kingSquare(gs, prey)
  if (!k) return 0
  let s = 0
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color === hunter && p.type !== 'king') s -= 0.08 * dist(sq, k)
  }
  s -= 0.25 * chess.getLegalMoves(gs, k).length
  s -= 0.03 * (gs.halfMoveClock ?? 0)
  return s * Math.min(1, edge / 4)
}
