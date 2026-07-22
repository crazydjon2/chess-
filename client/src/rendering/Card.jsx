import CardHelp from './CardHelp'
import './Card.css'

// The card face itself only shows glyph/name — the full rules text lives
// behind the "?" button's tooltip instead of being crammed onto the card
// at ~7px font. No cost badge here — that only ever mattered during the
// draft purchase decision; a card already sitting in your hand mid-battle
// is already paid for, showing a price on it was just confusing leftover
// info nobody asked for.
export default function Card({ card, selected, disabled, onClick }) {
  return (
    <div
      className={`card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      style={{ '--accent': card.accent }}
      onClick={disabled ? undefined : onClick}
    >
      <CardHelp name={card.name} desc={card.desc} />
      <span className="card-icon">{card.glyph}</span>
      <span className="card-name">{card.name}</span>
    </div>
  )
}
