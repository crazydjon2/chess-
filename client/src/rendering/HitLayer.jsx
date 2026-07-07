import { squareName, cellXY } from '../game/coords'

export default function HitLayer({ rows, cols, cellSize, pieces, borderTargets = [], flipped = false, onSquareClick, onDragStart, onDragOver, onDrop }) {
  const cells = []
  const at = (col, rank) => cellXY(col, rank, rows, cols, cellSize, flipped)

  // ── Main board ───────────────────────────────────────────────────
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const square   = squareName(row, col, rows)
      const rank     = rows - row
      const { x, y } = at(col, rank)
      const hasPiece = Boolean(pieces[square])

      cells.push(
        <rect
          key={square}
          x={x}
          y={y}
          width={cellSize}
          height={cellSize}
          fill="transparent"
          draggable={hasPiece}
          onClick={() => onSquareClick(square)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            onDragStart(square)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            onDragOver(square)
          }}
          onDrop={(e) => {
            e.preventDefault()
            onDrop(square)
          }}
          style={{ cursor: hasPiece ? 'grab' : 'default' }}
        />
      )
    }
  }

  // ── Extra cells + card border targets (outside rectangle) ────────
  borderTargets.forEach(square => {
    const rank = parseInt(square.slice(1))
    const col  = square.charCodeAt(0) - 97
    const { x, y } = at(col, rank)
    const hasPiece = Boolean(pieces[square])

    cells.push(
      <rect
        key={`border-hit-${square}`}
        x={x}
        y={y}
        width={cellSize}
        height={cellSize}
        fill="transparent"
        draggable={hasPiece}
        onClick={() => onSquareClick(square)}
        onDragStart={hasPiece ? (e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(square) } : undefined}
        onDragOver={(e) => { e.preventDefault(); onDragOver(square) }}
        onDrop={(e) => { e.preventDefault(); onDrop(square) }}
        style={{ cursor: hasPiece ? 'grab' : 'pointer' }}
      />
    )
  })

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        opacity: 0,
        pointerEvents: 'all',
        zIndex: 2,
      }}
    >
      {cells}
    </svg>
  )
}
