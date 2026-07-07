// Chess logic: pseudo-legal generation → legal filtering (king safety) → game result
import { PIECE_VALUE } from './economy.js'

function squareToPos(sq) {
  return { col: sq.charCodeAt(0) - 97, rank: parseInt(sq.slice(1)) }
}

// Returns the square name if (col, rank) is in the valid square set, else null
function sqOrNull(col, rank, validSquares) {
  if (col < -10 || col > 34 || rank < -10 || rank > 34) return null
  const sq = `${String.fromCharCode(97 + col)}${rank}`
  return validSquares.has(sq) ? sq : null
}

// All playable squares: rectangle + extraCells − blockedCells, except an
// extraCell explicitly reclaims its square even if it's one of the map's
// blocked holes — add_cell is a paid, deliberate action, so casting it on a
// blocked cell actually reopens that hole instead of silently doing nothing.
// Barricades (the card) occupy a square as a neutral piece rather than using
// this set — they block movement like any piece would, but stay capturable.
// blockedCells here is for *static map patterns* (draft-mode board shapes,
// fixed for the whole round) — not player-toggleable on their own, so they
// can't be abused to wall a king in the way the old remove_cell card could.
export function getValidSquares(board) {
  const { size: { rows, cols }, extraCells = [], blockedCells = [] } = board
  const blocked = new Set(blockedCells)
  const extra   = new Set(extraCells)
  const valid   = new Set()
  for (let r = 1; r <= rows; r++)
    for (let c = 0; c < cols; c++) {
      const sq = `${String.fromCharCode(97 + c)}${r}`
      if (!blocked.has(sq) || extra.has(sq)) valid.add(sq)
    }
  extraCells.forEach(sq => valid.add(sq))
  return valid
}

const ROOK_DIRS    = [[0,1],[0,-1],[1,0],[-1,0]]
const BISHOP_DIRS  = [[1,1],[1,-1],[-1,1],[-1,-1]]
const QUEEN_DIRS   = [...ROOK_DIRS, ...BISHOP_DIRS]
const KNIGHT_JUMPS = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]
const KING_DIRS    = QUEEN_DIRS

function sliding(pieces, sq, piece, validSquares, dirs) {
  const { col, rank } = squareToPos(sq)
  const moves = []
  for (const [dc, dr] of dirs) {
    let c = col + dc, r = rank + dr
    while (true) {
      const target = sqOrNull(c, r, validSquares)
      if (!target) break
      const occ = pieces[target]
      if (occ) { if (occ.color !== piece.color) moves.push(target); break }
      moves.push(target)
      c += dc; r += dr
    }
  }
  return moves
}

function pawnMoves(pieces, sq, piece, validSquares, startRank) {
  const { col, rank } = squareToPos(sq)
  const dir  = piece.color === 'white' ? 1 : -1
  const moves = []

  const fwd1 = sqOrNull(col, rank + dir, validSquares)
  if (fwd1 && !pieces[fwd1]) {
    moves.push(fwd1)
    if (rank === startRank) {
      const fwd2 = sqOrNull(col, rank + 2 * dir, validSquares)
      if (fwd2 && !pieces[fwd2]) moves.push(fwd2)
    }
  }

  for (const dc of [-1, 1]) {
    const cap = sqOrNull(col + dc, rank + dir, validSquares)
    if (cap) {
      const occ = pieces[cap]
      if (occ && occ.color !== piece.color) moves.push(cap)
    }
  }

  return moves
}

// UI-ONLY convenience — NEVER folded into getLegalMoves/pseudoLegal, which
// stay a single source of truth run verbatim by both client and server.
// The server's own copy of gameState is never redacted, so it always knows
// the real occupant of every square and needs no help here; this exists
// purely so the CLIENT's move-highlighting doesn't silently refuse to even
// attempt a pawn's diagonal capture into a square whose occupant has been
// hidden by the opponent's smoke_screen. Locally that square looks empty,
// so pawnMoves correctly won't offer it (a pawn can't move diagonally into
// genuinely empty space) — but there might really be a piece there, so the
// UI offers it as a click target and lets the server confirm or reject the
// attempt with its full, unredacted board.
export function getFogCaptureSquares(gameState, square) {
  const piece = gameState.pieces[square]
  if (!piece || piece.type !== 'pawn' || piece.frozen) return []
  const { col, rank } = squareToPos(square)
  const dir = piece.color === 'white' ? 1 : -1
  const validSquares = getValidSquares(gameState.board)
  const zones = (gameState.fogZones ?? []).filter(z => z.owner !== piece.color)
  if (zones.length === 0) return []
  const out = []
  for (const dc of [-1, 1]) {
    const cap = sqOrNull(col + dc, rank + dir, validSquares)
    if (!cap || gameState.pieces[cap]) continue // already visible — pawnMoves already handles it
    if (zones.some(z => z.cells.includes(cap))) out.push(cap)
  }
  return out
}

