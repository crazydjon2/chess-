// Draft-mode board patterns: 3 rounds, escalating size, 3 layout variants
// each (chosen at random per match so the same round number doesn't always
// play out on the same map). Obstacles are confined to the middle ranks —
// never touching either side's home ranks — so placement always has a
// clean, fully-open 2-rank zone to work with regardless of which pattern
// gets picked.

export const BOARD_PATTERNS = {
  // 6x6 — home ranks 1-2 (white) / 5-6 (black), middle band = ranks 3-4
  1: [
    { name: 'Открытое поле', rows: 6, cols: 6, blockedCells: [] },
    { name: 'Стена по центру', rows: 6, cols: 6, blockedCells: ['c3', 'd3', 'c4', 'd4'] },
    { name: 'Фланговые щели', rows: 6, cols: 6, blockedCells: ['a3', 'a4', 'f3', 'f4'] },
  ],

  // 7x7 — home ranks 1-2 / 6-7, middle band = ranks 3-5
  2: [
    { name: 'Открытое поле', rows: 7, cols: 7, blockedCells: [] },
    {
      name: 'Кольцо',
      rows: 7, cols: 7,
      blockedCells: ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'],
    },
    {
      // Full-width X spanning b..f (not c..e) so it doesn't collapse onto
      // Кольцо's own corner cells — a distinct shape, not just its shrunk
      // center. Still point-symmetric about d4: b3<->f5, f3<->b5, d4 self.
      name: 'Диагонали',
      rows: 7, cols: 7,
      blockedCells: ['b3', 'f3', 'd4', 'b5', 'f5'],
    },
  ],

  // 8x8 — home ranks 1-2 / 7-8, middle band = ranks 3-6
  3: [
    { name: 'Классика', rows: 8, cols: 8, blockedCells: [] },
    {
      // Point-symmetric about the board centre: the wall gap (d/e) sits on
      // both rank 4 and its mirror rank 5, so neither color's approach
      // through the middle band is easier than the other's.
      name: 'Остров',
      rows: 8, cols: 8,
      blockedCells: ['a4', 'b4', 'c4', 'f4', 'g4', 'h4', 'a5', 'b5', 'c5', 'f5', 'g5', 'h5'],
    },
    {
      // Point-symmetric (180° rotation about the board's centre) so neither
      // color has an easier approach through the maze — each blocked cell
      // in the upper half (ranks 3-4) has a mirrored twin in the lower half
      // (ranks 5-6): b3<->g6, e3<->d6, g3<->b6, c4<->f5, f4<->c5.
      name: 'Лабиринт',
      rows: 8, cols: 8,
      blockedCells: ['b3', 'e3', 'g3', 'c4', 'f4', 'c5', 'f5', 'b6', 'd6', 'g6'],
    },
  ],
}

export function pickBoardPattern(round) {
  const patterns = BOARD_PATTERNS[round]
  return patterns[Math.floor(Math.random() * patterns.length)]
}

// Home ranks (placement-eligible rows) for a color on a given board size.
export function homeRanks(rows, color) {
  return color === 'white' ? [1, 2] : [rows - 1, rows]
}
