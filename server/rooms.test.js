import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoom, joinRoom, rejoinRoom, leaveRoom, handleDisconnect, ABANDONED_ROOM_MS, getRoomByCode, handlePlayCard, handlePlacement, handleUpdatePlacement, handleDraftPick, handleDraftDone, handleMove, handleSurrender, handleOfferDraw, handleAnswerDraw } from './rooms.js'
import { getCaptured } from '../client/src/game/economy.js'
import { createDraftState } from '../client/src/game/draftEngine.js'
import { DRAFT_TIME_BY_ROUND } from '../client/src/game/draftPools.js'

function makeSocket(id) {
  return { id, data: {}, join() {}, leave() {}, emit() {} }
}

// `sockets` is a Map<id, socket> standing in for Socket.IO's real
// `io.sockets.sockets` registry — swapPlayerColors (rooms.js) looks a
// socket up by id there to flip its `.data.color` when sides swap.
function makeIo(sockets) {
  const emits = {}
  const io = {
    sockets: { sockets },
    to(id) {
      return { emit(event, payload) { (emits[id] ??= []).push({ event, payload }) } }
    },
  }
  return { io, emits }
}

function makeRoom() {
  const sockets = new Map()
  const { io, emits } = makeIo(sockets)
  const socketWhite = makeSocket('sock-white')
  const socketBlack = makeSocket('sock-black')
  sockets.set('sock-white', socketWhite)
  sockets.set('sock-black', socketBlack)
  const { code } = createRoom(socketWhite, 'white')
  joinRoom(socketBlack, code)
  const room = getRoomByCode(code)
  return { io, emits, socketWhite, socketBlack, room }
}

function lastView(emits, socketId) {
  return emits[socketId].at(-1).payload.match
}

describe('smoke_screen fog redaction (viewFor)', () => {
  let ctx
  beforeEach(() => {
    ctx = makeRoom()
    ctx.room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b2: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: {
          white: { hand: [{ id: 'smoke_screen' }], used: [] },
          black: { hand: [], used: [] },
        },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [],
        eliminationMode: true,
      },
    }
  })

  it('hides the caster\'s piece from the opponent, but not from the caster', () => {
    const { io, emits, socketWhite } = ctx
    handlePlayCard(io, socketWhite, { cardId: 'smoke_screen', target: 'b2' })

    const whiteView = lastView(emits, 'sock-white').gameState
    const blackView = lastView(emits, 'sock-black').gameState

    expect(whiteView.pieces.b2).toEqual({ type: 'pawn', color: 'white', hp: 1 })
    expect(blackView.pieces.b2).toBeUndefined()
    expect(blackView.pieces.f6).toEqual({ type: 'pawn', color: 'black', hp: 1 }) // unaffected, outside the zone
  })

  it('still reveals the fog zone\'s existence (location/owner/duration) to the opponent', () => {
    const { io, emits, socketWhite } = ctx
    handlePlayCard(io, socketWhite, { cardId: 'smoke_screen', target: 'b2' })
    const blackView = lastView(emits, 'sock-black').gameState
    expect(blackView.fogZones).toHaveLength(1)
    expect(blackView.fogZones[0].owner).toBe('white')
  })

  it('does not let the opponent mistake a fogged (alive) piece for a captured one', () => {
    const { io, emits, socketWhite } = ctx
    handlePlayCard(io, socketWhite, { cardId: 'smoke_screen', target: 'b2' })
    const blackView = lastView(emits, 'sock-black').gameState
    expect(getCaptured(blackView, 'white')).toEqual([])
  })
})

