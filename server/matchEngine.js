// Orchestrates a Bo3 draft match: draft -> hidden placement -> battle ->
// round result -> next round (or match over). Reuses the exact same pure
// client/src/game modules the client renders with, same as gameEngine.js.
import { createDraftState, submitBans, submitPurchases, isDraftComplete } from '../client/src/game/draftEngine.js'
import { pickBoardPattern } from '../client/src/game/boardPatterns.js'
import { validatePlacement, buildPlacementPieces } from '../client/src/game/placementEngine.js'
import { createDraftRoundState } from '../client/src/game/initialState.js'
import { TIME_LIMIT_BY_ROUND } from '../client/src/game/draftPools.js'

const ROUNDS_TO_WIN  = 2
const MAX_POOL_ROUND = 3   // round 4+ (draw-extended matches) reuse round 3's tier
const HARD_ROUND_CAP = 5   // safety valve so an all-draws match still terminates

function emptyCarryOver() {
  return {
    white: { pieces: [], cards: [], coins: 0 },
    black: { pieces: [], cards: [], coins: 0 },
  }
}

export function startRound(scores, roundNumber, firstColor, carryOver) {
  const poolRound = Math.min(roundNumber, MAX_POOL_ROUND)
  const resolvedCarryOver = carryOver ?? emptyCarryOver()
  return {
    scores,
    round: roundNumber,
    boardPattern: pickBoardPattern(poolRound),
    // Every round gets the same flat budget — coins never carry over
    // between rounds (see draftEngine.js's createDraftState / buildCarryOver
    // below), only the surviving army does.
    draft: createDraftState(poolRound, firstColor),
    placement: {
      white: { ready: false, map: null },
      black: { ready: false, map: null },
    },
    carryOver: resolvedCarryOver,
    phase: 'draft',
    gameState: null,
    lastRoundResult: null,
  }
}

export function createMatch() {
  return startRound({ white: 0, black: 0 }, 1, 'white', null)
}

export function tryDraftBan(match, color, targets) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  const res = submitBans(match.draft, color, targets)
  if (res.error) return { error: res.error }
  return { match: { ...match, draft: res.draftState } }
}

export function tryDraftBuy(match, color, items) {
  if (match.phase !== 'draft') return { error: 'Сейчас не фаза драфта' }
  const res = submitPurchases(match.draft, color, items)
  if (res.error) return { error: res.error }

  const draft = res.draftState
  if (isDraftComplete(draft)) {
    // Whatever's left of this round's budget becomes this round's starting
    // battle coins (see tryPlacement) — a one-round-only handoff, not a
    // running balance; buildCarryOver resets it to 0 once the round ends,
    // so it never reaches the NEXT round's budget.
    const carryOver = {
      white: { ...match.carryOver.white, coins: draft.budgets.white },
      black: { ...match.carryOver.black, coins: draft.budgets.black },
    }
    return { match: { ...match, draft, carryOver, phase: 'placement' } }
  }
  return { match: { ...match, draft } }
}

export function tryPlacement(match, color, placementMap) {
  if (match.phase !== 'placement') return { error: 'Сейчас не фаза расстановки' }
  if (match.placement[color].ready) return { error: 'Вы уже готовы' }

  // What must end up on the board this round: pieces carried over from a
  // previous round (survivors) plus whatever was just drafted.
  const draftedTypes = [...match.carryOver[color].pieces, ...match.draft.picks[color].pieces]
  const check = validatePlacement(match.boardPattern, color, placementMap, draftedTypes)
  if (check.error) return { error: check.error }

  const placement = { ...match.placement, [color]: { ready: true, map: placementMap } }
  if (!placement.white.ready || !placement.black.ready) {
    return { match: { ...match, placement } }
  }

  const whitePieces = buildPlacementPieces('white', placement.white.map)
  const blackPieces = buildPlacementPieces('black', placement.black.map)
  const whiteCardIds = [...match.carryOver.white.cards, ...match.draft.picks.white.cards]
  const blackCardIds = [...match.carryOver.black.cards, ...match.draft.picks.black.cards]
  const startingCoins = { white: match.carryOver.white.coins, black: match.carryOver.black.coins }
  const timeLimit = TIME_LIMIT_BY_ROUND[Math.min(match.round, MAX_POOL_ROUND)]

  const gameState = createDraftRoundState(
    match.boardPattern, whitePieces, blackPieces,
    whiteCardIds, blackCardIds, startingCoins, timeLimit
  )

  return { match: { ...match, placement, phase: 'battle', gameState } }
}

// What a color keeps from a finished round's board: every surviving piece
// (no king to exclude — draft mode doesn't have one), unused cards still
// in hand, and coins. Barricades are a neutral battlefield object, not
// owned army, so they never carry over either. Coins are always reset to 0
// here — they're a strictly this-round resource (see createDraftState),
// so whatever's left in gameState.coins when the round ends simply evaporates
// rather than seeding the next round's budget.
function buildCarryOver(gameState) {
  const out = emptyCarryOver()
  Object.values(gameState.pieces).forEach(p => {
    if (p.type === 'barricade') return
    out[p.color].pieces.push(p.type)
  })
  ;['white', 'black'].forEach(color => {
    out[color].cards = gameState.cards[color].hand.map(c => c.id)
  })
  return out
}

// Called after a move/card/buy inside the battle phase produces a
// getGameResult() — decides the round winner, updates the score, and
// either starts the next round's draft (carrying over survivors and hand —
// see buildCarryOver) or ends the match.
export function applyRoundResult(match, result) {
  const scores = { ...match.scores }
  const decisive = ['checkmate', 'elimination', 'timeout', 'no_moves', 'surrender'].includes(result.type)
  if (decisive) scores[result.winner] += 1
  // stalemate / draw: no score change, round is replayed via the next round

  const matchDecided = scores.white >= ROUNDS_TO_WIN || scores.black >= ROUNDS_TO_WIN
  if (matchDecided || match.round >= HARD_ROUND_CAP) {
    return { ...match, scores, phase: 'match_over', gameState: match.gameState, lastRoundResult: result }
  }

  const carryOverRaw = buildCarryOver(match.gameState)
  // Sides swap every round — whoever was black is white next round and vice
  // versa (see rooms.js, which swaps the matching sockets in lockstep) — so
  // both the running score AND the carried-over army must swap color keys
  // too. Otherwise a player's wins/survivors would silently reattach to
  // whichever color they happen to hold that round instead of following the
  // actual person. Swapping unconditionally at every transition is exactly
  // equivalent to strict round-by-round alternation, no extra bookkeeping
  // (e.g. a stable per-player id) needed.
  const carryOver      = { white: carryOverRaw.black, black: carryOverRaw.white }
  const swappedScores  = { white: scores.black, black: scores.white }
  const nextRoundNum   = match.round + 1
  // Keep the SAME color label picking first every round (not alternated by
  // round parity) — because the color-swap above already reassigns "white"
  // to the other physical player each round, alternating the label here too
  // would cancel that out and leave the same person drafting first forever.
  const nextFirstColor = match.draft.firstColor
  const next = startRound(swappedScores, nextRoundNum, nextFirstColor, carryOver)
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
