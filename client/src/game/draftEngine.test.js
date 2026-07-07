import { describe, it, expect } from 'vitest'
import { createDraftState, getCurrentPicker, getAvailableChoices, applyDraftPick, isDraftComplete } from './draftEngine.js'
import { DRAFT_TURN_ORDER } from './draftPools.js'
import { shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'

describe('draft turn order', () => {
  it('gives each side exactly 5 of the 10 total turns', () => {
    const first = DRAFT_TURN_ORDER.filter(s => s === 'first').length
    const second = DRAFT_TURN_ORDER.filter(s => s === 'second').length
    expect(first).toBe(5)
    expect(second).toBe(5)
  })
})

describe('createDraftState budgets', () => {
  it('gives both colors an identical budget, derived from the pool\'s own value', () => {
    const ds = createDraftState(1, 'white')
    expect(ds.budgets.white).toBe(ds.budgets.black)
    expect(ds.budgets.white).toBeGreaterThan(0)
  })

  // The budget is anchored to the pool's own single most expensive item
  // (piece OR card, whichever it happens to be) — see draftEngine.js's
  // comment for why this generalizes better than a share-of-total-value
  // budget. Buying that one item should always leave little slack (room
  // for a cheap extra, not a second real purchase), regardless of whether
  // the priciest thing this round happens to be a queen, a rook, or an
  // expensive card. The multiplier escalates round to round (see
  // BUDGET_MULTIPLIER_BY_ROUND).
  const MULTIPLIER_BY_ROUND = { 1: 2.2, 2: 2, 3: 2.5 }
  it('always sets the budget to ~roundMultiplier x the pool\'s single most expensive item, whatever type that is', () => {
    for (const round of [1, 2, 3]) {
      for (let i = 0; i < 200; i++) {
        const ds = createDraftState(round, 'white')
        const pieceTypes = Object.keys(ds.pool.pieces).filter(t => ds.pool.pieces[t] > 0)
        const pieceMax = pieceTypes.length > 0 ? Math.max(...pieceTypes.map(shopPieceCost)) : 0
        const cardMax   = ds.pool.cards.length > 0 ? Math.max(...ds.pool.cards.map(id => CARD_DEFS[id].cost)) : 0
        const maxPrice  = Math.max(pieceMax, cardMax)

        expect(ds.budgets.white).toBe(Math.round(maxPrice * MULTIPLIER_BY_ROUND[round]))
      }
    }
  })
})

describe('applyDraftPick', () => {
  it('buying a piece deducts its shop price from the buyer\'s budget only', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 100, black: 100 }, pool: { pieces: { pawn: 3 }, cards: [] } }
    const res = applyDraftPick(ds, 'white', { kind: 'piece', pieceType: 'pawn' })
    expect(res.error).toBeUndefined()
    expect(res.draftState.budgets.white).toBe(100 - shopPieceCost('pawn'))
    expect(res.draftState.budgets.black).toBe(100)
    expect(res.draftState.pool.pieces.pawn).toBe(2)
    expect(res.draftState.picks.white.pieces).toEqual(['pawn'])
  })

  it('buying a card deducts its CARD_DEFS cost', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 100, black: 100 }, pool: { pieces: {}, cards: ['freeze'] } }
    const res = applyDraftPick(ds, 'white', { kind: 'card', cardId: 'freeze' })
    expect(res.error).toBeUndefined()
    expect(res.draftState.budgets.white).toBe(100 - CARD_DEFS.freeze.cost)
    expect(res.draftState.pool.cards).toEqual([])
  })

  it('rejects a purchase that exceeds the buyer\'s remaining budget', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 1, black: 100 }, pool: { pieces: { queen: 1 }, cards: [] } }
    const res = applyDraftPick(ds, 'white', { kind: 'piece', pieceType: 'queen' })
    expect(res.error).toBeTruthy()
  })

  it('a pass advances the turn without touching the budget or the pool', () => {
    let ds = createDraftState(1, 'white')
    ds = { ...ds, budgets: { white: 50, black: 50 } }
    const picker = getCurrentPicker(ds)
    const res = applyDraftPick(ds, picker, { kind: 'pass' })
    expect(res.error).toBeUndefined()
    expect(res.draftState.budgets).toEqual({ white: 50, black: 50 })
    expect(res.draftState.turnIndex).toBe(ds.turnIndex + 1)
  })

  it('rejects a pick when it is not that color\'s turn', () => {
    const ds = createDraftState(1, 'white')
    const picker = getCurrentPicker(ds)
    const other = picker === 'white' ? 'black' : 'white'
    const { pieces } = getAvailableChoices(ds)
    const res = applyDraftPick(ds, other, { kind: 'piece', pieceType: pieces[0] })
    expect(res.error).toBeTruthy()
  })
})

describe('full draft playthrough', () => {
  it('always reaches exactly 10 turns (passing whenever nothing is affordable), never overspending', () => {
    let ds = createDraftState(1, 'white')
    let turns = 0
    while (!isDraftComplete(ds)) {
      const picker = getCurrentPicker(ds)
      const budget = ds.budgets[picker]
      const { pieces, cards } = getAvailableChoices(ds)
      const affordablePiece = pieces.find(t => shopPieceCost(t) <= budget)
      const affordableCard  = cards.find(id => CARD_DEFS[id].cost <= budget)
      const choice = affordableCard
        ? { kind: 'card', cardId: affordableCard }
        : affordablePiece
          ? { kind: 'piece', pieceType: affordablePiece }
          : { kind: 'pass' }
      const res = applyDraftPick(ds, picker, choice)
      expect(res.error).toBeUndefined()
      ds = res.draftState
      turns++
    }
    expect(turns).toBe(10)
    expect(ds.budgets.white).toBeGreaterThanOrEqual(0)
    expect(ds.budgets.black).toBeGreaterThanOrEqual(0)
  })
})
