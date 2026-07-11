// Orchestrates a Bo3 draft match: draft -> hidden placement -> battle ->
// round result -> next round (or match over). Reuses the exact same pure
// client/src/game modules the client renders with, same as gameEngine.js.
import { createDraftState, submitPick, submitDone, isDraftComplete } from '../client/src/game/draftEngine.js'
import { pickBoardPattern } from '../client/src/game/boardPatterns.js'
import { validatePlacement, buildPlacementPieces } from '../client/src/game/placementEngine.js'
import { createDraftRoundState } from '../client/src/game/initialState.js'
import { TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND, ANALYSIS_TIME_SECONDS } from '../client/src/game/draftPools.js'

const ROUNDS_TO_WIN  = 2
const MAX_POOL_ROUND = 3   // round 4+ (draw-extended matches) reuse round 3's tier
const HARD_ROUND_CAP = 5   // safety valve so an all-draws match still terminates

function emptyStartingCoins() {
  return { white: 0, black: 0 }
}

// Every round is a clean slate: fresh draft, fresh army, fresh hand.
// Nothing survives a round ending — not the pieces still standing, not
// unused cards, nothing (see applyRoundResult, which never reads anything
// off the finished gameState to seed the next round). The one exception is
// `startingCoins`, and even that doesn't cross a round boundary — it's set
// fresh by tryDraftBuy from THIS round's own leftover draft budget and
// spent by tryPlacement the same round, purely a same-round handoff.
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
      white: { ready: false, map: null },
      black: { ready: false, map: null },
    },
    startingCoins: emptyStartingCoins(),
    phase: 'draft',
    gameState: null,
    lastRoundResult: null,
  }
}

export function createMatch() {
  return startRound({ white: 0, black: 0 }, 1, 'white')
}

// Whatever's left of this round's budget becomes this round's starting
// battle coins (see tryPlacement) — a same-round handoff only; it's never
// read again once the round ends (see startRound, which always resets
// startingCoins to 0 for the next round).
function finalizeDraftStep(match, draft) {
  if (isDraftComplete(draft)) {
    const startingCoins = { white: draft.budgets.white, black: draft.budgets.black }
    return { match: { ...match, draft, startingCoins, phase: 'placement' } }
  }
  return { match: { ...match, draft } }
}

export function tryDraftPick(match, color, item) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  const res = submitPick(match.draft, color, item)
  if (res.error) return { error: res.error }
  return finalizeDraftStep(match, res.draftState)
}

export function tryDraftDone(match, color) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  const res = submitDone(match.draft, color)
  if (res.error) return { error: res.error }
  return finalizeDraftStep(match, res.draftState)
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

  const whitePieces = buildPlacementPieces('white', placement.white.map)
  const blackPieces = buildPlacementPieces('black', placement.black.map)
  const whiteCardIds = match.draft.picks.white.cards
  const blackCardIds = match.draft.picks.black.cards
  const poolRound   = Math.min(match.round, MAX_POOL_ROUND)
  const timeLimit   = TIME_LIMIT_BY_ROUND[poolRound]
  const timeIncrement = TIME_INCREMENT_BY_ROUND[poolRound]

  const gameState = createDraftRoundState(
    match.boardPattern, whitePieces, blackPieces,
    whiteCardIds, blackCardIds, match.startingCoins, timeLimit,
    undefined, timeIncrement, ANALYSIS_TIME_SECONDS
  )

  return { match: { ...match, placement, phase: 'battle', gameState } }
}

// Called after a move/card/buy inside the battle phase produces a
// getGameResult() — decides the round winner, updates the score, and either
// starts the next round's draft (clean slate — see startRound) or ends the
// match. Nothing from the finished round's board carries forward.
export function applyRoundResult(match, result) {
  const scores = { ...match.scores }
  const decisive = ['checkmate', 'elimination', 'timeout', 'no_moves', 'surrender'].includes(result.type)
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
