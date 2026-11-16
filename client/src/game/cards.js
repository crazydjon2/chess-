import { getValidSquares, isKingInCheck, hasAnyLegalMove } from './chess.js'
import { applyCardEffect } from './cardEffects.js'
import { t } from '../i18n/core.js'

// Cost is the draft price — same budget pieces are bought from (see
// draftEngine.js and economy.js's shopPieceCost).
// name/desc are getters so they always read the current UI language.
export const CARD_DEFS = {
  barricade: {
    id:     'barricade',
    get name() { return t('card.barricade.name') },
    get desc() { return t('card.barricade.desc') },
    accent: '#c0392b',
    glyph:  '✕',
    cost:   5,
  },
  add_cell: {
    id:     'add_cell',
    get name() { return t('card.add_cell.name') },
    get desc() { return t('card.add_cell.desc') },
    accent: '#27ae60',
    glyph:  '✦',
    cost:   2,
  },
  freeze: {
    id:     'freeze',
    get name() { return t('card.freeze.name') },
    get desc() { return t('card.freeze.desc') },
    accent: '#2980b9',
    glyph:  '❄',
    cost:   7,
  },
  smoke_screen: {
    id:     'smoke_screen',
    get name() { return t('card.smoke_screen.name') },
    get desc() { return t('card.smoke_screen.desc') },
    accent: '#7f8c8d',
    glyph:  '☁',
    cost:   9,
  },
  meteor: {
    id:     'meteor',
    get name() { return t('card.meteor.name') },
    get desc() { return t('card.meteor.desc') },
    accent: '#d35400',
    glyph:  '☄',
    cost:   7,
  },
  unstable: {
    id:     'unstable',
    get name() { return t('card.unstable.name') },
    get desc() { return t('card.unstable.desc') },
    accent: '#8e44ad',
    glyph:  '☯',
    cost:   10,
  },
  shield: {
    id:     'shield',
    get name() { return t('card.shield.name') },
    get desc() { return t('card.shield.desc') },
    accent: '#16a085',
    glyph:  '⛨',
    cost:   13,
  },
}

// Every card is just another kind of turn — like a normal move, it must
// never leave the player's own king in check. Most cards can never actually
// trigger this (placing a mine or a wall doesn't move anyone), but the
// filter is applied uniformly so any future card gets it for free.
export function getValidTargets(cardId, gameState, playerColor) {
  const targets = rawTargets(cardId, gameState, playerColor)
  // Draft mode has no check rule (see chess.js's getEliminationResult) — a
  // king under attack must not lock its owner out of every card.
  if (gameState.eliminationMode) return targets
  return targets.filter(target => {
    const next = applyCardEffect(cardId, gameState, target, playerColor)
    return !isKingInCheck(next, playerColor)
  })
}

// True if `playerColor` has some card+target in hand that would leave them
// with a legal move afterward — used by gameEngine.js/sandboxEngine.js to
// keep a "no legal move" loss (see chess.js's getGameResult) from firing
// the instant it becomes your turn, before you've had any chance to act.
// Cards don't end the turn, so trying one is always on the table first —
// most cards can't rescue a jammed position (a mine or a wall doesn't move
// anyone), but add_cell genuinely can: it can open a brand-new square
// for a piece boxed in at the board's edge. Checked generically over every card in
// hand rather than special-casing which ones "count", so a future card
// that can also rescue a stuck position gets this for free. False once
// cardPlayedThisTurn is already set — only one card per turn, so having
// already spent it means there's genuinely nothing left to try.
export function hasRescueCard(gameState, playerColor) {
  if (gameState.cardPlayedThisTurn) return false
  const hand = gameState.cards?.[playerColor]?.hand ?? []
  return hand.some(card => {
    const targets = getValidTargets(card.id, gameState, playerColor)
    return targets.some(target => {
      const next = applyCardEffect(card.id, gameState, target, playerColor)
      return hasAnyLegalMove(next, playerColor)
    })
  })
}

function rawTargets(cardId, gameState, playerColor) {
  const { pieces, board } = gameState

  switch (cardId) {
    // Barricades are a real (if neutral, immobile) piece — see
    // cardEffects.js. That means a king can never be permanently walled
    // in: any barricade blocking an approach can simply be captured like
    // any other piece, so no connectivity analysis is needed here.
    case 'barricade': {
      const validSqs = getValidSquares(board)
      return [...validSqs].filter(sq => !pieces[sq])
    }

    case 'add_cell': {
      // All 4 directions: cells adjacent to an existing valid square OR a
      // blocked hole that don't yet exist. Anchoring on valid squares alone
      // would miss a brand-new cell whose only in-bounds neighbor is a hole
      // sitting right on the rectangle's edge (that hole itself is never
      // "valid", so nothing would ever walk outward from it).
      const validSqs = getValidSquares(board)
      const anchors  = new Set([...validSqs, ...(board.blockedCells ?? [])])
      const candidates = new Set()
      anchors.forEach(sq => {
        const col  = sq.charCodeAt(0) - 97
        const rank = parseInt(sq.slice(1))
        for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nc = col + dc, nr = rank + dr
          if (nc < -10 || nc > 34 || nr < -10 || nr > 34) continue
          const nsq = `${String.fromCharCode(97 + nc)}${nr}`
          if (!validSqs.has(nsq)) candidates.add(nsq)
        }
      })
      return [...candidates]
    }

    // A hidden mine, laid on any free square — see cardEffects.js. Same
    // "must be empty" targeting as barricade, plus it can't stack on a
    // square that already has a mine on it (from either side), since a
    // square only ever needs to trap the first piece that lands on it.
    case 'freeze': {
      const validSqs = getValidSquares(board)
      const mines = gameState.mines ?? []
      const mined = new Set(mines.map(m => m.square))
      return [...validSqs].filter(sq => !pieces[sq] && !mined.has(sq))
    }

    // Cast anywhere on the board, including a blocked hole — the target is
    // just an anchor for the 3x3 fog zone around it (see cardEffects.js's
    // neighborhood3x3), which only ever includes actually-valid squares, so
    // centering on a hole is harmless and still usefully covers the open
    // cells around it.
    case 'smoke_screen':
      return [...getValidSquares(board), ...(board.blockedCells ?? [])]

    // Cast anywhere, same as smoke_screen — the impact site is a single
    // square, not an area, so a target on a permanent hole is a legal but
    // wasted cast (nothing can ever stand there).
    case 'meteor':
      return [...getValidSquares(board), ...(board.blockedCells ?? [])]

    // Any piece on the board, either side's — except a king (shapeshifting
    // it away from 'king' mid-effect would decide the round), a barricade
    // (not a real piece, has no "original type" to return to), or a pawn
    // (pawns never take part in shapeshifting at all — see chess.js's
    // UNSTABLE_TYPES — so a temporary effect can never end in a permanent
    // promotion). A piece already unstable can't
    // be re-targeted: recording a new originalType over an already-shifted
    // type would lose the real one it's meant to revert to (see
    // cardEffects.js).
    // Any of the caster's own pieces, the king included, that isn't already
    // shielded — hp>1 means it still has a shield (or never lost one), and
    // stacking a second would make it shrug off two hits.
    case 'shield':
      return Object.keys(pieces).filter(sq => pieces[sq].color === playerColor && pieces[sq].hp === 1)

    case 'unstable':
      return Object.keys(pieces).filter(sq => {
        const p = pieces[sq]
        return p.type !== 'king' && p.type !== 'pawn' && p.color !== 'neutral' && !p.unstable
      })

    default:
      return []
  }
}
