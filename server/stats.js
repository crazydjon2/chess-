// Balance telemetry: one row per finished (or abandoned) round, written to a
// local SQLite file. Read back by tools/stats (npm run stats).
//
// Uses Node's built-in node:sqlite (no native deps). Disabled with STATS=off;
// file location via STATS_DB (default server/data/stats.db).
import { createHash } from 'crypto'
import { readFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GAME_DIR = path.join(__dirname, '../client/src/game')

// Every file whose contents change how a round plays out. Their hash tags
// each row, so stats from before and after a balance change never mix.
const BALANCE_FILES = [
  'cards.js', 'cardEffects.js', 'chess.js', 'draftEngine.js', 'draftPools.js',
  'economy.js', 'boardPatterns.js', 'placementEngine.js', 'initialState.js',
]

export function computeBalanceVersion(dir = GAME_DIR) {
  const h = createHash('sha1')
  for (const f of BALANCE_FILES) {
    try { h.update(readFileSync(path.join(dir, f))) } catch { h.update(`missing:${f}`) }
  }
  return h.digest('hex').slice(0, 8)
}

export const BALANCE_VERSION = computeBalanceVersion()
export const DEFAULT_DB = path.join(__dirname, 'data/stats.db')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rounds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    TEXT    NOT NULL,
  round       INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  balance_ver TEXT    NOT NULL,
  mode        TEXT    NOT NULL,   -- 'pvp' | 'bot'
  result_type TEXT    NOT NULL,   -- king_captured | timeout | surrender | draw | ... | abandoned
  winner      TEXT,               -- 'white' | 'black' | NULL
  data        TEXT    NOT NULL    -- full JSON record, see buildRoundRecord
);
CREATE INDEX IF NOT EXISTS rounds_ver   ON rounds(balance_ver);
CREATE INDEX IF NOT EXISTS rounds_ended ON rounds(ended_at);
`

export async function openStatsDb(file = DEFAULT_DB) {
  // Imported lazily so environments without node:sqlite (Node < 22.13) only
  // lose stats, not the whole server.
  const { DatabaseSync } = await import('node:sqlite')
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec(SCHEMA)
  return db
}

// Players have no accounts yet — the seat token is the only stable identity
// within a room (it follows the person across the per-round colour swaps).
// Stored hashed: the raw token is a rejoin secret.
function playerId(seat) {
  if (!seat) return null
  if (seat.bot) return 'bot'
  return seat.token ? createHash('sha1').update(seat.token).digest('hex').slice(0, 10) : null
}

function countBy(list) {
  const out = {}
  for (const x of list) out[x] = (out[x] ?? 0) + 1
  return out
}

// Battle log without the per-entry board snapshots (they're only for the
// in-game scrubber and would make every row tens of KB).
function stripLog(actionLog = []) {
  return actionLog
    .filter(e => e.kind !== 'start')
    .map(({ snapshot, ...rest }) => rest)
}

// Pure: everything the report needs about one round, from the room as it
// stood the moment the round ended (before colours swap for the next one).
export function buildRoundRecord(room, match, result, now = Date.now()) {
  const gs = match.gameState
  const draft = match.draft
  const log = stripLog(gs?.actionLog)
  const side = (color) => {
    const seat = room.players[color]
    const piecesLeft = gs
      ? countBy(Object.values(gs.pieces).filter(p => p.color === color).map(p => p.type))
      : null
    return {
      player: playerId(seat),
      bot: !!seat?.bot,
      botLevel: seat?.botLevel ?? null,
      left: !seat || !seat.connected,
      pieces: draft?.picks?.[color]?.pieces ?? [],
      cards: draft?.picks?.[color]?.cards ?? [],
      budgetLeft: draft?.budgets?.[color] ?? null,
      draftTimedOut: (draft?.log ?? []).some(e => e.color === color && e.kind === 'done' && e.timeout),
      cardsPlayed: log.filter(e => e.kind === 'card' && e.color === color).map(e => e.cardId),
      piecesLeft,
      clockLeft: gs?.timers?.[color] ?? null,
      score: match.scores?.[color] ?? 0,
    }
  }
  return {
    v: 1,
    matchId: room.matchId ?? null,
    round: match.round,
    balanceVer: BALANCE_VERSION,
    endedAt: now,
    durationMs: match.battleStartedAt ? now - match.battleStartedAt : null,
    mode: room.bot ? 'bot' : 'pvp',
    board: match.boardPattern?.id ?? null,
    firstColor: draft?.firstColor ?? null,
    result: { type: result.type, reason: result.reason ?? null, winner: result.winner ?? null },
    plies: gs?.moveHistory?.length ?? 0,
    sides: { white: side('white'), black: side('black') },
    draftLog: draft?.log ?? [],
    battleLog: log,
  }
}

export function createRoundRecorder(db) {
  const insert = db.prepare(`INSERT INTO rounds (match_id, round, ended_at, balance_ver, mode, result_type, winner, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  return (room, match, result) => {
    try {
      const r = buildRoundRecord(room, match, result)
      insert.run(r.matchId ?? '', r.round, r.endedAt, r.balanceVer, r.mode, r.result.type, r.result.winner, JSON.stringify(r))
    } catch (e) {
      // Telemetry must never take a game down.
      console.error('[stats] failed to record round:', e)
    }
  }
}
