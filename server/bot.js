// AI opponent. The bot takes the second seat of a private room and plays
// through the very same handlers a human socket triggers (draft picks,
// placement, moves, cards, draw answers) — so a game against it exercises
// the real match flow end to end: timers, round summaries, reconnects.
//
// Its brain is the balance lab's AI (tools/balance/lib/ai): the same
// search, card playbook, human-style drafting and placement, seeing only
// what a player would (the server's redacted view + a person's memory).
import * as rooms from './rooms.js'
import { decide, searchMoves, STRENGTHS } from '../tools/balance/lib/ai/search.js'
import { resolveDraftPolicy } from '../tools/balance/lib/ai/draftAI.js'
import { placeAgainst } from '../tools/balance/lib/ai/placementAI.js'
import { newMemory, perceive, relook } from '../tools/balance/lib/ai/perception.js'
import { evaluate } from '../tools/balance/lib/ai/eval.js'

export const BOT_LEVELS = {
  weak: { label: 'Слабый', strength: 'weak', drafts: ['randomPieces'], smartPlacement: false, think: [700, 1300] },
  normal: { label: 'Средний', strength: 'normal', drafts: ['human:defensive', 'human:control', 'human:aggro'], smartPlacement: true, think: [500, 1000] },
  strong: { label: 'Сильный', strength: 'strong', drafts: ['human:aggro', 'human:control', 'human:defensive'], smartPlacement: true, think: [400, 800] },
}

const opp = c => (c === 'white' ? 'black' : 'white')

function seatColor(room) {
  return ['white', 'black'].find(c => room.players[c]?.socketId === room.bot.id) ?? null
}

// A stand-in socket for the bot's seat. Handlers report rejections via
// emit('game_error') — remembered so a refused move can fall back to the
// next candidate.
function botSocket(room) {
  const s = {
    id: room.bot.id,
    data: { roomCode: room.code, color: seatColor(room) },
    lastError: null,
    emit(ev, payload) { if (ev === 'game_error') s.lastError = payload?.message ?? 'error' },
    join() {}, leave() {},
  }
  return s
}

export function createBotRoom(io, socket, { level, color, name } = {}) {
  const cfg = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  const res = rooms.createRoom(socket, color, name, { visibility: 'private' })
  const room = rooms.getRoomByCode(res.code)
  const botSeat = opp(res.color)
  room.bot = {
    id: `bot-${room.code}`,
    level: BOT_LEVELS[level] ? level : 'normal',
    cfg,
    mem: newMemory(),
    draftState: {},
    draftPolicy: null,
    round: null,
    timer: null,
    busy: false,
    rng: Math.random,
  }
  room.players[botSeat] = { socketId: room.bot.id, connected: true, name: `ИИ · ${cfg.label}`, token: null, bot: true }
  rooms.startMatch(io, room)
  return { ...res, players: { ...res.players, [botSeat]: { connected: true, name: room.players[botSeat].name } } }
}

// Called after every broadcast of a bot room (see rooms.js's setBotHook):
// if there's something for the bot to do, do it after a short "thinking"
// pause, so the human sees each action land separately.
export function onRoomUpdate(io, room) {
  const bot = room.bot
  if (!bot || bot.busy) return
  if (bot.timer) clearTimeout(bot.timer)
  const [lo, hi] = bot.cfg.think
  bot.timer = setTimeout(() => {
    bot.timer = null
    bot.busy = true
    let acted = false
    try { acted = act(io, room) } catch (e) { console.error('[bot]', e) } finally { bot.busy = false }
    // its own broadcasts were ignored while busy — if it did something, look
    // again (it may be its turn once more, e.g. drafting after the human is done)
    if (acted) onRoomUpdate(io, room)
  }, lo + Math.random() * (hi - lo))
}

function act(io, room) {
  const m = room.match
  const bot = room.bot
  const color = seatColor(room)
  if (!m || !color || !rooms.getRoomByCode(room.code)) return false
  const sock = botSocket(room)

  if (m.phase === 'draft') {
    if (m.summaryReady && !m.summaryReady[color]) { rooms.handleSummaryContinue(io, sock); return true }
    const ds = m.draft
    if (ds.turn !== color || ds.done[color] || ds.turnStartedAt == null) return false
    if (bot.round !== m.round) {
      // a fresh round: new draft plan, forget the old board
      bot.round = m.round
      bot.draftState = {}
      bot.mem = newMemory()
      bot.draftPolicy = resolveDraftPolicy(bot.cfg.drafts[Math.floor(Math.random() * bot.cfg.drafts.length)])
    }
    const item = bot.draftPolicy(ds, color, bot.draftState, bot.rng, { pattern: m.boardPattern })
    if (item) rooms.handleDraftPick(io, sock, item)
    else rooms.handleDraftDone(io, sock)
    if (sock.lastError) rooms.handleDraftDone(io, sock)
    return true
  }

  if (m.phase === 'placement') {
    if (m.placement[color].ready) return false
    const map = placeAgainst(m.boardPattern, color, m.draft.picks[color].pieces, m.placement[opp(color)].map ?? {}, bot.rng, { smart: bot.cfg.smartPlacement })
    rooms.handlePlacement(io, sock, map)
    return true
  }

  if (m.phase !== 'battle') return false
  const gs = m.gameState
  const cfg = STRENGTHS[bot.cfg.strength]

  // The human offered a draw: take it only when clearly worse off.
  if (gs.drawOffer && gs.drawOffer !== color) {
    const { view } = perceive(gs, color, bot.mem)
    rooms.handleAnswerDraw(io, sock, { accept: evaluate(view, color, bot.mem) < -2.5 })
    return true
  }
  if (gs.turn !== color) return false

  const { view, ghosts } = perceive(gs, color, bot.mem)
  const d = decide(view, color, bot.mem, cfg, bot.rng)
  let moves = d.moves
  if (d.card) {
    rooms.handlePlayCard(io, sock, { cardId: d.card.cardId, target: d.card.target })
    const now = room.match
    if (!now || now.phase !== 'battle') return true // the card ended the round
    moves = searchMoves(relook(now.gameState, color, ghosts), color, bot.mem, cfg, bot.rng).moves
  }
  for (const mv of moves ?? []) {
    sock.lastError = null
    rooms.handleMove(io, sock, { from: mv.from, to: mv.to, promotion: 'queen' })
    if (!sock.lastError) return true
  }
  return true
}

export function disposeBot(room) {
  if (room.bot?.timer) clearTimeout(room.bot.timer)
}
