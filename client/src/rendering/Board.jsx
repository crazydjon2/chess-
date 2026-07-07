import { useCallback } from 'react'
import HitLayer from './HitLayer'
import VisualLayer from './VisualLayer'
import EffectLayer from './EffectLayer'
import { getHighlights } from '../game/highlights'
import { getLegalMoves, getFogCaptureSquares, isKingInCheck } from '../game/chess'
import './Board.css'

const CELL = 54

function findKingSquare(pieces, color) {
  return Object.keys(pieces).find(
    sq => pieces[sq].color === color && pieces[sq].type === 'king'
  ) ?? null
}

export default function Board({ gameState, skin = 'default', playerColor = 'white', onMove, onPlayCard, boardMode, dispatch, lastMoveAnim, meteorStrikeAnim, flipped = false }) {
  const { rows, cols } = gameState.board.size
  const width  = cols * CELL
  const height = rows * CELL

  // No "check" concept in elimination mode — the king has no special
  // status there, so highlighting it as uniquely endangered would be
  // misleading (every piece is equally capturable).
  const inCheck      = !gameState.eliminationMode && isKingInCheck(gameState, gameState.turn)
  const checkSquare  = inCheck ? findKingSquare(gameState.pieces, gameState.turn) : null
  const highlights   = { ...getHighlights(boardMode), checkSquare }

  // Squares outside the rectangular board that need clickable hit rects.
  // add_cell can propose a new square in any of the 4 directions (see
  // cards.js), including BELOW (rank < 1) or LEFT (col < 0) of the board —
  // missing those two here left VisualLayer's ghost "+" marker clickable
  // only visually, with no actual hit-rect underneath it, so add_cell
  // silently did nothing when cast below/left of the board.
  const { extraCells = [] } = gameState.board
  const cardBorderTargets = boardMode.type === 'card_targeting'
    ? boardMode.validTargets.filter(sq => {
        const rank = parseInt(sq.slice(1))
        const col  = sq.charCodeAt(0) - 97
        return rank > rows || rank < 1 || col >= cols || col < 0
      })
    : []
  const borderTargets = [...new Set([...extraCells, ...cardBorderTargets])]

  const handleSquareClick = useCallback((square) => {
    const piece = gameState.pieces[square]

    if (boardMode.type === 'piece_selected' && square !== boardMode.square) {
      if (boardMode.legalMoves.includes(square)) {
        onMove?.({ from: boardMode.square, to: square })
        dispatch({ type: 'CANCEL' })
        return
      }
    }
    if (boardMode.type === 'card_targeting') {
      if (boardMode.validTargets.includes(square)) {
        onPlayCard?.({ card: boardMode.card, target: square })
      }
      dispatch({ type: 'CANCEL' })
      return
    }

    const legalMoves = piece && piece.color === playerColor
      ? [...getLegalMoves(gameState, square), ...getFogCaptureSquares(gameState, square)]
      : []

    dispatch({ type: 'CLICK_SQUARE', square, piece, playerColor, legalMoves })
  }, [boardMode, gameState, playerColor, onMove, onPlayCard, dispatch])

  const handleDragStart = useCallback((square) => {
    const piece = gameState.pieces[square]
    const legalMoves = piece && piece.color === playerColor
      ? [...getLegalMoves(gameState, square), ...getFogCaptureSquares(gameState, square)]
      : []
    dispatch({ type: 'DRAG_START', square, piece, playerColor, legalMoves })
  }, [gameState, playerColor, dispatch])

  const handleDragOver = useCallback((square) => {
    dispatch({ type: 'DRAG_OVER', square })
  }, [dispatch])

  const handleDrop = useCallback((square) => {
    if (boardMode.type === 'dragging' && boardMode.legalMoves.includes(square)) {
      onMove?.({ from: boardMode.fromSquare, to: square })
    }
    dispatch({ type: 'DROP', square })
  }, [boardMode, onMove, dispatch])

  const ranks = Array.from({ length: rows }, (_, i) => rows - i)
  const files = Array.from({ length: cols }, (_, i) => String.fromCharCode(97 + i))
  if (flipped) { ranks.reverse(); files.reverse() }

  const isCardMode = boardMode.type === 'card_targeting'
  const cardAccent = isCardMode ? (boardMode.card?.accent ?? '#888') : null

  return (
    <div className="board-scene-wrap">
      <div className="board-frame">
        <div className="frame-inner">
          <ol className="coords-ranks" style={{ height }}>
            {ranks.map(r => <li key={r}>{r}</li>)}
          </ol>

          <div className="board-col">
            <div
              className={`board-root${isCardMode ? ' card-mode' : ''}`}
              style={{
                width,
                height,
                ...(isCardMode ? { '--card-accent': cardAccent } : {}),
              }}
            >
              <VisualLayer
                gameState={gameState}
                highlights={highlights}
                skin={skin}
                width={width}
                height={height}
                cellSize={CELL}
                lastMoveAnim={lastMoveAnim}
                meteorStrikeAnim={meteorStrikeAnim}
                flipped={flipped}
              />
              <HitLayer
                rows={rows}
                cols={cols}
                cellSize={CELL}
                pieces={gameState.pieces}
                borderTargets={borderTargets}
                flipped={flipped}
                onSquareClick={handleSquareClick}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
              <EffectLayer width={width} height={height} />
            </div>

            <ol className="coords-files" style={{ width }}>
              {files.map(f => <li key={f}>{f}</li>)}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
