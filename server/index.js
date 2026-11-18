import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  createRoom, joinRoom, rejoinRoom, getRoomByCode,
  broadcastRoom, handleStartMatch,
  handleSummaryContinue, handleDraftPick, handleDraftDone, handleRematch,
  handleMove, handlePlayCard, handleSurrender, handleOfferDraw, handleAnswerDraw,
  leaveRoom, handleDisconnect,
  subscribeLobby, unsubscribeLobby, broadcastLobbyList, broadcastMatchTo,
  setBotHook, setRoundHook, setEventHook,
} from './rooms.js'
import { createBotRoom, onRoomUpdate } from './bot.js'
import { openStatsDb, createRoundRecorder, DEFAULT_DB, BALANCE_VERSION } from './stats.js'
import { createAnalytics, rateLimiter, isVid } from './analytics.js'
import { createFeedback } from './feedback.js'
import { mountAdmin } from './admin.js'

setBotHook(onRoomUpdate)

// One SQLite file holds balance telemetry (stats.js), product analytics
// (analytics.js) and player feedback (feedback.js). STATS=off disables all.
let statsDb = null, analytics = null, feedback = null
if (process.env.STATS !== 'off') {
  const file = process.env.STATS_DB || DEFAULT_DB
  try {
    statsDb = await openStatsDb(file)
    setRoundHook(createRoundRecorder(statsDb))
    analytics = createAnalytics(statsDb)
    feedback = createFeedback(statsDb)
    console.log(`[stats] recording to ${file} (balance ${BALANCE_VERSION})`)
  } catch (e) {
    console.error('[stats] disabled:', e.message)
  }
}

// Game events → the analytics counters of every human seated in the room.
setEventHook((room, name) => {
  if (!analytics) return
  const event = room.bot ? `bot_${name}` : name
  for (const seat of [room.players.white, room.players.black]) {
    if (seat?.vid && !seat.bot) analytics.track(seat.vid, event)
  }
})

const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.join(__dirname, '../client/dist')

const app = express()
app.use(cors())
// Behind the host's proxy (Railway): req.ip = the real client IP, for rate limits.
app.set('trust proxy', true)

// Must come before the SPA catch-all below.
app.get('/healthz', (_req, res) => res.send('ok'))
mountAdmin(app, () => statsDb)

// Bodies arrive as text/plain JSON (navigator.sendBeacon and a "simple"
// fetch — no CORS preflight from the dev client), parsed here.
const textBody = (limit) => express.text({ limit, type: () => true })
function parseJson(s) { try { return JSON.parse(s) } catch { return null } }

const eventsLimit = rateLimiter(60, 60_000)
app.post('/api/e', textBody('4kb'), (req, res) => {
  if (analytics && eventsLimit(req.ip)) analytics.ingest(parseJson(req.body), req.get('user-agent'))
  res.status(204).end()
})

const feedbackLimit = rateLimiter(5, 10 * 60_000)
app.post('/api/feedback', textBody('16kb'), (req, res) => {
  if (!feedback) return res.status(503).json({ error: 'err.server' })
  if (!feedbackLimit(req.ip)) return res.status(429).json({ error: 'err.tooMany' })
  const ok = feedback.submit(parseJson(req.body))
  res.status(ok ? 200 : 400).json(ok ? { ok: true } : { error: 'err.badRequest' })
})

// Serves the built client (client/dist) from this same process/port, so the
// whole app — game server AND static site — is one deployable service with
// no separate hosting/CORS to configure. Socket.IO's own requests never
// reach this catch-all: engine.io intercepts anything under its own path
// before Express's routes ever see it (see socket.io's httpServer.attach),
// so this is safe to register unconditionally.
app.use(express.static(CLIENT_DIST))
app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

// Every client event goes through here. Payloads come straight off the
// wire, so they can be anything — null, a string, an array — and the ack
// callback may be missing or not a function. Destructuring a null payload
// used to throw inside the listener, and an exception there takes the
// whole Node process down: one bad (or malicious) client could kill every
// game on the server. Normalizing here, and catching anything a handler
// throws, protects every current and future event in one place.
function on(socket, event, handler) {
  socket.on(event, (payload, cb) => {
    if (typeof payload === 'function' && cb === undefined) { cb = payload; payload = undefined }
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
    const reply = typeof cb === 'function' ? cb : () => {}
    try {
      handler(data, reply)
    } catch (e) {
      console.error(`[${event}] handler failed:`, e)
      reply({ error: 'err.server' })
      socket.emit('game_error', { message: 'err.server' })
    }
  })
}

