export function fileChar(col) {
  return String.fromCharCode(97 + col)
}

export function squareName(row, col, rows) {
  return `${fileChar(col)}${rows - row}`
}

export function squareToColRow(square, rows) {
  const col = square.charCodeAt(0) - 97
  const rank = parseInt(square.slice(1), 10)
  const row = rows - rank
  return [col, row]
}

// Screen position of a cell for a given col/rank. When `flipped` (black's
// perspective in online play), this is a direct 180°-around-board-center
// coordinate reflection — not a CSS transform — so piece art, shadows and
// animation deltas all fall out correctly with zero special-casing.
export function cellXY(col, rank, rows, cols, cellSize, flipped = false) {
  return flipped
    ? { x: (cols - 1 - col) * cellSize, y: (rank - 1) * cellSize }
    : { x: col * cellSize, y: (rows - rank) * cellSize }
}
