// Battle board controller: chess rules + board mode (select / card aim /
// drag / premove) on top of the presentational BoardView.
import { useCallback } from 'react'
import BoardView from './board/BoardView'
import { getHighlights } from '../game/highlights'
import { getLegalMoves, getFogCaptureSquares, isKingInCheck } from '../game/chess'
import { play } from '../sound'

function findKingSquare(pieces, color) {
  return Object.keys(pieces).find(sq => pieces[sq].color === color && pieces[sq].type === 'king') ?? null
}

function lastMoveOf(gameState) {
  const log = gameState.actionLog ?? []
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]
    if (e.kind === 'move') return e.hidden ? null : e
    if (e.kind === 'card') continue
  }
  return null
}

export default function Board({
  gameState, playerColor = 'white', onMove, onPlayCard, boardMode, dispatch,
  lastMoveAnim, meteorStrikeAnim, mineStrikeAnim, flipped = false,
  isMyTurn = true, premove = null, onSetPremove, onClearPremove,
}) {
  const { rows, cols } = gameState.board.size
  const { pieces } = gameState
  const hl = getHighlights(boardMode)

  const legalFor = useCallback((square) => {
    const piece = gameState.pieces[square]
    return piece && piece.color === playerColor
      ? [...getLegalMoves(gameState, square), ...getFogCaptureSquares(gameState, square)]
      : []
  }, [gameState, playerColor])

  const handleSquareClick = useCallback((square) => {
    const piece = gameState.pieces[square]
    if (!isMyTurn && premove && square === premove.from) onClearPremove?.()

    if (boardMode.type === 'piece_selected' && square !== boardMode.square && boardMode.legalMoves.includes(square)) {
      if (isMyTurn) onMove?.({ from: boardMode.square, to: square })
      else onSetPremove?.({ from: boardMode.square, to: square })
      dispatch({ type: 'CANCEL' })
      return
    }
    if (boardMode.type === 'card_targeting') {
      if (boardMode.validTargets.includes(square)) onPlayCard?.({ card: boardMode.card, target: square })
      dispatch({ type: 'CANCEL' })
      return
    }
    if (piece && piece.color === playerColor) play('select')
    dispatch({ type: 'CLICK_SQUARE', square, piece, playerColor, legalMoves: legalFor(square) })
  }, [boardMode, gameState, playerColor, onMove, onPlayCard, dispatch, isMyTurn, premove, onSetPremove, onClearPremove, legalFor])

  const canDrag = useCallback(sq => !!onMove && pieces[sq]?.color === playerColor && boardMode.type !== 'card_targeting', [pieces, playerColor, onMove, boardMode.type])
  const handleDragStart = useCallback((square) => {
    play('select')
    dispatch({ type: 'DRAG_START', square, piece: gameState.pieces[square], playerColor, legalMoves: legalFor(square) })
  }, [gameState, playerColor, dispatch, legalFor])
  const handleDragOver = useCallback(square => dispatch({ type: 'DRAG_OVER', square }), [dispatch])
  const handleDrop = useCallback((from, to) => {
    const legal = legalFor(from)
    if (legal.includes(to)) {
      if (isMyTurn) onMove?.({ from, to })
      else onSetPremove?.({ from, to })
    }
    dispatch({ type: 'DROP', square: to })
  }, [legalFor, isMyTurn, onMove, onSetPremove, dispatch])

  // Highlights
  const highlights = []
  const last = lastMoveOf(gameState)
  if (last) highlights.push({ square: last.from, kind: 'last' }, { square: last.to, kind: 'last' })
  if (isKingInCheck(gameState, gameState.turn)) {
    const k = findKingSquare(pieces, gameState.turn)
    if (k) highlights.push({ square: k, kind: 'check' })
  }
  const inRect = sq => {
    const r = parseInt(sq.slice(1), 10), c = sq.charCodeAt(0) - 97
    return r >= 1 && r <= rows && c >= 0 && c < cols
  }
  const extraCells = gameState.board.extraCells ?? []
  ;(hl.targets ?? []).forEach(sq => {
    const target = pieces[sq]
    const kind = !isMyTurn ? 'premove' : target && target.color !== playerColor ? 'capture' : 'move'
    highlights.push({ square: sq, kind })
  })
  const cardTargets = hl.cardTargets ?? []
  cardTargets.forEach(sq => { if (inRect(sq) || extraCells.includes(sq)) highlights.push({ square: sq, kind: 'card' }) })
  const borderTargets = cardTargets.filter(sq => !inRect(sq))

  const outlines = []
  if (premove) outlines.push({ square: premove.from, kind: 'premove' }, { square: premove.to, kind: 'premove' })

  const testAttrs = {
    'data-testid': 'board',
    'data-mode': boardMode.type,
    'data-selected': hl.selected ?? '',
    'data-targets': (hl.targets ?? []).join(' '),
    'data-card-targets': cardTargets.join(' '),
  }

  return (
    <BoardView
      rows={rows}
      cols={cols}
      blockedCells={gameState.board.blockedCells}
      extraCells={extraCells}
      pieces={pieces}
      flipped={flipped}
      highlights={highlights}
      selected={hl.selected ?? (boardMode.type === 'dragging' ? boardMode.fromSquare : null)}
      outlines={outlines}
      liftSquare={hl.selected}
      hideSquare={boardMode.type === 'dragging' ? boardMode.fromSquare : null}
      borderTargets={borderTargets}
      fogZones={gameState.fogZones ?? []}
      meteors={gameState.meteors ?? []}
      mines={gameState.mines ?? []}
      lastMoveAnim={lastMoveAnim}
      meteorStrikeAnim={meteorStrikeAnim}
      mineStrikeAnim={mineStrikeAnim}
      interactive={!!onMove || !!onPlayCard}
      canDrag={canDrag}
      onSquareClick={handleSquareClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragCancel={() => dispatch({ type: 'CANCEL' })}
      testAttrs={testAttrs}
    />
  )
}
