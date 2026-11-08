import { BUDGET_BY_ROUND, DRAFT_TIME_BY_ROUND } from './draftPools.js'
import { SHOP_PIECE_TYPES, shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'
import { HOME_CAPACITY_BY_ROUND, homeRanks } from './boardPatterns.js'

// The full catalog — every piece type and every card is buyable from round
// 1 on, supply unlimited (buying one doesn't make it unavailable to the
// opponent or to you again). No bans, no rolled/scarce pool — the only
// things that limit what you can get are your own budget and the board's
// home-rank capacity (see submitPick below).
export const ALL_PIECE_TYPES = SHOP_PIECE_TYPES
export const ALL_CARD_IDS = Object.keys(CARD_DEFS)

// Each further copy of the SAME item a color buys THIS round costs more
// than the last — a "duplicate tax" on both pieces and cards, so stacking
// one strong item (several queens, several meteors) doesn't buy unlimited
// value at a flat price. The surcharge is a SHARE of the item's base price
// (rounded), not a flat coin: a flat +1 nearly doubled every extra pawn and
// made pawn-heavy armies unplayable, while barely touching a 2nd queen.
// Pawns are exempt: they're already capped by home-rank capacity, and
// taxing them made pawn walls unplayable.
// Tuned with the balance lab (tools/balance).
export const DUPLICATE_RATE = 0.25
export function duplicateStep(item) {
  if (item.kind === 'piece' && item.pieceType === 'pawn') return 0
  return Math.round(baseCost(item) * DUPLICATE_RATE)
}

export function targetKey(target) {
  return target.kind === 'piece' ? `piece:${target.pieceType}` : `card:${target.cardId}`
}

function opponentOf(color) {
  return color === 'white' ? 'black' : 'white'
}

function isValidCatalogTarget(target) {
  if (target?.kind === 'piece') return ALL_PIECE_TYPES.includes(target.pieceType)
  if (target?.kind === 'card') return ALL_CARD_IDS.includes(target.cardId)
  return false
}

function baseCost(item) {
  return item.kind === 'piece' ? shopPieceCost(item.pieceType) : CARD_DEFS[item.cardId].cost
}

function copiesOwned(draftState, color, item) {
  const picks = draftState.picks[color]
  return item.kind === 'piece'
    ? picks.pieces.filter(t => t === item.pieceType).length
    : picks.cards.filter(id => id === item.cardId).length
}

// What `color` would actually pay for their NEXT copy of `item` right now
// — see duplicateStep above. This is the price shown on the catalog tile
// and the price actually charged (see submitPick), always in sync since
// both read straight off the same live draftState.
export function nextItemCost(draftState, color, item) {
  return baseCost(item) + copiesOwned(draftState, color, item) * duplicateStep(item)
}

// `firstColor` decides who picks first this round — see rooms.js's
// swapPlayerColors: the physical player holding it alternates round to
// round even though the LABEL that goes first never changes (matchEngine.js
// keeps passing the same label through applyRoundResult), so first-pick
// advantage is already balanced across a match without any extra snake
// logic needed here.
//
// The budget is always the round's flat BUDGET_BY_ROUND — nothing persists
// between rounds (see matchEngine.js): every round is a fresh draft.
//
// Recruit ("Набор") = draft and placement in ONE turn-based phase: a piece
// is bought straight onto a free square of your home ranks (item.square),
// so the army is built on the board in full view of the opponent. `pattern`
// (the round's board) enables that; without it (old unit tests) pieces are
// bought without squares. Each player's FIRST action is placing their king
// (free, ends the turn); it can't be moved afterwards. A player who runs out
// of time before that gets it on the default square (see timeoutDraft).
export function createDraftState(round, firstColor = 'white', now = Date.now(), pattern = null) {
  const secondColor = firstColor === 'white' ? 'black' : 'white'
  const budget = BUDGET_BY_ROUND[round]
  const time = DRAFT_TIME_BY_ROUND[round]
  return {
    round,
    firstColor,
    secondColor,
    phase: 'buy',
    turn: firstColor,
    budgets: { white: budget, black: budget },
    // Hard cap on how many PIECES (not cards) either side may have this
    // round, the free king included — see boardPatterns.js's
    // HOME_CAPACITY_BY_ROUND. More than fit on the home ranks would leave
    // placement impossible to ever finish (see submitPick below and
    // placementEngine.js).
    maxPieces: HOME_CAPACITY_BY_ROUND[round],
    // Grows one item at a time via submitPick — always populated (never
    // null), since both sides' picks are visible live, not revealed only
    // once "submitted" the way the old blind-cart draft worked. Every army
    // starts with its king — free, never bought; taking the enemy king is
    // what wins the round (see chess.js's getEliminationResult).
    picks: {
      white: { pieces: ['king'], cards: [] },
      black: { pieces: ['king'], cards: [] },
    },
    // True once a color can no longer (or chooses not to) act — see
    // submitDone and the auto-skip in submitPick. The draft is complete
    // once both are true (see isDraftComplete).
    done: { white: false, black: false },
    // Seconds left in each player's draft time bank (see draftPools.js's
    // DRAFT_TIME_BY_ROUND) as of `turnStartedAt` — only the side whose turn
    // it is is actually running down. Charged on every pick/done (see
    // chargeClock); the server fires timeoutDraft once it hits zero.
    clocks: { white: time, black: time },
    turnStartedAt: now,
    board: pattern ? { rows: pattern.rows, cols: pattern.cols, blockedCells: pattern.blockedCells ?? [] } : null,
    // { white: { square: pieceType }, black: {...} } — the armies as they
    // stand on the board, kings included. Null when untracked (no pattern).
    placed: pattern ? { white: {}, black: {} } : null,
    // Recruit history, oldest first: { color, kind: 'piece'|'card'|'done',
    // pieceType?, square?, cardId?, cost? } — shown in the "История набора".
    log: [],
  }
}

function sqName(col, rank) { return `${String.fromCharCode(97 + col)}${rank}` }

// Every home square of `color` a piece may ever stand on (not blocked).
export function homeSquares(board, color) {
  const blocked = new Set(board.blockedCells ?? [])
  const [lo, hi] = homeRanks(board.rows, color)
  const out = []
  for (let r = lo; r <= hi; r++)
    for (let c = 0; c < board.cols; c++) {
      const sq = sqName(c, r)
      if (!blocked.has(sq)) out.push(sq)
    }
  return out
}

// Home squares still free for `color` right now.
export function freeHomeSquares(draftState, color) {
  if (!draftState.placed) return []
  const mine = draftState.placed[color]
  return homeSquares(draftState.board, color).filter(sq => !mine[sq])
}

// True once `color`'s king stands on the board (always true when squares
// aren't tracked).
export function hasKing(draftState, color) {
  return !draftState.placed || Object.values(draftState.placed[color]).includes('king')
}

// Default king square: back rank, middle file (e for 8 columns, d for 6/7),
// nearest free one — used when a player never placed it themselves.
export function defaultKingSquare(draftState, color) {
  const free = new Set(freeHomeSquares(draftState, color))
  const { rows, cols } = draftState.board
  const rank = color === 'white' ? 1 : rows
  const mid = Math.floor(cols / 2)
  for (let d = 0; d < cols; d++) {
    for (const c of [mid - d, mid + d]) {
      if (c >= 0 && c < cols && free.has(sqName(c, rank))) return sqName(c, rank)
    }
  }
  return [...free][0]
}

function placeKing(draftState, color, square) {
  return { ...draftState.placed, [color]: { ...draftState.placed[color], [square]: 'king' } }
}

// Puts any missing king on its default square (recruit ending early).
export function withKings(draftState) {
  if (!draftState.placed) return draftState
  let placed = draftState.placed
  for (const c of ['white', 'black']) {
    if (!hasKing({ ...draftState, placed }, c)) placed = placeKing({ ...draftState, placed }, c, defaultKingSquare({ ...draftState, placed }, c))
  }
  return { ...draftState, placed }
}

function isFreeHomeSquare(draftState, color, square) {
  return typeof square === 'string' && freeHomeSquares(draftState, color).includes(square)
}

// Seconds `color` (whose turn it is) would have left if they acted at `now`.
// A draft without clocks (hand-built in tests) is untimed; a null
// turnStartedAt means the clocks haven't started yet (see matchEngine.js's
// round-summary wait).
export function clockRemaining(draftState, color, now = Date.now()) {
  if (!draftState.clocks) return Infinity
  if (draftState.turnStartedAt == null) return draftState.clocks[color]
  return draftState.clocks[color] - Math.max(0, (now - draftState.turnStartedAt) / 1000)
}

function chargeClock(draftState, color, now) {
  if (!draftState.clocks) return draftState
  return {
    ...draftState,
    clocks: { ...draftState.clocks, [color]: Math.max(0, clockRemaining(draftState, color, now)) },
    turnStartedAt: now,
  }
}

// The player whose turn it is ran out of draft time — their draft ends
// right there with whatever they've already bought, exactly as if they'd
// pressed "done" (see submitDone).
export function timeoutDraft(draftState, now = Date.now()) {
  const color = draftState.turn
  if (isDraftComplete(draftState) || draftState.done[color]) return draftState
  const withKing = hasKing(draftState, color) ? draftState : { ...draftState, placed: placeKing(draftState, color, defaultKingSquare(draftState, color)) }
  const next = {
    ...withKing,
    clocks: { ...draftState.clocks, [color]: 0 },
    turnStartedAt: now,
    done: { ...draftState.done, [color]: true },
    log: [...(draftState.log ?? []), { color, kind: 'done', timeout: true }],
  }
  const turn = advanceTurn(next, color)
  return { ...next, turn: turn ?? next.turn }
}

export function isDraftComplete(draftState) {
  return draftState.done.white && draftState.done.black
}

// True if `color` could still afford literally anything — a piece (if
// there's still home-rank room for one) or a card. Used right after that
// color's own purchase to decide whether they're auto-skipped out of the
// turn rotation (see submitPick) — nothing else ever changes their own
// affordability, so this never needs checking on the opponent's turn.
//
// Has to check every catalog item's OWN next price (see nextItemCost), not
// just a flat cheapest-base-price constant: once duplicate pricing has
// pushed pawns (say) up past what's left in the budget, a piece type they
// haven't bought yet at all is still sitting at its base price and may
// well be the actual cheapest option still on the table.
function canStillAct(draftState, color) {
  if (!hasKing(draftState, color)) return true
  const budget = draftState.budgets[color]
  const pieceCount = draftState.picks[color].pieces.length
  const room = draftState.placed ? freeHomeSquares(draftState, color).length > 0 : true
  const pieceCosts = pieceCount < draftState.maxPieces && room
    ? ALL_PIECE_TYPES.map(pieceType => nextItemCost(draftState, color, { kind: 'piece', pieceType }))
    : []
  const cardCosts = ALL_CARD_IDS.map(cardId => nextItemCost(draftState, color, { kind: 'card', cardId }))
  return budget >= Math.min(...pieceCosts, ...cardCosts)
}

// Whose turn is next after `actingColor` just acted — strict alternation
// between whichever colors are still NOT done; a side marked done (out of
// money, or voluntarily finished via submitDone) is simply skipped rather
// than ever being waited on, so the other side just keeps taking
// consecutive turns solo once their opponent is out of the rotation. Null
// once both are done — the draft itself is over (see isDraftComplete).
function advanceTurn(draftState, actingColor) {
  const other = opponentOf(actingColor)
  if (!draftState.done[other]) return other
  if (!draftState.done[actingColor]) return actingColor
  return null
}

// Buys exactly one item on `color`'s own turn — the fundamental action of
// the new turn-based draft (see createDraftState's comment): no more
// blind carts, every pick lands and is broadcast immediately, so the
// opponent sees it land in real time.
export function submitPick(draftState, color, item, now = Date.now()) {
  if (draftState.phase !== 'buy') return { error: 'err.notBuyPhase' }
  if (isDraftComplete(draftState)) return { error: 'err.buyFinished' }
  if (draftState.done[color]) return { error: 'err.youFinishedBuying' }
  if (draftState.turn !== color) return { error: 'err.notYourDraftTurn' }
  if (clockRemaining(draftState, color, now) <= 0) return { error: 'err.buyTimeUp' }

  // First action: the king, free, onto a free home square — and only then.
  if (!hasKing(draftState, color)) {
    if (item?.kind !== 'piece' || item.pieceType !== 'king') return { error: 'err.placeKingFirst' }
    if (!isFreeHomeSquare(draftState, color, item.square)) return { error: 'err.notYourHalf' }
    const next = {
      ...chargeClock(draftState, color, now),
      placed: placeKing(draftState, color, item.square),
      log: [...(draftState.log ?? []), { color, kind: 'piece', pieceType: 'king', square: item.square, cost: 0 }],
    }
    const turn = advanceTurn(next, color)
    return { draftState: { ...next, turn: turn ?? next.turn } }
  }
  if (!isValidCatalogTarget(item)) return { error: 'err.badItem' }

  const cost = nextItemCost(draftState, color, item)
  if (cost > draftState.budgets[color]) return { error: 'err.noBudget' }

  const picks = draftState.picks[color]
  if (item.kind === 'piece') {
    if (picks.pieces.length >= draftState.maxPieces) {
      return { error: 'err.maxPieces' }
    }
    if (draftState.placed && !isFreeHomeSquare(draftState, color, item.square)) {
      return { error: 'err.notYourHalf' }
    }
  }

  const newPicks = item.kind === 'piece'
    ? { ...picks, pieces: [...picks.pieces, item.pieceType] }
    : { ...picks, cards: [...picks.cards, item.cardId] }

  let next = {
    ...chargeClock(draftState, color, now),
    budgets: { ...draftState.budgets, [color]: draftState.budgets[color] - cost },
    picks: { ...draftState.picks, [color]: newPicks },
    log: [...(draftState.log ?? []), item.kind === 'piece'
      ? { color, kind: 'piece', pieceType: item.pieceType, square: draftState.placed ? item.square : null, cost }
      : { color, kind: 'card', cardId: item.cardId, cost }],
  }
  if (item.kind === 'piece' && draftState.placed) {
    next.placed = { ...draftState.placed, [color]: { ...draftState.placed[color], [item.square]: item.pieceType } }
  }
  if (!canStillAct(next, color)) {
    next = { ...next, done: { ...next.done, [color]: true } }
  }
  const turn = advanceTurn(next, color)
  return { draftState: { ...next, turn: turn ?? next.turn } }
}

// Voluntarily ends `color`'s participation in the draft early — the escape
// hatch for a player who's happy with a small/cheap army and doesn't want
// to sit through the opponent still deciding what to do with a bigger
// budget (see advanceTurn: once done, they're skipped, never waited on
// again). Only callable on your own turn, same as an actual pick.
export function submitDone(draftState, color, now = Date.now()) {
  if (draftState.phase !== 'buy') return { error: 'err.notBuyPhase' }
  if (isDraftComplete(draftState)) return { error: 'err.buyFinished' }
  if (draftState.done[color]) return { error: 'err.youFinishedBuying' }
  if (draftState.turn !== color) return { error: 'err.notYourDraftTurn' }
  if (!hasKing(draftState, color)) return { error: 'err.placeKingFirst' }

  const next = {
    ...chargeClock(draftState, color, now),
    done: { ...draftState.done, [color]: true },
    log: [...(draftState.log ?? []), { color, kind: 'done' }],
  }
  const turn = advanceTurn(next, color)
  return { draftState: { ...next, turn: turn ?? next.turn } }
}

