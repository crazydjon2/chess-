// Draft prices of the pieces. Tuned with the balance lab (tools/balance) —
// not derived from classical chess values: when taking the king wins, long-
// range pieces are worth far more than their chess value on these boards.
export const SHOP_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen']
export const SHOP_PRICES = { pawn: 4, knight: 9, bishop: 9, rook: 17, queen: 28 }
export function shopPieceCost(type) {
  return SHOP_PRICES[type] ?? 0
}

export const PIECE_GLYPHS = {
  white: { king: '♔', pawn: '♙', rook: '♖', knight: '♘', bishop: '♗', queen: '♕' },
  black: { king: '♚', pawn: '♟', rook: '♜', knight: '♞', bishop: '♝', queen: '♛' },
}

export const PIECE_LABEL = { pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь', king: 'Король' }

// King is last/rarest to lose in classical mode (can't happen there at
// all), but draft mode's elimination ruleset lets kings be captured like
// anything else, so it needs a slot in the capture-order display too.
export const CAPTURE_ORDER = ['queen', 'rook', 'bishop', 'knight', 'pawn', 'king']

// Captured = genuine captures read straight out of moveHistory, not a
// before/after snapshot diff — a diff would misfire in two cases: a
// promoted pawn "disappearing" from the pawn count (it's not captured, just
// upgraded) and a smoke_screen-hidden piece being invisible in a redacted
// view (it's not captured, just fogged). History only ever records a real
// capture, so neither case can be mistaken for one. A meteor kill counts
// too (see chess.js's applyMove, which folds tickMeteors' strikes in here
// alongside the move's own capture) — a piece is just as gone whether a
// meteor or a direct move ended it.
export function getCaptured(gameState, color) {
  return (gameState.moveHistory ?? [])
    .filter(m => m.captured && m.captured.color === color)
    .map(m => m.captured.type)
}
