// Orchestrates a Bo3 draft match: draft -> open placement -> battle ->
// round result -> next round (or match over). Reuses the exact same pure
// client/src/game modules the client renders with, same as gameEngine.js.
import { createDraftState, submitPick, submitDone, timeoutDraft, isDraftComplete } from '../client/src/game/draftEngine.js'
import { pickBoardPattern } from '../client/src/game/boardPatterns.js'
import { validatePlacement, autoCompletePlacement, buildPlacementPieces } from '../client/src/game/placementEngine.js'
import { createDraftRoundState } from '../client/src/game/initialState.js'
import { TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND, PLACEMENT_TIME_BY_ROUND } from '../client/src/game/draftPools.js'

const ROUNDS_TO_WIN  = 2
const MAX_POOL_ROUND = 3   // round 4+ (draw-extended matches) reuse round 3's tier
const HARD_ROUND_CAP = 5   // safety valve so an all-draws match still terminates
// Longest the server waits for both players to leave the round summary
// before starting the next draft's clocks anyway (see summaryContinue).
export const SUMMARY_MAX_SECONDS = 30

// Every round is a clean slate: fresh draft, fresh army, fresh hand.
// Nothing survives a round ending — not the pieces still standing, not
// unused cards, nothing (see applyRoundResult, which never reads anything
// off the finished gameState to seed the next round). Unspent draft budget
// doesn't carry into the battle either — it's simply lost.
export function startRound(scores, roundNumber, firstColor) {
  const poolRound = Math.min(roundNumber, MAX_POOL_ROUND)
  return {
    scores,
    round: roundNumber,
    boardPattern: pickBoardPattern(poolRound),
    // Every round gets the same flat budget — coins never carry over
    // between rounds (see draftEngine.js's createDraftState).
    draft: createDraftState(poolRound, firstColor),
    placement: {
      white: { ready: false, map: {} },
      black: { ready: false, map: {} },
    },
    phase: 'draft',
    gameState: null,
    lastRoundResult: null,
  }
}

export function createMatch() {
  return startRound({ white: 0, black: 0 }, 1, 'white')
}

// Draft done -> placement starts, with its shared countdown (see
// draftPools.js's PLACEMENT_TIME_BY_ROUND and rooms.js, which fires
// forcePlacement once `placementDeadline` passes).
function finalizeDraftStep(match, draft, now) {
  if (!isDraftComplete(draft)) return { match: { ...match, draft } }
  const poolRound = Math.min(match.round, MAX_POOL_ROUND)
  const placementDeadline = now + PLACEMENT_TIME_BY_ROUND[poolRound] * 1000
  return { match: { ...match, draft, phase: 'placement', placementDeadline } }
}

// Between rounds the next draft exists but its clocks are paused until
// both players have pressed "continue" on the round summary (or the
// SUMMARY_MAX_SECONDS cap runs out) — otherwise the first picker's draft
// time would drain while they're still looking at how the last round ended.
function summaryPending(match) {
  return !!match.summaryReady && !(match.summaryReady.white && match.summaryReady.black)
}

export function trySummaryContinue(match, color, now = Date.now()) {
  if (match.phase !== 'draft' || !summaryPending(match)) return { match }
  const summaryReady = { ...match.summaryReady, [color]: true }
  return { match: startDraftIfReady({ ...match, summaryReady }, now) }
}

// The summary cap ran out — start the draft regardless of who's still on it.
export function summaryTimeout(match, now = Date.now()) {
  if (match.phase !== 'draft' || !summaryPending(match)) return match
  return startDraftIfReady({ ...match, summaryReady: { white: true, black: true } }, now)
}

function startDraftIfReady(match, now) {
  if (summaryPending(match)) return match
  return { ...match, summaryDeadline: null, draft: { ...match.draft, turnStartedAt: now } }
}

export function tryDraftPick(match, color, item, now = Date.now()) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  if (summaryPending(match)) return { error: 'Ждём соперника' }
  const res = submitPick(match.draft, color, item, now)
  if (res.error) return { error: res.error }
  return finalizeDraftStep(match, res.draftState, now)
}

// The player on turn ran out of draft time (see rooms.js's draft timer).
export function draftTimeout(match, now = Date.now()) {
  if (match.phase !== 'draft' || summaryPending(match)) return match
  return finalizeDraftStep(match, timeoutDraft(match.draft, now), now).match
}

export function tryDraftDone(match, color, now = Date.now()) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  if (summaryPending(match)) return { error: 'Ждём соперника' }
  const res = submitDone(match.draft, color, now)
  if (res.error) return { error: res.error }
  return finalizeDraftStep(match, res.draftState, now)
}

// Placement is open and simultaneous: every rearrangement is pushed here
// as it happens (partial — not every piece has to be down yet) and shown
// live to the opponent (see rooms.js's viewFor). Locked once that side
// hits "ready" (see tryPlacement).
export function tryUpdatePlacement(match, color, placementMap) {
  if (match.phase !== 'placement') return { error: 'Сейчас не фаза расстановки' }
  if (match.placement[color].ready) return { error: 'Вы уже готовы' }

  const draftedTypes = match.draft.picks[color].pieces
  const check = validatePlacement(match.boardPattern, color, placementMap, draftedTypes, { partial: true })
  if (check.error) return { error: check.error }

  const placement = { ...match.placement, [color]: { ready: false, map: placementMap } }
  return { match: { ...match, placement } }
}

