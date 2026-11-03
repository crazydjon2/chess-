// Server fuzzer: hammers the REAL socket handlers (server/rooms.js) with a
// mix of sensible and garbage events from several fake players, under a
// fake clock so every timer (draft, placement, battle, summary, abandoned
// room) actually fires. Checks that nothing throws and nothing secret ever
// leaves the server.
import * as rooms from '../../../server/rooms.js'
import { chess, cards, draft as draftEngine, boards, placement as placementEngine, legalMoves, opp } from './engine.js'
import { mulberry32 } from './rng.js'

const GARBAGE = [null, undefined, 0, 42, '', 'x', [], {}, { kind: 'piece' }, { kind: 'card', cardId: 'nope' }, { from: 'z9', to: '' }, { map: null }, '__proto__', { constructor: 1 }, { cardId: 'meteor', target: { evil: true } }]

export function serverFuzz({ iterations = 20000, seed = 1 } = {}) {
  const rng = mulberry32(seed)
  const pick = a => a[Math.floor(rng() * a.length)]
  const issues = []
  const issue = (kind, detail) => { if (issues.length < 200) issues.push({ kind, detail, seed }) }

  // ── fake clock + timers ───────────────────────────────────────────────
  const realNow = Date.now, realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout
  let now = 1_700_000_000_000
  let timerId = 1
  const timers = new Map()
  Date.now = () => now
  globalThis.setTimeout = (fn, ms) => { const id = { id: timerId++ }; timers.set(id, { at: now + Math.max(0, ms ?? 0), fn }); return id }
  globalThis.clearTimeout = id => { timers.delete(id) }
  const advance = ms => {
    const until = now + ms
    for (let guard = 0; guard < 1000; guard++) {
      let next = null
      for (const [id, t] of timers) if (t.at <= until && (!next || t.at < next[1].at)) next = [id, t]
      if (!next) break
      timers.delete(next[0]); now = Math.max(now, next[1].at)
      try { next[1].fn() } catch (e) { issue('timer threw', String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ')) }
    }
    now = until
  }

  // ── fake io / sockets ─────────────────────────────────────────────────
  const tokens = new Set()
  const sockets = new Map()
  const inbox = new Map()
  const record = (to, ev, payload) => {
    const list = inbox.get(to) ?? []
    list.push({ ev, payload })
    if (list.length > 5) list.shift()
    inbox.set(to, list)
    checkPayload(to, ev, payload)
  }
  const io = { sockets: { sockets }, to: id => ({ emit: (ev, p) => record(id, ev, p) }) }
  let sid = 0
  const newSocket = () => {
    const s = { id: 'fz' + (sid++), data: {}, join() {}, leave() {}, emit: (ev, p) => record(s.id, ev, p), token: null, code: null }
    sockets.set(s.id, s)
    return s
  }

  function checkPayload(to, ev, payload) {
    let text
    try { text = JSON.stringify(payload) ?? '' } catch (e) { issue('unserializable payload', ev); return }
    for (const t of tokens) if (text.includes(t)) issue('token leaked', `${ev} to ${to}`)
    if (ev !== 'match_update' || !payload?.match?.gameState) return
    const viewer = payload.color, enemy = opp(viewer), gs = payload.match.gameState
    for (const m of gs.meteors ?? []) if (m.owner === enemy && m.square) issue('meteor square leaked', `${viewer} sees ${m.square}`)
    for (const m of gs.mines ?? []) if (m.owner === enemy && m.square) issue('mine square leaked', `${viewer} sees ${m.square}`)
    const real = rooms.getRoomByCode(payload.code)?.match?.gameState
    if (real) for (const z of real.fogZones ?? []) if (z.owner === enemy) for (const c of z.cells) if (gs.pieces?.[c]?.color === enemy) issue('fogged piece leaked', `${viewer} sees ${c}`)
  }

  const safe = (name, fn) => {
    try { return fn() } catch (e) {
      const msg = String(e?.message ?? e)
      // create/join/rejoin report user errors by throwing on purpose
      if (['create', 'join', 'rejoin'].includes(name) && /Комната|Игра|заполнена|участник/.test(msg)) return null
      issue('handler threw', `${name}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`)
      return null
    }
  }

  const players = []
  const roomOf = s => (s.data.roomCode ? rooms.getRoomByCode(s.data.roomCode) : null)

  // A plausible action for this socket given the real server state.
  function sensible(s) {
    const room = roomOf(s), m = room?.match, me = s.data.color
    if (!room) {
      // any room with a free seat — public ones from the browser, private
      // ones by the code another fake player "shared"
      const codes = new Set(rooms.listOpenRooms().map(r => r.code))
      for (const p of players) {
        const r = p.data.roomCode && rooms.getRoomByCode(p.data.roomCode)
        if (r && !r.match && (!r.players.white || !r.players.black)) codes.add(r.code)
      }
      if (codes.size && rng() < 0.8) return ['join', () => { const r = rooms.joinRoom(s, pick([...codes]), 'P'); s.token = r.token; tokens.add(r.token); s.code = r.code }]
      return ['create', () => { const r = rooms.createRoom(s, pick(['white', 'black', 'random']), 'H', { visibility: pick(['public', 'private']) }); s.token = r.token; tokens.add(r.token); s.code = r.code }]
    }
    if (!m) {
      const full = room.players.white && room.players.black
      if (full && room.host === s.data.color) return ['start', () => rooms.handleStartMatch(io, s)]
      if (!full && rng() < 0.03) return ['leave', () => rooms.leaveRoom(io, s)]
      return ['wait', () => advance(500)]
    }
    if (m.phase === 'draft') {
      if (m.summaryReady && !m.summaryReady[me]) return ['summary', () => rooms.handleSummaryContinue(io, s)]
      const ds = m.draft
      if (ds.turn !== me || ds.done[me]) return ['wait', () => advance(500)]
      const items = [...draftEngine.ALL_PIECE_TYPES.map(t => ({ kind: 'piece', pieceType: t })), ...Object.keys(cards.CARD_DEFS).map(c => ({ kind: 'card', cardId: c }))]
      const it = pick(items)
      return rng() < 0.15 ? ['done', () => rooms.handleDraftDone(io, s)] : ['pick', () => rooms.handleDraftPick(io, s, it)]
    }
    if (m.phase === 'placement') {
      if (m.placement[me].ready) return ['wait', () => advance(rng() < 0.3 ? 40_000 : 1000)]
      const pieces = m.draft.picks[me].pieces
      const map = placementEngine.autoCompletePlacement(m.boardPattern, me, {}, pieces, rng)
      if (rng() < 0.5) {
        const partial = Object.fromEntries(Object.entries(map).slice(0, Math.floor(rng() * pieces.length)))
        return ['placeLive', () => rooms.handleUpdatePlacement(io, s, partial)]
      }
      return ['ready', () => rooms.handlePlacement(io, s, map)]
    }
    if (m.phase === 'battle') {
      const gs = m.gameState
      const r = rng()
      if (r < 0.03) return ['surrender', () => rooms.handleSurrender(io, s)]
      if (r < 0.07) return ['offerDraw', () => rooms.handleOfferDraw(io, s)]
      if (gs.drawOffer && gs.drawOffer !== me && r < 0.2) return ['answerDraw', () => rooms.handleAnswerDraw(io, s, { accept: rng() < 0.3 })]
      if (gs.turn !== me) return ['wait', () => advance(rng() < 0.05 ? 300_000 : 2000)]
      if (r < 0.3 && gs.cards[me].hand.length && !gs.cardPlayedThisTurn) {
        const c = pick(gs.cards[me].hand)
        const targets = cards.getValidTargets(c.id, gs, me)
        if (targets.length) return ['card', () => rooms.handlePlayCard(io, s, { cardId: c.id, target: pick(targets) })]
      }
      const moves = legalMoves(gs, me)
      if (!moves.length) return ['wait', () => advance(5000)]
      const mv = pick(moves)
      return ['move', () => rooms.handleMove(io, s, { ...mv, promotion: pick(['queen', 'knight', 'rook', 'bishop', 'king', undefined]) })]
    }
    return ['leave', () => rooms.leaveRoom(io, s)]
  }

  function garbage(s) {
    const g = pick(GARBAGE)
    return pick([
      ['g:create', () => rooms.createRoom(s, g, g, g ?? {})],
      ['g:join', () => rooms.joinRoom(s, g, g)],
      ['g:rejoin', () => rooms.rejoinRoom(s, g, g)],
      ['g:pick', () => rooms.handleDraftPick(io, s, g)],
      ['g:placeLive', () => rooms.handleUpdatePlacement(io, s, g)],
      ['g:ready', () => rooms.handlePlacement(io, s, g)],
      ['g:move', () => rooms.handleMove(io, s, g)],
      ['g:card', () => rooms.handlePlayCard(io, s, g)],
      ['g:answer', () => rooms.handleAnswerDraw(io, s, g)],
      ['g:start', () => rooms.handleStartMatch(io, s)],
      ['g:done', () => rooms.handleDraftDone(io, s)],
      ['g:summary', () => rooms.handleSummaryContinue(io, s)],
    ])
  }

  function lifecycle(s) {
    return pick([
      ['disconnect', () => { rooms.handleDisconnect(io, s); sockets.delete(s.id); players.splice(players.indexOf(s), 1) }],
      ['leave', () => rooms.leaveRoom(io, s)],
      ['reconnect', () => {
        // the same player comes back on a new socket with their saved seat
        rooms.handleDisconnect(io, s); sockets.delete(s.id)
        const n = newSocket(); n.token = s.token; n.code = s.code
        players[players.indexOf(s)] = n
        if (s.code && s.token) {
          // Refusal is legitimate here (room gone, seat freed in the lobby).
          let r
          try { r = rooms.rejoinRoom(n, s.code, s.token) } catch { return }
          if (r.replacedSocketId) { const old = sockets.get(r.replacedSocketId); if (old) { old.data.roomCode = null } }
          const room = rooms.getRoomByCode(n.data.roomCode)
          if (room) { rooms.broadcastRoom(io, room); if (room.match) rooms.broadcastMatchTo(io, room) }
        }
      }],
      ['time', () => advance(pick([1000, 30_000, 60_000, 400_000]))],
    ])
  }

  const counts = {}
  const phases = {}
  try {
    for (let i = 0; i < 4; i++) players.push(newSocket())
    for (let it = 0; it < iterations; it++) {
      if (players.length < 4) players.push(newSocket())
      const s = pick(players)
      const r = rng()
      const [name, fn] = r < 0.82 ? sensible(s) : r < 0.94 ? garbage(s) : lifecycle(s)
      counts[name] = (counts[name] ?? 0) + 1
      safe(name.replace(/^g:/, ''), fn)
      const ph = roomOf(s)?.match?.phase ?? (roomOf(s) ? 'lobby' : 'none')
      phases[ph] = (phases[ph] ?? 0) + 1
      if (it % 50 === 0) advance(200)
    }
  } finally {
    // tear everything down so no fake timers linger
    for (const s of [...sockets.values()]) safe('leave', () => rooms.leaveRoom(io, s))
    Date.now = realNow; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout
  }
  const grouped = new Map()
  for (const x of issues) { const k = x.kind + ': ' + x.detail.split(' | ')[0]; const e = grouped.get(k) ?? { ...x, count: 0 }; e.count++; grouped.set(k, e) }
  return { iterations, actions: counts, phases, issues: [...grouped.values()] }
}
