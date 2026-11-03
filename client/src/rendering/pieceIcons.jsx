// "Balatro style" piece icons from the UI Kit (client/design/Chess Plus UI
// Kit.dc.html) — chunky outlined silhouettes, drawn once per type per color
// and reused everywhere a piece icon appears (draft catalog/roster,
// placement tray/board). Unlike cards (open-ended, each with its own
// `glyph`), the piece set is fixed at exactly 6 types × 2 colors.
export const PIECE_ICONS = {
  white: {
    pawn: (
      <svg viewBox="0 0 58 68">
        <rect x="12" y="50" width="34" height="13" rx="6" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" />
        <path d="M20 50C16 43 16 35 21 30C17 25 17 19 23 15L35 15C41 19 41 25 37 30C42 35 42 43 38 50Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="29" cy="18" r="12" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" />
      </svg>
    ),
    knight: (
      // viewBox starts at -4 (not 0) — the mane detail in the second path
      // below reaches a couple units past x=0 after the group's transform,
      // and a plain "0 0 66 82" box was silently clipping a sliver off the
      // knight's face at anything above icon-badge size.
      <svg viewBox="-4 0 70 82">
        <rect x="12" y="64" width="36" height="13" rx="5" fill="#fdf6e8" stroke="#241708" strokeWidth="4" />
        <g transform="translate(-11.35,3.1) scale(1.56)" fill="#fdf6e8" stroke="#241708" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          <circle cx="9.5" cy="25.5" r="0.6" fill="#241708" stroke="none" />
          <ellipse cx="14.9" cy="15.7" rx="0.5" ry="1.5" transform="rotate(30 14.9 15.7)" fill="#241708" stroke="none" />
        </g>
      </svg>
    ),
    bishop: (
      <svg viewBox="0 0 60 82">
        <rect x="12" y="64" width="36" height="13" rx="5" fill="#fdf6e8" stroke="#241708" strokeWidth="4" />
        <path d="M30 12C44 22 44 40 34 50C40 54 42 60 40 64H20C18 60 20 54 26 50C16 40 16 22 30 12Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="30" cy="10" r="6" fill="#fdf6e8" stroke="#241708" strokeWidth="3.5" />
        <line x1="20" y1="34" x2="40" y2="34" stroke="#241708" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
    rook: (
      <svg viewBox="0 0 60 82">
        <rect x="10" y="64" width="40" height="13" rx="6" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" />
        <path d="M16 64L18 40H42L44 64Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M15 40L13 20H47L45 40Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M11 20V9H16V13H23V9H37V13H44V9H49V20Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
      </svg>
    ),
    queen: (
      <svg viewBox="0 0 68 92">
        <rect x="12" y="74" width="44" height="13" rx="5" fill="#fdf6e8" stroke="#241708" strokeWidth="4" />
        <path d="M16 74L12 42L24 54L34 30L44 54L56 42L52 74Z" fill="#fdf6e8" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="12" cy="36" r="6" fill="#fdf6e8" stroke="#241708" strokeWidth="3.5" />
        <circle cx="34" cy="24" r="7" fill="#fdf6e8" stroke="#241708" strokeWidth="3.5" />
        <circle cx="56" cy="36" r="6" fill="#fdf6e8" stroke="#241708" strokeWidth="3.5" />
      </svg>
    ),
    king: kingIcon('#fdf6e8'),
  },
  black: {
    pawn: (
      <svg viewBox="0 0 58 68">
        <rect x="12" y="50" width="34" height="13" rx="6" fill="#33302c" stroke="#241708" strokeWidth="4.5" />
        <path d="M20 50C16 43 16 35 21 30C17 25 17 19 23 15L35 15C41 19 41 25 37 30C42 35 42 43 38 50Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="29" cy="18" r="12" fill="#33302c" stroke="#241708" strokeWidth="4.5" />
        <path d="M23 12C24 9 27 7 29 7" stroke="#5c574f" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>
    ),
    knight: (
      <svg viewBox="-4 0 70 82">
        <rect x="12" y="64" width="36" height="13" rx="5" fill="#33302c" stroke="#241708" strokeWidth="4" />
        <g transform="translate(-11.35,3.1) scale(1.56)" fill="#33302c" stroke="#241708" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          <circle cx="9.5" cy="25.5" r="0.6" fill="#fdf6e8" stroke="none" />
          <ellipse cx="14.9" cy="15.7" rx="0.5" ry="1.5" transform="rotate(30 14.9 15.7)" fill="#fdf6e8" stroke="none" />
        </g>
      </svg>
    ),
    bishop: (
      <svg viewBox="0 0 60 82">
        <rect x="12" y="64" width="36" height="13" rx="5" fill="#33302c" stroke="#241708" strokeWidth="4" />
        <path d="M30 12C44 22 44 40 34 50C40 54 42 60 40 64H20C18 60 20 54 26 50C16 40 16 22 30 12Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="30" cy="10" r="6" fill="#33302c" stroke="#241708" strokeWidth="3.5" />
        <line x1="20" y1="34" x2="40" y2="34" stroke="#241708" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
    rook: (
      <svg viewBox="0 0 60 82">
        <rect x="10" y="64" width="40" height="13" rx="6" fill="#33302c" stroke="#241708" strokeWidth="4.5" />
        <path d="M16 64L18 40H42L44 64Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M15 40L13 20H47L45 40Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M11 20V9H16V13H23V9H37V13H44V9H49V20Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
      </svg>
    ),
    queen: (
      <svg viewBox="0 0 68 92">
        <rect x="12" y="74" width="44" height="13" rx="5" fill="#33302c" stroke="#241708" strokeWidth="4" />
        <path d="M16 74L12 42L24 54L34 30L44 54L56 42L52 74Z" fill="#33302c" stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
        <circle cx="12" cy="36" r="6" fill="#33302c" stroke="#241708" strokeWidth="3.5" />
        <circle cx="34" cy="24" r="7" fill="#33302c" stroke="#241708" strokeWidth="3.5" />
        <circle cx="56" cy="36" r="6" fill="#33302c" stroke="#241708" strokeWidth="3.5" />
      </svg>
    ),
    king: kingIcon('#33302c'),
  },
}

function kingIcon(fill) {
  return (
    <svg viewBox="0 0 68 100">
      <path d="M30 6H38V11H44V19H38V27H30V19H24V11H30Z" fill={fill} stroke="#241708" strokeWidth="4" strokeLinejoin="round" />
      <path d="M20 44C18 32 25 25 34 25C43 25 50 32 48 44Z" fill={fill} stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M18 82C17 70 20 60 24 51H44C48 60 51 70 50 82Z" fill={fill} stroke="#241708" strokeWidth="4.5" strokeLinejoin="round" />
      <rect x="16" y="42" width="36" height="10" rx="5" fill={fill} stroke="#241708" strokeWidth="4" />
      <rect x="12" y="82" width="44" height="13" rx="5" fill={fill} stroke="#241708" strokeWidth="4" />
    </svg>
  )
}
