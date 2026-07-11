// Coin reward for capturing a piece, keyed to classical chess values.
export const PIECE_VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 }

// Shop no longer sells cards — only reinforcement pieces, at double their
// capture value (buying a fresh queen mid-battle should cost real money).
export const SHOP_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen']
export const SHOP_PRICE_MULTIPLIER = 2
export function shopPieceCost(type) {
  return (PIECE_VALUE[type] || 0) * SHOP_PRICE_MULTIPLIER
}

export const PIECE_GLYPHS = {
  white: { king: '♔', pawn: '♙', rook: '♖', knight: '♘', bishop: '♗', queen: '♕' },
  black: { king: '♚', pawn: '♟', rook: '♜', knight: '♞', bishop: '♝', queen: '♛' },
}

export const PIECE_LABEL = { pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь' }

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
//
// A capture marked `revived` (see cardEffects.js's necromancy) is excluded
// — that piece is back on the board, not a casualty any more, so it
// shouldn't linger in a "captured" tray or stay offered as something left
// to revive.
export function getCaptured(gameState, color) {
  return (gameState.moveHistory ?? [])
    .filter(m => m.captured && m.captured.color === color && !m.captured.revived)
    .map(m => m.captured.type)
}
