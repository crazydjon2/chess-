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
export function createDraftRoundState(boardPattern, whitePlacement, blackPlacement, whiteCardIds, blackCardIds, startingCoins, timeLimit, now = Date.now()) {
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
  if (startingCoins) {
    state.coins = { white: startingCoins.white ?? 0, black: startingCoins.black ?? 0 }
  }
  return state
}
