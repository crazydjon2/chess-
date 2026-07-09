import { getValidSquares, emptyHomeSquares } from './chess.js'

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

    // `targetSquare` is repurposed here as a captured PIECE TYPE (see
    // cards.js's getValidTargets) — necromancy doesn't target a square at
    // all, since where the piece reappears is random, not chosen. Finds the
    // first not-yet-revived OPPONENT capture of that type in moveHistory (a
    // trophy — a piece the caster cut down, not one they lost) and marks it
    // revived (so it stops counting as "captured" — see economy.js's
    // getCaptured — and can't be revived a second time), then drops a fresh
    // copy of that piece, fighting for the caster now, on a random empty
    // home-rank square.
    case 'necromancy': {
      const pieceType = targetSquare
      const oppColor = playerColor === 'white' ? 'black' : 'white'
      const hist = gameState.moveHistory ?? []
      const idx = hist.findIndex(m =>
        m.captured && m.captured.color === oppColor && m.captured.type === pieceType && !m.captured.revived
      )
      if (idx === -1) return gameState

      const squares = emptyHomeSquares(gameState, playerColor)
      if (squares.length === 0) return gameState
      const square = squares[Math.floor(Math.random() * squares.length)]

      const moveHistory = [...hist]
      moveHistory[idx] = { ...moveHistory[idx], captured: { ...moveHistory[idx].captured, revived: true } }

      return {
        ...gameState,
        pieces: { ...gameState.pieces, [square]: { type: pieceType, color: playerColor, hp: 1 } },
        moveHistory,
      }
    }

    // Lays a hidden mine on targetSquare — no immediate effect. It sits
    // there (invisible to the opponent — see rooms.js's redaction) until
    // whichever piece next MOVES ONTO that square lands on it; only an
    // enemy piece (relative to the mine's owner) triggers it, so the
    // caster's own pieces can walk over their own mine freely. Detonation
    // (freezing the piece that landed there and consuming the mine) is
    // handled by chess.js's applyMove, right where it already knows
    // whether a piece actually ended up on the destination square (as
    // opposed to bouncing off a tougher one) — not here.
    case 'freeze': {
      if (gameState.pieces[targetSquare]) return gameState
      return {
        ...gameState,
        mines: [...(gameState.mines ?? []), { owner: playerColor, square: targetSquare }],
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
        fogZones: [...(gameState.fogZones ?? []), { owner: playerColor, cells, turnsLeft: 4 }],
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

    // Marks targetSquare's piece as "unstable" for 6 turns — no immediate
    // type change (the first shapeshift happens on the next tick). Recorded
    // on the PIECE itself, not the square, so the effect follows it like
    // `frozen` does if it moves or gets captured onto. The actual per-turn
    // reshuffling and eventual revert to `originalType` is chess.js's
    // tickUnstablePieces, run every move exactly like tickFogZones — see its
    // comment for why cards themselves never tick anything.
    case 'unstable': {
      const piece = gameState.pieces[targetSquare]
      if (!piece || piece.type === 'king' || piece.color === 'neutral' || piece.unstable) return gameState
      return {
        ...gameState,
        pieces: {
          ...gameState.pieces,
          [targetSquare]: { ...piece, unstable: { originalType: piece.type, turnsLeft: 6 } },
        },
      }
    }

    default:
      return gameState
  }
}
