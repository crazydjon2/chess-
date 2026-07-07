import { describe, it, expect } from 'vitest'
import { getValidTargets } from './cards.js'
import { applyCardEffect } from './cardEffects.js'
import { getValidSquares } from './chess.js'
import { createDraftRoundState } from './initialState.js'

describe('add_cell on a blocked map hole', () => {
  it('offers a blocked-adjacent cell as a target and actually reopens it once cast', () => {
    // "Стена по центру"-style pattern: c3 is a blocked hole adjacent to the
    // open c2.
    const boardPattern = { rows: 6, cols: 6, blockedCells: ['c3'] }
    const gs = createDraftRoundState(
      boardPattern,
      { c2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )

    const targets = getValidTargets('add_cell', gs, 'white')
    expect(targets).toContain('c3')

    const next = applyCardEffect('add_cell', gs, 'c3', 'white')
    expect(next.board.extraCells).toContain('c3')
    // The whole point: c3 must now actually be playable, not just "added"
    // while getValidSquares still silently excludes it as blocked.
    expect(getValidSquares(next.board).has('c3')).toBe(true)
  })
})

describe('rollback targeting', () => {
  it('is offered for a piece\'s very first move this round (moved at least once is enough)', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], ['rollback'], null, null,
    )
    const gs = {
      ...gs0,
      pieces: { a2: { type: 'pawn', color: 'white', hp: 1 }, f6: gs0.pieces.f6 },
      moveHistory: [{ from: 'a1', to: 'a2', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null }],
    }
    expect(getValidTargets('rollback', gs, 'black')).toEqual(['a2'])
  })

  it('is offered for a later move too (undoes just the latest step)', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], ['rollback'], null, null,
    )
    const gs = {
      ...gs0,
      pieces: { a3: { type: 'pawn', color: 'white', hp: 1 }, f6: gs0.pieces.f6 },
      moveHistory: [
        { from: 'a1', to: 'a2', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null },
        { from: 'a2', to: 'a3', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null },
      ],
    }
    expect(getValidTargets('rollback', gs, 'black')).toEqual(['a3'])
  })
})

describe('smoke_screen targeting', () => {
  it('can be cast on any square — empty, own piece, or enemy piece', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['smoke_screen'], [], null, null,
    )

    const targets = getValidTargets('smoke_screen', gs, 'white')
    expect(targets).toContain('b2') // own piece
    expect(targets).toContain('f6') // enemy piece
    expect(targets).toContain('a1') // empty square
  })
})

describe('meteor targeting', () => {
  it('can be cast on any square — empty, own piece, enemy piece, or a blocked hole', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: ['c3'] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['meteor'], [], null, null,
    )

    const targets = getValidTargets('meteor', gs, 'white')
    expect(targets).toContain('b2') // own piece
    expect(targets).toContain('f6') // enemy piece
    expect(targets).toContain('a1') // empty square
    expect(targets).toContain('c3') // blocked hole (a legal but wasted cast)
  })
})
