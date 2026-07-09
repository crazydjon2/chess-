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

describe('freeze (mine) targeting', () => {
  it('offers only empty squares — not occupied ones', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const targets = getValidTargets('freeze', gs, 'white')
    expect(targets).toContain('a1') // empty
    expect(targets).not.toContain('b2') // own piece
    expect(targets).not.toContain('f6') // enemy piece
  })

  it('excludes a square that already has a mine on it', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    let gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyCardEffect('freeze', gs, 'c3', 'white')
    expect(getValidTargets('freeze', gs, 'black')).not.toContain('c3')
  })
})

describe('necromancy targeting', () => {
  // Each entry: a WHITE piece's move captured a BLACK piece of `type` — a
  // trophy white can revive, not a piece white lost.
  function stateWithCaptures(types) {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const moveHistory = types.map((type, i) => ({
      from: `b${i + 1}`, to: `c${i + 1}`,
      piece: { type: 'pawn', color: 'white', hp: 1 },
      captured: { type, color: 'black', hp: 1 },
    }))
    return { ...gs0, moveHistory }
  }

  it('offers each distinct captured piece type once', () => {
    const gs = stateWithCaptures(['knight', 'knight', 'rook'])
    expect(getValidTargets('necromancy', gs, 'white').sort()).toEqual(['knight', 'rook'])
  })

  it('offers nothing when nothing of yours has been captured', () => {
    const gs = stateWithCaptures([])
    expect(getValidTargets('necromancy', gs, 'white')).toEqual([])
  })

  it('offers nothing once there\'s no empty home-rank square left', () => {
    const gs0 = stateWithCaptures(['knight'])
    const pieces = { ...gs0.pieces }
    for (const col of ['a', 'b', 'c', 'd', 'e', 'f']) {
      pieces[`${col}1`] = { type: 'pawn', color: 'white', hp: 1 }
      pieces[`${col}2`] = { type: 'pawn', color: 'white', hp: 1 }
    }
    const gs = { ...gs0, pieces }
    expect(getValidTargets('necromancy', gs, 'white')).toEqual([])
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

describe('unstable targeting', () => {
  it('offers own and enemy pieces, but not empty squares, kings, or barricades', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 }, a1: { type: 'king', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['unstable'], [], null, null,
    )
    const s = { ...gs, pieces: { ...gs.pieces, c3: { type: 'barricade', color: 'neutral', hp: 2 } } }

    const targets = getValidTargets('unstable', s, 'white')
    expect(targets).toContain('b2') // own piece
    expect(targets).toContain('f6') // enemy piece
    expect(targets).not.toContain('a1') // king
    expect(targets).not.toContain('c3') // barricade
    expect(targets).not.toContain('d4') // empty square
  })

  it('excludes a piece that is already unstable', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    let gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['unstable'], [], null, null,
    )
    gs = applyCardEffect('unstable', gs, 'f6', 'white')
    expect(getValidTargets('unstable', gs, 'white')).not.toContain('f6')
  })
})
