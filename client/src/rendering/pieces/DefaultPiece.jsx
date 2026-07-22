import { cloneElement } from 'react'
import { PIECE_ICONS } from '../pieceIcons'

// Just a grounding drop-shadow now — the Balatro-style artwork (see
// pieceIcons.jsx) already carries its own thick dark outline for weight,
// so it doesn't need the old classic-piece set's fake brown extrusion on
// top of it, just enough shadow to read as sitting on the square rather
// than painted onto it.
export function DefaultPieceDefs() {
  return (
    <>
      {/* One feDropShadow primitive, not the manual 5-step
         blur/offset/flood/composite/merge chain it used to be — visually
         identical, but browsers have a dedicated fast path for
         feDropShadow, and this filter runs on EVERY piece on EVERY board
         repaint (each infinite overlay animation — check pulse, fog,
         mines — repaints the whole SVG every frame, filters included), so
         its per-pass cost is the board's baseline paint cost. */}
      <filter id="dp-3d" x="-20%" y="-25%" width="140%" height="150%">
        <feDropShadow dx="1" dy="3.5" stdDeviation="1.6" floodColor="#241708" floodOpacity="0.4" />
      </filter>

      {/* Same shadow plus a cyan ice glow outline (frozen) — the glow half
         keeps the morphology chain (no single-primitive equivalent), but
         frozen pieces are rare and few. */}
      <filter id="dp-3d-frozen" x="-28%" y="-32%" width="156%" height="164%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="ice-sil" />
        <feFlood floodColor="#48c4f0" floodOpacity="0.95" result="ice-color" />
        <feComposite in="ice-color" in2="ice-sil" operator="in" result="ice-sharp" />
        <feGaussianBlur in="ice-sharp" stdDeviation="2.8" result="ice-halo" />
        <feMerge>
          <feMergeNode in="ice-halo" />
          <feMergeNode in="ice-sharp" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
        <feDropShadow dx="1" dy="3.5" stdDeviation="1.6" floodColor="#241708" floodOpacity="0.4" />
      </filter>

      {/* Same shadow plus an orange HP glow outline. */}
      <filter id="dp-3d-hp" x="-28%" y="-32%" width="156%" height="164%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="hp-sil" />
        <feFlood floodColor="#e67e22" floodOpacity="0.92" result="hp-color" />
        <feComposite in="hp-color" in2="hp-sil" operator="in" result="hp-sharp" />
        <feGaussianBlur in="hp-sharp" stdDeviation="2" result="hp-halo" />
        <feMerge>
          <feMergeNode in="hp-halo" />
          <feMergeNode in="hp-sharp" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
        <feDropShadow dx="1" dy="3.5" stdDeviation="1.6" floodColor="#241708" floodOpacity="0.4" />
      </filter>
    </>
  )
}

// Barricade: neutral, immobile, capturable-by-anyone obstacle (see
// cardEffects.js) — not a real chess piece, so it skips the color-keyed
// PIECE_ICONS lookup and gets its own plain "wooden barrier" glyph instead.
function BarricadeIcon({ x, y, size, hp }) {
  const pad = size * 0.16
  const s   = size - pad * 2
  const filterId = hp > 1 ? 'dp-3d-hp' : 'dp-3d'
  return (
    <g filter={`url(#${filterId})`}>
      <rect x={x + pad} y={y + pad} width={s} height={s} rx={3}
        fill="#8a7658" stroke="#241708" strokeWidth={2} />
      <line x1={x + pad + 3} y1={y + pad + 3} x2={x + pad + s - 3} y2={y + pad + s - 3}
        stroke="#241708" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={x + pad + s - 3} y1={y + pad + 3} x2={x + pad + 3} y2={y + pad + s - 3}
        stroke="#241708" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  )
}

export default function DefaultPiece({ piece, x, y, size }) {
  if (piece.type === 'barricade') {
    return <BarricadeIcon x={x} y={y} size={size} hp={piece.hp} />
  }

  const icon = PIECE_ICONS[piece.color]?.[piece.type]
  if (!icon) return null

  const pad = size * 0.12
  const ix = x + pad
  const iy = y + pad
  const is = size - pad * 2

  const filterId = piece.frozen ? 'dp-3d-frozen' : piece.hp > 1 ? 'dp-3d-hp' : 'dp-3d'

  // Nested <svg> keeps each icon's own viewBox aspect ratio (they aren't
  // all square — a queen is much taller than a pawn) instead of stretching
  // it to fill a forced square box; default preserveAspectRatio centers it.
  return (
    <g filter={`url(#${filterId})`}>
      {cloneElement(icon, { x: ix, y: iy, width: is, height: is })}
    </g>
  )
}
