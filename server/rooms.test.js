import { describe, it, expect, beforeEach } from 'vitest'
import { createRoom, joinRoom, getRoomByCode, handlePlayCard, handlePlacement, handleDraftPick, handleMove, handleSurrender } from './rooms.js'
import { getCaptured } from '../client/src/game/economy.js'

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
        coins: { white: 0, black: 0 },
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
        coins: { white: 0, black: 0 },
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
    expect(blackLastAction).toEqual({ type: 'card', color: 'white', hidden: true })
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

    const expectedStrikes = [{ square: 'b2', destroyed: { type: 'pawn', color: 'white', hp: 1 } }]
    expect(emits['sock-white'].at(-1).payload.meteorStrikes).toEqual(expectedStrikes)
    expect(emits['sock-black'].at(-1).payload.meteorStrikes).toEqual(expectedStrikes)

    const whiteView = lastView(emits, 'sock-white').gameState
    expect(whiteView.pieces.b2).toBeUndefined()
    expect(whiteView.meteors).toEqual([])
  })
})

describe('handleDraftPick with a missing/malformed payload', () => {
  it('does not throw when the payload is entirely missing (e.g. socket.emit(\'draft_pick\') with no args)', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = { phase: 'draft', draft: { round: 1, firstColor: 'white', secondColor: 'black', pool: { pieces: {}, cards: [] }, turnIndex: 0, budgets: { white: 0, black: 0 }, picks: { white: { pieces: [], cards: [] }, black: { pieces: [], cards: [] } } } }
    expect(() => handleDraftPick(io, socketWhite, undefined)).not.toThrow()
  })
})

describe('battle actions are rejected once the match is over', () => {
  it('handleMove/handlePlayCard are no-ops when phase is match_over', () => {
    const { io, emits, socketWhite, room } = makeRoom()
    const gameState = {
      board: { size: { rows: 6, cols: 6 }, blockedCells: [], extraCells: [] },
      pieces: { b1: { type: 'pawn', color: 'white', hp: 1 } },
      cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
      coins: { white: 20, black: 20 },
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
        coins: { white: 0, black: 0 },
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

    // White's surviving rook (the surrenderer keeps everything) now shows
    // up under carryOver.black, since that same player is black next round.
    expect(room.match.carryOver.black.pieces).toEqual(['rook'])
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
        coins: { white: 0, black: 0 },
        turn: 'white',
      },
    }

    handleSurrender(io, socketWhite) // black reaches 2 wins -> match over

    expect(room.match.phase).toBe('match_over')
    expect(socketWhite.data.color).toBe('white')
    expect(socketBlack.data.color).toBe('black')
  })

  it('rejects a surrender attempted outside the surrendering player\'s own turn', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = {
      phase: 'battle',
      round: 1,
      scores: { white: 0, black: 0 },
      draft: { firstColor: 'white' },
      gameState: {
        pieces: { a1: { type: 'rook', color: 'white', hp: 1 } },
        cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 0, black: 0 },
        turn: 'black', // not white's turn
      },
    }

    handleSurrender(io, socketWhite)

    // Nothing happened — still battle, no round transition.
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
        cards: { white: { hand: [{ id: 'hp_boost' }], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 20, black: 20 },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [{ owner: 'white', cells: ['b1', 'c1'], turnsLeft: 3 }],
        eliminationMode: true,
      },
    }

    handlePlayCard(io, socketWhite, { cardId: 'hp_boost', target: 'b1' })

    const whiteLastAction = emits['sock-white'].at(-1).payload.lastAction
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction

    expect(whiteLastAction).toEqual({ type: 'card', cardId: 'hp_boost', target: 'b1', color: 'white' })
    expect(blackLastAction).toEqual({ type: 'card', color: 'white', hidden: true })
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
        cards: { white: { hand: [{ id: 'hp_boost' }], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 20, black: 20 },
        turn: 'white',
        cardPlayedThisTurn: false,
        halfMoveClock: 0,
        moveHistory: [],
        fogZones: [],
        eliminationMode: true,
      },
    }

    handlePlayCard(io, socketWhite, { cardId: 'hp_boost', target: 'b1' })
    const blackLastAction = emits['sock-black'].at(-1).payload.lastAction
    expect(blackLastAction).toEqual({ type: 'card', cardId: 'hp_boost', target: 'b1', color: 'white' })
  })
})

describe('placement-phase redaction', () => {
  it('hides the opponent\'s placement map until both are ready', () => {
    const { io, emits, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'placement',
      boardPattern: { rows: 6, cols: 6, blockedCells: [] },
      draft: { picks: { white: { pieces: ['pawn'], cards: [] }, black: { pieces: ['pawn'], cards: [] } } },
      carryOver: { white: { pieces: [], cards: [], coins: 0 }, black: { pieces: [], cards: [], coins: 0 } },
      placement: {
        white: { ready: false, map: null },
        black: { ready: false, map: null },
      },
    }

    handlePlacement(io, socketWhite, { b1: 'pawn' })
    const blackSees = lastView(emits, 'sock-black').placement
    expect(blackSees.white).toEqual({ ready: true, map: null }) // ready flag visible, map hidden
    const whiteSees = lastView(emits, 'sock-white').placement
    expect(whiteSees.white.map).toEqual({ b1: 'pawn' }) // you always see your own placement
  })
})
