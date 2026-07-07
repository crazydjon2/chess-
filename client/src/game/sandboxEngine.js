// Local hot-seat rules engine for the manual-testing sandbox (SandboxApp.jsx)
// — deliberately a client-local mirror of server/gameEngine.js (same turn
// checks, same coin/card/meteor bookkeeping) rather than importing across
// the client/server boundary, so the sandbox behaves identically to a real
// online match without needing a socket connection. Keep in sync with
// server/gameEngine.js if either changes.
import { getLegalMoves, applyMove, getGameResult } from './chess.js'
import { getValidTargets } from './cards.js'
import { applyCardEffect } from './cardEffects.js'
import { PIECE_VALUE } from './economy.js'

export function tryMove(gameState, color, from, to, promotion) {
  if (gameState.turn !== color) return { error: 'Не ваш ход' }
  const piece = gameState.pieces[from]
  if (!piece || piece.color !== color) return { error: 'Нет вашей фигуры на этой клетке' }
  if (!getLegalMoves(gameState, from).includes(to)) return { error: 'Недопустимый ход' }

  const target = gameState.pieces[to]
  const next   = applyMove(gameState, from, to, promotion)
  const meteorStrikes = next.meteorStrikes ?? []
  delete next.meteorStrikes
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
