import { generatePiecePool, generateCardPool, DRAFT_TURN_ORDER } from './draftPools.js'
import { shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'

// Budget draft — the pool is shared and freely composed (see draftPools.js),
// but every item has a real price (shopPieceCost for pieces, CARD_DEFS.cost
// for cards — the exact same scale the in-battle shop already uses, so
// there's nothing new to learn). On your turn you either buy one affordable
// item or pass; there's no separate "pick count" any more, just budget.
//
// The budget is anchored to the single MOST EXPENSIVE item actually in the
// pool this round — whichever type that happens to be, piece or card. A
// share-of-total-value budget (tried earlier) scales with how much STUFF is
// in the pool, not with how good the best single thing is, so a rich pool
// could still leave enough left over to buy the best item AND plenty else —
// the real problem (whoever moves first just takes the best thing, cheaply)
// was never actually about total pool size. Anchoring to the pool's own max
// price instead means grabbing the single best item always costs close to
// the WHOLE budget, regardless of whether that best item happens to be a
// queen, a rook, or an expensive card like rollback — no per-type price
// tuning needed, it generalizes to whatever the pool actually rolls.
// MULTIPLIER leaves a little slack above the top price (room for one cheap
// extra, like a pawn) without ever covering a second real purchase. Grows
// round to round — later rounds carry over more army/cards from earlier
// rounds, so a purely top-price-anchored budget would otherwise buy
// proportionally LESS of a full army as the game escalates; escalating the
// multiplier keeps pace with that.
const BUDGET_MULTIPLIER_BY_ROUND = { 1: 2.2, 2: 2, 3: 2.5 }

function maxItemPrice(pool) {
  const pieceTypes = Object.keys(pool.pieces).filter(type => pool.pieces[type] > 0)
  const pieceMax = pieceTypes.length > 0 ? Math.max(...pieceTypes.map(shopPieceCost)) : 0
  const cardMax  = pool.cards.length > 0 ? Math.max(...pool.cards.map(id => CARD_DEFS[id].cost)) : 0
  return Math.max(pieceMax, cardMax)
}

// `firstColor` is who picks first this round (white by default, per spec's
// "б1"). `carryOverCoins` is whatever's left of the SAME running balance
// from last round's battle (see matchEngine.js) — there's only ever one
// pot of money across the whole match; the draft doesn't get its own
// separate currency, it just adds this round's fresh allotment on top of
// whatever you already had, and you can spend the combined total during
// the draft itself (not just after it). The pool itself is rolled fresh
// here — calling this twice for the same round number can yield a
// different pool and a different budget, by design.
export function createDraftState(round, firstColor = 'white', carryOverCoins = { white: 0, black: 0 }) {
  const secondColor = firstColor === 'white' ? 'black' : 'white'
  const pool = {
    pieces: generatePiecePool(round),
    cards: generateCardPool(round),
  }
  const allotment = Math.round(maxItemPrice(pool) * BUDGET_MULTIPLIER_BY_ROUND[round])
  return {
    round,
    firstColor,
    secondColor,
    pool,
    turnIndex: 0,
    budgets: {
      white: allotment + (carryOverCoins.white ?? 0),
      black: allotment + (carryOverCoins.black ?? 0),
    },
    picks: {
      white: { pieces: [], cards: [] },
      black: { pieces: [], cards: [] },
    },
  }
}

function colorAt(draftState, turnIndex) {
  const slot = DRAFT_TURN_ORDER[turnIndex]
  if (!slot) return null
  return slot === 'first' ? draftState.firstColor : draftState.secondColor
}

export function getCurrentPicker(draftState) {
  return colorAt(draftState, draftState.turnIndex)
}

export function isDraftComplete(draftState) {
  return draftState.turnIndex >= DRAFT_TURN_ORDER.length
}

// { pieces: ['pawn', 'pawn', 'knight', ...] (one entry per still-available
//   copy, so the UI can show and let players pick each individual piece
//   rather than a single grouped "pawn ×6" tile), cards: ['freeze', ...] }
// Whether any given entry is actually affordable right now is for the UI
// (or applyDraftPick) to check against the current picker's budget —
// unaffordable items still show up here, same shared-pool visibility as
// always, just not buyable this turn.
export function getAvailableChoices(draftState) {
  const pieces = Object.entries(draftState.pool.pieces)
    .filter(([, count]) => count > 0)
    .flatMap(([type, count]) => Array(count).fill(type))
  const cards = [...draftState.pool.cards]
  return { pieces, cards }
}

// choice = { kind: 'piece', pieceType } | { kind: 'card', cardId } | { kind: 'pass' }
export function applyDraftPick(draftState, color, choice) {
  if (isDraftComplete(draftState)) return { error: 'Драфт уже завершён' }
  const picker = getCurrentPicker(draftState)
  if (picker !== color) return { error: 'Сейчас не ваш пик' }

  if (choice?.kind === 'pass') {
    return { draftState: { ...draftState, turnIndex: draftState.turnIndex + 1 } }
  }

  const pool  = { pieces: { ...draftState.pool.pieces }, cards: [...draftState.pool.cards] }
  const picks = {
    white: { pieces: [...draftState.picks.white.pieces], cards: [...draftState.picks.white.cards] },
    black: { pieces: [...draftState.picks.black.pieces], cards: [...draftState.picks.black.cards] },
  }
  const budget = draftState.budgets[color]
  let cost

  if (choice?.kind === 'piece') {
    const { pieceType } = choice
    if (!pool.pieces[pieceType] || pool.pieces[pieceType] <= 0) {
      return { error: 'Эта фигура уже разобрана' }
    }
    cost = shopPieceCost(pieceType)
    if (cost > budget) return { error: 'Недостаточно бюджета' }
    pool.pieces[pieceType] -= 1
    picks[color].pieces.push(pieceType)
  } else if (choice?.kind === 'card') {
    const { cardId } = choice
    const idx = pool.cards.indexOf(cardId)
    if (idx === -1) return { error: 'Эта карта уже разобрана' }
    cost = CARD_DEFS[cardId].cost
    if (cost > budget) return { error: 'Недостаточно бюджета' }
    pool.cards.splice(idx, 1)
    picks[color].cards.push(cardId)
  } else {
    return { error: 'Некорректный выбор' }
  }

  return {
    draftState: {
      ...draftState,
      pool,
      picks,
      budgets: { ...draftState.budgets, [color]: budget - cost },
      turnIndex: draftState.turnIndex + 1,
    },
  }
}
