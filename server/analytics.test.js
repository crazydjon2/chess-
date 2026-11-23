import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoom, joinRoom, getRoomByCode, startMatch, handleSurrender, setEventHook } from './rooms.js'
import { openStatsDb } from './stats.js'
import { createAnalytics, rateLimiter } from './analytics.js'
import { createFeedback } from './feedback.js'
import { buildFunnelReport, buildFeedbackPage } from './funnelReport.js'

const VID = 'abcdefgh1234'

describe('analytics', () => {
  let db, a, day = '2026-11-16'
  beforeEach(async () => {
    db = await openStatsDb(':memory:')
    a = createAnalytics(db, { now: () => Date.parse(`${day}T12:00:00Z`) })
  })

  const rows = () => db.prepare('SELECT day, vid, event, n FROM daily ORDER BY event').all().map(r => ({ ...r }))

  it('counts per (day, visitor, event) instead of storing raw events', () => {
    a.ingest({ vid: VID, events: ['visit', 'online_open', 'online_open'], meta: { source: 'reddit', lang: 'en', device: 'mobile', tz: 'America/New_York' } })
    a.ingest({ vid: VID, events: ['online_open'] })
    expect(rows()).toEqual([
      { day, vid: VID, event: 'online_open', n: 3 },
      { day, vid: VID, event: 'visit', n: 1 },
    ])
    expect({ ...db.prepare('SELECT * FROM visitors').get() }).toEqual({ vid: VID, first_day: day, source: 'reddit', lang: 'en', device: 'mobile', ua: '', tz: 'America/New_York' })
  })

  it('records how long an opponent wait lasted and shows it in the funnel report', () => {
    const t = Date.parse(`${day}T12:00:00Z`)
    a.wait({ vid: VID, kind: 'browse', roomsSeen: 0, startedAt: t - 40e3 }, 'back')
    a.wait({ vid: 'bad id', kind: 'host', visibility: 'public', startedAt: t - 90e3 }, 'left')
    const w = db.prepare('SELECT day, vid, kind, visibility, rooms_seen, wait_ms, outcome FROM waits ORDER BY id').all().map(r => ({ ...r }))
    expect(w).toEqual([
      { day, vid: VID, kind: 'browse', visibility: null, rooms_seen: 0, wait_ms: 40000, outcome: 'back' },
      { day, vid: null, kind: 'host', visibility: 'public', rooms_seen: null, wait_ms: 90000, outcome: 'left' },
    ])
    const html = buildFunnelReport(db, { now: t })
    expect(html).toContain('Ожидание соперника')
    expect(html).toContain('40 с')
    expect(html).toContain('1.5 мин')
  })

  it('drops a malformed time zone', () => {
    a.ingest({ vid: VID, events: ['visit'], meta: { tz: "x'); DROP TABLE visitors;--" } })
    a.ingest({ vid: 'zyxwvuts9876', events: ['visit'], meta: { tz: 'y'.repeat(41) } })
    expect(db.prepare('SELECT tz FROM visitors').all().map(r => r.tz)).toEqual(['', ''])
  })

  it('keeps the first visit attribution', () => {
    a.ingest({ vid: VID, events: ['visit'], meta: { source: 'reddit' } })
    day = '2026-11-17'
    a.ingest({ vid: VID, events: ['visit'], meta: { source: 'tiktok' } })
    expect(db.prepare('SELECT first_day, source FROM visitors').get()).toMatchObject({ first_day: '2026-11-16', source: 'reddit' })
  })

  it('stores the first visit User-Agent, clipped', () => {
    a.ingest({ vid: VID, events: ['visit'] }, 'HeadlessChrome/131 ' + 'x'.repeat(500))
    const ua = db.prepare('SELECT ua FROM visitors').get().ua
    expect(ua.startsWith('HeadlessChrome/131')).toBe(true)
    expect(ua.length).toBe(200)
  })

  it('adds the ua and tz columns to an older visitors table', async () => {
    const old = await openStatsDb(':memory:')
    old.exec("CREATE TABLE visitors (vid TEXT PRIMARY KEY, first_day TEXT NOT NULL, source TEXT, lang TEXT, device TEXT)")
    createAnalytics(old).ingest({ vid: VID, events: ['visit'], meta: { tz: 'Asia/Kolkata' } }, 'Mozilla/5.0')
    expect({ ...old.prepare('SELECT ua, tz FROM visitors').get() }).toEqual({ ua: 'Mozilla/5.0', tz: 'Asia/Kolkata' })
  })

  it('ignores junk: bad ids, unknown events, non-objects', () => {
    expect(a.ingest(null)).toBe(false)
    expect(a.ingest({ vid: 'BAD ID!', events: ['visit'] })).toBe(false)
    expect(a.ingest({ vid: VID, events: ['drop_table'] })).toBe(false)
    a.track('nope', 'match_start')
    expect(rows()).toEqual([])
  })

  it('credits game events to the seated humans, bot rooms prefixed', () => {
    const tracked = []
    setEventHook((room, name) => {
      const ev = room.bot ? `bot_${name}` : name
      for (const s of [room.players.white, room.players.black]) if (s?.vid) tracked.push([s.vid, ev])
    })
    const sockets = new Map()
    const io = { sockets: { sockets }, to() { return { emit() {} } } }
    const mk = (id, vid) => { const s = { id, data: { vid }, join() {}, leave() {}, emit() {} }; sockets.set(id, s); return s }
    const w = mk('w', 'vidwhite01'), bl = mk('b', 'vidblack01')
    const { code } = createRoom(w, 'white')
    joinRoom(bl, code)
    const room = getRoomByCode(code)
    startMatch(io, room)
    room.match = { ...room.match, phase: 'battle', gameState: { pieces: {}, cards: { white: { hand: [], used: [] }, black: { hand: [], used: [] } }, turn: 'white' } }
    handleSurrender(io, w)
    setEventHook(null)
    expect(tracked).toEqual([
      ['vidwhite01', 'match_start'], ['vidblack01', 'match_start'],
      ['vidwhite01', 'round_done'], ['vidblack01', 'round_done'],
    ])
  })

  it('funnel report renders with data', () => {
    a.ingest({ vid: VID, events: ['visit', 'online_open'], meta: { source: 'reddit', tz: 'Europe/Berlin' } })
    a.track(VID, 'match_start')
    const html = buildFunnelReport(db, { days: 7, now: Date.parse(`${day}T12:00:00Z`) })
    expect(html).toContain('Mischess — воронка')
    expect(html).toContain('reddit')
    expect(html).toContain('Europe/Berlin') // time zone table
    expect(html).toMatch(/<td>Europe<\/td>/) // region table
  })
})

