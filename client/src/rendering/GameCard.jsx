import CardHelp from './CardHelp'
import './GameCard.css'

// The one Balatro-style card used everywhere a piece or a spell is shown
// as a card — draft shop (pieces + spells), placement rail (pieces), and
// the battle hand (spells). See client/design/Chess Plus UI Kit.
//
// Layout rules that never change across contexts:
//   • cost badge is ALWAYS top-RIGHT (when a cost is shown)
//   • the "?" description button is ALWAYS top-LEFT (opposite the cost),
//     so the two never fight for the same corner
//
//   variant  'piece' → checkered art with the piece SVG
//            'spell' → solid accent-colour art with the spell glyph
//   cost     shown as the gold top-right badge; omit for no cost (placement
//            pieces / battle-hand cards are already paid for)
//   desc     present → renders the top-left "?" help (spells only)
//   status   optional line under the name ("нет места" / "нет монет")
export default function GameCard({
  variant = 'spell',
  accent,
  icon,
  name,
  cost,
  desc,
  status,
  statusTone = 'neutral',
  selected = false,
  disabled = false,
  onClick,
  style,
}) {
  const clickable = !!onClick && !disabled
  return (
    <div
      className={`gc-card gc-${variant}${selected ? ' gc-selected' : ''}${disabled ? ' gc-disabled' : ''}`}
      style={style}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
    >
      {cost != null && <span className="gc-cost">{cost}</span>}
      {desc && <CardHelp name={name} desc={desc} className="gc-help" />}

      <span
        className="gc-art"
        style={variant === 'spell' && accent ? { background: accent } : undefined}
      >
        <span className="gc-art-sheen" />
        <span className="gc-art-inner">{icon}</span>
      </span>

      <span className="gc-plate">
        <span className="gc-plate-name">{name}</span>
        {status && <span className={`gc-status ${statusTone}`}>{status}</span>}
      </span>
    </div>
  )
}
