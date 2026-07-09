import { createMatch, tryDraftBan, tryDraftBuy, tryPlacement, applyRoundResult } from './matchEngine.js'
import { tryMove, tryPlayCard } from './gameEngine.js'

// In-memory room registry. No persistence, no reconnection-by-identity —
// good enough for local/LAN play; swap for a real store before a public
// deploy with many concurrent rooms.
const rooms = new Map()

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I

function generateCode() {
  let code
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
  } while (rooms.has(code))
  return code
}

function publicPlayers(room) {
  const pub = (p) => p ? { connected: p.connected, name: p.name } : null
  return { white: pub(room.players.white), black: pub(room.players.black) }
}

function sanitizeName(name) {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 20) : ''
  return trimmed || null
}

export function createRoom(socket, wantedColor, name) {
  const color = wantedColor === 'black' ? 'black' : 'white'
  const other = color === 'white' ? 'black' : 'white'
  const code  = generateCode()
  const room = {
    code,
    players: {
      [color]: { socketId: socket.id, connected: true, name: sanitizeName(name) },
      [other]: null,
    },
    match: null,
    turnTimerHandle: null, // see syncTurnTimer — the active battle-clock AFK timeout, if any
  }
  rooms.set(code, room)
  socket.join(code)
  socket.data.roomCode = code
  socket.data.color = color
  return { code, color, players: publicPlayers(room) }
}

export function joinRoom(socket, code, name) {
  const room = rooms.get(code)
  if (!room) throw new Error('Комната не найдена')
  const openColor = !room.players.white ? 'white' : !room.players.black ? 'black' : null
  if (!openColor) throw new Error('Комната уже заполнена')
  room.players[openColor] = { socketId: socket.id, connected: true, name: sanitizeName(name) }
  socket.join(code)
  socket.data.roomCode = code
  socket.data.color = openColor
  return { color: openColor, players: publicPlayers(room) }
}

function getRoom(socket) {
  const code = socket.data.roomCode
  return code ? (rooms.get(code) ?? null) : null
}

export function getRoomByCode(code) {
  return rooms.get(code) ?? null
}

export function bothConnected(room) {
  return !!(room.players.white?.connected && room.players.black?.connected)
}

// smoke_screen hides the caster's own pieces from the opponent within its
// 3x3 zone. The zone itself (location, owner, turns left) stays visible to
// both sides — only the pieces inside are stripped from this viewer's copy
// of the board, and only pieces owned by the zone's owner (a viewer's own
// piece can never end up hidden from themselves).
function redactFog(gameState, viewerColor) {
  const zones = (gameState.fogZones ?? []).filter(z => z.owner !== viewerColor)
  if (zones.length === 0) return gameState.pieces
  const pieces = { ...gameState.pieces }
  zones.forEach(zone => {
    zone.cells.forEach(sq => {
      if (pieces[sq]?.color === zone.owner) delete pieces[sq]
    })
  })
  return pieces
}

// meteor's target square is secret — the caster sees exactly where/when it
// lands (so the client can blink that cell for them), but the opponent only
// ever learns THAT one is inbound and how many turns are left, never the
// square, so they can't simply dodge with certainty.
function redactMeteors(gameState, viewerColor) {
  return (gameState.meteors ?? []).map(m =>
    m.owner === viewerColor ? m : { owner: m.owner, turnsLeft: m.turnsLeft, hidden: true }
  )
}

// freeze mine's square is secret the same way — the owner sees exactly
// where they laid it, the opponent only learns THAT one exists (a
// location-less warning), never where, so stepping on it is a genuine risk
// rather than something to simply route around.
function redactMines(gameState, viewerColor) {
  return (gameState.mines ?? []).map(m =>
    m.owner === viewerColor ? m : { owner: m.owner, hidden: true }
  )
}

// Bans and purchases are both blind, simultaneous submissions (see
// draftEngine.js) — the opponent's bans must stay hidden until BOTH sides
// have submitted (that's the whole point of a blind ban), and the
// opponent's cart must stay hidden for the ENTIRE draft phase, all the way
// through their buy submission, so a live "here's what they bought" feed
// can't leak army composition before placement (mirrors why the
// placement map itself stays hidden). Once match.phase leaves 'draft'
// entirely, nothing here applies any more — draft.picks becomes plain,
// unredacted info the placement screen already relies on.
function redactDraft(draft, viewerColor) {
  if (!draft) return draft
  const other = viewerColor === 'white' ? 'black' : 'white'
  const banPhaseResolved = draft.phase !== 'ban'
  return {
    ...draft,
    bans: {
      ...draft.bans,
      [other]: banPhaseResolved ? draft.bans[other] : null,
    },
    picks: {
      ...draft.picks,
      [other]: null,
    },
  }
}