describe('meteor redaction (viewFor + lastAction)', () => {
  function setup() {
    const ctx = makeRoom()
    ctx.room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b2: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: {
          white: { hand: [{ id: 'meteor' }], used: [] },
          black: { hand: [], used: [] },
        },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [],
        meteors: [],
        eliminationMode: true,
      },
    }
    return ctx
  }

  it('hides the target square from the opponent, but not from the caster', () => {
    const { io, emits, socketWhite } = setup()
    handlePlayCard(io, socketWhite, { cardId: 'meteor', target: 'f6' })

    const whiteView = lastView(emits, 'sock-white').gameState
    const blackView = lastView(emits, 'sock-black').gameState

    expect(whiteView.meteors).toEqual([{ owner: 'white', square: 'f6', turnsLeft: 2 }])
    expect(blackView.meteors).toEqual([{ owner: 'white', turnsLeft: 2, hidden: true }])
  })

  it('redacts the target from the action broadcast too, unconditionally (not gated on fog zones)', () => {
    const { io, emits, socketWhite } = setup()
    handlePlayCard(io, socketWhite, { cardId: 'meteor', target: 'f6' })

    const whiteLastAction = emits['sock-white'].at(-1).payload.lastAction
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction

    expect(whiteLastAction).toEqual({ type: 'card', cardId: 'meteor', target: 'f6', color: 'white' })
    // Which card was cast is never secret — only its target square is.
    expect(blackLastAction).toEqual({ type: 'card', cardId: 'meteor', color: 'white', hidden: true })
  })

  it('broadcasts a detonation unredacted to BOTH players, and actually destroys the piece', () => {
    const { io, emits, socketBlack, room } = setup()
    room.match.gameState.turn = 'black'
    room.match.gameState.meteors = [{ owner: 'white', square: 'b2', turnsLeft: 1 }]
    // Give white a second piece so losing b2 doesn't also end the round
    // (elimination-mode round-over is a separate concern from what this
    // test is checking — the detonation broadcast itself).
    room.match.gameState.pieces.a1 = { type: 'pawn', color: 'white', hp: 1 }

    handleMove(io, socketBlack, { from: 'f6', to: 'f5' })

    const expectedStrikes = [{ square: 'b2', destroyed: { type: 'pawn', color: 'white', hp: 1 }, owner: 'white' }]
    expect(emits['sock-white'].at(-1).payload.meteorStrikes).toEqual(expectedStrikes)
    expect(emits['sock-black'].at(-1).payload.meteorStrikes).toEqual(expectedStrikes)

    const whiteView = lastView(emits, 'sock-white').gameState
    expect(whiteView.pieces.b2).toBeUndefined()
    expect(whiteView.meteors).toEqual([])
  })
})

describe('freeze mine redaction (viewFor + lastAction)', () => {
  function setup() {
    const ctx = makeRoom()
    ctx.room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b2: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: {
          white: { hand: [{ id: 'freeze' }], used: [] },
          black: { hand: [], used: [] },
        },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [],
        meteors: [],
        mines: [],
        eliminationMode: true,
      },
    }
    return ctx
  }

  it('hides the mine square from the opponent, but not from the caster', () => {
    const { io, emits, socketWhite } = setup()
    handlePlayCard(io, socketWhite, { cardId: 'freeze', target: 'c3' })

    const whiteView = lastView(emits, 'sock-white').gameState
    const blackView = lastView(emits, 'sock-black').gameState

    expect(whiteView.mines).toEqual([{ owner: 'white', square: 'c3' }])
    expect(blackView.mines).toEqual([{ owner: 'white', hidden: true }])
  })

  it('redacts the target from the action broadcast too', () => {
    const { io, emits, socketWhite } = setup()
    handlePlayCard(io, socketWhite, { cardId: 'freeze', target: 'c3' })

    const whiteLastAction = emits['sock-white'].at(-1).payload.lastAction
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction

    expect(whiteLastAction).toEqual({ type: 'card', cardId: 'freeze', target: 'c3', color: 'white' })
    expect(blackLastAction).toEqual({ type: 'card', cardId: 'freeze', color: 'white', hidden: true })
  })

  it('broadcasts a trigger unredacted to BOTH players once the opponent steps on it', () => {
    const { io, emits, socketBlack, room } = setup()
    room.match.gameState.turn = 'black'
    room.match.gameState.mines = [{ owner: 'white', square: 'f5' }]

    handleMove(io, socketBlack, { from: 'f6', to: 'f5' })

    const expectedStrike = { square: 'f5', owner: 'white' }
    expect(emits['sock-white'].at(-1).payload.mineStrike).toEqual(expectedStrike)
    expect(emits['sock-black'].at(-1).payload.mineStrike).toEqual(expectedStrike)

    const blackView = lastView(emits, 'sock-black').gameState
    expect(blackView.pieces.f5).toEqual({ type: 'pawn', color: 'black', hp: 1, frozen: 1 })
    expect(blackView.mines).toEqual([])
  })
})

