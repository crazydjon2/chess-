// Piece skin registry. A skin turns { type, color } into artwork that fills
// a square box — the same art is used on the board, in the recruit picker,
// the promotion picker, captures, the journal and the menus. The board
// never knows what a skin draws: it only sizes and positions the box.
//
// Adding a (bought) skin = one more entry here:
//   { id, render: ({ type, color }) => ReactNode, scale, anchor, top }
// `scale` is how much of the cell the art takes on the board (0..1);
// optional `typeScale` { king: 1.2 } enlarges single piece types.
// Raster skins: imageSkin(id, …) → public/skins/pieces/<id>/<color>-<type>.webp
// Types: king queen rook bishop knight pawn, plus 'barricade' (the neutral Stone).
import { BARRICADE_PIECE_SVG } from '../cards/defaultIcons'
import './pieces.css'

// Filled chess glyphs for both colors — the color comes from CSS (fill +
// outline tokens), so white and black share one shape. U+FE0E forces text
// (not emoji) presentation, otherwise some systems draw ♟ as an emoji.
const GLYPHS = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
const TEXT = '︎'

// The neutral Stone — same art for every piece skin (drawn with the card icons)
function BarricadeArt() {
  return (
    <svg viewBox="0 0 48 48" className="pz-svg pz-barricade" aria-hidden="true"
      style={{ '--card-c': 'color-mix(in srgb, var(--c-ok) 70%, #16141F)' }}
      dangerouslySetInnerHTML={{ __html: BARRICADE_PIECE_SVG }} />
  )
}

// Raster skin: a folder of pictures, one per piece and color, all in one
// frame with the piece's base on a shared ground line (for future skins).
// eslint-disable-next-line no-unused-vars
function imageSkin(id, { scale = 0.9, anchor = 0.14, top = 0.04, ext = 'webp' } = {}) {
  const src = (color, type) => `/skins/pieces/${id}/${color}-${type}.${ext}`
  return {
    id,
    scale, anchor, top,
    image: true,
    src,
    render: ({ type, color }) => type === 'barricade'
      ? <BarricadeArt />
      : <img className="pz-img" src={src(color, type)} alt="" draggable="false" decoding="async" />,
  }
}

export const PIECE_SKINS = {
  // BASE set everyone has
  glyph: {
    id: 'glyph',
    scale: 0.9, anchor: 0.16, top: 0.14,
    // the king glyph is drawn small in the font — size it up on the board
    typeScale: { king: 1.22, queen: 1.06, barricade: 1.12 },
    render: ({ type, color }) => type === 'barricade'
      ? <BarricadeArt />
      : <span className={`pz-glyph ${color}`} data-g={(GLYPHS[type] ?? '?') + TEXT}>{(GLYPHS[type] ?? '?') + TEXT}</span>,
  },
}

export const DEFAULT_PIECE_SKIN = 'glyph'

// Warm the browser cache for image skins so the first board doesn't pop in.
export function preloadPieceSkin(id) {
  const s = PIECE_SKINS[id]
  if (!s?.image || typeof Image === 'undefined') return
  for (const color of ['white', 'black'])
    for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
      const img = new Image(); img.src = s.src(color, type)
    }
}

export function getPieceSkin(id) {
  return PIECE_SKINS[id] ?? PIECE_SKINS[DEFAULT_PIECE_SKIN]
}