describe('rateLimiter', () => {
  it('allows max per window per key', () => {
    const ok = rateLimiter(2, 60_000)
    expect([ok('a'), ok('a'), ok('a'), ok('b')]).toEqual([true, true, false, true])
  })
})

describe('feedback', () => {
  let db, t
  beforeEach(async () => { db = await openStatsDb(':memory:'); t = Date.parse('2026-11-16T12:00:00Z') })
  afterEach(() => vi.restoreAllMocks())

  const human = (text, extra = {}) => ({ text, vid: VID, lang: 'en', page: '/', hp: '', ms: 8000, ...extra })
  const stored = () => db.prepare('SELECT text FROM feedback ORDER BY id').all().map(r => r.text)
  const make = (opts = {}) => createFeedback(db, { env: {}, now: () => t, ...opts })

  it('stores feedback and emails it via Resend when configured', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '' }))
    const fb = make({ env: { RESEND_API_KEY: 'k', FEEDBACK_TO: 'me@x.com' }, fetchImpl })
    expect(fb.submit(human('  Meteor is too strong  '))).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect({ ...db.prepare('SELECT text, mailed FROM feedback').get() }).toEqual({ text: 'Meteor is too strong', mailed: 1 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(init.body)).toMatchObject({ to: ['me@x.com'] })
    expect(buildFeedbackPage(db)).toContain('Meteor is too strong')
  })

  it('still stores when mail is not configured or fails; rejects empty', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }))
    const fb = make({ env: { RESEND_API_KEY: 'k', FEEDBACK_TO: 'me@x.com' }, fetchImpl })
    expect(fb.submit(human('   '))).toBe(false)
    expect(fb.submit(human('hi'))).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(db.prepare('SELECT mailed FROM feedback').get().mailed).toBe(0)
    expect(err).toHaveBeenCalled()
  })

  it('silently drops spam: honeypot, instant/scripted submits, link floods, duplicates', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fb = make()
    expect(fb.submit(human('bot 1', { hp: 'http://spam' }))).toBe(true)
    expect(fb.submit(human('bot 2', { ms: 300 }))).toBe(true)
    expect(fb.submit({ text: 'bot 3 (direct POST, no ms)' })).toBe(true)
    expect(fb.submit(human('buy http://a.x http://b.x https://c.x'))).toBe(true)
    expect(fb.submit(human('real one'))).toBe(true)
    expect(fb.submit(human('real one'))).toBe(true)
    expect(stored()).toEqual(['real one'])
  })

  it('caps per visitor per day, then lets them write again next day', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fb = make()
    for (let i = 0; i < 12; i++) fb.submit(human(`msg ${i}`))
    expect(stored()).toHaveLength(10)
    t += 864e5 + 1
    fb.submit(human('next day'))
    expect(stored()).toHaveLength(11)
  })

  it('stops mailing after the daily mail cap but keeps storing', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '' }))
    const fb = make({ env: { RESEND_API_KEY: 'k', FEEDBACK_TO: 'me@x.com' }, fetchImpl })
    for (let i = 0; i < 45; i++) {
      fb.submit(human(`m${i}`, { vid: `visitor${String(i).padStart(4, '0')}` }))
      await new Promise(r => setTimeout(r, 0))
    }
    expect(stored()).toHaveLength(45)
    expect(fetchImpl).toHaveBeenCalledTimes(40)
  })
})
