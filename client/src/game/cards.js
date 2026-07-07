import { getValidSquares, isKingInCheck } from './chess.js'
import { applyCardEffect } from './cardEffects.js'

// Cost is priced against piece capture values (pawn=1, knight/bishop=3,
// rook=5, queen=9) — see PIECE_VALUE in App.jsx. Two captured pawns (2
// coins) should never be enough to afford anything; cheapest cards cost 6
// (a rook, or a minor piece plus change).
export const CARD_DEFS = {
  barricade: {
    id:     'barricade',
    name:   'Баррикада',
    desc:   'Преграда на 2 HP на\nсвободной клетке. Соперник\nможет её срубить.',
    accent: '#c0392b',
    glyph:  '✕',
    cost:   5,
  },
  add_cell: {
    id:     'add_cell',
    name:   'Добавить клетку',
    desc:   'Добавляет одну клетку\nза краем доски.',
    accent: '#27ae60',
    glyph:  '✦',
    cost:   3,
  },
  hp_boost: {
    id:     'hp_boost',
    name:   '+1 жизнь',
    desc:   'Даёт любой своей фигуре\n+1 HP на 2 хода. При атаке\nснимает HP.',
    accent: '#e67e22',
    glyph:  '♥',
    cost:   6,
  },
  rollback: {
    id:     'rollback',
    name:   'Откат',
    desc:   'Отменяет последний ход\nсоперника.',
    accent: '#8e44ad',
    glyph:  '↺',
    cost:   10,
  },
  freeze: {
    id:     'freeze',
    name:   'Заморозка',
    desc:   'Вражеская фигура не может\nходить следующий ход.',
    accent: '#2980b9',
    glyph:  '❄',
    cost:   6,
  },
  smoke_screen: {
    id:     'smoke_screen',
    name:   'Дымовая завеса',
    desc:   'Скрывает от соперника ваши\nфигуры в области 3×3 на\nследующие 3 хода.',
    accent: '#7f8c8d',
    glyph:  '☁',
    cost:   6,
  },
  meteor: {
    id:     'meteor',
    name:   'Метеор',
    desc:   'Через 2 полных хода падает\nна выбранную клетку и\nуничтожает всё на ней.\nСоперник не видит куда.',
    accent: '#d35400',
    glyph:  '☄',
    cost:   9,
  },
}

// Every card is just another kind of turn — like a normal move, it must
// never leave the player's own king in check. rollback is the main offender
// (it can pull a piece off a square that was blocking a check), but the
// filter is applied uniformly so any future card gets this for free.
export function getValidTargets(cardId, gameState, playerColor) {
  return rawTargets(cardId, gameState, playerColor).filter(target => {
    const next = applyCardEffect(cardId, gameState, target, playerColor)
    return !isKingInCheck(next, playerColor)
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

    case 'hp_boost':
      return Object.keys(pieces).filter(sq => {
        const p = pieces[sq]
        return p.color === playerColor && p.type !== 'king'
      })

    case 'rollback': {
      // Valid as long as the piece has moved at least once (the move being
      // undone counts) — including a piece's very first move this round,
      // which sends it back to its round-start placement square. That's a
      // legitimate, sometimes crucial target (e.g. undoing an opening
      // capture), not a degenerate case to exclude.
      const oppColor = playerColor === 'white' ? 'black' : 'white'
      const hist = gameState.moveHistory ?? []
      const idx = [...hist].reverse().findIndex(m => m.piece.color === oppColor)
      if (idx === -1) return []
      const move  = hist[hist.length - 1 - idx]
      const piece = pieces[move.to]
      if (!piece || piece.color !== oppColor) return []
      if (pieces[move.from]) return []
      return [move.to]
    }

    case 'freeze':
      return Object.keys(pieces).filter(sq => {
        const p = pieces[sq]
        return p.color !== playerColor && p.type !== 'barricade'
      })

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

    default:
      return []
  }
}
