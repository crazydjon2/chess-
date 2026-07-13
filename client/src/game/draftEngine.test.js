import { describe, it, expect } from 'vitest'
import {
  createDraftState, submitPick, submitDone, isDraftComplete, nextItemCost,
  ALL_PIECE_TYPES, ALL_CARD_IDS,
} from './draftEngine.js'
import { BUDGET_BY_ROUND } from './draftPools.js'
import { HOME_CAPACITY_BY_ROUND } from './boardPatterns.js'
import { shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'

describe('createDraftState', () => {
  it('starts in the buy phase, turn with firstColor, equal budgets, empty picks', () => {
    const ds = createDraftState(2, 'white')
    expect(ds.phase).toBe('buy')
    expect(ds.turn).toBe('white')
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[2])
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[2])
    expect(ds.picks).toEqual({
      white: { pieces: [], cards: [] },
      black: { pieces: [], cards: [] },
    })
    expect(ds.done).toEqual({ white: false, black: false })
  })

  it('honors a black firstColor', () => {
    const ds = createDraftState(1, 'black')
    expect(ds.turn).toBe('black')
    expect(ds.firstColor).toBe('black')
    expect(ds.secondColor).toBe('white')
  })

  it('is always the flat round budget, regardless of anything from a previous round', () => {
    const ds = createDraftState(1, 'white')
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1])
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[1])
  })

  it('caps maxPieces at the round\'s home-rank capacity', () => {
    const ds = createDraftState(2, 'white')
    expect(ds.maxPieces).toBe(HOME_CAPACITY_BY_ROUND[2])
  })
})

describe('submitPick — turn order', () => {
  it('rejects a pick when it is not that color\'s turn', () => {
    const ds = createDraftState(1, 'white')
    const res = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' })
    expect(res.error).toBeTruthy()
  })

  it('alternates the turn after a valid pick', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.turn).toBe('black')
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.turn).toBe('white')
  })

  it('rejects an invalid catalog target', () => {
    const ds = createDraftState(1, 'white')
    const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'archer' })
    expect(res.error).toBeTruthy()
  })

  it('rejects a pick that exceeds the buyer\'s remaining budget', () => {
    const ds = createDraftState(1, 'white') // budget 30, queen costs 18
    let state = submitPick(ds, 'white', { kind: 'piece', pieceType: 'queen' }).draftState
    state = submitPick(state, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    // White has 12 left — a second queen (18) no longer fits.
    const res = submitPick(state, 'white', { kind: 'piece', pieceType: 'queen' })
    expect(res.error).toBeTruthy()
  })

  it('unlimited supply — buying multiple copies of the same type across turns is fine, at an escalating price', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.picks.white.pieces).toEqual(['pawn', 'pawn'])
    // 1st copy at base price, 2nd one coin more (see DUPLICATE_STEP).
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1] - shopPieceCost('pawn') - (shopPieceCost('pawn') + 1))
  })

  it('rejects a piece pick with more pieces than the board has home-rank squares for', () => {
    // A large budget isolates the board-capacity cap from the separate
    // escalating-price cap (see the "duplicate pricing" describe block
    // below) — this test is specifically about maxPieces.
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 100000, black: 100000 } }
    for (let i = 0; i < ds.maxPieces; i++) {
      ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
      ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    }
    const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' })
    expect(res.error).toBeTruthy()
  })

  it('cards never count against the piece cap', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    const res = submitPick(ds, 'black', { kind: 'card', cardId: 'add_cell' })
    expect(res.error).toBeUndefined()
  })

  it('deducts only from the buyer\'s own budget', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'card', cardId: 'freeze' }).draftState
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1] - CARD_DEFS.freeze.cost)
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[1])
  })

  it('a card purchase that stays affordable and still leaves pawn money behind is fine even with zero pieces', () => {
    const ds = createDraftState(1, 'white') // budget 30
    const res = submitPick(ds, 'white', { kind: 'card', cardId: 'meteor' }) // cost 6, leaves 24 >= pawn cost
    expect(res.error).toBeUndefined()
  })

  it('blocks a card purchase that would leave less than a pawn\'s cost behind while zero pieces are owned', () => {
    let ds = createDraftState(1, 'white')
    const cheapestCardId = Object.keys(CARD_DEFS).sort((a, b) => CARD_DEFS[a].cost - CARD_DEFS[b].cost)[0]
    const cost = CARD_DEFS[cheapestCardId].cost
    // Affordable on its own (cost <= budget), but would leave only 1 coin
    // behind — less than a pawn (2) — this is the reserve rule specifically,
    // not plain unaffordability.
    ds = { ...ds, budgets: { ...ds.budgets, white: cost + 1 } }
    const res = submitPick(ds, 'white', { kind: 'card', cardId: cheapestCardId })
    expect(res.error).toBeTruthy()
  })

  it('does not apply the reserve once at least one piece is already owned', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState // now has 1 piece
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    const cheapestCardId = Object.keys(CARD_DEFS).sort((a, b) => CARD_DEFS[a].cost - CARD_DEFS[b].cost)[0]
    const cost = CARD_DEFS[cheapestCardId].cost
    ds = { ...ds, budgets: { ...ds.budgets, white: cost } } // exactly affordable, would leave 0
    const res = submitPick(ds, 'white', { kind: 'card', cardId: cheapestCardId })
    expect(res.error).toBeUndefined()
  })
})

