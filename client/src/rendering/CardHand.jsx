import Card from './Card'
import './CardHand.css'

export default function CardHand({ cards, isActive, selectedCardId, onCardClick }) {
  if (!cards || cards.length === 0) {
    return <div className="card-hand empty" />
  }

  const count    = cards.length
  const maxAngle = Math.min((count - 1) * 3.5, 10.5)

  return (
    <div className={`card-hand${isActive ? ' active' : ''}`}>
      {cards.map((card, i) => {
        const t     = count > 1 ? i / (count - 1) : 0.5
        const angle = count > 1 ? -maxAngle + maxAngle * 2 * t : 0
        const yOff  = Math.abs(angle) * 0.85
        const isSelected = selectedCardId === card.id

        return (
          <div
            key={`${card.id}-${i}`}
            className={`card-wrap${isSelected ? ' raised' : ''}`}
            style={{
              transform: `rotate(${angle}deg) translateY(${yOff}px)`,
              zIndex: isSelected ? 20 : i + 1,
            }}
          >
            <Card
              card={card}
              selected={isSelected}
              disabled={!isActive}
              onClick={() => onCardClick(card)}
            />
          </div>
        )
      })}
    </div>
  )
}
