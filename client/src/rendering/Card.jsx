import GameCard from './GameCard'

// A spell card in your battle hand — the shared Balatro card (see
// GameCard.jsx). No cost badge: a card already in hand is paid for; only
// the "?" description (top-left) matters mid-battle.
export default function Card({ card, selected, disabled, onClick }) {
  return (
    <GameCard
      variant="spell"
      accent={card.accent}
      icon={card.glyph}
      name={card.name}
      desc={card.desc}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
    />
  )
}
