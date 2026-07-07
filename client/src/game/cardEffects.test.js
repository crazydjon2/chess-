import { describe, it, expect } from 'vitest'
import { applyCardEffect } from './cardEffects.js'
import { createDraftRoundState } from './initialState.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

describe('smoke_screen', () => {
  it('creates a fog zone covering the full 3x3 neighborhood in the open board', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { c3: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('smoke_screen', gs, 'c3', 'white')
    expect(next.fogZones).toHaveLength(1)
    expect(next.fogZones[0].owner).toBe('white')
    expect(next.fogZones[0].turnsLeft).toBe(4)
    expect(next.fogZones[0].cells.sort()).toEqual(['b2', 'b3', 'b4', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4'].sort())
  })

  it('clips the 3x3 neighborhood at a board corner', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('smoke_screen', gs, 'a1', 'white')
    expect(next.fogZones[0].cells.sort()).toEqual(['a1', 'a2', 'b1', 'b2'].sort())
  })

  it('appends to any existing fog zones rather than replacing them', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 }, f1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyCardEffect('smoke_screen', gs, 'a1', 'white')
    gs = applyCardEffect('smoke_screen', gs, 'f1', 'white')
    expect(gs.fogZones).toHaveLength(2)
  })
})

describe('rollback', () => {
  it('undoes a piece\'s very first move this round, restoring both sides', () => {
    const boardPattern6 = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern6,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const moveHistory = [{ from: 'a1', to: 'a2', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null }]
    const gs = { ...gs0, pieces: { a2: { type: 'pawn', color: 'white', hp: 1 }, f6: gs0.pieces.f6 }, moveHistory, turn: 'black' }

    const next = applyCardEffect('rollback', gs, 'a2', 'black')
    expect(next.pieces.a1).toEqual({ type: 'pawn', color: 'white', hp: 1 })
    expect(next.pieces.a2).toBeUndefined()
    expect(next.moveHistory).toHaveLength(0)
  })

  it('undoes a later move too (moved at least once is enough, not just the first move)', () => {
    const boardPattern6 = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern6,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const moveHistory = [
      { from: 'a1', to: 'a2', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null },
      { from: 'a2', to: 'a3', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null },
    ]
    const gs = { ...gs0, pieces: { a3: { type: 'pawn', color: 'white', hp: 1 }, f6: gs0.pieces.f6 }, moveHistory, turn: 'black' }

    const next = applyCardEffect('rollback', gs, 'a3', 'black')
    expect(next.pieces.a2).toEqual({ type: 'pawn', color: 'white', hp: 1 })
    expect(next.pieces.a3).toBeUndefined()
    expect(next.moveHistory).toHaveLength(1)
  })

  it('undoes a capturing move and claws back the coins the mover earned from it', () => {
    const boardPattern6 = { rows: 6, cols: 6, blockedCells: [] }
    const gs0 = createDraftRoundState(
      boardPattern6,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { b3: { type: 'knight', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const capturedKnight = { type: 'knight', color: 'black', hp: 1 }
    const moveHistory = [
      { from: 'a1', to: 'a2', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: null },
      { from: 'a2', to: 'b3', piece: { type: 'pawn', color: 'white', hp: 1 }, captured: capturedKnight },
    ]
    const gs = {
      ...gs0,
      pieces: { b3: { type: 'pawn', color: 'white', hp: 1 } },
      coins: { white: gs0.coins.white + 3, black: gs0.coins.black }, // paid out for the knight (value 3)
      moveHistory,
      turn: 'black',
    }

    const next = applyCardEffect('rollback', gs, 'b3', 'black')
    expect(next.pieces.a2).toEqual({ type: 'pawn', color: 'white', hp: 1 })
    expect(next.pieces.b3).toEqual(capturedKnight)
    expect(next.coins.white).toBe(gs0.coins.white) // the capture payout is reversed
  })
})

describe('meteor', () => {
  it('registers a delayed strike without touching pieces yet', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('meteor', gs, 'f6', 'white')
    expect(next.meteors).toEqual([{ owner: 'white', square: 'f6', turnsLeft: 2 }])
    expect(next.pieces).toEqual(gs.pieces) // no immediate effect — see tickMeteors
  })

  it('appends to any existing meteors rather than replacing them', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyCardEffect('meteor', gs, 'f6', 'white')
    gs = applyCardEffect('meteor', gs, 'a1', 'black')
    expect(gs.meteors).toHaveLength(2)
  })
})
