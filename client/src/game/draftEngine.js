import { BUDGET_BY_ROUND, DRAFT_TIME_BY_ROUND } from './draftPools.js'
import { SHOP_PIECE_TYPES, shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'
import { HOME_CAPACITY_BY_ROUND } from './boardPatterns.js'

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
export function createDraftState(round, firstColor = 'white', now = Date.now()) {
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
  }
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
  const next = {
    ...draftState,
    clocks: { ...draftState.clocks, [color]: 0 },
    turnStartedAt: now,
    done: { ...draftState.done, [color]: true },
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
  const budget = draftState.budgets[color]
  const pieceCount = draftState.picks[color].pieces.length
  const pieceCosts = pieceCount < draftState.maxPieces
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
  if (draftState.phase !== 'buy') return { error: 'Сейчас не фаза закупки' }
  if (isDraftComplete(draftState)) return { error: 'Закупка уже завершена' }
  if (draftState.done[color]) return { error: 'Вы уже закончили закупку' }
  if (draftState.turn !== color) return { error: 'Сейчас не ваш ход' }
  if (clockRemaining(draftState, color, now) <= 0) return { error: 'Время на закупку вышло' }
  if (!isValidCatalogTarget(item)) return { error: 'Некорректный товар' }

  const cost = nextItemCost(draftState, color, item)
  if (cost > draftState.budgets[color]) return { error: 'Недостаточно бюджета' }

  const picks = draftState.picks[color]
  if (item.kind === 'piece') {
    if (picks.pieces.length >= draftState.maxPieces) {
      return { error: `На доске только ${draftState.maxPieces} клеток на вашей половине — столько фигур и можно купить` }
    }
  }

  const newPicks = item.kind === 'piece'
    ? { ...picks, pieces: [...picks.pieces, item.pieceType] }
    : { ...picks, cards: [...picks.cards, item.cardId] }

  let next = {
    ...chargeClock(draftState, color, now),
    budgets: { ...draftState.budgets, [color]: draftState.budgets[color] - cost },
    picks: { ...draftState.picks, [color]: newPicks },
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
  if (draftState.phase !== 'buy') return { error: 'Сейчас не фаза закупки' }
  if (isDraftComplete(draftState)) return { error: 'Закупка уже завершена' }
  if (draftState.done[color]) return { error: 'Вы уже закончили закупку' }
  if (draftState.turn !== color) return { error: 'Сейчас не ваш ход' }

  const next = { ...chargeClock(draftState, color, now), done: { ...draftState.done, [color]: true } }
  const turn = advanceTurn(next, color)
  return { draftState: { ...next, turn: turn ?? next.turn } }
}
