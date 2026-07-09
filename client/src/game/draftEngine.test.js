import { describe, it, expect } from 'vitest'
import {
  createDraftState, submitBans, submitPurchases, getBannedTargets, isDraftComplete,
  ALL_PIECE_TYPES, ALL_CARD_IDS,
} from './draftEngine.js'
import { BAN_COUNT_BY_ROUND, BUDGET_BY_ROUND } from './draftPools.js'
import { shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'

describe('createDraftState', () => {
  it('starts in the ban phase with the round\'s ban count and an equal budget for both colors', () => {
    const ds = createDraftState(2, 'white')
    expect(ds.phase).toBe('ban')
    expect(ds.banCount).toBe(BAN_COUNT_BY_ROUND[2])
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[2])
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[2])
    expect(ds.bans).toEqual({ white: null, black: null })
    expect(ds.picks).toEqual({ white: null, black: null })
  })

  it('is always the flat round budget, regardless of anything from a previous round', () => {
    const ds = createDraftState(1, 'white')
    expect(ds.budgets.white).toBe(BUDGET_BY_ROUND[1])
    expect(ds.budgets.black).toBe(BUDGET_BY_ROUND[1])
  })
})

describe('submitBans', () => {
  it('rejects a submission that isn\'t exactly banCount targets', () => {
    const ds = createDraftState(2, 'white') // banCount 2
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'knight' }])
    expect(res.error).toBeTruthy()
  })

  it('rejects banning a pawn — structurally unbannable', () => {
    const ds = createDraftState(1, 'white') // banCount 1
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'pawn' }])
    expect(res.error).toBeTruthy()
  })

  it('rejects duplicate targets within the same submission', () => {
    const ds = createDraftState(2, 'white') // banCount 2
    const res = submitBans(ds, 'white', [
      { kind: 'card', cardId: 'meteor' },
      { kind: 'card', cardId: 'meteor' },
    ])
    expect(res.error).toBeTruthy()
  })

  it('rejects an invalid catalog target', () => {
    const ds = createDraftState(1, 'white')
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'archer' }])
    expect(res.error).toBeTruthy()
  })

  it('accepts a valid submission and stays in the ban phase until both sides submit', () => {
    const ds = createDraftState(1, 'white')
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }])
    expect(res.error).toBeUndefined()
    expect(res.draftState.bans.white).toEqual([{ kind: 'piece', pieceType: 'queen' }])
    expect(res.draftState.phase).toBe('ban') // black hasn't submitted yet
  })

  it('flips to the buy phase once both sides have submitted', () => {
    let ds = createDraftState(1, 'white')
    ds = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }]).draftState
    ds = submitBans(ds, 'black', [{ kind: 'card', cardId: 'meteor' }]).draftState
    expect(ds.phase).toBe('buy')
  })

  it('rejects a second submission from the same color', () => {
    let ds = createDraftState(1, 'white')
    ds = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }]).draftState
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'rook' }])
    expect(res.error).toBeTruthy()
  })

  it('rejects bans once the ban phase is over', () => {
    let ds = createDraftState(1, 'white')
    ds = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }]).draftState
    ds = submitBans(ds, 'black', [{ kind: 'piece', pieceType: 'rook' }]).draftState
    const res = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'knight' }])
    expect(res.error).toBeTruthy()
  })
})

describe('getBannedTargets', () => {
  it('is empty for everyone while the ban phase is still in progress', () => {
    let ds = createDraftState(1, 'white')
    ds = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }]).draftState
    expect(getBannedTargets(ds, 'black')).toEqual([]) // black's restrictions aren't revealed yet
  })

  it('reveals what the OPPONENT banned for you once both sides have submitted', () => {
    let ds = createDraftState(1, 'white')
    ds = submitBans(ds, 'white', [{ kind: 'piece', pieceType: 'queen' }]).draftState
    ds = submitBans(ds, 'black', [{ kind: 'card', cardId: 'meteor' }]).draftState
    expect(getBannedTargets(ds, 'black')).toEqual([{ kind: 'piece', pieceType: 'queen' }])
    expect(getBannedTargets(ds, 'white')).toEqual([{ kind: 'card', cardId: 'meteor' }])
  })
})

