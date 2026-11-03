// Server-authoritative game rules. Deliberately reuses the exact same pure
// logic modules the client renders with (no browser/React dependency in
// any of these files), so the server can never disagree with the client
// about what a legal move or card target is.
import { getLegalMoves, applyMove, getGameResult, appendLogEntry } from '../client/src/game/chess.js'
import { getValidTargets, hasRescueCard } from '../client/src/game/cards.js'
import { applyCardEffect } from '../client/src/game/cardEffects.js'

// getGameResult's `no_moves` loss fires the instant it becomes a player's
// turn with no legal move — but cards don't end the turn, so a player isn't
// really out of options while they still have a card that could open one up
// (add_cell, ...). Suppress a `no_moves` result whenever
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
  delete next.meteorStrikes // transient — see applyMove's comment; never persisted
  const mineStrike = next.mineStrike ?? null
  delete next.mineStrike // transient — same as meteorStrikes, never persisted
  const captured = target && target.hp <= 1

  // Moving instead of answering a pending draw offer declines it; the
  // offerer's own move leaves their offer standing.
  const drawOffer = gameState.drawOffer === color ? color : null
  const finalState = appendLogEntry({ ...next, cardPlayedThisTurn: false, drawOffer }, {
    kind: 'move', color, from, to, capturedType: captured ? target.type : null, meteorStrikes, mineStrike,
  })
  const result = resolveResult(finalState)

  let actionType = 'move'
  if (target && target.hp > 1) actionType = 'bounce'
  else if (target) actionType = 'capture'

  return { gameState: finalState, lastAction: { type: actionType, from, to }, result, meteorStrikes, mineStrike }
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

  const finalState = appendLogEntry({
    ...next,
    cardPlayedThisTurn: true,
    cards: {
      ...next.cards,
      [color]: { hand: newHand, used: [...(next.cards[color]?.used ?? []), card] },
    },
  }, { kind: 'card', color, cardId, target })
  const result = resolveResult(finalState)
  return { gameState: finalState, lastAction: { type: 'card', cardId, target, color }, result }
}
