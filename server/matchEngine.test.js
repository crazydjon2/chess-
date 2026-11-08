import { describe, it, expect } from 'vitest'
import { draftTimeout, startRound, applyRoundResult, tryDraftPick, tryDraftDone, trySummaryContinue, summaryTimeout } from './matchEngine.js'
import { freeHomeSquares } from '../client/src/game/draftEngine.js'

const pawnOn = (match, color) => ({ kind: 'piece', pieceType: 'pawn', square: freeHomeSquares(match.draft, color)[0] })
const kingOn = (match, color) => ({ kind: 'piece', pieceType: 'king', square: freeHomeSquares(match.draft, color)[0] })
// Both players' mandatory first action: their king.
function withKingsPlaced(match) {
  match = tryDraftPick(match, match.draft.turn, kingOn(match, match.draft.turn)).match
  return tryDraftPick(match, match.draft.turn, kingOn(match, match.draft.turn)).match
}
import { shopPieceCost } from '../client/src/game/economy.js'

function matchWithGameState(gameState) {
  const match = startRound({ white: 0, black: 0 }, 1, 'white')
  return { ...match, phase: 'battle', gameState }
}

describe('turn-based draft', () => {
  it('rejects a pick when it is not that color\'s turn', () => {
    const match = startRound({ white: 0, black: 0 }, 1, 'white') // white picks first
    const res = tryDraftPick(match, 'black', { kind: 'piece', pieceType: 'pawn' })
    expect(res.error).toBeTruthy()
  })

  it('starts the battle with the recruited armies once both sides finish', () => {
    let match = withKingsPlaced(startRound({ white: 0, black: 0 }, 1, 'white'))
    const budget = match.draft.budgets.white
    expect(match.draft.budgets.black).toBe(budget) // identical starting budgets

    // Each side buys the cheapest possible piece (a pawn) then declares
    // done — whatever budget is left simply goes unspent.
    const wSq = freeHomeSquares(match.draft, 'white')[0]
    match = tryDraftPick(match, 'white', pawnOn(match, 'white')).match
    const bSq = freeHomeSquares(match.draft, 'black')[0]
    match = tryDraftPick(match, 'black', pawnOn(match, 'black')).match
    match = tryDraftDone(match, 'white').match
    const res = tryDraftDone(match, 'black')
    expect(res.error).toBeUndefined()
    match = res.match

    expect(match.phase).toBe('battle')
    expect(match.gameState.pieces[wSq]).toMatchObject({ type: 'pawn', color: 'white' })
    expect(match.gameState.pieces[bSq]).toMatchObject({ type: 'pawn', color: 'black' })
    const kings = Object.values(match.gameState.pieces).filter(p => p.type === 'king')
    expect(kings).toHaveLength(2)
  })

  it('rejects a piece without a free home square', () => {
    const match = withKingsPlaced(startRound({ white: 0, black: 0 }, 1, 'white'))
    expect(tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'pawn' }).error).toBe('err.notYourHalf')
    const kingSq = Object.keys(match.draft.placed.white)[0]
    expect(tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'pawn', square: kingSq }).error).toBe('err.notYourHalf')
    const enemySq = freeHomeSquares(match.draft, 'black')[0]
    expect(tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'pawn', square: enemySq }).error).toBe('err.notYourHalf')
  })

  it('the first action must be the king; it is free, ends the turn and stays put', () => {
    let match = startRound({ white: 0, black: 0 }, 1, 'white')
    expect(tryDraftPick(match, 'white', pawnOn(match, 'white')).error).toBe('err.placeKingFirst')
    expect(tryDraftDone(match, 'white').error).toBe('err.placeKingFirst')
    const budget = match.draft.budgets.white
    const sq = freeHomeSquares(match.draft, 'white')[3]
    match = tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'king', square: sq }).match
    expect(match.draft.placed.white).toEqual({ [sq]: 'king' })
    expect(match.draft.budgets.white).toBe(budget)
    expect(match.draft.turn).toBe('black')
    match = tryDraftPick(match, 'black', kingOn(match, 'black')).match
    // a second king is not for sale
    expect(tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'king', square: freeHomeSquares(match.draft, 'white')[0] }).error).toBeTruthy()
  })

  it('a player who times out before placing the king gets it on the default square', () => {
    let match = startRound({ white: 0, black: 0 }, 1, 'white')
    match = draftTimeout(match, match.draft.turnStartedAt + 1e6)
    expect(Object.values(match.draft.placed.white)).toEqual(['king'])
    expect(match.draft.done.white).toBe(true)
  })


  it('a color with no budget left for anything is auto-skipped without needing to declare done', () => {
    let match = withKingsPlaced(startRound({ white: 0, black: 0 }, 1, 'white'))
    match = { ...match, draft: { ...match.draft, budgets: { ...match.draft.budgets, white: shopPieceCost('pawn') } } }
    match = tryDraftPick(match, 'white', pawnOn(match, 'white')).match
    expect(match.draft.done.white).toBe(true)
    expect(match.draft.turn).toBe('black')
  })
})

