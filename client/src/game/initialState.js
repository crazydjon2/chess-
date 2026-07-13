import { CARD_DEFS } from './cards.js'

function baseState(pieces, board, whiteHand, blackHand) {
  return {
    board,
    pieces,
    cards: {
      white: { hand: whiteHand, used: [] },
      black: { hand: blackHand, used: [] },
    },
    coins: { white: 0, black: 0 },
    turn: 'white',
    cardPlayedThisTurn: false,
    halfMoveClock: 0,
    moveHistory: [],
    fogZones: [],
    meteors: [],
    mines: [],
    actionLog: [],
  }
}

// Draft mode: a single round's battle state, built from the round's board
// pattern plus each side's hidden placement and drafted cards. Runs under
// elimination rules (see chess.js) — no checkmate, no king safety — since
// blind simultaneous placement can otherwise hand white an unwinnable,
// un-reactable position straight out of setup.
//
// `startingCoins` seeds this round's coin count from whatever was left of
// THIS round's own draft budget (see matchEngine.js's tryDraftBuy) — coins
// don't persist across rounds at all, so this is a same-round handoff, not
// a running balance.
//
// `timeLimit` (seconds, draft mode only) seeds a real per-player clock —
// `null` means untimed (the sandbox testing mode uses this, so manual
// testing is never cut off mid-poke). `now` defaults to the real clock but
// is accepted explicitly so tests can drive it deterministically.
// `timerIncrement` (seconds, defaults to 0) is added back to the mover's
// own clock after each of their moves (see chess.js's applyMove) — meaningless
// (and left null) when untimed, same as `timers`/`turnStartedAt`.
// `analysisSeconds` (defaults to 0) is EACH color's own free-look budget on
// their own first move of the round — not just whoever moves first
// chronologically (turn always starts white, so a single shared "first
// move is free" window would only ever benefit white). `analysisUsed`
// tracks which colors have already spent theirs this round; applyMove
// discounts elapsed time by up to `analysisSeconds` the first time each
// color moves, then flips that color's flag so it never applies again.
export function createDraftRoundState(boardPattern, whitePlacement, blackPlacement, whiteCardIds, blackCardIds, startingCoins, timeLimit, now = Date.now(), timerIncrement = 0, analysisSeconds = 0) {
  const board = {
    size: { rows: boardPattern.rows, cols: boardPattern.cols },
    blockedCells: boardPattern.blockedCells ?? [],
    extraCells: [],
    portals: [],
  }
  const pieces = { ...whitePlacement, ...blackPlacement }
  const cardsFor = (ids) => ids.map(id => CARD_DEFS[id])
  const state = baseState(pieces, board, cardsFor(whiteCardIds), cardsFor(blackCardIds))
  state.eliminationMode = true
  state.timers = timeLimit != null ? { white: timeLimit, black: timeLimit } : null
  state.turnStartedAt = timeLimit != null ? now : null
  state.timerIncrement = timeLimit != null ? timerIncrement : null
  state.analysisSeconds = timeLimit != null ? analysisSeconds : null
  state.analysisUsed = timeLimit != null ? { white: false, black: false } : null
  if (startingCoins) {
    state.coins = { white: startingCoins.white ?? 0, black: startingCoins.black ?? 0 }
  }
  // A synthetic first entry for the battle log (see chess.js's
  // appendLogEntry) — the opening position, so "jump to the start of the
  // round" is always available even before either side has acted.
  state.actionLog = [{
    kind: 'start',
    color: null,
    snapshot: { pieces: state.pieces, fogZones: state.fogZones, meteors: state.meteors, mines: state.mines },
  }]
  return state
}