function jumpMoves(pieces, sq, piece, validSquares, jumps) {
  const { col, rank } = squareToPos(sq)
  return jumps
    .map(([dc, dr]) => sqOrNull(col + dc, rank + dr, validSquares))
    .filter(t => t && pieces[t]?.color !== piece.color)
}

function pseudoLegal(gameState, square) {
  const piece = gameState.pieces[square]
  if (!piece) return []
  const validSquares = getValidSquares(gameState.board)
  const startRank    = piece.color === 'white' ? 2 : gameState.board.size.rows - 1

  switch (piece.type) {
    case 'pawn':   return pawnMoves(gameState.pieces, square, piece, validSquares, startRank)
    case 'rook':   return sliding(gameState.pieces, square, piece, validSquares, ROOK_DIRS)
    case 'bishop': return sliding(gameState.pieces, square, piece, validSquares, BISHOP_DIRS)
    case 'queen':  return sliding(gameState.pieces, square, piece, validSquares, QUEEN_DIRS)
    case 'knight': return jumpMoves(gameState.pieces, square, piece, validSquares, KNIGHT_JUMPS)
    case 'king':   return jumpMoves(gameState.pieces, square, piece, validSquares, KING_DIRS)
    default:       return []
  }
}

function findKing(pieces, color) {
  return Object.keys(pieces).find(sq => pieces[sq].color === color && pieces[sq].type === 'king')
}

// Simulate a move for king-safety checks. Must mirror applyMove's bounce
// semantics: capturing an hp>1 piece doesn't relocate the attacker (it
// bounces back, the target just loses 1 hp and stays put) — otherwise this
// simulation could "resolve" a check that a real move never actually would,
// letting a king-exposing move slip through as legal.
function simulateMove(gameState, from, to) {
  const piece  = gameState.pieces[from]
  const target = gameState.pieces[to]
  const pieces = { ...gameState.pieces }
  if (target && target.hp > 1) {
    pieces[to] = { ...target, hp: target.hp - 1 }
  } else {
    delete pieces[from]
    pieces[to] = piece
  }
  return { ...gameState, pieces }
}

export function isKingInCheck(gameState, color) {
  const kingSq   = findKing(gameState.pieces, color)
  if (!kingSq) return false
  const opponent = color === 'white' ? 'black' : 'white'
  return Object.keys(gameState.pieces).some(sq => {
    if (gameState.pieces[sq].color !== opponent) return false
    return pseudoLegal(gameState, sq).includes(kingSq)
  })
}

// Legal moves: pseudo-legal filtered to exclude moves that leave own king in
// check — except in elimination mode (draft-mode battles), where the king
// is just another piece with no special safety rule, since the win
// condition there is wiping out the opponent's whole army, not checkmate.
export function getLegalMoves(gameState, square) {
  const piece = gameState.pieces[square]
  if (!piece) return []
  if (piece.frozen) return []
  if (gameState.eliminationMode) return pseudoLegal(gameState, square)
  return pseudoLegal(gameState, square).filter(to => {
    return !isKingInCheck(simulateMove(gameState, square, to), piece.color)
  })
}

function hasAnyLegalMove(gameState, color) {
  return Object.keys(gameState.pieces).some(sq => {
    if (gameState.pieces[sq].color !== color) return false
    return getLegalMoves(gameState, sq).length > 0
  })
}

function squareToPosFn(sq) {
  return { col: sq.charCodeAt(0) - 97, rank: parseInt(sq.slice(1)) }
}

function isInsufficientMaterial(gameState) {
  const all   = Object.values(gameState.pieces)
  const white = all.filter(p => p.color === 'white')
  const black = all.filter(p => p.color === 'black')
  const minor = p => p.type === 'bishop' || p.type === 'knight'
  if (white.length === 1 && black.length === 1) return true
  if (white.length === 2 && black.length === 1 && white.some(minor)) return true
  if (black.length === 2 && white.length === 1 && black.some(minor)) return true
  if (white.length === 2 && black.length === 2) {
    const wb = Object.entries(gameState.pieces).find(([, p]) => p.color === 'white' && p.type === 'bishop')
    const bb = Object.entries(gameState.pieces).find(([, p]) => p.color === 'black' && p.type === 'bishop')
    if (wb && bb) {
      const { col: wc, rank: wr } = squareToPosFn(wb[0])
      const { col: bc, rank: br } = squareToPosFn(bb[0])
      if ((wc + wr) % 2 === (bc + br) % 2) return true
    }
  }
  return false
}

