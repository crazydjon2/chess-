import { getValidSquares } from './chess.js'
import { PIECE_VALUE } from './economy.js'

function squareCol(sq)  { return sq.charCodeAt(0) - 97 }
function squareRank(sq) { return parseInt(sq.slice(1), 10) }

// The 3x3 neighborhood around `center`, clipped to squares that actually
// exist on this board (edges/corners just get fewer cells).
function neighborhood3x3(center, validSquares) {
  const col  = squareCol(center)
  const rank = squareRank(center)
  const cells = []
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const sq = `${String.fromCharCode(97 + col + dc)}${rank + dr}`
      if (validSquares.has(sq)) cells.push(sq)
    }
  }
  return cells
}

export function applyCardEffect(cardId, gameState, targetSquare, playerColor) {
  switch (cardId) {
    // A barricade is a real (neutral, immobile) piece rather than a
    // permanent map edit — it blocks the square like any occupied square
    // would, but the opponent can capture it away like a normal piece, so
    // no wall built from these can ever be truly permanent.
    case 'barricade': {
      if (gameState.pieces[targetSquare]) return gameState
      return {
        ...gameState,
        pieces: {
          ...gameState.pieces,
          [targetSquare]: { type: 'barricade', color: 'neutral', hp: 2 },
        },
      }
    }

    case 'add_cell': {
      const extraCells = gameState.board.extraCells ?? []
      if (extraCells.includes(targetSquare)) return gameState
      return {
        ...gameState,
        board: {
          ...gameState.board,
          extraCells: [...extraCells, targetSquare],
        },
      }
    }

    case 'hp_boost': {
      const piece = gameState.pieces[targetSquare]
      if (!piece || piece.type === 'king') return gameState
      return {
        ...gameState,
        pieces: {
          ...gameState.pieces,
          [targetSquare]: { ...piece, hp: piece.hp + 1, hpBoostTurns: 2 },
        },
      }
    }

    // Counter-spell: undoes the opponent's last move entirely — their piece
    // goes back to its origin, and if that move captured one of ours, our
    // piece comes back too. targetSquare is just confirmation (the square
    // their moved piece currently occupies) — see getValidTargets, which
    // only ever offers that one square.
    case 'rollback': {
      const oppColor = playerColor === 'white' ? 'black' : 'white'
      const hist = gameState.moveHistory ?? []
      const revIdx = [...hist].reverse().findIndex(m => m.piece.color === oppColor)
      if (revIdx === -1) return gameState

      const idx  = hist.length - 1 - revIdx
      const move = hist[idx]
      if (move.to !== targetSquare) return gameState

      const current = gameState.pieces[move.to]
      if (!current || current.color !== oppColor) return gameState  // moved/captured since
      if (gameState.pieces[move.from]) return gameState             // origin must be free

      const pieces = { ...gameState.pieces }
      delete pieces[move.to]
      // Restore the exact pre-move piece (move.piece) rather than whatever's
      // currently on the square — if that move was a pawn promotion, the
      // square now holds a queen/etc, but rolling it back should give the
      // caster their pawn back, not undo the move while keeping the upgrade.
      pieces[move.from] = move.piece
      if (move.captured) {
        pieces[move.to] = move.captured
      }

      // Undoing a capturing move must also claw back the coins the mover
      // earned from it (see gameEngine.js's tryMove) — otherwise they keep
      // getting paid for a kill that no longer happened once the victim is
      // restored.
      const coins = move.captured
        ? {
            ...gameState.coins,
            [move.piece.color]: Math.max(0, gameState.coins[move.piece.color] - (PIECE_VALUE[move.captured.type] || 0)),
          }
        : gameState.coins

      return {
        ...gameState,
        pieces,
        coins,
        moveHistory: hist.filter((_, i) => i !== idx),
      }
    }

    case 'freeze': {
      const piece = gameState.pieces[targetSquare]
      if (!piece) return gameState
      return {
        ...gameState,
        pieces: {
          ...gameState.pieces,
          [targetSquare]: { ...piece, frozen: 1 },
        },
      }
    }

    // Adds a fog zone covering the 3x3 area around targetSquare. The zone
    // itself (location, owner, turns left) is visible to both players — only
    // the caster's own pieces inside it are actually hidden from the
    // opponent, and that redaction happens server-side (rooms.js viewFor),
    // not here: this just records the zone in shared game state.
    case 'smoke_screen': {
      const validSquares = getValidSquares(gameState.board)
      const cells = neighborhood3x3(targetSquare, validSquares)
      return {
        ...gameState,
        fogZones: [...(gameState.fogZones ?? []), { owner: playerColor, cells, turnsLeft: 3 }],
      }
    }

    // Registers a delayed strike on targetSquare — no immediate effect.
    // Detonation (destroying whatever ends up on that square) and the
    // 2-full-move countdown are handled by tickMeteors (chess.js), which
    // deliberately ticks on the OPPONENT's moves rather than the caster's,
    // so the caster's own residual move this same turn (cards don't end
    // the turn) never counts as progress. Location secrecy (caster sees
    // the square, opponent only sees a countdown) is server-side
    // redaction (rooms.js), not anything recorded differently here.
    case 'meteor': {
      return {
        ...gameState,
        meteors: [...(gameState.meteors ?? []), { owner: playerColor, square: targetSquare, turnsLeft: 2 }],
      }
    }

    default:
      return gameState
  }
}
