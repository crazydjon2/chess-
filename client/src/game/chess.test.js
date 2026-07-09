import { describe, it, expect } from 'vitest'
import { applyMove, needsPromotion, getGameResult, tickFogZones, getFogCaptureSquares, tickMeteors, tickUnstablePieces, emptyHomeSquares } from './chess.js'
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
})

describe('no legal moves — always a decisive loss (no material tiebreak, no draw)', () => {
  it('the side with no legal move loses even holding MORE material and coins', () => {
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
    gs.coins = { white: 50, black: 0 } // white is richer in every way that used to matter...
    const result = getGameResult(gs)
    expect(result).toEqual({ type: 'no_moves', winner: 'black' }) // ...and still loses — stuck is stuck
  })

  it('equal material is irrelevant too — it is never a draw', () => {
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
    expect(result).toEqual({ type: 'no_moves', winner: 'black' })
  })
})

describe('timeouts (per-player clock)', () => {
  const start = 1_000_000

  it('a clock hitting zero is an outright loss, even with LESS material — never a capital tiebreak', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'rook', color: 'black', hp: 1 } }, // black has more material...
      [], [], null, 10, start,
    )
    // White takes the full 10 seconds to move — their clock hits exactly 0.
    const next = applyMove(gs, 'a1', 'a2', undefined, start + 10_000)
    expect(getGameResult(next)).toEqual({ type: 'timeout', winner: 'black' }) // ...and still wins
  })

  it('does not trigger early — plenty of time left is not a timeout', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, 180, start,
    )
    const next = applyMove(gs, 'a1', 'a2', undefined, start + 5_000) // used only 5 of 180s
    expect(getGameResult(next)).toBeNull()
    expect(next.timers.white).toBe(175)
    expect(next.timers.black).toBe(180) // untouched — it wasn't black's turn
  })

  it('only the mover\'s clock is charged, and it resets the turn-start baseline for the other side', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, 180, start,
    )
    let next = applyMove(gs, 'a1', 'a2', undefined, start + 5_000)
    expect(next.turn).toBe('black')
    expect(next.turnStartedAt).toBe(start + 5_000)
    // Black now takes 20s of their own 180s.
    next = applyMove(next, 'a6', 'a5', undefined, start + 25_000)
    expect(next.timers).toEqual({ white: 175, black: 160 })
  })

  it('untimed rounds (timeLimit null — sandbox mode) never produce a timeout', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    // A wildly long "turn" — still no timers to run out.
    const next = applyMove(gs, 'a1', 'a2', undefined, start + 999_999_999)
    expect(next.timers).toBeNull()
    expect(getGameResult(next)).toBeNull()
  })
})