function materialValue(gameState, color) {
  return Object.values(gameState.pieces)
    .filter(p => p.color === color)
    .reduce((sum, p) => sum + (PIECE_VALUE[p.type] || 0), 0)
}

// Whenever the game can't resolve itself by wiping out an army, material
// decides instead of defaulting to a draw — being stuck with no legal move
// (no king/check here, so it's not a defensive stalemate — it's just a
// jammed position) or running out the move clock are both "the game can't
// continue naturally" situations, not neutral ones, so whoever has more
// material on the board wins. Only an exact material tie is a real draw.
function materialDecision(gameState, type) {
  const whiteValue = materialValue(gameState, 'white')
  const blackValue = materialValue(gameState, 'black')
  if (whiteValue === blackValue) return { type: 'draw', reason: type }
  return { type, winner: whiteValue > blackValue ? 'white' : 'black' }
}

// Elimination mode: the king has no special status, so the only way to win
// is wiping out every one of the opponent's pieces. Avoids the "instant
// checkmate straight out of hidden placement" problem checkmate-based rules
// have here — two sides place armies without seeing each other, so a king
// can easily end up placed into an already-losing line of fire with no
// chance to react.
//
// `moveLimit` (draft mode only) forces a decision by material value once
// hit, rather than letting a round drag on indefinitely — a full wipeout
// isn't always achievable with the small armies these skirmishes start
// with, so there needs to be a clock.
function getEliminationResult(gameState) {
  const white = Object.values(gameState.pieces).filter(p => p.color === 'white').length
  const black = Object.values(gameState.pieces).filter(p => p.color === 'black').length
  if (white === 0 && black === 0) return { type: 'draw', reason: 'mutual_elimination' }
  if (white === 0) return { type: 'elimination', winner: 'black' }
  if (black === 0) return { type: 'elimination', winner: 'white' }
  if (!hasAnyLegalMove(gameState, gameState.turn)) return materialDecision(gameState, 'no_moves')

  if (gameState.moveLimit && (gameState.moveHistory?.length ?? 0) >= gameState.moveLimit) {
    return materialDecision(gameState, 'move_limit')
  }

  if ((gameState.halfMoveClock ?? 0) >= 100) return { type: 'draw', reason: '50_move_rule' }
  return null
}

// Returns game result for display, or null if game continues
export function getGameResult(gameState) {
  if (gameState.eliminationMode) return getEliminationResult(gameState)

  const color = gameState.turn
  if (!hasAnyLegalMove(gameState, color)) {
    if (isKingInCheck(gameState, color)) {
      return { type: 'checkmate', winner: color === 'white' ? 'black' : 'white' }
    }
    return { type: 'stalemate' }
  }
  if (isInsufficientMaterial(gameState)) {
    return { type: 'draw', reason: 'insufficient_material' }
  }
  if ((gameState.halfMoveClock ?? 0) >= 100) {
    return { type: 'draw', reason: '50_move_rule' }
  }
  return null
}

// Counts down the frozen turns remaining on every piece of `color` by one,
// clearing the flag once it hits zero. `frozen` is a number of turns left
// (falsy/0 = not frozen), not a boolean — freeze sets it to N and this
// ticks it down. Must run at the end of that color's turn no matter what
// the turn was spent on — a move, a card play, or a shop purchase —
// otherwise a frozen piece can outlast its intended duration if the frozen
// side spends a turn on anything other than moving (freeze has no hook
// into non-move actions).
export function unfreezeColor(pieces, color) {
  let changed = false
  const next = { ...pieces }
  Object.keys(next).forEach(sq => {
    const p = next[sq]
    if (p?.color === color && p?.frozen) {
      const remaining = p.frozen - 1
      next[sq] = { ...p, frozen: remaining > 0 ? remaining : false }
      changed = true
    }
  })
  return changed ? next : pieces
}

// Counts down a temporary +1 HP buff (hp_boost card) by one of the boosted
// piece owner's own turns, same cadence as unfreezeColor. If the timer runs
// out while the bonus HP is still unspent (never absorbed a hit), it's
// removed — but if the piece already survived a hit in the meantime, its HP
// dropped back to base already, so there's nothing left to claw back.
export function tickHpBoost(pieces, color) {
  let changed = false
  const next = { ...pieces }
  Object.keys(next).forEach(sq => {
    const p = next[sq]
    if (p?.color === color && p?.hpBoostTurns) {
      changed = true
      const remaining = p.hpBoostTurns - 1
      if (remaining > 0) {
        next[sq] = { ...p, hpBoostTurns: remaining }
        return
      }
      const { hpBoostTurns, ...rest } = p
      next[sq] = p.hp > 1 ? { ...rest, hp: p.hp - 1 } : rest
    }
  })
  return changed ? next : pieces
}

