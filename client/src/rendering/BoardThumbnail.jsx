import './BoardThumbnail.css'

// Exact miniature of a board pattern — shape + blocked cells precisely, so
// it reads as a real preview rather than just a name/dimensions label.
// Shared by the draft screen (previewing the round's actual board) and the
// How To Play reference (browsing every pattern that can come up).
export default function BoardThumbnail({ boardPattern, cellSize = 8 }) {
  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  const ranks = Array.from({ length: rows }, (_, i) => rows - i)
  const files = Array.from({ length: cols }, (_, i) => i)
  return (
    <div
      className="board-thumb"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: cols * cellSize,
        height: rows * cellSize,
      }}
      title={`${boardPattern.name} · ${rows}×${cols}`}
    >
      {ranks.map(rank => files.map(col => {
        const sq = `${String.fromCharCode(97 + col)}${rank}`
        const dark = (rank + col) % 2 === 1
        const isBlocked = blocked.has(sq)
        return (
          <span key={sq} className={`board-thumb-cell${dark ? ' dark' : ''}${isBlocked ? ' blocked' : ''}`} />
        )
      }))}
    </div>
  )
}
