import { describe, it, expect } from 'vitest'
import {
  createDraftState, submitPick, submitDone, timeoutDraft, isDraftComplete, nextItemCost, duplicateStep,
  ALL_PIECE_TYPES, ALL_CARD_IDS,
} from './draftEngine.js'
import { BUDGET_BY_ROUND, DRAFT_TIME_BY_ROUND } from './draftPools.js'
import { HOME_CAPACITY_BY_ROUND } from './boardPatterns.js'
import { shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'

describe('createDraftState', () => {
  it('starts in the buy phase, turn with firstColor, equal budgets, just the free king', () => {
    const ds = createDraftState(2, 'white')
    expect(ds.phase).toBe('buy')
    expect(ds.turn).toBe('white')
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[2])
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[2])
    expect(ds.picks).toEqual({
      white: { pieces: ['king'], cards: [] },
      black: { pieces: ['king'], cards: [] },
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
    expect(ds.picks.white.pieces).toEqual(['king', 'pawn', 'pawn'])
    // 1st copy at base price, 2nd with the duplicate surcharge (see duplicateStep).
    const pawn = { kind: 'piece', pieceType: 'pawn' }
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1] - shopPieceCost('pawn') - (shopPieceCost('pawn') + duplicateStep(pawn)))
  })

  it('rejects a piece pick with more pieces than the board has home-rank squares for', () => {
    // A large budget isolates the board-capacity cap from the separate
    // escalating-price cap (see the "duplicate pricing" describe block
    // below) — this test is specifically about maxPieces.
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 100000, black: 100000 } }
    for (let i = 0; i < ds.maxPieces - 1; i++) { // the free king already takes one slot
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

  it('a cards-only spree is fine — the free king means the army is never empty', () => {
    let ds = createDraftState(1, 'white')
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
  it('can finish right away — the free king alone is a legal army', () => {
    const ds = createDraftState(1, 'white')
    const res = submitDone(ds, 'white')
    expect(res.error).toBeUndefined()
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

  it('climbs by the item-specific surcharge with each further copy, and charges exactly that', () => {
    let ds = createDraftState(3, 'white') // round 3: budget for two of something pricey
    const knight = { kind: 'piece', pieceType: 'knight' }
    const base = shopPieceCost('knight'), step = duplicateStep(knight)
    expect(step).toBeGreaterThan(0)
    expect(nextItemCost(ds, 'white', knight)).toBe(base)

    ds = submitPick(ds, 'white', knight).draftState
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[3] - base)
    ds = { ...ds, turn: 'white' } // isolate white's own repeat-buy, ignore turn order here
    expect(nextItemCost(ds, 'white', knight)).toBe(base + step)

    ds = submitPick(ds, 'white', knight).draftState
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[3] - base - (base + step))
  })

  it('the surcharge scales with the base price — a repeat queen costs far more extra than a repeat pawn', () => {
    expect(duplicateStep({ kind: 'piece', pieceType: 'queen' })).toBeGreaterThan(duplicateStep({ kind: 'piece', pieceType: 'pawn' }))
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
    // Either the budget or the board's home-rank slots stop a pawn spree.
    let ds = createDraftState(1, 'white')
    let bought = 0
    while (true) {
      const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' })
      if (res.error) break
      ds = { ...res.draftState, turn: 'white' }
      bought++
    }
    expect(bought).toBeLessThanOrEqual(HOME_CAPACITY_BY_ROUND[1] - 1) // the king takes a slot
    expect(bought).toBeGreaterThan(0)
  })
})

describe('catalog', () => {
  it('every piece type and every card is buyable from round 1', () => {
    expect(ALL_PIECE_TYPES).toEqual(expect.arrayContaining(['pawn', 'knight', 'bishop', 'rook', 'queen']))
    expect(ALL_PIECE_TYPES).not.toContain('king') // free, never bought
    expect(ALL_CARD_IDS.length).toBe(Object.keys(CARD_DEFS).length)
  })
})

describe('draft time bank', () => {
  it('charges only the acting player, only for the time they actually took', () => {
    let ds = createDraftState(1, 'white', 0)
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }, 5_000).draftState
    expect(ds.clocks.white).toBe(DRAFT_TIME_BY_ROUND[1] - 5)
    expect(ds.clocks.black).toBe(DRAFT_TIME_BY_ROUND[1])
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }, 7_000).draftState
    expect(ds.clocks.black).toBe(DRAFT_TIME_BY_ROUND[1] - 2)
  })

  it('rejects a pick once the player\'s time is gone', () => {
    const ds = createDraftState(1, 'white', 0)
    const res = submitPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' }, (DRAFT_TIME_BY_ROUND[1] + 1) * 1000)
    expect(res.error).toBeTruthy()
  })

  it('timing out ends that player\'s draft with what they already bought', () => {
    let ds = createDraftState(1, 'white', 0)
    ds = submitPick(ds, 'white', { kind: 'piece', pieceType: 'rook' }, 1_000).draftState
    ds = submitPick(ds, 'black', { kind: 'piece', pieceType: 'pawn' }, 2_000).draftState
    ds = timeoutDraft(ds, 40_000)
    expect(ds.done.white).toBe(true)
    expect(ds.clocks.white).toBe(0)
    expect(ds.picks.white.pieces).toEqual(['king', 'rook'])
    expect(ds.turn).toBe('black')
  })
})
