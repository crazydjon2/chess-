import { describe, it, expect } from 'vitest'
import { applyCardEffect } from './cardEffects.js'
import { createDraftRoundState } from './initialState.js'
import { applyMove, getGameResult } from './chess.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

describe('smoke_screen', () => {
  it('creates a fog zone covering the full 3x3 neighborhood in the open board', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { c3: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null,
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
      [], [], null,
    )
    const next = applyCardEffect('smoke_screen', gs, 'a1', 'white')
    expect(next.fogZones[0].cells.sort()).toEqual(['a1', 'a2', 'b1', 'b2'].sort())
  })

  it('appends to any existing fog zones rather than replacing them', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 }, f1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null,
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
      [], [], null,
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
      [], [], null,
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
      [], [], null,
    )
    const next = applyCardEffect('freeze', gs, 'f6', 'white')
    expect(next.mines ?? []).toHaveLength(0)
    expect(next.pieces).toEqual(gs.pieces)
  })
})

describe('meteor', () => {
  it('registers a delayed strike without touching pieces yet', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null,
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
      [], [], null,
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
      { f6: { type: 'knight', color: 'black', hp: 1 } },
      [], [], null,
    )
    const next = applyCardEffect('unstable', gs, 'f6', 'white')
    expect(next.pieces.f6.type).toBe('knight') // unchanged yet — see chess.js's tickUnstablePieces
    expect(next.pieces.f6.unstable.originalType).toBe('knight')
    expect(next.pieces.f6.unstable.turnsLeft).toBe(6)
    // Telegraphed from the moment of casting — never a blind first shift.
    expect(next.pieces.f6.unstable.nextType).not.toBe('knight')
    expect(['bishop', 'rook', 'queen']).toContain(next.pieces.f6.unstable.nextType)
  })

  it('never shifts anything into a pawn — no temporary effect may end in a promotion', () => {
    let pieces = { a1: { type: 'rook', color: 'white', hp: 1 } }
    let gs = createDraftRoundState(boardPattern, pieces, { f6: { type: 'king', color: 'black', hp: 1 } }, [], [], null)
    for (let i = 0; i < 50; i++) {
      const next = applyCardEffect('unstable', gs, 'a1', 'white')
      expect(next.pieces.a1.unstable.nextType).not.toBe('pawn')
    }
    gs = { ...gs, pieces: { ...gs.pieces, b2: { type: 'pawn', color: 'white', hp: 1 } } }
    expect(applyCardEffect('unstable', gs, 'b2', 'white')).toBe(gs) // pawns can't be made unstable at all
  })

  it('can target the caster\'s own piece', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null,
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
      [], [], null,
    )
    const next = applyCardEffect('unstable', gs, 'a1', 'white')
    expect(next).toBe(gs)
  })

  it('refuses to re-target an already-unstable piece', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null,
    )
    gs = applyCardEffect('unstable', gs, 'a1', 'white')
    const again = applyCardEffect('unstable', gs, 'a1', 'white')
    expect(again).toBe(gs)
  })
})

describe('shield', () => {
  const board = { rows: 6, cols: 6, blockedCells: [] }

  it('gives an own piece — the king too — a second HP', () => {
    const gs = createDraftRoundState(board, { a1: { type: 'king', color: 'white', hp: 1 } }, { f6: { type: 'king', color: 'black', hp: 1 } }, [], [], null)
    const next = applyCardEffect('shield', gs, 'a1', 'white')
    expect(next.pieces.a1.hp).toBe(2)
  })

  it('never stacks and never touches enemy pieces', () => {
    const gs = createDraftRoundState(board, { a1: { type: 'rook', color: 'white', hp: 2 } }, { f6: { type: 'rook', color: 'black', hp: 1 } }, [], [], null)
    expect(applyCardEffect('shield', gs, 'a1', 'white')).toBe(gs)
    expect(applyCardEffect('shield', gs, 'f6', 'white')).toBe(gs)
  })

  it('a shielded piece bounces the first attack and dies to the second', () => {
    let gs = createDraftRoundState(board, { a1: { type: 'rook', color: 'white', hp: 1 } }, { a6: { type: 'king', color: 'black', hp: 1 }, f6: { type: 'pawn', color: 'black', hp: 1 } }, [], [], null)
    gs = applyCardEffect('shield', { ...gs, turn: 'black' }, 'a6', 'black')
    gs = { ...gs, turn: 'white' }
    gs = applyMove(gs, 'a1', 'a6')
    expect(gs.pieces.a1.type).toBe('rook')            // attacker bounced back
    expect(gs.pieces.a6).toMatchObject({ type: 'king', hp: 1 })
    gs = applyMove(gs, 'f6', 'f5')
    gs = applyMove(gs, 'a1', 'a6')
    expect(gs.pieces.a6.type).toBe('rook')
    expect(getGameResult(gs)).toEqual({ type: 'king_captured', winner: 'white' })
  })
})