// Per-recipient view: never leak the opponent's hidden placement map, their
// smoke_screen-covered pieces, or their meteors' target squares. Also tells
// the recipient which color they currently are — this can change between
// rounds (see swapPlayerColors), so the client can't just remember it from
// create_room/join_room and must pick it up fresh from every update.
function viewFor(room, color) {
  const other = color === 'white' ? 'black' : 'white'
  const { match } = room
  if (!match) return { code: room.code, color, players: publicPlayers(room), match: null }

  const placement = match.placement && {
    [color]: match.placement[color],
    [other]: { ready: match.placement[other].ready, map: null },
  }
  const draft = match.phase === 'draft' ? redactDraft(match.draft, color) : match.draft
  const gameState = match.gameState && {
    ...match.gameState,
    pieces: redactFog(match.gameState, color),
    meteors: redactMeteors(match.gameState, color),
    mines: redactMines(match.gameState, color),
  }
  return {
    code: room.code,
    color,
    players: publicPlayers(room),
    match: { ...match, placement, draft, gameState },
  }
}

// Sides swap every round (see matchEngine.js's applyRoundResult, which swaps
// score keys in lockstep) — this keeps each socket's own color identity in
// sync with what the match now expects from it.
function swapPlayerColors(io, room) {
  const oldWhite = room.players.white
  const oldBlack = room.players.black
  room.players.white = oldBlack
  room.players.black = oldWhite
  const whiteSocket = oldWhite?.socketId && io.sockets.sockets.get(oldWhite.socketId)
  const blackSocket = oldBlack?.socketId && io.sockets.sockets.get(oldBlack.socketId)
  if (whiteSocket) whiteSocket.data.color = 'black'
  if (blackSocket) blackSocket.data.color = 'white'
}

// lastAction can name a card id (card) at a specific square — if that
// square sits inside the actor's OWN active fog zone, that's exactly the
// information gameState.pieces already hides from this viewer, so
// broadcasting it unredacted would leak it straight through the action
// toast instead. Move/capture/bounce actions carry no piece identity to
// begin with (see gameEngine.js's tryMove), so there's nothing to redact
// there — only card play needs this (there's no in-battle shop any more).
function redactLastAction(gameState, lastAction, viewerColor) {
  if (!lastAction || lastAction.color === viewerColor) return lastAction

  // meteor's and freeze's (mine) targets are secret unconditionally, not
  // just inside fog — the current UI toast never renders a target square
  // anyway (see OnlineApp.jsx), but the wire payload shouldn't carry it
  // regardless of what today's UI happens to display.
  if (lastAction.type === 'card' && (lastAction.cardId === 'meteor' || lastAction.cardId === 'freeze')) {
    return { type: 'card', color: lastAction.color, hidden: true }
  }

  if (lastAction.type !== 'card') return lastAction
  const hidden = (gameState?.fogZones ?? []).some(z => z.owner === lastAction.color && z.cells.includes(lastAction.target))
  if (!hidden) return lastAction
  return { type: 'card', color: lastAction.color, hidden: true }
}

// meteorStrikes/mineStrike (see tickMeteors/triggerMine) report detonations
// that just happened — unlike the target square while still armed/in
// flight, the impact itself is never secret, so this goes out unredacted
// and identically to both viewers (it's what drives the shared reveal
// animation).
function broadcastMatch(io, room, lastAction = null, meteorStrikes = [], mineStrike = null) {
  syncTurnTimer(io, room)
  ;['white', 'black'].forEach(color => {
    const player = room.players[color]
    if (!player?.socketId) return
    const redacted = redactLastAction(room.match?.gameState, lastAction, color)
    io.to(player.socketId).emit('match_update', { ...viewFor(room, color), lastAction: redacted, meteorStrikes, mineStrike })
  })
}

// A player's clock (see chess.js's timers) only actually gets charged when
// THEY move — someone who just stops moving entirely (AFK, closed the tab)
// would otherwise never trigger that check at all, since nothing server-side
// is driving the game forward on its own. This is the enforcement for that:
// a real setTimeout, rescheduled after every match mutation (called from
// broadcastMatch, so it's always in sync with whatever just happened),
// that fires a timeout loss for whoever's turn it is if they never act.
function syncTurnTimer(io, room) {
  clearTurnTimer(room)
  const { match } = room
  const gs = match?.gameState
  if (match?.phase !== 'battle' || !gs?.timers) return
  const remainingMs = Math.max(0, gs.timers[gs.turn] * 1000 - (Date.now() - gs.turnStartedAt))
  room.turnTimerHandle = setTimeout(() => handleTurnTimeout(io, room), remainingMs)
}

function clearTurnTimer(room) {
  if (room.turnTimerHandle) {
    clearTimeout(room.turnTimerHandle)
    room.turnTimerHandle = null
  }
}

