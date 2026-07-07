import { describe, it, expect } from 'vitest'
import { validatePlacement, buildPlacementPieces } from './placementEngine.js'

describe('validatePlacement', () => {
  const boardPattern = { rows: 6, cols: 6, blockedCells: ['c2'] }

  it('accepts a placement fully within home ranks matching the drafted types', () => {
    expect(validatePlacement(boardPattern, 'white', { a1: 'pawn', b1: 'knight' }, ['pawn', 'knight'])).toEqual({ ok: true })
  })

  it('rejects a square outside the player\'s home ranks', () => {
    expect(validatePlacement(boardPattern, 'white', { a3: 'pawn' }, ['pawn']).error).toBeTruthy()
  })

  it('rejects a square blocked by the board pattern', () => {
    expect(validatePlacement(boardPattern, 'white', { c2: 'pawn' }, ['pawn']).error).toBeTruthy()
  })

  it('rejects placed types that don\'t match what was drafted', () => {
    expect(validatePlacement(boardPattern, 'white', { a1: 'queen' }, ['pawn']).error).toBeTruthy()
  })

  it('uses the opposite home ranks for black', () => {
    expect(validatePlacement(boardPattern, 'black', { a6: 'pawn' }, ['pawn'])).toEqual({ ok: true })
    expect(validatePlacement(boardPattern, 'black', { a1: 'pawn' }, ['pawn']).error).toBeTruthy()
  })
})

describe('buildPlacementPieces', () => {
  it('turns a { square: type } map into full piece objects for that color', () => {
    expect(buildPlacementPieces('white', { a1: 'pawn', b1: 'knight' })).toEqual({
      a1: { type: 'pawn', color: 'white', hp: 1 },
      b1: { type: 'knight', color: 'white', hp: 1 },
    })
  })
})