describe('actionLog redaction (viewFor)', () => {
  function setup(cardId) {
    const ctx = makeRoom()
    ctx.room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b2: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: {
          white: { hand: [{ id: cardId }], used: [] },
          black: { hand: [], used: [] },
        },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        actionLog: [],
        fogZones: [],
        meteors: [],
        mines: [],
        eliminationMode: true,
      },
    }
    return ctx
  }

  it('meteor\'s log entry hides its target from the opponent, keeps it for the caster — but WHICH card was cast is never hidden', () => {
    const { io, emits, socketWhite } = setup('meteor')
    handlePlayCard(io, socketWhite, { cardId: 'meteor', target: 'f6' })

    const whiteEntry = lastView(emits, 'sock-white').gameState.actionLog.at(-1)
    const blackEntry = lastView(emits, 'sock-black').gameState.actionLog.at(-1)
    expect(whiteEntry).toMatchObject({ kind: 'card', cardId: 'meteor', target: 'f6' })
    expect(blackEntry.cardId).toBe('meteor') // the opponent still knows it was a meteor
    expect(blackEntry.target).toBeUndefined()
    expect(blackEntry.hidden).toBe(true)
  })

  it('freeze\'s log entry hides its target from the opponent the same way, cardId still visible', () => {
    const { io, emits, socketWhite } = setup('freeze')
    handlePlayCard(io, socketWhite, { cardId: 'freeze', target: 'c3' })

    const blackEntry = lastView(emits, 'sock-black').gameState.actionLog.at(-1)
    expect(blackEntry.cardId).toBe('freeze')
    expect(blackEntry.target).toBeUndefined()
    expect(blackEntry.hidden).toBe(true)
  })

  it('a move entry\'s snapshot redacts fog-hidden pieces for the opponent, same as the live board', () => {
    const { io, emits, socketWhite, room } = setup('smoke_screen')
    // Cast smoke_screen over white's own pawn first.
    handlePlayCard(io, socketWhite, { cardId: 'smoke_screen', target: 'b2' })
    // White's own residual move this turn — lands a move entry while the
    // zone is active.
    handleMove(io, socketWhite, { from: 'b2', to: 'b3' })

    const blackView = lastView(emits, 'sock-black').gameState
    const moveEntry = blackView.actionLog.find(e => e.kind === 'move')
    expect(moveEntry.snapshot.pieces.b3).toBeUndefined() // hidden inside white's own zone
    const whiteView = lastView(emits, 'sock-white').gameState
    const whiteMoveEntry = whiteView.actionLog.find(e => e.kind === 'move')
    expect(whiteMoveEntry.snapshot.pieces.b3).toEqual({ type: 'pawn', color: 'white', hp: 1 }) // caster sees their own
  })

  it('a non-meteor/freeze card cast inside the caster\'s own fog zone also has its target hidden', () => {
    const { io, emits, socketWhite, room } = setup('barricade')
    // A zone already active from an earlier turn (cards don't end the turn
    // — one spell per turn means these two casts can't land back to back
    // in the same test, so the zone is set up directly instead).
    room.match.gameState.fogZones = [{ owner: 'white', cells: ['c3'], turnsLeft: 4 }]
    handlePlayCard(io, socketWhite, { cardId: 'barricade', target: 'c3' }) // cast inside that zone

    const blackEntry = lastView(emits, 'sock-black').gameState.actionLog.at(-1)
    expect(blackEntry.target).toBeUndefined()
    expect(blackEntry.hidden).toBe(true)
    const whiteEntry = lastView(emits, 'sock-white').gameState.actionLog.at(-1)
    expect(whiteEntry.target).toBe('c3') // the caster always sees their own
  })

  it('a card cast OUTSIDE any fog zone is visible to both sides', () => {
    const { io, emits, socketWhite } = setup('barricade')
    handlePlayCard(io, socketWhite, { cardId: 'barricade', target: 'd4' })

    const blackEntry = lastView(emits, 'sock-black').gameState.actionLog.at(-1)
    expect(blackEntry.target).toBe('d4')
    expect(blackEntry.hidden).toBeUndefined()
  })
})

