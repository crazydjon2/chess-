import './OpponentHand.css'

// Cards have been public information since the moment they're drafted
// (see DraftPhase.jsx — both sides watch each other's army form live), so
// there's nothing to hide here any more — same glyph-badge-plus-hover-
// tooltip treatment as the placement screen's opponent tray (see
// PlacementPhase.jsx's .pl-tray-cardbadge). `isActive` layers a click
// affordance on top for sandbox mode, where the "opponent" is really just
// the other side you're also controlling; for a real online opponent it's
// always false, so the row is purely a glance at what they're holding.
export default function OpponentHand({ cards, isActive, selectedCardId, onCardClick }) {
  if (!cards) return null
  if (cards.length === 0) return <span className="opp-hand-empty">—</span>

  return (
    <div className="opp-hand-row">
      {cards.map((card, i) => (
        <button
          key={`${card.id}-${i}`}
          className={`opp-hand-badge${selectedCardId === card.id ? ' selected' : ''}`}
          style={{ background: card.accent }}
          title={card.name}
          disabled={!isActive}
          onClick={() => onCardClick?.(card)}
        >
          {card.glyph}
        </button>
      ))}
    </div>
  )
}
