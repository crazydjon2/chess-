import { getValidSquares, isKingInCheck, emptyHomeSquares } from './chess.js'
import { applyCardEffect } from './cardEffects.js'
import { getCaptured } from './economy.js'

// Cost is priced against piece capture values (pawn=1, knight/bishop=3,
// rook=5, queen=9) — see PIECE_VALUE in App.jsx. Two captured pawns (2
// coins) should never be enough to afford anything; cheapest cards cost 6
// (a rook, or a minor piece plus change).
export const CARD_DEFS = {
  barricade: {
    id:     'barricade',
    name:   'Баррикада',
    desc:   'Ставит преграду с 2 HP на свободную клетку. Соперник может разрушить её, как обычную фигуру.',
    accent: '#c0392b',
    glyph:  '✕',
    cost:   5,
  },
  add_cell: {
    id:     'add_cell',
    name:   'Добавить клетку',
    desc:   'Добавляет одну новую клетку за краем доски, расширяя игровое поле.',
    accent: '#27ae60',
    glyph:  '✦',
    cost:   3,
  },
  necromancy: {
    id:     'necromancy',
    name:   'Некромантия',
    desc:   'Возрождает одну из срубленных вами фигур соперника — она переходит на вашу сторону. Появляется на случайной свободной клетке на вашей половине доски.',
    accent: '#6c3fa8',
    glyph:  '☠',
    cost:   10,
  },
  freeze: {
    id:     'freeze',
    name:   'Мина заморозки',
    desc:   'Закладывает невидимую мину на свободную клетку. Вражеская фигура, которая наступит на неё, застревает и пропускает свой следующий ход. Соперник знает, что где-то заложена мина, но не видит, где именно.',
    accent: '#2980b9',
    glyph:  '❄',
    cost:   6,
  },
  smoke_screen: {
    id:     'smoke_screen',
    name:   'Дымовая завеса',
    desc:   'Скрывает ваши фигуры в области 3×3 от соперника на следующие 4 хода.',
    accent: '#7f8c8d',
    glyph:  '☁',
    cost:   6,
  },
  meteor: {
    id:     'meteor',
    name:   'Метеор',
    desc:   'Через 2 полных хода метеор падает на выбранную клетку и уничтожает всё, что на ней окажется. Соперник знает, что метеор летит, но не видит куда.',
    accent: '#d35400',
    glyph:  '☄',
    cost:   6,
  },
  unstable: {
    id:     'unstable',
    name:   'Нестабильная фигура',
    desc:   'Превращает любую фигуру (свою или соперника) в нестабильную на 6 ходов. Каждый ход она случайно меняет тип, а затем возвращается к исходному.',
    accent: '#8e44ad',
    glyph:  '☯',
    cost:   9,
  },
}

// Every card is just another kind of turn — like a normal move, it must
// never leave the player's own king in check. Most cards can never actually
// trigger this (placing a mine or a wall doesn't move anyone), but the
// filter is applied uniformly so any future card gets it for free.
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

    // "Target" here is a captured PIECE TYPE, not a square — see
    // cardEffects.js. Offers the opponent's pieces YOU captured (trophies),
    // not your own losses — reanimated, they fight on your side. The square
    // it actually revives on is chosen at random among the caster's own
    // empty home-rank squares, so it isn't part of the target at all;
    // offered only when there's both something to revive AND somewhere to
    // put it.
    case 'necromancy': {
      const oppColor = playerColor === 'white' ? 'black' : 'white'
      const captured = getCaptured(gameState, oppColor)
      if (captured.length === 0) return []
      if (emptyHomeSquares(gameState, playerColor).length === 0) return []
      return [...new Set(captured)]
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
    // it away from 'king' would break findKing/check logic mid-effect) or a
    // barricade (not a real piece, has no "original type" to return to).
    // A piece already unstable can't be re-targeted: recording a new
    // originalType over an already-shifted type would lose the real one it's
    // meant to revert to (see cardEffects.js).
    case 'unstable':
      return Object.keys(pieces).filter(sq => {
        const p = pieces[sq]
        return p.type !== 'king' && p.color !== 'neutral' && !p.unstable
      })

    default:
      return []
  }
}
