// Local hot-seat rules engine for the manual-testing sandbox (SandboxApp.jsx)
// — deliberately a client-local mirror of server/gameEngine.js (same turn
// checks, same coin/card/meteor bookkeeping) rather than importing across
// the client/server boundary, so the sandbox behaves identically to a real
// online match without needing a socket connection. Keep in sync with
// server/gameEngine.js if either changes.
import { getLegalMoves, applyMove, getGameResult } from './chess.js'
import { getValidTargets, hasRescueCard } from './cards.js'
import { applyCardEffect } from './cardEffects.js'
import { PIECE_VALUE } from './economy.js'

// getGameResult's `no_moves` loss fires the instant it becomes a player's
// turn with no legal move — but cards don't end the turn, so a player isn't
// really out of options while they still have a card that could open one up
// (add_cell, necromancy, ...). Suppress a `no_moves` result whenever
// hasRescueCard says the about-to-lose side still has that option; every
// other result (elimination, timeout, draw) is never something a card can
// talk your way out of, so it passes through untouched.
function resolveResult(gameState) {
  const result = getGameResult(gameState)
  if (result?.type !== 'no_moves') return result
  const loserColor = result.winner === 'white' ? 'black' : 'white'
  return hasRescueCard(gameState, loserColor) ? null : result
}

export function tryMove(gameState, color, from, to, promotion, now = Date.now()) {
  if (gameState.turn !== color) return { error: 'Не ваш ход' }
  const piece = gameState.pieces[from]
  if (!piece || piece.color !== color) return { error: 'Нет вашей фигуры на этой клетке' }
  if (!getLegalMoves(gameState, from).includes(to)) return { error: 'Недопустимый ход' }

  const target = gameState.pieces[to]
  const next   = applyMove(gameState, from, to, promotion, now)
  const meteorStrikes = next.meteorStrikes ?? []
  delete next.meteorStrikes
  const mineStrike = next.mineStrike ?? null
  delete next.mineStrike
  const captured = target && target.hp <= 1
  let coins = captured
    ? { ...gameState.coins, [color]: gameState.coins[color] + (PIECE_VALUE[target.type] || 0) }
    : gameState.coins
  // A meteor detonating this move is just as much a kill as the move's own
  // capture — see chess.js's tickMeteors/applyMove — so its owner gets paid
  // the same way, just delayed. Friendly fire (a meteor destroying its own
  // owner's piece) earns nothing, same as a normal move can never capture
  // your own piece for a reward either.
  meteorStrikes.forEach(strike => {
    if (!strike.destroyed || strike.destroyed.color === strike.owner) return
    coins = { ...coins, [strike.owner]: coins[strike.owner] + (PIECE_VALUE[strike.destroyed.type] || 0) }
  })

  const finalState = { ...next, coins, cardPlayedThisTurn: false }
  const result = resolveResult(finalState)

  let actionType = 'move'
  if (target && target.hp > 1) actionType = 'bounce'
  else if (target) actionType = 'capture'

  return { gameState: finalState, lastAction: { type: actionType, from, to }, result, meteorStrikes, mineStrike }
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
  const result = resolveResult(finalState)
  return { gameState: finalState, lastAction: { type: 'card', cardId, target, color }, result }
}
