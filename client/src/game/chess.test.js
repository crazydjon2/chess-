import { describe, it, expect } from 'vitest'
import { applyMove, needsPromotion, getGameResult, tickFogZones, tickHpBoost, getFogCaptureSquares, tickMeteors } from './chess.js'
import { applyCardEffect } from './cardEffects.js'
import { createDraftRoundState } from './initialState.js'

const boardPattern = { rows: 6, cols: 6, blockedCells: [] }

describe('pawn promotion', () => {
  it('defaults to queen when no promotion type is given', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 } },
      { f1: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    expect(needsPromotion(gs, 'a5', 'a6')).toBe(true)
    const next = applyMove(gs, 'a5', 'a6')
    expect(next.pieces.a6.type).toBe('queen')
  })

  it('promotes to the chosen type', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 } },
      { f1: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyMove(gs, 'a5', 'a6', 'knight')
    expect(next.pieces.a6.type).toBe('knight')
  })

  it('does not trigger on an hp-bounce capture (pawn stays on `from`)', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 } },
      { b6: { type: 'barricade', color: 'neutral', hp: 2 } },
      [], [], null, null,
    )
    expect(needsPromotion(gs, 'a5', 'b6')).toBe(false)
  })

  it('rollback restores the pre-promotion pawn, not the promoted piece', () => {
    let gs = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 } },
      { c1: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    gs = applyMove(gs, 'a5', 'a6', 'queen') // white promotes; turn -> black
    expect(gs.pieces.a6.type).toBe('queen')

    const rolledBack = applyCardEffect('rollback', gs, 'a6', 'black')
    expect(rolledBack.pieces.a5).toEqual({ type: 'pawn', color: 'white', hp: 1 })
    expect(rolledBack.pieces.a6).toBeUndefined()
  })
})

describe('draws and material-decided results', () => {
  it('no legal moves + unequal material -> the richer side wins, not a draw', () => {
    const gs = createDraftRoundState(
      boardPattern,
      {
        a1: { type: 'pawn', color: 'white', hp: 1 },
        c1: { type: 'pawn', color: 'white', hp: 1 },
      },
      {
        f6: { type: 'pawn', color: 'black', hp: 1 },
        a2: { type: 'barricade', color: 'neutral', hp: 2 },
        c2: { type: 'barricade', color: 'neutral', hp: 2 },
      },
      [], [], null, null,
    )
    gs.turn = 'white' // both white pawns are jammed by the barricades, 0 legal moves
    const result = getGameResult(gs)
    expect(result).toEqual({ type: 'no_moves', winner: 'white' })
  })

  it('no legal moves + equal material -> a genuine draw', () => {
    const gs = createDraftRoundState(
      boardPattern,
      {
        a1: { type: 'pawn', color: 'white', hp: 1 },
        c1: { type: 'pawn', color: 'white', hp: 1 },
      },
      {
        f6: { type: 'pawn', color: 'black', hp: 1 },
        e6: { type: 'pawn', color: 'black', hp: 1 },
        a2: { type: 'barricade', color: 'neutral', hp: 2 },
        c2: { type: 'barricade', color: 'neutral', hp: 2 },
      },
      [], [], null, null,
    )
    gs.turn = 'white'
    const result = getGameResult(gs)
    expect(result).toEqual({ type: 'draw', reason: 'no_moves' })
  })

  it('move limit hit + unequal material -> the richer side wins', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'rook', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, 2,
    )
    let next = applyMove(gs, 'a1', 'b1')
    next = applyMove(next, 'a6', 'b6')
    expect(getGameResult(next)).toEqual({ type: 'move_limit', winner: 'white' })
  })

  it('move limit hit + equal material -> a draw', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, 2,
    )
    let next = applyMove(gs, 'a1', 'b1')
    next = applyMove(next, 'a6', 'b6')
    expect(getGameResult(next)).toEqual({ type: 'draw', reason: 'move_limit' })
  })
})

describe('tickFogZones', () => {
  it('decrements turnsLeft and drops zones that hit zero', () => {
    const zones = [{ owner: 'white', cells: ['a1'], turnsLeft: 2 }, { owner: 'black', cells: ['b2'], turnsLeft: 1 }]
    const once = tickFogZones(zones)
    expect(once).toEqual([{ owner: 'white', cells: ['a1'], turnsLeft: 1 }])
    expect(tickFogZones(once)).toEqual([])
  })

  it('handles undefined input as an empty list', () => {
    expect(tickFogZones(undefined)).toEqual([])
  })
})

