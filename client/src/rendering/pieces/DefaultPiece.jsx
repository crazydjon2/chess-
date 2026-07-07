import wK from '../../assets/wK.svg?react'
import wQ from '../../assets/wQ.svg?react'
import wR from '../../assets/wR.svg?react'
import wB from '../../assets/wB.svg?react'
import wN from '../../assets/wN.svg?react'
import wP from '../../assets/wP.svg?react'
import bK from '../../assets/bK.svg?react'
import bQ from '../../assets/bQ.svg?react'
import bR from '../../assets/bR.svg?react'
import bB from '../../assets/bB.svg?react'
import bN from '../../assets/bN.svg?react'
import bP from '../../assets/bP.svg?react'

const COMPONENTS = {
  white: { king: wK, queen: wQ, rook: wR, bishop: wB, knight: wN, pawn: wP },
  black: { king: bK, queen: bQ, rook: bR, bishop: bB, knight: bN, pawn: bP },
}

export function DefaultPieceDefs() {
  return (
    <>
      {/* Warm-brown 3D extrusion + forward shadow */}
      <filter id="dp-3d" x="-18%" y="-22%" width="140%" height="148%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.5" result="sil" />
        <feFlood floodColor="#7a3e18" floodOpacity="1" result="ext-fill" />
        <feComposite in="ext-fill" in2="sil" operator="in" result="ext" />

        <feOffset in="ext" dx="0.4" dy="1.5" result="e1" />
        <feOffset in="ext" dx="0.8" dy="3"   result="e2" />
        <feOffset in="ext" dx="1.2" dy="4.5" result="e3" />
        <feOffset in="ext" dx="1.6" dy="6"   result="e4" />

        <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur" />
        <feOffset in="blur" dx="1" dy="11" result="sh-off" />
        <feFlood floodColor="#000" floodOpacity="0.42" result="sh-fill" />
        <feComposite in="sh-fill" in2="sh-off" operator="in" result="shadow" />

        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="e4" />
          <feMergeNode in="e3" />
          <feMergeNode in="e2" />
          <feMergeNode in="e1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Same as dp-3d but adds a cyan ice glow outline (frozen) */}
      <filter id="dp-3d-frozen" x="-24%" y="-28%" width="152%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.5" result="sil" />
        <feFlood floodColor="#7a3e18" floodOpacity="1" result="ext-fill" />
        <feComposite in="ext-fill" in2="sil" operator="in" result="ext" />

        <feOffset in="ext" dx="0.4" dy="1.5" result="e1" />
        <feOffset in="ext" dx="0.8" dy="3"   result="e2" />
        <feOffset in="ext" dx="1.2" dy="4.5" result="e3" />
        <feOffset in="ext" dx="1.6" dy="6"   result="e4" />

        <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur" />
        <feOffset in="blur" dx="1" dy="11" result="sh-off" />
        <feFlood floodColor="#000" floodOpacity="0.42" result="sh-fill" />
        <feComposite in="sh-fill" in2="sh-off" operator="in" result="shadow" />

        <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="ice-sil" />
        <feFlood floodColor="#48c4f0" floodOpacity="0.95" result="ice-color" />
        <feComposite in="ice-color" in2="ice-sil" operator="in" result="ice-sharp" />
        <feGaussianBlur in="ice-sharp" stdDeviation="2.8" result="ice-halo" />

        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="e4" />
          <feMergeNode in="e3" />
          <feMergeNode in="e2" />
          <feMergeNode in="e1" />
          <feMergeNode in="ice-halo" />
          <feMergeNode in="ice-sharp" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Same as dp-3d but adds an orange HP glow outline */}
      <filter id="dp-3d-hp" x="-24%" y="-28%" width="152%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.5" result="sil" />
        <feFlood floodColor="#7a3e18" floodOpacity="1" result="ext-fill" />
        <feComposite in="ext-fill" in2="sil" operator="in" result="ext" />

        <feOffset in="ext" dx="0.4" dy="1.5" result="e1" />
        <feOffset in="ext" dx="0.8" dy="3"   result="e2" />
        <feOffset in="ext" dx="1.2" dy="4.5" result="e3" />
        <feOffset in="ext" dx="1.6" dy="6"   result="e4" />

        <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur" />
        <feOffset in="blur" dx="1" dy="11" result="sh-off" />
        <feFlood floodColor="#000" floodOpacity="0.42" result="sh-fill" />
        <feComposite in="sh-fill" in2="sh-off" operator="in" result="shadow" />

        {/* HP glow: dilated silhouette flooded orange, then blurred halo */}
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="hp-sil" />
        <feFlood floodColor="#e67e22" floodOpacity="0.92" result="hp-color" />
        <feComposite in="hp-color" in2="hp-sil" operator="in" result="hp-sharp" />
        <feGaussianBlur in="hp-sharp" stdDeviation="2" result="hp-halo" />

        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="e4" />
          <feMergeNode in="e3" />
          <feMergeNode in="e2" />
          <feMergeNode in="e1" />
          <feMergeNode in="hp-halo" />
          <feMergeNode in="hp-sharp" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  )
}

// Barricade: neutral, immobile, capturable-by-anyone obstacle (see
// cardEffects.js) — not a real chess piece, so it skips the color-keyed
// COMPONENTS lookup and gets its own plain "wooden barrier" glyph instead.
function BarricadeIcon({ x, y, size, hp }) {
  const pad = size * 0.16
  const s   = size - pad * 2
  const filterId = hp > 1 ? 'dp-3d-hp' : 'dp-3d'
  return (
    <g filter={`url(#${filterId})`}>
      <rect x={x + pad} y={y + pad} width={s} height={s} rx={3}
        fill="#6b4a2c" stroke="#3d2a18" strokeWidth={2} />
      <line x1={x + pad + 3} y1={y + pad + 3} x2={x + pad + s - 3} y2={y + pad + s - 3}
        stroke="#3d2a18" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={x + pad + s - 3} y1={y + pad + 3} x2={x + pad + 3} y2={y + pad + s - 3}
        stroke="#3d2a18" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  )
}

export default function DefaultPiece({ piece, x, y, size }) {
  if (piece.type === 'barricade') {
    return <BarricadeIcon x={x} y={y} size={size} hp={piece.hp} />
  }

  const Piece = COMPONENTS[piece.color]?.[piece.type]
  if (!Piece) return null

  const pad     = size * 0.055
  const elevate = size * 0.10
  const ix = x + pad
  const iy = y + pad - elevate
  const is = size - pad * 2

  const filterId = piece.frozen ? 'dp-3d-frozen' : piece.hp > 1 ? 'dp-3d-hp' : 'dp-3d'

  return (
    <g filter={`url(#${filterId})`}>
      <Piece x={ix} y={iy} width={is} height={is} />
    </g>
  )
}
