import { describe, it, expect } from 'vitest'
import { getCaptured, shopPieceCost } from './economy.js'
import { applyMove } from './chess.js'
import { createDraftRoundState } from './initialState.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

describe('shopPieceCost', () => {
  it('charges double the capture value for every piece type', () => {
    expect(shopPieceCost('pawn')).toBe(2)
    expect(shopPieceCost('knight')).toBe(6)
    expect(shopPieceCost('bishop')).toBe(6)
    expect(shopPieceCost('rook')).toBe(10)
    expect(shopPieceCost('queen')).toBe(18)
  })
})

describe('getCaptured', () => {
  it('reads genuine captures straight out of moveHistory', () => {
    const gs0 = createDraftRoundState(
      boardPattern,
      { b1: { type: 'pawn', color: 'white', hp: 1 } },
      { c2: { type: 'knight', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyMove(gs0, 'b1', 'c2') // diagonal pawn capture
    expect(getCaptured(next, 'black')).toEqual(['knight'])
    expect(getCaptured(next, 'white')).toEqual([])
  })

  it('does not mistake a promoted pawn for a captured one', () => {
    const gs0 = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 } },
      { f1: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyMove(gs0, 'a5', 'a6', 'queen')
    expect(getCaptured(next, 'white')).toEqual([]) // the pawn upgraded, it didn't vanish captured
  })

  it('does not mistake a fogged (smoke_screen-hidden) piece for a captured one', () => {
    // getCaptured only ever reads moveHistory, so a piece simply missing
    // from a redacted `pieces` map (see rooms.js) can never register here —
    // there's no diffing against a snapshot to get confused by.
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const redacted = { ...gs, pieces: { f6: gs.pieces.f6 } } // simulate b2 redacted away
    expect(getCaptured(redacted, 'white')).toEqual([])
  })
})