describe('tickHpBoost', () => {
  it('removes the unspent bonus HP once the timer runs out', () => {
    const pieces = { a1: { type: 'pawn', color: 'white', hp: 2, hpBoostTurns: 1 } }
    const next = tickHpBoost(pieces, 'white')
    expect(next.a1).toEqual({ type: 'pawn', color: 'white', hp: 1 })
  })

  it('just clears the timer (no extra HP loss) if the buff was already spent by a hit', () => {
    const pieces = { a1: { type: 'pawn', color: 'white', hp: 1, hpBoostTurns: 1 } }
    const next = tickHpBoost(pieces, 'white')
    expect(next.a1).toEqual({ type: 'pawn', color: 'white', hp: 1 })
  })

  it('only decrements the timer (no HP change) while turns remain', () => {
    const pieces = { a1: { type: 'pawn', color: 'white', hp: 2, hpBoostTurns: 2 } }
    const next = tickHpBoost(pieces, 'white')
    expect(next.a1).toEqual({ type: 'pawn', color: 'white', hp: 2, hpBoostTurns: 1 })
  })

  it('ignores pieces of the other color', () => {
    const pieces = { a1: { type: 'pawn', color: 'black', hp: 2, hpBoostTurns: 1 } }
    expect(tickHpBoost(pieces, 'white')).toBe(pieces)
  })
})

describe('tickMeteors', () => {
  it('does NOT tick the caster\'s own move (only the opponent\'s move counts as progress)', () => {
    const pieces  = { e4: { type: 'pawn', color: 'black', hp: 1 } }
    const meteors = [{ owner: 'white', square: 'e4', turnsLeft: 2 }]
    // White is the mover here (their own residual move this same turn) —
    // their own meteor must stay untouched.
    const result = tickMeteors(pieces, meteors, 'white')
    expect(result.meteors).toEqual([{ owner: 'white', square: 'e4', turnsLeft: 2 }])
    expect(result.pieces).toBe(pieces)
  })

  it('ticks down when the OTHER color moves', () => {
    const pieces  = { e4: { type: 'pawn', color: 'black', hp: 1 } }
    const meteors = [{ owner: 'white', square: 'e4', turnsLeft: 2 }]
    const result = tickMeteors(pieces, meteors, 'black')
    expect(result.meteors).toEqual([{ owner: 'white', square: 'e4', turnsLeft: 1 }])
  })

  it('detonates once the timer hits 0, destroying whatever is on the square', () => {
    const pieces  = { e4: { type: 'pawn', color: 'black', hp: 1 } }
    const meteors = [{ owner: 'white', square: 'e4', turnsLeft: 1 }]
    const result = tickMeteors(pieces, meteors, 'black')
    expect(result.meteors).toEqual([])
    expect(result.pieces.e4).toBeUndefined()
  })

  it('detonates harmlessly if the target square is empty by then (the piece moved away)', () => {
    const pieces  = { a1: { type: 'rook', color: 'black', hp: 1 } }
    const meteors = [{ owner: 'white', square: 'e4', turnsLeft: 1 }]
    const result = tickMeteors(pieces, meteors, 'black')
    expect(result.meteors).toEqual([])
    expect(result.pieces).toBe(pieces)
  })

  it('two full moves after casting is exactly when it lands (not 2 plies)', () => {
    const meteors0 = [{ owner: 'white', square: 'e4', turnsLeft: 2 }]
    // Cast during white's turn, white's own residual move this turn: no tick.
    let r = tickMeteors({}, meteors0, 'white')
    expect(r.meteors[0].turnsLeft).toBe(2)
    // Black moves (1st full move elapsed): tick to 1.
    r = tickMeteors({}, r.meteors, 'black')
    expect(r.meteors[0].turnsLeft).toBe(1)
    // White moves again: no tick (still their own meteor).
    r = tickMeteors({}, r.meteors, 'white')
    expect(r.meteors[0].turnsLeft).toBe(1)
    // Black moves again (2nd full move elapsed): detonates.
    r = tickMeteors({}, r.meteors, 'black')
    expect(r.meteors).toEqual([])
  })
})

describe('getFogCaptureSquares', () => {
  it('offers a pawn\'s diagonal square as a click target when it sits inside an active enemy fog zone, even though no piece is visible there locally', () => {
    // b2 is fogged and empty from this client's perspective (the real enemy
    // piece there was redacted by the server) — pawnMoves alone would never
    // offer it, since a pawn can't move diagonally into what looks like
    // empty space.
    const gs = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { a1: { type: 'pawn', color: 'white', hp: 1 } },
      fogZones: [{ owner: 'black', cells: ['b2'], turnsLeft: 3 }],
    }
    expect(getFogCaptureSquares(gs, 'a1')).toEqual(['b2'])
  })

  it('returns nothing once the real piece is actually visible (no redaction in play)', () => {
    const gs = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { a1: { type: 'pawn', color: 'white', hp: 1 }, b2: { type: 'pawn', color: 'black', hp: 1 } },
      fogZones: [{ owner: 'black', cells: ['b2'], turnsLeft: 3 }],
    }
    expect(getFogCaptureSquares(gs, 'a1')).toEqual([]) // pawnMoves already offers it — nothing extra to add
  })

  it('returns nothing outside any active fog zone', () => {
    const gs = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { a1: { type: 'pawn', color: 'white', hp: 1 } },
      fogZones: [],
    }
    expect(getFogCaptureSquares(gs, 'a1')).toEqual([])
  })

  it('returns nothing for a non-pawn piece', () => {
    const gs = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { a1: { type: 'knight', color: 'white', hp: 1 } },
      fogZones: [{ owner: 'black', cells: ['b3'], turnsLeft: 3 }],
    }
    expect(getFogCaptureSquares(gs, 'a1')).toEqual([])
  })
})