describe('handleDraftPick/handleDraftDone with a missing/malformed payload', () => {
  function baseDraft(overrides = {}) {
    return {
      round: 1, firstColor: 'white', secondColor: 'black', phase: 'buy', turn: 'white',
      budgets: { white: 20, black: 20 },
      maxPieces: 8,
      picks: { white: { pieces: [], cards: [] }, black: { pieces: [], cards: [] } },
      done: { white: false, black: false },
      ...overrides,
    }
  }

  it('does not throw when the pick payload is entirely missing (e.g. socket.emit(\'draft_pick\') with no args)', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = { phase: 'draft', draft: baseDraft() }
    expect(() => handleDraftPick(io, socketWhite, undefined)).not.toThrow()
  })

  it('does not throw on handleDraftDone with zero pieces bought (rejected, not a crash)', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = { phase: 'draft', draft: baseDraft() }
    expect(() => handleDraftDone(io, socketWhite)).not.toThrow()
  })
})

describe('draft-phase visibility (viewFor)', () => {
  it('picks are live/open information — the opponent sees each pick land immediately, not just after both finish', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    room.match = {
      phase: 'draft',
      round: 1,
      draft: {
        round: 1, firstColor: 'white', secondColor: 'black', phase: 'buy', turn: 'white',
        budgets: { white: 20, black: 20 },
        maxPieces: 8,
        picks: { white: { pieces: [], cards: [] }, black: { pieces: [], cards: [] } },
        done: { white: false, black: false },
      },
    }
    handleDraftPick(io, socketWhite, { kind: 'piece', pieceType: 'pawn' })
    // Check the broadcast right after white's own pick, while the match was
    // still mid-draft (black hasn't acted yet) — black should already see
    // white's pick land, since visibility is the whole point now.
    const blackView = emits['sock-black'][0].payload.match
    expect(blackView.draft.picks.white).toEqual({ pieces: ['pawn'], cards: [] })
    expect(blackView.draft.turn).toBe('black')
  })
})

describe('battle actions are rejected once the match is over', () => {
  it('handleMove/handlePlayCard are no-ops when phase is match_over', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    const gameState = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { b1: { type: 'pawn', color: 'white', hp: 1 } },
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
      turn: 'white',
      cardPlayedThisTurn: false,
      halfMoveClock: 0,
      moveHistory: [],
      fogZones: [],
      eliminationMode: true,
    }
    room.match = { phase: 'match_over', gameState, scores: { white: 2, black: 0 } }

    handleMove(io, socketWhite, { from: 'b1', to: 'b2' })
    handlePlayCard(io, socketWhite, { cardId: 'freeze', target: 'b1' })

    // Neither should have mutated the board or broadcast anything.
    expect(room.match.gameState.pieces).toEqual(gameState.pieces)
    expect(emits['sock-white']).toBeUndefined()
  })
})

