import { describe, it, expect } from 'vitest'
import { tryMove, tryPlayCard } from './gameEngine.js'
import { createDraftRoundState } from '../client/src/game/initialState.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: ['a1'] }

function freshState(coins = { white: 20, black: 20 }) {
  const gs = createDraftRoundState(
    boardPattern,
    { b1: { type: 'pawn', color: 'white', hp: 1 } },
    { b6: { type: 'pawn', color: 'black', hp: 1 } },
    ['smoke_screen'], [], null, null,
  )
  gs.coins = coins
  return gs
}

describe('tryPlayCard: cards no longer end the turn', () => {
  it('leaves the turn with the caster — they still get their normal move', () => {
    const gs = freshState()
    const res = tryPlayCard(gs, 'white', 'smoke_screen', 'b1')
    expect(res.error).toBeUndefined()
    expect(res.gameState.turn).toBe('white')
    expect(res.gameState.cardPlayedThisTurn).toBe(true)
    expect(res.gameState.fogZones[0].turnsLeft).toBe(4) // not pre-ticked by the cast itself

    // The turn only actually ends once white makes their move.
    const moveRes = tryMove(res.gameState, 'white', 'b1', 'b2')
    expect(moveRes.error).toBeUndefined()
    expect(moveRes.gameState.turn).toBe('black')
    expect(moveRes.gameState.cardPlayedThisTurn).toBe(false) // reset for the new turn
    expect(moveRes.gameState.fogZones[0].turnsLeft).toBe(3) // ticked by the move that ended the turn
  })

  it('rejects a second card in the same turn (one spell per turn)', () => {
    const gs = freshState()
    gs.cards.white.hand.push({ id: 'freeze' })
    const first = tryPlayCard(gs, 'white', 'smoke_screen', 'b1')
    expect(first.error).toBeUndefined()
    const second = tryPlayCard(first.gameState, 'white', 'freeze', 'b6')
    expect(second.error).toBeTruthy()
  })

  it('allows a card again once the turn actually passes to the other side', () => {
    let gs = freshState()
    gs.cards.black.hand.push({ id: 'freeze' })

    const cardRes = tryPlayCard(gs, 'white', 'smoke_screen', 'b1')
    const moveRes = tryMove(cardRes.gameState, 'white', 'b1', 'b2') // ends white's turn
    expect(moveRes.gameState.cardPlayedThisTurn).toBe(false)

    const blackCard = tryPlayCard(moveRes.gameState, 'black', 'freeze', 'b2')
    expect(blackCard.error).toBeUndefined()
    expect(blackCard.gameState.turn).toBe('black') // still black's turn, they can now move too
  })

  it('rejects playing a card out of turn', () => {
    const gs = freshState()
    const res = tryPlayCard(gs, 'black', 'smoke_screen', 'b6')
    expect(res.error).toBeTruthy()
  })
})

describe('meteor integration (tryPlayCard + tryMove ticking/detonation)', () => {
  it('detonates after exactly 2 of the opponent\'s moves — not the caster\'s own residual move, and not the opponent\'s 1st move either', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { b1: { type: 'pawn', color: 'white', hp: 1 }, c1: { type: 'pawn', color: 'white', hp: 1 } },
      { b6: { type: 'pawn', color: 'black', hp: 1 }, c6: { type: 'pawn', color: 'black', hp: 1 } },
      ['meteor'], [], null, null,
    )
    gs.coins = { white: 20, black: 20 }

    const cast = tryPlayCard(gs, 'white', 'meteor', 'c6')
    expect(cast.error).toBeUndefined()
    expect(cast.gameState.meteors).toEqual([{ owner: 'white', square: 'c6', turnsLeft: 2 }])

    // White's own residual move this same turn (cards don't end the turn)
    // — must NOT tick their own meteor, and reports no strikes.
    let res = tryMove(cast.gameState, 'white', 'b1', 'b2')
    expect(res.gameState.meteors[0].turnsLeft).toBe(2)
    expect(res.meteorStrikes).toEqual([])

    // Black's move — the c6 pawn itself stays put, only the b-file pawn
    // moves — 1st full move elapsed since casting.
    res = tryMove(res.gameState, 'black', 'b6', 'b5')
    expect(res.gameState.meteors[0].turnsLeft).toBe(1)
    expect(res.gameState.pieces.c6).toBeDefined()
    expect(res.meteorStrikes).toEqual([])

    // White moves again — still no tick, it's their own meteor.
    res = tryMove(res.gameState, 'white', 'c1', 'c2')
    expect(res.gameState.meteors[0].turnsLeft).toBe(1)
    expect(res.meteorStrikes).toEqual([])

    // Black's 2nd move (again the b-file pawn, not c6) — 2nd full move
    // elapsed — detonates, destroying the untouched pawn still on c6, and
    // reports it in meteorStrikes so both clients can play the explosion.
    res = tryMove(res.gameState, 'black', 'b5', 'b4')
    expect(res.gameState.meteors).toEqual([])
    expect(res.gameState.pieces.c6).toBeUndefined()
    expect(res.meteorStrikes).toEqual([{ square: 'c6', destroyed: { type: 'pawn', color: 'black', hp: 1 } }])
    expect(res.gameState.meteorStrikes).toBeUndefined() // transient — never persisted
  })
})

describe('tryMove', () => {
  it('rejects a move when it is not that color\'s turn', () => {
    const gs = freshState()
    const res = tryMove(gs, 'black', 'b6', 'b5')
    expect(res.error).toBeTruthy()
  })

  it('awards coins on capture equal to the captured piece\'s value', () => {
    const gs = freshState()
    gs.pieces = {
      b1: { type: 'pawn', color: 'white', hp: 1 },
      c2: { type: 'knight', color: 'black', hp: 1 }, // diagonal from b1 — pawns only capture diagonally
    }
    const res = tryMove(gs, 'white', 'b1', 'c2')
    expect(res.error).toBeUndefined()
    expect(res.gameState.coins.white).toBe(20 + 3)
    expect(res.lastAction.type).toBe('capture')
  })
})
