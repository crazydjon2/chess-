import { CARD_DEFS } from './cards.js'

function baseState(pieces, board, whiteHand, blackHand) {
  return {
    board,
    pieces,
    cards: {
      white: { hand: whiteHand, used: [] },
      black: { hand: blackHand, used: [] },
    },
    turn: 'white',
    cardPlayedThisTurn: false,
    halfMoveClock: 0,
    moveHistory: [],
    fogZones: [],
    meteors: [],
    mines: [],
    actionLog: [],
    // Draw offers (see server/matchEngine.js's tryOfferDraw): the color
    // with an offer standing, and — per color — the moveHistory length at
    // its last offer, so each side can offer at most once per move.
    drawOffer: null,
    drawOfferedAt: { white: -1, black: -1 },
  }
}

// Draft mode: a single round's battle state, built from the round's board
// pattern plus each side's hidden placement and drafted cards. Runs under
// elimination rules (see chess.js) — no checkmate, no king safety — since
// blind simultaneous placement can otherwise hand white an unwinnable,
// un-reactable position straight out of setup.
//
// `timeLimit` (seconds, draft mode only) seeds a real per-player clock —
// `null` means untimed (the sandbox testing mode uses this, so manual
// testing is never cut off mid-poke). `now` defaults to the real clock but
// is accepted explicitly so tests can drive it deterministically.
// `timerIncrement` (seconds, defaults to 0) is added back to the mover's
// own clock after each of their moves (see chess.js's applyMove) — meaningless
// (and left null) when untimed, same as `timers`/`turnStartedAt`.
export function createDraftRoundState(boardPattern, whitePlacement, blackPlacement, whiteCardIds, blackCardIds, timeLimit, now = Date.now(), timerIncrement = 0) {
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
