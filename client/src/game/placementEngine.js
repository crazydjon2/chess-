import { homeRanks } from './boardPatterns.js'

function squareCol(sq) { return sq.charCodeAt(0) - 97 }
function squareRank(sq) { return parseInt(sq.slice(1), 10) }

// placementMap: { square: pieceType } — one entry per drafted piece (no
// king — draft mode has no king, see chess.js eliminationMode). Validates:
// every square is on the player's own home ranks, in bounds, not on a
// blocked map square, and the placed types exactly match what was drafted
// (multiset). `partial` relaxes the last check to "no more of any type than
// was drafted" — the live, still-in-progress placement both players see
// while arranging (see matchEngine.js's tryUpdatePlacement).
export function validatePlacement(boardPattern, color, placementMap, draftedPieceTypes, { partial = false } = {}) {
  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  const [homeLo, homeHi] = homeRanks(rows, color)

  const squares = Object.keys(placementMap)

  for (const sq of squares) {
    const col  = squareCol(sq)
    const rank = squareRank(sq)
    // Number.isNaN guards a malformed key like "a" (no rank digit) — rank
    // would otherwise be NaN, which fails both `<` and `>` comparisons below
    // and silently slips past the home-rank check instead of being rejected.
    if (col < 0 || col >= cols || Number.isNaN(rank)) return { error: `Клетка ${sq} вне доски` }
    if (rank < homeLo || rank > homeHi) return { error: `${sq} не на твоей половине` }
    if (blocked.has(sq)) return { error: `${sq} заблокирована на этой карте` }
  }

  const placedTypes = squares.map(sq => placementMap[sq])
  if (partial) {
    const left = [...draftedPieceTypes]
    for (const t of placedTypes) {
      const idx = left.indexOf(t)
      if (idx === -1) return { error: 'Расставленные фигуры не совпадают с тем, что задрафтили' }
      left.splice(idx, 1)
    }
    return { ok: true }
  }
  const expected = [...draftedPieceTypes].sort()
  const actual   = [...placedTypes].sort()
  if (expected.length !== actual.length || expected.some((t, i) => t !== actual[i])) {
    return { error: 'Расставленные фигуры не совпадают с тем, что задрафтили' }
  }

  return { ok: true }
}

// Fills in whatever drafted pieces `placementMap` hasn't placed yet, each on
// a random free home square — what the placement timer does at zero (see
// matchEngine.js's forcePlacement). Home ranks always have room for every
// drafted piece (see draftEngine.js's maxPieces).
export function autoCompletePlacement(boardPattern, color, placementMap, draftedPieceTypes, rng = Math.random) {
  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  const [homeLo, homeHi] = homeRanks(rows, color)

  const left = [...draftedPieceTypes]
  Object.values(placementMap).forEach(t => {
    const idx = left.indexOf(t)
    if (idx !== -1) left.splice(idx, 1)
  })

  const free = []
  for (let r = homeLo; r <= homeHi; r++)
    for (let c = 0; c < cols; c++) {
      const sq = `${String.fromCharCode(97 + c)}${r}`
      if (!blocked.has(sq) && !placementMap[sq]) free.push(sq)
    }

  const out = { ...placementMap }
  left.forEach(type => {
    const sq = free.splice(Math.floor(rng() * free.length), 1)[0]
    out[sq] = type
  })
  return out
}

// Starting HP per piece type (anything not listed has 1). The king starts
// with 2: taking it wins the round, and with a single life one long-range
// shot across the board decided too many rounds — armies of a few
// queens/rooks beat everything (balance lab). The first hit bounces off,
// like hitting a barricade.
export const STARTING_HP = { king: 2 }

// { square: pieceType } -> { square: { type, color, hp } }
export function buildPlacementPieces(color, placementMap) {
  const out = {}
  Object.entries(placementMap).forEach(([sq, type]) => {
    out[sq] = { type, color, hp: STARTING_HP[type] ?? 1 }
  })
  return out
}