describe('side-swap between rounds', () => {
  it('swaps room.players and each socket\'s color when a round ends (but not the match)', () => {
    const { io, emits, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'battle',
      round: 1,
      scores: { white: 0, black: 0 },
      draft: { firstColor: 'white' },
      gameState: {
        pieces: { a1: { type: 'rook', color: 'white', hp: 1 } },
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        turn: 'white',
      },
    }

    // White surrenders — black wins the round, but the match continues
    // (1 win < ROUNDS_TO_WIN).
    handleSurrender(io, socketWhite)

    expect(room.match.phase).toBe('draft') // next round started, not match_over
    // The sockets' color identities flip along with room.players.
    expect(socketWhite.data.color).toBe('black')
    expect(socketBlack.data.color).toBe('white')
    expect(room.players.white.socketId).toBe('sock-black')
    expect(room.players.black.socketId).toBe('sock-white')

    // Each socket is told its NEW color in the broadcast.
    expect(emits['sock-white'].at(-1).payload.color).toBe('black')
    expect(emits['sock-black'].at(-1).payload.color).toBe('white')
  })

  it('does not swap colors once the surrender ends the whole match', () => {
    const { io, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'battle',
      round: 1,
      scores: { white: 0, black: 1 }, // black already has 1 win banked
      gameState: {
        pieces: {},
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        turn: 'white',
      },
    }

    handleSurrender(io, socketWhite) // black reaches 2 wins -> match over

    expect(room.match.phase).toBe('match_over')
    expect(socketWhite.data.color).toBe('white')
    expect(socketBlack.data.color).toBe('black')
  })

  it('allows surrendering on the opponent\'s turn too', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = {
      phase: 'battle',
      round: 1,
      scores: { white: 0, black: 0 },
      draft: { firstColor: 'white' },
      gameState: {
        pieces: { a1: { type: 'rook', color: 'white', hp: 1 } },
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        turn: 'black', // not white's turn
      },
    }

    handleSurrender(io, socketWhite)

    expect(room.match.phase).toBe('draft') // round over, next one started
    expect(room.match.lastRoundResult).toMatchObject({ type: 'surrender', winner: 'black' })
  })
})

describe('draw offers', () => {
  function battleRoom() {
    const ctx = makeRoom()
    ctx.room.match = {
      phase: 'battle',
      round: 1,
      scores: { white: 0, black: 0 },
      draft: { firstColor: 'white' },
      gameState: {
        pieces: { a1: { type: 'king', color: 'white', hp: 1 }, f6: { type: 'king', color: 'black', hp: 1 } },
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        turn: 'white',
        moveHistory: [],
        drawOffer: null,
        drawOfferedAt: { white: -1, black: -1 },
      },
    }
    return ctx
  }

  it('accepting ends the round as a draw with no score change', () => {
    const { io, socketWhite, socketBlack, room } = battleRoom()
    handleOfferDraw(io, socketWhite)
    expect(room.match.gameState.drawOffer).toBe('white')
    handleAnswerDraw(io, socketBlack, { accept: true })
    expect(room.match.phase).toBe('draft')
    expect(room.match.lastRoundResult).toEqual({ type: 'draw', reason: 'agreement' })
    expect(room.match.scores).toEqual({ white: 0, black: 0 })
  })

  it('declining withdraws the offer, and the same side cannot re-offer until a move is made', () => {
    const { io, emits, socketWhite, socketBlack, room } = battleRoom()
    handleOfferDraw(io, socketWhite)
    handleAnswerDraw(io, socketBlack, { accept: false })
    expect(room.match.gameState.drawOffer).toBeNull()
    expect(emits['sock-white'].at(-1).payload.lastAction).toEqual({ type: 'draw_declined', color: 'black' })
    handleOfferDraw(io, socketWhite)
    expect(room.match.gameState.drawOffer).toBeNull() // rejected: once per move
  })

  it('the offerer cannot answer their own offer', () => {
    const { io, socketWhite, room } = battleRoom()
    handleOfferDraw(io, socketWhite)
    handleAnswerDraw(io, socketWhite, { accept: true })
    expect(room.match.phase).toBe('battle')
  })
})