export function tryPlacement(match, color, placementMap) {
  if (match.phase !== 'placement') return { error: 'Сейчас не фаза расстановки' }
  if (match.placement[color].ready) return { error: 'Вы уже готовы' }

  const draftedTypes = match.draft.picks[color].pieces
  const check = validatePlacement(match.boardPattern, color, placementMap, draftedTypes)
  if (check.error) return { error: check.error }

  const placement = { ...match.placement, [color]: { ready: true, map: placementMap } }
  if (!placement.white.ready || !placement.black.ready) {
    return { match: { ...match, placement } }
  }
  return { match: startBattle(match, placement) }
}

// The placement timer ran out: whatever each side has on the board locks
// in as-is, and any pieces still unplaced drop onto random free home
// squares — then the battle starts.
export function forcePlacement(match) {
  const placement = {}
  ;['white', 'black'].forEach(color => {
    const { map } = match.placement[color]
    const drafted = match.draft.picks[color].pieces
    placement[color] = { ready: true, map: autoCompletePlacement(match.boardPattern, color, map ?? {}, drafted) }
  })
  return startBattle(match, placement)
}

function startBattle(match, placement) {
  const whitePieces = buildPlacementPieces('white', placement.white.map)
  const blackPieces = buildPlacementPieces('black', placement.black.map)
  const whiteCardIds = match.draft.picks.white.cards
  const blackCardIds = match.draft.picks.black.cards
  const poolRound   = Math.min(match.round, MAX_POOL_ROUND)
  const timeLimit   = TIME_LIMIT_BY_ROUND[poolRound]
  const timeIncrement = TIME_INCREMENT_BY_ROUND[poolRound]

  const gameState = createDraftRoundState(
    match.boardPattern, whitePieces, blackPieces,
    whiteCardIds, blackCardIds, timeLimit,
    undefined, timeIncrement
  )

  return { ...match, placement, phase: 'battle', placementDeadline: null, gameState }
}

// Either player may offer a draw at any time during the battle — at most
// once per move of the game (drawOfferedAt), so it can't be spammed. It
// stands until the opponent answers (tryAnswerDraw) or moves instead (an
// implicit decline — see gameEngine.js's tryMove).
export function tryOfferDraw(match, color) {
  const gs = match.gameState
  if (match.phase !== 'battle' || !gs) return { error: 'Сейчас не бой' }
  if (gs.drawOffer) return { error: 'Ничья уже предложена' }
  const moveCount = gs.moveHistory?.length ?? 0
  if ((gs.drawOfferedAt?.[color] ?? -1) === moveCount) return { error: 'Ничью можно предлагать раз за ход' }
  const gameState = {
    ...gs,
    drawOffer: color,
    drawOfferedAt: { ...(gs.drawOfferedAt ?? { white: -1, black: -1 }), [color]: moveCount },
  }
  return { match: { ...match, gameState } }
}

// The offer's recipient answers: accepting ends the round as a draw (no
// score change, next round starts — see applyRoundResult); declining just
// withdraws the offer.
export function tryAnswerDraw(match, color, accept) {
  const gs = match.gameState
  if (match.phase !== 'battle' || !gs) return { error: 'Сейчас не бой' }
  if (!gs.drawOffer || gs.drawOffer === color) return { error: 'Нет предложения ничьей' }
  if (accept) return { match: applyRoundResult(match, { type: 'draw', reason: 'agreement' }), ended: true }
  return { match: { ...match, gameState: { ...gs, drawOffer: null } }, ended: false }
}

// Called after a move/card/buy inside the battle phase produces a
// getGameResult() — decides the round winner, updates the score, and either
// starts the next round's draft (clean slate — see startRound) or ends the
// match. Nothing from the finished round's board carries forward.
export function applyRoundResult(match, result, now = Date.now()) {
  const scores = { ...match.scores }
  const decisive = ['checkmate', 'king_captured', 'elimination', 'timeout', 'no_moves', 'surrender'].includes(result.type)
  if (decisive) scores[result.winner] += 1
  // stalemate / draw: no score change, round is replayed via the next round

  const matchDecided = scores.white >= ROUNDS_TO_WIN || scores.black >= ROUNDS_TO_WIN
  if (matchDecided || match.round >= HARD_ROUND_CAP) {
    return { ...match, scores, phase: 'match_over', gameState: match.gameState, lastRoundResult: result }
  }

  // Sides swap every round (see rooms.js, which swaps the matching sockets
  // in lockstep) — so the running score must swap color keys too, otherwise
  // a player's wins would silently reattach to whichever color they happen
  // to hold that round instead of following the actual person.
  const swappedScores  = { white: scores.black, black: scores.white }
  const nextRoundNum   = match.round + 1
  // Keep the SAME color label picking first every round (not alternated by
  // round parity) — because the color-swap above already reassigns "white"
  // to the other physical player each round, alternating the label here too
  // would cancel that out and leave the same person drafting first forever.
  const nextFirstColor = match.draft.firstColor
  const next = startRound(swappedScores, nextRoundNum, nextFirstColor)
  return {
    ...next,
    // Draft clocks stay paused while both players look at the summary —
    // see trySummaryContinue / summaryTimeout.
    draft: { ...next.draft, turnStartedAt: null },
    summaryReady: { white: false, black: false },
    summaryDeadline: now + SUMMARY_MAX_SECONDS * 1000,
    lastRoundResult: result,
    previousRound: match.round,
    previousBoardPattern: match.boardPattern,
    // The finished round's own gameState (board, pieces, everything) is
    // otherwise gone the instant startRound() resets it to null for the new
    // round — keep one frozen snapshot around so the round summary screen
    // can actually show players the position the round ended on, not just
    // a text description of the result.
    previousGameState: match.gameState,
  }
}
