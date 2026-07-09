import { homeRanks } from './boardPatterns.js'

function squareCol(sq) { return sq.charCodeAt(0) - 97 }
function squareRank(sq) { return parseInt(sq.slice(1), 10) }

// placementMap: { square: pieceType } — one entry per drafted piece (no
// king — draft mode has no king, see chess.js eliminationMode). Validates:
// every square is on the player's own home ranks, in bounds, not on a
// blocked map square, and the placed types exactly match what was drafted
// (multiset).
export function validatePlacement(boardPattern, color, placementMap, draftedPieceTypes) {
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
  const expected = [...draftedPieceTypes].sort()
  const actual   = [...placedTypes].sort()
  if (expected.length !== actual.length || expected.some((t, i) => t !== actual[i])) {
    return { error: 'Расставленные фигуры не совпадают с тем, что задрафтили' }
  }

  return { ok: true }
}

// { square: pieceType } -> { square: { type, color, hp } }
export function buildPlacementPieces(color, placementMap) {
  const out = {}
  Object.entries(placementMap).forEach(([sq, type]) => {
    out[sq] = { type, color, hp: 1 }
  })
  return out
}
