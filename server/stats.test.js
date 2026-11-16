import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createRoom, joinRoom, getRoomByCode, startMatch, leaveRoom,
  handleDraftPick, handleDraftDone, handleSurrender, handleOfferDraw, handleAnswerDraw, setRoundHook,
} from './rooms.js'
import { openStatsDb, createRoundRecorder, BALANCE_VERSION } from './stats.js'

function makeSocket(id) {
  return { id, data: {}, join() {}, leave() {}, emit() {} }
}

function makeRoom() {
  const sockets = new Map()
  const io = { sockets: { sockets }, to() { return { emit() {} } } }
  const a = makeSocket('sock-a'), b = makeSocket('sock-b')
  sockets.set(a.id, a); sockets.set(b.id, b)
  const { code } = createRoom(a, 'white')
  joinRoom(b, code)
  const room = getRoomByCode(code)
  startMatch(io, room)
  return { io, room, a, b }
}

const bySocket = (room, socket) => (room.players.white.socketId === socket.id ? 'white' : 'black')
const sockOf = (ctx, color) => (bySocket(ctx.room, ctx.a) === color ? ctx.a : ctx.b)

// Recruit: each side places its king, buys one card, then is done.
function recruit(ctx, cardId = 'freeze') {
  const { io, room } = ctx
  const homeSquare = { white: 'c1', black: 'c6' }
  for (const step of ['king', 'card', 'done']) {
    for (let i = 0; i < 2; i++) {
      const s = sockOf(ctx, room.match.draft.turn)
      const color = s.data.color
      if (step === 'king') handleDraftPick(io, s, { kind: 'piece', pieceType: 'king', square: homeSquare[color] })
      else if (step === 'card') handleDraftPick(io, s, { kind: 'card', cardId })
      else handleDraftDone(io, s)
    }
  }
  expect(room.match.phase).toBe('battle')
}

function rows(db) {
  return db.prepare('SELECT * FROM rounds ORDER BY id').all().map(r => ({ ...r, data: JSON.parse(r.data) }))
}

describe('round telemetry', () => {
  let db
  beforeEach(async () => {
    db = await openStatsDb(':memory:')
    setRoundHook(createRoundRecorder(db))
  })
  afterEach(() => setRoundHook(null))

  it('records a surrendered round with both armies and result', () => {
    const ctx = makeRoom()
    recruit(ctx)
    const loser = sockOf(ctx, 'white')
    handleSurrender(ctx.io, loser)

    const [r] = rows(db)
    expect(r.result_type).toBe('surrender')
    expect(r.winner).toBe('black')
    expect(r.mode).toBe('pvp')
    expect(r.balance_ver).toBe(BALANCE_VERSION)
    expect(r.match_id).toBe(ctx.room.matchId)
    expect(r.data.round).toBe(1)
    expect(r.data.sides.white.cards).toEqual(['freeze'])
    expect(r.data.sides.black.pieces).toContain('king')
    expect(r.data.sides.white.player).toMatch(/^[0-9a-f]{10}$/)
    expect(r.data.sides.white.player).not.toBe(r.data.sides.black.player)
    expect(r.data.battleLog.every(e => !('snapshot' in e))).toBe(true)
    expect(r.data.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('keeps the same player id across the per-round colour swap', () => {
    const ctx = makeRoom()
    recruit(ctx)
    const aColorRound1 = ctx.a.data.color
    handleSurrender(ctx.io, ctx.a)
    // summary → next recruit
    ctx.room.match = { ...ctx.room.match, summaryReady: null, summaryDeadline: null, draft: { ...ctx.room.match.draft, turnStartedAt: Date.now() } }
    recruit(ctx)
    handleSurrender(ctx.io, ctx.a)

    const [r1, r2] = rows(db)
    const aId = r1.data.sides[aColorRound1].player
    expect(ctx.a.data.color).not.toBe(aColorRound1)
    expect(r2.data.sides[ctx.a.data.color].player).toBe(aId)
    expect(r2.data.round).toBe(2)
  })

  it('records an agreed draw', () => {
    const ctx = makeRoom()
    recruit(ctx)
    handleOfferDraw(ctx.io, sockOf(ctx, 'white'))
    handleAnswerDraw(ctx.io, sockOf(ctx, 'black'), { accept: true })
    const [r] = rows(db)
    expect(r.result_type).toBe('draw')
    expect(r.winner).toBeNull()
  })

  it('records a battle abandoned by everyone as abandoned', () => {
    const ctx = makeRoom()
    recruit(ctx)
    leaveRoom(ctx.io, ctx.a)
    leaveRoom(ctx.io, ctx.b)
    const [r] = rows(db)
    expect(r.result_type).toBe('abandoned')
  })

  it('never breaks the game when recording throws', () => {
    setRoundHook(createRoundRecorder({ prepare: () => ({ run() { throw new Error('disk full') } }) }))
    const ctx = makeRoom()
    recruit(ctx)
    const orig = console.error; console.error = () => {}
    try { handleSurrender(ctx.io, sockOf(ctx, 'white')) } finally { console.error = orig }
    expect(ctx.room.match.phase).toBe('draft')
  })
})