describe('lastAction redaction for fog-hidden actions', () => {
  it('the caster always sees their own action in full', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b1: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: { white: { hand: [{ id: 'barricade' }], used: [] }, black: { hand: [], used: [] } },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [{ owner: 'white', cells: ['b1', 'c1'], turnsLeft: 3 }],
        eliminationMode: true,
      },
    }

    handlePlayCard(io, socketWhite, { cardId: 'barricade', target: 'c1' })

    const whiteLastAction = emits['sock-white'].at(-1).payload.lastAction
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction

    expect(whiteLastAction).toEqual({ type: 'card', cardId: 'barricade', target: 'c1', color: 'white' })
    expect(blackLastAction).toEqual({ type: 'card', cardId: 'barricade', color: 'white', hidden: true })
  })

  it('does not redact an action outside any active fog zone', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    room.match = {
      phase: 'battle',
      gameState: {
        board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
        pieces: {
          b1: { type: 'pawn', color: 'white', hp: 1 },
          f6: { type: 'pawn', color: 'black', hp: 1 },
        },
        cards: { white: { hand: [{ id: 'barricade' }], used: [] }, black: { hand: [], used: [] } },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [],
        eliminationMode: true,
      },
    }

    handlePlayCard(io, socketWhite, { cardId: 'barricade', target: 'c1' })
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction
    expect(blackLastAction).toEqual({ type: 'card', cardId: 'barricade', target: 'c1', color: 'white' })
  })
})

