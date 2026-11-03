import { describe, it, expect } from 'vitest'
import { getCaptured, shopPieceCost, SHOP_PRICES, SHOP_PIECE_TYPES } from './economy.js'
import { applyMove } from './chess.js'
import { createDraftRoundState } from './initialState.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

describe('shopPieceCost', () => {
  // Prices are tuned with the balance lab, so only the contract is fixed here.
  it('prices every buyable piece from the price table, all positive', () => {
    for (const t of SHOP_PIECE_TYPES) {
      expect(shopPieceCost(t)).toBe(SHOP_PRICES[t])
      expect(shopPieceCost(t)).toBeGreaterThan(0)
    }
  })

  it('the king is never for sale', () => {
    expect(shopPieceCost('king')).toBe(0)
    expect(SHOP_PIECE_TYPES).not.toContain('king')
  })
})

describe('getCaptured', () => {
  it('reads genuine captures straight out of moveHistory', () => {
    const gs0 = createDraftRoundState(
      boardPattern,
      { b1: { type: 'pawn', color: 'white', hp: 1 } },
      { c2: { type: 'knight', color: 'black', hp: 1 } },
      [], [], null,
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
      [], [], null,
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
      [], [], null,
    )
    const redacted = { ...gs, pieces: { f6: gs.pieces.f6 } } // simulate b2 redacted away
    expect(getCaptured(redacted, 'white')).toEqual([])
  })
})
