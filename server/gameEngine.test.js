import { describe, it, expect } from 'vitest'
import { tryMove, tryPlayCard } from './gameEngine.js'
import { createDraftRoundState } from '../client/src/game/initialState.js'
import { getLegalMoves } from '../client/src/game/chess.js'

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
    // White's own move never ticks white's own zone (see chess.js's
    // tickFogZones) — only the opponent's moves wear it down, same pattern
    // as meteor, so the caster's own actions inside their cover are never
    // self-defeating.
    expect(moveRes.gameState.fogZones[0].turnsLeft).toBe(4)

    const oppMoveRes = tryMove(moveRes.gameState, 'black', 'b6', 'b5')
    expect(oppMoveRes.gameState.fogZones[0].turnsLeft).toBe(3) // ticked by the opponent's move
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

    const blackCard = tryPlayCard(moveRes.gameState, 'black', 'freeze', 'd4') // any empty square — freeze is now a mine
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
    expect(res.meteorStrikes).toEqual([{ square: 'c6', destroyed: { type: 'pawn', color: 'black', hp: 1 }, owner: 'white' }])
    expect(res.gameState.meteorStrikes).toBeUndefined() // transient — never persisted

    // The kill is just as real as a direct capture — white gets paid for it
    // (pawn = 1 coin) and it shows up as a genuine capture in moveHistory.
    expect(res.gameState.coins.white).toBe(21)
    expect(res.gameState.moveHistory.at(-1)).toEqual({
      from: null, to: 'c6', piece: null,
      captured: { type: 'pawn', color: 'black', hp: 1 }, cause: 'meteor',
    })
  })

  it('friendly fire earns no coins — a meteor destroying its own owner\'s piece is not a paid kill', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { b1: { type: 'pawn', color: 'white', hp: 1 }, c6: { type: 'knight', color: 'white', hp: 1 } },
      { b6: { type: 'pawn', color: 'black', hp: 1 } },
      ['meteor'], [], null, null,
    )
    gs.coins = { white: 20, black: 20 }

    const cast = tryPlayCard(gs, 'white', 'meteor', 'c6')
    let res = tryMove(cast.gameState, 'white', 'b1', 'b2') // white's own residual move — no tick
    res = tryMove(res.gameState, 'black', 'b6', 'b5')       // 1st opponent move — no detonation yet
    res = tryMove(res.gameState, 'white', 'b2', 'b3')       // white's move — still no tick
    res = tryMove(res.gameState, 'black', 'b5', 'b4')       // 2nd opponent move — detonates on white's own knight

    expect(res.gameState.pieces.c6).toBeUndefined()
    expect(res.gameState.coins.white).toBe(20) // no reward for destroying their own piece
  })
})

describe('no_moves suppressed while a rescue card is available', () => {
  // A rook walled into a corner by two blocked holes (a2, b1) has zero
  // legal moves on its own — genuinely stuck — but add_cell can carve out
  // a brand-new square (a0) right next to it.
  function boxedRookState(cardIds) {
    const tinyBoard = { rows: 3, cols: 3, blockedCells: ['a2', 'b1'] }
    const gs = createDraftRoundState(
      tinyBoard,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { c3: { type: 'pawn', color: 'black', hp: 1 } },
      cardIds, [], null, null,
    )
    gs.coins = { white: 20, black: 20 }
    return { ...gs, turn: 'black' }
  }

  it('does not end the round the instant white has no move, while add_cell could still open one', () => {
    const gs = boxedRookState(['add_cell'])

    // Black's move flips the turn to white, who — as things stand — has
    // zero legal moves for their only piece.
    const res = tryMove(gs, 'black', 'c3', 'c2')
    expect(res.error).toBeUndefined()
    expect(res.gameState.turn).toBe('white')
    expect(res.result).toBeNull() // NOT no_moves — white can still try add_cell

    // White plays their rescue card, carving out a0 right next to the rook...
    const cardRes = tryPlayCard(res.gameState, 'white', 'add_cell', 'a0')
    expect(cardRes.error).toBeUndefined()
    expect(cardRes.gameState.board.extraCells).toContain('a0')
    // ...and now genuinely has a legal move.
    expect(getLegalMoves(cardRes.gameState, 'a1')).toContain('a0')
  })

  it('still ends the round with no_moves once white has no card that could rescue the position', () => {
    const gs = boxedRookState(['barricade']) // a wall can't unblock anything

    const res = tryMove(gs, 'black', 'c3', 'c2')
    expect(res.result).toEqual({ type: 'no_moves', winner: 'black' })
  })

  it('still ends the round with no_moves once white has no cards in hand at all', () => {
    const gs = boxedRookState([])

    const res = tryMove(gs, 'black', 'c3', 'c2')
    expect(res.result).toEqual({ type: 'no_moves', winner: 'black' })
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
