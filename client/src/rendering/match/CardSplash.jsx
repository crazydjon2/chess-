// The "card played" splash over the board: the card flies in with rays,
// holds a moment, then fades (≈1.9s, see .cs-* in match.css). Shown for the
// opponent's cards (and your own, smaller beat) — the card itself is never
// secret, only where it was aimed may be.
import { CardIcon, Piece } from '../../skins/Piece'
import { CARD_DEFS } from '../../game/cards'

export default function CardSplash({ cardId, color }) {
  return (
    <div className="cs-splash" aria-live="polite">
      <span className="cs-rays" />
      <span className="cs-ring" />
      <div className="cs-card">
        <span className="cs-who"><span className={`ui-avatar md ${color}`}><Piece type="king" color={color} size={24} center thin /></span></span>
        <CardIcon id={cardId} size={160} radius={12} iconScale={0.42} />
        <span className="cs-card-name">{CARD_DEFS[cardId]?.name}</span>
      </div>
    </div>
  )
}