// Fills in valid (non-pawn, non-duplicate) filler bans when a test doesn't
// care what's banned — every round requires exactly `banCount` targets per
// side, so an empty/short list would itself be rejected as malformed.
function fillerBans(n) {
  return ['knight', 'bishop', 'rook'].slice(0, n).map(pieceType => ({ kind: 'piece', pieceType }))
}

function resolvedBuyState(round = 1, whiteBans, blackBans) {
  let ds = createDraftState(round, 'white')
  ds = submitBans(ds, 'white', whiteBans ?? fillerBans(ds.banCount)).draftState
  ds = submitBans(ds, 'black', blackBans ?? fillerBans(ds.banCount)).draftState
  return ds
}

describe('submitPurchases', () => {
  it('rejects purchases before the ban phase resolves', () => {
    const ds = createDraftState(1, 'white')
    const res = submitPurchases(ds, 'white', [{ kind: 'piece', pieceType: 'pawn' }])
    expect(res.error).toBeTruthy()
  })

  it('unlimited supply — buying multiple copies of the same type is fine as long as it\'s affordable', () => {
    const ds = resolvedBuyState()
    const res = submitPurchases(ds, 'white', [
      { kind: 'piece', pieceType: 'pawn' },
      { kind: 'piece', pieceType: 'pawn' },
      { kind: 'piece', pieceType: 'pawn' },
    ])
    expect(res.error).toBeUndefined()
    expect(res.draftState.picks.white.pieces).toEqual(['pawn', 'pawn', 'pawn'])
    expect(res.draftState.budgets.white).toBe(ds.budgets.white - shopPieceCost('pawn') * 3)
  })

  it('rejects a cart that exceeds the buyer\'s budget', () => {
    const ds = resolvedBuyState(1)
    const tooMuch = Math.ceil(ds.budgets.white / shopPieceCost('queen')) + 1
    const items = Array.from({ length: tooMuch }, () => ({ kind: 'piece', pieceType: 'queen' }))
    const res = submitPurchases(ds, 'white', items)
    expect(res.error).toBeTruthy()
  })

  it('rejects an item that was banned for this color', () => {
    const ds = resolvedBuyState(1, undefined, [{ kind: 'piece', pieceType: 'knight' }]) // black banned knight FOR white
    const res = submitPurchases(ds, 'white', [{ kind: 'piece', pieceType: 'knight' }])
    expect(res.error).toBeTruthy()
  })

  it('does not block the OTHER color from buying the same thing (bans are one-directional)', () => {
    // white bans bishop (for black), black bans knight (for white) — knight
    // is only off-limits to white, black should still be free to buy it.
    const ds = resolvedBuyState(1, [{ kind: 'piece', pieceType: 'bishop' }], [{ kind: 'piece', pieceType: 'knight' }])
    const res = submitPurchases(ds, 'black', [{ kind: 'piece', pieceType: 'knight' }])
    expect(res.error).toBeUndefined()
  })

  it('deducts only from the buyer\'s own budget', () => {
    const ds = resolvedBuyState()
    const res = submitPurchases(ds, 'white', [{ kind: 'card', cardId: 'freeze' }])
    expect(res.draftState.budgets.white).toBe(ds.budgets.white - CARD_DEFS.freeze.cost)
    expect(res.draftState.budgets.black).toBe(ds.budgets.black)
  })

  it('rejects a second submission from the same color', () => {
    let ds = resolvedBuyState()
    ds = submitPurchases(ds, 'white', []).draftState
    const res = submitPurchases(ds, 'white', [{ kind: 'piece', pieceType: 'pawn' }])
    expect(res.error).toBeTruthy()
  })

  it('the draft is complete once both sides have submitted a cart (even an empty one)', () => {
    let ds = resolvedBuyState()
    expect(isDraftComplete(ds)).toBe(false)
    ds = submitPurchases(ds, 'white', []).draftState
    expect(isDraftComplete(ds)).toBe(false)
    ds = submitPurchases(ds, 'black', []).draftState
    expect(isDraftComplete(ds)).toBe(true)
  })
})

describe('catalog', () => {
  it('every piece type and every card is buyable from round 1', () => {
    expect(ALL_PIECE_TYPES).toEqual(expect.arrayContaining(['pawn', 'knight', 'bishop', 'rook', 'queen']))
    expect(ALL_CARD_IDS.length).toBe(Object.keys(CARD_DEFS).length)
  })
})
