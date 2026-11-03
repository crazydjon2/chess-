import { describe, it, expect } from 'vitest'
import { getValidTargets, hasRescueCard } from './cards.js'
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
      [], [], null,
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
      [], [], null,
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
      [], [], null,
    )
    gs = applyCardEffect('freeze', gs, 'c3', 'white')
    expect(getValidTargets('freeze', gs, 'black')).not.toContain('c3')
  })
})

describe('smoke_screen targeting', () => {
  it('can be cast on any square — empty, own piece, or enemy piece', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['smoke_screen'], [], null,
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
      ['meteor'], [], null,
    )

    const targets = getValidTargets('meteor', gs, 'white')
    expect(targets).toContain('b2') // own piece
    expect(targets).toContain('f6') // enemy piece
    expect(targets).toContain('a1') // empty square
    expect(targets).toContain('c3') // blocked hole (a legal but wasted cast)
  })
})

describe('unstable targeting', () => {
  it('offers own and enemy pieces, but not empty squares, kings, barricades, or pawns', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 }, a1: { type: 'king', color: 'white', hp: 1 }, c1: { type: 'rook', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['unstable'], [], null,
    )
    const s = { ...gs, pieces: { ...gs.pieces, c3: { type: 'barricade', color: 'neutral', hp: 2 } } }

    const targets = getValidTargets('unstable', s, 'white')
    expect(targets).toContain('c1') // own piece
    expect(targets).not.toContain('a1') // king
    expect(targets).not.toContain('c3') // barricade
    expect(targets).not.toContain('d4') // empty square
    expect(targets).not.toContain('b2') // own pawn
    expect(targets).not.toContain('f6') // enemy pawn
  })

  // A disguised pawn could walk to the far rank in a strong shifted form,
  // safe from the promotion-rank risk a real pawn run would carry, then
  // shift/revert back to 'pawn' while already parked there — an unearned,
  // untelegraphed promotion. Blocking pawns from being targeted at all
  // closes this off at the source.
  it('excludes pawns, own or enemy, as a target', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    const gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'pawn', color: 'black', hp: 1 } },
      ['unstable'], [], null,
    )
    const targets = getValidTargets('unstable', gs, 'white')
    expect(targets).not.toContain('b2')
    expect(targets).not.toContain('f6')
  })

  it('excludes a piece that is already unstable', () => {
    const boardPattern = { rows: 6, cols: 6, blockedCells: [] }
    let gs = createDraftRoundState(
      boardPattern,
      { b2: { type: 'pawn', color: 'white', hp: 1 } },
      { f6: { type: 'rook', color: 'black', hp: 1 } },
      ['unstable'], [], null,
    )
    gs = applyCardEffect('unstable', gs, 'f6', 'white')
    expect(getValidTargets('unstable', gs, 'white')).not.toContain('f6')
  })
})

describe('hasRescueCard', () => {
  // A rook walled into a corner by two blocked holes (a2, b1) has zero
  // legal moves on its own — a genuine "no_moves" position — but add_cell
  // can carve out a brand-new square (a0) directly adjacent to it.
  function boxedRookState(cardIds) {
    const boardPattern = { rows: 3, cols: 3, blockedCells: ['a2', 'b1'] }
    return createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { c3: { type: 'pawn', color: 'black', hp: 1 } },
      cardIds, [], null,
    )
  }

  it('true when add_cell would open a legal move for an edge-boxed piece', () => {
    const gs = boxedRookState(['add_cell'])
    expect(hasRescueCard(gs, 'white')).toBe(true)
  })

  it('false when the only card in hand cannot open any move (a barricade can\'t unblock anything)', () => {
    const gs = boxedRookState(['barricade'])
    expect(hasRescueCard(gs, 'white')).toBe(false)
  })

  it('false with an empty hand', () => {
    const gs = boxedRookState([])
    expect(hasRescueCard(gs, 'white')).toBe(false)
  })

  it('false once a card has already been played this turn — only one per turn', () => {
    const gs = { ...boxedRookState(['add_cell']), cardPlayedThisTurn: true }
    expect(hasRescueCard(gs, 'white')).toBe(false)
  })
})

describe('cards with a king under attack (draft mode)', () => {
  it('stay playable — there is no check rule to filter them by', () => {
    const gs = createDraftRoundState(
      { rows: 6, cols: 6, blockedCells: [] },
      { a1: { type: 'king', color: 'white', hp: 1 } },
      { a6: { type: 'rook', color: 'black', hp: 1 }, f6: { type: 'king', color: 'black', hp: 1 } },
      ['freeze'], [], null,
    )
    expect(getValidTargets('freeze', gs, 'white').length).toBeGreaterThan(0)
  })
})
