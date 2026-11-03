// Thin adapter over the REAL game engine — the exact modules the server
// runs (client/src/game/* + server/gameEngine.js). Nothing here
// re-implements a rule: the simulator plays by whatever the game currently
// does, so a new card/piece/board is picked up automatically.
import * as chess from '../../../client/src/game/chess.js'
import * as cards from '../../../client/src/game/cards.js'
import * as cardEffects from '../../../client/src/game/cardEffects.js'
import * as draft from '../../../client/src/game/draftEngine.js'
import * as pools from '../../../client/src/game/draftPools.js'
import * as boards from '../../../client/src/game/boardPatterns.js'
import * as placement from '../../../client/src/game/placementEngine.js'
import * as initial from '../../../client/src/game/initialState.js'
import * as economy from '../../../client/src/game/economy.js'
import * as server from '../../../server/gameEngine.js'
import { redactGameState } from '../../../server/rooms.js'

export { chess, cards, cardEffects, draft, pools, boards, placement, initial, economy, server }

export const CARD_IDS = Object.keys(cards.CARD_DEFS)
export const PIECE_TYPES = draft.ALL_PIECE_TYPES
export const ROUNDS = Object.keys(boards.BOARD_PATTERNS).map(Number).sort((a, b) => a - b)

export const opp = c => (c === 'white' ? 'black' : 'white')
export const col = sq => sq.charCodeAt(0) - 97
export const rnk = sq => parseInt(sq.slice(1), 10)
export const dist = (a, b) => Math.max(Math.abs(col(a) - col(b)), Math.abs(rnk(a) - rnk(b)))

// Exactly what the server would show `color` (fog, hidden meteors/mines).
export function viewFor(gs, color) {
  return redactGameState(gs, color)
}

export function kingSquare(gs, color) {
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.type === 'king' && p.color === color) return sq
  }
  return null
}

// Every legal (from, to) for `color` in `gs`.
export function legalMoves(gs, color) {
  const out = []
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color !== color) continue
    for (const to of chess.getLegalMoves(gs, sq)) out.push({ from: sq, to })
  }
  return out
}

// Fast search-only successor for a move: the core rule (applyMove) without
// the battle-log snapshot / rescue-card bookkeeping tryMove adds on top.
export function quickMove(gs, from, to) {
  const next = chess.applyMove(gs, from, to, 'queen', 0)
  return { ...next, cardPlayedThisTurn: false, meteorStrikes: undefined, mineStrike: undefined }
}

// Fast search-only successor for playing a card from hand.
export function quickCard(gs, color, cardId, target) {
  const next = cardEffects.applyCardEffect(cardId, gs, target, color)
  const hand = gs.cards[color].hand
  const idx = hand.findIndex(c => c.id === cardId)
  return {
    ...next,
    cardPlayedThisTurn: true,
    cards: { ...next.cards, [color]: { hand: [...hand.slice(0, idx), ...hand.slice(idx + 1)], used: gs.cards[color].used } },
  }
}

// Lets one ply of time pass WITHOUT a move, through the engine's own
// per-move upkeep (unstable shifts, meteor countdowns, fog, freezing) —
// how the AI sees what a delayed card will have done by the opponent's
// turn (e.g. which type a cursed piece turns into) before choosing it.
export function advanceOnePly(gs, mover) {
  let pieces = chess.unfreezeColor(gs.pieces, mover)
  const m = chess.tickMeteors(pieces, gs.meteors, mover)
  pieces = chess.tickUnstablePieces(m.pieces)
  return {
    ...gs, pieces, meteors: m.meteors,
    fogZones: chess.tickFogZones(gs.fogZones, mover),
    turn: opp(mover), cardPlayedThisTurn: false,
  }
}

// Terminal check used inside search (cheap subset of getGameResult): a
// king that's gone decides it, regardless of anything else.
export function quickTerminal(gs) {
  let w = false, b = false, wAny = false, bAny = false
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (p.color === 'white') { wAny = true; if (p.type === 'king') w = true }
    else if (p.color === 'black') { bAny = true; if (p.type === 'king') b = true }
  }
  if (!wAny || !w) return !bAny || !b ? 'draw' : 'black'
  if (!bAny || !b) return 'white'
  return null
}

export function buildBattle(pattern, maps, cardIds) {
  return initial.createDraftRoundState(
    pattern,
    placement.buildPlacementPieces('white', maps.white),
    placement.buildPlacementPieces('black', maps.black),
    cardIds.white, cardIds.black, null,
  )
}

export function itemCost(ds, color, item) { return draft.nextItemCost(ds, color, item) }
export function baseCost(item) {
  return item.kind === 'piece' ? economy.shopPieceCost(item.pieceType) : cards.CARD_DEFS[item.cardId].cost
}
export function allItems() {
  return [
    ...PIECE_TYPES.map(pieceType => ({ kind: 'piece', pieceType, key: pieceType })),
    ...CARD_IDS.map(cardId => ({ kind: 'card', cardId, key: 'card:' + cardId })),
  ]
}
export const itemKey = it => (it.kind === 'piece' ? it.pieceType : 'card:' + it.cardId)
