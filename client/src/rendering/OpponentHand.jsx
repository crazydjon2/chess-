import { useState } from 'react'
import './OpponentHand.css'

// Compact HUD chip embedded in the opponent's PlayerPanel.
// Chips only show accent color (identity hidden, matching how a real
// remote opponent's hand would render once multiplayer exists).
// Click to inspect full card info; click a row to play it on your turn.
export default function OpponentHand({ cards, isActive, selectedCardId, onCardClick }) {
  const [open, setOpen] = useState(false)
  if (!cards) return null

  function handleRowClick(card) {
    if (!isActive) return
    onCardClick?.(card)
    setOpen(false)
  }

  return (
    <div className="opp-hand-hud">
      <button
        className={`opp-hand-trigger${open ? ' open' : ''}${cards.length === 0 ? ' empty' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Карты соперника"
      >
        {cards.length === 0
          ? <span className="opp-hand-dash">—</span>
          : cards.map((card, i) => (
              <span key={`${card.id}-${i}`}
                className={`opp-card-chip${selectedCardId === card.id ? ' chip-selected' : ''}`}
                style={{ '--accent': card.accent }} />
            ))}
      </button>

      {open && (
        <>
          <div className="opp-hand-backdrop" onClick={() => setOpen(false)} />
          <div className="opp-hand-popover">
            <div className="opp-hand-popover-title">Карты соперника</div>
            {cards.length === 0 ? (
              <div className="opp-hand-popover-empty">Рука пуста</div>
            ) : (
              cards.map((card, i) => (
                <div
                  key={`${card.id}-${i}`}
                  className={`opp-hand-popover-row${isActive ? ' playable' : ''}${selectedCardId === card.id ? ' selected' : ''}`}
                  style={{ '--accent': card.accent }}
                  onClick={() => handleRowClick(card)}
                >
                  <span className="opp-hand-popover-glyph">{card.glyph}</span>
                  <div className="opp-hand-popover-info">
                    <span className="opp-hand-popover-name">{card.name}</span>
                    <span className="opp-hand-popover-desc">{card.desc.replace(/\n/g, ' ')}</span>
                  </div>
                </div>
              ))
            )}
            {!isActive && cards.length > 0 && (
              <div className="opp-hand-popover-hint">Доступно на ходу соперника</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