describe('tickFogZones', () => {
  it('does NOT tick a zone on its own owner\'s move (own actions never burn their own cover)', () => {
    const zones = [{ owner: 'white', cells: ['a1'], turnsLeft: 2 }]
    const result = tickFogZones(zones, 'white')
    expect(result).toEqual([{ owner: 'white', cells: ['a1'], turnsLeft: 2 }])
  })

  it('ticks down when the OTHER color moves', () => {
    const zones = [{ owner: 'white', cells: ['a1'], turnsLeft: 2 }, { owner: 'black', cells: ['b2'], turnsLeft: 1 }]
    // Black moving ticks white's zone down but leaves black's own untouched.
    const once = tickFogZones(zones, 'black')
    expect(once).toEqual([{ owner: 'white', cells: ['a1'], turnsLeft: 1 }, { owner: 'black', cells: ['b2'], turnsLeft: 1 }])
  })

  it('drops a zone once its timer hits zero', () => {
    const zones = [{ owner: 'white', cells: ['a1'], turnsLeft: 1 }]
    expect(tickFogZones(zones, 'black')).toEqual([])
  })

  it('a fight breaking out inside the zone across several of the caster\'s own moves does not burn the timer', () => {
    let zones = [{ owner: 'white', cells: ['a1'], turnsLeft: 2 }]
    // White casts, then moves repeatedly (e.g. capturing inside their own
    // fog) — none of white's own moves should cost the zone anything.
    zones = tickFogZones(zones, 'white')
    zones = tickFogZones(zones, 'white')
    zones = tickFogZones(zones, 'white')
    expect(zones).toEqual([{ owner: 'white', cells: ['a1'], turnsLeft: 2 }])
    // Only black's moves actually wear it down.
    zones = tickFogZones(zones, 'black')
    expect(zones[0].turnsLeft).toBe(1)
    zones = tickFogZones(zones, 'black')
    expect(zones).toEqual([])
  })

  it('handles undefined input as an empty list', () => {
    expect(tickFogZones(undefined, 'white')).toEqual([])
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

describe('tickUnstablePieces', () => {
  it('leaves untouched pieces alone', () => {
    const pieces = { a1: { type: 'rook', color: 'white', hp: 1 } }
    expect(tickUnstablePieces(pieces)).toBe(pieces)
  })

  it('reassigns an unstable piece to a different type and decrements its timer', () => {
    const pieces = { a1: { type: 'rook', color: 'white', hp: 1, unstable: { originalType: 'rook', turnsLeft: 6 } } }
    const next = tickUnstablePieces(pieces)
    expect(next.a1.unstable.turnsLeft).toBe(5)
    expect(next.a1.type).not.toBe('rook')
    expect(['pawn', 'knight', 'bishop', 'rook', 'queen']).toContain(next.a1.type)
  })

  it('reverts to the original type and clears the flag once the timer runs out', () => {
    const pieces = { a1: { type: 'queen', color: 'white', hp: 1, unstable: { originalType: 'rook', turnsLeft: 1 } } }
    const next = tickUnstablePieces(pieces)
    expect(next.a1.type).toBe('rook')
    expect(next.a1.unstable).toBeUndefined()
  })

  it('preserves other piece fields (color, hp) through a shapeshift', () => {
    const pieces = { a1: { type: 'rook', color: 'black', hp: 2, unstable: { originalType: 'rook', turnsLeft: 3 } } }
    const next = tickUnstablePieces(pieces)
    expect(next.a1.color).toBe('black')
    expect(next.a1.hp).toBe(2)
  })
})

describe('applyMove: unstable piece ticking', () => {
  it('ticks an unstable piece down on every move, same as fog/mines', () => {
    const gs0 = createDraftRoundState(
      boardPattern,
      { a5: { type: 'pawn', color: 'white', hp: 1 }, e1: { type: 'rook', color: 'white', hp: 1, unstable: { originalType: 'rook', turnsLeft: 1 } } },
      { f1: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const next = applyMove(gs0, 'a5', 'a6')
    expect(next.pieces.e1.type).toBe('rook') // reverted, timer hit 0
    expect(next.pieces.e1.unstable).toBeUndefined()
  })
})

describe('applyMove: freeze mine trigger', () => {
  it('freezes an enemy piece that lands on the mine and consumes it', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { b6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const mined = applyCardEffect('freeze', gs, 'a2', 'white')
    const next  = applyMove(mined, 'a1', 'a2') // white steps onto its OWN mine — no trigger
    expect(next.pieces.a2.frozen).toBeFalsy()
    expect(next.mines).toEqual([{ owner: 'white', square: 'a2' }]) // untouched, still armed
    expect(next.mineStrike).toBeNull()
  })

  it('triggers when the OPPONENT lands on it, freezing them for their own next turn', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { b3: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    let mined = applyCardEffect('freeze', gs, 'b2', 'white')
    mined = { ...mined, turn: 'black' }
    const next = applyMove(mined, 'b3', 'b2') // black steps onto white's mine
    expect(next.pieces.b2).toEqual({ type: 'pawn', color: 'black', hp: 1, frozen: 1 })
    expect(next.mines).toEqual([]) // consumed
    expect(next.mineStrike).toEqual({ square: 'b2', owner: 'white' })
  })

  it('does not trigger on a bounce (attacker never actually lands on the mine square)', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { b2: { type: 'barricade', color: 'neutral', hp: 2 } },
      [], [], null, null,
    )
    let mined = applyCardEffect('freeze', { ...gs, pieces: { a1: gs.pieces.a1 } }, 'b2', 'black')
    // Barricade re-added after laying the mine (freeze refuses an occupied square).
    mined = { ...mined, pieces: { ...mined.pieces, b2: { type: 'barricade', color: 'neutral', hp: 2 } } }
    const next = applyMove(mined, 'a1', 'b2') // white's pawn bounces off the 2-hp barricade
    expect(next.pieces.a1).toEqual({ type: 'pawn', color: 'white', hp: 1 }) // stayed on `from`
    expect(next.mines).toEqual([{ owner: 'black', square: 'b2' }]) // untouched
    expect(next.mineStrike).toBeNull()
  })
})

describe('emptyHomeSquares', () => {
  it('lists only empty squares on the color\'s own two home ranks', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 }, b2: { type: 'knight', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const squares = emptyHomeSquares(gs, 'white')
    expect(squares).not.toContain('a1') // occupied
    expect(squares).not.toContain('b2') // occupied
    expect(squares).toContain('c1')
    expect(squares.every(sq => ['1', '2'].includes(sq.slice(1)))).toBe(true) // only ranks 1-2
  })

  it('uses the OTHER color\'s home ranks for the opponent', () => {
    const gs = createDraftRoundState(
      boardPattern,
      { a1: { type: 'pawn', color: 'white', hp: 1 } },
      { a6: { type: 'pawn', color: 'black', hp: 1 } },
      [], [], null, null,
    )
    const squares = emptyHomeSquares(gs, 'black')
    expect(squares.every(sq => ['5', '6'].includes(sq.slice(1)))).toBe(true)
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