describe('applyRoundResult', () => {
  // Every round is a clean slate — nothing from the finished round's board
  // (surviving pieces, unused cards) seeds the next one.
  it('starts the next round with a completely fresh draft — nothing carries over', () => {
    const match = matchWithGameState({
      pieces: {
        a1: { type: 'rook', color: 'white', hp: 1 },
        b1: { type: 'pawn', color: 'white', hp: 1 },
      },
      cards: {
        white: { hand: [{ id: 'freeze' }], used: [] },
        black: { hand: [], used: [] },
      },
    })
    const next = applyRoundResult(match, { type: 'elimination', winner: 'white' })

    expect(next.phase).toBe('draft')
    expect(next.previousRound).toBe(1)
    expect(next.draft.picks).toEqual({
      white: { pieces: ['king'], cards: [] },
      black: { pieces: ['king'], cards: [] },
    })
    expect(next.gameState).toBeNull()
    expect(next.scores).toEqual({ white: 0, black: 1 })
    // The finished round's own board is otherwise lost the moment the next
    // round's (null) gameState replaces it — keep it around so the round
    // summary screen can show players the position the round ended on.
    expect(next.previousGameState).toBe(match.gameState)
  })

  // Sides swap every round, so a color's running score reattaches under the
  // OTHER color's key next round — the same physical player who was white
  // (and just won) is black next round, carrying their win with them.
  it('swaps the running score across the color swap so wins follow the physical player', () => {
    const match = matchWithGameState({
      pieces: {},
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
    })
    const withScore = { ...match, scores: { white: 1, black: 0 } }
    const next = applyRoundResult(withScore, { type: 'draw', reason: 'mutual_elimination' })
    expect(next.scores).toEqual({ white: 0, black: 1 })
  })

  // The color that drafts first must stay the SAME label round to round.
  // rooms.js's swapPlayerColors reassigns that label to the other physical
  // player every round, so keeping the label fixed here is what actually
  // makes the two humans alternate going first — alternating the label too
  // (as a naive "round % 2" scheme would) cancels that swap out and leaves
  // the same physical player drafting first every single round.
  it('keeps the same first-picking color label across a round transition', () => {
    const match = matchWithGameState({
      pieces: {},
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
    })
    expect(match.draft.firstColor).toBe('white')
    const round2 = applyRoundResult(match, { type: 'draw', reason: 'mutual_elimination' })
    expect(round2.draft.firstColor).toBe('white')
    const round3 = applyRoundResult({ ...round2, phase: 'battle', gameState: match.gameState }, { type: 'draw', reason: 'mutual_elimination' })
    expect(round3.draft.firstColor).toBe('white')
  })

  it('a draw does not change the score', () => {
    const match = matchWithGameState({
      pieces: {},
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
    })
    const next = applyRoundResult(match, { type: 'draw', reason: 'mutual_elimination' })
    expect(next.scores).toEqual({ white: 0, black: 0 })
  })

  it('ends the match once a side reaches the rounds-to-win threshold', () => {
    let match = matchWithGameState({
      pieces: {},
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
    })
    match = { ...match, scores: { white: 1, black: 0 } } // one win already banked
    const next = applyRoundResult(match, { type: 'elimination', winner: 'white' })
    expect(next.phase).toBe('match_over')
    expect(next.scores.white).toBe(2)
  })
})

describe('round summary wait before the next draft', () => {
  function nextRound(now = 1_000) {
    const match = matchWithGameState({ pieces: {}, cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } } })
    return applyRoundResult(match, { type: 'king_captured', winner: 'white' }, now)
  }

  it('keeps draft clocks paused and picks blocked until both continue', () => {
    let match = nextRound()
    expect(match.draft.turnStartedAt).toBeNull()
    expect(tryDraftPick(match, 'white', { kind: 'piece', pieceType: 'pawn' }).error).toBeTruthy()

    match = trySummaryContinue(match, 'white', 2_000).match
    expect(match.draft.turnStartedAt).toBeNull() // still waiting on black
    match = trySummaryContinue(match, 'black', 3_000).match
    expect(match.draft.turnStartedAt).toBe(3_000)
    expect(tryDraftPick(match, 'white', kingOn(match, 'white'), 4_000).error).toBeUndefined()
  })

  it('starts the draft anyway once the cap runs out', () => {
    const match = summaryTimeout(nextRound(), 40_000)
    expect(match.summaryReady).toEqual({ white: true, black: true })
    expect(match.draft.turnStartedAt).toBe(40_000)
  })
})