// Counts down every active fog zone (smoke_screen) by one turn, dropping
// zones that have expired. Must run at the end of every turn, same as
// unfreezeColor — see its comment for why (move, card play, and shop
// purchase are all "a turn ending" and none of them should be missed).
export function tickFogZones(fogZones) {
  return (fogZones ?? [])
    .map(z => ({ ...z, turnsLeft: z.turnsLeft - 1 }))
    .filter(z => z.turnsLeft > 0)
}

// Meteor (see cardEffects.js) detonates after 2 FULL moves have passed
// since casting — not 2 plies — so this deliberately ticks meteors owned
// by the OTHER color, not `movedColor`: the caster's own residual move
// this same turn (cards don't end the turn) must never count as progress,
// only the opponent's moves bring it closer to landing. One consequence:
// your own move ticks down the OPPONENT's pending meteors, never your own.
// `strikes` reports every detonation this call caused (square + whatever
// was destroyed there, or null on a miss) — the location was secret up to
// this point, but the impact itself is never hidden from either player
// (see gameEngine.js/rooms.js, which broadcast it unredacted for the
// explosion animation both sides are meant to see).
export function tickMeteors(pieces, meteors, movedColor) {
  let nextPieces = pieces
  const nextMeteors = []
  const strikes = []
  ;(meteors ?? []).forEach(m => {
    if (m.owner === movedColor) { nextMeteors.push(m); return }
    const remaining = m.turnsLeft - 1
    if (remaining > 0) { nextMeteors.push({ ...m, turnsLeft: remaining }); return }
    // Detonates now — destroy whatever ended up on the target square, if
    // anything (the intended victim may well have simply moved away).
    const destroyed = nextPieces[m.square] ?? null
    if (destroyed) {
      if (nextPieces === pieces) nextPieces = { ...pieces }
      delete nextPieces[m.square]
    }
    strikes.push({ square: m.square, destroyed })
  })
  return { pieces: nextPieces, meteors: nextMeteors, strikes }
}

export const PROMOTION_TYPES = ['queen', 'rook', 'bishop', 'knight']

function promotionRank(board, color) {
  return color === 'white' ? board.size.rows : 1
}

// True if this pawn move lands it on the far rank — i.e. a promotion choice
// is needed before the move can be finalized. False for the hp-bounce case
// (the pawn stays on `from` and never actually reaches `to`).
export function needsPromotion(gameState, from, to) {
  const piece = gameState.pieces[from]
  if (!piece || piece.type !== 'pawn') return false
  const target = gameState.pieces[to]
  if (target && target.hp > 1) return false
  return parseInt(to.slice(1)) === promotionRank(gameState.board, piece.color)
}

// Apply a move to produce the next game state.
// Pieces with hp > 1 survive their first capture (attacker stays put).
// `promotion` (queen/rook/bishop/knight) applies when a pawn reaches the far
// rank — defaults to queen if omitted or invalid.
export function applyMove(gameState, from, to, promotion) {
  const piece  = gameState.pieces[from]
  const target = gameState.pieces[to]
  const movedPieces = { ...gameState.pieces }
  delete movedPieces[from]

  const captured = target && target.hp <= 1

  if (target && target.hp > 1) {
    movedPieces[from] = piece
    movedPieces[to]   = { ...target, hp: target.hp - 1 }
  } else if (piece.type === 'pawn' && parseInt(to.slice(1)) === promotionRank(gameState.board, piece.color)) {
    const type = PROMOTION_TYPES.includes(promotion) ? promotion : 'queen'
    movedPieces[to] = { ...piece, type }
  } else {
    movedPieces[to] = piece
  }

  const boostedPieces = tickHpBoost(unfreezeColor(movedPieces, gameState.turn), gameState.turn)
  const { pieces, meteors, strikes: meteorStrikes } = tickMeteors(boostedPieces, gameState.meteors, gameState.turn)
  const fogZones = tickFogZones(gameState.fogZones)

  const halfMoveClock = (piece.type === 'pawn' || captured)
    ? 0
    : (gameState.halfMoveClock ?? 0) + 1

  const moveHistory = [
    ...(gameState.moveHistory ?? []),
    { from, to, piece, captured: captured ? target : null },
  ]

  return {
    ...gameState,
    pieces,
    fogZones,
    meteors,
    turn: gameState.turn === 'white' ? 'black' : 'white',
    halfMoveClock,
    moveHistory,
    // Transient — not real persisted game state, just this call's report of
    // any meteor detonations it caused. gameEngine.js's tryMove reads this
    // off the result and strips it before storing/returning the state.
    meteorStrikes,
  }
}
