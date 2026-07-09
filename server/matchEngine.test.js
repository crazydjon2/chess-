import { describe, it, expect } from 'vitest'
import { startRound, applyRoundResult, tryDraftBan, tryDraftBuy } from './matchEngine.js'

function matchWithGameState(gameState) {
  const match = startRound({ white: 0, black: 0 }, 1, 'white')
  return { ...match, phase: 'battle', gameState }
}

function passBans(match) {
  const round1 = tryDraftBan(match, 'white', [{ kind: 'piece', pieceType: 'knight' }])
  const round2 = tryDraftBan(round1.match, 'black', [{ kind: 'piece', pieceType: 'knight' }])
  return round2.match
}

describe('draft ban/buy — leftover budget becomes starting battle coins', () => {
  it('rejects a buy submission before both sides have banned', () => {
    const match = startRound({ white: 0, black: 0 }, 1, 'white')
    const res = tryDraftBuy(match, 'white', [])
    expect(res.error).toBeTruthy()
  })

  it('starts every round with zero starting coins', () => {
    const match = startRound({ white: 0, black: 0 }, 1, 'white')
    expect(match.startingCoins).toEqual({ white: 0, black: 0 })
  })

  it('sets startingCoins to each color\'s unspent budget once the draft completes', () => {
    let match = passBans(startRound({ white: 0, black: 0 }, 1, 'white'))
    const budget = match.draft.budgets.white
    expect(match.draft.budgets.black).toBe(budget) // identical starting budgets

    // Buy nothing — the whole budget should become starting battle coins.
    match = tryDraftBuy(match, 'white', []).match
    const res = tryDraftBuy(match, 'black', [])
    expect(res.error).toBeUndefined()
    match = res.match

    expect(match.phase).toBe('placement')
    expect(match.startingCoins.white).toBe(budget)
    expect(match.startingCoins.black).toBe(budget)
  })
})

describe('applyRoundResult', () => {
  // Every round is a clean slate — nothing from the finished round's board
  // (surviving pieces, unused cards, leftover coins) seeds the next one.
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
      coins: { white: 4, black: 1 },
    })
    const next = applyRoundResult(match, { type: 'elimination', winner: 'white' })

    expect(next.phase).toBe('draft')
    expect(next.previousRound).toBe(1)
    expect(next.startingCoins).toEqual({ white: 0, black: 0 })
    expect(next.draft.picks).toEqual({ white: null, black: null })
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
      coins: { white: 0, black: 0 },
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
      coins: { white: 0, black: 0 },
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
      coins: { white: 0, black: 0 },
    })
    const next = applyRoundResult(match, { type: 'draw', reason: 'mutual_elimination' })
    expect(next.scores).toEqual({ white: 0, black: 0 })
  })

  it('ends the match once a side reaches the rounds-to-win threshold', () => {
    let match = matchWithGameState({
      pieces: {},
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
      coins: { white: 0, black: 0 },
    })
    match = { ...match, scores: { white: 1, black: 0 } } // one win already banked
    const next = applyRoundResult(match, { type: 'elimination', winner: 'white' })
    expect(next.phase).toBe('match_over')
    expect(next.scores.white).toBe(2)
  })
})
