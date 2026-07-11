import { BUDGET_BY_ROUND } from './draftPools.js'
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

const CHEAPEST_PIECE_COST = shopPieceCost('pawn')
const CHEAPEST_CARD_COST = Math.min(...ALL_CARD_IDS.map(id => CARD_DEFS[id].cost))

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

function itemCost(item) {
  return item.kind === 'piece' ? shopPieceCost(item.pieceType) : CARD_DEFS[item.cardId].cost
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
export function createDraftState(round, firstColor = 'white') {
  const secondColor = firstColor === 'white' ? 'black' : 'white'
  const budget = BUDGET_BY_ROUND[round]
  return {
    round,
    firstColor,
    secondColor,
    phase: 'buy',
    turn: firstColor,
    budgets: { white: budget, black: budget },
    // Hard cap on how many PIECES (not cards) either side may draft this
    // round — see boardPatterns.js's HOME_CAPACITY_BY_ROUND. Buying more
    // than fit on the home ranks would leave hidden placement impossible
    // to ever finish (see submitPick below and placementEngine.js).
    maxPieces: HOME_CAPACITY_BY_ROUND[round],
    // Grows one item at a time via submitPick — always populated (never
    // null), since both sides' picks are visible live, not revealed only
    // once "submitted" the way the old blind-cart draft worked.
    picks: {
      white: { pieces: [], cards: [] },
      black: { pieces: [], cards: [] },
    },
    // True once a color can no longer (or chooses not to) act — see
    // submitDone and the auto-skip in submitPick. The draft is complete
    // once both are true (see isDraftComplete).
    done: { white: false, black: false },
  }
}

export function isDraftComplete(draftState) {
  return draftState.done.white && draftState.done.black
}

// True if `color` could still afford literally anything — a piece (if
// there's still home-rank room for one) or a card. Used right after that
// color's own purchase to decide whether they're auto-skipped out of the
// turn rotation (see submitPick) — nothing else ever changes their own
// affordability, so this never needs checking on the opponent's turn.
function canStillAct(draftState, color) {
  const budget = draftState.budgets[color]
  const pieceCount = draftState.picks[color].pieces.length
  const cheapest = pieceCount < draftState.maxPieces
    ? Math.min(CHEAPEST_PIECE_COST, CHEAPEST_CARD_COST)
    : CHEAPEST_CARD_COST
  return budget >= cheapest
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
export function submitPick(draftState, color, item) {
  if (draftState.phase !== 'buy') return { error: 'Сейчас не фаза закупки' }
  if (isDraftComplete(draftState)) return { error: 'Закупка уже завершена' }
  if (draftState.done[color]) return { error: 'Вы уже закончили закупку' }
  if (draftState.turn !== color) return { error: 'Сейчас не ваш ход' }
  if (!isValidCatalogTarget(item)) return { error: 'Некорректный товар' }

  const cost = itemCost(item)
  if (cost > draftState.budgets[color]) return { error: 'Недостаточно бюджета' }

  const picks = draftState.picks[color]
  if (item.kind === 'piece') {
    if (picks.pieces.length >= draftState.maxPieces) {
      return { error: `На доске только ${draftState.maxPieces} клеток на вашей половине — столько фигур и можно купить` }
    }
  } else if (picks.pieces.length === 0 && draftState.budgets[color] - cost < CHEAPEST_PIECE_COST) {
    // Reserve at least a pawn's worth of budget until the first piece is
    // owned — otherwise an all-cards spree could zero out the budget with
    // zero pieces, an unrecoverable dead end (an empty army is a
    // guaranteed instant loss — see chess.js's getEliminationResult).
    return { error: 'Оставьте хотя бы 2 монеты на пешку, пока у вас нет ни одной фигуры' }
  }

  const newPicks = item.kind === 'piece'
    ? { ...picks, pieces: [...picks.pieces, item.pieceType] }
    : { ...picks, cards: [...picks.cards, item.cardId] }

  let next = {
    ...draftState,
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
export function submitDone(draftState, color) {
  if (draftState.phase !== 'buy') return { error: 'Сейчас не фаза закупки' }
  if (isDraftComplete(draftState)) return { error: 'Закупка уже завершена' }
  if (draftState.done[color]) return { error: 'Вы уже закончили закупку' }
  if (draftState.turn !== color) return { error: 'Сейчас не ваш ход' }
  // An empty (or cards-only) army is a guaranteed instant loss the moment
  // the round starts — never a real choice, so it's not worth offering.
  if (draftState.picks[color].pieces.length === 0) return { error: 'Нужно купить хотя бы одну фигуру' }

  const next = { ...draftState, done: { ...draftState.done, [color]: true } }
  const turn = advanceTurn(next, color)
  return { draftState: { ...next, turn: turn ?? next.turn } }
}
