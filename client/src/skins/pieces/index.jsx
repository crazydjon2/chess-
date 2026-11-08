// Piece skin registry. A skin turns { type, color } into artwork that fills
// a square box — the same art is used on the board, in the recruit picker,
// the promotion picker, captures, the journal and the menus. The board
// never knows what a skin draws: it only sizes and positions the box.
//
// Adding a (bought) skin = one more entry here:
//   { id, render: ({ type, color }) => ReactNode, scale }
// `scale` is how much of the cell the art takes on the board (0..1).
// Types: king queen rook bishop knight pawn, plus 'barricade' (neutral).
import { PIECE_ICONS } from './classicIcons'
import './pieces.css'

// Filled chess glyphs for both colors — the color comes from CSS (fill +
// outline tokens), so white and black share one shape. U+FE0E forces text
// (not emoji) presentation, otherwise some systems draw ♟ as an emoji.
const GLYPHS = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
const TEXT = '︎'

function BarricadeArt() {
  return (
    <svg viewBox="0 0 48 48" className="pz-svg" aria-hidden="true">
      <path d="M6 14 H42 V26 H6 Z M12 26 H17 V42 H12 Z M31 26 H36 V42 H31 Z" fill="var(--c-ok)" stroke="var(--piece-black-line)" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  )
}

export const PIECE_SKINS = {
  glyph: {
    id: 'glyph',
    scale: 0.8,
    render: ({ type, color }) => type === 'barricade'
      ? <BarricadeArt />
      : <span className={`pz-glyph ${color}`}>{(GLYPHS[type] ?? '?') + TEXT}</span>,
  },
  classic: {
    id: 'classic',
    scale: 0.78,
    render: ({ type, color }) => type === 'barricade'
      ? <BarricadeArt />
      : (PIECE_ICONS[color]?.[type] ?? null),
  },
}

export const DEFAULT_PIECE_SKIN = 'glyph'

export function getPieceSkin(id) {
  return PIECE_SKINS[id] ?? PIECE_SKINS[DEFAULT_PIECE_SKIN]
}