function handleTurnTimeout(io, room) {
  const { match } = room
  // Re-check phase/turn — the timer firing doesn't guarantee the state it
  // was scheduled for is still current (a move could have landed in the
  // same tick the timeout was already queued).
  if (match?.phase !== 'battle' || !match.gameState?.timers) return
  const color = match.gameState.turn
  const oppColor = color === 'white' ? 'black' : 'white'
  const newMatch = applyRoundResult(match, { type: 'timeout', winner: oppColor, loser: color })
  room.match = newMatch
  if (newMatch.phase !== 'match_over') swapPlayerColors(io, room)
  broadcastMatch(io, room, { type: 'timeout', color })
}

export function startMatch(io, room) {
  room.match = createMatch()
  broadcastMatch(io, room)
}

export function handleDraftBan(io, socket, targets) {
  const room = getRoom(socket)
  if (!room?.match) return
  const res = tryDraftBan(room.match, socket.data.color, targets ?? [])
  if (res.error) { socket.emit('game_error', { message: res.error }); return }
  room.match = res.match
  broadcastMatch(io, room)
}

export function handleDraftBuy(io, socket, items) {
  const room = getRoom(socket)
  if (!room?.match) return
  const res = tryDraftBuy(room.match, socket.data.color, items ?? [])
  if (res.error) { socket.emit('game_error', { message: res.error }); return }
  room.match = res.match
  broadcastMatch(io, room)
}

export function handlePlacement(io, socket, placementMap) {
  const room = getRoom(socket)
  if (!room?.match) return
  const res = tryPlacement(room.match, socket.data.color, placementMap ?? {})
  if (res.error) { socket.emit('game_error', { message: res.error }); return }
  room.match = res.match
  broadcastMatch(io, room)
}

function applyBattleResult(io, room, res) {
  let match = { ...room.match, gameState: res.gameState }
  if (res.result) {
    match = applyRoundResult(match, res.result)
    if (match.phase !== 'match_over') swapPlayerColors(io, room)
  }
  room.match = match
}

export function handleMove(io, socket, { from, to, promotion } = {}) {
  const room = getRoom(socket)
  if (!room?.match?.gameState || room.match.phase !== 'battle') return
  const res = tryMove(room.match.gameState, socket.data.color, from, to, promotion)
  if (res.error) { socket.emit('game_error', { message: res.error }); return }
  applyBattleResult(io, room, res)
  broadcastMatch(io, room, res.lastAction, res.meteorStrikes, res.mineStrike)
}

export function handlePlayCard(io, socket, { cardId, target } = {}) {
  const room = getRoom(socket)
  if (!room?.match?.gameState || room.match.phase !== 'battle') return
  const res = tryPlayCard(room.match.gameState, socket.data.color, cardId, target)
  if (res.error) { socket.emit('game_error', { message: res.error }); return }
  applyBattleResult(io, room, res)
  broadcastMatch(io, room, res.lastAction)
}

// Surrendering doesn't touch the board/hand/coins at all — it just ends the
// round in the opponent's favor via the normal applyRoundResult path (see
// matchEngine.js), which starts the next round completely fresh either way.
// Restricted to your own turn — same as every other battle action — so it
// can't be used to interrupt the opponent mid-decision (e.g. right as they
// commit to a card target or a risky move) on a turn that isn't yours.
export function handleSurrender(io, socket) {
  const room = getRoom(socket)
  if (!room?.match?.gameState || room.match.phase !== 'battle') return
  const color = socket.data.color
  if (room.match.gameState.turn !== color) {
    socket.emit('game_error', { message: 'Можно сдаться только в свой ход' })
    return
  }
  const oppColor = color === 'white' ? 'black' : 'white'
  const newMatch = applyRoundResult(room.match, { type: 'surrender', winner: oppColor, loser: color })
  room.match = newMatch
  if (newMatch.phase !== 'match_over') swapPlayerColors(io, room)
  broadcastMatch(io, room, { type: 'surrender', color })
}

export function leaveRoom(io, socket) {
  const room = getRoom(socket)
  if (!room) return
  const color = socket.data.color
  room.players[color] = null
  socket.leave(room.code)
  socket.data.roomCode = null

  if (!room.players.white && !room.players.black) {
    clearTurnTimer(room)
    rooms.delete(room.code)
  } else {
    io.to(room.code).emit('opponent_left')
    io.to(room.code).emit('room_update', { code: room.code, players: publicPlayers(room) })
  }
}

export function handleDisconnect(io, socket) {
  const room = getRoom(socket)
  if (!room) return
  const color = socket.data.color
  if (room.players[color]) room.players[color].connected = false
  io.to(room.code).emit('opponent_left')
  io.to(room.code).emit('room_update', { code: room.code, players: publicPlayers(room) })
}
