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
    timers: { white: 180, black: 180 },
    moveHistory: [],
    fogZones: [],
    meteors: [],
  }
}

// Draft mode: a single round's battle state, built from the round's board
// pattern plus each side's hidden placement and drafted cards. Runs under
// elimination rules (see chess.js) — no checkmate, no king safety — since
// blind simultaneous placement can otherwise hand white an unwinnable,
// un-reactable position straight out of setup.
export function createDraftRoundState(boardPattern, whitePlacement, blackPlacement, whiteCardIds, blackCardIds, carryOverCoins, moveLimit) {
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
  state.moveLimit = moveLimit ?? null
  if (carryOverCoins) {
    state.coins = { white: carryOverCoins.white ?? 0, black: carryOverCoins.black ?? 0 }
  }
  return state
}
