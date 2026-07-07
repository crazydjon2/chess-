// Shared draft pools per round — each round's actual pool is rolled fresh
// (not a fixed list), so replaying the same round number doesn't always
// offer the same pieces and cards. Composition is free-form weighted
// randomness — fairness is handled by price (see draftEngine.js's budget
// system), not by constraining what can roll, so a lucky/unlucky pool is
// genuine variety, not a fairness bug. (Earlier this session pieces/cards
// were forced into parity-safe counts to prevent a single scarce item from
// being a free turn-order windfall — once picks cost real budget, that
// windfall can't happen any more, so the constraint was removed in favor
// of replayability.)

// Relative weight of each piece type being drawn for any one of the
// round's guaranteed slots (see PIECE_POOL_SIZE below) — not a fixed
// count. A type missing from a round's table can never be drawn that
// round at all, which is what enforces the round-to-round escalation (no
// rooks/queen in round 1, no queen in round 2) — the *mix* within what's
// eligible, and whether a type shows up at all this round, is random.
const PIECE_WEIGHTS = {
  1: { pawn: 5, knight: 2, bishop: 2 },
  2: { pawn: 3, knight: 2, bishop: 2, rook: 2 },
  3: { pawn: 2, knight: 2, bishop: 2, rook: 2, queen: 1 },
}

// Every round's piece pool always totals exactly this many pieces — a
// guaranteed floor, never fewer and never more — with which types make up
// that count decided by PIECE_WEIGHTS above, redrawn each time.
const PIECE_POOL_SIZE = 10

// Of those PIECE_POOL_SIZE slots, this many are drawn from non-pawn types
// ONLY (see generatePiecePool) — a pure weighted draw over the full table
// (pawns included) could occasionally roll a near-all-pawn pool by chance,
// which technically satisfies "genuine variety" but makes for a very dull
// round with almost nothing worth drafting. Reserving a handful of
// non-pawn slots guarantees every round has real substance to pick from,
// while the remaining slots (drawn from the full table, pawns included)
// keep the composition random on top of that floor — the final non-pawn
// count is often higher than this minimum, never lower.
const GUARANTEED_NON_PAWN = 4

// cardId -> chance (0..1) this card is offered at all this round. Every
// card has some chance every round (nothing is hard-locked out) — a card
// that's rare early (like rollback/meteor) is just unlikely, not
// impossible.
const CARD_WEIGHTS = {
  1: { hp_boost: 0.75, barricade: 0.75, add_cell: 0.75, freeze: 0.6,  rollback: 0.15, smoke_screen: 0.5, meteor: 0.1 },
  2: { hp_boost: 0.4,  barricade: 0.75, add_cell: 0.65, freeze: 0.7,  rollback: 0.45, smoke_screen: 0.6, meteor: 0.3 },
  3: { hp_boost: 0.5,  barricade: 0.6,  add_cell: 0.3,  freeze: 0.75, rollback: 0.65, smoke_screen: 0.7, meteor: 0.5 },
}

// One weighted random pick among `weights` (plain {type: relativeWeight}).
function weightedPick(weights) {
  const entries = Object.entries(weights)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = Math.random() * total
  for (const [type, w] of entries) {
    if (roll < w) return type
    roll -= w
  }
  return entries[entries.length - 1][0] // float rounding fallback
}

// { pawn: 5, knight: 2, ... } — always PIECE_POOL_SIZE pieces total (at
// least GUARANTEED_NON_PAWN of them non-pawns, often more), mix drawn
// independently slot by slot so the same type can (and often will) come up
// more than once, or not at all.
export function generatePiecePool(round) {
  const weights = PIECE_WEIGHTS[round]
  const { pawn, ...nonPawnWeights } = weights
  const pool = {}

  for (let i = 0; i < GUARANTEED_NON_PAWN; i++) {
    const type = weightedPick(nonPawnWeights)
    pool[type] = (pool[type] || 0) + 1
  }
  for (let i = 0; i < PIECE_POOL_SIZE - GUARANTEED_NON_PAWN; i++) {
    const type = weightedPick(weights)
    pool[type] = (pool[type] || 0) + 1
  }
  return pool
}

// ['barricade', 'freeze', ...] — only the cards that rolled in this time.
export function generateCardPool(round) {
  const picked = Object.entries(CARD_WEIGHTS[round])
    .filter(([, chance]) => Math.random() < chance)
    .map(([id]) => id)
  if (picked.length === 0) picked.push('barricade')
  return picked
}

// Half-moves (single moves by either side, combined) before a round is
// forced to a material-based decision instead of dragging on. Starting
// values, roughly "~12/16/20 moves per player" scaled with board size and
// army size (rounds 2-3 carry over more pieces, so more moves are needed
// to actually resolve a fight) — tune if playtesting shows rounds ending
// too abruptly or dragging past the point of being interesting.
export const MOVE_LIMIT_BY_ROUND = { 1: 24, 2: 32, 3: 40 }

// Fair snake order — б1 ч2 б2 ч2 б1 ч2... — 5 picks each, no matter which
// color went first (color assignment happens at room level, not here).
export const DRAFT_TURN_ORDER = [
  'first', 'second', 'second', 'first',
  'first', 'second', 'second', 'first',
  'first', 'second',
]
