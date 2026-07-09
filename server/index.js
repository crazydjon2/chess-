import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  createRoom, joinRoom, getRoomByCode, bothConnected, startMatch,
  handleDraftBan, handleDraftBuy, handlePlacement,
  handleMove, handlePlayCard, handleSurrender,
  leaveRoom, handleDisconnect,
} from './rooms.js'

const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.join(__dirname, '../client/dist')

const app = express()
app.use(cors())

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

io.on('connection', (socket) => {
  socket.on('create_room', ({ color, name } = {}, cb) => {
    try {
      cb(createRoom(socket, color, name))
    } catch (e) {
      cb({ error: e.message })
    }
  })

  socket.on('join_room', ({ code, name } = {}, cb) => {
    let res
    try {
      res = joinRoom(socket, code, name)
    } catch (e) {
      cb({ error: e.message })
      return
    }
    cb(res)

    // Both seats filled — the draft begins automatically, no "ready up" step.
    const room = getRoomByCode(socket.data.roomCode)
    if (room && bothConnected(room)) startMatch(io, room)
  })

  socket.on('draft_ban', (payload) => handleDraftBan(io, socket, payload))
  socket.on('draft_buy', (payload) => handleDraftBuy(io, socket, payload))
  socket.on('submit_placement', ({ map } = {}) => handlePlacement(io, socket, map))

  socket.on('move', (payload) => handleMove(io, socket, payload))
  socket.on('play_card', (payload) => handlePlayCard(io, socket, payload))
  socket.on('surrender', () => handleSurrender(io, socket))
  socket.on('leave_room', () => leaveRoom(io, socket))

  socket.on('disconnect', () => handleDisconnect(io, socket))
})

httpServer.listen(PORT, () => {
  console.log(`Chess+ server listening on http://localhost:${PORT}`)
})
