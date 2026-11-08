// The two skin-aware visuals everything else uses.
import { useSkins } from './SkinContext'
import { getPieceSkin } from './pieces/index.jsx'
import { getCardArt } from './cards/index.jsx'

// <Piece type color size /> — skin art in a square box of `size` px (or
// sized by the parent via className when size is omitted).
export function Piece({ type, color, size, className = '', center = false, thin = false, style, skin }) {
  const { pieceSkin } = useSkins()
  const s = getPieceSkin(skin ?? pieceSkin)
  const box = size != null ? { width: size, height: size, ...style } : style
  return (
    <span className={`pz pz-${color}${center ? ' center' : ''}${thin ? ' thin' : ''} ${className}`} style={box} data-skin={s.id} aria-hidden="true">
      {s.render({ type, color })}
    </span>
  )
}

export function usePieceScale() {
  const { pieceSkin } = useSkins()
  return getPieceSkin(pieceSkin).scale
}

// <CardIcon id size /> — the card's colored square with its icon.
// `plain` drops the square (just the line icon, e.g. on top of a colored row).
export function CardIcon({ id, size = 46, radius, plain = false, className = '', iconScale = 0.6 }) {
  const { cardSkin } = useSkins()
  const { color, Icon } = getCardArt(id, cardSkin)
  const icon = (
    <svg width={size * iconScale} height={size * iconScale} viewBox="0 0 48 48" aria-hidden="true">
      <Icon />
    </svg>
  )
  if (plain) return icon
  return (
    <span
      className={`card-icon ${className}`}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.24), backgroundColor: color }}
    >
      {icon}
    </span>
  )
}

export function useCardColor(id) {
  const { cardSkin } = useSkins()
  return getCardArt(id, cardSkin).color
}