describe('auto-skip when a color can no longer afford anything', () => {
  it('marks a color done once their remaining budget cannot afford even a pawn or the cheapest card', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { ...ds.budgets, white: shopPieceCost('pawn') } } // exactly one pawn's worth, nothing more
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.done.white).toBe(true)
    expect(ds.turn).toBe('black') // skips straight to the other side
  })

  it('a done color is skipped — the other side keeps taking consecutive turns', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { ...ds.budgets, white: shopPieceCost('pawn') } }
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState // white auto-done
    expect(ds.turn).toBe('black')
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.turn).toBe('black') // white is done, so black just goes again
    expect(ds.done.white).toBe(true)
    expect(ds.done.black).toBe(false)
  })

  it('rejects a pick from a color that is already done', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { ...ds.budgets, white: shopPieceCost('pawn') } }
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    // Force it back to white's turn artificially to isolate the done-check
    // itself (turn is actually black here, but we want to hit the "already
    // done" branch specifically rather than the "not your turn" branch).
    ds = { ...ds, turn: 'white' }
    const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' })
    expect(res.error).toBeTruthy()
  })
})

describe('submitDone — voluntary early finish', () => {
  it('rejects finishing with zero pieces bought', () => {
    const ds = createDraftState(1, 'white')
    const res = submitDone(ds, 'white')
    expect(res.error).toBeTruthy()
  })

  it('accepts finishing once at least one piece is owned, and skips that color from then on', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    // Turn is black's now — hand it back to white to call submitDone on its own turn.
    ds = { ...ds, turn: 'white' }
    const res = submitDone(ds, 'white')
    expect(res.error).toBeUndefined()
    expect(res.draftState.done.white).toBe(true)
    expect(res.draftState.turn).toBe('black')
  })

  it('rejects submitDone when it is not that color\'s turn', () => {
    const ds = createDraftState(1, 'white') // white's turn
    const res = submitDone(ds, 'black')
    expect(res.error).toBeTruthy()
  })

  it('the draft is complete once both sides are done', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(isDraftComplete(ds)).toBe(false)
    ds = { ...ds, turn: 'white' }
    ds = submitDone(ds, 'white').draftState
    expect(isDraftComplete(ds)).toBe(false)
    ds = submitDone(ds, 'black').draftState
    expect(isDraftComplete(ds)).toBe(true)
  })
})

describe('duplicate pricing — each repeat copy of the same item costs more', () => {
  it('nextItemCost is the flat base price for a never-bought item', () => {
    const ds = createDraftState(1, 'white')
    expect(nextItemCost(ds, 'white', { kind: 'piece', pieceType: 'pawn' })).toBe(shopPieceCost('pawn'))
    expect(nextItemCost(ds, 'white', { kind: 'card', cardId: 'freeze' })).toBe(CARD_DEFS.freeze.cost)
  })

  it('climbs by 1 with each further copy actually bought, and charges exactly that', () => {
    let ds = createDraftState(1, 'white')
    const base = shopPieceCost('pawn')
    expect(nextItemCost(ds, 'white', { kind: 'piece', pieceType: 'pawn' })).toBe(base)

    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1] - base)
    ds = { ...ds, turn: 'white' } // isolate white's own repeat-buy, ignore turn order here
    expect(nextItemCost(ds, 'white', { kind: 'piece', pieceType: 'pawn' })).toBe(base + 1)

    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1] - base - (base + 1))
  })

  it('is per-color and per-item — buying pawns does not raise the price of knights, and the opponent\'s purchases do not raise yours', () => {
    let ds = createDraftState(1, 'white')
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState
    ds = { ...ds, turn: 'white' }
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }).draftState

    expect(nextItemCost(ds, 'white', { kind: 'piece', pieceType: 'knight' })).toBe(shopPieceCost('knight'))
    expect(nextItemCost(ds, 'black', { kind: 'piece', pieceType: 'pawn' })).toBe(shopPieceCost('pawn'))
  })

  it('caps how many of the cheapest piece are actually affordable in round 1', () => {
    // Starting value: DUPLICATE_STEP=1 caps a round-1 (budget 30) pawn
    // spree well short of the board's 12 home-rank slots.
    let ds = createDraftState(1, 'white')
    let bought = 0
    while (true) {
      const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' })
      if (res.error) break
      ds = { ...res.draftState, turn: 'white' }
      bought++
    }
    expect(bought).toBeLessThan(HOME_CAPACITY_BY_ROUND[1])
    expect(bought).toBeGreaterThan(0)
  })
})

describe('invariant: a color can never finish the draft holding zero pieces', () => {
  it('spamming the cheapest card alone eventually gets blocked by the reserve rule before any piece is bought', () => {
    let ds = createDraftState(1, 'white')
    const cheapestCardId = Object.keys(CARD_DEFS).sort((a, b) => CARD_DEFS[a].cost - CARD_DEFS[b].cost)[0]

    let res
    for (let i = 0; i < 50; i++) {
      res = submitPick(ds, 'white', { kind: 'card', cardId: cheapestCardId })
      if (res.error) break
      ds = { ...res.draftState, turn: 'white' } // keep it white's turn to isolate white's own spending
      // Never auto-marked done while holding zero pieces — the whole point
      // of this test.
      expect(ds.done.white).toBe(false)
    }

    // Eventually the reserve rule must kick in (budget is finite) — white
    // is stuck needing to buy an actual piece before doing anything else.
    expect(res.error).toBeTruthy()
    expect(ds.picks.white.pieces.length).toBe(0)
    expect(ds.done.white).toBe(false)
    expect(submitDone(ds, 'white').error).toBeTruthy() // and can't just declare done either
  })
})

describe('catalog', () => {
  it('every piece type and every card is buyable from round 1', () => {
    expect(ALL_PIECE_TYPES).toEqual(expect.arrayContaining(['pawn', 'knight', 'bishop', 'rook', 'queen']))
    expect(ALL_CARD_IDS.length).toBe(Object.keys(CARD_DEFS).length)
  })
})
