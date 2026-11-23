import { describe, it, expect, vi, afterEach } from 'vitest'
import { quickMatch, scheduleQuickStart, createRoom, joinRoom, leaveRoom, getRoomByCode, QUICK_START_MS } from './rooms.js'

// Own file: rooms.js keeps rooms in module state, and quickMatch would
// otherwise happily sit down in rooms other test files left open.
const makeSocket = id => ({ id, data: {}, join() {}, leave() {}, emit() {} })
function makeIo() {
  const sockets = new Map()
  return { sockets: { sockets }, to: () => ({ emit() {} }) }
}

describe('quick match ("Найти соперника")', () => {
  afterEach(() => vi.useRealTimers())

  it('opens a public quick room when nobody waits, and seats the next searcher in it', () => {
    const a = makeSocket('qa'), b = makeSocket('qb')
    const first = quickMatch(a, 'A')
    expect(first).toMatchObject({ created: true, quick: true, visibility: 'public' })
    const second = quickMatch(b, 'B')
    expect(second).toMatchObject({ created: false, code: first.code, quick: true })
    const room = getRoomByCode(first.code)
    expect(room.players.white && room.players.black).toBeTruthy()
  })

  it('never seats anyone in a friend (private) room', () => {
    const host = makeSocket('qh'), stranger = makeSocket('qs')
    const priv = createRoom(host, 'white', 'H', { visibility: 'private' })
    const res = quickMatch(stranger, 'S')
    expect(res.created).toBe(true)
    expect(res.code).not.toBe(priv.code)
  })

  it('starts the match by itself after the countdown, only if both are still there', () => {
    vi.useFakeTimers()
    const io = makeIo()
    const a = makeSocket('qc'), b = makeSocket('qd')
    const { code } = quickMatch(a, 'A')
    quickMatch(b, 'B')
    const room = getRoomByCode(code)
    scheduleQuickStart(io, room)
    expect(room.startsAt).toBeGreaterThan(Date.now())
    vi.advanceTimersByTime(QUICK_START_MS)
    expect(room.match).toBeTruthy()

    // c may land in a room an earlier test left waiting — either way it ends
    // up full, and then c walks out during the countdown.
    const c = makeSocket('qe'), d = makeSocket('qf')
    const r2 = quickMatch(c, 'C')
    if (r2.created) joinRoom(d, r2.code, 'D')
    const room2 = getRoomByCode(r2.code)
    scheduleQuickStart(io, room2)
    leaveRoom(io, c)
    vi.advanceTimersByTime(QUICK_START_MS)
    expect(room2.match).toBeFalsy()
  })
})
