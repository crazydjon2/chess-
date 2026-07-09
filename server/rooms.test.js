import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoom, joinRoom, getRoomByCode, handlePlayCard, handlePlacement, handleDraftBan, handleDraftBuy, handleMove, handleSurrender } from './rooms.js'
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
        coins: { white: 0, black: 0 },
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
    expect(blackLastAction).toEqual({ type: 'card', color: 'white', hidden: true })
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

describe('handleDraftBan/handleDraftBuy with a missing/malformed payload', () => {
  it('does not throw when the ban payload is entirely missing (e.g. socket.emit(\'draft_ban\') with no args)', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = { phase: 'draft', draft: { round: 1, firstColor: 'white', secondColor: 'black', phase: 'ban', banCount: 1, bans: { white: null, black: null }, budgets: { white: 0, black: 0 }, picks: { white: null, black: null } } }
    expect(() => handleDraftBan(io, socketWhite, undefined)).not.toThrow()
  })

  it('does not throw when the buy payload is entirely missing (e.g. socket.emit(\'draft_buy\') with no args)', () => {
    const { io, socketWhite, room } = makeRoom()
    room.match = { phase: 'draft', draft: { round: 1, firstColor: 'white', secondColor: 'black', phase: 'buy', banCount: 1, bans: { white: [], black: [] }, budgets: { white: 0, black: 0 }, picks: { white: null, black: null } } }
    expect(() => handleDraftBuy(io, socketWhite, undefined)).not.toThrow()
  })
})

describe('draft-phase redaction (viewFor)', () => {
  it('hides the opponent\'s ban targets until both sides have submitted', () => {
    const { io, emits, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'draft',
      round: 1,
      draft: {
        round: 1, firstColor: 'white', secondColor: 'black', phase: 'ban', banCount: 1,
        bans: { white: null, black: null },
        budgets: { white: 20, black: 20 },
        picks: { white: null, black: null },
      },
    }
    handleDraftBan(io, socketWhite, [{ kind: 'piece', pieceType: 'queen' }])
    const blackSees = lastView(emits, 'sock-black').draft
    expect(blackSees.bans.white).toBeNull() // white's ban is hidden from black until black also submits
    const whiteSees = lastView(emits, 'sock-white').draft
    expect(whiteSees.bans.white).toEqual([{ kind: 'piece', pieceType: 'queen' }]) // you always see your own ban

    handleDraftBan(io, socketBlack, [{ kind: 'piece', pieceType: 'rook' }])
    const blackSeesNow = lastView(emits, 'sock-black').draft
    expect(blackSeesNow.bans.white).toEqual([{ kind: 'piece', pieceType: 'queen' }]) // revealed once both submitted
  })

  it('hides the opponent\'s cart for the whole draft phase, even after both have bought', () => {
    const { io, emits, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'draft',
      round: 1,
      draft: {
        round: 1, firstColor: 'white', secondColor: 'black', phase: 'buy', banCount: 1,
        bans: { white: [{ kind: 'piece', pieceType: 'knight' }], black: [{ kind: 'piece', pieceType: 'rook' }] },
        budgets: { white: 20, black: 20 },
        picks: { white: null, black: null },
      },
    }
    handleDraftBuy(io, socketWhite, [{ kind: 'piece', pieceType: 'pawn' }])
    // Check the broadcast right after white's own buy, while the match was
    // still mid-draft (black hasn't bought yet) — black's cart must be
    // hidden from white even though it's white's own view.
    const whiteFirstView = emits['sock-white'][0].payload.match
    expect(whiteFirstView.draft.picks.black).toBeNull()
    expect(whiteFirstView.draft.picks.white).toEqual({ pieces: ['pawn'], cards: [] })
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
        cards: { white: { hand: [{ id: 'barricade' }], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 20, black: 20 },
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
        cards: { white: { hand: [{ id: 'barricade' }], used: [] }, black: { hand: [], used: [] } },
        coins: { white: 20, black: 20 },
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

describe('placement-phase redaction', () => {
  it('hides the opponent\'s placement map until both are ready', () => {
    const { io, emits, socketWhite, socketBlack, room } = makeRoom()
    room.match = {
      phase: 'placement',
      boardPattern: { rows: 6, cols: 6, blockedCells: [] },
      draft: { picks: { white: { pieces: ['pawn'], cards: [] }, black: { pieces: ['pawn'], cards: [] } } },
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
          coins: { white: 0, black: 0 },
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
          coins: { white: 0, black: 0 },
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
