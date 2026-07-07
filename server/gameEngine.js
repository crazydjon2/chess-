// Server-authoritative game rules. Deliberately reuses the exact same pure
// logic modules the client renders with (no browser/React dependency in
// any of these files), so the server can never disagree with the client
// about what a legal move or card target is.
import { getLegalMoves, applyMove, getGameResult } from '../client/src/game/chess.js'
import { getValidTargets } from '../client/src/game/cards.js'
import { applyCardEffect } from '../client/src/game/cardEffects.js'
import { PIECE_VALUE } from '../client/src/game/economy.js'

export function tryMove(gameState, color, from, to, promotion) {
  if (gameState.turn !== color) return { error: 'Не ваш ход' }
  const piece = gameState.pieces[from]
  if (!piece || piece.color !== color) return { error: 'Нет вашей фигуры на этой клетке' }
  if (!getLegalMoves(gameState, from).includes(to)) return { error: 'Недопустимый ход' }

  const target = gameState.pieces[to]
  const next   = applyMove(gameState, from, to, promotion)
  const meteorStrikes = next.meteorStrikes ?? []
  delete next.meteorStrikes // transient — see applyMove's comment; never persisted
  const captured = target && target.hp <= 1
  const coins = captured
    ? { ...gameState.coins, [color]: gameState.coins[color] + (PIECE_VALUE[target.type] || 0) }
    : gameState.coins

  const finalState = { ...next, coins, cardPlayedThisTurn: false }
  const result = getGameResult(finalState)

  let actionType = 'move'
  if (target && target.hp > 1) actionType = 'bounce'
  else if (target) actionType = 'capture'

  return { gameState: finalState, lastAction: { type: actionType, from, to }, result, meteorStrikes }
}

// Cards don't end the turn — the caster still gets their normal move this
// same turn — but only one card may be played per turn (cardPlayedThisTurn,
// reset to false whenever a move actually ends the turn). Since nothing
// here ends the turn, unfreeze/fog-tick/meteor upkeep is deliberately NOT
// run here — that only happens in tryMove, the only action that actually
// passes the turn to the opponent (there's no in-battle shop any more —
// see economy.js's shopPieceCost, now only used to price the draft).
export function tryPlayCard(gameState, color, cardId, target) {
  if (gameState.turn !== color) return { error: 'Не ваш ход' }
  if (gameState.cardPlayedThisTurn) return { error: 'В этот ход уже сыграна карта' }
  const hand = gameState.cards[color].hand
  const idx  = hand.findIndex(c => c.id === cardId)
  if (idx === -1) return { error: 'Этой карты нет в руке' }
  if (!getValidTargets(cardId, gameState, color).includes(target)) return { error: 'Недопустимая цель' }

  const card = hand[idx]
  const next = applyCardEffect(cardId, gameState, target, color)
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)]

  const finalState = {
    ...next,
    cardPlayedThisTurn: true,
    cards: {
      ...next.cards,
      [color]: { hand: newHand, used: [...(next.cards[color]?.used ?? []), card] },
    },
  }
  const result = getGameResult(finalState)
  return { gameState: finalState, lastAction: { type: 'card', cardId, target, color }, result }
}