io.on('connection', (socket) => {
  // Anonymous analytics id from client/src/analytics.js (io auth payload);
  // rooms.js copies it onto the seat this socket takes.
  socket.data.vid = isVid(socket.handshake.auth?.vid) ? socket.handshake.auth.vid : null

  // ── Lobby browser ────────────────────────────────────────────────────
  // Subscribing returns the current list immediately AND registers for
  // pushes; the client unsubscribes when it leaves the browse screen so
  // idle games in progress aren't fanning out list updates to everyone.
  on(socket, 'list_rooms', (_data, reply) => {
    reply({ rooms: subscribeLobby(socket) })
  })

  on(socket, 'unlist_rooms', () => unsubscribeLobby(socket))

  on(socket, 'create_room', ({ color, name, visibility }, reply) => {
    let res
    try {
      res = createRoom(socket, color, name, { visibility })
    } catch (e) {
      reply({ error: e.message })
      return
    }
    reply(res)
    analytics?.track(socket.data.vid, 'room_create')
    // The creator is now sitting in a room, not browsing — and a new
    // public room just became joinable for everyone who still is.
    unsubscribeLobby(socket)
    broadcastLobbyList(io)
  })

  // A private room against the AI: the bot takes the other seat and the
  // match starts right away (see bot.js).
  on(socket, 'create_bot_room', ({ level, color, name }, reply) => {
    let res
    try {
      res = createBotRoom(io, socket, { level, color, name })
    } catch (e) {
      reply({ error: e.message })
      return
    }
    reply(res)
    unsubscribeLobby(socket)
  })

  on(socket, 'join_room', ({ code, name }, reply) => {
    let res
    try {
      res = joinRoom(socket, code, name)
    } catch (e) {
      reply({ error: e.message })
      return
    }
    reply(res)
    analytics?.track(socket.data.vid, 'room_join')
    unsubscribeLobby(socket)

    // Just let both seats know the room is now full — the HOST decides when
    // to actually start (see handleStartMatch / 'start_match' below), so the
    // second player no longer gets snapped straight into the draft.
    const room = getRoomByCode(socket.data.roomCode)
    if (room) broadcastRoom(io, room)
    // That room just filled up, so it drops out of the browser list.
    broadcastLobbyList(io)
  })

  // Reclaim a seat in a match in progress (reload / dropped connection) —
  // see rooms.js's rejoinRoom. Pushes the current match state straight
  // back so the client lands on whatever phase is live right now.
  on(socket, 'rejoin_room', ({ code, token }, reply) => {
    let res
    try {
      res = rejoinRoom(socket, code, token)
    } catch (e) {
      reply({ error: e.message })
      return
    }
    // The seat's previous socket may still be alive — a duplicated tab
    // carrying the same token, or a dropped connection the server hasn't
    // noticed yet. Only one socket can own a seat: tell the old one it's
    // been replaced instead of leaving two clients both thinking it's theirs.
    const { replacedSocketId, ...publicRes } = res
    const replaced = replacedSocketId && io.sockets.sockets.get(replacedSocketId)
    if (replaced) {
      replaced.leave(publicRes.code)
      replaced.data.roomCode = null
      replaced.emit('seat_taken')
    }
    reply(publicRes)
    unsubscribeLobby(socket)
    const room = getRoomByCode(socket.data.roomCode)
    if (!room) return
    broadcastRoom(io, room)
    if (room.match) broadcastMatchTo(io, room)
  })

  on(socket, 'start_match', () => handleStartMatch(io, socket))

  on(socket, 'summary_continue', () => handleSummaryContinue(io, socket))
  on(socket, 'draft_pick', (item) => handleDraftPick(io, socket, item))
  on(socket, 'draft_done', () => handleDraftDone(io, socket))

  on(socket, 'move', (move) => handleMove(io, socket, move))
  on(socket, 'play_card', (play) => handlePlayCard(io, socket, play))
  on(socket, 'surrender', () => handleSurrender(io, socket))
  on(socket, 'offer_draw', () => handleOfferDraw(io, socket))
  on(socket, 'answer_draw', (answer) => handleAnswerDraw(io, socket, answer))
  on(socket, 'rematch', () => handleRematch(io, socket))
  on(socket, 'leave_room', () => leaveRoom(io, socket))

  socket.on('disconnect', () => {
    try { handleDisconnect(io, socket) } catch (e) { console.error('[disconnect] handler failed:', e) }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Mischess server listening on http://localhost:${PORT}`)
})

// Hosts stop the container with SIGTERM on every deploy — close the stats DB
// cleanly so the WAL is checkpointed into the main file.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { statsDb?.close() } catch {}
    process.exit(0)
  })
}
