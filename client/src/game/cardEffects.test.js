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

describe('freeze (mine placement)', () => {
  it('lays a hidden mine without touching pieces yet', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('freeze', gs, 'c3', 'white')
    expect(next.mines).toEqual([{ owner: 'white', square: 'c3' }])
    expect(next.pieces).toEqual(gs.pieces) // no immediate effect — see chess.js's triggerMine
  })

  it('appends to any existing mines rather than replacing them', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyCardEffect('freeze', gs, 'c3', 'white')
    gs = applyCardEffect('freeze', gs, 'd4', 'black')
    expect(gs.mines).toHaveLength(2)
  })

  it('refuses to lay a mine on an occupied square', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('freeze', gs, 'f6', 'white')
    expect(next.mines ?? []).toHaveLength(0)
    expect(next.pieces).toEqual(gs.pieces)
  })
})

describe('necromancy', () => {
  // Captured piece belongs to BLACK (the opponent) and was cut down by a
  // WHITE piece's move — a trophy white can now revive to fight for them,
  // not a piece white lost.
  function stateWithCapture(capturedType = 'knight') {
    const gs0 = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const captured = { type: capturedType, color: 'black', hp: 1 }
    const moveHistory = [{ from: 'b5', to: 'a6', piece: { type: 'pawn', color: 'white', hp: 1 }, captured }]
    return { ...gs0, moveHistory }
  }

  it('revives the captured piece onto an empty home-rank square', () => {
    const gs = stateWithCapture('knight')
    const next = applyCardEffect('necromancy', gs, 'knight', 'white')

    const revivedSquares = Object.entries(next.pieces)
      .filter(([sq, p]) => p.type === 'knight' && p.color === 'white' && sq !== 'a1')
    expect(revivedSquares).toHaveLength(1)
    const [square] = revivedSquares[0]
    expect(['1', '2']).toContain(square.slice(1)) // white's home ranks
    expect(next.moveHistory[0].captured.revived).toBe(true)
  })

  it('does nothing if that piece type was never captured', () => {
    const gs = stateWithCapture('knight')
    const next = applyCardEffect('necromancy', gs, 'queen', 'white')
    expect(next).toBe(gs)
  })

  it('does not offer the same capture twice — a revived piece can\'t be revived again', () => {
    const gs = stateWithCapture('knight')
    const once = applyCardEffect('necromancy', gs, 'knight', 'white')
    const twice = applyCardEffect('necromancy', once, 'knight', 'white')
    expect(twice).toBe(once) // no second knight materializes
  })

  it('does nothing if there is no empty home-rank square left', () => {
    const gs0 = stateWithCapture('knight')
    // Fill every white home square (ranks 1-2 on a 6-wide board).
    const pieces = { ...gs0.pieces }
    for (const col of ['a', 'b', 'c', 'd', 'e', 'f']) {
      pieces[`${col}1`] = { type: 'pawn', color: 'white', hp: 1 }
      pieces[`${col}2`] = { type: 'pawn', color: 'white', hp: 1 }
    }
    const gs = { ...gs0, pieces }
    const next = applyCardEffect('necromancy', gs, 'knight', 'white')
    expect(next).toBe(gs)
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

describe('unstable', () => {
  it('marks the target piece unstable with no immediate type change', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('unstable', gs, 'f6', 'white')
    expect(next.pieces.f6.type).toBe('pawn') // unchanged yet — see chess.js's tickUnstablePieces
    expect(next.pieces.f6.unstable.originalType).toBe('pawn')
    expect(next.pieces.f6.unstable.turnsLeft).toBe(6)
    // Telegraphed from the moment of casting — never a blind first shift.
    expect(next.pieces.f6.unstable.nextType).not.toBe('pawn')
    expect(['pawn', 'knight', 'bishop', 'rook', 'queen']).toContain(next.pieces.f6.unstable.nextType)
  })

  it('can target the caster\'s own piece', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('unstable', gs, 'a1', 'white')
    expect(next.pieces.a1.unstable.originalType).toBe('rook')
    expect(next.pieces.a1.unstable.turnsLeft).toBe(6)
    expect(next.pieces.a1.unstable.nextType).not.toBe('rook')
  })

  it('refuses to target a king', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'king', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyCardEffect('unstable', gs, 'a1', 'white')
    expect(next).toBe(gs)
  })

  it('refuses to re-target an already-unstable piece', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyCardEffect('unstable', gs, 'a1', 'white')
    const again = applyCardEffect('unstable', gs, 'a1', 'white')
    expect(again).toBe(gs)
  })
})
