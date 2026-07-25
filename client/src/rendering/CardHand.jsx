import Card from './Card'
import './CardHand.css'

// Vertical rail beside the board (see GameView.jsx's .bt-main) — always
// mounted at a fixed width whether or not there are any cards, so an empty
// hand doesn't shift the board over.
export default function CardHand({ cards, isActive, selectedCardId, onCardClick }) {
  return (
    <div className={`card-hand${isActive ? ' active' : ''}`}>
      {cards?.map((card, i) => (
        <Card
          key={`${card.id}-${i}`}
          card={card}
          selected={selectedCardId === card.id}
          disabled={!isActive}
          onClick={() => onCardClick(card)}
        />
      ))}
    </div>
  )
}
