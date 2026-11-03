// Chess logic: pseudo-legal generation → legal filtering (king safety) → game result

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
//
// Cached per board object: boards are never mutated in place (every change
// — add_cell, a new round — builds a new board object), so the same object
// always yields the same set. Move generation calls this for every piece,
// which made it the hottest path in the engine. The returned Set is shared:
// callers must only read it.
const validSquaresCache = new WeakMap()
export function getValidSquares(board) {
  let valid = validSquaresCache.get(board)
  if (!valid) {
    valid = computeValidSquares(board)
    validSquaresCache.set(board, valid)
  }
  return valid
}

function computeValidSquares(board) {
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

// Exported so cards.js can use it to check whether playing a card would
// rescue a player who otherwise has no legal move — see its hasRescueCard.
export function hasAnyLegalMove(gameState, color) {
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

// Draft-mode rules ("king capture"): the king moves like a normal piece
// with no check/checkmate/stalemate safety rules — it may step into attack
// like anything else — and TAKING it wins the round outright, whether by a
// move or a meteor (both land in moveHistory as a capture, see applyMove).
// Wiping out a whole army still counts too (it's how armies without a king
// — sandbox/test setups — can end).
//
// Both "the game can't continue naturally" cases — a jammed position with
// no legal move, or a clock hitting zero — are flat, decisive losses for
// whoever it happened to, never a material tiebreak and never a draw.
function getEliminationResult(gameState) {
  const kingLost = color => (gameState.moveHistory ?? []).some(m => m.captured?.type === 'king' && m.captured.color === color)
  const whiteKingLost = kingLost('white')
  const blackKingLost = kingLost('black')
  if (whiteKingLost && blackKingLost) return { type: 'draw', reason: 'mutual_king' }
  if (whiteKingLost) return { type: 'king_captured', winner: 'black' }
  if (blackKingLost) return { type: 'king_captured', winner: 'white' }

  const white = Object.values(gameState.pieces).filter(p => p.color === 'white').length
  const black = Object.values(gameState.pieces).filter(p => p.color === 'black').length
  if (white === 0 && black === 0) return { type: 'draw', reason: 'mutual_elimination' }
  if (white === 0) return { type: 'elimination', winner: 'black' }
  if (black === 0) return { type: 'elimination', winner: 'white' }

  if (gameState.timers) {
    if (gameState.timers.white <= 0) return { type: 'timeout', winner: 'black' }
    if (gameState.timers.black <= 0) return { type: 'timeout', winner: 'white' }
  }

  if (!hasAnyLegalMove(gameState, gameState.turn)) {
    return { type: 'no_moves', winner: gameState.turn === 'white' ? 'black' : 'white' }
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

// Counts down every active fog zone (smoke_screen) by one turn, dropping
// zones that have expired — but, like tickMeteors, only on the ZONE OWNER'S
// OPPONENT's move. Ticking on every ply regardless of color (the old
// behavior) meant the caster's own moves ate into their own cover, so a
// 4-turn zone only ever survived 2 of the caster's own moves — and since
// moving is exactly what combat requires, any fight that broke out inside
// the zone reliably burned through the timer right around then, reading as
// "the fog vanishes as soon as a piece engages." Skipping the owner's own
// move (same "your own residual move this turn never counts" rule
// tickMeteors already uses) means only the OPPONENT's moves can wear the
// zone down, so the caster's own actions inside it are never self-defeating.
export function tickFogZones(fogZones, movedColor) {
  return (fogZones ?? [])
    .map(z => (z.owner === movedColor ? z : { ...z, turnsLeft: z.turnsLeft - 1 }))
    .filter(z => z.turnsLeft > 0)
}

// Every type a piece can shapeshift into while "unstable" (see
// cardEffects.js). No 'king' — kings can never be targeted (see cards.js),
// and one appearing/vanishing mid-effect would decide the round. No 'pawn'
// either — a piece shifted into a pawn could walk onto the far rank and
// promote, turning a temporary effect into a permanent new queen.
export const UNSTABLE_TYPES = ['knight', 'bishop', 'rook', 'queen']

// What `unstable.nextType` should preview after a shift lands: if the
// FOLLOWING event (2 ticks away) is the final revert rather than another
// shift, the honest preview is the real original type, not another random
// guess — see tickUnstablePieces below.
function rollNextType(currentType, remainingAfterThisShift, originalType) {
  if (remainingAfterThisShift - 2 <= 0) return originalType
  const pool = UNSTABLE_TYPES.filter(t => t !== currentType)
  return pool[Math.floor(Math.random() * pool.length)]
}

// Ticks every piece currently marked `.unstable` (see cardEffects.js) by one
// turn. Shifts only happen every OTHER tick (odd `remaining`) — a "hold"
// tick in between just counts down — so a 6-turn effect is 3 actual
// shapeshifts, not 6; the type it's about to become is always known ahead
// of time via `unstable.nextType` (set at cast, refreshed after each shift)
// so neither side is ever blindsided. Once the timer runs out, snaps back
// to whatever it originally was and clears the flag. Must run on every
// move, same as tickFogZones/unfreezeColor — see their comments for why
// (move, card play, and shop purchase are all "a turn ending", and cards
// themselves never tick anything).
export function tickUnstablePieces(pieces) {
  let changed = false
  const next = { ...pieces }
  Object.keys(next).forEach(sq => {
    const p = next[sq]
    if (!p?.unstable) return
    changed = true
    const remaining = p.unstable.turnsLeft - 1
    if (remaining <= 0) {
      const { unstable, ...reverted } = p
      next[sq] = { ...reverted, type: p.unstable.originalType }
    } else if (remaining % 2 === 1) {
      const type = p.unstable.nextType
      next[sq] = {
        ...p, type,
        unstable: {
          ...p.unstable,
          turnsLeft: remaining,
          nextType: rollNextType(type, remaining, p.unstable.originalType),
        },
      }
    } else {
      next[sq] = { ...p, unstable: { ...p.unstable, turnsLeft: remaining } }
    }
  })
  return changed ? next : pieces
}

// Meteor (see cardEffects.js) detonates after 2 FULL moves have passed
// since casting — not 2 plies — so this deliberately ticks meteors owned
// by the OTHER color, not `movedColor`: the caster's own residual move
// this same turn (cards don't end the turn) must never count as progress,
// only the opponent's moves bring it closer to landing. One consequence:
// your own move ticks down the OPPONENT's pending meteors, never your own.
// `strikes` reports every detonation this call caused (square, whatever was
// destroyed there or null on a miss or a mere 1-HP hit, and the meteor's owner) — the location
// was secret up to this point, but the impact itself is never hidden from
// either player (see gameEngine.js/rooms.js, which broadcast it unredacted
// for the explosion animation both sides are meant to see). `owner` lets
// applyMove (below) credit the kill as a genuine capture — a piece is just
// as dead whether a meteor or a direct move ended it, so it counts the
// same as any other capture (the captured tray).
export function tickMeteors(pieces, meteors, movedColor) {
  let nextPieces = pieces
  const nextMeteors = []
  const strikes = []
  ;(meteors ?? []).forEach(m => {
    if (m.owner === movedColor) { nextMeteors.push(m); return }
    const remaining = m.turnsLeft - 1
    if (remaining > 0) { nextMeteors.push({ ...m, turnsLeft: remaining }); return }
    // Detonates now — hits whatever ended up on the target square, if
    // anything (the intended victim may well have simply moved away). A hit
    // takes 1 HP, same as any attack: an hp>1 piece (shield, barricade)
    // just loses a point and stays; `destroyed` is only set on a real kill.
    // Kings are immune: a hidden, unanswerable shot at the king turned the
    // card into a coin-flip round winner (balance lab: 69% of games where
    // it was bought ended with the meteor killing the king).
    const hit = nextPieces[m.square] ?? null
    let destroyed = null
    if (hit && hit.type !== 'king') {
      if (nextPieces === pieces) nextPieces = { ...pieces }
      if (hit.hp > 1) {
        nextPieces[m.square] = { ...hit, hp: hit.hp - 1 }
      } else {
        delete nextPieces[m.square]
        destroyed = hit
      }
    }
    strikes.push({ square: m.square, destroyed, owner: m.owner })
  })
  return { pieces: nextPieces, meteors: nextMeteors, strikes }
}

export const PROMOTION_TYPES = ['queen', 'rook', 'bishop', 'knight']

export function promotionRank(board, color) {
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

// A hidden freeze mine (see cardEffects.js) detonates the instant an ENEMY
// piece (relative to the mine's owner) actually lands on its square — not
// on a bounce, where the attacker stays on `from` and never really arrives.
// Runs AFTER unfreezeColor below rather than folded into movedPieces before
// it: unfreezeColor clears out frozen counters for the
// color whose turn this is, and the piece that just triggered the mine IS
// that color, so setting frozen too early would have it wiped by the same
// call that's meant to make it stick for the mover's own next turn.
function triggerMine(pieces, mines, to, landed, moverColor) {
  const current = mines ?? []
  const mine = landed ? current.find(m => m.square === to && m.owner !== moverColor) : null
  if (!mine) return { pieces, mines: current, strike: null }
  return {
    pieces: { ...pieces, [to]: { ...pieces[to], frozen: 1 } },
    mines: current.filter(m => m !== mine),
    strike: { square: to, owner: mine.owner },
  }
}

// Apply a move to produce the next game state.
// Pieces with hp > 1 survive their first capture (attacker stays put).
// `promotion` (queen/rook/bishop/knight) applies when a pawn reaches the far
// rank — defaults to queen if omitted or invalid. `now` (ms, defaults to
// the real clock) is when this move actually landed — used to charge the
// mover's own clock (see `timers`) for however long they just took;
// accepted explicitly so tests can drive it deterministically instead of
// depending on wall-clock timing.
export function applyMove(gameState, from, to, promotion, now = Date.now()) {
  const piece  = gameState.pieces[from]
  const target = gameState.pieces[to]
  const movedPieces = { ...gameState.pieces }
  delete movedPieces[from]

  const captured = target && target.hp <= 1
  const bounced  = target && target.hp > 1

  if (bounced) {
    movedPieces[from] = piece
    movedPieces[to]   = { ...target, hp: target.hp - 1 }
  } else if (piece.type === 'pawn' && parseInt(to.slice(1)) === promotionRank(gameState.board, piece.color)) {
    const type = PROMOTION_TYPES.includes(promotion) ? promotion : 'queen'
    // Always a real pawn — unstable pieces never shift into one (see
    // UNSTABLE_TYPES), so there's no shapeshifting state to settle here.
    movedPieces[to] = { ...piece, type }
  } else {
    movedPieces[to] = piece
  }

  const unfrozenPieces = unfreezeColor(movedPieces, gameState.turn)
  const { pieces: minedPieces, mines, strike: mineStrike } =
    triggerMine(unfrozenPieces, gameState.mines, to, !bounced, gameState.turn)
  const { pieces: meteredPieces, meteors, strikes: meteorStrikes } = tickMeteors(minedPieces, gameState.meteors, gameState.turn)
  const pieces = tickUnstablePieces(meteredPieces)
  const fogZones = tickFogZones(gameState.fogZones, gameState.turn)

  const halfMoveClock = (piece.type === 'pawn' || captured)
    ? 0
    : (gameState.halfMoveClock ?? 0) + 1

  // A meteor strike is just as much a capture as landing on the square
  // yourself — see tickMeteors' comment — so every detonation this move
  // caused gets its own moveHistory entry alongside the move's own, keyed
  // the same way (`captured` holds the destroyed piece) so getCaptured
  // picks it up without needing to know meteors exist at all.
  // Friendly fire (meteor destroys its own owner's piece) still gets an
  // entry — getCaptured keys off the VICTIM's color, not the
  // meteor's owner, so it correctly attributes to whoever actually lost it.
  const meteorCaptures = meteorStrikes
    .filter(s => s.destroyed)
    .map(s => ({ from: null, to: s.square, piece: null, captured: s.destroyed, cause: 'meteor' }))

  const moveHistory = [
    ...(gameState.moveHistory ?? []),
    { from, to, piece, captured: captured ? target : null },
    ...meteorCaptures,
  ]

  // Charge the MOVER (gameState.turn, before the flip below) for however
  // long they actually took, then — same as a real Fischer clock — add
  // back the round's increment (see draftPools.js's TIME_INCREMENT_BY_ROUND)
  // as a flat per-move bonus. The increment only applies if they genuinely
  // still had time left the instant this move landed: if elapsed already
  // consumed (or exceeded) their remaining clock, `remaining` is <= 0, the
  // final clamp bottoms it out at exactly 0 with NO bonus added, and
  // getGameResult's timeout check (timers.color <= 0) still fires — the
  // increment must never be able to paper over an actual flag fall.
  let timers = gameState.timers
  if (timers) {
    const elapsedSeconds = Math.max(0, (now - gameState.turnStartedAt) / 1000)
    const remaining = timers[gameState.turn] - elapsedSeconds
    const increment = remaining > 0 ? (gameState.timerIncrement ?? 0) : 0
    timers = { ...timers, [gameState.turn]: Math.max(0, remaining) + increment }
  }

  return {
    ...gameState,
    pieces,
    mines,
    fogZones,
    meteors,
    turn: gameState.turn === 'white' ? 'black' : 'white',
    halfMoveClock,
    moveHistory,
    timers,
    turnStartedAt: timers ? now : gameState.turnStartedAt,
    // Transient — not real persisted game state, just this call's report of
    // any meteor/mine detonations it caused. gameEngine.js's tryMove reads
    // these off the result and strips them before storing/returning state.
    meteorStrikes,
    mineStrike,
  }
}

// Appends one entry to gameState.actionLog — the scrubbable battle-log
// history (see rendering/BattleLog.jsx and rooms.js's per-viewer
// redaction). Snapshots exactly the fields a viewer's redaction needs to
// reconstruct what THEY were allowed to see at this point in time —
// pieces/meteors/mines get redacted per viewer same as the live board;
// fogZones themselves are public metadata (only what's INSIDE a zone is
// secret — see cardEffects.js), so they're stored as-is.
export function appendLogEntry(gameState, entry) {
  const snapshot = {
    pieces: gameState.pieces,
    fogZones: gameState.fogZones ?? [],
    meteors: gameState.meteors ?? [],
    mines: gameState.mines ?? [],
  }
  return {
    ...gameState,
    actionLog: [...(gameState.actionLog ?? []), { ...entry, snapshot }],
  }
}
