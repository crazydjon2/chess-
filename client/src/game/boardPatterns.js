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
    {
      // Point-symmetric about the board centre (b3<->e4, b4<->e3) — two
      // solid 1x2 pillars flanking the center, leaving three lanes: the
      // outer edges (a, f) and the center gap (c, d) between the pillars.
      name: 'Колонны',
      rows: 6, cols: 6,
      blockedCells: ['b3', 'b4', 'e3', 'e4'],
    },
    {
      // Point-symmetric (a3<->f4, b3<->e4, e3<->b4, f3<->a4) — the inverse
      // of Стена по центру: flanks are sealed and only the middle c/d
      // columns stay open, forcing traffic through one narrow gate instead
      // of around a center block.
      name: 'Горлышко',
      rows: 6, cols: 6,
      blockedCells: ['a3', 'b3', 'e3', 'f3', 'a4', 'b4', 'e4', 'f4'],
    },
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
    {
      // Point-symmetric about d4 (self-centered, arms mirror in pairs:
      // d3<->d5, c4<->e4) — a plus-shaped pillar in the dead center, leaving
      // the entire rest of the band open. Sparsest of the round-2 patterns.
      name: 'Крест',
      rows: 7, cols: 7,
      blockedCells: ['d3', 'd5', 'c4', 'd4', 'e4'],
    },
    {
      // Point-symmetric about d4 (b3<->f5, c3<->e5, b4<->f4, c4<->e4) — two
      // solid 2x2 bastions in opposite corners of the band, leaving the
      // center column and the other two corners wide open.
      name: 'Бастионы',
      rows: 7, cols: 7,
      blockedCells: ['b3', 'c3', 'b4', 'c4', 'e4', 'f4', 'e5', 'f5'],
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
      // Point-symmetric about the board centre (each column is fully
      // blocked or fully open, so it mirrors itself) — the a and h files
      // are sealed across the whole middle band, forcing all traffic
      // through the wide b-g corridor instead of around the sides.
      name: 'Коридор',
      rows: 8, cols: 8,
      blockedCells: ['a3', 'a4', 'a5', 'a6', 'h3', 'h4', 'h5', 'h6'],
    },
    {
      // Point-symmetric about the board centre (c3<->f6, d3<->e6, c4<->f5,
      // f4<->c5, ...) — a hollow fortress ring with an open 2x2 room dead
      // center (d4/e4/d5/e5) and open corridors down both flanks, the
      // opposite shape to Остров's side-walls-with-open-middle.
      name: 'Крепость',
      rows: 8, cols: 8,
      blockedCells: ['c3', 'd3', 'e3', 'f3', 'c6', 'd6', 'e6', 'f6', 'c4', 'f4', 'c5', 'f5'],
    },
    {
      // Point-symmetric about the board centre (c3<->f6, f3<->c6) — four
      // single-cell towers in the band's far corners, the lightest-touch
      // pattern in round 3 (just 4 blocked cells out of 32).
      name: 'Четыре башни',
      rows: 8, cols: 8,
      blockedCells: ['c3', 'f3', 'c6', 'f6'],
    },
  ],
}

export function pickBoardPattern(round) {
  const patterns = BOARD_PATTERNS[round]
  return patterns[Math.floor(Math.random() * patterns.length)]
}

// Every pattern within a round shares the same board size (see comment up
// top), so home-rank capacity — 2 full open ranks × the board's width — is
// constant per round too, regardless of which of that round's variants
// actually gets picked. This is exactly the hard cap on how many pieces
// either side may draft that round (see draftEngine.js's submitPurchases):
// buying more than fit on the home ranks would leave hidden placement
// impossible to complete.
export const HOME_CAPACITY_BY_ROUND = Object.fromEntries(
  Object.entries(BOARD_PATTERNS).map(([round, patterns]) => [round, patterns[0].cols * 2])
)

// Home ranks (placement-eligible rows) for a color on a given board size.
export function homeRanks(rows, color) {
  return color === 'white' ? [1, 2] : [rows - 1, rows]
}
