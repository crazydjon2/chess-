import { describe, it, expect } from 'vitest'
import { startRound, applyRoundResult, tryDraftBan, tryDraftBuy } from './matchEngine.js'
import { BUDGET_BY_ROUND } from '../client/src/game/draftPools.js'

function matchWithGameState(gameState) {
  const match = startRound({ white: 0, black: 0 }, 1, 'white', null)
  return { ...match, phase: 'battle', gameState }
}

function passBans(match) {
  const round1 = tryDraftBan(match, 'white', [{ kind: 'piece', pieceType: 'knight' }])
  const round2 = tryDraftBan(round1.match, 'black', [{ kind: 'piece', pieceType: 'knight' }])
  return round2.match
}

describe('draft ban/buy — leftover budget becomes starting battle coins', () => {
  it('rejects a buy submission before both sides have banned', () => {
    const match = startRound({ white: 0, black: 0 }, 1, 'white', null)
    const res = tryDraftBuy(match, 'white', [])
    expect(res.error).toBeTruthy()
  })

  it('adds each color\'s unspent budget to carryOver.coins once the draft completes', () => {
    let match = passBans(startRound({ white: 0, black: 0 }, 1, 'white', null))
    const budget = match.draft.budgets.white
    expect(match.draft.budgets.black).toBe(budget) // identical starting budgets

    // Buy nothing — the whole budget should carry over as coins for both sides.
    match = tryDraftBuy(match, 'white', []).match
    const res = tryDraftBuy(match, 'black', [])
    expect(res.error).toBeUndefined()
    match = res.match

    expect(match.phase).toBe('placement')
    expect(match.carryOver.white.coins).toBe(budget)
    expect(match.carryOver.black.coins).toBe(budget)
  })

  // Coins never persist between rounds — every round's budget is always
  // the same flat BUDGET_BY_ROUND, regardless of how much either side had
  // banked (or even spent) in a previous round. Only the surviving army
  // (pieces/cards) carries forward — see buildCarryOver in matchEngine.js.
  it('ignores any leftover carryOver.coins from a previous round — every round\'s budget is the flat constant', () => {
    const carryOver = {
      white: { pieces: [], cards: [], coins: 15 },
      black: { pieces: [], cards: [], coins: 7 },
    }
    const match = startRound({ white: 0, black: 0 }, 1, 'white', carryOver)
    expect(match.draft.budgets.white).toBe(BUDGET_BY_ROUND[1])
    expect(match.draft.budgets.black).toBe(BUDGET_BY_ROUND[1])
  })
})

describe('applyRoundResult', () => {
  // Sides swap every round, so a color's survivors/score reattach under the
  // OTHER color's key next round — the same physical player who was white
  // (and won) is black next round, carrying their army and win with them.
  it('carries over survivors, unused cards, and coins — reattached to the OTHER color next round', () => {
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
    // White's army/win follow the same player, who is now black. Coins are
    // always reset to 0 in carry-over — they don't persist between rounds
    // at all any more (see buildCarryOver).
    expect(next.carryOver.black).toEqual({ pieces: ['rook', 'pawn'], cards: ['freeze'], coins: 0 })
    expect(next.carryOver.white).toEqual({ pieces: [], cards: [], coins: 0 })
    expect(next.scores).toEqual({ white: 0, black: 1 })
    // The finished round's own board is otherwise lost the moment the next
    // round's (null) gameState replaces it — keep it around so the round
    // summary screen can show players the position the round ended on.
    expect(next.previousGameState).toBe(match.gameState)
  })

  it('surrender does not touch the board — the surrendering side keeps everything (reattached after the swap)', () => {
    const match = matchWithGameState({
      pieces: {
        a1: { type: 'rook', color: 'white', hp: 1 },
        a8: { type: 'queen', color: 'black', hp: 1 },
      },
      cards: {
        white: { hand: [{ id: 'freeze' }], used: [] },
        black: { hand: [{ id: 'meteor' }], used: [] },
      },
      coins: { white: 4, black: 7 },
    })
    const next = applyRoundResult(match, { type: 'surrender', winner: 'black', loser: 'white' })

    expect(next.scores).toEqual({ white: 1, black: 0 })
    // Coins are always reset to 0 in carry-over, regardless of how much
    // either side had banked mid-battle or who won the round.
    expect(next.carryOver.white).toEqual({ pieces: ['queen'], cards: ['meteor'], coins: 0 })
    expect(next.carryOver.black).toEqual({ pieces: ['rook'], cards: ['freeze'], coins: 0 })
  })

  it('excludes barricades from carry-over (neutral battlefield objects, not owned army)', () => {
    const match = matchWithGameState({
      pieces: {
        a1: { type: 'rook', color: 'white', hp: 1 },
        c3: { type: 'barricade', color: 'neutral', hp: 2 },
      },
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
      coins: { white: 0, black: 0 },
    })
    const next = applyRoundResult(match, { type: 'elimination', winner: 'white' })
    expect(next.carryOver.black.pieces).toEqual(['rook']) // reattached to black post-swap
  })

  it('swaps sides every round — swapping twice returns pieces to their original color', () => {
    // Round 1: a white rook and a black knight both survive (a draw, so
    // neither side is required to be eliminated).
    const match1 = matchWithGameState({
      pieces: {
        a1: { type: 'rook', color: 'white', hp: 1 },
        a8: { type: 'knight', color: 'black', hp: 1 },
      },
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
      coins: { white: 0, black: 0 },
    })
    const round2 = applyRoundResult(match1, { type: 'draw', reason: 'mutual_elimination' })
    // The ex-white rook's owner is now black, and vice versa for the knight.
    expect(round2.carryOver.black.pieces).toEqual(['rook'])
    expect(round2.carryOver.white.pieces).toEqual(['knight'])

    // Round 2 -> 3: same two pieces (now placed under their round-2 colors)
    // survive another draw — a second swap should return each piece to
    // exactly its ORIGINAL round-1 color.
    const match2 = {
      ...round2,
      phase: 'battle',
      gameState: {
        pieces: {
          a1: { type: 'rook', color: 'black', hp: 1 },
          a8: { type: 'knight', color: 'white', hp: 1 },
        },
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 0, black: 0 },
      },
    }
    const round3 = applyRoundResult(match2, { type: 'draw', reason: 'mutual_elimination' })
    expect(round3.carryOver.white.pieces).toEqual(['rook'])
    expect(round3.carryOver.black.pieces).toEqual(['knight'])
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
