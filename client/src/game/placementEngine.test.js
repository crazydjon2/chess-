import { describe, it, expect } from 'vitest'
import { validatePlacement, autoCompletePlacement, buildPlacementPieces } from './placementEngine.js'

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

describe('validatePlacement — partial (live, in-progress)', () => {
  const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

  it('accepts a placement with pieces still missing', () => {
    expect(validatePlacement(boardPattern, 'white', { a1: 'pawn' }, ['pawn', 'rook'], { partial: true })).toEqual({ ok: true })
  })

  it('rejects more of a type than was drafted', () => {
    expect(validatePlacement(boardPattern, 'white', { a1: 'pawn', b1: 'pawn' }, ['pawn', 'rook'], { partial: true }).error).toBeTruthy()
  })
})

describe('autoCompletePlacement', () => {
  it('keeps placed pieces and drops the rest onto free home squares', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const out = autoCompletePlacement(boardPattern, 'black', { a6: 'rook' }, ['rook', 'pawn', 'knight'])
    expect(out.a6).toBe('rook')
    expect(Object.values(out).sort()).toEqual(['knight', 'pawn', 'rook'])
    expect(validatePlacement(boardPattern, 'black', out, ['rook', 'pawn', 'knight'])).toEqual({ ok: true })
  })
})