describe('open placement', () => {
  function placementMatch() {
    return {
      phase: 'placement',
      round: 1,
      boardPattern: { rows: 6, cols: 6, blockedCells: [] },
      draft: { picks: { white: { pieces: ['pawn', 'rook'], cards: [] }, black: { pieces: ['pawn'], cards: [] } } },
      placement: {
        white: { ready: false, map: {} },
        black: { ready: false, map: {} },
      },
    }
  }

  it('shows each side\'s in-progress placement to the opponent live', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    room.match = placementMatch()

    handleUpdatePlacement(io, socketWhite, { b1: 'pawn' })
    const blackSees = lastView(emits, 'sock-black').placement
    expect(blackSees.white).toEqual({ ready: false, map: { b1: 'pawn' } })
  })

  it('rejects a live update placing more of a type than was drafted', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = placementMatch()
    handleUpdatePlacement(io, socketWhite, { b1: 'pawn', c1: 'pawn' })
    expect(room.match.placement.white.map).toEqual({})
  })

  it('locks a side in once ready — no further live updates', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = placementMatch()
    handlePlacement(io, socketWhite, { b1: 'pawn', a1: 'rook' })
    handleUpdatePlacement(io, socketWhite, { b2: 'pawn', a1: 'rook' })
    expect(room.match.placement.white).toEqual({ ready: true, map: { b1: 'pawn', a1: 'rook' } })
  })

  it('starts the battle at the deadline, keeping placed pieces and auto-placing the rest', () => {
    vi.useFakeTimers()
    try {
      const { io, socketWhite, room } = makeRoom()
      room.match = { ...placementMatch(), placementDeadline: Date.now() + 30_000 }
      handleUpdatePlacement(io, socketWhite, { b1: 'pawn' }) // rook still unplaced; black placed nothing

      vi.advanceTimersByTime(30_000)

      expect(room.match.phase).toBe('battle')
      const pieces = room.match.gameState.pieces
      expect(pieces.b1).toEqual({ type: 'pawn', color: 'white', hp: 1 })
      const types = color => Object.values(pieces).filter(p => p.color === color).map(p => p.type).sort()
      expect(types('white')).toEqual(['pawn', 'rook'])
      expect(types('black')).toEqual(['pawn'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('AFK turn timeout', () => {
  it('ends the round in the opponent\'s favor if the mover never acts before their clock runs out', () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const { io, emits, socketWhite, room } = makeRoom()
      room.match = {
        phase: 'battle',
        round: 1,
        scores: { white: 0, black: 0 },
        draft: { firstColor: 'white' },
        gameState: {
          board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
          pieces: {
            a1: { type: 'pawn', color: 'white', hp: 1 },
            a6: { type: 'pawn', color: 'black', hp: 1 },
          },
          cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
          turn: 'white',
          cardPlayedThisTurn: false,
          halfMoveClock: 0,
          moveHistory: [],
          fogZones: [], meteors: [], mines: [],
          eliminationMode: true,
          timers: { white: 5, black: 5 }, // 5-second clocks for a fast test
          turnStartedAt: now,
        },
      }

      // White's real move both charges white's clock and (via broadcastMatch
      // -> syncTurnTimer) arms an AFK timer for black's now-current turn.
      handleMove(io, socketWhite, { from: 'a1', to: 'a2' })
      expect(room.match.gameState.turn).toBe('black')

      // Black never moves — advance past their 5-second clock.
      vi.advanceTimersByTime(5001)

      expect(room.match.phase).toBe('draft') // round ended, next round's draft started
      // White won the round — but sides swap for the next round (see
      // matchEngine.js's applyRoundResult), so the win follows the same
      // PHYSICAL player under their new label: the socket that was white
      // is now black, carrying the win with it.
      expect(room.match.scores).toEqual({ white: 0, black: 1 })
      expect(emits['sock-white'].at(-1).payload.lastAction).toEqual({ type: 'timeout', color: 'black' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire if the mover acts before their clock runs out', () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const { io, emits, socketWhite, socketBlack, room } = makeRoom()
      room.match = {
        phase: 'battle',
        round: 1,
        scores: { white: 0, black: 0 },
        draft: { firstColor: 'white' },
        gameState: {
          board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
          pieces: {
            a1: { type: 'pawn', color: 'white', hp: 1 },
            a6: { type: 'pawn', color: 'black', hp: 1 },
          },
          cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
          turn: 'white',
          cardPlayedThisTurn: false,
          halfMoveClock: 0,
          moveHistory: [],
          fogZones: [], meteors: [], mines: [],
          eliminationMode: true,
          timers: { white: 5, black: 5 },
          turnStartedAt: now,
        },
      }

      handleMove(io, socketWhite, { from: 'a1', to: 'a2' }) // black's 5s timer arms
      vi.advanceTimersByTime(2000)
      handleMove(io, socketBlack, { from: 'a6', to: 'a5' })  // black acts well within time, re-arming for white

      // Advance past what would have been BLACK's original deadline (5s
      // from their turn start, i.e. now+5000) but still short of WHITE's
      // fresh one (armed 2s in, so now+7000) — proves the stale timer was
      // actually cleared, not just coincidentally not-yet-due.
      vi.advanceTimersByTime(3900)

      expect(room.match.phase).toBe('battle') // still the same round — no timeout fired
      expect(emits['sock-white'].at(-1).payload.lastAction).toEqual({ type: 'move', from: 'a6', to: 'a5' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('createRoom color choice', () => {
  it('resolves "random" to a real color on creation', () => {
    const seen = new Set()
    for (let i = 0; i < 40; i++) {
      const res = createRoom(makeSocket(`sock-rand-${i}`), 'random')
      expect(['white', 'black']).toContain(res.color)
      expect(res.host).toBe(res.color)
      seen.add(res.color)
    }
    expect(seen.size).toBe(2)
  })
})

describe('draft time bank (server timer)', () => {
  it('ends the draft for whoever runs out of time on their turn', () => {
    vi.useFakeTimers()
    try {
      const { io, socketWhite, room } = makeRoom()
      room.match = { phase: 'draft', round: 1, draft: createDraftState(1, 'white', Date.now()) }
      handleDraftPick(io, socketWhite, { kind: 'piece', pieceType: 'pawn' }) // starts black's clock
      vi.advanceTimersByTime(DRAFT_TIME_BY_ROUND[1] * 1000 + 50)
      expect(room.match.draft.done.black).toBe(true)
      expect(room.match.draft.turn).toBe('white')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('rejoin (reload / dropped connection)', () => {
  function startedRoom() {
    const ctx = makeRoom()
    ctx.room.match = { phase: 'draft', round: 1, draft: createDraftState(1, 'white', Date.now()) }
    return ctx
  }

  it('reclaims the seat by token from a new socket, without leaking tokens publicly', () => {
    const { io, room, socketWhite } = startedRoom()
    const token = room.players.white.token
    handleDisconnect(io, socketWhite)
    expect(room.players.white.connected).toBe(false)

    const fresh = makeSocket('sock-white-2')
    const res = rejoinRoom(fresh, room.code.toLowerCase(), token)
    expect(res.color).toBe('white')
    expect(room.players.white).toMatchObject({ socketId: 'sock-white-2', connected: true })
    expect(JSON.stringify(res.players)).not.toContain(token)
  })

  it('rejects a wrong token', () => {
    const { room } = startedRoom()
    expect(() => rejoinRoom(makeSocket('x'), room.code, 'nope')).toThrow()
  })

  it('a stale socket disconnecting late does not kick the player who already came back', () => {
    const { io, room, socketWhite } = startedRoom()
    rejoinRoom(makeSocket('sock-white-2'), room.code, room.players.white.token)
    handleDisconnect(io, socketWhite) // the old socket's disconnect only arrives now
    expect(room.players.white.connected).toBe(true)
  })

  it('throws the room away once both players stay gone long enough', () => {
    vi.useFakeTimers()
    try {
      const { io, room, socketWhite, socketBlack } = startedRoom()
      handleDisconnect(io, socketWhite)
      handleDisconnect(io, socketBlack)
      vi.advanceTimersByTime(ABANDONED_ROOM_MS + 1)
      expect(getRoomByCode(room.code)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the room if someone comes back in time', () => {
    vi.useFakeTimers()
    try {
      const { io, room, socketWhite, socketBlack } = startedRoom()
      handleDisconnect(io, socketWhite)
      handleDisconnect(io, socketBlack)
      rejoinRoom(makeSocket('sock-white-2'), room.code, room.players.white.token)
      vi.advanceTimersByTime(ABANDONED_ROOM_MS + 1)
      expect(getRoomByCode(room.code)).toBe(room)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('seat ownership', () => {
  it('rejoin reports the socket it replaced, so it can be evicted', () => {
    const { room } = makeRoom()
    const res = rejoinRoom(makeSocket('sock-white-tab2'), room.code, room.players.white.token)
    expect(res.replacedSocketId).toBe('sock-white')
  })

  it('an evicted socket leaving does not free the seat its replacement now owns', () => {
    const { io, room, socketWhite } = makeRoom()
    rejoinRoom(makeSocket('sock-white-tab2'), room.code, room.players.white.token)
    leaveRoom(io, socketWhite)
    expect(room.players.white?.socketId).toBe('sock-white-tab2')
  })
})

describe('rooms against the AI', () => {
  it('seats the bot, starts the match at once, and keeps the room private', async () => {
    const { createBotRoom } = await import('./bot.js')
    const sockets = new Map()
    const { io } = makeIo(sockets)
    const human = makeSocket('sock-human'); sockets.set('sock-human', human)
    const res = createBotRoom(io, human, { level: 'weak', color: 'white', name: 'Я' })
    const room = getRoomByCode(res.code)
    expect(room.players.black).toMatchObject({ bot: true, connected: true })
    expect(room.match.phase).toBe('draft')
    expect(room.visibility).toBe('private')
    expect(res.players.black.name).toMatch(/ИИ/)
  })

  it('throws the room away when the human leaves — the bot never keeps it alive', async () => {
    const { createBotRoom } = await import('./bot.js')
    const sockets = new Map()
    const { io } = makeIo(sockets)
    const human = makeSocket('sock-human2'); sockets.set('sock-human2', human)
    const res = createBotRoom(io, human, { level: 'normal', color: 'black' })
    leaveRoom(io, human)
    expect(getRoomByCode(res.code)).toBeNull()
  })
})
