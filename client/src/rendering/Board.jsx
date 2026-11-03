import { useCallback } from 'react'
import HitLayer from './HitLayer'
import VisualLayer from './VisualLayer'
import EffectLayer from './EffectLayer'
import useFitSquare from './useFitSquare'
import { getHighlights } from '../game/highlights'
import { getLegalMoves, getFogCaptureSquares, isKingInCheck } from '../game/chess'
import { play } from '../sound'
import './Board.css'

const CELL = 54

function findKingSquare(pieces, color) {
  return Object.keys(pieces).find(
    sq => pieces[sq].color === color && pieces[sq].type === 'king'
  ) ?? null
}

export default function Board({
  gameState, skin = 'default', playerColor = 'white', onMove, onPlayCard, boardMode, dispatch,
  lastMoveAnim, meteorStrikeAnim, mineStrikeAnim, flipped = false,
  isMyTurn = true, premove = null, onSetPremove, onClearPremove, // premove: see OnlineApp.jsx
  // `fluid`: board fills whatever height its ancestor chain actually gives
  // it (see Board.css's .board-root.fluid) instead of rendering at a fixed
  // CELL-based pixel size — used in the live battle view, which should be
  // exactly as large as the placement screen's board, not a small fixed
  // size regardless of how much room the viewport actually has. Off by
  // default (RoundSummary's frozen recap board stays at its natural size,
  // a small reference thumbnail rather than a full-viewport board).
  fluid = false,
}) {
  const { rows, cols } = gameState.board.size
  const width  = cols * CELL
  const height = rows * CELL

  // No "check" concept in elimination mode — the king has no special
  // status there, so highlighting it as uniquely endangered would be
  // misleading (every piece is equally capturable).
  const inCheck      = isKingInCheck(gameState, gameState.turn)
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

  // The board genuinely extends past its own frame once add_cell has
  // landed outside the rectangle — the fluid surface's rounded-corner
  // overflow clip (see Board.css) has to stay off for the REST of the
  // round then, not just while targeting: it was silently swallowing the
  // freshly added cell the moment card-targeting mode ended, leaving it
  // in the game state but invisible and unclickable.
  const hasOutsideCells = extraCells.some(sq => {
    const rank = parseInt(sq.slice(1))
    const col  = sq.charCodeAt(0) - 97
    return rank > rows || rank < 1 || col >= cols || col < 0
  })

  const handleSquareClick = useCallback((square) => {
    const piece = gameState.pieces[square]

    // Reclicking a piece with a queued premove clears it and falls through
    // to reselect, so one click swaps the target instead of cancel-then-reselect.
    if (!isMyTurn && premove && square === premove.from) {
      onClearPremove?.()
    }

    if (boardMode.type === 'piece_selected' && square !== boardMode.square) {
      if (boardMode.legalMoves.includes(square)) {
        if (isMyTurn) {
          onMove?.({ from: boardMode.square, to: square })
        } else {
          onSetPremove?.({ from: boardMode.square, to: square })
        }
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

    // Tiny pick-up tick when selecting one of your own pieces — the
    // move/capture that may follow has its own, bigger sound.
    if (piece && piece.color === playerColor) play('select')
    dispatch({ type: 'CLICK_SQUARE', square, piece, playerColor, legalMoves })
  }, [boardMode, gameState, playerColor, onMove, onPlayCard, dispatch, isMyTurn, premove, onSetPremove, onClearPremove])

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
      if (isMyTurn) {
        onMove?.({ from: boardMode.fromSquare, to: square })
      } else {
        onSetPremove?.({ from: boardMode.fromSquare, to: square })
      }
    }
    dispatch({ type: 'DROP', square })
  }, [boardMode, onMove, dispatch, isMyTurn, onSetPremove])

  const ranks = Array.from({ length: rows }, (_, i) => rows - i)
  const files = Array.from({ length: cols }, (_, i) => String.fromCharCode(97 + i))
  if (flipped) { ranks.reverse(); files.reverse() }

  const isCardMode = boardMode.type === 'card_targeting'
  const cardAccent = isCardMode ? (boardMode.card?.accent ?? '#888') : null
  const cardModeStyle = isCardMode ? { '--card-accent': cardAccent } : {}

  // Fluid board size measured from the real space its container gives it
  // (see useFitSquare) — an exact cols:rows rectangle that fills the surface
  // edge-to-edge with no cream letterbox bands and is always as large as the
  // room allows.
  const [sceneRef, fit] = useFitSquare(cols, rows, fluid)

  const layers = (
    <>
      <VisualLayer
        gameState={gameState}
        highlights={highlights}
        skin={skin}
        width={width}
        height={height}
        cellSize={CELL}
        lastMoveAnim={lastMoveAnim}
        meteorStrikeAnim={meteorStrikeAnim}
        mineStrikeAnim={mineStrikeAnim}
        premove={premove}
        isMyTurn={isMyTurn}
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
    </>
  )

  // Read-only hooks for the automated UI tester (tools/ui-e2e): the board's
  // interaction state, so it can click a piece and then one of the squares
  // the UI itself offers — exactly what a player sees highlighted.
  const testAttrs = {
    'data-testid': 'board',
    'data-mode': boardMode.type,
    'data-selected': highlights.selected ?? '',
    'data-targets': (highlights.targets ?? []).join(' '),
    'data-card-targets': (highlights.cardTargets ?? []).join(' '),
  }

  // Fluid mode is deliberately a completely separate, much flatter
  // structure from the fixed-pixel one below — not a shared tree with
  // fluid-only style overrides sprinkled in. That's what broke last time:
  // an aspect-ratio box nested inside a shrink-to-fit row-then-column flex
  // chain (frame-inner > board-col) has no reliable width to resolve
  // against, and collapsed to a sliver. This mirrors the placement
  // screen's board instead (.pl-board-wrap/.pl-board) — a single
  // centering flex box directly holding one aspect-ratio square, no
  // intermediate layers — which is the one pattern already proven to
  // size correctly. Rank/file coordinates are absolutely-positioned
  // overlays instead of separate flex-matched <ol> lists, so they can
  // never again feed back into the board's own sizing.
  if (fluid) {
    return (
      <div className="board-scene-wrap fluid" ref={sceneRef} {...testAttrs}>
        <div
          className={`board-root fluid${isCardMode ? ' card-mode' : ''}${hasOutsideCells ? ' has-outside-cells' : ''}`}
          style={fit
            ? { width: fit.w, height: fit.h, ...cardModeStyle }
            : { aspectRatio: `${cols} / ${rows}`, ...cardModeStyle }}
        >
          <div className="board-fluid-surface">{layers}</div>
          <div className="coords-overlay-ranks">
            {ranks.map(r => <span key={r}>{r}</span>)}
          </div>
          <div className="coords-overlay-files">
            {files.map(f => <span key={f}>{f}</span>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="board-scene-wrap" {...testAttrs}>
      <div className="board-frame">
        <div className="frame-inner">
          <ol className="coords-ranks" style={{ height }}>
            {ranks.map(r => <li key={r}>{r}</li>)}
          </ol>

          <div className="board-col">
            <div
              className={`board-root${isCardMode ? ' card-mode' : ''}`}
              style={{ width, height, ...cardModeStyle }}
            >
              {layers}
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
